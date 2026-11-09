"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"

// 1110 作品分享弹窗(品牌弹窗体系,1018 风格): 三件套=二维码(本地生成,零成本)/
// 微博(壳内走 openExternal 跳系统浏览器——webRequest 白名单会拦壳内 window.open 外域)/
// 复制链接(壳内优先 Electron clipboard,浏览器 navigator.clipboard 兜底)。
// 分享 URL=公开落地页 https://jamonyapp.com/share/works/<id>(微信扫码即达,自定义卡片由落地页 wx.config 负责)。
export function ShareDialog({ open, onClose, workId, title }: { open: boolean; onClose: () => void; workId: string | number; title: string }) {
  const [qr, setQr] = useState("")
  const [copied, setCopied] = useState(false)
  // 1023 遮罩拖出误关范式: mousedown 与 click 都落在遮罩上才算「点遮罩关闭」,框内拖出不算
  const overlayRef = useRef<HTMLDivElement>(null)
  const downOnOverlay = useRef(false)

  const shareUrl = `https://jamonyapp.com/share/works/${workId}`

  useEffect(() => {
    if (!open) return
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
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === overlayRef.current
      }}
      onClick={(e) => {
        if (e.target === overlayRef.current && downOnOverlay.current) onClose()
      }}
    >
      <div className="w-full max-w-xs rounded-xl border border-white/10 bg-[#0D0D0D] p-5">
        <div className="text-center text-sm font-semibold text-white">分享作品</div>
        <div className="mt-3 flex justify-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- 本地 dataURL 二维码
            <img src={qr} alt="分享二维码" className="h-44 w-44 rounded-lg" />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-lg bg-white/10" />
          )}
        </div>
        <div className="mt-2 text-center text-xs text-[#8A8A8A]">微信扫码，转发给好友 / 朋友圈</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={weibo} className="rounded-full bg-white/10 py-2 text-sm text-white transition-colors hover:bg-white/20 active:bg-white/25">
            分享到微博
          </button>
          <button type="button" onClick={copy} className="rounded-full bg-white/10 py-2 text-sm text-white transition-colors hover:bg-white/20 active:bg-white/25">
            {copied ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full py-1 text-center text-xs text-[#8A8A8A] hover:text-white">
          关闭
        </button>
      </div>
    </div>
  )
}
