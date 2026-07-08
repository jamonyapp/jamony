"use client"

import { MessageCircle } from "lucide-react"
import { useComments } from "@/lib/comments-context"

/**
 * 评论数显示：数字来自全局 CommentsProvider（store 优先，fetch 快照兜底）。
 * 发表/删除评论后 store 更新，全站各位置自动同步。
 * - onClick 有值时渲染为 button（可点，如跳详情页），否则为 span（纯展示）
 */
export function CommentCount({
  workId,
  count,
  iconClass = "h-3 w-3",
  onClick,
  stopClick = false,
}: {
  workId: string
  count: number
  iconClass?: string
  onClick?: () => void
  stopClick?: boolean
}) {
  const { getCount } = useComments()
  const n = getCount(workId) ?? count
  const inner = (
    <>
      <MessageCircle className={iconClass} />
      <span>{n}</span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          if (stopClick) e.stopPropagation()
          onClick()
        }}
        className="flex items-center gap-0.5"
      >
        {inner}
      </button>
    )
  }
  return <span className="flex items-center gap-0.5">{inner}</span>
}
