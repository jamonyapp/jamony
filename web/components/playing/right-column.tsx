"use client"

import { useState } from "react"
import { Send, Users, Signal } from "lucide-react"
import { ROOM, MEMBERS, CHAT_MESSAGES, type ChatMessage } from "@/lib/jam-data"

// jamulus 标准延迟颜色标注
function latencyColor(ms: number): string {
  if (ms < 30) return "#BBEE00"   // 绿 — 优秀
  if (ms < 60) return "#FFCC00"   // 黄 — 良好
  return "#FF33AA"                // 红 — 较差
}

export function RightColumn() {
  return (
    <aside className="flex h-full flex-col gap-3 overflow-hidden p-3">
      {/* 房间信息卡片 */}
      <section className="shrink-0 rounded-[10px] border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-lg leading-none pt-0.5">{ROOM.styleEmoji}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
              <span className="text-sm font-semibold">{ROOM.name}</span>
              <span className="rounded-[6px] bg-secondary px-1.5 py-[1px] text-[10px] text-muted-foreground">
                {ROOM.styleTag}
              </span>
              <span
                className="ml-auto text-xs font-semibold tabular-nums"
                style={{ color: latencyColor(ROOM.latencyMs) }}
              >
                <Signal className="inline size-3 -mt-0.5 mr-0.5" />
                {ROOM.latencyMs}ms
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{ROOM.description}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              创建者 <span className="text-foreground">{ROOM.creator}</span> · {ROOM.createdAt}
            </p>
          </div>
        </div>
      </section>

      {/* 成员列表 */}
      <section className="shrink-0 rounded-[10px] border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Users className="size-3.5 text-brand-green" />
          成员 {MEMBERS.length}
          <span className="font-normal text-muted-foreground/60">· {ROOM.online}/{ROOM.capacity} 在线</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {MEMBERS.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5">
              <span className="relative inline-flex">
                <span
                  className="grid size-6 place-items-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.name.slice(0, 1)}
                </span>
                {m.online && (
                  <span className="absolute -bottom-[1px] -right-[1px] size-2 rounded-full border border-card bg-brand-green" />
                )}
              </span>
              <span className="text-xs text-foreground">{m.name}</span>
              {m.isSelf && (
                <span className="rounded-[4px] bg-primary/20 px-1 text-[9px] font-semibold text-brand-purple">
                  我
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 聊天 — 撑满剩余空间 */}
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
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
        💬 聊天
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin px-3 py-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isSelf ? "items-end" : "items-start"}`}>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{msg.author}</span>
              <span>{msg.time}</span>
            </div>
            <div
              className={`mt-0.5 max-w-[90%] rounded-[8px] px-2.5 py-1.5 text-sm ${
                msg.isSelf ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-t border-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="发条消息…"
          className="min-w-0 flex-1 rounded-[8px] bg-secondary px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={send}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-primary text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </section>
  )
}
