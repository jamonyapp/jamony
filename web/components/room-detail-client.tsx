"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Headphones, ArrowLeft, Crown, Lock, Loader2, Check } from "lucide-react"
import { rooms, COLOR_MAP, type Room } from "@/lib/rooms-data"

// Electron 暴露的 API 类型声明
declare global {
  interface Window {
    jamonyAPI?: { joinRoom: (p: { serverIp: string; port: number }) => void }
  }
}

function MemberList({ room, extraMembers }: { room: Room; extraMembers?: Room["members"] }) {
  const allMembers = [...room.members, ...(extraMembers || [])]
  const current = allMembers.length
  const { capacity } = room
  const emptySlots = Math.max(0, capacity - current)
  const countColor = current >= capacity ? "#ff4d4d" : capacity - current <= 1 ? "#ffb84d" : "#ffffff"

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-base font-semibold text-white">
        房间成员（<span style={{ color: countColor }}>{current}/{capacity}</span>）
      </h2>
      <ul className="flex flex-col gap-2">
        {allMembers.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-[10px] border border-white/5 bg-white/[0.02] px-3 py-2.5 sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white sm:h-10 sm:w-10"
              style={{ backgroundColor: COLOR_MAP[m.color] }}>{m.name.charAt(0)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white sm:text-base">{m.name}</span>
            <span className="flex items-center gap-1.5 text-sm text-[#8a8a8a]">
              <span aria-hidden>{m.instrumentEmoji}</span>
              <span className="hidden sm:inline">{m.instrument}</span>
            </span>
            {m.status === "owner" ? (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                <Crown className="h-3 w-3" />房主
              </span>
            ) : (
              <span className="text-xs font-medium" style={{ color: "#bbee00" }}>已就绪</span>
            )}
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-3 rounded-[10px] border border-dashed border-white/15 px-3 py-2.5 sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 text-[#8a8a8a] sm:h-10 sm:w-10">?</span>
            <span className="flex-1 text-sm text-[#8a8a8a]">等待乐手加入...</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function RoomDetailClient() {
  const params = useParams()
  const router = useRouter()
  const room = rooms.find((r) => r.id === params.id)
  const [joinState, setJoinState] = useState<"idle" | "connecting" | "joined">("idle")
  const [leaving, setLeaving] = useState(false)

  // 加入成功后，把自己加到成员列表
  const joinedMember = joinState === "joined" ? [{
    id: "me",
    name: "我",
    instrument: "?",
    instrumentEmoji: "🎸",
    status: "ready" as const,
    color: "lime" as const,
  }] : []

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-white text-lg">房间不存在</p>
          <button onClick={() => router.push("/lobby")} className="mt-4 rounded-[10px] border border-white/30 px-6 py-2.5 text-white hover:bg-white/5">返回列表</button>
        </div>
      </div>
    )
  }

  const isFull = (room.members.length + joinedMember.length) >= room.capacity
  const isLowLatency = room.latency <= 50
  const latencyColor = isLowLatency ? "#bbee00" : "#ffb84d"

  const handleBack = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(() => router.push("/lobby"), 300)
  }

  const handleJoin = () => {
    if (isFull || joinState !== "idle") return
    const payload = { serverIp: room.serverIp, port: room.port }
    // Electron 环境 → 通过 jamonyAPI 调起 jamsoul
    if (window.jamonyAPI) {
      console.log("[jamony] user join room via jamonyAPI:", JSON.stringify(payload))
      window.jamonyAPI.joinRoom(payload)
    } else {
      // 浏览器环境 → postMessage（demo/调试）
      console.log("[v0] postMessage to Electron:", JSON.stringify({ type: "JOIN_ROOM", payload }))
      window.postMessage({ type: "JOIN_ROOM", payload }, "*")
    }
    setJoinState("connecting")
    setTimeout(() => setJoinState("joined"), 2000)
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} aria-label="返回房间列表"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white transition-all duration-200 hover:bg-white/10 active:scale-95">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold tracking-tight text-white">jamony</span>
        </div>
        <button className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 transition-colors duration-200 hover:bg-white/10">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundImage: "linear-gradient(135deg,#00aaff,#9933ff)" }}>木</span>
          <span className="hidden text-sm text-white sm:inline">木木</span>
        </button>
      </header>

      <main className={`mx-auto w-full max-w-[800px] px-4 py-6 sm:px-6 sm:py-10 ${leaving ? "animate-slide-out" : "animate-slide-in"}`}>
        <article className="overflow-hidden rounded-[10px] bg-[#0d0d0d] ring-1 ring-white/10">
          <div className="brand-gradient h-1" />
          <div className="p-5 sm:p-8">
            <div className="flex items-center gap-2">
              {room.isPrivate ? (
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-[#8a8a8a]">
                  <Lock className="h-3 w-3" />私密
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-white">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#bbee00" }} />公开
                </span>
              )}
            </div>
            <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold tracking-tight text-white text-balance sm:text-4xl">
              <span aria-hidden>{room.emoji}</span>{room.name}
            </h1>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-4">
                <span className="inline-block rounded-full px-3 py-1 text-xs font-medium text-white/80"
                  style={{ background: "linear-gradient(#0d0d0d,#0d0d0d) padding-box, linear-gradient(90deg,#00aaff,#9933ff,#ff33aa,#bbee00) border-box", border: "1px solid transparent" }}>
                  {room.style}
                </span>
                <p className="max-w-prose text-sm leading-relaxed text-[#8a8a8a]">{room.description}</p>
                <p className="text-sm text-[#8a8a8a]">{room.createdAt}</p>
                <p className="text-sm font-medium" style={{ color: latencyColor }}>延迟 ≈ {room.latency}ms</p>
              </div>
              <div className="flex items-center gap-4 rounded-[10px] border border-white/5 bg-white/[0.02] p-4 md:flex-col md:items-center md:text-center">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{ backgroundColor: COLOR_MAP[room.owner.color] }}>{room.owner.name.charAt(0)}</span>
                <div className="flex flex-col gap-1.5 md:items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-white">{room.owner.name}</span>
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                      <Crown className="h-3 w-3" />房主
                    </span>
                  </div>
                  {room.ownerOnline && (
                    <span className="flex items-center gap-1.5 text-xs text-[#8a8a8a]">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#bbee00" }} />在线中
                    </span>
                  )}
                </div>
              </div>
            </div>
            <MemberList room={room} extraMembers={joinedMember} />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {isFull ? (
                <button disabled className="flex-1 cursor-not-allowed rounded-[10px] bg-white/10 px-6 py-3.5 text-base font-semibold text-[#8a8a8a]">房间已满</button>
              ) : (
                <button onClick={handleJoin} disabled={joinState !== "idle"}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[10px] px-6 py-3.5 text-base font-semibold text-white transition-transform duration-200 active:scale-[0.97] disabled:cursor-default"
                  style={joinState === "joined" ? { backgroundColor: "#bbee00", color: "#0d0d0d" } : { backgroundImage: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                  {joinState === "connecting" && <Loader2 className="h-5 w-5 animate-spin" />}
                  {joinState === "joined" && <Check className="h-5 w-5" />}
                  {joinState === "idle" && "加入合奏"}
                  {joinState === "connecting" && "正在连接..."}
                  {joinState === "joined" && "已加入"}
                </button>
              )}
              <button onClick={handleBack}
                className="rounded-[10px] border border-white/30 bg-transparent px-6 py-3.5 text-base font-semibold text-white transition-all duration-200 hover:bg-white/5 active:scale-[0.97]">返回列表</button>
            </div>
            {isFull ? (
              <p className="mt-3 text-sm text-[#ff33aa]">该房间已达到人数上限，请选择其他房间</p>
            ) : joinState !== "idle" ? (
              <p className="mt-3 text-sm text-[#8a8a8a]">混音台窗口即将弹出，请允许 jamony 访问音频设备</p>
            ) : null}
          </div>
        </article>
        <footer className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="flex items-center gap-2 text-sm text-[#8a8a8a]"><Headphones className="h-4 w-4" />建议使用耳机以避免回声和啸叫</p>
          <p className="text-xs text-[#8a8a8a]/70">连接延迟取决于你的网络环境，推荐使用有线网络连接</p>
        </footer>
      </main>
    </div>
  )
}
