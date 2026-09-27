"use client"

import { useEffect, type ReactNode } from "react"
import { usePlayer } from "@/components/jamony/player-context"

// 进入合奏页自动暂停作品播放（09-27 欢哥：由 stop 改 pause——停声但记住曲目，
// 离开房间后底部 PlayerBar 继续显示之前在听的内容，点播放可续播）
// （准备页在 app/(shell)/room/[code]/，本 layout 只包 playing；两个 layout 各持一份）
// 合奏场景与作品回放隔离，PlayerBar 在 /room 路由下也不渲染（pathname 挡住）
export default function RoomLayout({ children }: { children: ReactNode }) {
  const { pause } = usePlayer()
  useEffect(() => {
    pause()
  }, [pause])
  return <>{children}</>
}
