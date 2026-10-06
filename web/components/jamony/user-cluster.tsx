"use client"

import { ChevronDown, LogOut, Mail, RefreshCw, Settings, User, LogIn } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useNotifications } from "@/lib/notifications-context"
import { useDM } from "@/lib/dm-context"
import { useRoomSession } from "@/lib/room-session"
import { Avatar } from "@/components/jamony/avatar"
import { NotificationDrawer } from "@/components/jamony/notification-drawer"
import { NoticeDetailModal } from "@/components/jamony/notice-detail-modal"
import { DisconnectDialog } from "@/components/playing/disconnect-dialog"
import { mapNotice } from "@/lib/notice-mappers"
import { type Notice } from "@/lib/jamony-data"

const menuItems = [
  { id: "profile", label: "个人主页", icon: User },
  { id: "settings", label: "设置", icon: Settings },
  { id: "logout", label: "退出登录", icon: LogOut },
]

// 右上角用户簇：刷新/通知信箱/头像下拉（或登录按钮）——从 TopNav 原样抽取（09-27 左栏常驻改造），
// TopNav(playing 页) 与 (shell) 布局共用一份，避免两处复制漂移
export function UserCluster({ onRefresh }: { onRefresh?: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<"none" | "user">("none")
  const [refreshing, setRefreshing] = useState(false)
  const { drawerOpen, openDrawer, closeDrawer } = useDM()
  const [globalNotice, setGlobalNotice] = useState<Notice | null>(null)
  const clusterRef = useRef<HTMLDivElement>(null)
  const { loggedIn, setShowLoginModal, logout, user } = useAuth()
  const { unreadCount, refreshUnread } = useNotifications()
  const { session, disconnectRoom } = useRoomSession()

  // 10-06 漫游改造：非 playing 页 + 有活跃房间 → 显示「回到房间/断开房间」
  // playing 页有自己的断开/返回出口，不重复展示
  const isPlayingRoute = /^\/room\/[^/]+\/playing/.test(pathname || "")
  const showRoomButtons = !isPlayingRoute && !!session

  // 断开确认弹窗（合奏者专属；听众直接断）与退出登录确认共用 DisconnectDialog，
  // pendingAction 区分确认后的动作
  const [pendingAction, setPendingAction] = useState<"none" | "disconnect" | "logout">("none")

  const handleDisconnectClick = () => {
    if (session?.role === "musician") setPendingAction("disconnect")
    else disconnectRoom()  // 听众无音频资产，直接断
  }

  const handleConfirm = async () => {
    const action = pendingAction
    setPendingAction("none")
    if (action === "none") return
    await disconnectRoom()  // 先 leave（需要登录 cookie），后动登录态
    if (action === "logout") {
      logout()
      router.push("/lobby")
    }
  }

  // 通知点击 → 全局弹公告详情（不跳转，任何页面都能看）
  const handleOpenNotice = async (noticeId: number) => {
    try {
      const r = await fetch(`/api/notices/${noticeId}`, { credentials: "include" })
      const data = await r.json()
      if (data.ok) { setGlobalNotice(mapNotice(data.notice)); closeDrawer() }
    } catch {}
  }
  const handleGlobalDelete = async (n: Notice) => {
    if (!confirm(`确认删除公告「${n.title}」？`)) return
    try {
      const res = await fetch(`/api/notices/${n.id}`, { method: "DELETE", credentials: "include" })
      const data = await res.json()
      if (data.ok) { setGlobalNotice(null); refreshUnread() }
      else alert(data.msg || "删除失败")
    } catch { alert("网络错误") }
  }

  useEffect(() => {
    if (openMenu === "none") return
    function handleClickOutside(e: MouseEvent) {
      if (clusterRef.current && !clusterRef.current.contains(e.target as Node)) {
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
    <div ref={clusterRef} className="flex items-center gap-3">
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

      {loggedIn ? (
        <>
          {/* 漫游态房间出口（10-06）：回到房间 / 断开房间 */}
          {showRoomButtons && (
            <>
              <div className="group relative">
                <button
                  onClick={() => router.push(`/room/${session!.code}/playing`)}
                  className="flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/5 active:scale-[0.97]"
                  style={{ borderColor: "#2A2A2A", borderWidth: 1.5, borderStyle: "solid" }}
                >
                  回到房间
                </button>
                {/* 房间名秒显 tooltip（照抄鼓机节奏型下拉的 group-hover 方案，替代原生 title 的 2-3s 延迟） */}
                <span
                  className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-50 rounded border bg-black px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100"
                  style={{ borderColor: "#333", whiteSpace: "nowrap" }}
                >
                  {session!.name}
                </span>
              </div>
              <button
                onClick={handleDisconnectClick}
                className="flex h-7 items-center rounded-lg px-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/5 active:scale-[0.97]"
                style={{ borderColor: "#2A2A2A", borderWidth: 1.5, borderStyle: "solid" }}
              >
                断开房间
              </button>
            </>
          )}

          {/* 通知 */}
          <div className="relative">
            <button
              aria-label="通知"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5"
              onClick={openDrawer}
            >
              <Mail className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: "#FF33AA" }} />
              )}
            </button>
          </div>
          <NotificationDrawer open={drawerOpen} onClose={closeDrawer} onOpenNotice={handleOpenNotice} />
          <NoticeDetailModal notice={globalNotice} onClose={() => setGlobalNotice(null)} onDelete={handleGlobalDelete} />

          {/* 头像 */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 rounded-lg p-0.5 transition-colors hover:bg-white/5"
              onClick={() => setOpenMenu((m) => (m === "user" ? "none" : "user"))}
            >
              <Avatar nickname={user?.nickname || "U"} avatarUrl={user?.avatarUrl} size={28} />
              <ChevronDown className="h-4 w-4" style={{ color: "#8A8A8A" }} />
            </button>

            {openMenu === "user" && (
              <div
                className="absolute right-0 top-[calc(100%+8px)] w-[200px] overflow-hidden rounded-xl border"
                style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
              >
                {/* 用户信息条 */}
                {user && (
                  <div className="border-b px-4 py-3" style={{ borderColor: "#1A1A1A" }}>
                    <p className="text-[14px] font-semibold text-white">{user.nickname}</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: "#8A8A8A" }}>
                      Lv.{user.level} · {user.points.toLocaleString()} 积分
                    </p>
                    <span
                      className="mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px]"
                      style={{ color: "#FF33AA", backgroundColor: "rgba(255,51,170,0.10)" }}
                    >
                      🎵 免费用户
                    </span>
                  </div>
                )}
                <div className="p-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[14px] transition-colors hover:bg-white/5"
                        style={{ color: "#E0E0E0" }}
                        onClick={() => {
                          if (item.id === "logout") {
                            setOpenMenu("none")
                            // 10-06：有活跃房间先弹断开确认（退出登录=断开连接语义，欢哥拍板复用弹窗）
                            if (session) { setPendingAction("logout"); return }
                            logout()
                            return
                          }
                          if (item.id === "profile" && user?.nickname) {
                            router.push(`/profile?nickname=${encodeURIComponent(user.nickname)}`)
                            return
                          }
                          if (item.id === "settings") {
                            router.push("/settings")
                            return
                          }
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
              </div>
            )}
          </div>
        </>
      ) : (
        <button
          onClick={() => setShowLoginModal(true)}
          className="flex items-center gap-1.5 rounded-[10px] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
        >
          <LogIn className="h-4 w-4" />
          登录 / 注册
        </button>
      )}

      {/* 断开房间/退出登录 共用确认弹窗（文案与合奏页返回弹窗一致，欢哥拍板复用） */}
      <DisconnectDialog
        open={pendingAction !== "none"}
        onCancel={() => setPendingAction("none")}
        onConfirm={handleConfirm}
        isListener={false}
      />
    </div>
  )
}
