"use client"

import { ChevronDown, LogOut, Megaphone, RefreshCw, Settings, User } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

const notifications = [
  { id: "n1", text: "「周五夜爵士」房间有 3 位新乐手加入。" },
  { id: "n2", text: "你的作品《Funk Jam #47》收到了 12 个新的赞。" },
  { id: "n3", text: "Lily 在公告牌回复了你：周末一起来排练吧！" },
  { id: "n4", text: "jamony 工作室发布了新版本更新。" },
]

const menuItems = [
  { id: "profile", label: "个人主页", icon: User },
  { id: "settings", label: "设置", icon: Settings },
  { id: "logout", label: "退出登录", icon: LogOut },
]

// 额外返回按钮组件 — 独立淡入淡出（进入慢 800ms、退出快 350ms）
function BackLinkButton({
  link,
  onBack,
  onClick,
}: {
  link: { label: string; href: string }
  onBack: (href: string) => void
  onClick?: () => void
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 30)
    return () => clearTimeout(t)
  }, [])

  const handleClick = () => {
    setShow(false)
    if (onClick) {
      setTimeout(onClick, 350)
    } else {
      setTimeout(() => { window.location.href = link.href }, 350)
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
  const isHome = pathname === "/"
  const [openMenu, setOpenMenu] = useState<"none" | "notifications" | "user">("none")
  const [refreshing, setRefreshing] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const handleBack = (href: string) => {
    setTimeout(() => { window.location.href = href }, 350)
  }

  const handleBackHome = () => {
    if (onBackHome) {
      onBackHome()
    } else {
      handleBack("/")
    }
  }

  useEffect(() => {
    if (openMenu === "none") return
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu("none")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openMenu])

  const handleRefresh = () => {
    if (refreshing || !onRefresh) return
    setRefreshing(true)
    onRefresh()
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <header
      ref={navRef}
      className="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-4 border-b px-4"
      style={{ background: "#000000", borderColor: "#1A1A1A" }}
    >
      {/* Left side: jamony logo + 返回按钮 */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[18px] font-bold tracking-tight text-white">
          jamony
        </span>

        {/* 返回首页 — 非首页始终可见，不淡出 */}
        {!isHome && (
          <button
            onClick={handleBackHome}
            className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
            style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
          >
            返回首页
          </button>
        )}

        {/* 额外返回按钮 — 各自独立淡入淡出 */}
        {backLinks?.map((link) => (
          <BackLinkButton key={link.href} link={link} onBack={handleBack} onClick={link.onClick} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="ml-auto flex items-center gap-3">
        {/* 刷新按钮 */}
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}

        {/* 通知 */}
        <div className="relative">
          <button
            aria-label="通知"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5"
            onClick={() => setOpenMenu((m) => (m === "notifications" ? "none" : "notifications"))}
          >
            <Megaphone className="h-[18px] w-[18px]" />
          </button>

          {openMenu === "notifications" && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-80 overflow-hidden rounded-xl border"
              style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
            >
              <div className="px-4 py-3">
                <h3 className="text-[14px] font-bold text-white">通知</h3>
              </div>
              <div className="border-t" style={{ borderColor: "#1A1A1A" }}>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    className="block w-full border-b px-4 py-3 text-left text-[13px] transition-colors last:border-b-0 hover:bg-white/[0.03]"
                    style={{ borderColor: "#1A1A1A", color: "#C8C8C8" }}
                    onClick={() => console.log("[v0] open notification", n.id)}
                  >
                    {n.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 头像 */}
        <div className="relative">
          <button
            className="flex items-center gap-1.5 rounded-lg p-0.5 transition-colors hover:bg-white/5"
            onClick={() => setOpenMenu((m) => (m === "user" ? "none" : "user"))}
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF, #FF33AA)" }}
            >
              U
            </span>
            <ChevronDown className="h-4 w-4" style={{ color: "#8A8A8A" }} />
          </button>

          {openMenu === "user" && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] w-[180px] overflow-hidden rounded-xl border p-1"
              style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
            >
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[14px] transition-colors hover:bg-white/5"
                    style={{ color: "#E0E0E0" }}
                    onClick={() => {
                      console.log("[v0] user menu:", item.id)
                      setOpenMenu("none")
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
