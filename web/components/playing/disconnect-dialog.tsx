"use client"

import { AlertTriangle } from "lucide-react"

export function DisconnectDialog({
  open,
  onCancel,
  onConfirm,
  isListener,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  isListener?: boolean
}) {
  if (!open) return null

  // jamony: 合奏者统一文案（告知后果：若唯一合奏者将解散）；听众单独文案（无音频连接）
  const title = isListener ? "确认退出房间？" : "确认要断开音频连接吗？"
  const desc = isListener ? "" : "若你是唯一合奏者，将解散房间。"
  const cancelText = isListener ? "继续旁听" : "继续合奏"
  const confirmText = isListener ? "退出房间" : "断开连接"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
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
          <button onClick={onCancel}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ background: "#141414", color: "#B0B0B0" }}>
            {cancelText}
          </button>
          <button onClick={onConfirm}
            className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#FF5C5C" }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
