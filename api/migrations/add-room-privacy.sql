-- 加密房间：rooms 表加 is_private + password_hash
-- 2026-07-14 加密房间功能
-- 手动执行：psql -U jamony_api -d jamony -f add-room-privacy.sql

-- 是否加密房间（默认 false，存量公开房不受影响）
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- 加密房间的密码哈希（pbkdf2:sha256:600000:<salt>:<hash>，复用 hashPassword 工具）
-- null = 公开房；加密房存哈希串，不存明文
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS password_hash text;
