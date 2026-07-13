-- room_code：8位对外门牌码（去易混淆字符集 ABCDEFGHJKLMNPQRSTUVWXYZ23456789）
-- 2026-07-14 room_code 门牌码功能
-- 手动执行：psql -U jamony_api -d jamony -f add-room-code.sql

-- 加列（先允许 null，回填后设 NOT NULL）
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code char(8);
CREATE UNIQUE INDEX IF NOT EXISTS rooms_room_code_idx ON rooms (room_code);

-- 回填存量房间：用 pg 内置 random() 生成 8 位去易混淆码，冲突重试
DO $$ DECLARE r RECORD; s TEXT; i INT; BEGIN
  FOR r IN SELECT id FROM rooms WHERE room_code IS NULL LOOP
    LOOP
      s := '';
      FOR i IN 1..8 LOOP
        s := s || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (floor(random()*32)::int)+1, 1);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM rooms WHERE room_code = s) THEN
        UPDATE rooms SET room_code = s WHERE id = r.id; EXIT;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE rooms ALTER COLUMN room_code SET NOT NULL;
