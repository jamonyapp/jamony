-- 过期通知去重字段 + system 通知文案
-- 2026-07-16 公告牌第7步 防滥用+自动时效+过期通知
-- 手动执行：cat add-notices-expire-fields.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

-- notices: 过期通知/提前提醒去重（定时任务扫描后置 TRUE，防重复发）
ALTER TABLE notices ADD COLUMN IF NOT EXISTS expire_notified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notices ADD COLUMN IF NOT EXISTS remind_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- notifications: system 通知文案（comment_reply 不用，前端拼；system 存完整文案）
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
