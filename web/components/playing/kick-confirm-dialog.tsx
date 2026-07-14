"use client"

import { UserX } from "lucide-react"

export function KickConfirmDialog({
  open,
  nickname,
  onCancel,
  onConfirm,
}: {
  open: boolean
  nickname?: string
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
        className="w-full max-w-sm rounded-[10px] border p-6 text-center"
        style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,92,92,0.15)" }}>
          <UserX className="size-6" style={{ color: "#FF5C5C" }} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">移出房间？</h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
          将 <span className="text-white">{nickname}</span> 移出房间，该用户将无法再次加入本房间。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button onClick={onCancel}
            className="rounded-[10px] px-4 py-2.5 text-sm font-medium transition-colors"
            style={{ background: "#141414", color: "#B0B0B0" }}>
            取消
          </button>
          <button onClick={onConfirm}
            className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#FF5C5C" }}>
            确认移出
          </button>
        </div>
      </div>
    </div>
  )
}
