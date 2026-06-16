"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Crown, Lock, X } from "lucide-react"
import { rooms, COLOR_MAP, type Room } from "@/lib/rooms-data"

function MemberList({ room }: { room: Room }) {
  const allMembers = room.members
  const current = allMembers.length
  const { capacity } = room
  const emptySlots = Math.max(0, capacity - current)
  const countColor = current >= capacity ? "#ff4d4d" : capacity - current <= 1 ? "#ffb84d" : "#ffffff"

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-white">
        房间成员（<span style={{ color: countColor }}>{current}/{capacity}</span>）
      </h3>
      <ul className="flex flex-col gap-1.5">
        {allMembers.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: COLOR_MAP[m.color] }}>{m.name.charAt(0)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{m.name}</span>
            <span className="flex items-center gap-1 text-xs text-[#8a8a8a]">
              <span aria-hidden>{m.instrumentEmoji}</span>
              <span className="hidden sm:inline">{m.instrument}</span>
            </span>
            {m.status === "owner" ? (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                <Crown className="h-3 w-3" />房主
              </span>
            ) : (
              <span className="text-[11px] font-medium" style={{ color: "#bbee00" }}>已就绪</span>
            )}
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-2.5 rounded-lg border border-dashed border-white/15 px-3 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 text-[#8a8a8a] text-xs">?</span>
            <span className="flex-1 text-xs text-[#8a8a8a]">等待乐手加入...</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RoomDetailModal({
  roomId,
  onClose,
}: {
  roomId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const room = roomId ? rooms.find((r) => r.id === roomId) : null

  useEffect(() => {
    if (roomId) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [roomId])

  if (!roomId || !room) return null

  const isFull = room.members.length >= room.capacity
  const isLowLatency = room.latency <= 50
  const latencyColor = isLowLatency ? "#bbee00" : "#ffb84d"

  const handleEnter = () => {
    onClose()
    router.push(`/room/${room.id}/playing`)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 pt-16"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="jamony-modal-enter relative w-full max-w-lg overflow-hidden rounded-2xl border"
        style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 z-10"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 顶部品牌色条 */}
        <div className="brand-gradient h-1" />

        <div className="p-5">
          <div className="flex items-center gap-2">
            {room.isPrivate ? (
              <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#8a8a8a]">
                <Lock className="h-3 w-3" />私密
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#bbee00" }} />公开
              </span>
            )}
          </div>

          <h2 className="mt-3 flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <span aria-hidden>{room.emoji}</span>{room.name}
          </h2>

          <div className="mt-4 flex flex-wrap gap-4">
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span className="inline-block self-start rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white/80"
                style={{ background: "linear-gradient(#0d0d0d,#0d0d0d) padding-box, linear-gradient(90deg,#00aaff,#9933ff,#ff33aa,#bbee00) border-box", border: "1px solid transparent" }}>
                {room.style}
              </span>
              <p className="text-sm leading-relaxed text-[#8a8a8a]">{room.description}</p>
              <p className="text-xs text-[#8a8a8a]">{room.createdAt}</p>
              <p className="text-xs font-medium" style={{ color: latencyColor }}>延迟 ≈ {room.latency}ms</p>
            </div>

            <div className="flex items-center gap-3 rounded-[10px] border border-white/5 bg-white/[0.02] p-3 shrink-0">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ backgroundColor: COLOR_MAP[room.owner.color] }}>{room.owner.name.charAt(0)}</span>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-semibold text-white">{room.owner.name}</span>
                  <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                    <Crown className="h-2.5 w-2.5" />房主
                  </span>
                </div>
                {room.ownerOnline && (
                  <span className="flex items-center gap-1 text-[11px] text-[#8a8a8a]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#bbee00" }} />在线中
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="my-5 h-px" style={{ background: "#1A1A1A" }} />

          <MemberList room={room} />

          <div className="mt-5 flex flex-col gap-2.5">
            {isFull ? (
              <button disabled className="w-full cursor-not-allowed rounded-[10px] bg-white/10 px-6 py-3 text-sm font-semibold text-[#8a8a8a]">房间已满</button>
            ) : (
              <button onClick={handleEnter}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 active:scale-[0.97]"
                style={{ backgroundImage: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                进入房间
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
