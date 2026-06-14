"use client"

import { useState } from "react"
import { Send, Info, Users } from "lucide-react"
import { ROOM, MEMBERS, CHAT_MESSAGES, type ChatMessage } from "@/lib/jam-data"

export function RightColumn() {
  return (
    <aside className="flex h-full flex-col gap-4 overflow-hidden p-4">
      {/* 房间信息卡片 */}
      <section className="rounded-[10px] border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-brand-blue" />
          房间信息
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-lg">{ROOM.styleEmoji}</span>
          <span className="font-semibold">{ROOM.name}</span>
          <span className="rounded-[8px] bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {ROOM.styleTag}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{ROOM.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          创建者 <span className="text-foreground">{ROOM.creator}</span> · {ROOM.createdAt}
        </p>
      </section>

      {/* 成员列表 */}
      <section className="rounded-[10px] border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-brand-green" />
          成员 ({MEMBERS.length})
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {MEMBERS.map((m) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className="relative">
                <span
                  className="grid size-9 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.name.slice(0, 1)}
                </span>
                {m.online && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-brand-green" />
                )}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.name}</span>
                {m.isSelf && (
                  <span className="rounded-[6px] bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-purple">
                    我
                  </span>
                )}
              </span>
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <span>{m.instrumentEmoji}</span>
                {m.instrument}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 聊天 */}
      <ChatPanel />
    </aside>
  )
}

function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(CHAT_MESSAGES)
  const [draft, setDraft] = useState("")

  function send() {
    const text = draft.trim()
    if (!text) return
    setMessages((m) => [
      ...m,
      {
        id: `c${Date.now()}`,
        author: "你",
        content: text,
        time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }),
        isSelf: true,
      },
    ])
    setDraft("")
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[10px] border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        💬 聊天
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">由 jamony 提供</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto scrollbar-thin px-4 py-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isSelf ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{msg.author}</span>
              <span>{msg.time}</span>
            </div>
            <div
              className={`mt-1 max-w-[85%] rounded-[10px] px-3 py-2 text-sm ${
                msg.isSelf ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="发条消息…"
          className="min-w-0 flex-1 rounded-[10px] bg-secondary px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={send}
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Send className="size-4" />
        </button>
      </div>
    </section>
  )
}
