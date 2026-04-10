/**
 * SHELLY PRO - SECURE FINAL SCRIPT (Persistent URL & KEY)
 */

// 1. Bilgileri Önce Yerel Depodan (localStorage) Çek, Yoksa URL'den Al
let kapi_sb_url = localStorage.getItem('kapi_sb_url') || new URLSearchParams(window.location.search).get('url');
let kapi_sb_key = localStorage.getItem('kapi_sb_key') || new URLSearchParams(window.location.search).get('key');

let sb; 
let currentUser = null;

// Eğer URL ve KEY mevcutsa yerel depoya kaydet (Kalıcı hale getir)
if (kapi_sb_url && kapi_sb_key) {
    localStorage.setItem('kapi_sb_url', kapi_sb_url);
    localStorage.setItem('kapi_sb_key', kapi_sb_key);
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
    confirmIcon: document.getElementById('confirm-icon')
};

// --- BAŞLATMA ---
// URL ve KEY yoksa kullanıcıyı uyar (Veya ayarlar ekranına yönlendir)
if (kapi_sb_url && kapi_sb_key) {
    sb = supabase.createClient(kapi_sb_url, kapi_sb_key);
} else {
    alert("Bağlantı ayarları (URL/KEY) bulunamadı. Lütfen kurulum linki ile giriş yapın.");
}

// Otomatik Giriş Kontrolü
window.addEventListener('DOMContentLoaded', async () => {
    if (!sb) return;
    
    const saved = localStorage.getItem('shelly_user');
    if (saved) {
        const p = JSON.parse(saved);
        const { data } = await sb.from('app_users').select('*').eq('email', p.email).eq('password', p.password).single();
        if (data) { 
            currentUser = data; 
            launchApp(); 
        } else { 
            localStorage.removeItem('shelly_user'); 
        }
    }
});

// Giriş Formu İşlemi
ui.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sb) return showToast("Sistem hazır değil!", "error");

    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    
    const { data, error } = await sb.from('app_users').select('*').eq('email', email).eq('password', pass).single();
    
    if (data) {
        currentUser = data;
        localStorage.setItem('shelly_user', JSON.stringify({ email, password: pass }));
        launchApp();
    } else { 
        showToast("Giriş Başarısız!", "error"); 
    }
});

// --- GÜVENLİK: VARLIK KONTROLÜ ---
async function checkUserStatus() {
    if (!currentUser || !sb) return false;
    const { data, error } = await sb.from('app_users').select('id').eq('id', currentUser.id).single();
    if (error || !data) {
        localStorage.removeItem('shelly_user');
        showToast("Erişim Reddedildi!", "error");
        setTimeout(() => location.reload(), 1000);
        return false;
    }
    return true;
}

// --- UI ASİSTANI ---
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

function launchApp() {
    ui.loginScreen.classList.add('hidden');
    ui.dashboard.classList.remove('hidden');
    document.getElementById('user-display').innerText = currentUser.email.split('@')[0].toUpperCase();
    if (currentUser.is_admin || currentUser.is_super_admin) ui.adminBtn.classList.remove('hidden');
}

// --- KAPI TETİKLEME ---
ui.triggerBtn.addEventListener('click', async () => {
    if (!(await checkUserStatus())) return;
    if (ui.triggerBtn.classList.contains('active')) return;
    
    ui.triggerBtn.classList.add('active');
    try {
        await sb.from('access_logs').insert([{ email: currentUser.email }]);
        const { data: cfg } = await sb.from('shelly_config').select('*').single();
        await fetch(`${cfg.server_url}/device/relay/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id: cfg.device_id, auth_key: cfg.auth_key, turn: 'on', channel: '0' })
        });
        showToast("Kapı Açıldı");
    } catch (err) { 
        showToast("Cihaz Hatası!", "error"); 
    } finally { 
        setTimeout(() => ui.triggerBtn.classList.remove('active'), 2500); 
    }
});

// --- YÖNETİM PANELİ ---
ui.adminBtn.onclick = async () => {
    if (await checkUserStatus()) renderAdminPanel();
};

async function renderAdminPanel() {
    const { data: allUsers } = await sb.from('app_users').select('*').order('created_at', { ascending: false });
    let visibleUsers = currentUser.is_super_admin ? allUsers : allUsers.filter(u => !u.is_super_admin && !u.is_admin);

    let html = `
    <div style="background:rgba(255,255,255,0.04); padding:20px; border-radius:20px; margin-bottom:25px;">
        <h4 style="font-size:11px; margin-bottom:15px; color:var(--accent);">KULLANICI EKLE</h4>
        <input type="email" id="new-u-email" placeholder="E-posta" style="width:100%; background:#000; border:1px solid #333; padding:14px; color:white; border-radius:12px; margin-bottom:10px; outline:none;">
        <input type="text" id="new-u-pass" placeholder="Şifre" style="width:100%; background:#000; border:1px solid #333; padding:14px; color:white; border-radius:12px; margin-bottom:10px; outline:none;">
        ${currentUser.is_super_admin ? `<label style="display:flex; align-items:center; gap:10px; font-size:13px; margin-bottom:15px;"><input type="checkbox" id="new-u-admin"> Admin Yetkisi</label>` : ''}
        <button onclick="saveUser()" style="width:100%; background:var(--success); color:black; padding:14px; border-radius:12px; font-weight:800; border:none; cursor:pointer;">KAYDET</button>
    </div>`;

    html += visibleUsers.map(u => {
        const isSelf = u.id === currentUser.id;
        const pwd = currentUser.is_super_admin ? u.password : '********';
        return `
        <div class="log-row">
            <div class="log-info">
                <b>${u.email} ${u.is_super_admin ? '[SÜPER]' : (u.is_admin ? '[ADMİN]' : '')}</b>
                <small>Şifre: ${pwd}</small>
            </div>
            <div style="display:flex; gap:10px;">
                ${!isSelf ? `
                    ${currentUser.is_super_admin ? `<button onclick="toggleAdmin('${u.id}', ${u.is_admin})" style="background:none; border:none; color:var(--accent); cursor:pointer;"><i class="fas fa-shield-halved"></i></button>` : ''}
                    <button onclick="deleteUser('${u.id}', '${u.email}')" style="background:none; border:none; color:var(--error); cursor:pointer;"><i class="fas fa-trash-can"></i></button>
                ` : '<i class="fas fa-user-shield" style="color:var(--success)"></i>'}
            </div>
        </div>`;
    }).join('');
    openModal("Yönetim", html);
}

document.getElementById('log-btn').onclick = async () => {
    if (await checkUserStatus()) {
        const { data } = await sb.from('access_logs').select('*').order('action_time', { ascending: false }).limit(30);
        let html = data.map(l => `<div class="log-row"><div class="log-info"><b>${l.email}</b><small>${new Date(l.action_time).toLocaleString()}</small></div><i class="fas fa-circle-check" style="color:var(--success)"></i></div>`).join('');
        openModal("Erişim Geçmişi", html);
    }
};

window.saveUser = async () => {
    if (!(await checkUserStatus())) return;
    const email = document.getElementById('new-u-email').value.trim();
    const pass = document.getElementById('new-u-pass').value;
    const isAdmin = document.getElementById('new-u-admin')?.checked || false;
    if (!email || !pass) return showToast("Boş bırakmayın", "error");
    const { error } = await sb.from('app_users').insert([{ email, password: pass, is_admin: isAdmin }]);
    if (error) showToast("Hata!", "error"); else { showToast("Eklendi"); renderAdminPanel(); }
};

window.deleteUser = async (id, email) => {
    if (!(await checkUserStatus())) return;
    const ok = await customConfirm({ title: "Kullanıcıyı Sil", msg: `${email} silinecek?`, type: 'danger' });
    if (ok) { await sb.from('app_users').delete().eq('id', id); showToast("Silindi"); renderAdminPanel(); }
};

window.toggleAdmin = async (id, status) => {
    if (!(await checkUserStatus())) return;
    const ok = await customConfirm({ title: "Yetki", msg: "Değiştirilsin mi?" });
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
        localStorage.removeItem('shelly_user');
        // İsteğe bağlı: URL ve KEY'i de silmek istersen aşağıdaki satırları ekleyebilirsin
        // localStorage.removeItem('kapi_sb_url');
        // localStorage.removeItem('kapi_sb_key');
        showToast("Oturum kapatıldı...");
        setTimeout(() => location.reload(), 1000);
    }
};

