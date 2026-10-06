"use client"

import { AlertTriangle } from "lucide-react"

// 切换房间确认弹窗（10-06 漫游改造）——视觉照抄 DisconnectDialog，文案可配置：
// 加入其他房间 / 创建新房间 两个场景共用（欢哥定稿文案：断开原房间 + 唯一合奏者解散提示）
export function SwitchRoomDialog({
  open,
  title,
  desc,
  cancelText = "留在原房间",
  confirmText = "确认切换",
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean
  title: string
  desc: string
  cancelText?: string
  confirmText?: string
  onCancel: () => void
  onConfirm: () => void
  busy?: boolean
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-[10px] border p-6 text-center"
        style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,92,92,0.15)" }}>
          <AlertTriangle className="size-6" style={{ color: "#FF5C5C" }} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>{desc}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={onCancel} disabled={busy}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "#141414", color: "#B0B0B0" }}>
            {cancelText}
          </button>
          <button onClick={onConfirm} disabled={busy}
            className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#FF5C5C" }}>
            {busy ? "切换中…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
