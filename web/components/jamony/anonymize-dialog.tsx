"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"

// 取消署名确认弹窗（主页 + 列表页共用）
// 不可撤销操作：把当前用户在某个作品中的署名改为匿名
export function AnonymizeDialog({
  workId,
  workTitle,
  onClose,
  onDone,
}: {
  workId: number
  workTitle: string
  onClose: () => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function confirm() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/works/${workId}/anonymize`, { method: "PATCH", credentials: "include" })
      const data = await res.json()
      if (!data.ok) {
        setError(data.msg || "操作失败")
        setLoading(false)
        return
      }
      onDone()
    } catch {
      setError("网络错误")
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-[14px] border border-[#2A2A2A] bg-[#0D0D0D] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" style={{ color: "#FF5C5C" }} />
          <h3 className="text-base font-bold text-white">取消署名</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#B0B0B0" }}>
          确认取消在《<span className="text-white">{workTitle}</span>》中的署名？
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: "#FF5C5C" }}>
          此操作不可撤销。取消后该作品将不再显示你的署名，但你仍可在"我参与的作品"中看到它。
        </p>
        {error && <p className="mt-2 text-xs" style={{ color: "#FF5C5C" }}>{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-[10px] border border-[#2A2A2A] px-4 py-2 text-sm transition-colors hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
            style={{ color: "#8A8A8A" }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading}
            className="rounded-[10px] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#FF5C5C" }}
          >
            {loading ? "处理中..." : "确认取消署名"}
          </button>
        </div>
      </div>
    </div>
  )
}
