"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"

type LikeState = { isLiked: boolean; likes: number }

type LikesContextValue = {
  /** 读某作品的点赞状态；store 没有时返回 undefined（调用方用 fetch 快照兜底） */
  getLike: (workId: string) => LikeState | undefined
  /** 点赞/取消：乐观更新全局 store + 后端校正 + 失败回滚。fallback 为 fetch 快照，store 没有时用它 */
  toggleLike: (workId: string, fallback: LikeState) => void
}

const LikesContext = createContext<LikesContextValue | null>(null)

/**
 * 全局点赞状态 store：所有 LikeButton 共享一份，一处点赞全站同步。
 * 边界：只同步"自己操作"的状态；别人点赞需刷新页面（无 socket）。
 */
export function LikesProvider({ children }: { children: ReactNode }) {
  const { loggedIn, user, setShowLoginModal } = useAuth()
  const [store, setStore] = useState<Record<string, LikeState>>(() => {
    // lazy init 从 localStorage 恢复，整页刷新后 store 不丢（解决返回首页整页刷新 isLiked 丢失）
    if (typeof window === "undefined") return {}
    try {
      const saved = localStorage.getItem("jamony_likes")
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  // store 变化同步到 localStorage
  useEffect(() => {
    try { localStorage.setItem("jamony_likes", JSON.stringify(store)) } catch {}
  }, [store])

  const getLike = useCallback((workId: string) => store[workId], [store])

  const toggleLike = useCallback((workId: string, fallback: LikeState) => {
    // 未登录 → 弹登录框（匿名能看数不能点）
    if (!loggedIn || !user) {
      setShowLoginModal(true)
      return
    }
    const current = store[workId] ?? fallback
    const action = current.isLiked ? "unlike" : "like"
    const optimistic: LikeState = {
      isLiked: !current.isLiked,
      likes: current.likes + (current.isLiked ? -1 : 1),
    }
    // 乐观更新
    setStore((s) => ({ ...s, [workId]: optimistic }))
    fetch(`/api/works/${workId}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, action }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          // 后端准确值校正
          setStore((s) => ({ ...s, [workId]: { isLiked: optimistic.isLiked, likes: data.likes } }))
        } else {
          setStore((s) => ({ ...s, [workId]: current }))
        }
      })
      .catch(() => {
        setStore((s) => ({ ...s, [workId]: current }))
      })
  }, [store, loggedIn, user, setShowLoginModal])

  return (
    <LikesContext.Provider value={{ getLike, toggleLike }}>
      {children}
    </LikesContext.Provider>
  )
}

export function useLikes() {
  const ctx = useContext(LikesContext)
  if (!ctx) throw new Error("useLikes must be used within LikesProvider")
  return ctx
}
