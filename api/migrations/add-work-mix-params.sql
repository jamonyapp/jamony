-- 1026 试听混音器×发表工程：作品混音快照落档（第四道闸）
-- 发表时刻一次写入：分轨参与(track_id/user/gain/pan/is_system)+总线+定位器区间+技术溯源
-- 服务端终审只信 DB 权威集合 + range + track_id 对齐；历史作品 NULL = 快照制度前发表，不回溯
ALTER TABLE works ADD COLUMN IF NOT EXISTS mix_params JSONB;
