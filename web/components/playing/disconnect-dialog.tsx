"use client"

import { AlertTriangle } from "lucide-react"

// 断开类确认弹窗（10-07 变体化）：
// variant="switch" → 合奏页「切为听众」：断音频+降级身份，留在房间
// variant="leave"  → 「离开房间」/漫游态断开房间/退出登录：leave+回大厅（行为一致文案一致）
// 无 variant + isListener → 原听众兜底文案（历史路径保留）
export function DisconnectDialog({
  open,
  onCancel,
  onConfirm,
  isListener,
  variant,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  isListener?: boolean
  variant?: "switch" | "leave"
}) {
  if (!open) return null

  const title = variant === "switch"
    ? "确认要断开音频连接吗？"
    : variant === "leave"
      ? "确认要离开房间吗？"
      : isListener ? "确认退出房间？" : "确认要断开音频连接吗？"
  const desc = variant === "switch"
    ? "断开后将切换为听众身份，若你是唯一合奏者，将解散房间。"
    : variant === "leave"
      ? "离开后将返回房间大厅，若你是唯一合奏者，将解散房间。"
      : isListener ? "" : "若你是唯一合奏者，将解散房间。"
  // 10-07 欢哥定稿：按钮文案通用化（返回/确认）——标题与说明负责讲清场景后果，
  // 按钮只表达动作，避免唯一合奏者等分支下"切为听众/断开房间"预告失真
  const cancelText = "返回"
  const confirmText = "确认"

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
