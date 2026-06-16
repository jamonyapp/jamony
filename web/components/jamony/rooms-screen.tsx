"use client"

import { rooms, type Room } from "@/lib/jamony-data"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./section-header"

// Fixed, evenly-distributed tilt angles (degrees, +right / -left) — one per card.
const ROOM_ANGLES = [2.2, -1.8, 1.5, -2.0, -0.8, 2.5, -2.3, 1.0, -1.2, 2.8, -2.5, 1.8]

function SoundWavePin() {
  // tiny pulsing soundwave "pin" in the corner of each card
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
      {/* sheen sweep */}
      <span className="jamony-sheen pointer-events-none absolute inset-0 rounded-[10px]" aria-hidden />

      <div className="flex items-start justify-between">
        <SoundWavePin />
        <span className="text-[12px] font-medium text-white">
          {room.current}/{room.max}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-bold text-white">{room.title}</h3>
        <p className="truncate text-[13px]" style={{ color: "#8A8A8A" }}>
          {room.desc}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-white">{room.host}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "rgba(255,193,7,0.15)", color: "#FFC107" }}
        >
          host
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[15px]">
        {room.instruments.map((inst, i) => (
          <span key={i} style={{ filter: "drop-shadow(0 0 4px rgba(153,51,255,0.5))" }}>
            {inst}
          </span>
        ))}
        {Array.from({ length: Math.max(0, room.max - room.instruments.length) }).map((_, i) => (
          <span key={`empty-${i}`} className="opacity-25 grayscale">
            🎵
          </span>
        ))}
      </div>
    </button>
  )
}

export function RoomsScreen() {
  const router = useRouter()
  return (
    <section>
      <SectionHeader title="🎵 热门房间" linkLabel="房间大厅" onLink={() => router.push("/lobby")} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {rooms.map((room, i) => (
          <RoomCard key={room.id} room={room} angle={ROOM_ANGLES[i % ROOM_ANGLES.length]} onJoin={() => router.push(`/room/${room.id}`)} />
        ))}
      </div>
    </section>
  )
}
