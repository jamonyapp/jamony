"use client"

import { useEffect, useRef, useState } from "react"
import { Send, Users, Signal, Crown, Headphones, UserCheck } from "lucide-react"
import { useChatSocket } from "@/lib/chat-socket"
import { useAuth } from "@/lib/auth-context"

type Member = {
  id: number
  user_id: number
  nickname: string
  role: "musician" | "listener"
  audio_status: string
  joined_at: string
}

type RoomInfo = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
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

export function RightColumn({ roomId, room }: { roomId?: string; room: RoomInfo | null }) {
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setMembers(data.members || [])
      })
      .catch(() => {})
  }, [roomId])

  const musicians = members.filter(m => m.role === "musician")
  const listeners = members.filter(m => m.role === "listener")

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
            <p className="mt-1.5 text-[11px]" style={{ color: "#8A8A8A" }}>
              房主 <span className="text-white">{room.host_name}</span>
            </p>
          </div>
        </div>
      </section>
      )}

      {/* 成员列表 */}
      <section className="shrink-0 rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#8A8A8A" }}>
          <Users className="h-3.5 w-3.5" style={{ color: "#BBEE00" }} />
          成员 {members.length}
        </div>

        {musicians.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium mb-1" style={{ color: "#00AAFF" }}>
            <Headphones className="h-3 w-3 inline mr-0.5" />合奏者 {musicians.length}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {musicians.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className="relative inline-flex">
                  <span className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: m.user_id === room?.host_id ? "linear-gradient(135deg, #9933FF, #FF33AA)" : "#00AAFF" }}>
                    {m.nickname.charAt(0)}
                  </span>
                  {m.audio_status === "connected" && (
                    <span className="absolute -bottom-[1px] -right-[1px] h-2 w-2 rounded-full border" style={{ background: "#BBEE00", borderColor: "#0D0D0D" }} />
                  )}
                </span>
                <span className="text-xs text-white">{m.nickname}</span>
                {m.user_id === room?.host_id && (
                  <Crown className="h-3 w-3" style={{ color: "#ffb84d" }} />
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {listeners.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-medium mb-1" style={{ color: "#FF33AA" }}>
            <UserCheck className="h-3 w-3 inline mr-0.5" />听众 {listeners.length}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {listeners.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white"
                  style={{ background: "#FF33AA" }}>
                  {m.nickname.charAt(0)}
                </span>
                <span className="text-xs" style={{ color: "#B0B0B0" }}>{m.nickname}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {members.length === 0 && (
          <p className="mt-2 text-xs" style={{ color: "#8A8A8A" }}>暂无成员</p>
        )}
      </section>

      {/* 聊天 — 占位 */}
      <ChatPanel roomId={roomId} />
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
          <div key={msg.id} className={`flex flex-col ${msg.isSelf ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#8A8A8A" }}>
              <span>{msg.author}</span><span>{msg.time}</span>
            </div>
            <div className={`mt-0.5 max-w-[90%] rounded-[8px] px-2.5 py-1.5 text-sm ${msg.isSelf ? "text-white" : "text-white"}`}
              style={msg.isSelf ? { background: "#9933FF" } : { background: "rgba(255,255,255,0.08)" }}>
              {msg.content}
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
