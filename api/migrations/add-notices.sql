-- notices：公告牌，线上约jam / 线下演出·组队·租售·其他 信息发布
-- 2026-07-16 公告牌第1步地基
-- 手动执行：cat add-notices.sql | sudo -u postgres psql -d jamony（/root 下 postgres 无读权限，走 stdin）

CREATE TABLE IF NOT EXISTS notices (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- 发布者
  nickname       TEXT NOT NULL,                                            -- 冗余昵称（防改名，参考 work_comments）
  type           TEXT NOT NULL CHECK (type IN ('offline','online')),       -- 线下/线上
  category       TEXT,                                                     -- 线下细分：演出/组队/租售/其他；线上为 null
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,                                            -- 线上=简短说明，线下=自由描述
  city           TEXT NOT NULL DEFAULT '其他',
  style          TEXT NOT NULL DEFAULT '未分类',
  jam_time       TEXT,                                                     -- 线上模板：jam 时间（如"今晚8点"）
  level          TEXT,                                                     -- 线上模板：水平 p/mf/f/ff/fff
  needed_count   INTEGER,                                                  -- 线上模板：需要人数
  bg_index       INTEGER NOT NULL DEFAULT 1,                               -- 1-17 默认配图
  image_url      TEXT,                                                     -- 用户上传图 URL 路径（第2步上传）
  duration_days  INTEGER NOT NULL DEFAULT 7 CHECK (duration_days IN (1,3,7)), -- 有效期 1/3/7 天
  expire_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'), -- 过期时间
  views          INTEGER NOT NULL DEFAULT 0,
  likes          INTEGER NOT NULL DEFAULT 0,
  comments       INTEGER NOT NULL DEFAULT 0,                               -- 冗余计数（参考 works.comments）
  status         TEXT NOT NULL DEFAULT 'active',                           -- active/deleted；过期靠 expire_at 判断
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notices_created_at_idx ON notices (created_at DESC);
CREATE INDEX IF NOT EXISTS notices_type_idx ON notices (type);
CREATE INDEX IF NOT EXISTS notices_expire_at_idx ON notices (expire_at);
