"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"

// 1110b 欢哥定稿交互: 点「分享」先出下拉菜单(分享到微信/微博/复制链接,各项带 logo),
// 选微信=二级 QR 卡片(扫码即达公开落地页);选微博=壳内 openExternal 跳系统浏览器;
// 复制=壳 clipboard 优先。落地页 https://jamonyapp.com/share/works/<id>(自定义卡片由落地页 wx.config 负责)。
// 菜单面板=absolute 定位,调用方把触发按钮包进 relative 容器;点遮罩任意处关闭。
export function ShareMenu({ open, onClose, workId, title }: { open: boolean; onClose: () => void; workId: string | number; title: string }) {
  const [stage, setStage] = useState<"menu" | "qr">("menu")
  const [qr, setQr] = useState("")
  const [copied, setCopied] = useState(false)
  // 1023 遮罩拖出误关范式: mousedown 与 click 都落在遮罩上才算「点遮罩关闭」
  const overlayRef = useRef<HTMLDivElement>(null)
  const downOnOverlay = useRef(false)

  const shareUrl = `https://jamonyapp.com/share/works/${workId}`

  useEffect(() => {
    if (!open) return
    setStage("menu")
    setCopied(false)
    QRCode.toDataURL(shareUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""))
  }, [open, shareUrl])

  if (!open) return null

  const weibo = () => {
    const url = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(`${title} - jamony 即鸣`)}`
    const api = (window as unknown as { jamonyAPI?: { openExternal?: (u: string) => void } }).jamonyAPI
    if (api?.openExternal) api.openExternal(url)
    else window.open(url, "_blank", "noopener")
    onClose()
  }

  const copy = async () => {
    const api = (window as unknown as { jamonyAPI?: { writeClipboard?: (t: string) => boolean } }).jamonyAPI
    let ok = false
    if (api?.writeClipboard) ok = api.writeClipboard(shareUrl)
    if (!ok) {
      try {
        await navigator.clipboard.writeText(shareUrl)
        ok = true
      } catch {
        const ta = document.createElement("textarea")
        ta.value = shareUrl
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand("copy")
        ta.remove()
      }
    }
    setCopied(ok)
    if (ok) setTimeout(onClose, 900)
  }

  if (stage === "menu") {
    return (
      <>
        {/* 点外部任意处收起菜单(stopPropagation: TrackCard 等容器点击=播放,不可冒泡) */}
        <div
          className="fixed inset-0 z-40"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        />
        <div
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#0D0D0D] py-1 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15"
            onClick={() => setStage("qr")}
          >
            <WechatLogo className="h-5 w-5" />
            分享到微信
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15"
            onClick={weibo}
          >
            <WeiboLogo className="h-5 w-5" />
            分享到微博
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-white transition-colors hover:bg-white/10 active:bg-white/15"
            onClick={copy}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-zinc-300">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {copied ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
      </>
    )
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === overlayRef.current
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === overlayRef.current && downOnOverlay.current) onClose()
      }}
    >
      <div className="w-full max-w-xs rounded-xl border border-white/10 bg-[#0D0D0D] p-5">
        <div className="text-center text-sm font-semibold text-white">分享到微信</div>
        <div className="mt-3 flex justify-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地 dataURL 二维码
            <img src={qr} alt="分享二维码" className="h-44 w-44 rounded-lg" />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-lg bg-white/10" />
          )}
        </div>
        <div className="mt-2 text-center text-xs text-[#8A8A8A]">微信扫码，转发给好友 / 朋友圈</div>
        <button type="button" onClick={onClose} className="mt-3 w-full py-1 text-center text-xs text-[#8A8A8A] hover:text-white">
          关闭
        </button>
      </div>
    </div>
  )
}

// 微信 logo(双气泡简化线稿,品牌绿)
function WechatLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#07C160" aria-hidden>
      <path d="M9.5 4C5.9 4 3 6.4 3 9.4c0 1.7.9 3.2 2.4 4.2l-.6 2 2.2-1.1c.6.2 1.2.3 1.9.3-.5-1-1.4-1.7-1.4-1.7 0-2.9 2.9-5.2 6.4-5.2h.4C13.8 5.6 11.9 4 9.5 4Z" />
      <path d="M22 15.2c0-2.5-2.5-4.5-5.5-4.5S11 12.7 11 15.2s2.5 4.5 5.5 4.5c.6 0 1.2-.1 1.7-.3l1.9.9-.5-1.7c1.4-.8 2.4-2 2.4-3.4Z" />
    </svg>
  )
}

// 微博 logo(眼睛简化线稿,品牌红)
function WeiboLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#E6162D" aria-hidden>
      <path d="M10.1 18.2c-3.6.4-6.7-1.3-7-3.8-.3-2.5 2.4-4.9 6-5.3 3.6-.4 6.7 1.3 7 3.8.3 2.5-2.4 4.9-6 5.3Zm.5-7.3c-2.6.3-4.6 1.9-4.4 3.7.2 1.7 2.4 2.9 5 2.6 2.6-.3 4.6-1.9 4.4-3.7-.2-1.7-2.4-2.9-5-2.6Z" />
      <path d="M17.3 9.1c.5.2.9.7.9 1.2 0 .3-.2.5-.5.4-.3-.1-.5-.4-.8-.5-.3-.1-.6-.1-.8-.3-.2-.2 0-.5.2-.6.3-.2.7-.3 1-.2Zm1.9-2.7c.9.4 1.6 1.2 1.7 2.2 0 .4-.3.7-.7.6-.3-.1-.5-.4-.7-.7-.2-.3-.5-.6-.8-.8-.3-.2-.7-.3-1-.5-.3-.2-.3-.6 0-.8.4-.3.9-.3 1.5 0Z" />
    </svg>
  )
}
