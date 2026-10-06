"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Crown, Headphones, X, UserCheck, User, ShieldAlert } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useRoomSession } from "@/lib/room-session"
import { waitJamsoulDead } from "@/lib/jamsoul-wait"
import { Avatar } from "@/components/jamony/avatar"
import { RoomPasswordModal } from "@/components/room-password-modal"
import { SwitchRoomDialog } from "@/components/switch-room-dialog"

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
  const { session, disconnectRoom } = useRoomSession()
  const [myRole, setMyRole] = useState<"musician" | "listener" | null>(null)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [pwdRole, setPwdRole] = useState<"musician" | "listener">("musician")
  const [kickedNotice, setKickedNotice] = useState(false) // 被房主移出后重新进入的提示

  // 10-06 切换房间：已在他房时加入/建房前确认。switchNext 存确认后要继续的动作
  // （明房=doJoin 走 join API；密码房=finishEnter 直接进——密码验证即已成 membership）
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchBusy, setSwitchBusy] = useState(false)
  const switchNextRef = useRef<null | (() => Promise<void>)>(null)

  useEffect(() => {
    if (!roomId) { setRoom(null); setMembers([]); setMyRole(null); return }
    setMyRole(null)  // 10-07 修：切换房间时重置（防上一房残留导致弹窗误显"你已加入"）
    setLoading(true)
    // 延迟测纯网络（/api/ping 不查 DB）
    const pingStart = Date.now()
    fetch("/api/ping").then(() => setLatency(Date.now() - pingStart)).catch(() => {})
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setRoom(data.room)
          setMembers(data.members || [])
          const me = (data.members || []).find((m: Member) => m.user_id === user?.id)
          setMyRole(me ? me.role : null)  // 不在房里时显式置空（原只在有 me 时更新，残留旧值）
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

  // 实际加入 + 跳转（直接加入 / 切换房间完成后共用）
  const doJoin = async (role: "musician" | "listener") => {
    setJoining(true)
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user!.id, role }),
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
      } else if (data.code === "KICKED") {
        setKickedNotice(true)
      } else {
        // jamony 10-01: 服务端拒绝必须可见（一人一房等）——此前此处静默失败
        alert(data.msg || "加入失败")
      }
    } catch {}
    setJoining(false)
  }

  const handleJoin = async (role: "musician" | "listener") => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!user) return
    // 加密房非成员 → 弹密码框（已成员 myRole!=null 免密直接 join）
    if (room?.is_private && !myRole) {
      setPwdRole(role)
      setPwdOpen(true)
      return
    }
    // 10-06 漫游改造：已在他房 → 切换确认（一人一房，直接 join 会被服务端拒）
    if (session) {
      switchNextRef.current = () => doJoin(role)
      setSwitchOpen(true)
      return
    }
    await doJoin(role)
  }

  // 密码验证通过后的进房收尾（拉最新房态 + 跳转）
  const finishEnter = async () => {
    const r = await fetch(`/api/rooms/${roomId}`)
    const rd = await r.json()
    if (rd.ok) { setRoom(rd.room); setMembers(rd.members || []) }
    onClose()
    router.push(`/room/${roomId}/playing`)
  }

  // 密码验证成功后跳 playing
  const onPasswordSuccess = async (role: "musician" | "listener") => {
    setPwdOpen(false)
    setMyRole(role)
    // 10-06：已在他房 → 切换确认（密码已验过，确认后直接进，不再走 join API）
    if (session) {
      switchNextRef.current = finishEnter
      setSwitchOpen(true)
      return
    }
    await finishEnter()
  }

  // 切换确认：先断原房（leave 需登录 cookie），musician 再等 jamsoul 真正退出
  // （防 main.js already-running skip 竞态——连的还是旧房），然后继续原定动作
  const confirmSwitch = async () => {
    const next = switchNextRef.current
    const wasMusician = session?.role === "musician"
    setSwitchBusy(true)
    try {
      if (wasMusician) {
        disconnectRoom()          // 内部同步 killJamsoul + await leave
        await waitJamsoulDead()
      } else {
        await disconnectRoom()
      }
      setSwitchOpen(false)
      switchNextRef.current = null
      await next?.()
    } finally {
      setSwitchBusy(false)
    }
  }

  // jamony 10-01: 删除卡片上的"切为听众/切为合奏"——身份切换只保留合奏页内通道
  // （断开连接/音频连接，天然绑定本机音频在场）。卡片切换不要求在场，是同账号
  // 多设备翻身份的唯一漏洞入口（欢哥拍板：跨设备进房坚决堵死）

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
                </div>
              ))}
            </div>
          </div>

          {/* 听众 */}
          {listeners.length > 0 && (
          <div className="mt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <UserCheck className="h-4 w-4" style={{ color: "#FF33AA" }} />
              听众 <span className="text-xs font-normal" style={{ color: "#8A8A8A" }}>{listeners.length} 位</span>
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center">
                {listeners.slice(0, 8).map((m, i) => (
                  <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }} className="inline-flex rounded-full ring-2 ring-black">
                    <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={28} />
                  </span>
                ))}
                {listeners.length > 8 && (
                  <span className="ml-1.5 text-xs" style={{ color: "#B0B0B0" }}>+{listeners.length - 8}</span>
                )}
              </div>
            </div>
          </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {!myRole ? (
              <>
                <button onClick={() => handleJoin("musician")} disabled={isFull || joining}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                  style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                  {isFull ? "合奏名额已满" : joining ? "加入中..." : "🎵 加入合奏"}
                </button>
                <button onClick={() => handleJoin("listener")} disabled={joining}
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
                  style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                  🎧 作为听众进入
                </button>
              </>
            ) : myRole === "musician" ? (
              <>
                <div className="text-center text-sm py-2" style={{ color: "#BBEE00" }}>
                  {room?.host_id === user?.id ? "👑 你是房主" : "✅ 你已加入合奏"}
                </div>
                <button onClick={() => { onClose(); router.push(`/room/${roomId}/playing`) }}
                  className="flex w-full items-center justify-center rounded-[10px] px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.97]"
                  style={{ background: "#BBEE00", color: "#0D0D0D" }}>
                  回到房间
                </button>
              </>
            ) : (
              <>
                <div className="text-center text-sm py-2" style={{ color: "#FF33AA" }}>
                  🎧 你正在旁听
                </div>
                <button onClick={() => { onClose(); router.push(`/room/${roomId}/playing`) }}
                  className="flex w-full items-center justify-center rounded-[10px] px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.97]"
                  style={{ background: "#BBEE00", color: "#0D0D0D" }}>
                  回到房间
                </button>
              </>
            )}
          </div>
        </div>
        ) : (
          <div className="py-16 text-center text-sm" style={{ color: "#8A8A8A" }}>房间不存在</div>
        )}
      </div>
      <RoomPasswordModal open={pwdOpen} roomId={roomId} role={pwdRole}
        onClose={() => setPwdOpen(false)} onSuccess={onPasswordSuccess}
        onKicked={() => setKickedNotice(true)} />
      {/* 10-06 切换房间确认（已在他房时加入本房） */}
      <SwitchRoomDialog
        open={switchOpen}
        title="切换房间？"
        desc="加入该房间将断开你的原房间，若你是原房间唯一合奏者，原房间将解散。"
        confirmText="确认切换"
        busy={switchBusy}
        onCancel={() => { setSwitchOpen(false); switchNextRef.current = null }}
        onConfirm={confirmSwitch}
      />
      {kickedNotice && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-[10px] border p-6 text-center"
            style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
            <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,51,170,0.15)" }}>
              <ShieldAlert className="size-6" style={{ color: "#FF33AA" }} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">无法进入该房间</h2>
            <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
              你已被房主移出该房间，无法再次进入，试试别的房间吧。
            </p>
            <button onClick={() => { setKickedNotice(false); onClose() }}
              className="mt-6 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
