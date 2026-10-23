-- 4b 惯犯雷达 + admin 读权限 (1024, 见 session-1023-mac-step4a-appeals)
-- 执行: cat add-moderation-4b.sql | ssh root@<server> "sudo -u postgres psql -d jamony"

-- 惯犯计数: 每次被系统自动限发 +1 (疑似路径+拒绝试锁路径都算); ≥2=二进宫 → admin 重点关注队列
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_count INT NOT NULL DEFAULT 0;

-- admin 工作台读: 用户列表/重点关注队列需要; moderation_logs 已有 SELECT(1023), appeals 已有 SELECT(add-appeals)
GRANT SELECT (restricted_count) ON users TO jamony_admin;
