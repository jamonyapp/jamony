"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Crown, Headphones, X, UserCheck, User } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Avatar } from "@/components/jamony/avatar"
import { RoomPasswordModal } from "@/components/room-password-modal"

type Member = {
  id: number
  user_id: number
  nickname: string
  avatar_url?: string
  role: "musician" | "listener"
  audio_status: string
  joined_at: string
}

type RoomDetail = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  host_avatar_url?: string
  is_private: boolean
  max_musicians: number
  musician_count: number
  listener_count: number
  total_members: number
  server_port: number
  status: string
  created_at: string
}

export function RoomDetailModal({
  roomId,
  onClose,
}: {
  roomId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [room, setRoom] = useState<RoomDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [joining, setJoining] = useState(false)
  const [latency, setLatency] = useState(28)
  const { user, loggedIn, setShowLoginModal } = useAuth()
  const [myRole, setMyRole] = useState<"musician" | "listener" | null>(null)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdRole, setPwdRole] = useState<"musician" | "listener">("musician")

  useEffect(() => {
    if (!roomId) { setRoom(null); setMembers([]); return }
    setLoading(true)
    const start = Date.now()
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        setLatency(Date.now() - start)
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

  useEffect(() => {
    if (roomId) { document.body.style.overflow = "hidden" }
    else { document.body.style.overflow = "" }
    return () => { document.body.style.overflow = "" }
  }, [roomId])

  if (!roomId) return null

  const handleJoin = async (role: "musician" | "listener") => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!user) return
    // 加密房非成员 → 弹密码框（已成员 myRole!=null 免密直接 join）
    if (room?.is_private && !myRole) {
      setPwdRole(role)
      setPwdOpen(true)
      return
    }
    setJoining(true)
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role }),
      })
      const data = await res.json()
      if (data.ok) {
        setMyRole(role)
        // Refresh members
        const r = await fetch(`/api/rooms/${roomId}`)
        const rd = await r.json()
        if (rd.ok) { setRoom(rd.room); setMembers(rd.members || []) }

        onClose()
        router.push(`/room/${roomId}/playing`)
      }
    } catch {}
    setJoining(false)
  }

  // 密码验证成功后跳 playing
  const onPasswordSuccess = async (role: "musician" | "listener") => {
    setPwdOpen(false)
    setMyRole(role)
    const r = await fetch(`/api/rooms/${roomId}`)
    const rd = await r.json()
    if (rd.ok) { setRoom(rd.room); setMembers(rd.members || []) }
    onClose()
    router.push(`/room/${roomId}/playing`)
  }

  const handleRoleSwitch = async (newRole: "musician" | "listener") => {
    if (!user) return
    await fetch(`/api/rooms/${roomId}/switch-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, newRole }),
    })
    setMyRole(newRole)
    const r = await fetch(`/api/rooms/${roomId}`)
    const rd = await r.json()
    if (rd.ok) { setRoom(rd.room); setMembers(rd.members || []) }
  }

  const musicians = members.filter(m => m.role === "musician")
  const listeners = members.filter(m => m.role === "listener")
  const isFull = musicians.length >= (room?.max_musicians || 8)
  const musicianSlots = (room?.max_musicians || 8) - musicians.length

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto p-4 pt-16"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div className="jamony-modal-enter relative w-full max-w-lg overflow-hidden rounded-2xl border"
        style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}>

        <button onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10" aria-label="关闭">
          <X className="h-5 w-5" />
        </button>

        <div className="h-1" style={{ background: "linear-gradient(90deg,#00AAFF,#9933FF,#FF33AA,#BBEE00)" }} />

        {loading ? (
          <div className="flex items-center justify-center py-16"><p className="text-sm" style={{ color: "#8A8A8A" }}>加载中...</p></div>
        ) : room ? (
        <div className="p-5">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            {room.name}
          </h2>

          <div className="mt-4 flex items-center gap-3">
            <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.12)" }}>
              {room.style || "通用"}
            </span>
            <span className="flex items-center gap-3 text-xs" style={{ color: "#8A8A8A" }}>
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" style={{ color: "#9933FF" }} />{room.musician_count}/{room.max_musicians}</span>
              <span className="flex items-center gap-1"><Headphones className="h-3.5 w-3.5" style={{ color: "#FF33AA" }} />{room.listener_count}</span>
              <span>延迟 ≈ {latency}ms</span>
            </span>
          </div>

          {room.description && <p className="mt-3 text-sm leading-relaxed" style={{ color: "#8A8A8A" }}>{room.description}</p>}

          <div className="my-5 flex items-center gap-3 rounded-[10px] border p-3" style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
            <Avatar nickname={room.host_name} avatarUrl={room.host_avatar_url} size={40} className="shrink-0" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white">{room.host_name}</span>
                <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                  <Crown className="h-2.5 w-2.5" />房主
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: "#8A8A8A" }}>
                {room.created_at?.slice(0, 10)}
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: "#1A1A1A" }} />

          {/* 合奏者 */}
          <div className="mt-5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <Headphones className="h-4 w-4" style={{ color: "#00AAFF" }} />
              合奏者
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {musicians.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "rgba(0,170,255,0.05)", border: "1px solid rgba(0,170,255,0.1)" }}>
                  <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={32} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{m.nickname}</span>
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: m.audio_status === "connected" ? "#BBEE00" : "#8A8A8A" }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.audio_status === "connected" ? "#BBEE00" : "#555" }} />
                    {m.audio_status === "connected" ? "已连" : "未连"}
                  </span>
                  {m.user_id === room.host_id && (
                    <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color: "#ffb84d", backgroundColor: "rgba(255,184,77,0.12)" }}>
                      <Crown className="h-2.5 w-2.5" />房主
                    </span>
                  )}
                  {m.user_id === user?.id && (
                    <button onClick={() => handleRoleSwitch("listener")}
                      className="rounded-md border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/5"
                      style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}>
                      切为听众
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 听众 */}
          {listeners.length > 0 && (
          <div className="mt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <UserCheck className="h-4 w-4" style={{ color: "#FF33AA" }} />
              听众
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {listeners.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,51,170,0.05)", border: "1px solid rgba(255,51,170,0.1)" }}>
                  <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={28} className="shrink-0" />
                  <span className="text-sm text-white">{m.nickname}</span>
                  {m.user_id === user?.id && (
                    <button onClick={() => handleRoleSwitch("musician")}
                      className="rounded-md border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/5"
                      style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}>
                      合奏
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {!myRole ? (
              <>
                <button onClick={() => handleJoin("musician")} disabled={isFull || joining}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                  style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                  {isFull ? "合奏名额已满" : joining ? "加入中..." : "🎸 加入合奏"}
                </button>
                <button onClick={() => handleJoin("listener")} disabled={joining}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                  🎧 作为听众进入
                </button>
              </>
            ) : myRole === "musician" ? (
              <div className="text-center text-sm py-2" style={{ color: "#BBEE00" }}>
                {room?.host_id === user?.id ? "👑 你是房主" : "✅ 你已加入合奏"}
              </div>
            ) : (
              <div className="text-center text-sm py-2" style={{ color: "#FF33AA" }}>
                🎧 你正在旁听
              </div>
            )}
          </div>
        </div>
        ) : (
          <div className="py-16 text-center text-sm" style={{ color: "#8A8A8A" }}>房间不存在</div>
        )}
      </div>
      <RoomPasswordModal open={pwdOpen} roomId={roomId} role={pwdRole}
        onClose={() => setPwdOpen(false)} onSuccess={onPasswordSuccess} />
    </div>
  )
}
