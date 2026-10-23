"use client"

import { useRef, useState } from "react"

// 申诉表单（1023 七件套③）: 理由必填(≥10字) + 截图可选(单图≤10M)
// 复用三处: 受限 Dialog 内嵌 / banned 拦截页
// 成功态文案统一——提交后进度走「个人主页-申诉」+ 站内信回执(⑤)

export function AppealForm({ onSuccess }: { onSuccess?: () => void }) {
  const [reason, setReason] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    const r = reason.trim()
    if (r.length < 10) { setErr("请写清申诉理由（至少 10 个字）"); return }
    if (r.length > 1000) { setErr("申诉理由过长（≤1000 字）"); return }
    setErr("")
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("reason", r)
      if (file) fd.append("screenshot", file)
      const res = await fetch("/api/appeals", { method: "POST", body: fd, credentials: "include" })
      const data = await res.json()
      if (!data.ok) { setErr(data.msg || "提交失败，请稍后再试"); setSubmitting(false); return }
      setDone(true)
      setSubmitting(false)
      onSuccess?.()
    } catch {
      setErr("网络错误，请重试")
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-[10px] border px-4 py-3 text-sm leading-relaxed" style={{ borderColor: "#2A4A2A", background: "rgba(123,228,149,0.06)", color: "#7BE495" }}>
        申诉已提交，我们会尽快处理。处理结果将通过站内信通知您，也可在「个人主页 - 申诉」查看进度。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="请说明您的情况，例如：内容为什么被误判、当时的实际语境…（至少 10 个字）"
        className="w-full resize-none rounded-[10px] border border-[#2A2A2A] bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-[#9933FF]"
      />
      {/* 截图可选（欢哥 1023 拍板：文字是申诉的实质，截图只是加速器） */}
      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-[10px] border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#B0B0B0] transition-colors hover:bg-white/5"
        >
          📎 添加截图（可选）
        </button>
        {file && (
          <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "#8A8A8A" }}>
            {file.name}
            <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = "" }} className="ml-2 text-[#FF5C5C]">移除</button>
          </span>
        )}
      </div>
      {err && <p className="text-xs" style={{ color: "#FF5C5C" }}>{err}</p>}
      <button
        onClick={submit}
        disabled={submitting || reason.trim().length < 10}
        className="w-full rounded-[10px] px-4 py-2 text-sm font-medium text-white transition-all active:scale-[0.98] disabled:opacity-30"
        style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
      >
        {submitting ? "提交中…" : "提交申诉"}
      </button>
    </div>
  )
}
