"use client"

import { Heart } from "lucide-react"
import { useLikes } from "@/lib/likes-context"

/**
 * 点赞按钮：红色空心 → 点击变实心红心 + 数字+1，再点取消。
 * 状态来自全局 LikesProvider（全站同步）：store 有该作品读 store，否则用 fetch 快照兜底。
 * - 未登录点击弹登录框（匿名能看数不能点）
 * - active:scale-125 点击弹跳动效
 */
export function LikeButton({
  workId,
  isLiked,
  likes,
  iconClass = "h-3 w-3",
  stopClick = false,
}: {
  workId: string
  isLiked: boolean
  likes: number
  iconClass?: string
  /** 嵌在可点击卡片里时阻止冒泡（避免触发卡片播放） */
  stopClick?: boolean
}) {
  const { getLike, toggleLike } = useLikes()
  const fallback = { isLiked, likes }
  const state = getLike(workId) ?? fallback

  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopClick) e.stopPropagation()
        toggleLike(workId, fallback)
      }}
      aria-pressed={state.isLiked}
      aria-label={state.isLiked ? "取消点赞" : "点赞"}
      className="flex items-center gap-0.5 transition-transform active:scale-125"
    >
      <Heart
        className={iconClass}
        style={{ color: "#FF33AA" }}
        fill={state.isLiked ? "#FF33AA" : "none"}
      />
      <span>{state.likes}</span>
    </button>
  )
}
