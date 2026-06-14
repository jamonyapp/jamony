"use client"

import { ArrowLeft, Users, Signal } from "lucide-react"
import { ROOM } from "@/lib/jam-data"

export function TopNav({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
      <button
        onClick={onBack}
        className="flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        返回大厅
      </button>

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
