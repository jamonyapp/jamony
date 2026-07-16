"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"

export type Notif = {
  id: number
  type: string
  notice_id: number | null
  notice_title: string | null
  comment_id: number | null
  comment_content: string | null
  actor_user_id: number | null
  actor_nickname: string | null
  count: number
  read_at: string | null
  created_at: string
  updated_at: string
}

type NotificationsContextValue = {
  unreadCount: number
  refreshUnread: () => void
  fetchList: () => Promise<Notif[]>
  markRead: (id: number) => Promise<void>
  markAllRead: (type?: string) => Promise<void>
  deleteNotif: (id: number) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// 全局通知 store：unreadCount 30s 轮询（红点），列表按需拉（点开抽屉）。
// 站内被动通知，无推送/dock红点（"不烦人"哲学）。边界：只同步自己操作；别人产生通知靠轮询发现。
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { loggedIn } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  const refreshUnread = useCallback(() => {
    if (!loggedIn) { setUnreadCount(0); return }
    fetch("/api/notifications/unread-count", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { if (data.ok) setUnreadCount(data.count) })
      .catch(() => {})
  }, [loggedIn])

  useEffect(() => {
    refreshUnread()
    if (!loggedIn) return
    const t = setInterval(refreshUnread, 30000)
    return () => clearInterval(t)
  }, [refreshUnread, loggedIn])

  const fetchList = useCallback(async () => {
    const r = await fetch("/api/notifications", { credentials: "include" })
    const data = await r.json()
    if (data.ok) { setUnreadCount(data.unreadCount); return (data.notifications || []) as Notif[] }
    return []
  }, [])

  const markRead = useCallback(async (id: number) => {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" })
    setUnreadCount((c) => Math.max(0, c - 1))
  }, [])

  const markAllRead = useCallback(async (type?: string) => {
    await fetch("/api/notifications/read-all", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ type }),
    })
    setUnreadCount(0)
  }, [])

  const deleteNotif = useCallback(async (id: number) => {
    await fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" })
    refreshUnread()
  }, [refreshUnread])

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnread, fetchList, markRead, markAllRead, deleteNotif }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider")
  return ctx
}
