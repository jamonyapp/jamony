"use client"

import { useState, useEffect } from "react"
import { X, Loader2, Check } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useJamonyDialog } from "@/components/jamony/dialog"

// 10-23 欢哥定稿：遮罩点外关闭须「按下+松开都在遮罩」——click 派发到公共祖先，单判 target 会被拖出松开误关
const downOnOverlay = { current: false }

// 1104 短信注册登录(欢哥定稿): 双 tab——默认「账户+密码」(账户=手机号或昵称)+「验证码登录」(注册登录合一);
// 忘记密码=账户 tab 下的子视图(手机号验证码重置); 旧「注册」tab 退役
const PHONE_RE = /^1[3-9]\d{9}$/

// 1104批次2步骤三: 协议正文 markdown 轻渲染(剥标题井号+加粗星号, 协议纯文本结构够用)
const plainText = (md: string) => md.replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "")

// 1128(欢哥): 文档内标题抽取——首个非空行是markdown标题时单独渲染(居中/加大/加粗), 余下正文照旧
function splitDocTitle(md: string): { title: string; body: string } {
  const lines = md.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) continue
    if (/^#{1,6}\s+/.test(t)) {
      return { title: plainText(t), body: plainText(lines.slice(i + 1).join("\n").replace(/^\n+/, "")) }
    }
    return { title: "", body: plainText(md) }
  }
  return { title: "", body: plainText(md) }
}

// 1128 A2(欢哥定稿): 设备级已签记忆——localStorage 记住本机签过的版本; 小字态=免勾(登录仍带版本号, 服务端落档才是法律真身);
// 记忆错位(库无记录/手改/换账号)由服务端带版本补档自愈, 本记忆纯 UX 层
const SIGNED_AGREEMENTS_KEY = "jamony.signed-agreements"
function readSignedVersions(): { agreementVersion?: string; privacyVersion?: string } | null {
  try { return JSON.parse(localStorage.getItem(SIGNED_AGREEMENTS_KEY) || "") || null } catch { return null }
}
function writeSignedVersions(v: { agreementVersion?: string; privacyVersion?: string }) {
  try { localStorage.setItem(SIGNED_AGREEMENTS_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

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

// 1128 P0+A2(欢哥定稿): 协议行四态——加载中/失败+重试/小字态(本机已签当前版=免勾,文案不带版本号,双链接蓝色可点)/勾选框态(必须勾,发现新版保持现状)
function AgreementRow({ ready, loading, remembered, onRetry, agreed, onToggle, onOpen }: { ready: boolean; loading: boolean; remembered: boolean; onRetry: () => void; agreed: boolean; onToggle: () => void; onOpen: (doc: "user" | "privacy") => void }) {
  if (!ready) {
    if (loading) return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "#8A8A8A" }}>
        <Loader2 className="h-3 w-3 animate-spin" />
        用户协议加载中…
      </div>
    )
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "#FF33AA" }}>
        用户协议加载失败
        <button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: "#00AAFF" }} onClick={onRetry}>
          重试
        </button>
      </div>
    )
  }
  if (remembered) return (
    <p className="text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
      登录即表示同意
      <button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: "#00AAFF" }} onClick={() => onOpen("user")}>
        《jamony用户协议》
      </button>
      和
      <button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: "#00AAFF" }} onClick={() => onOpen("privacy")}>
        《jamony隐私政策》
      </button>
    </p>
  )
  return <AgreementCheck agreed={agreed} onToggle={onToggle} onOpen={onOpen} />
}

type Mode = "account" | "sms" | "forgot" | "recovery"

// 1109 强登录: embedded=true = /login 整页模式(不随 showLoginModal 门控/无遮罩/无关闭钮, 成功跳 "/"); 默认 = 全局弹窗模式(原行为不变)
export function LoginModal({ embedded = false }: { embedded?: boolean }) {
  const { showLoginModal, setShowLoginModal, login, loginWithSms, sendSmsCode, resetPassword } = useAuth()
  const [mode, setMode] = useState<Mode>("account")

  // 1123 注销: 冷静期内登录=自动撤销(auth-context login 成功分发事件)——品牌弹窗告知承诺已兑现
  const dialog = useJamonyDialog()
  useEffect(() => {
    const h = () => {
      dialog.alert("检测到您在冷静期内登录，已自动撤销注销申请，欢迎回来。", { title: "注销已撤销" })
    }
    window.addEventListener("jamony:deletion-cancelled", h)
    return () => window.removeEventListener("jamony:deletion-cancelled", h)
  }, [dialog])

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
  // 1122 回滚窗: 紧急恢复成功态(引导验证码登录+重设密码)
  const [recovered, setRecovered] = useState(false)

  // 1104批次2步骤三(+补·隐私政策并轨): 一勾两文档; 打开弹窗拉取双份; 登录失败刷新=应对 admin 刚发新版
  const [agreed, setAgreed] = useState(false)
  const [showDoc, setShowDoc] = useState<"user" | "privacy" | null>(null)
  const [userDoc, setUserDoc] = useState<{ version: string; content: string } | null>(null)
  const [privacyDoc, setPrivacyDoc] = useState<{ version: string; content: string } | null>(null)
  // 1128 P0: 协议加载三态——登录必检前置(欢哥定稿): 双文档未到位=发码/登录全闸死, 绝不让空版本号上山(403+烧码死循环坑案)
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState(false)
  const docsReady = !!(userDoc && privacyDoc)
  // 1128 A2: 本机已签当前版(双版本都相等)——小字态免勾; 任一不等=勾选框态
  const [remembered, setRemembered] = useState(false)

  const fetchAgreements = async () => {
    setDocsLoading(true)
    setDocsError(false)
    try {
      const r = await fetch("/api/agreements")
      const d = await r.json()
      if (d.ok && d.userAgreement && d.privacy) {
        // 1128 P0c(C1)+A2: 版本变化=勾选弹回/小字态翻回勾选框+提示——每次同意严格对应勾时所呈现的版本
        if (userDoc && privacyDoc && (agreed || remembered) && (d.userAgreement.version !== userDoc.version || d.privacy.version !== privacyDoc.version)) {
          setAgreed(false)
          setError("用户协议已更新，请重新阅读并勾选同意")
        }
        const stored = readSignedVersions()
        setRemembered(!!(stored && d.userAgreement.version === stored.agreementVersion && d.privacy.version === stored.privacyVersion))
        setUserDoc({ version: d.userAgreement.version, content: d.userAgreement.content })
        setPrivacyDoc({ version: d.privacy.version, content: d.privacy.content })
      } else {
        setDocsError(true)
      }
    } catch { setDocsError(true) }
    setDocsLoading(false)
  }
  // 1128 P0: 弹窗每次打开/embedded进页即拉(旧bug: 唯一拉取链路=登录报错之后→重启即清零→协议升级后死循环);
  // ETag条件请求=版本对齐, 无新版时304零字节往返
  useEffect(() => {
    if (showLoginModal || embedded) fetchAgreements()
  }, [showLoginModal, embedded])

  // 1128 P0c(C2): 回到窗口即重拉——登录卡片挂机空窗期内发新版, 回焦那一秒对齐(304近零成本);
  // 配合C1弹回勾选=空窗期场景在勾选前解决, 403降级为纯兜底
  useEffect(() => {
    if (!(showLoginModal || embedded)) return
    const onWake = () => { if (!document.hidden) fetchAgreements() }
    window.addEventListener("focus", onWake)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      window.removeEventListener("focus", onWake)
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [showLoginModal, embedded])

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
    setRecovered(false)
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
    if (!docsReady) { setError(docsError ? "协议加载失败，请重试后再获取验证码" : "协议加载中，请稍候…"); return }
    fetchAgreements() // 1128 P0c(C3): 发码=登录流程起点, 顺手对齐版本(fire-and-forget; 若恰逢新版, C1弹回勾选)
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
    if (!docsReady) { setError(docsError ? "协议加载失败，请点击重试后再登录" : "协议加载中，请稍候…"); return }
    if (!remembered && !agreed) {
      setError("请先勾选同意《jamony用户协议》和《jamony隐私政策》")
      return
    }
    setLoading(true)
    setError("")
    const sentVersions = { agreementVersion: userDoc?.version, privacyVersion: privacyDoc?.version } // 1128 A2: 捕获实际提交的版本(防提交途中重拉错位)
    const err = await login(account.trim(), password, { agreementVersion: sentVersions.agreementVersion, privacyVersion: sentVersions.privacyVersion })
    setLoading(false)
    if (err) {
      setError(err)
      fetchAgreements()
    } else {
      writeSignedVersions(sentVersions) // 1128 A2: 登录成功才记忆, 记的是实际提交的版本
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
    if (!docsReady) { setError(docsError ? "协议加载失败，请点击重试后再登录" : "协议加载中，请稍候…"); return }
    if (!remembered && !agreed) {
      setError("请先勾选同意《jamony用户协议》和《jamony隐私政策》")
      return
    }
    setLoading(true)
    setError("")
    const sentVersions = { agreementVersion: userDoc?.version, privacyVersion: privacyDoc?.version } // 1128 A2: 捕获实际提交的版本(防提交途中重拉错位)
    const err = await loginWithSms(phone.trim(), code.trim(), { agreementVersion: sentVersions.agreementVersion, privacyVersion: sentVersions.privacyVersion })
    setLoading(false)
    if (err) {
      setError(err)
      fetchAgreements()
    } else {
      writeSignedVersions(sentVersions) // 1128 A2: 登录成功才记忆, 记的是实际提交的版本
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

  // 1122 换绑回滚窗: 72h 紧急恢复(未登录通道——受害者密码被改+手机被换, 任何登录态设计都无效)
  const handleSendRecoveryCode = async () => {
    const p = phone.trim()
    if (!PHONE_RE.test(p)) { setError("请输入换绑前绑定的手机号"); return }
    setCodeSending(true); setError(""); setNotice("")
    try {
      const res = await fetch("/api/sms/send-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      })
      const data = await res.json()
      setCodeSending(false)
      if (!data.ok) { setError(data.msg || "发送失败"); return }
      setNotice("验证码已发送，5分钟内有效")
      setCountdown(60)
    } catch { setCodeSending(false); setError("网络错误") }
  }

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    const p = phone.trim()
    if (!PHONE_RE.test(p)) { setError("请输入换绑前绑定的手机号"); return }
    if (!/^\d{6}$/.test(code.trim())) { setError("请输入6位验证码"); return }
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/account/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p, code: code.trim() }),
      })
      const data = await res.json()
      setLoading(false)
      if (!data.ok) { setError(data.msg || "恢复失败"); return }
      setRecovered(true)
    } catch { setLoading(false); setError("网络错误") }
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
            <h2 className="mb-3 text-center text-base font-bold text-white">
              《{showDoc === "user" ? "jamony用户协议" : "jamony隐私政策"}》
              {(showDoc === "user" ? userDoc?.version : privacyDoc?.version) ? `（版本：v${showDoc === "user" ? userDoc?.version : privacyDoc?.version}）` : ""}
            </h2>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border p-4 text-xs leading-relaxed" style={{ borderColor: "#1A1A1A", color: "#B0B0B0" }}>
              {(() => {
                const d = showDoc === "user" ? userDoc : privacyDoc
                if (!d) return "加载中..."
                const { title, body } = splitDocTitle(d.content)
                return (
                  <>
                    {title && <p className="mb-4 text-center text-sm font-bold text-white">{title}</p>}
                    {body}
                  </>
                )
              })()}
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
                免费注册/登录后可使用jamony功能
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
                <div className="flex items-center justify-between">
                  <label className={labelCls} style={{ color: "#9A9A9A" }}>
                    验证码
                  </label>
                  {notice && <span className="text-xs" style={{ color: "#00AAFF" }}>{notice}</span>}
                </div>
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
                    disabled={countdown > 0 || codeSending || !docsReady}
                    onClick={handleSendCode}
                    className="shrink-0 rounded-xl border px-3 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                    style={{ background: "#141414", borderColor: "#2A2A2A" }}
                  >
                    {codeSending ? "发送中..." : countdown > 0 ? `${countdown}s后重发` : "获取验证码"}
                  </button>
                </div>
              </div>

              {/* 1110p 常驻占位(欢哥批): 提示行恒在——只做显示/不显示,不做有无(增删行会拉长卡片=跳动别扭) */}
              <p className="text-xs" style={{ color: "#FF33AA", visibility: error ? "visible" : "hidden" }}>
                {error || "\u00A0"}
              </p>

              <AgreementRow ready={docsReady} loading={docsLoading} remembered={remembered} onRetry={fetchAgreements} agreed={agreed} onToggle={() => setAgreed((v) => !v)} onOpen={(d) => setShowDoc(d)} />

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
                <div className="flex items-center justify-between">
                  <label className={labelCls} style={{ color: "#9A9A9A" }}>
                    验证码
                  </label>
                  {notice && <span className="text-xs" style={{ color: "#00AAFF" }}>{notice}</span>}
                </div>
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
                    disabled={countdown > 0 || codeSending || !docsReady}
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
              <p className="text-xs" style={{ color: "#FF33AA", visibility: error ? "visible" : "hidden" }}>
                {error || "\u00A0"}
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
        ) : mode === "recovery" ? (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">紧急恢复</h2>
              <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>
                非本人换绑或误操作，72小时内可使用原手机号恢复。
              </p>
            </div>

            {recovered ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium" style={{ color: "#BBEE00" }}>
                  ✓ 账号已恢复绑定至本手机号
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#9A9A9A" }}>
                  原密码已作废，请使用<strong>短信验证码</strong>登录，并在「设置-账号安全」中设置新密码
                </p>
                <button
                  type="button"
                  className={submitCls}
                  style={submitStyle}
                  onClick={() => { const p = phone.trim(); reset(); setPhone(p); setMode("sms") }}
                >
                  去登录
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecovery} className="flex flex-col gap-4">
                <div>
                  <label className={labelCls} style={{ color: "#9A9A9A" }}>
                    原绑定手机号
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="输入换绑前绑定的手机号"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className={labelCls} style={{ color: "#9A9A9A" }}>
                      验证码
                    </label>
                    {notice && <span className="text-xs" style={{ color: "#00AAFF" }}>{notice}</span>}
                  </div>
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
                      onClick={handleSendRecoveryCode}
                      className="shrink-0 rounded-xl border px-3 text-xs font-medium text-white transition-opacity disabled:opacity-50"
                      style={{ background: "#141414", borderColor: "#2A2A2A" }}
                    >
                      {codeSending ? "发送中..." : countdown > 0 ? `${countdown}s后重发` : "获取验证码"}
                    </button>
                  </div>
                </div>

                {/* 1110p 常驻占位(欢哥批): 提示行恒在——只做显示/不显示,不做有无(增删行会拉长卡片=跳动别扭) */}
                <p className="text-xs" style={{ color: "#FF33AA", visibility: error ? "visible" : "hidden" }}>
                  {error || " "}
                </p>

                <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? "恢复中..." : "恢复账号"}
                </button>

                <button type="button" className="text-center text-xs" style={{ color: "#8A8A8A" }} onClick={() => switchMode("account")}>
                  返回登录
                </button>
              </form>
            )}
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
                  <div className="flex items-center gap-3">
                    <button type="button" className="text-xs" style={{ color: "#00AAFF" }} onClick={() => switchMode("forgot")}>
                      忘记密码?
                    </button>
                    <button type="button" className="text-xs" style={{ color: "#00AAFF" }} onClick={() => switchMode("recovery")}>
                      紧急恢复
                    </button>
                  </div>
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
              <p className="text-xs" style={{ color: "#FF33AA", visibility: error ? "visible" : "hidden" }}>
                {error || "\u00A0"}
              </p>

              <AgreementRow ready={docsReady} loading={docsLoading} remembered={remembered} onRetry={fetchAgreements} agreed={agreed} onToggle={() => setAgreed((v) => !v)} onOpen={(d) => setShowDoc(d)} />

              <button type="submit" disabled={loading} className={submitCls} style={submitStyle}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "登录中..." : "登录"}
              </button>

              <p className="text-center text-xs" style={{ color: "#8A8A8A" }}>
                新用户？
                <button type="button" className="font-medium underline-offset-2 hover:underline" style={{ color: "#00AAFF" }} onClick={() => switchMode("sms")}>
                  立即免费注册
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
