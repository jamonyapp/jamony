-- 1104 短信注册登录(欢哥拍板:全新用户系统·零过渡)
-- ① users 加手机号(登录锚点, 唯一; 老测试号 NULL 不受影响)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ② 验证码表(存哈希不存明文; 验证码 5min 过期/错 5 次作废由 api 层保证)
CREATE TABLE IF NOT EXISTS sms_codes (
  id BIGINT PRIMARY KEY,             -- 雪花
  phone VARCHAR(20) NOT NULL,
  code_hash TEXT NOT NULL,
  scene VARCHAR(20) NOT NULL DEFAULT 'login',  -- login | reset_password
  attempts INT NOT NULL DEFAULT 0,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone, created_at DESC);

-- 新建表须授权 api 角色(0718 判例)
GRANT SELECT, INSERT, UPDATE ON sms_codes TO jamony_api;

-- ③ 密码可选化(E2E 实锤: 短信注册号无密码, 非空约束会 500)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ④ rainbowtube(user 1)接管: 手机号届时由欢哥提供后执行
-- UPDATE users SET phone='13xxxxxxxxx' WHERE id=1;
