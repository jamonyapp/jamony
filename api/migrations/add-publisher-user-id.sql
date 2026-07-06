-- 先到先得发表锁：recording_sessions 表加 publisher_user_id + claimed_at 列
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS publisher_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP;
