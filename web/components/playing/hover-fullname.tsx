"use client"

// 悬浮全名（1016 欢哥定稿三规则，套鼓机 75ms 即显血统）：
// ① 仅名字真被截断（"…"）的行才显示悬浮——常显完整名的行不弹（scrollWidth>clientWidth 实测，非字数估算）
// ② 列表第一行向下浮（向上浮会被列表框上沿裁剪），其余行向上浮
// ③ 全名超出浮签宽时，悬浮期间从右向左匀速滚动完全展示（首尾各停顿、循环；仅 hover 时跑）
// 名字区结构（主名 truncate + 后缀钉尾）与乐谱/program 列表 1013 定稿同构，两处共用

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

export function HoverName({ full, base, ext, first = false, wrapClass = "flex items-baseline text-white/80", children }: {
  full: string            // 浮签显示的全名（乐谱=名+后缀；program=完整文件名）
  base: string            // 主名字段（去后缀，truncate）
  ext?: string            // 后缀段（10px 钉行尾，可空）
  first?: boolean         // 列表第一行=true → 浮签向下浮
  wrapClass?: string      // 名字区 <p> 的 class（乐谱选中态由调用方传入）
  children?: ReactNode    // 副行（上传人·时间/大小），渲染在名字下方——与 1013 原结构同位
}) {
  const nameRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [shift, setShift] = useState(0)

  // ① 截断检测：实测 DOM 宽（窗口 resize/列表宽变化由 ResizeObserver 跟随）
  useLayoutEffect(() => {
    const el = nameRef.current
    if (!el) return
    const measure = () => setTruncated(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [base])

  // ③ marquee 位移量：文本宽-浮签内容区宽（1016 修：须扣左右 padding——文本起点在 padding 后，
  // 只滚 scrollWidth-clientWidth 会差 padding 段，尾字符（如 .mp3 的"3"）滞留裁剪区；用精确 rect 消除 scrollWidth 取整误差）
  useLayoutEffect(() => {
    if (!truncated) { setShift(0); return }
    const tip = tipRef.current
    const inner = innerRef.current
    if (!tip || !inner) return
    const measure = () => {
      const cs = window.getComputedStyle(tip)
      const padL = parseFloat(cs.paddingLeft) || 0
      const padR = parseFloat(cs.paddingRight) || 0
      const innerW = inner.getBoundingClientRect().width
      const over = innerW - (tip.clientWidth - padL - padR)
      setShift(over > 4 ? Math.ceil(over) : 0)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(tip)
    return () => ro.disconnect()
  }, [truncated, full])

  const dur = Math.max(3, Math.round(shift / 30))  // ~30px/s 匀速，最短 3s
  // ⚠️play-state 不能进 inline style（1016 教训：inline 的 animation 简写隐含 running 恒压过 class，
  // hover 的 running 永远不生效=跑马灯死 pause）——动画名/节奏/暂停态全走 class，inline 只留动态时长+位移变量
  const innerStyle: CSSProperties | undefined = shift > 0
    ? { ["--fullname-shift" as any]: `-${shift}px`, animationDuration: `${dur}s` }
    : undefined

  return (
    <div className="min-w-0 flex-1">
      <p className={wrapClass}>
        <span ref={nameRef} className="min-w-0 truncate text-[11px]">{base}</span>
        {ext ? <span className="shrink-0 text-[10px]">{ext}</span> : null}
      </p>
      {children}
      {truncated && (
        <span ref={tipRef}
          className={`pointer-events-none absolute ${first ? "top-full" : "-top-1"} right-0 z-50 rounded border bg-black px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100`}
          style={{ borderColor: "#333", marginTop: first ? "2px" : "-2px", maxWidth: "100%", overflow: "hidden" }}>
          <span ref={innerRef} className={`inline-block whitespace-nowrap ${shift > 0 ? "hovername-marquee" : ""}`}
            style={innerStyle}>
            {full}
          </span>
        </span>
      )}
      <style>{`
        @keyframes fullname-marquee {
          0%, 8% { transform: translateX(0); }
          92%, 100% { transform: translateX(var(--fullname-shift, 0px)); }
        }
        .hovername-marquee {
          animation-name: fullname-marquee;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          animation-play-state: paused;
        }
        .group:hover .hovername-marquee { animation-play-state: running; }
      `}</style>
    </div>
  )
}
