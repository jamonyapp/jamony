"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Users, Signal, Crown, Headphones, UserCheck, UserX } from "lucide-react"
import { useChatSocket } from "@/lib/chat-socket"
import { useAuth } from "@/lib/auth-context"
import { Avatar } from "@/components/jamony/avatar"
import { ListenersModal } from "@/components/playing/listeners-modal"

type Member = {
  id: number
  user_id: number
  nickname: string
  role: "musician" | "listener"
  audio_status: string
  joined_at: string
  instrument_category?: string
  avatar_url?: string
}

type RoomInfo = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  host_avatar_url?: string
  server_port: number
  musician_count: number
  listener_count: number
  max_musicians: number
}

function latencyColor(ms: number): string {
  if (ms < 30) return "#BBEE00"
  if (ms < 60) return "#FFCC00"
  return "#FF33AA"
}

export function RightColumn({ roomId, room, refreshTrigger, realtimeMembers, currentUserId, hostId, onKick }: { roomId?: string; room: RoomInfo | null; refreshTrigger?: number; realtimeMembers?: Member[]; currentUserId?: number; hostId?: number; onKick?: (target: Member) => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [listenersModalOpen, setListenersModalOpen] = useState(false)

  useEffect(() => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setMembers(data.members || [])
      })
      .catch(() => {})
  }, [roomId, refreshTrigger])

  // 优先用 socket 实时推送的成员列表（身份/音频状态变化即时同步），未推送时回退到 HTTP 拉取
  const displayMembers = realtimeMembers && realtimeMembers.length > 0 ? realtimeMembers : members
  const musicians = displayMembers.filter(m => m.role === "musician")
  const listeners = displayMembers.filter(m => m.role === "listener")
  // hostId 实时跟随 broadcastMembers（房主转移后皇冠/管理权/房主行立即更新）
  const isHost = !!currentUserId && hostId === currentUserId
  const hostMember = hostId != null ? displayMembers.find(m => m.user_id === hostId) : undefined
  const hostName = hostMember?.nickname || room?.host_name || ""
  const hostAvatar = hostMember?.avatar_url || room?.host_avatar_url
  // 房主可见踢人按钮（不能踢自己）
  const canKick = (m: Member) => isHost && m.user_id !== currentUserId
  const KickBtn = ({ m }: { m: Member }) => (
    <button
      onClick={() => onKick?.(m)}
      title="移出房间"
      className="ml-0.5 transition-colors"
      style={{ color: "#5A5A5A" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#FF5C5C")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#5A5A5A")}
    >
      <UserX className="h-3 w-3" />
    </button>
  )

  return (
    <aside className="flex h-full flex-col gap-3 overflow-hidden p-3" style={{ background: "#000" }}>
      {/* 房间信息卡片 */}
      {room && (
      <section className="shrink-0 rounded-[10px] border p-4" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-white">{room.name}</span>
              <span className="rounded-[6px] px-1.5 py-[1px] text-[10px]" style={{ background: "rgba(255,255,255,0.06)", color: "#8A8A8A" }}>
                {room.style || "通用"}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>{room.description}</p>
            <p className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: "#8A8A8A" }}>
              房主 <Avatar nickname={hostName} avatarUrl={hostAvatar} size={16} /> <span className="text-white">{hostName}</span>
            </p>
          </div>
        </div>
      </section>
      )}

      {/* 成员列表 */}
      <section className="shrink-0 rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#8A8A8A" }}>
          <Users className="h-3.5 w-3.5" style={{ color: "#BBEE00" }} />
          房间总人数 {displayMembers.length}
        </div>

        {musicians.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium mb-1" style={{ color: "#00AAFF" }}>
            <Headphones className="h-3 w-3 inline mr-0.5" />合奏者 {musicians.length}
          </p>
          <div className="overflow-y-auto" style={{ maxHeight: "120px" }}>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {musicians.map((m) => {
              const iconMap: Record<string, string> = {
                "原声吉他": "🎸", "电吉他": "🎸", "贝斯": "🎸",
                "打击乐器": "🥁", "键盘乐器": "🎹", "主唱": "🎤",
                "弦乐": "🎻", "管乐": "🎷", "民乐": "🪕", "其他": "🎵", "听众": "🎧",
              }
              const icon = iconMap[m.instrument_category || ""] || "🎵"
              return (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className="relative inline-flex">
                  <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={24} />
                  {m.audio_status === "connected" && (
                    <span className="absolute -bottom-[1px] -right-[1px] h-2 w-2 rounded-full border" style={{ background: "#BBEE00", borderColor: "#0D0D0D" }} />
                  )}
                </span>
                <span className="text-xs text-white">{m.nickname}</span>
                <span className="text-xs">{icon}</span>
                {m.user_id === hostId && (
                  <Crown className="h-3 w-3" style={{ color: "#ffb84d" }} />
                )}
                {canKick(m) && <KickBtn m={m} />}
              </div>
            )})}
          </div>
          </div>
        </div>
        )}

        {listeners.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium mb-1" style={{ color: "#FF33AA" }}>
            <UserCheck className="h-3 w-3 inline mr-0.5" />听众 {listeners.length}
          </p>
          {listeners.length < 6 ? (
          <div className="overflow-y-auto" style={{ maxHeight: "80px" }}>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {listeners.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={20} />
                <span className="text-xs" style={{ color: "#B0B0B0" }}>{m.nickname}</span>
                {canKick(m) && <KickBtn m={m} />}
              </div>
            ))}
          </div>
          </div>
          ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {listeners.slice(0, 8).map((m, i) => (
                <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }} className="inline-flex rounded-full ring-2 ring-black">
                  <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={24} />
                </span>
              ))}
              {listeners.length > 8 && (
                <span className="ml-1.5 text-[10px]" style={{ color: "#B0B0B0" }}>+{listeners.length - 8}</span>
              )}
            </div>
            <button onClick={() => setListenersModalOpen(true)}
              className="shrink-0 rounded-[6px] border px-2 py-0.5 text-[10px] transition-colors hover:bg-white/5"
              style={{ borderColor: "#2A2A2A", color: isHost ? "#FF33AA" : "#B0B0B0" }}>
              {isHost ? "管理听众" : "查看听众"}
            </button>
          </div>
          )}
        </div>
        )}

        {displayMembers.length === 0 && (
          <p className="mt-2 text-xs" style={{ color: "#8A8A8A" }}>暂无成员</p>
        )}
      </section>

      {/* 聊天 — 占位 */}
      <ChatPanel roomId={roomId} />

      <ListenersModal
        open={listenersModalOpen}
        listeners={listeners}
        isHost={isHost}
        onClose={() => setListenersModalOpen(false)}
        onKick={onKick}
      />
    </aside>
  )
}

function ChatPanel({ roomId }: { roomId?: string }) {
  const { user } = useAuth()
  const { messages, sendMessage, connected } = useChatSocket(roomId, user?.nickname)
  const [draft, setDraft] = useState("")

  function send() {
    const text = draft.trim()
    if (!text) return
    sendMessage(text)
    setDraft("")
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[10px] border" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold" style={{ borderColor: "#1A1A1A", color: "#8A8A8A" }}>
        💬 聊天
        <span className="ml-auto text-[10px] font-normal" style={{ color: connected ? "#BBEE00" : "#FF5C5C" }}>
          {connected ? "● 已连接" : "○ 未连接"}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 scrollbar-thin">
        {messages.length === 0 && (
          <p className="text-center text-xs" style={{ color: "#666" }}>{'暂无消息'}</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-1.5 ${msg.isSelf ? "flex-row-reverse" : "flex-row"}`}>
            <Avatar nickname={msg.author} avatarUrl={msg.avatarUrl} size={20} className="mt-3 shrink-0" />
            <div className={`flex flex-col ${msg.isSelf ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#8A8A8A" }}>
                <span>{msg.author}</span><span>{msg.time}</span>
              </div>
              <div className={`mt-0.5 max-w-[90%] rounded-[8px] px-2.5 py-1.5 text-sm ${msg.isSelf ? "text-white" : "text-white"}`}
                style={msg.isSelf ? { background: "#9933FF" } : { background: "rgba(255,255,255,0.08)" }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-t p-2" style={{ borderColor: "#1A1A1A" }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send() }}
          placeholder={"发条消息…"}
          className="min-w-0 flex-1 rounded-[8px] px-2.5 py-1.5 text-xs outline-none" style={{ background: "#141414", color: "#FFF" }}
        />
        <button onClick={send}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-white transition-opacity hover:opacity-90"
          style={{ background: "#9933FF" }}>
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}
