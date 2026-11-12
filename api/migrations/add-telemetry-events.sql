-- 客户端遥测事件表（1112 P2.1 小项三：壳断线/自愈/放弃等事件上报；泛化设计，
-- 公测后 update_check/crash 等事件类型复用同一张表）
-- 手动执行（stdin 形态判例，/root 下 postgres 无读权限）：
--   cat add-telemetry-events.sql | ssh root@123.57.33.130 "sudo -u postgres psql -d jamony"
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGINT PRIMARY KEY,             -- 雪花（api 层 lib/snowflake.js nextId() 发号）
  user_id BIGINT NOT NULL,
  client_version VARCHAR(20),        -- 壳版本（2.1.1 起上报）
  platform VARCHAR(10),              -- darwin / win32
  event_type VARCHAR(40) NOT NULL,   -- selfheal_disconnect / selfheal_recover / selfheal_giveup
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_created ON telemetry_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user ON telemetry_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events (event_type, created_at DESC);
-- 0718 判例：新建表须授权 api 角色；遥测无更新语义，最小权限只 INSERT+SELECT
GRANT SELECT, INSERT ON telemetry_events TO jamony_api;
-- admin 工作台读直连（遥测统计页）
GRANT SELECT ON telemetry_events TO jamony_admin;
