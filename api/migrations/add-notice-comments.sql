-- notice_comments: 公告牌评论跟帖（克隆 work_comments，work_id→notice_id，隔离不共用 comment_likes 避碰撞）
-- 2026-07-16 公告牌第4步评论跟帖
-- 手动执行：cat add-notice-comments.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

CREATE TABLE IF NOT EXISTS notice_comments (
  id                SERIAL PRIMARY KEY,
  notice_id         INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname          TEXT NOT NULL,                                              -- 冗余昵称（防改名，参考 work_comments）
  content           TEXT NOT NULL,
  parent_id         INTEGER REFERENCES notice_comments(id) ON DELETE CASCADE,  -- NULL=一级；删一级 CASCADE 删回复
  reply_to_nickname TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notice_comments_notice_id_idx ON notice_comments (notice_id);

CREATE TABLE IF NOT EXISTS notice_comment_likes (
  comment_id  INTEGER NOT NULL REFERENCES notice_comments(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS notice_comment_reports (
  id               SERIAL PRIMARY KEY,
  comment_id       INTEGER NOT NULL REFERENCES notice_comments(id) ON DELETE CASCADE,
  reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 新表需显式授权 jamony_api（默认 owner=postgres，jamony_api 无权限）
GRANT ALL ON notice_comments, notice_comment_likes, notice_comment_reports TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE notice_comments_id_seq, notice_comment_reports_id_seq TO jamony_api;
