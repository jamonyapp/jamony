"use client"

import { Headphones } from "lucide-react"

export function JamsoulExitedDialog({
  open,
  onConfirm,
  isLastMusician,
}: {
  open: boolean
  onConfirm: () => void
  isLastMusician?: boolean
}) {
  if (!open) return null

  // jamony: 唯一合奏者叉掉 jamsoul → 房间已解散（文案不同于普通切听众）
  const title = isLastMusician ? "房间已解散" : "音频链接已断开"
  const desc = isLastMusician ? "将返回房间大厅" : "已切换为听众身份"

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
          <Headphones className="size-6" style={{ color: "#FF33AA" }} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm" style={{ color: "#8A8A8A" }}>{desc}</p>
        <button
          onClick={onConfirm}
          className="mt-5 w-full rounded-[8px] py-2.5 text-sm font-medium text-white transition-colors"
          style={{ background: "#9933FF" }}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
