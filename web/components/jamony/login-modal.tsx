"use client"

import { useState, useEffect } from "react"
import { X, Loader2, Check } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

// 1104 短信注册登录(欢哥定稿): 双 tab——默认「账户+密码」(账户=手机号或昵称)+「验证码登录」(注册登录合一);
// 忘记密码=账户 tab 下的子视图(手机号验证码重置); 旧「注册」tab 退役
const PHONE_RE = /^1[3-9]\d{9}$/

// 1104批次2步骤三: 协议正文 markdown 轻渲染(剥标题井号+加粗星号, 协议纯文本结构够用)
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

// 协议勾选行(两 tab 共用)——必选: 一个勾+两个链接(用户协议+隐私政策, 行业惯例), 勾选即随登录带两版本落档
function AgreementCheck({ agreed, onToggle, onOpen }: { agreed: boolean; onToggle: () => void; onOpen: (doc: "user" | "privacy") => void }) {
  const link = "font-medium underline-offset-2 hover:underline"
  return (
    <div className="flex items-start gap-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={agreed}
        onClick={onToggle}
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
        style={{ borderColor: agreed ? "#9933FF" : "#3A3A3A", background: agreed ? "#9933FF" : "transparent" }}
      >
        {agreed && <Check className="h-3 w-3 text-white" />}
      </button>
      <span className="text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
        <span className="block">我已阅读并同意:</span>
        <span className="block">
          <button type="button" className={link} style={{ color: "#00AAFF" }} onClick={() => onOpen("user")}>
            《jamony用户协议》
          </button>
          和
          <button type="button" className={link} style={{ color: "#00AAFF" }} onClick={() => onOpen("privacy")}>
            《jamony隐私政策》
          </button>
        </span>
      </span>
    </div>
  )
}

type Mode = "account" | "sms" | "forgot"

// 1109 强登录: embedded=true = /login 整页模式(不随 showLoginModal 门控/无遮罩/无关闭钮, 成功跳 "/"); 默认 = 全局弹窗模式(原行为不变)
export function LoginModal({ embedded = false }: { embedded?: boolean }) {
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

  // 1104批次2步骤三(+补·隐私政策并轨): 一勾两文档; 打开弹窗拉取双份; 登录失败刷新=应对 admin 刚发新版
  const [agreed, setAgreed] = useState(false)
  const [showDoc, setShowDoc] = useState<"user" | "privacy" | null>(null)
  const [userDoc, setUserDoc] = useState<{ version: string; content: string } | null>(null)
  const [privacyDoc, setPrivacyDoc] = useState<{ version: string; content: string } | null>(null)

  const fetchAgreements = async () => {
    try {
      const r = await fetch("/api/agreements")
      const d = await r.json()
      if (d.ok) {
        if (d.userAgreement) setUserDoc({ version: d.userAgreement.version, content: d.userAgreement.content })
        if (d.privacy) setPrivacyDoc({ version: d.privacy.version, content: d.privacy.content })
      }
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (showLoginModal && !userDoc) fetchAgreements()
  }, [showLoginModal, userDoc])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  if (!embedded && !showLoginModal) return null

  const reset = () => {
    setAccount("")
    setPassword("")
    setPhone("")
    setCode("")
    setNewPassword("")
    setConfirmPassword("")
    setError("")
    setNotice("")
    setAgreed(false) // 协议确认=每次登录独立确认, 切 tab/重开弹窗重新勾
  }

  const close = () => {
    reset()
    setShowLoginModal(false)
  }

  // embedded 整页模式: 登录成功整页跳首页(与 logout 会话边界同款——清全部 Provider/Query 状态, 杜绝半登录态)
  const finish = () => {
    if (embedded) { window.location.href = "/"; return }
    close()
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
    if (!agreed) {
      setError("请先勾选同意《jamony用户协议》和《jamony隐私政策》")
      return
    }
    setLoading(true)
    setError("")
    const err = await login(account.trim(), password, { agreementVersion: userDoc?.version, privacyVersion: privacyDoc?.version })
    setLoading(false)
    if (err) {
      setError(err)
      fetchAgreements()
    } else {
      finish()
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
    if (!agreed) {
      setError("请先勾选同意《jamony用户协议》和《jamony隐私政策》")
      return
    }
    setLoading(true)
    setError("")
    const err = await loginWithSms(phone.trim(), code.trim(), { agreementVersion: userDoc?.version, privacyVersion: privacyDoc?.version })
    setLoading(false)
    if (err) {
      setError(err)
      fetchAgreements()
    } else {
      finish()
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
      className={embedded ? "w-full max-w-sm" : "fixed inset-0 z-[70] flex items-center justify-center p-4"}
      style={embedded ? undefined : { background: "rgba(0,0,0,0.6)" }}
      onMouseDown={embedded ? undefined : (e) => { downOnOverlay.current = e.target === e.currentTarget }} onClick={embedded ? undefined : (e) => { if (e.target === e.currentTarget && downOnOverlay.current) close() }}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl"
        style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭(embedded 整页模式无此钮——门外没有退路正是设计) */}
        {!embedded && (
        <button
          aria-label="关闭"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          onClick={close}
        >
          <X className="h-5 w-5" />
        </button>
        )}

        {/* Tab 切换: 默认「账户+密码」(1104 欢哥定稿); 协议全文视图时隐藏 */}
        {!showDoc && (
        <div className="mb-6 flex gap-4 border-b border-[#1A1A1A]">
          <button
            onClick={() => switchMode("account")}
            className={`relative pb-2 text-sm font-semibold transition-colors ${mode !== "sms" ? "text-white" : "text-[#666]"}`}
          >
            账户密码登录
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
        )}

        {showDoc ? (
          <div className="flex h-[70vh] flex-col">
            <h2 className="mb-3 text-base font-bold text-white">
              {showDoc === "user" ? "jamony用户协议" : "jamony隐私政策"}
              {(showDoc === "user" ? userDoc?.version : privacyDoc?.version) ? `（${showDoc === "user" ? userDoc?.version : privacyDoc?.version}）` : ""}
            </h2>
            <div className="flex-1 overflow-y-auto rounded-xl border p-4 text-xs leading-relaxed" style={{ borderColor: "#1A1A1A", color: "#B0B0B0" }}>
              {(showDoc === "user" ? userDoc?.content : privacyDoc?.content) ? plainText((showDoc === "user" ? userDoc?.content : privacyDoc?.content) || "") : "加载中..."}
            </div>
            <button type="button" onClick={() => setShowDoc(null)} className="mt-3 self-center text-xs" style={{ color: "#00AAFF" }}>
              返回
            </button>
          </div>
        ) : mode === "sms" ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">验证码注册/登录</h2>
              <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>
                注册/登录后可使用jamony功能
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

              {/* 1110p 常驻占位(欢哥批): 提示行恒在——只做显示/不显示,不做有无(增删行会拉长卡片=跳动别扭) */}
              <p className="text-xs" style={{ color: notice ? "#00AAFF" : "#FF33AA", visibility: notice || error ? "visible" : "hidden" }}>
                {notice || error || "\u00A0"}
              </p>

              <AgreementCheck agreed={agreed} onToggle={() => setAgreed((v) => !v)} onOpen={(d) => setShowDoc(d)} />

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
              <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>
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

              {/* 1110p 常驻占位(欢哥批): 提示行恒在——只做显示/不显示,不做有无(增删行会拉长卡片=跳动别扭) */}
              <p className="text-xs" style={{ color: notice ? "#00AAFF" : "#FF33AA", visibility: notice || error ? "visible" : "hidden" }}>
                {notice || error || "\u00A0"}
              </p>

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
              <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>
                登录后可使用jamony功能
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

              {/* 1110p 常驻占位(欢哥批): 提示行恒在——只做显示/不显示,不做有无(增删行会拉长卡片=跳动别扭) */}
              <p className="text-xs" style={{ color: notice ? "#00AAFF" : "#FF33AA", visibility: notice || error ? "visible" : "hidden" }}>
                {notice || error || "\u00A0"}
              </p>

              <AgreementCheck agreed={agreed} onToggle={() => setAgreed((v) => !v)} onOpen={(d) => setShowDoc(d)} />

              <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "登录中..." : "登录"}
              </button>

              <p className="text-center text-xs" style={{ color: "#8A8A8A" }}>
                新用户？
                <button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: "#00AAFF" }} onClick={() => switchMode("sms")}>
                  立即注册
                </button>
                （使用手机号验证码，注册后自动登录）
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
