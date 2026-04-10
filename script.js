let DOOR_SB_URL = localStorage.getItem('door_sb_url') || new URLSearchParams(window.location.search).get('url');
let DOOR_SB_KEY = localStorage.getItem('door_sb_key') || new URLSearchParams(window.location.search).get('key');

let sb; 
let currentUser = null;

if (DOOR_SB_URL && DOOR_SB_KEY) {
    localStorage.setItem('door_sb_url', DOOR_SB_URL);
    localStorage.setItem('door_sb_key', DOOR_SB_KEY);
    sb = supabase.createClient(DOOR_SB_URL, DOOR_SB_KEY);
}

const ui = {
    loginForm: document.getElementById('login-form'),
    loginScreen: document.getElementById('login-screen'),
    dashboard: document.getElementById('dashboard'),
    triggerBtn: document.getElementById('trigger-btn'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modal-body'),
    modalTitle: document.getElementById('modal-title'),
    closeModal: document.querySelector('.close-modal'),
    toastContainer: document.getElementById('toast-container'),
    adminBtn: document.getElementById('admin-btn'),
    confirmOverlay: document.getElementById('custom-confirm'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMsg: document.getElementById('confirm-msg'),
    confirmOk: document.getElementById('confirm-ok'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmIcon: document.getElementById('confirm-icon'),
    statusBadge: document.querySelector('.status-badge')
};

// --- GÜVENLİK: VERİTABANI VARLIK KONTROLÜ ---
async function checkUserStatus() {
    if (!currentUser || !sb) return false;
    const { data, error } = await sb.from('app_users').select('id').eq('id', currentUser.id).single();
    if (error || !data) {
        localStorage.removeItem('door_shelly_user');
        showToast("Erişim Reddedildi!", "error");
        setTimeout(() => location.reload(), 1000);
        return false;
    }
    return true;
}

// --- CİHAZ CANLI DURUM KONTROLÜ (Online/Offline) ---
async function updateDeviceStatus() {
    if (!sb) return false;
    try {
        const { data: cfg } = await sb.from('shelly_config').select('*').single();
        const response = await fetch(`${cfg.server_url}/device/status?id=${cfg.device_id}&auth_key=${cfg.auth_key}`);
        const resData = await response.json();

        if (resData.isok && resData.data.online) {
            ui.statusBadge.innerText = "AKTİF";
            ui.statusBadge.style.background = "#22c55e"; 
            return true;
        } else {
            ui.statusBadge.innerText = "DEVRE DIŞI";
            ui.statusBadge.style.background = "#ef4444"; 
            return false;
        }
    } catch (err) {
        ui.statusBadge.innerText = "HATA";
        ui.statusBadge.style.background = "#f59e0b"; 
        return false;
    }
}

// --- UI ASİSTANLARI ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i><span>${message}</span>`;
    ui.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

function customConfirm({ title, msg, type = 'info', okText = 'TAMAM' }) {
    return new Promise((resolve) => {
        ui.confirmTitle.innerText = title;
        ui.confirmMsg.innerText = msg;
        ui.confirmOk.innerText = okText;
        ui.confirmOk.className = type === 'danger' ? 'danger' : '';
        ui.confirmOverlay.classList.remove('hidden');
        ui.confirmOk.onclick = () => { ui.confirmOverlay.classList.add('hidden'); resolve(true); };
        ui.confirmCancel.onclick = () => { ui.confirmOverlay.classList.add('hidden'); resolve(false); };
    });
}

// --- BAŞLATMA ---
window.addEventListener('DOMContentLoaded', async () => {
    if (!sb) {
        alert("Bağlantı ayarları eksik! Kapı Otomatiği için URL parametreleri ile giriş yapın.");
        return;
    }
    
    const saved = localStorage.getItem('door_shelly_user');
    if (saved) {
        const p = JSON.parse(saved);
        const { data } = await sb.from('app_users').select('*').eq('email', p.email).eq('password', p.password).single();
        if (data) { 
            currentUser = data; 
            launchApp(); 
        } else { 
            localStorage.removeItem('door_shelly_user'); 
        }
    }
});

ui.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb) return showToast("Bağlantı hatası!", "error");

    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    
    const { data } = await sb.from('app_users').select('*').eq('email', email).eq('password', pass).single();
    
    if (data) {
        currentUser = data;
        localStorage.setItem('door_shelly_user', JSON.stringify({ email, password: pass }));
        launchApp();
    } else { 
        showToast("Giriş Başarısız!", "error"); 
    }
});

function launchApp() {
    ui.loginScreen.classList.add('hidden');
    ui.dashboard.classList.remove('hidden');
    document.getElementById('user-display').innerText = currentUser.email.split('@')[0].toUpperCase();
    
    if (currentUser.is_admin || currentUser.is_super_admin) ui.adminBtn.classList.remove('hidden');
    
    updateDeviceStatus();
    setInterval(updateDeviceStatus, 30000); 
}

// --- KAPI TETİKLEME ---
ui.triggerBtn.addEventListener('click', async () => {
    if (!(await checkUserStatus())) return;

    const isOnline = await updateDeviceStatus();
    if (!isOnline) {
        showToast("Cihaz şu an çevrimdışı!", "error");
        return;
    }

    if (ui.triggerBtn.classList.contains('active')) return;
    ui.triggerBtn.classList.add('active');
    
    try {
        await sb.from('access_logs').insert([{ email: currentUser.email }]);
        const { data: cfg } = await sb.from('shelly_config').select('*').single();
        
        const response = await fetch(`${cfg.server_url}/device/relay/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id: cfg.device_id, auth_key: cfg.auth_key, turn: 'on', channel: '0' })
        });

        if (response.ok) showToast("Kapı Açıldı");
        else throw new Error();

    } catch (err) { 
        showToast("İşlem Başarısız!", "error"); 
    } finally { 
        setTimeout(() => ui.triggerBtn.classList.remove('active'), 2500); 
    }
});

// --- YÖNETİM PANELİ ---
ui.adminBtn.onclick = async () => { if (await checkUserStatus()) renderAdminPanel(); };

async function renderAdminPanel() {
    const { data: allUsers } = await sb.from('app_users').select('*').order('created_at', { ascending: false });
    let visibleUsers = currentUser.is_super_admin ? allUsers : allUsers.filter(u => !u.is_super_admin && !u.is_admin);

    let html = `<div class="admin-add-area" style="background:rgba(255,255,255,0.04); padding:20px; border-radius:20px; margin-bottom:25px;">
        <h4 style="font-size:11px; margin-bottom:15px; color:#007aff;">YENİ KULLANICI</h4>
        <input type="email" id="new-u-email" placeholder="E-posta" style="width:100%; background:#000; border:1px solid #333; padding:14px; color:white; border-radius:12px; margin-bottom:10px; outline:none;">
        <input type="text" id="new-u-pass" placeholder="Şifre" style="width:100%; background:#000; border:1px solid #333; padding:14px; color:white; border-radius:12px; margin-bottom:10px; outline:none;">
        ${currentUser.is_super_admin ? `<label style="display:flex; align-items:center; gap:10px; font-size:13px; margin-bottom:15px;"><input type="checkbox" id="new-u-admin"> Admin Yetkisi</label>` : ''}
        <button onclick="saveUser()" style="width:100%; background:#22c55e; color:black; padding:14px; border-radius:12px; font-weight:800; border:none; cursor:pointer;">KAYDET</button>
    </div>`;

    html += visibleUsers.map(u => `
        <div class="log-row">
            <div class="log-info">
                <b>${u.email} ${u.is_super_admin ? '[SÜPER]' : (u.is_admin ? '[ADMİN]' : '')}</b>
                <small>Şifre: ${currentUser.is_super_admin ? u.password : '********'}</small>
            </div>
            <div style="display:flex; gap:10px;">
                ${u.id !== currentUser.id ? `
                    ${currentUser.is_super_admin ? `<button onclick="toggleAdmin('${u.id}', ${u.is_admin})" style="background:none; border:none; color:#007aff; cursor:pointer;"><i class="fas fa-shield-halved"></i></button>` : ''}
                    <button onclick="deleteUser('${u.id}', '${u.email}')" style="background:none; border:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash-can"></i></button>
                ` : '<i class="fas fa-user-shield" style="color:#22c55e"></i>'}
            </div>
        </div>`).join('');
    openModal("Yönetim", html);
}

document.getElementById('log-btn').onclick = async () => {
    if (await checkUserStatus()) {
        const { data } = await sb.from('access_logs').select('*').order('action_time', { ascending: false }).limit(30);
        let html = data.map(l => `<div class="log-row"><div class="log-info"><b>${l.email}</b><small>${new Date(l.action_time).toLocaleString()}</small></div><i class="fas fa-circle-check" style="color:#22c55e"></i></div>`).join('');
        openModal("Erişim Geçmişi", html);
    }
};

window.saveUser = async () => {
    const email = document.getElementById('new-u-email').value.trim();
    const pass = document.getElementById('new-u-pass').value;
    const isAdmin = document.getElementById('new-u-admin')?.checked || false;
    if (!email || !pass) return showToast("Boş bırakmayın", "error");
    const { error } = await sb.from('app_users').insert([{ email, password: pass, is_admin: isAdmin }]);
    if (error) showToast("Hata!", "error"); else { showToast("Eklendi"); renderAdminPanel(); }
};

window.deleteUser = async (id, email) => {
    const ok = await customConfirm({ title: "Kullanıcıyı Sil", msg: `${email} silinecek?`, type: 'danger' });
    if (ok) { await sb.from('app_users').delete().eq('id', id); showToast("Silindi"); renderAdminPanel(); }
};

window.toggleAdmin = async (id, status) => {
    const ok = await customConfirm({ title: "Yetki Değiştir", msg: "Yetki durumu güncellensin mi?" });
    if (ok) { await sb.from('app_users').update({ is_admin: !status }).eq('id', id); renderAdminPanel(); }
};

function openModal(title, content) {
    ui.modalTitle.innerText = title;
    ui.modalBody.innerHTML = content;
    ui.modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
}

ui.closeModal.onclick = () => {
    ui.modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
};

document.getElementById('logout-btn').onclick = async () => {
    const ok = await customConfirm({ 
        title: "Çıkış Yap", 
        msg: "Oturumunuzu sonlandırmak istediğinize emin misiniz?", 
        type: 'danger', 
        okText: 'ÇIKIŞ YAP' 
    });
    
    if (ok) {
        localStorage.removeItem('door_shelly_user');
        showToast("Kapatılıyor...");
        setTimeout(() => location.reload(), 1000);
    }
};

