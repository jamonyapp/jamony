"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

type CommentsContextValue = {
  /** 读某作品的评论数；store 没有时返回 undefined（调用方用 fetch 快照兜底） */
  getCount: (workId: string) => number | undefined
  /** 发表/删除评论后调整计数（delta +1/-1）；fallback 为 fetch 快照，store 没有时基于它算 */
  adjustCount: (workId: string, delta: number, fallback: number) => void
}

const CommentsContext = createContext<CommentsContextValue | null>(null)

/**
 * 全局评论数 store：发表/删除评论后全站各位置评论数同步。
 * 持久化 localStorage，整页刷新后不丢。边界：只同步自己操作；别人评论需刷新页面。
 */
export function CommentsProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const saved = localStorage.getItem("jamony_comment_counts")
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  useEffect(() => {
    try { localStorage.setItem("jamony_comment_counts", JSON.stringify(store)) } catch {}
  }, [store])

  const getCount = useCallback((workId: string) => store[workId], [store])

  const adjustCount = useCallback((workId: string, delta: number, fallback: number) => {
    setStore((s) => {
      const current = s[workId] ?? fallback
      return { ...s, [workId]: Math.max(0, current + delta) }
    })
  }, [])

  return (
    <CommentsContext.Provider value={{ getCount, adjustCount }}>
      {children}
    </CommentsContext.Provider>
  )
}

export function useComments() {
  const ctx = useContext(CommentsContext)
  if (!ctx) throw new Error("useComments must be used within CommentsProvider")
  return ctx
}
