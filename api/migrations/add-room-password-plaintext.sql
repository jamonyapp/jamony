-- 加密房间密码：hash 存储 → 明文存储
-- 2026-07-15 房间分享功能
-- 手动执行：psql -U jamony_api -d jamony -f add-room-password-plaintext.sql
--
-- 背景：房间密码的威胁模型是"防陌生人随便进"，不是"防数据库泄露"。
-- 密码本就是要分享给被邀请者的（房主/听众都会知道并传播），房主无法控制其传播。
-- 因此拿 PBKDF2 重保护一个注定四处分享的码是杀鸡用牛刀，反而逼出"刷新后无法复制密码"的体验毛刺。
-- 改明文存储后，房主/成员随时可查可分享，体验一致。代价：DB 泄露→加密房密码泄露（低风险，房间临时、密码可改）。
-- 参考 Zoom/腾讯会议：房间密码明文可读可分享。
-- 注：用户账户密码 (users.password_hash) 仍用 PBKDF2 hash，本次不动。

-- 1. 重命名列：password_hash → password（语义改为明文）
ALTER TABLE rooms RENAME COLUMN password_hash TO password;

-- 2. 清空存量加密房密码：旧的 hash 串无法还原成明文，留着会让明文比对失效。
--    jamony 未公测，存量均为测试房，清空可接受；房主重新设置即可。
UPDATE rooms SET password = NULL WHERE is_private = true;

COMMENT ON COLUMN rooms.password IS '加密房间密码（明文，便于房主/成员分享）；null = 公开房';
