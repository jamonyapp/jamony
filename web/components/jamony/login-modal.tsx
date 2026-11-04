"use client"

import { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

// 1104 短信注册登录(欢哥定稿): 双 tab——默认「账户+密码」(账户=手机号或昵称)+「验证码登录」(注册登录合一);
// 忘记密码=账户 tab 下的子视图(手机号验证码重置); 旧「注册」tab 退役
const PHONE_RE = /^1[3-9]\d{9}$/

type Mode = "account" | "sms" | "forgot"

export function LoginModal() {
  const { showLoginModal, setShowLoginModal, login, loginWithSms, sendSmsCode, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>("account")

  // 账户+密码
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  // 验证码登录 / 忘记密码共用
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [countdown, setCountdown] = useState(0)
  const [codeSending, setCodeSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  if (!showLoginModal) return null

  const reset = () => {
    setAccount("")
    setPassword("")
    setPhone("")
    setCode("")
    setNewPassword("")
    setConfirmPassword("")
    setError("")
    setNotice("")
  }

  const close = () => {
    reset()
    setShowLoginModal(false)
  }

  const switchMode = (m: Mode) => {
    reset()
    setMode(m)
  }

  const handleSendCode = async () => {
    const p = phone.trim()
    if (!PHONE_RE.test(p)) {
      setError("请输入正确的手机号")
      return
    }
    setCodeSending(true)
    setError("")
    setNotice("")
    const err = await sendSmsCode(p, mode === "forgot" ? "reset_password" : "login")
    setCodeSending(false)
    if (err) {
      setError(err)
      return
    }
    setNotice("验证码已发送，5分钟内有效")
    setCountdown(60)
  }

  const handleAccountLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      setError("请输入账户和密码")
      return
    }
    setLoading(true)
    setError("")
    const err = await login(account.trim(), password)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      close()
    }
  }

  const handleSmsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!PHONE_RE.test(phone.trim())) {
      setError("请输入正确的手机号")
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入6位验证码")
      return
    }
    setLoading(true)
    setError("")
    const err = await loginWithSms(phone.trim(), code.trim())
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      close()
    }
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!PHONE_RE.test(phone.trim())) {
      setError("请输入正确的手机号")
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setError("请输入6位验证码")
      return
    }
    if (newPassword.length < 8) {
      setError("新密码至少 8 位")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("两次密码输入不一致")
      return
    }
    setLoading(true)
    setError("")
    const err = await resetPassword(phone.trim(), code.trim(), newPassword)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    const p = phone.trim()
    reset()
    setAccount(p) // 顺手回填账户框, 直接用新密码登录
    setMode("account")
    setNotice("密码已重置，请使用新密码登录")
  }

  const inputCls = "w-full rounded-xl border px-4 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
  const inputStyle = { background: "#141414", borderColor: "#2A2A2A" }
  const labelCls = "mb-1.5 block text-xs font-medium"
  const submitCls = "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
  const submitStyle = { background: "linear-gradient(90deg, #9933FF, #FF33AA)" }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onMouseDown={(e) => { downOnOverlay.current = e.target === e.currentTarget }} onClick={(e) => { if (e.target === e.currentTarget && downOnOverlay.current) close() }}
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
          onClick={close}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Tab 切换: 默认「账户+密码」(1104 欢哥定稿) */}
        <div className="mb-6 flex gap-4 border-b border-[#1A1A1A]">
          <button
            onClick={() => switchMode("account")}
            className={`relative pb-2 text-sm font-semibold transition-colors ${mode !== "sms" ? "text-white" : "text-[#666]"}`}
          >
            账户+密码
            {mode !== "sms" && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full" style={{ background: "#00AAFF" }} />}
          </button>
          <button
            onClick={() => switchMode("sms")}
            className={`relative pb-2 text-sm font-semibold transition-colors ${mode === "sms" ? "text-white" : "text-[#666]"}`}
          >
            验证码登录
            {mode === "sms" && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full" style={{ background: "#00AAFF" }} />}
          </button>
        </div>

        {mode === "sms" ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">验证码登录</h2>
              <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
                输入手机号验证码即可登录
              </p>
            </div>

            <form onSubmit={handleSmsLogin} className="flex flex-col gap-4">
              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  手机号
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="输入手机号"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  验证码
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6位验证码"
                    className={`${inputCls} flex-1`}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    disabled={countdown > 0 || codeSending}
                    onClick={handleSendCode}
                    className="shrink-0 rounded-xl border px-3 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: "#141414", borderColor: "#2A2A2A" }}
                  >
                    {codeSending ? "发送中..." : countdown > 0 ? `${countdown}s后重发` : "获取验证码"}
                  </button>
                </div>
              </div>

              {notice && <p className="text-sm" style={{ color: "#00AAFF" }}>{notice}</p>}
              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

              <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "登录中..." : "登录 / 注册"}
              </button>

              <p className="text-center text-xs" style={{ color: "#8A8A8A" }}>
                未注册的手机号验证通过后将自动注册
              </p>
            </form>
          </>
        ) : mode === "forgot" ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">重置密码</h2>
              <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
                使用注册手机号验证并设置新密码
              </p>
            </div>

            <form onSubmit={handleForgot} className="flex flex-col gap-4">
              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  手机号
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="输入注册时的手机号"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  验证码
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6位验证码"
                    className={`${inputCls} flex-1`}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    disabled={countdown > 0 || codeSending}
                    onClick={handleSendCode}
                    className="shrink-0 rounded-xl border px-3 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: "#141414", borderColor: "#2A2A2A" }}
                  >
                    {codeSending ? "发送中..." : countdown > 0 ? `${countdown}s后重发` : "获取验证码"}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  新密码
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少8位"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  确认新密码
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {notice && <p className="text-sm" style={{ color: "#00AAFF" }}>{notice}</p>}
              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

              <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "重置中..." : "重置密码"}
              </button>

              <button type="button" className="text-center text-xs" style={{ color: "#8A8A8A" }} onClick={() => switchMode("account")}>
                返回登录
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">请登录</h2>
              <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
                登录后即可创建房间、发布公告、参与合奏等
              </p>
            </div>

            <form onSubmit={handleAccountLogin} className="flex flex-col gap-4">
              <div>
                <label className={labelCls} style={{ color: "#9A9A9A" }}>
                  账户
                </label>
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="手机号或昵称"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className={labelCls} style={{ color: "#9A9A9A" }}>
                    密码
                  </label>
                  <button type="button" className="text-xs" style={{ color: "#00AAFF" }} onClick={() => switchMode("forgot")}>
                    忘记密码?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {notice && <p className="text-sm" style={{ color: "#00AAFF" }}>{notice}</p>}
              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}

              <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "登录中..." : "登录"}
              </button>

              <p className="text-center text-xs" style={{ color: "#8A8A8A" }}>
                新用户请切换到「验证码登录」，验证后自动注册
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
