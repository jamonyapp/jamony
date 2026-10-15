-- program 背景轨（1015 开工，1014 方案定稿）：高质量伴奏音频多轨播放，走 ffmpeg amix→jack-stdin→幽灵乐手管道
-- current_program = 当前装载的伴奏包物料+混音快照（tracks[{id,name,file,size}] + mix{vols,mutes}）；
-- program_state   = 走带状态对照 gp_state 同款（playing/startedAt/startMs），强刷/重连者读它对表
-- ⚠️列类型=text（对齐 current_score/gp_state 既有惯例）：服务端/前端全链 JSON.parse(str) 依此而定——
--   jsonb 会被 pg 驱动直接解析成对象，JSON.parse(对象) 静默炸（1015 集成测试实测定罪），勿改回
-- 房间解散随目录清（/var/jamony/programs/<code>，同 scores 物料语义）
-- 手动执行：sudo -u postgres psql -d jamony -f add-room-program.sql

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS current_program TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS program_state TEXT;
