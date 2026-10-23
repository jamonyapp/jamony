-- 申诉七件套 ④: appeals 独立表 + users.restricted_at (1023 定稿, 见 project-content-moderation)
-- 执行: cat add-appeals.sql | ssh root@<server> "sudo -u postgres psql -d jamony"

CREATE TABLE IF NOT EXISTS appeals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  nickname TEXT,                 -- 提交时昵称快照(用户改名后仍可辨识)
  reason TEXT NOT NULL,          -- 申诉理由(必填, 前端强制; 用户对处罚的解释)
  screenshot_path TEXT,          -- 可选截图(服务端机密目录 /var/jamony/appeals/, 不公开静态服务)
  snapshot JSONB NOT NULL DEFAULT '{}',  -- 处罚快照: restriction/restricted_at/restricted_until/滑窗计数(防事后争议)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending(审核中)|approved(通过,联动解除)|rejected(驳回)
  reject_reason TEXT,            -- 驳回理由(admin 填写, 用户可见)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ         -- admin 处理时刻
);
CREATE INDEX IF NOT EXISTS idx_appeals_user_time ON appeals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_status_time ON appeals (status, created_at DESC);

-- 处置生效时刻: 申诉时限锚点(restricted_at + 3天, 与惩罚时长解耦) + 审计
-- 升级(自动)/人工处置时与 restriction 同步写入; 自动解除时一并清空
ALTER TABLE users ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMPTZ;

GRANT ALL ON appeals TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE appeals_id_seq TO jamony_api;
-- admin 工作台(4b)只读; 处理动作走 jamony_admin 自己的写角色
GRANT SELECT ON appeals TO jamony_admin;
-- 列级授权为增量: 上一个 migration 已授 (restriction, restricted_until), 这里补新列
GRANT SELECT (restricted_at) ON users TO jamony_admin;
