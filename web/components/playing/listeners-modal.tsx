"use client"

import { useState } from "react"
import { X, Search, UserX } from "lucide-react"
import { Avatar } from "@/components/jamony/avatar"

type Listener = {
  user_id: number
  nickname: string
  avatar_url?: string
}

// 听众列表弹窗：所有人可「查看听众」（搜索只读），房主可「管理听众」（搜索+踢人）
// 踢人时先关本弹窗再触发 onKick，避免 KickConfirmDialog(z-50) 被本弹窗(z-80)遮挡
export function ListenersModal({
  open,
  listeners,
  isHost,
  onClose,
  onKick,
}: {
  open: boolean
  listeners: Listener[]
  isHost: boolean
  onClose: () => void
  onKick?: (m: { user_id: number; nickname: string }) => void
}) {
  const [query, setQuery] = useState("")
  if (!open) return null

  const q = query.trim().toLowerCase()
  const filtered = q ? listeners.filter(m => m.nickname.toLowerCase().includes(q)) : listeners

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,#00AAFF,#9933FF,#FF33AA,#BBEE00)" }} />
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-lg p-1 transition-colors hover:bg-white/5" style={{ color: "#8A8A8A" }} aria-label="关闭">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-3 px-5 pb-5 pt-6">
          <h2 className="text-lg font-bold text-white">
            {isHost ? "管理听众" : "查看听众"}
            <span className="ml-2 text-sm font-normal" style={{ color: "#8A8A8A" }}>{listeners.length} 位</span>
          </h2>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#666" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索听众"
              className="w-full rounded-[10px] border px-4 py-2.5 pl-10 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#0D0D0D", borderColor: "#2A2A2A" }} />
          </div>

          <div className="max-h-[50vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm" style={{ color: "#666" }}>
                {listeners.length === 0 ? "暂无听众" : "未找到听众"}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filtered.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "rgba(255,51,170,0.05)" }}>
                    <Avatar nickname={m.nickname} avatarUrl={m.avatar_url} size={28} className="shrink-0" />
                    <span className="flex-1 truncate text-sm text-white">{m.nickname}</span>
                    {isHost && (
                      <button onClick={() => { onClose(); onKick?.(m) }} title="移出房间"
                        className="transition-colors" style={{ color: "#5A5A5A" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#FF5C5C")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#5A5A5A")}>
                        <UserX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
