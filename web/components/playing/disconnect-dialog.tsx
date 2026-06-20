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
        <h2 className="mt-4 text-lg font-semibold text-white">
          {isListener ? "确认退出房间？" : "确认要断开音频连接吗？"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
          {isListener ? "" : "退出后将离开合奏中页面。"}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={onCancel}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ background: "#141414", color: "#B0B0B0" }}>
            {isListener ? "继续旁听" : "继续合奏"}
          </button>
          <button onClick={onConfirm}
            className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#FF5C5C" }}>
            {isListener ? "退出房间" : "断开连接"}
          </button>
        </div>
      </div>
    </div>
  )
}
