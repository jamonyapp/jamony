-- notifications: 站内通知（聚合记录，写时合并 1 小时窗口避免轰炸）
-- 2026-07-16 公告牌第5步通知系统骨架
-- 手动执行：cat add-notifications.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

CREATE TABLE IF NOT EXISTS notifications (
  id                 SERIAL PRIMARY KEY,
  recipient_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 接收者
  type               TEXT NOT NULL,                    -- comment_reply（本轮）；未来 like/follow/system
  notice_id          INTEGER REFERENCES notices(id) ON DELETE CASCADE,
  comment_id         INTEGER REFERENCES notice_comments(id) ON DELETE CASCADE,
  actor_user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- 最后操作者
  actor_nickname     TEXT,                             -- 冗余昵称
  count              INTEGER NOT NULL DEFAULT 1,       -- 聚合数（多人操作合并）
  read_at            TIMESTAMPTZ,                      -- null=未读
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_user_id, read_at);

GRANT ALL ON notifications TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO jamony_api;
