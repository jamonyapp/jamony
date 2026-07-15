-- notice_reports: 举报公告（违规内容举报，后台审核）
-- 2026-07-16 公告举报
-- 手动执行：cat add-notice-reports.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

CREATE TABLE IF NOT EXISTS notice_reports (
  id               SERIAL PRIMARY KEY,
  notice_id        INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notice_reports_notice_id_idx ON notice_reports (notice_id);

GRANT ALL ON notice_reports TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE notice_reports_id_seq TO jamony_api;
