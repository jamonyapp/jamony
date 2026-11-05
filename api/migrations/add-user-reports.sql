-- user_reports: 举报用户(1105 欢哥定稿)
-- 分类: 个人信息违规 / 扰乱房间内秩序 / 其他+描述(其他必填,前端 maxLength=100)
-- 幂等: 一人一目标一票(UNIQUE);处置流转上线时再议重置
-- 手动执行: cat add-user-reports.sql | sudo -u postgres psql -d jamony(/root 下 postgres 无读权限,走 stdin)

CREATE TABLE IF NOT EXISTS user_reports (
  id                BIGSERIAL PRIMARY KEY,
  reported_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason            VARCHAR(100) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reported_user_id, reporter_user_id)
);
CREATE INDEX IF NOT EXISTS user_reports_reported_user_id_idx ON user_reports (reported_user_id);

GRANT INSERT, SELECT ON user_reports TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE user_reports_id_seq TO jamony_api;
