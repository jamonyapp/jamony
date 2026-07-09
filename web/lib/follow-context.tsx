"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"

type FollowContextValue = {
  /** 读是否关注某用户；store 权威（登录后拉了全部关注列表） */
  isFollowing: (userId: number) => boolean
  /** 关注/取关：乐观更新 + 后端校正 + 失败回滚；返回 toggle 后的新状态 */
  toggleFollow: (userId: number) => Promise<boolean>
  /** store 是否已初始化（登录后拉取完成） */
  ready: boolean
}

const FollowContext = createContext<FollowContextValue | null>(null)

/**
 * 全局关注状态 store：所有 FollowButton 共享一份，一处关注全站同步。
 * 登录后 fetch /api/me/following 一次性拉取关注列表填 store（全站按钮初始态准确）。
 * localStorage 持久化，整页刷新不丢（Electron 客户端场景）。
 * 边界：只同步"自己操作"的状态；别人关注/取关需刷新页面（无 socket）。
 */
export function FollowProvider({ children }: { children: ReactNode }) {
  const { loggedIn, user, setShowLoginModal } = useAuth()
  const [store, setStore] = useState<Record<number, boolean>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const saved = localStorage.getItem("jamony_following")
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try { localStorage.setItem("jamony_following", JSON.stringify(store)) } catch {}
  }, [store])

  // 登录后拉取我关注的用户列表，填充 store
  useEffect(() => {
    if (!loggedIn || !user) { setReady(true); return }
    fetch("/api/me/following")
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const next: Record<number, boolean> = {}
          data.following.forEach((id: number) => { next[id] = true })
          setStore(next)
        }
        setReady(true)
      })
      .catch(() => setReady(true))
  }, [loggedIn, user])

  const isFollowing = useCallback((userId: number) => !!store[userId], [store])

  const toggleFollow = useCallback((userId: number): Promise<boolean> => {
    if (!loggedIn || !user) {
      setShowLoginModal(true)
      return Promise.resolve(false)
    }
    const current = !!store[userId]
    const next = !current
    // 乐观更新
    setStore((s) => ({ ...s, [userId]: next }))
    return fetch(`/api/users/${userId}/follow`, { method: current ? "DELETE" : "POST" })
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          setStore((s) => ({ ...s, [userId]: current }))
          return current
        }
        return next
      })
      .catch(() => {
        setStore((s) => ({ ...s, [userId]: current }))
        return current
      })
  }, [store, loggedIn, user, setShowLoginModal])

  return (
    <FollowContext.Provider value={{ isFollowing, toggleFollow, ready }}>
      {children}
    </FollowContext.Provider>
  )
}

export function useFollow() {
  const ctx = useContext(FollowContext)
  if (!ctx) throw new Error("useFollow must be used within FollowProvider")
  return ctx
}
