"use client"

import { PROFICIENCY_MAP, type Proficiency } from "@/lib/proficiency"

// 演奏水平徽章：显示 Lv=p（斜体），鼠标悬停弹出文字框解释
export function ProficiencyBadge({ proficiency }: { proficiency?: string | null }) {
  if (!proficiency) return null
  const info = PROFICIENCY_MAP[proficiency as Proficiency]
  if (!info) return null
  return (
    <span className="group/prof relative inline-flex items-center">
      <span className="italic text-xs font-bold" style={{ color: info.color }}>Lv={proficiency}</span>
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity duration-150 group-hover/prof:opacity-100"
        style={{ background: "#0D0D0D", borderColor: info.color, color: "#fff" }}
      >
        <span className="italic font-bold" style={{ color: info.color }}>{proficiency}</span>
        {" · "}{info.label}{" · "}{info.desc}
      </span>
    </span>
  )
}
