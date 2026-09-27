"use client"

import { useEffect, type ReactNode } from "react"
import { usePlayer } from "@/components/jamony/player-context"

// 进入合奏页自动停止作品播放器，清空 current
// （09-27 左栏常驻改造：准备页已搬进 app/(shell)/room/[code]/，本 layout 现在只包 playing；
// 两个 layout 各持一份 stop()，语义不变——进任何 /room 页都停作品播放）
// 合奏场景与作品回放隔离，PlayerBar 在 /room 路由下也不渲染
export default function RoomLayout({ children }: { children: ReactNode }) {
  const { stop } = usePlayer()
  useEffect(() => {
    stop()
  }, [stop])
  return <>{children}</>
}
