"use client"

import { ChevronDown, LogOut, Megaphone, Search, Settings, User } from "lucide-react"
import { useRouter } from "next/navigation"
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

export function TopNav() {
  const router = useRouter()
  const [openMenu, setOpenMenu] = useState<"none" | "notifications" | "user">("none")
  const navRef = useRef<HTMLElement>(null)

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

  return (
    <header
      ref={navRef}
      className="fixed inset-x-0 top-0 z-50 flex h-11 items-center gap-4 border-b px-4"
      style={{ background: "#000000", borderColor: "#1A1A1A" }}
    >
      <button
        className="shrink-0 text-[18px] font-bold tracking-tight text-white transition-transform active:scale-95"
        onClick={() => router.push("/")}
      >
        jamony
      </button>

      <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: "#2A2A2A" }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: "#555555" }} />
        <span className="truncate text-[13px]" style={{ color: "#555555" }}>
          搜房间、公告、用户、作品...
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
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
