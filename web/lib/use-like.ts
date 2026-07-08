"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"

/**
 * 点赞 toggle hook：乐观更新 + 后端校正 + 失败回滚。
 * workId: 作品 id；initialIsLiked/initialLikes: 进入页面时后端返回的快照。
 */
export function useLike(workId: string, initialIsLiked: boolean, initialLikes: number) {
  const { loggedIn, user, setShowLoginModal } = useAuth()
  const [isLiked, setIsLiked] = useState(initialIsLiked)
  const [likes, setLikes] = useState(initialLikes)

  const toggleLike = async () => {
    // 未登录 → 弹登录框（匿名能看数不能点）
    if (!loggedIn || !user) {
      setShowLoginModal(true)
      return
    }
    const action = isLiked ? "unlike" : "like"
    const prevLiked = isLiked
    const prevLikes = likes
    // 乐观更新
    setIsLiked(!prevLiked)
    setLikes((l) => l + (prevLiked ? -1 : 1))
    try {
      const r = await fetch(`/api/works/${workId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action }),
      })
      const data = await r.json()
      if (data.ok) {
        setLikes(data.likes) // 用后端准确值校正
      } else {
        setIsLiked(prevLiked)
        setLikes(prevLikes)
      }
    } catch {
      setIsLiked(prevLiked)
      setLikes(prevLikes)
    }
  }

  return { isLiked, likes, toggleLike }
}
