"use client"

import { useEffect, useState } from "react"
import { AppealForm } from "@/components/jamony/appeal-form"

// ⑧banned 拦截页（1023 七件套⑦封号申诉权）
// 到达路径: ①登录时 api 返回 banned:true → 此页; ②会话中途被封 → /api/me 或通知轮询 401 BANNED → 此页
// 封号用户的会话仅够两个申诉端点使用(requireAuthAllowBanned), 其余全部 401——本页即其全部世界

interface AppealRow {
  id: number
  status: string
  reason: string
  reject_reason: string | null
  created_at: string
  handled_at: string | null
}

export default function BannedPage() {
  const [appeals, setAppeals] = useState<AppealRow[] | null>(null)
  // 1024: 处罚上下文——申诉有效期截止日期/过期态(与个人主页申诉tab同款)
  const [punishment, setPunishment] = useState<{ restriction: string; appeal_deadline: string; appeal_days: number } | null>(null)

  const loadAppeals = () => {
    fetch("/api/my-appeals", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setAppeals(d.ok ? d.appeals || [] : []); setPunishment(d.punishment || null) })
      .catch(() => setAppeals([]))
  }

  useEffect(() => { loadAppeals() }, [])

  const logout = () => {
    fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {}).finally(() => {
      window.location.href = "/"
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-[480px] max-w-full">
        <div className="rounded-[10px] border p-6" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
          <div className="flex items-center gap-3">
            <img src="/jamony_logo.png" alt="jamony" className="h-9 w-9 rounded-full object-cover" />
            <p className="text-[17px] font-semibold text-white">账号已被封禁</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "#C8C8C8" }}>
            该账号因违反jamony行为规范已被封禁，合奏、发布与社交功能均已冻结。
            如果您认为这是误判，可以在下方提交申诉，我们会尽快处理并通过站内信告知结果。
          </p>

          <div className="mt-5 border-t pt-4" style={{ borderColor: "#1A1A1A" }}>
            {punishment && new Date(punishment.appeal_deadline).getTime() < Date.now() ? (
              <p className="rounded-[10px] border px-4 py-3 text-sm" style={{ color: "#FF9A9A", borderColor: "#FF5C5C", background: "rgba(255,92,92,0.05)" }}>
                申诉期已过（处罚生效后{punishment.appeal_days}天内可申诉）。
              </p>
            ) : (
              <>
                {punishment && (
                  <p className="mb-3 text-xs" style={{ color: "#F5C518" }}>
                    申诉有效期至 {new Date(punishment.appeal_deadline).getMonth() + 1}月{new Date(punishment.appeal_deadline).getDate()}日
                  </p>
                )}
                <AppealForm onSuccess={loadAppeals} />
              </>
            )}
          </div>
        </div>

        {/* 申诉进度（封号场景下 ⑤结果回执的唯一通道——站内信已不可达） */}
        {appeals !== null && appeals.length > 0 && (
          <div className="mt-4 rounded-[10px] border p-4" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}>
            <p className="mb-3 text-[13px]" style={{ color: "#8A8A8A" }}>我的申诉</p>
            <div className="flex flex-col gap-2">
              {appeals.map((a) => (
                <div key={a.id} className="rounded-lg border px-3 py-2.5" style={{ borderColor: "#1A1A1A" }}>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        color: a.status === "approved" ? "#7BE495" : a.status === "rejected" ? "#FF5C5C" : "#F5C518",
                        background: a.status === "approved" ? "rgba(123,228,149,0.10)" : a.status === "rejected" ? "rgba(255,92,92,0.10)" : "rgba(245,197,24,0.10)",
                      }}>
                      {a.status === "approved" ? "已通过" : a.status === "rejected" ? "已驳回" : "审核中"}
                    </span>
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>{new Date(a.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed" style={{ color: "#C8C8C8" }}>{a.reason}</p>
                  {a.status === "rejected" && a.reject_reason && (
                    <p className="mt-1.5 text-xs" style={{ color: "#FF9A9A" }}>驳回理由：{a.reject_reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-center">
          <button onClick={logout} className="rounded-[10px] border border-[#2A2A2A] px-4 py-1.5 text-sm transition-colors hover:bg-white/5" style={{ color: "#B0B0B0" }}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
