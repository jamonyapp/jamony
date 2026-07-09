"use client"

import { useEffect, type ReactNode } from "react"
import { usePlayer } from "@/components/jamony/player-context"

// 进入房间（准备页 / 合奏中）自动停止作品播放器，清空 current
// 合奏场景与作品回放隔离，PlayerBar 在 /room 路由下也不渲染
export default function RoomLayout({ children }: { children: ReactNode }) {
  const { stop } = usePlayer()
  useEffect(() => {
    stop()
  }, [stop])
  return <>{children}</>
}
