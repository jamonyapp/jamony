"use client"

import { useEffect, useRef, useState } from "react"
import { Share2, X, Check } from "lucide-react"
import { copyShareText, ShareRoom } from "@/lib/share-room"

// 建房后引导弹窗：提示房主分享房间，带「分享房间」按钮（复用 copyShareText）
export function ShareRoomHintDialog({ open, room, onClose }: { open: boolean; room: ShareRoom | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 关闭时重置状态、清定时器，下次打开是干净状态
  useEffect(() => {
    if (!open) {
      setCopied(false)
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    }
  }, [open])

  if (!open || !room) return null

  const handleShare = async () => {
    const ok = await copyShareText(room)
    if (!ok) return
    setCopied(true)
    // 浮现"已复制"提示，2 秒后自动关闭弹窗
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => onClose(), 2000)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="relative w-full max-w-sm rounded-[10px] border p-6 text-center" style={{ background: "#0D0D0D", borderColor: "#2A2A2A" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 transition-colors" style={{ color: "#5A5A5A" }} aria-label="关闭">
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(153,51,255,0.15)" }}>
          <Share2 className="size-6" style={{ color: "#9933FF" }} />
        </div>

        <h2 className="mt-4 text-base font-semibold text-white">房间已创建</h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
          点击下方按钮将房间分享给朋友。或者稍后从页面右侧房间卡片分享。
        </p>

        <div className="relative mt-6">
          {copied && (
            <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-[6px] px-2 py-1 text-[11px] text-white" style={{ background: "#9933FF" }}>
              已复制，可以粘贴给朋友了！
            </div>
          )}
          <button
            onClick={handleShare}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
            style={{ backgroundImage: copied ? "linear-gradient(90deg, #7BE495 0%, #5BC0EB 100%)" : "linear-gradient(90deg, #9933ff 0%, #ff33aa 100%)" }}
          >
            {copied ? (<><Check className="h-4 w-4" />已复制，去粘贴吧</>) : (<><Share2 className="h-4 w-4" />分享房间</>)}
          </button>
        </div>

        <button onClick={onClose} className="mt-2 w-full rounded-[10px] px-4 py-2 text-xs transition-colors hover:text-white" style={{ color: "#5A5A5A" }}>
          稍后再分享
        </button>
      </div>
    </div>
  )
}
