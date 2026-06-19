"use client"

import { Crown, Lock } from "lucide-react"
import type { Room } from "@/lib/rooms-data"

export function RoomCard({ room, onSelect }: { room: Room; onSelect?: () => void }) {
  const isFull = room.current >= room.capacity
  const isNearFull = !isFull && room.current >= room.capacity - 1
  const latencyColor = room.latency >= 30 ? "text-[#ffb84d]" : "text-brand-lime"

  const handleClick = () => {
    if (!onSelect) return
    onSelect()
  }

  return (
    <button type="button" onClick={handleClick}
      className={`group relative flex w-full flex-col gap-3 rounded-[10px] border border-border bg-card p-5 text-left transition-all duration-200 ${
        isFull ? "opacity-80" : "hover:-translate-y-0.5 hover:border-transparent active:scale-[0.985]"
      } ${room.isPrivate ? "opacity-90" : ""}`}>
      {!isFull && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ padding: "1px", background: "var(--brand-gradient)", WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude", boxShadow: "0 0 24px -6px rgba(153,51,255,0.5)" }} />
      )}
      <div className="flex items-center justify-between">
        {room.isPrivate ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" />私密</span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="h-2 w-2 rounded-full bg-brand-lime shadow-[0_0_8px_var(--brand-lime)]" />公开
          </span>
        )}
        <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
          {isFull ? <span className="rounded-md bg-destructive/15 px-1.5 py-0.5 text-xs text-destructive">已满</span> : null}
          <span className={isFull ? "text-destructive" : isNearFull ? "text-[#ffb84d]" : "text-foreground"}>
            {room.current}/{room.capacity}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-xl">{room.emoji}</span>
        <h3 className="text-lg font-bold leading-tight text-foreground">{room.name}</h3>
      </div>
      <div>
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs text-white/90"
          style={{ background: "linear-gradient(var(--card), var(--card)) padding-box, var(--brand-gradient) border-box", border: "1px solid transparent" }}>
          {room.style}
        </span>
      </div>
      <p className="truncate text-sm text-muted-foreground">{room.description}</p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{room.owner.name}</span>
        <span className="flex items-center gap-1 rounded-full bg-[#ffb84d]/15 px-2 py-0.5 text-[11px] font-medium text-[#ffb84d]">
          <Crown className="h-3 w-3" />房主
        </span>
      </div>
      <div className="flex items-center gap-1 text-lg leading-none">
        {room.instruments.map((inst, i) => (<span key={i} aria-hidden>{inst}</span>))}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
        <span className={`text-xs font-medium ${latencyColor}`}>延迟 ≈ {room.latency}ms</span>
      </div>
    </button>
  )
}
