"use client"

import { useEffect, useRef, useState } from "react"
import { Crown, Lock, User, Headphones } from "lucide-react"
import type { Room } from "@/lib/rooms-data"
import { Avatar } from "@/components/jamony/avatar"
import { ProficiencyBadge } from "@/components/proficiency-badge"

export function RoomCard({ room, onSelect }: { room: Room; onSelect?: () => void }) {
  const isFull = room.current >= room.capacity

  // 1110 欢哥: 标题气泡限真截断才渲染（scrollWidth 实测+ResizeObserver 跟随，同构
  // hover-fullname 1016 / 公告牌 1110a）；房间描述气泡删除+「... 更多」常驻引导——
  // 点击卡片开 RoomDetailModal 看详情，描述气泡冗余且 absolute+opacity-0 气泡盒
  // 参与文档滚动区计算会撑出幽灵空白
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [titleClamped, setTitleClamped] = useState(false)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => setTitleClamped(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [room.name])

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
      {/* jamony 1017 首行统一制式(欢哥口述三刀): ①全行统一 text-xs ②满员裸文案「满」红字不做UI ③单行等距gap-2拆两端分散;
          内容合计~150px,4列卡250px内宽裕,禁折行守门 */}
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium">
        {room.isPrivate ? (
          <span className="flex items-center gap-1.5 text-foreground" title="加密房间"><Lock className="h-3.5 w-3.5" style={{ color: "#B4CDFF", filter: "drop-shadow(0 0 6px rgba(154,184,255,0.9))" }} />加密</span>
        ) : (
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="h-2 w-2 rounded-full bg-brand-lime shadow-[0_0_8px_var(--brand-lime)]" />公开
          </span>
        )}
        <ProficiencyBadge proficiency={room.proficiency} />
        {/* jamony 1017: 人数+满 同组(gap-1紧距)——前端UI语义同结构,与外层字段距(gap-2)区分 */}
        <span className="flex items-center gap-1">
          <span className={`flex items-center gap-1 tabular-nums ${isFull ? "text-destructive" : isNearFull ? "text-[#ffb84d]" : "text-foreground"}`}>
            <User className="h-3.5 w-3.5" style={{ color: "#9933FF" }} />{room.current}/{room.capacity}
          </span>
          {isFull ? <span className="text-destructive">满</span> : null}
        </span>
        <span className="flex items-center gap-1 tabular-nums" style={{ color: "#FF33AA" }}><Headphones className="h-3.5 w-3.5" />{room.listener_count ?? 0}</span>
      </div>
      {/* 1103 欢哥：房名单行截断+悬停气泡全文（named group 隔离——卡片整卡 hover 不误触，只悬停本行才弹；样式与鼓机/右栏同款纯黑）；
          1110 欢哥：气泡只在真截断时渲染（见组件头部注释） */}
      <div className="group/tt relative flex items-center gap-2">
        <span aria-hidden className="shrink-0 text-xl">{room.emoji}</span>
        <h3 ref={titleRef} className="min-w-0 truncate text-lg font-bold leading-tight text-foreground">{room.name}</h3>
        {titleClamped && (
          <div className="pointer-events-none absolute inset-x-0 top-full z-50 mt-1 rounded-[8px] border px-3 py-2 text-xs leading-relaxed text-white/90 opacity-0 shadow-xl transition-opacity duration-75 group-hover/tt:opacity-100"
            style={{ borderColor: "#333", background: "#000" }}>
            {room.name}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs text-white/90"
          style={{ background: "linear-gradient(var(--card), var(--card)) padding-box, var(--brand-gradient) border-box", border: "1px solid transparent" }}>
          {room.style}
        </span>
        <span className={`text-xs font-medium ${latencyColor}`}>延迟 ≈ {room.latency}ms</span>
      </div>
      <div>
        <p className="truncate text-sm text-muted-foreground">{room.description}</p>
        {/* 1110 欢哥：常驻引导（无条件显示，同公告牌卡片定稿）——点击卡片开房间详情 */}
        <span className="text-[11px]" style={{ color: "#9A9A9A" }}>... 更多</span>
      </div>
      <div className="flex items-center gap-2">
        <Avatar nickname={room.owner.name} avatarUrl={room.owner.avatarUrl} size={20} />
        <span className="text-sm font-medium text-foreground">{room.owner.name}</span>
        <span className="flex items-center gap-1 rounded-full bg-[#ffb84d]/15 px-2 py-0.5 text-[11px] font-medium text-[#ffb84d]">
          <Crown className="h-3 w-3" />房主
        </span>
      </div>
      <div className="flex items-center gap-1 text-lg leading-none">
        {room.instruments.map((inst, i) => (<span key={i} aria-hidden>{inst}</span>))}
      </div>
    </button>
  )
}
