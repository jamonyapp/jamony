-- 1122 换绑回滚窗: 72h 紧急恢复通道
-- rebind_from_phone: 换绑时存档旧号(恢复通道锚点), 恢复成功后置 NULL(通道关闭)
-- token_version: 会话版本——紧急恢复时 +1 = 该用户全部旧 JWT 立即失效(HTTP/socket/流闸同源校验)
ALTER TABLE users ADD COLUMN IF NOT EXISTS rebind_from_phone varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;
