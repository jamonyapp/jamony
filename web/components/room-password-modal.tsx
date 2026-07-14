"use client"

import { useState } from "react"
import { X, Loader2, Lock } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

// 加密房间密码输入弹窗
// 非成员点"加入合奏/作为听众"时弹出，收6位数字密码 → POST /api/rooms/:id/join {userId,role,password}
// 成功 onSuccess(role)；401 密码错；429 限频锁
export function RoomPasswordModal({
  open,
  roomId,
  role,
  onClose,
  onSuccess,
  onKicked,
}: {
  open: boolean
  roomId: string | null
  role: "musician" | "listener"
  onClose: () => void
  onSuccess: (role: "musician" | "listener") => void
  onKicked?: () => void
}) {
  const { user } = useAuth()
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open || !roomId) return null

  const handleSubmit = async () => {
    if (!user) { setError("请先登录"); return }
    if (!/^\d{6}$/.test(password)) { setError("请输入6位数字密码"); return }
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role, password }),
      })
      const data = await res.json()
      if (res.status === 429) { setError(data.msg || "尝试过多，请10分钟后再试"); setLoading(false); return }
      if (res.status === 401) { setError("密码错误"); setPassword(""); setLoading(false); return }
      if (!data.ok) {
        // 被房主移出黑名单 → 关闭密码框，交给父组件弹统一提示
        if (data.code === "KICKED") { setPassword(""); setLoading(false); onClose(); onKicked?.(); return }
        setError(data.msg || "加入失败"); setLoading(false); return
      }
      setPassword("")
      setLoading(false)
      onSuccess(role)
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border p-6 shadow-2xl" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,#00AAFF,#9933FF,#FF33AA,#BBEE00)" }} />
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 transition-colors hover:bg-white/5" style={{ color: "#8A8A8A" }} aria-label="关闭">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" style={{ color: "#9933FF" }} />
            <h2 className="text-lg font-bold text-white">加密房间</h2>
          </div>
          <p className="text-sm" style={{ color: "#9A9A9A" }}>
            请输入房主提供的6位数字密码{role === "musician" ? "加入合奏" : "进入收听"}
          </p>
          <input type="password" inputMode="numeric" maxLength={6} value={password}
            autoFocus
            onChange={(e) => { setPassword(e.target.value.replace(/\D/g, "")); setError("") }}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit() }}
            placeholder="••••••"
            className="w-full rounded-[10px] border px-4 py-3 text-center text-2xl tracking-[0.5em] text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
            style={{ background: "#141414", borderColor: error ? "#FF33AA" : "#2A2A2A" }} />
          {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center justify-center gap-2 w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
            style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "验证中..." : "确认加入"}
          </button>
        </div>
      </div>
    </div>
  )
}
