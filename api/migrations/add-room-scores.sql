-- ⑥-3 谱架（1013）：房间谱子累积列表——元数据入库（目录清单拿不回原始名/类型，被顶掉即丢）
-- 一行=一份逻辑谱（图片页集/PDF/GP）；files=URL数组；GP 附 mid_url+tracks（点开直接 push-score 上大屏）
-- 房间解散随目录一起清（房生命周期短，无存量回填）
CREATE TABLE IF NOT EXISTS room_scores (
  id SERIAL PRIMARY KEY,
  room_code VARCHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  type VARCHAR(10) NOT NULL,             -- images | pdf | gp
  files JSONB NOT NULL DEFAULT '[]',
  mid_url TEXT,
  tracks JSONB,
  uploaded_by INTEGER,
  uploaded_by_name VARCHAR(50) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_scores_code ON room_scores(room_code);
GRANT SELECT, INSERT, DELETE ON room_scores TO jamony_api;
GRANT USAGE, SELECT ON SEQUENCE room_scores_id_seq TO jamony_api;
