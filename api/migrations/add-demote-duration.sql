-- 降级定时化 + 三降计数 (1024 欢哥拍板: 降级默认15天自动解除, 三降升级提示)
-- 执行: cat add-demote-duration.sql | ssh root@<server> "sudo -u postgres psql -d jamony"

-- 每次人工降级 +1; ≥2 时 admin 处置弹窗升级提示"建议直接封号"(决策支持, 不自动封)
ALTER TABLE users ADD COLUMN IF NOT EXISTS demoted_count INT NOT NULL DEFAULT 0;

GRANT SELECT (demoted_count) ON users TO jamony_admin;
