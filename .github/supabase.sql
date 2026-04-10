-- 1. TABLOLARI OLUŞTUR

-- Uygulamaya giriş yapacak kullanıcılar tablosu
CREATE TABLE IF NOT EXISTS public.app_users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password text NOT NULL,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Shelly cihaz bilgilerini tutan tablo (Tek satır kısıtlamalı)
CREATE TABLE IF NOT EXISTS public.shelly_config (
    id int PRIMARY KEY DEFAULT 1,
    server_url text NOT NULL,
    auth_key text NOT NULL,
    device_id text NOT NULL,
    CONSTRAINT one_row CHECK (id = 1)
);

-- Erişim geçmişini tutan log tablosu
CREATE TABLE IF NOT EXISTS public.access_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL,
    action_time timestamp with time zone DEFAULT now()
);

-- 2. RLS (GÜVENLİK) POLİTİKALARINI AYARLA

-- RLS'yi aktif et
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelly_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Politikaları tanımla (Kodun tablolara erişebilmesi için)
-- Not: Bu politikalar 'anon' anahtarı ile temel işlemlere izin verir.

CREATE POLICY "Kullanıcılar giriş için okunabilir" ON public.app_users 
    FOR SELECT USING (true);

CREATE POLICY "Adminler kullanıcı ekleyebilir ve silebilir" ON public.app_users 
    FOR ALL USING (true);

CREATE POLICY "Shelly config okunabilir" ON public.shelly_config 
    FOR SELECT USING (true);

CREATE POLICY "Loglar eklenebilir ve okunabilir" ON public.access_logs 
    FOR ALL USING (true);

-- 3. VARSAYILAN VERİLERİ EKLE

-- İlk Admin Kullanıcısı (E-posta ve şifreyi kendine göre güncelleyebilirsin)
INSERT INTO public.app_users (email, password, is_admin)
VALUES ('ADMIN_EMAIL', 'ADMIN_PASSWORD', true)
ON CONFLICT (email) DO NOTHING;

-- Varsayılan Shelly Bilgileri (Burayı kendi Shelly bilgilerine göre güncelle)
-- Daha sonra uygulama içinden değil, buradan manuel veya SQL ile güncellenir.
INSERT INTO public.shelly_config (id, server_url, auth_key, device_id)
VALUES (1, 'SHELLY_URL', 'SHELLY_KEY', 'DEVICE_ID')
ON CONFLICT (id) DO UPDATE SET 
    server_url = EXCLUDED.server_url,
    auth_key = EXCLUDED.auth_key,
    device_id = EXCLUDED.device_id;


-- Tabloya süper admin sütunu ekleyelim (yoksa)
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Kendi e-postanı buraya yazarak kendini Süper Admin yap
UPDATE app_users 
SET is_admin = TRUE, is_super_admin = TRUE 
WHERE email = 'ADMIN_EMAIL';

-- Güvenlik Koruması: Süper adminin silinmesini veya yetkisinin alınmasını SQL seviyesinde engelleyelim
CREATE OR REPLACE FUNCTION protect_super_admin()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_super_admin = TRUE THEN
        RAISE EXCEPTION 'Süper admin üzerinde değişiklik yapılamaz!';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_protect_super_admin
BEFORE UPDATE OR DELETE ON app_users
FOR EACH ROW EXECUTE FUNCTION protect_super_admin();

--Database -> Extensions kısmında "pg_cron" etkinleştir

SELECT cron.schedule(
    'daily-old-log-cleanup',
    '0 3 * * *',
    'DELETE FROM public.access_logs WHERE action_time < NOW() - INTERVAL ''30 days'''
);


