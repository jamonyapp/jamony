"use client"

import { useState } from "react"
import { X, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

const INSTRUMENTS = [
  "原声吉他", "电吉他", "贝斯", "打击乐器", "键盘乐器",
  "主唱", "弦乐", "管乐", "民乐",
  "其他", "听众",
]

// 选择了这些大类后，弹出输入框让用户细化
const INSTRUMENT_NEEDS_INPUT = ["弦乐", "管乐", "民乐", "其他"]

type Mode = "login" | "register"

export function LoginModal() {
  const { showLoginModal, setShowLoginModal, login, register } = useAuth()
  const [mode, setMode] = useState<Mode>("login")

  // 登录态
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  // 注册态
  const [regNickname, setRegNickname] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regConfirm, setRegConfirm] = useState("")
  const [regInstrument, setRegInstrument] = useState("")
  const [regOtherInstrument, setRegOtherInstrument] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!showLoginModal) return null

  const reset = () => {
    setNickname("")
    setPassword("")
    setRegNickname("")
    setRegPassword("")
    setRegConfirm("")
    setRegInstrument("")
    setRegOtherInstrument("")
    setError("")
  }

  const handleLogin = async (e: React.FormEvent) => {
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
      reset()
      setShowLoginModal(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regNickname.trim() || !regPassword || !regConfirm || !regInstrument) {
      setError("请填写所有字段")
      return
    }
    if (regNickname.trim().length < 2 || regNickname.trim().length > 16) {
      setError("昵称需要 2-16 个字符")
      return
    }
    if (regPassword.length < 6) {
      setError("密码至少 6 位")
      return
    }
    if (regPassword !== regConfirm) {
      setError("两次密码输入不一致")
      return
    }
    if (INSTRUMENT_NEEDS_INPUT.includes(regInstrument) && !regOtherInstrument.trim()) {
      setError("请输入你的具体乐器")
      return
    }
    setLoading(true)
    setError("")
    const finalInstrument = INSTRUMENT_NEEDS_INPUT.includes(regInstrument) ? regOtherInstrument.trim() : regInstrument
    const err = await register(regNickname.trim(), regPassword, finalInstrument)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      reset()
      setShowLoginModal(false)
    }
  }

  const switchMode = (m: Mode) => {
    reset()
    setMode(m)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => { reset(); setShowLoginModal(false) }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭 */}
        <button
          aria-label="关闭"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          onClick={() => { reset(); setShowLoginModal(false) }}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Tab 切换 */}
        <div className="mb-6 flex gap-4 border-b border-[#1A1A1A]">
          <button
            onClick={() => switchMode("login")}
            className={`pb-2 text-sm font-semibold transition-colors ${mode === "login" ? "text-white" : "text-[#666]"}`}
          >
            登录
            {mode === "login" && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: "#00AAFF" }} />}
          </button>
          <button
            onClick={() => switchMode("register")}
            className={`relative pb-2 text-sm font-semibold transition-colors ${mode === "register" ? "text-white" : "text-[#666]"}`}
          >
            注册
            {mode === "register" && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full" style={{ background: "#00AAFF" }} />}
          </button>
        </div>

        {mode === "login" ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">请登录</h2>
              <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
                登录后即可创建房间、发布公告、参与合奏等
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
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

              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

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
          </>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">加入 jamony</h2>
              <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
                注册后即可开始你的音乐之旅
              </p>
            </div>

            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>
                  用户名
                </label>
                <input
                  type="text"
                  value={regNickname}
                  onChange={(e) => setRegNickname(e.target.value)}
                  placeholder="给自己取个名字"
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
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
                  style={{ background: "#141414", borderColor: "#2A2A2A" }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>
                  确认密码
                </label>
                <input
                  type="password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  placeholder="再次输入密码"
                  className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
                  style={{ background: "#141414", borderColor: "#2A2A2A" }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium" style={{ color: "#9A9A9A" }}>
                  主力乐器
                </label>
                <select
                  value={regInstrument}
                  onChange={(e) => { setRegInstrument(e.target.value); setRegOtherInstrument("") }}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#9933FF]"
                  style={{ background: "#141414", borderColor: "#2A2A2A" }}
                >
                  <option value="" disabled className="bg-[#141414] text-[#666]">选择你的乐器</option>
                  {INSTRUMENTS.map((ins) => (
                    <option key={ins} value={ins} className="bg-[#141414] text-white">{ins}</option>
                  ))}
                </select>
                {INSTRUMENT_NEEDS_INPUT.includes(regInstrument) && (
                  <input
                    type="text"
                    value={regOtherInstrument}
                    onChange={(e) => setRegOtherInstrument(e.target.value)}
                    placeholder={regInstrument === "其他" ? "请输入你的乐器" : regInstrument === "弦乐" ? "例如：小提琴、大提琴..." : regInstrument === "管乐" ? "例如：萨克斯、小号、电吹管" : "例如：古筝、二胡、琵琶..."}
                    autoFocus
                    className="mt-2 w-full rounded-xl border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
                    style={{ background: "#141414", borderColor: "#2A2A2A" }}
                  />
                )}
              </div>

              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
                style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "注册中..." : "注册"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
