"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { UserCluster } from "@/components/jamony/user-cluster"

// 额外返回按钮 — 入场淡入各自独立（30ms 延迟起 800ms 淡入）；
// 出场淡出由 TopNav 统一驱动（exiting，与「返回首页」同步消失，10-07 欢哥定稿）
function BackLinkButton({
  link,
  exiting,
  onNavigate,
}: {
  link: { label: string; href: string }
  exiting: boolean
  onNavigate: (href: string) => void
}) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 30)
    return () => clearTimeout(t)
  }, [])

  const visible = entered && !exiting
  return (
    <div
      style={{
        transition: visible
          ? "opacity 800ms ease-out, visibility 800ms ease-out"
          : "opacity 350ms ease-in, visibility 350ms ease-in",
        visibility: visible ? "visible" : "hidden",
        opacity: visible ? 1 : 0,
      }}
    >
      <button
        onClick={() => onNavigate(link.href)}
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
// 10-07 漫游改造：返回按钮全部为纯导航（房间保持连接），onBackHome/backLinks.onClick 旧钩子已废弃移除。
export function TopNav({
  onRefresh,
  backLinks,
}: {
  onRefresh?: () => void
  backLinks?: { label: string; href: string }[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/"

  // showBack: 返回首页按钮的淡入
  // 从首页来 → false→setTimeout→true（800ms 淡入）
  // 从非首页来 → 直接 true（跳过淡入）
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

  // exiting: 点任意返回按钮 → 所有返回按钮同步淡出（350ms）→ 跳转目标页
  const [exiting, setExiting] = useState(false)
  const navigateAway = (href: string) => {
    if (exiting) return
    setExiting(true)
    setTimeout(() => { router.push(href) }, 350)
  }

  const backVisible = showBack && !exiting

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

        {/* 返回首页 — showBack 淡入 + exiting 统一淡出 */}
        <div
          style={{
            transition: backVisible
              ? "opacity 800ms ease-out, visibility 800ms ease-out"
              : "opacity 350ms ease-in, visibility 350ms ease-in",
            visibility: backVisible ? "visible" : "hidden",
            opacity: backVisible ? 1 : 0,
          }}
        >
          {!isHome && (
            <button
              onClick={() => navigateAway("/")}
              className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
              style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
            >
              返回首页
            </button>
          )}
        </div>

        {/* 额外返回按钮 — 各自淡入，exiting 统一淡出 */}
        {backLinks?.map((link) => (
          <BackLinkButton key={link.href} link={link} exiting={exiting} onNavigate={navigateAway} />
        ))}
      </div>

      <div className="flex-1" />

      <UserCluster onRefresh={onRefresh} />
    </header>
  )
}
