-- 通知扩展：作品点赞/评论通知需要的列
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS work_id INTEGER REFERENCES works(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS work_comment_id INTEGER REFERENCES work_comments(id) ON DELETE CASCADE;

-- 二人会话（私信）
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a_id <> user_b_id)
);
-- 应用层保证 user_a=LEAST, user_b=GREATEST；唯一索引防重复会话
CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_idx ON conversations (user_a_id, user_b_id);
CREATE INDEX IF NOT EXISTS conversations_user_a_idx ON conversations (user_a_id);
CREATE INDEX IF NOT EXISTS conversations_user_b_idx ON conversations (user_b_id);

-- 私信消息
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at DESC);

-- jamony_api 用户权限（新建表需显式 GRANT，否则 aclcheck_error）
GRANT ALL ON conversations, messages TO jamony_api;
GRANT USAGE, SELECT ON conversations_id_seq, messages_id_seq TO jamony_api;
