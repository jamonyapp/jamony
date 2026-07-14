"use client"

import { ShieldAlert } from "lucide-react"

export function KickedDialog({
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
        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,51,170,0.15)" }}>
          <ShieldAlert className="size-6" style={{ color: "#FF33AA" }} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">你已被房主移出房间</h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
          你将返回大厅，且无法再次加入该房间。
        </p>
        <button onClick={onConfirm}
          className="mt-6 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
          我知道了
        </button>
      </div>
    </div>
  )
}
