"use client"

import { AlertTriangle } from "lucide-react"

export function DisconnectDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
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
        className="w-full max-w-sm rounded-[10px] border border-border bg-card p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/15">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">确定要离开当前合奏吗？</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          断开后将结束调音台进程并返回房间大厅。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-[10px] bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            继续合奏
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[10px] bg-destructive px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            断开连接
          </button>
        </div>
      </div>
    </div>
  )
}
