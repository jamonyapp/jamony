"use client"

import { X } from "lucide-react"

export function CreateRoomModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 brand-gradient"
        />
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="text-5xl">🎼</div>
          <h2 className="text-xl font-bold">创建你的合奏房间</h2>
          <p className="text-pretty text-sm text-muted-foreground">
            房间创建功能即将上线。你将可以设置房间名称、风格、是否私密，并邀请乐手一起远程合奏。
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[10px] brand-gradient py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:brightness-110 active:scale-[0.97]"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
