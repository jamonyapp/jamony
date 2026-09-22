-- 录音时长服务端权威计时（2026-09-22）：start 记起始时刻，stop 用服务器时钟算真实时长。
-- 背景：客户端秒表跨强刷会重置，停止时上报的 duration 少算（音频本身无损，仅时长标签偏短）。
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS recording_started_at TIMESTAMPTZ;
