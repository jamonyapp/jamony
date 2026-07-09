"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./section-header"
import { RoomDetailModal } from "@/components/room-detail-modal"
import { Avatar } from "@/components/jamony/avatar"

const ROOM_ANGLES = [2.2, -1.8, 1.5, -2.0, -0.8, 2.5, -2.3, 1.0, -1.2, 2.8, -2.5, 1.8]

const STYLE_EMOJI: Record<string, string> = {
  "摇滚": "🎸", "金属": "🎸", "流行": "🎤",
  "爵士": "🎷", "布鲁斯": "🎷",
  "民谣": "🪕", "古典": "🎻",
  "电子": "🎛️", "放克": "🎸",
  "嘻哈": "🎤", "R&B": "🎤",
  "国风": "🏮", "ACG": "🎹",
  "雷鬼": "🥁",
}

function SoundWavePin() {
  const bars = [0, 1, 2, 3, 4]
  return (
    <div className="flex h-5 items-end gap-[2px]" aria-hidden>
      {bars.map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full"
          style={{
            background: "linear-gradient(180deg, #00AAFF, #9933FF, #FF33AA)",
            animation: `jamony-wave 900ms ease-in-out ${i * 120}ms infinite`,
            filter: "drop-shadow(0 0 3px rgba(0,170,255,0.6))",
            height: "40%",
          }}
        />
      ))}
    </div>
  )
}

type Room = {
  id: number
  name: string
  description: string
  style: string
  host_name: string
  host_avatar_url?: string
  musician_count: number
  max_musicians: number
  listener_count: number
}

function RoomCard({ room, angle, onJoin }: { room: Room; angle: number; onJoin: () => void }) {
  return (
    <button
      className="jamony-room-card group relative flex flex-col gap-2 rounded-[10px] border p-4 text-left"
      style={{
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "rgba(110,150,255,0.25)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04) inset",
        transform: `rotate(${angle}deg)`,
      }}
      onClick={onJoin}
    >
      <span className="jamony-sheen pointer-events-none absolute inset-0 rounded-[10px]" aria-hidden />

      <div className="flex items-start justify-between">
        <SoundWavePin />
        <span className="text-[12px] font-medium text-white">
          {room.musician_count}/{room.max_musicians}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{STYLE_EMOJI[room.style] || "🎵"}</span>
          <h3 className="text-[15px] font-bold text-white">{room.name}</h3>
        </div>
        <p className="truncate text-[13px]" style={{ color: "#8A8A8A" }}>
          {room.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Avatar nickname={room.host_name} avatarUrl={room.host_avatar_url} size={20} />
        <span className="text-[12px] text-white">{room.host_name}</span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(255,193,7,0.15)", color: "#FFC107" }}>
          host
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs" style={{ color: "#8A8A8A" }}>
        🎸 {room.musician_count}/{room.max_musicians} · 🎧 {room.listener_count}
      </div>
    </button>
  )
}

export function RoomsScreen() {
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/rooms")
      .then(r => r.json())
      .then(data => {
        if (data.ok) setRooms(data.rooms.slice(0, 4))
      })
      .catch(() => {})
  }, [])

  return (
    <section>
      <SectionHeader title="热门房间" linkLabel="房间大厅" onLink={() => router.push("/lobby")} />
      {rooms.length === 0 ? (
        <div className="flex items-center justify-center rounded-[10px] border border-dashed py-12" style={{ borderColor: "#2A2A2A" }}>
          <p className="text-sm" style={{ color: "#8A8A8A" }}>暂无房间，去大厅创建一个吧</p>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {rooms.map((room, i) => (
          <RoomCard key={room.id} room={room} angle={ROOM_ANGLES[i % ROOM_ANGLES.length]} onJoin={() => setSelectedRoom(String(room.id))} />
        ))}
      </div>
      )}
      <RoomDetailModal roomId={selectedRoom} onClose={() => setSelectedRoom(null)} />
    </section>
  )
}
