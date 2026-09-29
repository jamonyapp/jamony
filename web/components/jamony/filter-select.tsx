"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"

// 自绘下拉（全站统一：三个一级页筛选 + 弹窗表单 + 设置页 + 合奏页工具）
// 09-30 欢哥：原生 select 在 macOS 上点击是向上弹出系统菜单，与页面暗色风格割裂；
// 改为自绘弹层——点击后原位向下展开，样式与站点统一。
//
// variant：按钮外观跟所在容器走，弹层全站统一（#0D0D0D 暗色浮层）
//   filter  = 一级页筛选行（34px，#0D0D0D/#1A1A1A，激活亮蓝边）
//   field   = 弹窗/设置页表单（py-2.5，#141414/#2A2A2A，打开亮紫边，占位灰字）
//   compact = 合奏页小控件（text-xs，#141414/#2A2A2A）
// 弹层用 fixed 定位（打开时量按钮坐标）：不被弹窗/滚动容器 overflow 裁剪；
// 滚动/缩放窗口时自动收起（fixed 层不跟随滚动，收起是最简正确行为）。
export type FilterOption = { value: string; label: string }

const VARIANT_BTN: Record<string, string> = {
  filter: "rounded-lg bg-[#0D0D0D] py-1.5 pl-3 pr-8 text-sm",
  field: "rounded-[10px] bg-[#141414] px-4 py-2.5 text-sm",
  compact: "rounded-lg bg-[#141414] px-3 py-1.5 text-xs",
}
const VARIANT_IDLE: Record<string, string> = {
  filter: "border-[#1A1A1A]",
  field: "border-[#2A2A2A]",
  compact: "border-[#2A2A2A]",
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allValue = "全部",
  variant = "filter",
  disabled = false,
}: {
  label: string // aria-label + 未选中时按钮文案（field/compact 下即占位提示）
  value: string
  options: readonly FilterOption[]
  onChange: (v: string) => void
  allValue?: string | null // filter 变体：视为"未筛选"的值（不亮蓝边，未含时自动补第一项）；null=无全部概念（如排序）。其他变体忽略。
  variant?: "filter" | "field" | "compact"
  disabled?: boolean
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null)
  // 打开即持有按钮屏幕坐标（fixed 弹层定位用）
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)
  const open = rect !== null

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setRect({ left: r.left, top: r.bottom + 6, width: r.width })
  }

  // 滚动（capture 捕获任意容器）/缩放/Esc 时收起
  useEffect(() => {
    if (!open) return
    const close = () => setRect(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const isActive = variant === "filter" && allValue !== null && value !== allValue
  const needAll = variant === "filter" && allValue !== null && !options.some((o) => o.value === allValue)
  const list = needAll ? [{ value: allValue as string, label }, ...options] : options
  const selected = options.find((o) => o.value === value)
  const isPlaceholder = !selected // 未匹配（含空值占位）：field/compact 显示灰提示
  const btnBorder = isActive
    ? "border-[#00AAFF]"
    : open && variant !== "filter"
      ? "border-[#9933FF]" // 表单/紧凑变体：打开时亮紫反馈
      : VARIANT_IDLE[variant]
  const textColor = isPlaceholder && variant !== "filter" ? "#8A8A8A" : "#FFFFFF"

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setRect(null) : openMenu())}
        className={`relative flex w-full items-center border text-left text-white transition-colors ${
          VARIANT_BTN[variant]
        } ${btnBorder} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        style={{ color: textColor }}
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
          {/* 点击空白处关闭（盖住弹窗等高层层级之下的所有内容） */}
          <div className="fixed inset-0 z-[75]" onClick={() => setRect(null)} aria-hidden />
          <div
            className="fixed z-[80] w-max rounded-xl border p-1 shadow-2xl"
            style={{
              left: rect.left,
              top: rect.top,
              minWidth: rect.width,
              maxWidth: `calc(100vw - ${rect.left + 8}px)`,
              background: "#0D0D0D",
              borderColor: "#1A1A1A",
            }}
          >
            {list.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setRect(null) }}
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
