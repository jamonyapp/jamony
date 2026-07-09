"use client"

import { hashGradient } from "@/lib/jamony-data"

/**
 * 统一头像组件：有 avatarUrl 显示真图（圆形），无则 hash 渐变 + 首字母兜底。
 * hash 按 nickname 生成稳定渐变，每个用户固定一色，刷新不变。
 */
export function Avatar({
  nickname,
  avatarUrl,
  size = 40,
  className = "",
}: {
  nickname: string
  avatarUrl?: string
  size?: number
  className?: string
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={nickname}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold text-black ${className}`}
      style={{ width: size, height: size, background: hashGradient(nickname), fontSize: Math.round(size * 0.4) }}
    >
      {nickname.charAt(0)}
    </div>
  )
}
