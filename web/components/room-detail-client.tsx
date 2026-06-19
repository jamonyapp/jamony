"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Headphones, ArrowLeft, Crown, Lock, Loader2, Check, UserCheck, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

type Member = {
  id: number
  user_id: number
  nickname: string
  role: "musician" | "listener"
  audio_status: string
  joined_at: string
}

type RoomData = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  is_private: boolean
  max_musicians: number
  musician_count: number
  listener_count: number
  total_members: number
  server_port: number
  status: string
  created_at: string
}

export function RoomDetailClient() {
  const params = useParams()
  const router = useRouter()
  const { user, loggedIn, setShowLoginModal } = useAuth()
  const [room, setRoom] = useState<RoomData | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [joinState, setJoinState] = useState<"idle" | "connecting" | "joined">("idle")
  const [myRole, setMyRole] = useState<"musician" | "listener" | null>(null)

  const roomId = params?.id as string

  useEffect(() => {
    if (!roomId) return
    setLoading(true)
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setRoom(data.room)
          setMembers(data.members || [])
          const me = (data.members || []).find((m: Member) => m.user_id === user?.id)
          if (me) setMyRole(me.role)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [roomId, user?.id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-[#8A8A8A]">加载中...</p>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-center">
          <p className="mb-4 text-4xl">🔍</p>
          <p className="text-lg text-white">房间不存在</p>
          <button onClick={() => router.push("/lobby")}
            className="mt-4 rounded-[10px] border px-6 py-2.5 text-white transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.3)" }}>
            返回列表
          </button>
        </div>
      </div>
    )
  }

  const musicians = members.filter(m => m.role === "musician")
  const listeners = members.filter(m => m.role === "listener")
  const isFull = musicians.length >= room.max_musicians

  const handleJoin = (role: "musician" | "listener") => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!user) return
    setJoinState("connecting")
    fetch(`/api/rooms/${roomId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, role }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setMyRole(role)
          setJoinState("joined")
          if (role === "musician") {
            setTimeout(() => router.push(`/room/${roomId}/playing`), 500)
          } else {
            // 听众模式，刷新成员列表
            fetch(`/api/rooms/${roomId}`).then(r => r.json()).then(d => {
              if (d.ok) { setRoom(d.room); setMembers(d.members || []) }
            })
          }
        }
        setJoinState("idle")
      })
      .catch(() => setJoinState("idle"))
  }

  return (
    <div className="min-h-screen bg-black">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md sm:px-6"
        style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.8)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/lobby")} aria-label="返回"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white transition-all hover:bg-white/10 active:scale-95">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-lg font-bold tracking-tight text-white">jamony</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-8">
        <div className="rounded-2xl border p-6" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <h1 className="text-2xl font-bold text-white">{room.name}</h1>

          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.12)" }}>
              {room.style || "通用"}
            </span>
            <span className="text-xs" style={{ color: "#8A8A8A" }}>
              🎸 {room.musician_count}/{room.max_musicians} · 🎧 {room.listener_count}
            </span>
          </div>

          {room.description && <p className="mt-3 text-sm" style={{ color: "#8A8A8A" }}>{room.description}</p>}

          <div className="my-5 flex items-center gap-3 rounded-[10px] border p-3" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#9933FF,#FF33AA)" }}>
              {room.host_name.charAt(0)}
            </span>
            <div>
              <span className="text-sm font-semibold text-white">{room.host_name}</span>
              <span className="ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                <Crown className="h-2.5 w-2.5" />房主
              </span>
            </div>
          </div>

          <div className="h-px" style={{ background: "#1A1A1A" }} />

          {/* 合奏者 */}
          <section className="mt-5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Headphones className="h-4 w-4" style={{ color: "#00AAFF" }} />
              合奏者（{musicians.length}/{room.max_musicians}）
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {musicians.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(0,170,255,0.05)", border: "1px solid rgba(0,170,255,0.1)" }}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ background: m.user_id === room.host_id ? "linear-gradient(135deg,#9933FF,#FF33AA)" : "linear-gradient(135deg,#00AAFF,#9933FF)" }}>
                    {m.nickname.charAt(0)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-white">{m.nickname}</span>
                  {m.user_id === room.host_id && (
                    <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                      <Crown className="h-3 w-3" />房主
                    </span>
                  )}
                  <span className="text-[11px]" style={{ color: m.audio_status === "connected" ? "#BBEE00" : "#8A8A8A" }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: m.audio_status === "connected" ? "#BBEE00" : "#555" }} />
                    {m.audio_status === "connected" ? "已连" : "未连"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 听众 */}
          {listeners.length > 0 && (
          <section className="mt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <UserCheck className="h-4 w-4" style={{ color: "#FF33AA" }} />
              听众（{listeners.length}）
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {listeners.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,51,170,0.05)", border: "1px solid rgba(255,51,170,0.1)" }}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#FF33AA,#9933FF)" }}>
                    {m.nickname.charAt(0)}
                  </span>
                  <span className="text-sm text-white">{m.nickname}</span>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* 操作按钮 */}
          {!myRole && (
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={() => handleJoin("musician")} disabled={isFull || joinState !== "idle"}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
              {joinState === "connecting" ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {joinState === "joined" ? <Check className="h-5 w-5" /> : null}
              {isFull ? "合奏名额已满" : joinState !== "idle" ? "处理中..." : "🎸 加入合奏"}
            </button>
            <button onClick={() => handleJoin("listener")} disabled={joinState !== "idle"}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
              🎧 作为听众进入
            </button>
          </div>
          )}
        </div>
      </main>
    </div>
  )
}
