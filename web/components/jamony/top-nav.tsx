"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { UserCluster } from "@/components/jamony/user-cluster"

// 额外返回按钮组件 — 独立淡入淡出（进入慢 800ms、退出快 350ms）
function BackLinkButton({
  link,
  onClick,
}: {
  link: { label: string; href: string }
  onClick?: () => void
}) {
  const router = useRouter()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 30)
    return () => clearTimeout(t)
  }, [])

  const handleClick = () => {
    if (onClick) {
      // jamony: 有 onClick（弹窗确认）不淡出，选"继续合奏"按钮还在
      onClick()
    } else {
      setShow(false)
      setTimeout(() => { router.push(link.href) }, 350)
    }
  }

  return (
    <div
      style={{
        transition: show
          ? "opacity 800ms ease-out, visibility 800ms ease-out"
          : "opacity 350ms ease-in, visibility 350ms ease-in",
        visibility: show ? "visible" : "hidden",
        opacity: show ? 1 : 0,
      }}
    >
      <button
        onClick={handleClick}
        className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
        style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
      >
        {link.label}
      </button>
    </div>
  )
}

// 顶栏：仅 /room/[code]/playing（合奏页）使用——logo+返回首页+backLinks+用户簇。
// 09-27 左栏常驻改造后，(shell) 页面不再渲染本组件（改用 LeftSidebar+UserCluster 的壳布局），
// 右侧用户簇与壳共用 UserCluster 一份，视觉零变化。
export function TopNav({
  onRefresh,
  backLinks,
  onBackHome,
}: {
  onRefresh?: () => void
  backLinks?: { label: string; href: string; onClick?: () => void }[]
  onBackHome?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/"

  // showBack: 返回首页按钮的淡入淡出
  // 从首页来 → false→setTimeout→true（800ms 淡入）
  // 从非首页来 → 直接 true（跳过淡入）
  // 点击返回首页 → false（350ms 淡出）
  const [showBack, setShowBack] = useState(false)

  // 首页页面存标记，子页面检查标记判断是否来自首页
  useEffect(() => {
    if (isHome) {
      setShowBack(false)
      sessionStorage.setItem('_jhf', '1')
      return
    }
    const fromHome = sessionStorage.getItem('_jhf')
    if (fromHome === '1') {
      sessionStorage.removeItem('_jhf')
      const t = setTimeout(() => setShowBack(true), 30)
      return () => clearTimeout(t)
    } else {
      setShowBack(true)
    }
  }, [isHome])

  const handleBackHome = () => {
    if (onBackHome) {
      onBackHome()
    } else {
      setShowBack(false)
      setTimeout(() => { router.push("/") }, 350)
    }
  }

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-4 border-b px-4"
      style={{ background: "#000000", borderColor: "#1A1A1A" }}
    >
      {/* Left side: jamony logo + 返回按钮 */}
      <div className="flex items-center gap-2">
        <img src="/jamony_logo.png" alt="jamony" className="h-7 w-auto" />
        <span className="shrink-0 text-[18px] font-bold tracking-tight text-white">
          jamony
        </span>

        {/* 返回首页 — showBack 容器，初始 true，仅点击首页时淡出 */}
        <div
          style={{
            transition: showBack
              ? "opacity 800ms ease-out, visibility 800ms ease-out"
              : "opacity 350ms ease-in, visibility 350ms ease-in",
            visibility: showBack ? "visible" : "hidden",
            opacity: showBack ? 1 : 0,
          }}
        >
          {!isHome && (
            <button
              onClick={handleBackHome}
              className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
              style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
            >
              返回首页
            </button>
          )}
        </div>

        {/* 额外返回按钮 — 各自独立淡入淡出 */}
        {backLinks?.map((link) => (
          <BackLinkButton key={link.href} link={link} onClick={link.onClick} />
        ))}
      </div>

      <div className="flex-1" />

      <UserCluster onRefresh={onRefresh} />
    </header>
  )
}
