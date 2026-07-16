-- favorites: 通用收藏表（公告 / 未来作品，subject_type 区分）
-- 2026-07-16 公告收藏功能
-- 手动执行：cat add-favorites.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,   -- 'notice' / 未来 'work'
  subject_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, subject_type);

GRANT ALL ON favorites TO jamony_api;
