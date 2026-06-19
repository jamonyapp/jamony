"use client"

import { useState } from "react"
import { X, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

const STYLES = ["摇滚","民谣","爵士","布鲁斯","放克","雷鬼","电子","古典","流行","嘻哈","R&B","国风","金属","ACG","实验"]

export function CreateRoomModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [style, setStyle] = useState("摇滚")
  const [maxMusicians, setMaxMusicians] = useState(6)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open) return null

  const handleCreate = async () => {
    if (!name.trim()) { setError("请输入房间名"); return }
    if (!user) { setError("请先登录"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          style,
          hostId: user.id,
          maxMusicians,
        }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "创建失败"); setLoading(false); return }
      setLoading(false)
      onClose()
      router.push(`/room/${data.room.id}/playing`)
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,#00AAFF,#9933FF,#FF33AA,#BBEE00)" }} />
        <button onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 transition-colors hover:bg-white/5"
          style={{ color: "#8A8A8A" }} aria-label="关闭">
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col gap-5 py-4">
          <h2 className="text-xl font-bold text-white">创建合奏房间</h2>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>房间名称 *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="给你的房间取个名字"
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#141414", borderColor: "#2A2A2A" }} />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>房间描述</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="简单介绍一下你的房间..."
              rows={2}
              className="w-full rounded-[10px] border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF] resize-none"
              style={{ background: "#141414", borderColor: "#2A2A2A" }} />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>风格</label>
              <div className="relative">
                <select value={style} onChange={(e) => setStyle(e.target.value)}
                  className="w-full rounded-[10px] border px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#9933FF] appearance-none"
                  style={{ background: "#141414", borderColor: "#2A2A2A" }}>
                  {STYLES.map((s) => (<option key={s} value={s} className="bg-[#141414] text-white">{s}</option>))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#8A8A8A" }} />
              </div>
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>合奏人数</label>
              <select value={maxMusicians} onChange={(e) => setMaxMusicians(Number(e.target.value))}
                className="w-full rounded-[10px] border px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#9933FF] appearance-none"
                style={{ background: "#141414", borderColor: "#2A2A2A" }}>
                {[2,3,4,5,6,7,8].map((n) => (<option key={n} value={n} className="bg-[#141414] text-white">{n} 人</option>))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

          <button onClick={handleCreate} disabled={loading}
            className="flex items-center justify-center gap-2 w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "创建中..." : "创建房间"}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChevronDown({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
