"use client"

import { ArrowUpRight } from "lucide-react"

export function SectionHeader({
  title,
  linkLabel,
  onLink,
}: {
  title: string
  linkLabel: string
  onLink?: () => void
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-[20px] font-bold text-white">{title}</h2>
      <button
        className="group flex items-center gap-1 text-[13px] transition-colors"
        style={{ color: "#00AAFF" }}
        onClick={onLink}
      >
        <span className="group-hover:underline">{linkLabel}</span>
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </button>
    </div>
  )
}
