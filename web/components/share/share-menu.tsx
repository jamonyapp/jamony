"use client"

import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import { Link2, X } from "lucide-react"

// 1110b 欢哥定稿交互: 点「分享」先出下拉菜单(分享到微信/微博/复制链接,各项带 logo),
// 选微信=二级 QR 卡片(扫码即达公开落地页);选微博=壳内 openExternal 跳系统浏览器;
// 复制=壳 clipboard 优先。落地页 https://jamonyapp.com/share/works/<id>(自定义卡片由落地页 wx.config 负责)。
// 菜单面板=absolute 定位,调用方把触发按钮包进 relative 容器;点遮罩任意处关闭。
export function ShareMenu({ open, onClose, workId, title }: { open: boolean; onClose: () => void; workId: string | number; title: string }) {
  const [stage, setStage] = useState<"menu" | "qr">("menu")
  const [qr, setQr] = useState("")
  const [copyFailed, setCopyFailed] = useState(false)
  // 1110e 欢哥定稿: 复制成功=淡入淡出 toast+菜单即收(组件保持挂载至 toast 退场)
  const [toastMounted, setToastMounted] = useState(false)
  const [toastShown, setToastShown] = useState(false)
  // 1023 遮罩拖出误关范式: mousedown 与 click 都落在遮罩上才算「点遮罩关闭」
  const overlayRef = useRef<HTMLDivElement>(null)
  const downOnOverlay = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shareUrl = `https://jamonyapp.com/share/works/${workId}`

  useEffect(() => {
    if (!open) return
    setStage("menu")
    setCopyFailed(false)
    QRCode.toDataURL(shareUrl, { width: 400, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(""))
  }, [open, shareUrl])

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // 站内 toast 范式(1103 upload-toast 同款): 5s 自动淡出+叉子可提前关
  const showToast = () => {
    setToastMounted(true)
    requestAnimationFrame(() => setToastShown(true))
    toastTimer.current = setTimeout(() => {
      setToastShown(false)
      toastTimer.current = setTimeout(() => setToastMounted(false), 350)
    }, 5000)
  }

  const dismissToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToastShown(false)
    toastTimer.current = setTimeout(() => setToastMounted(false), 350)
  }

  const toastEl = toastMounted ? (
    <div
      // 视觉=upload-toast 同款(brand-pink/8px/xs/图标+叉子);位置=屏幕下中(分享动作无面板容器可挂)
      className={`fixed bottom-10 left-1/2 z-[70] flex -translate-x-1/2 items-center justify-center gap-2 rounded-[8px] bg-brand-pink/70 px-3 py-1 text-xs font-medium leading-tight text-white shadow-md transition-opacity duration-300 ${toastShown ? "opacity-100" : "opacity-0"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <Link2 className="size-3 shrink-0" />
      复制成功
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          dismissToast()
        }}
        title="关闭"
        className="absolute right-1.5 grid size-4 place-items-center rounded-[6px] text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X className="size-2.5" />
      </button>
    </div>
  ) : null

  const weibo = () => {
    // 1110e 欢哥定稿文案(网易云同构): 分享{作品名} {url} （分享自 @jamony）——url 走独立参数,微博自动附链接卡片
    const url = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(`分享${title} （分享自 @jamony）`)}`
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
    if (ok) {
      showToast()
      onClose()
    } else {
      setCopyFailed(true)
    }
  }

  if (stage === "menu" && open) {
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
        {toastEl}
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
            {copyFailed ? "复制失败,请重试" : "复制链接"}
          </button>
        </div>
      </>
    )
  }

  // 已收起(toast 可能还在淡出途中)——只留 toast
  if (!open) return <>{toastEl}</>

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
      {toastEl}
    </div>
  )
}

// 微信 logo(simple-icons 官方 path,CC0;品牌绿)
function WechatLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#07C160" aria-hidden>
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  )
}

// 微博 logo(simple-icons 官方 path,CC0;品牌红)
function WeiboLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#E6162D" aria-hidden>
      <path d="M10.098 20.323c-3.977.391-7.414-1.406-7.672-4.02-.259-2.609 2.759-5.047 6.74-5.441 3.979-.394 7.413 1.404 7.671 4.018.259 2.6-2.759 5.049-6.737 5.439l-.002.004zM9.05 17.219c-.384.616-1.208.884-1.829.602-.612-.279-.793-.991-.406-1.593.379-.595 1.176-.861 1.793-.601.622.263.82.972.442 1.592zm1.27-1.627c-.141.237-.449.353-.689.253-.236-.09-.313-.361-.177-.586.138-.227.436-.346.672-.24.239.09.315.36.18.601l.014-.028zm.176-2.719c-1.893-.493-4.033.45-4.857 2.118-.836 1.704-.026 3.591 1.886 4.21 1.983.64 4.318-.341 5.132-2.179.8-1.793-.201-3.642-2.161-4.149zm7.563-1.224c-.346-.105-.57-.18-.405-.615.375-.977.42-1.804 0-2.404-.781-1.112-2.915-1.053-5.364-.03 0 0-.766.331-.571-.271.376-1.217.315-2.224-.27-2.809-1.338-1.337-4.869.045-7.888 3.08C1.309 10.87 0 13.273 0 15.348c0 3.981 5.099 6.395 10.086 6.395 6.536 0 10.888-3.801 10.888-6.82 0-1.822-1.547-2.854-2.915-3.284v.01zm1.908-5.092c-.766-.856-1.908-1.187-2.96-.962-.436.09-.706.511-.616.932.09.42.511.691.932.602.511-.105 1.067.044 1.442.465.376.421.466.977.316 1.473-.136.406.089.856.51.992.405.119.857-.105.992-.512.33-1.021.12-2.178-.646-3.035l.03.045zm2.418-2.195c-1.576-1.757-3.905-2.419-6.054-1.968-.496.104-.812.587-.706 1.081.104.496.586.813 1.082.707 1.532-.331 3.185.15 4.296 1.383 1.112 1.246 1.429 2.943.947 4.416-.165.48.106 1.007.586 1.157.479.165.991-.104 1.157-.586.675-2.088.241-4.478-1.338-6.235l.03.045z" />
    </svg>
  )
}
