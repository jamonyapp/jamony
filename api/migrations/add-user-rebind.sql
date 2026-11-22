-- 1122 换绑批: users 加上次换绑时间
-- 用途: ①30天换绑频控 ②admin 侧换绑留痕(用户自助动作不入 admin_audit_log)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rebind_at timestamptz;
