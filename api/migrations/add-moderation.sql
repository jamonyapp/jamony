-- 内容安全 A 阶段: 机审日志表 + users 处置字段 (1023 定稿, 见 project-content-moderation)
-- 执行: cat add-moderation.sql | ssh root@<server> "sudo -u postgres psql -d jamony"

CREATE TABLE IF NOT EXISTS moderation_logs (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,            -- notice|notice_comment|work|work_comment|room|chat
  target_id TEXT,                -- 对应表 id 或 room_code(chat)
  user_id INT,
  nickname TEXT,
  content TEXT NOT NULL,         -- 全文(取证)
  verdict TEXT NOT NULL,         -- suspect(放行+标记); reject 不入库(仅拒绝提示)
  hits JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_time ON moderation_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_kind_time ON moderation_logs (kind, created_at DESC);

-- 四档处置字段: normal|watch(观察)|restricted(限发)|demoted(降为听众)|banned(封号)
ALTER TABLE users ADD COLUMN IF NOT EXISTS restriction TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_until TIMESTAMPTZ;

GRANT ALL ON moderation_logs TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE moderation_logs_id_seq TO jamony_api;
GRANT SELECT ON moderation_logs TO jamony_admin;
-- admin 侧用户页展示处置状态所需(users 原有列级授权不动, 只补新列)
GRANT SELECT (restriction, restricted_until) ON users TO jamony_admin;
