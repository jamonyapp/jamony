-- 关注关系表（用户关注用户，多对多）
-- follower_id = 关注者，followee_id = 被关注者
-- 联合主键防重复关注；ON DELETE CASCADE 用户删除时自动清理关注关系
CREATE TABLE IF NOT EXISTS follows (
  follower_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);
-- 双向索引：followers_count（按 followee 查）、following_count（按 follower 查）
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
