"use client"

import { Crown } from "lucide-react"

export function BecomeHostDialog({
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
        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,184,77,0.15)" }}>
          <Crown className="size-6" style={{ color: "#ffb84d" }} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-white">你已成为房主</h2>
        <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
          房主已移交给你，现在可以管理房间成员。
        </p>
        <button onClick={onConfirm}
          className="mt-6 w-full rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(90deg,#9933ff,#ff33aa)" }}>
          知道了
        </button>
      </div>
    </div>
  )
}
