"use client"

import { UserPlus, UserCheck } from "lucide-react"
import { useFollow } from "@/lib/follow-context"

/**
 * 关注按钮：渐变实心"关注" → 点击变描边"已关注"，再点取关。
 * 状态来自全局 FollowProvider（登录后拉了关注列表，全站同步）：
 * - store ready 后用 store（权威）；未 ready 用 initialIsFollowing 兜底
 * - 未登录点击弹登录框
 * - onAfterToggle：toggle 完成后回调（主页用于刷新粉丝计数）
 */
export function FollowButton({
  targetUserId,
  initialIsFollowing = false,
  onAfterToggle,
  size = "default",
}: {
  targetUserId: number
  initialIsFollowing?: boolean
  onAfterToggle?: (isFollowing: boolean) => void
  size?: "default" | "small"
}) {
  const { isFollowing, toggleFollow, ready } = useFollow()
  const following = ready ? isFollowing(targetUserId) : initialIsFollowing
  const small = size === "small"

  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        const newState = await toggleFollow(targetUserId)
        onAfterToggle?.(newState)
      }}
      className={`flex items-center justify-center gap-1 rounded-full font-medium transition-colors ${
        small ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12px]"
      } ${
        following
          ? "border border-[#2A2A2A] text-[#9A9A9A] hover:border-[#FF5C5C]/40 hover:text-[#FF5C5C]"
          : "text-white hover:opacity-90"
      }`}
      style={following ? {} : { background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
    >
      {following ? (
        <>
          <UserCheck className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
          已关注
        </>
      ) : (
        <>
          <UserPlus className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
          关注
        </>
      )}
    </button>
  )
}
