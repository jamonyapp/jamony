"use client"

import { useState } from "react"
import { X, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function LoginModal() {
  const { showLoginModal, setShowLoginModal, login } = useAuth()
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!showLoginModal) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nickname.trim() || !password.trim()) {
      setError("请输入用户名和密码")
      return
    }
    setLoading(true)
    setError("")
    const err = await login(nickname.trim(), password)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      setNickname("")
      setPassword("")
      setShowLoginModal(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => setShowLoginModal(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭 */}
        <button
          aria-label="关闭"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          onClick={() => setShowLoginModal(false)}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">登录 jamony</h2>
          <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
            登录后即可创建房间、发布公告、参与合奏
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>
              用户名
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="输入用户名"
              className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#141414", borderColor: "#2A2A2A" }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#141414", borderColor: "#2A2A2A" }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  )
}
