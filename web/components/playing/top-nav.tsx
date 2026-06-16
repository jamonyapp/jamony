"use client"

import { Users, Signal } from "lucide-react"
import { ROOM } from "@/lib/jam-data"

export function TopNav({
  audioConnected,
  onBackHome,
  onBackLobby,
}: {
  audioConnected: boolean
  onBackHome: () => void
  onBackLobby: () => void
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
      {/* 左侧按钮区 — 始终显示 [返回首页] [返回大厅] */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBackHome}
          className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
        >
          返回首页
        </button>
        <button
          onClick={onBackLobby}
          className="rounded-md border px-2 py-[2px] text-[12px] font-normal transition-colors active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#6A6A6A" }}
        >
          返回大厅
        </button>
      </div>

      <div className="flex items-center gap-2 text-balance text-center">
        <span className="text-lg">{ROOM.styleEmoji}</span>
        <h1 className="text-sm font-semibold tracking-tight sm:text-base">{ROOM.name}</h1>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-[10px] bg-secondary px-2.5 py-1.5 text-muted-foreground">
          <Users className="size-4 text-brand-blue" />
          <span className="font-medium text-foreground">
            {ROOM.online}/{ROOM.capacity}
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-[10px] bg-secondary px-2.5 py-1.5 text-muted-foreground">
          <Signal className="size-4 text-brand-green" />
          <span className="font-medium text-foreground">{ROOM.latencyMs}ms</span>
        </span>
      </div>
    </header>
  )
}
