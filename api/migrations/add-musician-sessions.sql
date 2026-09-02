-- 首页活跃乐手榜重做：musician_sessions 会话表 + users.is_seed 假号标记 + musician_seconds_archive 终身汇总
-- 2026-09-03 活跃乐手榜
-- 手动执行：cat add-musician-sessions.sql | sudo -u postgres psql -d jamony

-- 假号标记：默认 FALSE（新注册=真人）；存量除 rainbowtube(id=1) 全标 TRUE（含 jamony-looper id=0）
-- created_at 硬编码截止日保证重复执行安全（之后注册的真人不会被误标）
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE users SET is_seed = TRUE WHERE id <> 1 AND created_at < DATE '2026-09-04';

-- 终身合奏秒数汇总（7天前明细日清聚合进来；榜单只用 7 天内明细，此列是纯统计储备）
ALTER TABLE users ADD COLUMN IF NOT EXISTS musician_seconds_archive BIGINT NOT NULL DEFAULT 0;

-- 乐手合奏会话表：heartbeat upsert 开会话，role 翻回听众/离房/被踢/解散/僵尸清扫闭会话
-- room_id 不设 FK：rooms 无作品时被硬删，会话是用户资产必须存活（关会话钩子在删房前执行）
CREATE TABLE IF NOT EXISTS musician_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id    INTEGER NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at   TIMESTAMPTZ
);
-- 榜单窗口扫描（3天门槛/7天补位按 user 聚合）
CREATE INDEX IF NOT EXISTS musician_sessions_user_started_idx ON musician_sessions (user_id, started_at);
-- upsert 冲突目标：一个用户一房同时只有一条未闭合会话（双 tab 同房不会重复计时）
CREATE UNIQUE INDEX IF NOT EXISTS musician_sessions_open_idx ON musician_sessions (user_id, room_id) WHERE ended_at IS NULL;

GRANT ALL ON musician_sessions TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE musician_sessions_id_seq TO jamony_api;
