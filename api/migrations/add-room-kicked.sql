-- 房间黑名单：被房主踢出的用户，本房禁止再次加入
-- 2026-07-15 房主踢人功能
-- 手动执行：psql -U jamony_api -d jamony -f add-room-kicked.sql

-- room_kicked: (room_id, user_id) 复合主键去重；房间硬删时 ON DELETE CASCADE 自动清，无需手动维护
CREATE TABLE IF NOT EXISTS room_kicked (
  room_id   INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kicked_by INTEGER REFERENCES users(id),
  kicked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);
