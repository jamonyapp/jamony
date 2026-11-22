"use client"

import { useState, useEffect } from "react"
import { X, Loader2, ShieldAlert, Check } from "lucide-react"

// 1123 注销账号弹窗(15天冷静期+软注销·墓碑刻名, 定稿见 memory/project-rebind-deletion)
// 步骤1: 短信验证(scene=delete_account, 发码目标=当前绑定号)
// 步骤2: 品牌弹窗确认——定稿文案四块在内部滚动区, 必选勾选+两按钮钉在滚动区外(欢哥UI定稿)
// 文案(1123 欢哥终审定稿, 全文用「您」)

function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return { left, start: () => setLeft(60) }
}

const codeInputClass =
  "w-full rounded-[10px] border px-4 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 mb-1 text-xs font-semibold" style={{ color: "#B0B0B0" }}>{children}</div>
}
function Line({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 pl-1 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>{children}</p>
}

export function DeletionDialog({
  open,
  phoneMasked,
  onClose,
  onSuccess,
}: {
  open: boolean
  phoneMasked: string
  onClose: () => void
  onSuccess: (requestedAt: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1=短信验证 2=确认弹窗 3=完成
  const [code, setCode] = useState("")
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const cd = useCountdown()

  useEffect(() => {
    if (open) {
      setStep(1); setCode(""); setChecked(false)
      setError(""); setNotice(""); setLoading(false); setSending(false)
    }
  }, [open])

  if (!open) return null

  const sendCode = async () => {
    setSending(true); setError(""); setNotice("")
    try {
      const res = await fetch("/api/sms/send-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene: "delete_account" }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "验证码发送失败"); setSending(false); return }
      setNotice("验证码已发送，5分钟内有效")
      cd.start()
      setSending(false)
    } catch {
      setError("网络错误"); setSending(false)
    }
  }

  // 流程定稿: 步骤1只本地校验格式并暂存码(确认先于提交——用户读完文案勾选后才真验码);
  // 步骤2勾选后提交(request 端点一次完成验码+入库)。码错→回步骤1改码, 文案不必重读(码还在)
  const doRequest = async () => {
    if (!checked) return
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      setLoading(false)
      if (!data.ok) { setError(data.msg || "提交失败"); setStep(1); return }
      onSuccess(data.deletion_requested_at || new Date().toISOString())
      setStep(3)
    } catch {
      setError("网络错误"); setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg,#00AAFF,#9933FF,#FF33AA,#BBEE00)" }} />
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 transition-colors hover:bg-white/5" style={{ color: "#8A8A8A" }} aria-label="关闭">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 px-6 pb-2 pt-6">
          <ShieldAlert className="h-5 w-5" style={{ color: "#FF33AA" }} />
          <h2 className="text-lg font-bold text-white">
            {step === 3 ? "注销申请已提交" : "注销账号"}
          </h2>
          {step !== 3 && (
            <span className="ml-auto mr-8 text-xs" style={{ color: "#6A6A6A" }}>
              {step === 1 ? "第 1 步，共 2 步" : "第 2 步，共 2 步"}
            </span>
          )}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4 px-6 pb-6">
            <p className="text-sm" style={{ color: "#9A9A9A" }}>
              将向当前绑定手机号 <span className="text-white">{phoneMasked}</span> 发送验证码，验证本人身份。
            </p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={code} autoFocus
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError("") }}
                onKeyDown={(e) => { if (e.key === "Enter" && !loading) setStep(2) }}
                placeholder="请输入验证码"
                className={codeInputClass}
                style={{ background: "#141414", borderColor: error ? "#FF33AA" : "#2A2A2A" }} />
              <button type="button" onClick={sendCode}
                disabled={sending || cd.left > 0}
                className="shrink-0 rounded-[10px] border px-3 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
                style={{ borderColor: "#2A2A2A", color: "#B0B0B0", minWidth: "84px" }}>
                {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : cd.left > 0 ? `${cd.left}s` : "获取验证码"}
              </button>
            </div>
            <div className="flex h-5 items-center">
              {error ? <span className="text-sm" style={{ color: "#FF33AA" }}>{error}</span>
                : notice ? <span className="text-xs" style={{ color: "#00AAFF" }}>{notice}</span> : null}
            </div>
            <button onClick={() => { if (!/^\d{6}$/.test(code)) { setError("请输入6位验证码"); return } setError(""); setStep(2) }}
              className="flex items-center justify-center gap-2 w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
              style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
              下一步
            </button>
          </div>
        )}

        {step === 2 && (
          <>
            {/* 引言句钉在滚动框外(1123欢哥改笔): 慎重提示常驻可见 */}
            <p className="px-6 pb-2 text-sm font-semibold text-white">
              您好，您正在注销jamony账号，请谨慎确认：
            </p>
            {/* 定稿文案四块: 内部滚动区(欢哥UI定稿: 字数多必须滚) */}
            <div className="mx-6 flex-1 overflow-y-auto rounded-[10px] border px-3" style={{ background: "#101010", borderColor: "#1F1F1F", maxHeight: "42vh" }}>
              <SectionTitle>■ 关于注销冷静期</SectionTitle>
              <Line>· 注销账号后，您将进入15天冷静期；</Line>
              <Line>· 冷静期内，登录将撤销本次账号注销操作；</Line>
              <Line>· 冷静期结束后，您将无法再次登录，且原用户名/昵称被锁定，亦无法被重新注册；</Line>
              <Line>· 冷静期结束后，您原账户的手机号可以再次注册新的jamony账号，但不可使用原用户名/昵称；</Line>
              <SectionTitle>■ 关于用户数据</SectionTitle>
              <Line>· 您在jamony上所有公开发布的内容，包括但不限于带有署名的作品、公告牌、评论等，不会被删除（公告牌将在到期后自动下架），仍保留展示您的头像+昵称（匿名作品依旧不展示）；</Line>
              <Line>· 您可以在注销操作前，手动删除不想展示的公告牌、评论等内容；</Line>
              <Line>· 您的用户卡片和个人主页将显示&ldquo;该用户已注销&rdquo;；</Line>
              <Line>· 如果您不想继续在作品中展示署名，请在注销操作前通过&ldquo;首页-左栏-意见反馈&rdquo;联系我们，此操作将视为把您从所有带署名的作品中设为匿名，不支持个别作品调整，不支持再次撤销；</Line>
              <SectionTitle>■ 关于付费权益</SectionTitle>
              <Line>· 如果您是付费用户，冷静期后当前付费权益失效且不可恢复，目前暂不支持权益转移和退款；</Line>
              <SectionTitle>■ 关于用户隐私</SectionTitle>
              <Line>· 您的任何个人信息，jamony依旧按隐私政策执行。</Line>
              <div className="h-3" />
            </div>
            {/* 勾选+按钮钉在滚动区外(欢哥UI定稿: 勾选不得藏滚动区末尾) */}
            <div className="px-6 pb-6 pt-3">
              {error ? <div className="mb-2 text-sm" style={{ color: "#FF33AA" }}>{error}</div> : null}
              <label className="mb-3 flex cursor-pointer items-start gap-2 select-none" onClick={() => setChecked(!checked)}>
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={{ borderColor: checked ? "#9933FF" : "#3A3A3A", background: checked ? "#9933FF" : "transparent" }}>
                  {checked ? <Check className="h-3 w-3 text-white" /> : null}
                </span>
                <span className="text-xs leading-relaxed" style={{ color: "#B0B0B0" }}>
                  我已知晓：冷静期结束后注销不可逆，我的内容仍将保留展示。
                </span>
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition-colors hover:border-[#3A3A3A] hover:text-white"
                  style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                  暂不注销
                </button>
                <button type="button" onClick={doRequest} disabled={!checked || loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-40"
                  style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? "提交中..." : "申请注销"}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(255,51,170,0.12)" }}>
              <Check className="h-6 w-6" style={{ color: "#FF33AA" }} />
            </div>
            <p className="text-center text-sm leading-relaxed" style={{ color: "#9A9A9A" }}>
              已进入 15 天冷静期。冷静期内随时登录即可撤销注销；<br />
              15 天内未登录，账号将完成注销。
            </p>
            <button onClick={onClose}
              className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
              style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
