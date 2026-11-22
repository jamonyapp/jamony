-- 1123 注销账号: 15天冷静期 + 软注销(墓碑刻名, 查无此人)
-- deletion_requested_at: NULL=正常 | 有值=冷静期起点(登录即自动撤销; 定时任务匿名化的执行锚点)
-- deleted_at: NULL=未执行 | 有值=匿名化执行时刻(此后 phone=del:<id> 哨兵, PII 清空, 昵称/头像/处罚史保留)
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
