"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

// 筛选下拉（三个一级页共用）
// 09-30 欢哥：原生 select 在 macOS 上点击是向上弹出系统菜单，与页面暗色风格割裂；
// 改为自绘弹层——点击后原位向下展开，样式与站点统一。
export type FilterOption = { value: string; label: string }

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allValue = "全部",
}: {
  label: string // aria-label + 未选中时按钮文案
  value: string
  options: readonly FilterOption[]
  onChange: (v: string) => void
  allValue?: string | null // 视为"未筛选"的值（不亮蓝边，且未包含时自动补为列表第一项）；null=无"全部"概念（如排序）
}) {
  const [open, setOpen] = useState(false)

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const isActive = allValue !== null && value !== allValue
  const needAll = allValue !== null && !options.some((o) => o.value === allValue)
  const list = needAll ? [{ value: allValue as string, label }, ...options] : options
  const selected = options.find((o) => o.value === value)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex w-full items-center rounded-lg border bg-[#0D0D0D] py-1.5 pl-3 pr-8 text-left text-sm text-white transition-colors ${
          isActive ? "border-[#00AAFF]" : "border-[#1A1A1A]"
        }`}
      >
        <span className="truncate">{selected ? selected.label : label}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A9A] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <>
          {/* 点击空白处关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute left-0 top-full z-50 mt-2 w-max min-w-full rounded-xl border p-1 shadow-2xl"
            style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
          >
            {list.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="flex w-full items-center whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
                style={{ color: o.value === value ? "#FFFFFF" : "#9A9A9A" }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
