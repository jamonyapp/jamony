"use client"

import { useState, useEffect } from "react"
import { X, Loader2, Smartphone, Check } from "lucide-react"

// 1122 换绑手机号弹窗(双码流 only, 设计定稿见 memory/project-rebind-deletion)
// 步骤1: 旧手机号验证(scene=rebind_old)→ 拿 10 分钟换绑票
// 步骤2: 新手机号验证(scene=rebind_new)+ 票 → 执行换绑
// 文案(欢哥改笔定稿): 如旧手机号无法接收验证码，暂不支持更换绑定，可使用新手机号注册新账号。

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
  "w-full rounded-[10px] border px-4 py-2.5 text-center text-xl tracking-[0.4em] text-white outline-none transition-colors placeholder:text-[#666] placeholder:tracking-normal placeholder:text-sm focus:border-[#9933FF]"
const phoneInputClass =
  "w-full rounded-[10px] border px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"

export function RebindDialog({
  open,
  phoneMasked,
  onClose,
  onSuccess,
}: {
  open: boolean
  phoneMasked: string
  onClose: () => void
  onSuccess: (newMasked: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1=验旧号 2=验新号 3=完成
  const [ticket, setTicket] = useState("")
  const [oldCode, setOldCode] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newCode, setNewCode] = useState("")
  const [newMasked, setNewMasked] = useState("")
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const oldCd = useCountdown()
  const newCd = useCountdown()

  useEffect(() => {
    if (open) {
      setStep(1); setTicket(""); setOldCode(""); setNewPhone(""); setNewCode("")
      setNewMasked(""); setError(""); setLoading(false); setSending(false)
    }
  }, [open])

  if (!open) return null

  const sendCode = async (scene: "rebind_old" | "rebind_new") => {
    setSending(true); setError("")
    try {
      const body = scene === "rebind_old" ? { scene } : { scene, phone: newPhone.trim() }
      const res = await fetch("/api/sms/send-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "验证码发送失败"); setSending(false); return }
      if (scene === "rebind_old") oldCd.start(); else newCd.start()
      setSending(false)
    } catch {
      setError("网络错误"); setSending(false)
    }
  }

  const verifyOld = async () => {
    if (!/^\d{6}$/.test(oldCode)) { setError("请输入6位验证码"); return }
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/rebind/verify-old", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: oldCode }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "验证失败"); setLoading(false); return }
      setTicket(data.ticket); setStep(2); setLoading(false)
    } catch {
      setError("网络错误"); setLoading(false)
    }
  }

  const doRebind = async () => {
    if (!/^1[3-9]\d{9}$/.test(newPhone.trim())) { setError("请输入正确的手机号"); return }
    if (!/^\d{6}$/.test(newCode)) { setError("请输入6位验证码"); return }
    setLoading(true); setError("")
    try {
      const res = await fetch("/api/rebind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, newPhone: newPhone.trim(), newCode }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "更换失败"); setLoading(false); return }
      setNewMasked(data.phoneMasked); setStep(3); setLoading(false)
    } catch {
      setError("网络错误"); setLoading(false)
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
            <Smartphone className="h-5 w-5" style={{ color: "#9933FF" }} />
            <h2 className="text-lg font-bold text-white">
              {step === 3 ? "更换绑定成功" : "更换绑定手机号"}
            </h2>
            {step !== 3 && (
              <span className="ml-auto mr-8 text-xs" style={{ color: "#6A6A6A" }}>
                {step === 1 ? "第 1 步，共 2 步" : "第 2 步，共 2 步"}
              </span>
            )}
          </div>

          {step === 1 && (
            <>
              <p className="text-sm" style={{ color: "#9A9A9A" }}>
                当前绑定：<span className="text-white">{phoneMasked}</span>。请验证您持有该手机号。
              </p>
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" maxLength={6} value={oldCode} autoFocus
                  onChange={(e) => { setOldCode(e.target.value.replace(/\D/g, "")); setError("") }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) verifyOld() }}
                  placeholder="请输入验证码"
                  className={codeInputClass}
                  style={{ background: "#141414", borderColor: error ? "#FF33AA" : "#2A2A2A" }} />
                <button type="button" onClick={() => sendCode("rebind_old")}
                  disabled={sending || oldCd.left > 0}
                  className="shrink-0 rounded-[10px] border px-3 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
                  style={{ borderColor: "#2A2A2A", color: "#B0B0B0", minWidth: "84px" }}>
                  {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : oldCd.left > 0 ? `${oldCd.left}s` : "获取验证码"}
                </button>
              </div>
              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}
              <p className="text-xs" style={{ color: "#6A6A6A" }}>
                如旧手机号无法接收验证码，暂不支持更换绑定，可使用新手机号注册新账号。
              </p>
              <button onClick={verifyOld} disabled={loading}
                className="flex items-center justify-center gap-2 w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "验证中..." : "下一步"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm" style={{ color: "#9A9A9A" }}>
                旧手机号验证通过。请输入要绑定的新手机号并验证。
              </p>
              <input type="text" inputMode="numeric" maxLength={11} value={newPhone} autoFocus
                onChange={(e) => { setNewPhone(e.target.value.replace(/\D/g, "")); setError("") }}
                placeholder="请输入新手机号"
                className={phoneInputClass}
                style={{ background: "#141414", borderColor: "#2A2A2A" }} />
              <div className="flex gap-2">
                <input type="text" inputMode="numeric" maxLength={6} value={newCode}
                  onChange={(e) => { setNewCode(e.target.value.replace(/\D/g, "")); setError("") }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) doRebind() }}
                  placeholder="请输入验证码"
                  className={codeInputClass}
                  style={{ background: "#141414", borderColor: error ? "#FF33AA" : "#2A2A2A" }} />
                <button type="button" onClick={() => sendCode("rebind_new")}
                  disabled={sending || newCd.left > 0 || !/^1[3-9]\d{9}$/.test(newPhone.trim())}
                  className="shrink-0 rounded-[10px] border px-3 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
                  style={{ borderColor: "#2A2A2A", color: "#B0B0B0", minWidth: "84px" }}>
                  {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : newCd.left > 0 ? `${newCd.left}s` : "获取验证码"}
                </button>
              </div>
              {error && <p className="text-sm" style={{ color: "#FF33AA" }}>{error}</p>}
              <button onClick={doRebind} disabled={loading}
                className="flex items-center justify-center gap-2 w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "更换中..." : "确认更换"}
              </button>
              <button type="button" onClick={() => { setStep(1); setError("") }} className="text-xs hover:text-white" style={{ color: "#6A6A6A" }}>
                返回上一步
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "rgba(187,238,0,0.12)" }}>
                  <Check className="h-6 w-6" style={{ color: "#BBEE00" }} />
                </div>
                <p className="text-sm" style={{ color: "#9A9A9A" }}>
                  当前绑定手机号已更换为 <span className="text-white">{newMasked}</span>
                </p>
              </div>
              <button onClick={() => onSuccess(newMasked)}
                className="w-full rounded-[10px] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
