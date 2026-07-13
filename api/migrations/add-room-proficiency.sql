-- 演奏水平：乐谱力度记号 p/mf/f/ff/fff（jamony 语言）
-- 2026-07-14 演奏水平字段
-- 手动执行：psql -U jamony_api -d jamony -f add-room-proficiency.sql

-- proficiency: p=新手 mf=进阶 f=熟练 ff=老炮 fff=大神；null=未设置
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS proficiency text;
