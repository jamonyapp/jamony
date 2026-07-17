-- 用户关注/粉丝列表隐私开关：true=仅自己可见，false=公开（默认）
ALTER TABLE users ADD COLUMN IF NOT EXISTS follow_list_private boolean NOT NULL DEFAULT false;
