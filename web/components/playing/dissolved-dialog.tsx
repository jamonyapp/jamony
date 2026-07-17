"use client"

import { LogOut } from "lucide-react"

export function DissolvedDialog({
  open,
  onConfirm,
}: {
  open: boolean
  onConfirm: () => void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-[10px] border p-6 text-center"
        style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}
      >
        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(153,51,255,0.15)" }}>
          <LogOut className="size-6" style={{ color: "#9933ff" }} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">房间已解散</h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
          最后一位合奏者已离开，房间解散，将返回大厅。
        </p>
        <button onClick={onConfirm}
          className="mt-6 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
          返回大厅
        </button>
      </div>
    </div>
  )
}
