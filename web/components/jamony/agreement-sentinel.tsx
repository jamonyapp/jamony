"use client"

import { useState, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import { Loader2, Check } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useJamonyDialog } from "@/components/jamony/dialog"
import { writeSignedVersions } from "@/lib/agreement-memory"

type Doc = { version: string; effective_date: string }

// 1128 P2 会话内版本哨兵(欢哥定稿): 已登录用户打开 jamony 即比对「当前版 vs 本账号已签版」——
// 不一致=硬弹窗(勾选+同意入档/不同意强退, 无「稍后」); 礼仪闸=房间内演奏不打断(宪法「房间互不影响」),出房再弹;
// 同意时同步写设备记忆(同登录成功同款调用)——本设备下次登录窗直接小字态, 不多勾一次
export function AgreementSentinel() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const dialog = useJamonyDialog()
  const [pending, setPending] = useState<{ userDoc: Doc | null; privacyDoc: Doc | null } | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const inRoom = !!pathname && pathname.startsWith("/room/")

  const check = useCallback(async () => {
    if (!user) return
    try {
      const [a, m] = await Promise.all([
        fetch("/api/agreements").then((r) => r.json()),
        fetch("/api/agreements/my-versions", { credentials: "include" }).then((r) => r.json()),
      ])
      if (!a.ok || !m.ok) return
      const needUser = a.userAgreement && m.mine.user_agreement !== a.userAgreement.version
      const needPrivacy = a.privacy && m.mine.privacy !== a.privacy.version
      if (needUser || needPrivacy) {
        setAgreed(false)
        setPending({ userDoc: needUser ? a.userAgreement : null, privacyDoc: needPrivacy ? a.privacy : null })
      }
    } catch { /* 离线/接口降级=下轮再查, 不打扰 */ }
  }, [user])

  // 触发点: 登录态就位 + 离开房间 + 回焦(长开App期间发版也能感知)
  useEffect(() => {
    if (user && !inRoom) check()
  }, [user, inRoom, check])
  useEffect(() => {
    const onWake = () => { if (!document.hidden) check() }
    window.addEventListener("focus", onWake)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      window.removeEventListener("focus", onWake)
      document.removeEventListener("visibilitychange", onWake)
    }
  }, [check])

  if (!pending) return null

  const docs = [
    pending.userDoc && { name: "《jamony用户协议》", url: "/terms", d: pending.userDoc },
    pending.privacyDoc && { name: "《jamony隐私政策》", url: "/privacy", d: pending.privacyDoc },
  ].filter(Boolean) as { name: string; url: string; d: Doc }[]

  const accept = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/agreements/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agreementVersion: pending.userDoc ? pending.userDoc.version : undefined,
          privacyVersion: pending.privacyDoc ? pending.privacyDoc.version : undefined,
        }),
      })
      if (res.status === 409) {
        // 发版途中版本又变: 重查再战(新弹窗带新版)
        setBusy(false)
        setPending(null)
        check()
        return
      }
      const data = await res.json()
      if (!data.ok) { setBusy(false); return }
      // 同设备记忆同步(欢哥补刀): 本设备下次登录窗直接小字态
      writeSignedVersions({
        agreementVersion: pending.userDoc ? pending.userDoc.version : undefined,
        privacyVersion: pending.privacyDoc ? pending.privacyDoc.version : undefined,
      })
      setPending(null)
    } catch { setBusy(false) }
  }

  const decline = () => {
    logout()
    setPending(null)
    dialog.alert("您已退出登录。重新登录时需阅读并同意最新版《jamony用户协议》和《jamony隐私政策》方可使用。", { title: "已退出登录" })
  }

  const link = "font-medium underline-offset-2 hover:underline"

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="relative w-full max-w-sm rounded-2xl border p-6 shadow-2xl" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
        <h2 className="text-lg font-bold text-white">用户协议已更新</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
          以下文档已发布新版本，阅读并同意后方可继续使用 jamony：
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {docs.map(({ name, url, d }) => (
            <div key={name} className="rounded-xl border p-3" style={{ borderColor: "#1A1A1A", background: "#141414" }}>
              <button type="button" className={`${link} text-sm`} style={{ color: "#00AAFF" }} onClick={() => window.open(url)}>
                {name}
              </button>
              <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>
                版本：v{d.version} · 发布日期 {d.effective_date}
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((v) => !v)}
          className="mt-4 flex items-start gap-2 text-left"
        >
          <span
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors"
            style={{ borderColor: agreed ? "#9933FF" : "#3A3A3A", background: agreed ? "#9933FF" : "transparent" }}
          >
            {agreed && <Check className="h-3 w-3 text-white" />}
          </span>
          <span className="text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
            我已阅读并同意上述更新后的文档
          </span>
        </button>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={!agreed || busy}
            onClick={accept}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "提交中..." : "同意并继续使用"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={decline}
            className="rounded-xl border px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "#141414", borderColor: "#2A2A2A" }}
          >
            不同意
          </button>
        </div>
      </div>
    </div>
  )
}
