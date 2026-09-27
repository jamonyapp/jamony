"use client"

import { useEffect, type ReactNode } from "react"
import { usePlayer } from "@/components/jamony/player-context"

// 进入房间准备页自动停止作品播放器，清空 current（09-27 左栏常驻改造：
// 准备页搬进 (shell) 后，app/room/layout.tsx 不再覆盖本页，stop() 语义在此续接；
// 合奏场景与作品回放隔离，PlayerBar 在 /room 路由下也不渲染）
export default function RoomPrepLayout({ children }: { children: ReactNode }) {
  const { stop } = usePlayer()
  useEffect(() => {
    stop()
  }, [stop])
  return <>{children}</>
}
