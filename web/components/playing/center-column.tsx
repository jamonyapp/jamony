"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Circle, Square, ChevronDown, ChevronLeft, ChevronRight, Disc3, Headphones, ArrowRight, Download, Ban, Check, X, ChevronUp, SlidersHorizontal, Play, Pause, Printer, Search, Hourglass, Repeat, SkipBack, Trash2 } from "lucide-react"
import { instrumentEmoji, type RecordingSession, type Track, type RoomScore, type GpMix } from "@/lib/jam-data"
import { MixerFullscreen } from "@/components/mixer/mixer-fullscreen"
import { MixerMini } from "@/components/mixer/mixer-mini"
import { useMixerEngine, type MixerDraft } from "@/hooks/useMixerEngine"
import { renderMix, buildMixParams, computeRangePeak, peakToDbfs, rangeAudibleStrict, computeRangeRmsDb, SILENCE_RMS_THRESHOLD_DB, RANGE_HEAD_SKIP_SEC } from "@/lib/render-mix"
import { TRACK_COLORS, type MixerTrack } from "@/components/mixer/types"
import PublishWorkModal from "@/components/publishing/publish-work-modal"
import { useJamonyDialog } from "@/components/jamony/dialog"
import { useSpaceControl } from "@/hooks/useSpaceControl"

// 工具栏上拉菜单（10-10 步骤④）：缩放/五线六线/横竖排三件套，样式与分轨弹层同族（欢哥：全照搬alphaTab下拉，底部工具栏=上拉）
function ToolbarMenu({ value, options, onPick, title, icon, disabled }: { value: string; options: { v: string; t: string }[]; onPick: (v: string) => void; title?: string; icon?: React.ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  return (
    <div className="relative flex shrink-0">
      <button
        onClick={() => { if (!disabled) setOpen((v) => !v) }}
        title={title}
        className={`flex h-6 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[6px] px-1 text-[11px] transition-colors ${disabled ? "cursor-not-allowed opacity-40" : open ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
      >
        {icon}
        <span className="truncate">{options.find((o) => o.v === value)?.t ?? value}</span>
        <ChevronUp className={`size-3 shrink-0 opacity-60 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
      {open && (
        <>
          {/* 1012 层序修：alphaTab 光标层 inline z-index=1000（黄色小节背景/指针/选区），弹层家族须整体压过它 */}
          <div className="fixed inset-0 z-[1050]" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-[1100] mb-1.5 w-32 rounded-lg border border-white/10 bg-[#141414] p-1 shadow-2xl">
            {options.map((o) => (
              <button
                key={o.v}
                onClick={() => { onPick(o.v); setOpen(false) }}
                className={`flex w-full items-center rounded-[6px] px-2 py-1.5 text-left text-[11px] transition-colors ${o.v === value ? "bg-white/12 font-semibold text-white" : "text-white/55 hover:bg-white/8 hover:text-white/85"}`}
              >
                {o.t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// 节拍器icon（10-10 欢哥要求）：lucide 1985 个图标里没有节拍器，照 lucide 描边风格自绘——梯形身+斜摆针+配重锤
function MetronomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9.5 3h5L18.5 21h-13L9.5 3z" />
      <path d="M12 15.5 17 6" />
      <circle cx="17" cy="6" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function fmt(total: number) {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// 帮助按钮 — 圆圈问号
function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [show])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShow((o) => !o)}
        className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        aria-label="帮助"
      >
        ?
      </button>
      {show && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-[8px] border border-border bg-popover p-2.5 text-[11px] leading-relaxed text-popover-foreground shadow-lg">
          {text}
        </div>
      )}
    </div>
  )
}

// 下拉选择器组件
function DropdownSelect({
  value,
  options,
  onChange,
  disabled,
  nullLabel,
}: {
  value: boolean | null
  options: { label: string; value: boolean; className?: string; icon?: React.ReactNode }[]
  onChange: (v: boolean) => void
  disabled?: boolean
  nullLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const displayText = value === null ? (nullLabel || "未选择") : options.find((o) => o.value === value)?.label ?? "未选择"
  const isDecided = value !== null
  const activeOption = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-bold transition-colors ${
          isDecided
            ? `${activeOption?.className || "bg-accent text-foreground"}${disabled ? " cursor-not-allowed opacity-80" : ""}`  // 1028: 锁定只锁交互不吞色——授权/拒绝定案色恒显
            : disabled
              ? "cursor-not-allowed bg-accent/50 text-muted-foreground/40"
              : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground"
        }`}
      >
        <span className="flex items-center gap-1">{isDecided && activeOption?.icon}{displayText}</span>
        {!disabled && (open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-[8px] border border-border bg-popover py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex items-center gap-1 whitespace-nowrap px-3 py-1 text-left text-[11px] font-bold transition-colors hover:bg-accent ${
                value === opt.value ? (opt.className || "text-foreground") : "text-muted-foreground"
              } ${value === opt.value ? "bg-accent" : ""}`}
            >
              {opt.icon}{opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 确认弹窗（①② 选择确认后写死不可改；去发表入口提示）
function ConfirmModal({ text, confirmLabel, onConfirm, onCancel }: { text: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70" onClick={onCancel}>
      <div className="w-[320px] rounded-[10px] border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-[8px] bg-accent py-2 text-sm font-medium text-muted-foreground hover:bg-accent/80">再想想</button>
          <button onClick={onConfirm} className="flex-1 rounded-[8px] bg-brand-pink py-2 text-sm font-bold text-white hover:brightness-110">{confirmLabel || "确认"}</button>
        </div>
      </div>
    </div>
  )
}

export function CenterColumn({
  chords,
  customTheme,
  currentBpm,
  roomId,
  myRole,
  currentUserId,
  roomName,
  roomStyle,
  realtimeSessions,
  realtimeRecordingActive,
  realtimeRecordingBy,
  realtimeRecordingStartedAt,
  realtimeRecordingMax,
  realtimeRecordingFinalizing,
  discardTs,
  onMixerOpen,
  onMixerClose,
  score,
  onClearScore,
  gpState,
  onGpPlay,
  onGpPause,
  onGpMix,
  onGpSpeed,
  onGpCountin,
  onGpLoop,
  onGpRange,
}: {
  chords: string[]
  customTheme?: string
  currentBpm?: number
  roomId?: string
  myRole?: "musician" | "listener"
  currentUserId?: number
  roomName?: string
  roomStyle?: string
  realtimeSessions?: RecordingSession[] | null
  realtimeRecordingActive?: boolean | null
  realtimeRecordingBy?: number | null
  realtimeRecordingStartedAt?: string | null
  realtimeRecordingMax?: number | null
  realtimeRecordingFinalizing?: boolean | null
  /** 1028: 闸1 静默废弃事件时刻（秒级信号量）——归档态即时退出，不等 60s 兜底 */
  discardTs?: number | null
  /** 1026 混音器使用 presence（删除保护）：开=占用 / 关=释放 */
  onMixerOpen?: (sessionId: number) => void
  onMixerClose?: () => void
  score?: RoomScore | null
  onClearScore?: () => void
  gpState?: { playing: boolean; startedAt?: string; speed?: number; countInMs?: number; endMs?: number } | null
  onGpPlay?: (startMs?: number) => void
  onGpPause?: () => void
  onGpMix?: (mix: GpMix) => void
  onGpSpeed?: (speed: number) => void
  onGpCountin?: (countin: boolean) => void
  onGpLoop?: (loop: boolean) => void
  onGpRange?: (range: { a: number; b: number } | null) => void
}) {
  const dialog = useJamonyDialog()
  const [todayTheme, setTodayTheme] = useState({ title: "加载中...", emoji: "🎵" })
  useEffect(() => {
    fetch("/api/daily-theme")
      .then(r => r.json())
      .then(data => { if (data.ok) setTodayTheme(data.theme) })
      .catch(() => {})
  }, [])

  const isListener = myRole === "listener"

  // 录音抽屉（欢哥 10-07 定稿）：谱子投屏 → 自动收起，整块中间区让给谱面；收回谱子 → 自动展开。
  // 各客户端独立开合，标题栏常驻——看谱期间录音/计时不受影响
  const [drawerOpen, setDrawerOpen] = useState(true)
  useEffect(() => { setDrawerOpen(score == null) }, [score])

  return (
    <main className="flex h-full flex-col gap-4 p-4">
      {/* 合奏大屏 —— 有谱子时整块让给谱面并撑满中间区（后推覆盖，收回还原；缩放/翻页各自本地，欢哥 10-07 定稿） */}
      <section
        className={`relative w-full overflow-hidden rounded-[10px] border ${score ? "min-h-0 flex-1" : "aspect-video shrink-0"}`}
        style={{ borderColor: "#1A1A1A" }}
      >
        {score ? (
          <ScoreViewer score={score} canClear={myRole !== "listener"} onClear={onClearScore} gpState={gpState} onGpPlay={onGpPlay} onGpPause={onGpPause} onGpMix={onGpMix} onGpSpeed={onGpSpeed} onGpCountin={onGpCountin} onGpLoop={onGpLoop} onGpRange={onGpRange} />
        ) : (
          <>
            <img src="/images/stage-backdrop.png" alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-black/65" />
            <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(60% 50% at 50% 40%, rgba(153,51,255,0.35), transparent 70%)" }} />
            <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 py-6 text-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50">本房间主题</p>
                <p className="mt-2 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                  {customTheme && customTheme.length > 0 ? customTheme : `${todayTheme.emoji} ${todayTheme.title}`}
                </p>
              </div>
              {chords.length > 0 && (
                <div className="w-full">
                  <p className="text-center text-xs font-bold uppercase tracking-[0.1em] text-white/50">和弦进程</p>
                  <div className="mt-3"><ChordBoard chords={chords} /></div>
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/50">BPM</p>
                <p className="mt-1 text-xl font-bold text-white lg:text-2xl">{currentBpm && currentBpm > 0 ? currentBpm : "custom"}</p>
              </div>
            </div>
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: "linear-gradient(90deg, #00AAFF, #9933FF, #FF33AA, #BBEE00)" }} />
      </section>

      {/* 录音功能 —— 听众不可见 */}
      {!isListener && (
        <RecordingPanel
          roomId={roomId}
          currentUserId={currentUserId}
          roomName={roomName}
          roomStyle={roomStyle}
          realtimeSessions={realtimeSessions}
          realtimeRecordingActive={realtimeRecordingActive}
          realtimeRecordingBy={realtimeRecordingBy}
          realtimeRecordingStartedAt={realtimeRecordingStartedAt}
          realtimeRecordingMax={realtimeRecordingMax}
          realtimeRecordingFinalizing={realtimeRecordingFinalizing}
          discardTs={discardTs}
          onMixerOpen={onMixerOpen}
          onMixerClose={onMixerClose}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((o) => !o)}
        />
      )}
    </main>
  )
}

// 谱面查看器：图片=各自本地翻页+缩放+拖拽（零同步，欢哥 10-07 定稿），PDF=Chromium 原生查看器自带全套
// 谱面调度器（1013 拆）：自身零 hooks——GP 工作站与图片/PDF 舞台是两个组件，类型热切换=换挂，
// 谁也不会继承对方的 hooks（旧版在 ScoreViewer hooks 中间提前 return <GpWorkstation/>，
// 图片谱切 GP 谱时同实例 hooks 数变化 = React #300 整页白屏，欢哥热切换投屏实测定罪）
function ScoreViewer(props: { score: RoomScore; canClear?: boolean; onClear?: () => void; gpState?: { playing: boolean; startedAt?: string; startMs?: number; speed?: number; countInMs?: number; endMs?: number } | null; onGpPlay?: (startMs?: number) => void; onGpPause?: () => void; onGpMix?: (mix: GpMix) => void; onGpSpeed?: (speed: number) => void; onGpCountin?: (countin: boolean) => void; onGpLoop?: (loop: boolean) => void; onGpRange?: (range: { a: number; b: number } | null) => void }) {
  const { score } = props
  if (score.type === "gp") return <GpWorkstation score={score} canClear={props.canClear} onClear={props.onClear} gpState={props.gpState} onPlay={props.onGpPlay} onPause={props.onGpPause} onMix={props.onGpMix} onSpeed={props.onGpSpeed} onCountin={props.onGpCountin} onLoop={props.onGpLoop} onRange={props.onGpRange} canMix={props.canClear} />
  return <ImagesStage {...props} />
}

function ImagesStage({ score, canClear, onClear, gpState, onGpPlay, onGpPause, onGpMix, onGpSpeed, onGpCountin, onGpLoop, onGpRange }: { score: RoomScore; canClear?: boolean; onClear?: () => void; gpState?: { playing: boolean; startedAt?: string; startMs?: number; speed?: number; countInMs?: number; endMs?: number } | null; onGpPlay?: (startMs?: number) => void; onGpPause?: () => void; onGpMix?: (mix: GpMix) => void; onGpSpeed?: (speed: number) => void; onGpCountin?: (countin: boolean) => void; onGpLoop?: (loop: boolean) => void; onGpRange?: (range: { a: number; b: number } | null) => void }) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pdfPages, setPdfPages] = useState(0)  // PDF 加载后才知道总页数（pdf.js 画布渲染，不依赖 Electron PDF 插件）
  const [contentTaller, setContentTaller] = useState(false)  // 长条谱页适宽后高过舞台 → 顶端对齐从页首看起
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const filesKey = score.files.join("|")
  // 换谱子（同房间推了新谱）页码/缩放归零；自己的翻页缩放在谱子不变期间保留
  useEffect(() => { setPage(0); setZoom(1); setPan({ x: 0, y: 0 }) }, [filesKey])
  // 换页复位缩放（新页从 100% 看起）
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }) }, [page])
  // 缩放回 1 时平移清零
  useEffect(() => { if (zoom === 1) setPan({ x: 0, y: 0 }) }, [zoom])

  // 滚轮缩放（non-passive 才能 preventDefault 拦截页面滚动）
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.min(5, Math.max(1, +(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(3))))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  const isPdf = score.type === "pdf"
  const total = isPdf ? pdfPages : score.files.length
  const zoomPct = Math.round(zoom * 100)
  const transformStyle = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }

  // 平移边界夹紧（10-07 欢哥实测：自由画布容易把谱面整个拖出视野）——内容始终盖住视口，到边即停
  // 注意 transform 的 scale 以元素中心为原点：放大时内容向两端生长，边界必须按"中心基准+平移"推导，
  // 长条页顶端对齐时 y 上界是 (ch-h)/2 而非 0（第一版公式把页首封死在界外——10-07 欢哥实测放大后边缘拖不回来）
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const stage = stageRef.current
    const el = stage?.querySelector(isPdf ? "canvas" : "img") as HTMLElement | null
    if (!stage || !el) return p
    const vw = stage.clientWidth, vh = stage.clientHeight
    const w = el.offsetWidth, h = el.offsetHeight
    const cw = w * z, ch = h * z
    // x：水平居中基准，内容窄于视口则锁 0
    const x = cw <= vw ? 0 : Math.min((cw - vw) / 2, Math.max((vw - cw) / 2, p.x))
    // y：长条 PDF 顶端对齐（顶端基准：上界 (ch-h)/2、下界 vh-(ch+h)/2），其余居中基准对称夹
    const y = contentTaller
      ? Math.min((ch - h) / 2, Math.max(vh - (ch + h) / 2, p.y))
      : ch <= vh ? 0 : Math.min((ch - vh) / 2, Math.max((vh - ch) / 2, p.y))
    return { x, y }
  }
  // 缩放/翻页/对齐方式变化后，把已有平移重新夹回界内
  useEffect(() => { setPan(p => clampPan(p, zoom)) }, [zoom, contentTaller, page])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#0A0A0A" }}>
      {/* 头部：谱名 + 页码 + 收回 */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <span className="truncate text-xs font-semibold text-white">📄 {score.name}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          {!isPdf && total > 1 && <span className="font-mono text-[11px] text-white/50">{page + 1} / {total}</span>}
          {canClear && onClear && (
            <button
              onClick={onClear}
              className="rounded-[6px] px-2 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              收回
            </button>
          )}
        </div>
      </div>

      {/* 谱面主体：图片与 PDF 共用同一舞台（pdf.js 画布渲染——Electron iframe PDF 插件不可靠，10-07 实测灰屏） */}
      <div
        ref={stageRef}
        className={`relative flex min-h-0 flex-1 justify-center overflow-hidden px-2 pb-3 ${isPdf && contentTaller ? "items-start" : "items-center"}`}
        style={{ cursor: zoom > 1 || (isPdf && contentTaller) ? (dragRef.current ? "grabbing" : "grab") : "default" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return  // 按钮点击放行——不吞 click（10-07 欢哥实测 -/+ 失灵根因：指针捕获抢走了 click）
          if (zoom === 1 && !(isPdf && contentTaller)) return
          dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (!d) return
          setPan(clampPan({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }, zoom))
        }}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return  // 连点+/−会被判定为双击→误触发复位（10-07 欢哥实测缩放"到头"假象）
          setZoom(1); setPan({ x: 0, y: 0 })
        }}
      >
        {isPdf ? (
          <PdfCanvas url={score.files[0]} pageNo={page + 1} onPages={setPdfPages} onTaller={setContentTaller} style={transformStyle} />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={score.files[page]}
            alt={`${score.name} 第 ${page + 1} 页`}
            className="max-h-full max-w-full select-none rounded-[4px] object-contain shadow-lg"
            style={transformStyle}
            draggable={false}
          />
        )}
        {total > 1 && (
          <>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="上一页"
              className="absolute left-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 disabled:opacity-0"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
              disabled={page === total - 1}
              aria-label="下一页"
              className="absolute right-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white transition-opacity hover:bg-black/80 disabled:opacity-0"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
        {/* 缩放控制（右下角悬浮） */}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-black/70 px-1 py-0.5">
          <button
            onClick={() => setZoom(z => Math.max(1, +(z / 1.25).toFixed(3)))}
            disabled={zoom <= 1}
            aria-label="缩小"
            className="grid size-6 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-30"
          >
            −
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
            title="双击谱面也可复位"
            className="min-w-[38px] px-1 text-center font-mono text-[11px] text-white/80 transition-colors hover:text-white"
          >
            {zoomPct}%
          </button>
          <button
            onClick={() => setZoom(z => Math.min(5, +(z * 1.25).toFixed(3)))}
            disabled={zoom >= 5}
            aria-label="放大"
            className="grid size-6 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}

// PDF 画布渲染器：pdf.js 动态加载（懒加载不进主包），同 URL 文档缓存，按页渲染 2 倍采样（放大仍清晰）
function PdfCanvas({ url, pageNo, onPages, onTaller, style }: {
  url: string
  pageNo: number
  onPages: (n: number) => void
  onTaller?: (taller: boolean) => void
  style?: React.CSSProperties
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<{ url: string; doc: import("pdfjs-dist").PDFDocumentProxy | null } | null>(null)
  const [rendering, setRendering] = useState(true)
  const [err, setErr] = useState(false)
  const [errMsg, setErrMsg] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setRendering(true)
      setErr(false)
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        let entry = docRef.current
        if (!entry || entry.url !== url || !entry.doc) {
          // standardFontDataUrl/cMapUrl：谱子 PDF 常不内嵌字体，不配标准字体数据包升号/降号画豆腐块（10-07 欢哥实测）
          // disableFontFace：字形走矢量路径直绘，绕开 Chromium OTS 对子集字体（GPBravura 等）的拒收（10-07 欢哥实测升记号豆腐块）
          const doc = await pdfjs.getDocument({
            url,
            standardFontDataUrl: "/pdf-standard-fonts/",
            cMapUrl: "/pdf-cmaps/",
            cMapPacked: true,
            disableFontFace: true,
          }).promise
          if (cancelled) return
          docRef.current = { url, doc }
          entry = docRef.current
          onPages(doc.numPages)
        }
        const page = await entry.doc!.getPage(pageNo)
        if (cancelled) return
        const canvas = canvasRef.current
        const parent = canvas?.parentElement
        // 显示尺寸自己算（显式 CSS 宽高 + max-h 类在 CSS 约束表里会打架，长页被纵向压扁——10-07 实测变形根因）
        const availW = Math.max(100, (parent?.clientWidth || 800) - 16)   // 减 px-2 左右内边距
        const availH = Math.max(100, (parent?.clientHeight || 600) - 12)  // 减 pb-3 下内边距
        const base = page.getViewport({ scale: 1 })
        const displayW = availW                       // 适宽：字保持可读大小
        const displayH = displayW * base.height / base.width
        onTaller?.(displayH > availH + 4)             // 长条页：舞台切顶端对齐，从页首看起
        // 采样 2 倍保证放大清晰；像素帽防超 Chromium 画布上限（16384/边，595x5814 十倍长页裸奔必爆）
        const MAX_SIDE = 16000, MAX_PIXELS = 16e6
        let scale = (displayW / base.width) * 2
        scale = Math.min(scale, MAX_SIDE / base.width, MAX_SIDE / base.height, Math.sqrt(MAX_PIXELS / (base.width * base.height)))
        const viewport = page.getViewport({ scale })
        canvas!.width = Math.round(viewport.width)
        canvas!.height = Math.round(viewport.height)
        canvas!.style.width = `${displayW}px`
        canvas!.style.height = `${displayH}px`
        await page.render({ canvasContext: canvas!.getContext("2d")!, viewport }).promise
      } catch (e) {
        if (!cancelled) { setErr(true); setErrMsg((e as Error)?.message || String(e)) }
        console.error("PDF render error:", e)
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, pageNo])  // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return (
    <div className="max-w-[80%] text-center">
      <p className="text-xs" style={{ color: "#FF5C5C" }}>PDF 渲染失败</p>
      <p className="mt-1 break-all text-[10px]" style={{ color: "#8A8A8A" }}>{errMsg || "未知错误"}</p>
    </div>
  )

  return (
    <>
      {rendering && (
        <span className="absolute bottom-12 right-3 z-20 text-[10px]" style={{ color: "#8A8A8A" }}>渲染中…</span>
      )}
      <canvas ref={canvasRef} className="rounded-[4px] shadow-lg" style={{ ...style, background: "#fff" }} />
    </>
  )
}

// 把和弦按每句 4 个分行；8 句时左右分栏中间放大箭头
function ChordBoard({ chords }: { chords: string[] }) {
  const lines: string[][] = []
  for (let i = 0; i < chords.length; i += 4) {
    lines.push(chords.slice(i, i + 4))
  }
  if (lines.length === 0) return null

  const sizeClass =
    lines.length <= 2 ? "text-xl sm:text-2xl lg:text-3xl"
      : lines.length <= 4 ? "text-base sm:text-lg lg:text-xl"
        : "text-sm sm:text-base lg:text-lg"

  const Line = ({ line }: { line: string[] }) => (
    <p className={`font-mono font-semibold leading-relaxed tracking-wide text-white ${sizeClass}`}>
      {line.map((c, i) => (
        <span key={i}>
          <span className="inline-block min-w-[2.5em] text-center">{c}</span>
          {i < line.length - 1 && <span className="text-white/30">|</span>}
        </span>
      ))}
    </p>
  )

  if (lines.length > 4) {
    const mid = Math.ceil(lines.length / 2)
    const left = lines.slice(0, mid)
    const right = lines.slice(mid)
    return (
      <div className="flex items-center justify-center gap-5">
        <div className="flex flex-col gap-1">{left.map((l, i) => <Line key={i} line={l} />)}</div>
        <ArrowRight className="size-8 shrink-0 text-brand-green lg:size-10" strokeWidth={3} />
        <div className="flex flex-col gap-1">{right.map((l, i) => <Line key={i} line={l} />)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {lines.map((l, i) => <Line key={i} line={l} />)}
    </div>
  )
}

function RecordingPanel({
  roomId,
  currentUserId,
  roomName,
  roomStyle,
  realtimeSessions,
  realtimeRecordingActive,
  realtimeRecordingBy,
  realtimeRecordingStartedAt,
  realtimeRecordingMax,
  realtimeRecordingFinalizing,
  discardTs,
  onMixerOpen,
  onMixerClose,
  drawerOpen,
  onToggleDrawer,
}: {
  roomId?: string
  currentUserId?: number
  roomName?: string
  roomStyle?: string
  realtimeSessions?: RecordingSession[] | null
  realtimeRecordingActive?: boolean | null
  realtimeRecordingBy?: number | null
  realtimeRecordingStartedAt?: string | null
  realtimeRecordingMax?: number | null
  realtimeRecordingFinalizing?: boolean | null
  discardTs?: number | null
  onMixerOpen?: (sessionId: number) => void
  onMixerClose?: () => void
  drawerOpen?: boolean
  onToggleDrawer?: () => void
}) {
  const dialog = useJamonyDialog()
  const [sessions, setSessions] = useState<RecordingSession[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [mixerSessionId, setMixerSessionId] = useState<number | null>(null)
  const [mixerMinimized, setMixerMinimized] = useState(false)
  // 1026 双混音器（欢哥方案一）：preview=房间内回放（拉全部能量轨）；publish=抢锁后的创作面（拉授权轨∪looper）
  // 混音器本体全量统一（定位器/循环/复位两模式同享），差异只在轨道集合与发表权限
  const [mixerMode, setMixerMode] = useState<"preview" | "publish" | null>(null)
  const mixerEngine = useMixerEngine()
  const mixerTracksLoadedRef = useRef(false)
  // 发表流状态（自 SessionCard 上移——渲染产物产自混音器，发表卡必须同层）
  const [claimTaken, setClaimTaken] = useState<{ userId: number; nickname: string } | null>(null)
  const [claimingId, setClaimingId] = useState<number | null>(null) // 卡片「占位中」瞬态
  const [rendering, setRendering] = useState(false)
  // 渲染阶段面包屑（1031 发表黑屏排障）：busy 按钮显示当前阶段——再崩时欢哥报按钮文案=死点定位
  const [renderStage, setRenderStage] = useState("")
  const [injectedMix, setInjectedMix] = useState<{ mp3Blob: Blob; durationSec: number; mixParamsJson: string } | null>(null)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const publishClaimedRef = useRef(false)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingMine, setRecordingMine] = useState(false)
  const [stopping, setStopping] = useState(false) // 停止中过渡态（0923：服务器快停响应回来前按钮显示"停止中…"并禁用，防连点误开新段）
  // 1025 归档中态（欢哥定稿）：停止快反馈后按钮不直接回"录音"，进入"归档中…"直到新 session 真出现——
  // 落档耗时随文件大小（混音/转码几秒到几十秒），空窗期用户需知道文件正在生成
  const [finalizing, setFinalizing] = useState(false)
  const finalizeBaseline = useRef(0)
  const finalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recToast, setRecToast] = useState('')
  const recToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [recTime, setRecTime] = useState(0)
  const [now, setNow] = useState(Date.now())
  const fetchingRef = useRef(false)

  // 首屏拉取一次 session 列表（之后由 socket 实时推送覆盖）
  useEffect(() => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}/sessions`)
      .then(r => r.json())
      .then(data => { if (data.ok) setSessions(data.sessions || []) })
      .catch(() => {})
  }, [roomId])

  // socket 实时推送优先
  useEffect(() => {
    if (realtimeSessions) setSessions(realtimeSessions)
  }, [realtimeSessions])

  // 混音器：标准化完成后自动加载音轨（1026 双模式：preview=全部轨[排练室回放，含未决/已拒——房间内大家一起听录音天经地义]；
  // publish=授权轨∪looper[与服务端发表权威集合天然一致]）。normalize 门槛=本模式加载集合。
  useEffect(() => { mixerTracksLoadedRef.current = false }, [mixerSessionId, mixerMode])
  useEffect(() => {
    if (mixerSessionId === null || mixerMode === null) return
    const mixerSession = sessions.find(s => s.id === mixerSessionId)
    if (!mixerSession) return
    const source = mixerMode === "publish"
      ? mixerSession.tracks.filter(t => t.allow_use === true || t.is_system)
      : mixerSession.tracks
    const allNormalized = source.every(t => t.normalized)
    if (allNormalized && source.length > 0 && !mixerTracksLoadedRef.current && roomId && currentUserId) {
      mixerTracksLoadedRef.current = true
      const tracks: MixerTrack[] = source.map((t, i) => ({
        id: String(t.id),
        name: t.nickname,
        instrument: t.is_system ? "🥁" : instrumentEmoji(t.instrument_category),
        wavUrl: `/api/rooms/${roomId}/sessions/${mixerSessionId}/tracks/${t.id}/download`,
        duration: 0,
        color: TRACK_COLORS[i % TRACK_COLORS.length],
      }))
      const draft = readMixDraft(mixerSessionId)
      mixerEngine.loadTracks(tracks, draft ?? undefined)
      console.debug("[mixer] load", mixerMode, `${tracks.length}轨`, draft ? "恢复草稿" : "默认参数")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixerSessionId, mixerMode, sessions, roomId, currentUserId])

  // 录音状态同步（他人开始/停止录音；发起者身份恢复"停止"按钮归属；startedAt 让秒表跨强刷不归零）
  useEffect(() => {
    if (realtimeRecordingActive == null) return
    setRecording(realtimeRecordingActive)
    setRecordingMine(realtimeRecordingActive && realtimeRecordingBy != null && realtimeRecordingBy === currentUserId)
    if (realtimeRecordingActive) {
      if (realtimeRecordingStartedAt) {
        setRecTime(Math.max(0, Math.floor((Date.now() - new Date(realtimeRecordingStartedAt).getTime()) / 1000)))
      }
    } else {
      setRecordingMine(false)
      setStopping(false)  // socket 广播"已停"可能先于 HTTP 响应到达，兜底解除停止中
      // 1025: 全房归档中同步——他人停止的广播带 finalizing 标记，本端也进入归档态
      //（发起者已在 stopRecording 内自行起态；此处幂等：已 finalizing 则不重置 baseline）
      if (realtimeRecordingFinalizing && !finalizing) {
        finalizeBaseline.current = sessions.length
        setFinalizing(true)
        if (finalizeTimer.current) clearTimeout(finalizeTimer.current)
        finalizeTimer.current = setTimeout(() => setFinalizing(false), 60_000)
      }
    }
  }, [realtimeRecordingActive, realtimeRecordingBy, realtimeRecordingStartedAt, realtimeRecordingFinalizing, finalizing, sessions, currentUserId])

  // 1028 欢哥实测判例: 静默废弃路径闸1不建段落→无新 session→归档态等不到自然退出条件,
  // 只能靠 60s 兜底定时器(实测卡"归档中"1分钟/须强刷)。修复: session-discarded 即退归档态——
  // 与弹窗同源(discardEvent.ts), 按钮/弹窗两条消费链对齐
  useEffect(() => {
    if (discardTs == null) return
    setFinalizing(false)
    if (finalizeTimer.current) clearTimeout(finalizeTimer.current)
  }, [discardTs])

  // 录音计时
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecTime((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  // 全局 1 秒滴答（倒计时显示用）
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 有 session 倒计时到点且仍未全员锁定 → 触发一次拉取（服务端懒处理超时默认并广播）
  useEffect(() => {
    if (!roomId) return
    const hasExpired = sessions.some(s => s.expires_at && new Date(s.expires_at).getTime() < now && !s.all_locked)
    if (hasExpired && !fetchingRef.current) {
      fetchingRef.current = true
      fetch(`/api/rooms/${roomId}/sessions`)
        .then(r => r.json())
        .then(data => { if (data.ok) setSessions(data.sessions || []) })
        .catch(() => {})
        .finally(() => { fetchingRef.current = false })
    }
  }, [now, sessions, roomId])

  const startRecording = async () => {
    if (!roomId || !currentUserId) return
    const res = await fetch(`/api/rooms/${roomId}/recording/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId }),
    })
    const data = await res.json()
    if (data.ok) {
      setRecording(true); setRecordingMine(true); setRecTime(0)
    } else {
      dialog.alert(data.msg || "无法开始录音")
    }
  }

  const stopRecording = async () => {
    if (!roomId || !currentUserId || stopping) return
    setStopping(true)  // 点击瞬间进入停止中：按钮禁用+文案切换，连点全部吸收
    const res = await fetch(`/api/rooms/${roomId}/recording/stop`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, duration: fmt(recTime) }),
    })
    const data = await res.json()
    setStopping(false)
    if (data.ok) {
      setRecording(false); setRecordingMine(false); setRecTime(0)
      // 1025: 快停完成≠落档完成——进入归档中态，等新 session 出现（60s 兜底防卡死）
      finalizeBaseline.current = sessions.length
      setFinalizing(true)
      if (finalizeTimer.current) clearTimeout(finalizeTimer.current)
      finalizeTimer.current = setTimeout(() => setFinalizing(false), 60_000)
    }
  }

  // 1025: 新 session 出现=归档完成——解除归档态+toast 报喜
  // 双源退出: ①本地 sessions 增量(手动停路径) ②chat-socket 在 sessions-update 时清 realtimeFinalizing(广播路径,免疫时序)
  const showFinalizing = finalizing || !!realtimeRecordingFinalizing
  useEffect(() => {
    if (showFinalizing && sessions.length > finalizeBaseline.current) {
      setFinalizing(false)
      if (finalizeTimer.current) clearTimeout(finalizeTimer.current)
      setRecToast('录音成功！请参与合奏者及时点击录音卡片的"授权"按钮，授权自己的分轨。')
      if (recToastTimer.current) clearTimeout(recToastTimer.current)
      recToastTimer.current = setTimeout(() => setRecToast(''), 5000)
    }
  }, [sessions, showFinalizing])

  /* ───── 1026 草稿（按 session 分仓 localStorage；试听调过的参数带进发表混音器；M/S 不入草稿）───── */
  const draftKey = (sid: number) => `jamony-mix-draft-${sid}`
  const readMixDraft = (sid: number): MixerDraft | null => {
    try { const raw = localStorage.getItem(draftKey(sid)); return raw ? (JSON.parse(raw) as MixerDraft) : null } catch { return null }
  }
  const currentDraft = (): MixerDraft => ({
    volumes: mixerEngine.volumes, pans: mixerEngine.pans, master: mixerEngine.masterVolume,
    locator: mixerEngine.locator, locatorActive: mixerEngine.locatorActive, loop: mixerEngine.loop,
  })
  const saveDraftNow = (sid: number) => {
    try { localStorage.setItem(draftKey(sid), JSON.stringify({ ...currentDraft(), savedAt: Date.now() })) } catch {}
  }
  // 参数/区间变更 debounce 800ms 写盘
  useEffect(() => {
    if (mixerSessionId === null || mixerMode === null) return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => saveDraftNow(mixerSessionId), 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixerSessionId, mixerMode, mixerEngine.volumes, mixerEngine.pans, mixerEngine.masterVolume, mixerEngine.locator, mixerEngine.locatorActive, mixerEngine.loop])
  // 发表完成 → 草稿清空（参数已冻结进作品快照）
  useEffect(() => {
    if (mixerSessionId === null) return
    const s = sessions.find(x => x.id === mixerSessionId)
    if (s?.status === "published") { try { localStorage.removeItem(draftKey(s.id)) } catch {} }
  }, [sessions, mixerSessionId])

  /* ───── 1026 发表流（方案一双混音器：抢锁→发表混音器调参→渲染→发表卡）───── */
  const publishSession = mixerSessionId !== null && mixerMode === "publish"
    ? (sessions.find(s => s.id === mixerSessionId) ?? null)
    : null

  // 「去发表」入口（卡片按钮）：竞态抢锁 → 直开发表混音器（原「兵贵神速」确认弹窗退役——混音本就在锁内从容做）
  const openPublishMixer = async (session: RecordingSession) => {
    if (!currentUserId || !roomId) return
    const isClaimed = session.publisher_user_id != null
    const isMine = isClaimed && session.publisher_user_id === currentUserId
    if (isMine) {
      publishClaimedRef.current = true
      setMixerMode("publish"); setMixerSessionId(session.id); setMixerMinimized(false)
      return
    }
    if (isClaimed) {
      setClaimTaken({ userId: session.publisher_user_id!, nickname: session.publisher_nickname || "未知用户" })
      return
    }
    setClaimingId(session.id)
    try {
      const res = await fetch(`/api/rooms/${roomId}/sessions/${session.id}/claim-publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { dialog.alert(data.msg || "无法获取发表权"); return }
      if (!data.claimed) {
        setClaimTaken({ userId: data.publisher_user_id, nickname: data.publisher_nickname || "未知用户" })
        return
      }
      publishClaimedRef.current = true
      setMixerMode("publish"); setMixerSessionId(session.id); setMixerMinimized(false)
    } catch (e) {
      console.error("抢锁失败:", e)
      dialog.alert("网络异常，请重试")
    } finally { setClaimingId(null) }
  }

  // 混音器内「发表作品」按钮状态机（闸2 / 锁态 / 渲染中 / 已发表）
  const publishBtnState = (() => {
    if (!publishSession) return null
    if (publishSession.status === "published") return { label: "已发表", disabled: true, tone: "gray" as const, reason: "该段落已发表" }
    const engIds = mixerEngine.tracks.map(t => t.id)
    const hasSolo = engIds.some(id => mixerEngine.solos[id])
    const anySilenced = engIds.some(id => (hasSolo ? !mixerEngine.solos[id] : !!mixerEngine.mutes[id]))
    if (anySilenced) return { label: "发表作品", disabled: true, tone: "gray" as const, reason: "存在静音/独奏轨——发表要求所有分轨参与混音（M/S 仅试听用），点「清除M/S」后重试" }
    if (rendering) return { label: renderStage || "生成中…", disabled: true, busy: true, tone: "blue" as const }
    const mineLock = publishSession.publisher_user_id === currentUserId
    if (publishSession.publisher_user_id != null && !mineLock) return { label: "发表中", disabled: true, tone: "gray" as const, reason: `${publishSession.publisher_nickname || "其他乐手"} 正在发表` }
    if (!mineLock) return { label: "去发表", disabled: false, tone: "blue" as const } // 锁懒超时已释放 → 点击重新抢
    return { label: "发表作品", disabled: false, tone: "green" as const }
  })()

  // 发表倒计时（与发表卡共用 deadline=claimed_at+15min；发表成功后隐藏）
  const publishDeadlineMs = publishSession && publishSession.claimed_at && publishSession.publisher_user_id === currentUserId && publishSession.status !== "published"
    ? new Date(publishSession.claimed_at).getTime() + 15 * 60 * 1000
    : null
  const countdownSec = publishDeadlineMs ? Math.max(0, Math.ceil((publishDeadlineMs - now) / 1000)) : undefined

  // 「发表作品」点击：闸3客户端预检 → renderMix（所发即所听）→ 注入发表卡
  const runPublish = async () => {
    if (!publishSession || !currentUserId || !roomId || rendering) return
    const mineLock = publishSession.publisher_user_id === currentUserId
    if (!mineLock) { await openPublishMixer(publishSession); return } // 锁已懒释放 → 重新抢
    const buffers = mixerEngine.getBuffers()
    const lc = mixerEngine.locator
    // 1031 三轮（欢哥 DAW 语义定稿）：发表只读 AB 坐标，不看开关——AB 重合=全曲(null)，
    // AB 分开=按区间（无论黄白）。黄白开关从此只管播放约束（到B停/循环），与发表无关。
    const range = lc.b > lc.a ? { a: lc.a, b: lc.b } : null
    // 1031 排障口供机（console.debug 在 devtools 默认级别不可见=证据黑洞，改 log+黑匣子）：
    // range 状态+每轨入检/跳过原因全量留痕，一次复现=完整口供
    const jlog = (m: string) => {
      console.log("[gate3]", m)
      ;(window as unknown as { __jamonyLog?: (x: string) => void }).__jamonyLog?.(m)
    }
    jlog(`publish: 预检开始 locatorActive=${mixerEngine.locatorActive} locator=(${lc.a.toFixed(2)},${lc.b.toFixed(2)}) range=${range ? `[${range.a.toFixed(2)},${range.b.toFixed(2)}]` : "null(全曲)"}`)
    // 闸3客户端预检（1031 判据升级：严格判据=头50ms豁免+RMS>-40dB，与服务端终审同口径；
    // looper 豁免；服务端另有权威终审）。全程留痕（1031 立宪：拦/放都上报 energy_audit）。
    const silent: string[] = []
    const precheckRecords: { trackId: number | string; nickname: string; skipped: boolean; reason?: string; rmsDb?: number; peakDb?: number; audible?: boolean }[] = []
    for (const t of publishSession.tracks) {
      if (t.is_system || t.allow_use !== true) {
        jlog(`publish: 预检跳过 ${t.nickname}(is_system=${t.is_system} allow_use=${t.allow_use})`)
        precheckRecords.push({ trackId: t.id, nickname: t.nickname, skipped: true, reason: t.is_system ? "system轨豁免" : "未授权" })
        continue
      }
      const buf = buffers.get(String(t.id))
      if (!buf) {
        jlog(`publish: 预检跳过 ${t.nickname}(buffer缺失 id=${t.id})`)
        precheckRecords.push({ trackId: t.id, nickname: t.nickname, skipped: true, reason: "buffer缺失" })
        continue
      }
      // 无定位器=全曲（落版闸1已测原始域全曲）→ 区间判据不适用，按有声放行
      const audible = range ? rangeAudibleStrict(buf, range.a, range.b) : true
      const a2 = Math.max(range ? range.a : 0, RANGE_HEAD_SKIP_SEC)
      const b2 = range ? range.b : buf.duration
      const rmsDb = computeRangeRmsDb(buf, a2, b2)
      const peakDb = peakToDbfs(computeRangePeak(buf, a2, b2))
      precheckRecords.push({ trackId: t.id, nickname: t.nickname, skipped: false, rmsDb, peakDb, audible })
      jlog(`publish: 预检 ${t.nickname} 区间[${(range ? range.a : 0).toFixed(2)},${(range ? range.b : buf.duration).toFixed(2)}] RMS${rmsDb === -Infinity ? "-∞" : rmsDb.toFixed(1)}dB(阈${SILENCE_RMS_THRESHOLD_DB}) 峰值${peakDb === -Infinity ? "-∞" : peakDb.toFixed(1)}dB=${audible ? "有声" : "无声"}`)
      if (!audible) silent.push(t.nickname)
    }
    // ⭐ 留痕上报（1031 立宪：被拦的预检也必须留服务端档——此前被拦尝试零痕迹=悬案取证难的根源）
    if (roomId && mixerSessionId !== null) {
      fetch(`/api/rooms/${roomId}/sessions/${mixerSessionId}/precheck-audit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: silent.length > 0, rangeA: range ? range.a : null, rangeB: range ? range.b : null, records: precheckRecords }),
      }).catch(() => {})
    }
    if (silent.length > 0) {
      // 1031 三轮欢哥定稿：不外露审查机制+授权不可撤销（原「或由该乐手拒绝使用授权」不可操作）
      dialog.alert(`发布作品区间内存在无效分轨，请调整发表区间。`)
      return
    }
    setRendering(true)
    ;(window as unknown as { __jamonyLog?: (m: string) => void }).__jamonyLog?.("publish: 闸3预检通过, 进入渲染管线")
    try {
      const specs = mixerEngine.tracks
        .map(mt => ({ key: mt.id, buffer: buffers.get(mt.id), gain: mixerEngine.volumes[mt.id] ?? 1, pan: mixerEngine.pans[mt.id] ?? 0 }))
        .filter((s): s is { key: string; buffer: AudioBuffer; gain: number; pan: number } => !!s.buffer)
      const result = await renderMix({ tracks: specs, master: mixerEngine.masterVolume, range, onProgress: m => { console.debug("[renderMix]", m); setRenderStage(m); (window as unknown as { __jamonyLog?: (x: string) => void }).__jamonyLog?.(`publish: ${m}`) } })
      const params = buildMixParams({
        tracks: publishSession.tracks.filter(t => t.allow_use === true).map(t => {
          const id = String(t.id)
          const buf = buffers.get(id)
          return {
            track_id: t.id, user_id: t.user_id, nickname: t.nickname, is_system: t.is_system,
            instrument_category: t.instrument_category,
            gain: mixerEngine.volumes[id] ?? 1, pan: mixerEngine.pans[id] ?? 0,
            in_range: buf ? (range ? rangeAudibleStrict(buf, range.a, range.b) : true) : false,
          }
        }),
        master: mixerEngine.masterVolume,
        // 契约：b 恒为具体值（未设定位器=全曲时长），服务端终审永远有窗口可审
        range: range ? { a: range.a, b: range.b } : { a: 0, b: mixerEngine.duration },
        clientAudit: { silent_tracks: silent, checked_at: new Date().toISOString(), records: precheckRecords, criterion: `rms>${SILENCE_RMS_THRESHOLD_DB}dB+headSkip${RANGE_HEAD_SKIP_SEC}s` },
      })
      ;(window as unknown as { __jamonyLog?: (m: string) => void }).__jamonyLog?.("publish: 渲染+编码完成, 组装参数并开确认弹窗")
      setInjectedMix({ mp3Blob: result.mp3Blob, durationSec: result.duration, mixParamsJson: JSON.stringify(params) })
      setPublishModalOpen(true)
    } catch (e) {
      ;(window as unknown as { __jamonyLog?: (m: string) => void }).__jamonyLog?.(`publish: 异常 ${e instanceof Error ? e.message : String(e)}`)
      dialog.alert(`成品渲染失败：${e instanceof Error ? e.message : String(e)}，请重试`)
    } finally { setRendering(false); setRenderStage("") }
  }

  // 关混音器：草稿即刻落盘（防抖尾巴不丢）+ 未发表释放锁 + 发表流收尾
  const closeMixer = () => {
    if (mixerSessionId !== null) saveDraftNow(mixerSessionId)
    if (mixerMode === "publish" && publishClaimedRef.current) {
      publishClaimedRef.current = false
      const s = sessions.find(x => x.id === mixerSessionId)
      if (currentUserId && roomId && s && s.status !== "published") {
        fetch(`/api/rooms/${roomId}/sessions/${mixerSessionId}/release-claim`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId }),
        }).catch(() => {})
      }
    }
    setMixerSessionId(null); setMixerMode(null); setMixerMinimized(false)
    setPublishModalOpen(false); setInjectedMix(null)
    onMixerClose?.() // 1026 使用 presence 释放（挡删除解除）
  }

  // 1026 使用 presence 上报：混音器开=占用该段落（挡删除），关/换段=释放；断线重连由 chat-socket 自动补报
  const prevMixerSessionRef = useRef<number | null>(null)
  useEffect(() => {
    const prev = prevMixerSessionRef.current
    if (prev === mixerSessionId) return
    if (prev != null) onMixerClose?.()
    if (mixerSessionId != null) onMixerOpen?.(mixerSessionId)
    prevMixerSessionRef.current = mixerSessionId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixerSessionId])

  // 2026 缝③兜底层：presence 挡常态删除，漏网窗口（断线间隙/事件在途）由「段落消失→优雅退出」兜底
  const mixerHadSessionRef = useRef(false)
  useEffect(() => {
    if (mixerSessionId === null || mixerMode === null) { mixerHadSessionRef.current = false; return }
    if (sessions.some(s => s.id === mixerSessionId)) { mixerHadSessionRef.current = true; return }
    if (mixerHadSessionRef.current) {
      mixerHadSessionRef.current = false
      closeMixer()
      try { localStorage.removeItem(draftKey(mixerSessionId)) } catch {}
      dialog.alert("该段落已被删除。")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, mixerSessionId, mixerMode])

  // 1026 锁窗到点自动拉取：触发服务端懒释放+广播，全员按钮态即时对齐（否则「发表中」挂到下一次任意读取）
  const lockExpiredFetchedRef = useRef(false)
  useEffect(() => {
    if (publishDeadlineMs === null) { lockExpiredFetchedRef.current = false; return }
    if (Date.now() >= publishDeadlineMs && !lockExpiredFetchedRef.current) {
      lockExpiredFetchedRef.current = true
      fetch(`/api/rooms/${roomId}/sessions`)
        .then(r => r.json())
        .then(d => { if (d.ok) setSessions(d.sessions || []) })
        .catch(() => {})
    }
  }, [publishDeadlineMs, now, roomId])

  async function patchTrack(sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) {
    if (!roomId || !currentUserId) return
    await fetch(`/api/rooms/${roomId}/sessions/${sessionId}/tracks/${trackId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, field, value }),
    })
    // 成功后由 socket sessions-update 推送新状态覆盖
  }

  return (<>
    <section className={`flex min-h-0 flex-col rounded-[10px] border border-border bg-card ${drawerOpen ? "flex-1" : "shrink-0"}`}>
      {/* 录音控制栏 = 抽屉标题栏（极简版 ~28px，欢哥 0923 再收一半；10-07 抽屉化：谱子投屏时只留标题栏，录音/计时不中断） */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Disc3 className="size-3.5 shrink-0 text-brand-pink" />
            <span className="truncate">本房间录音</span>
            <span className="hidden shrink-0 text-[11px] font-normal text-muted-foreground sm:inline">每段最长 5 分钟</span>
            {sessions.length > 0 && (
              <span className="shrink-0 text-[11px] font-normal text-muted-foreground">已录 {sessions.length} 段</span>
            )}
          </div>
          {drawerOpen && <p className="pl-[22px] text-[11px] font-normal leading-tight text-muted-foreground">录音将在房间解散后清除，请及时发表或下载</p>}
        </div>

        <div className="flex items-center gap-2.5">
          {recording && (
            <span className="flex items-center gap-1 font-mono text-xs text-brand-pink">
              <span className="size-1.5 animate-rec-pulse rounded-full bg-brand-pink" />
              {fmt(recTime)}
              {realtimeRecordingMax ? ` / -${fmt(Math.max(0, realtimeRecordingMax - recTime))}` : ""}
            </span>
          )}
          <button
            onClick={() => (recording ? stopRecording() : !stopping && startRecording())}
            disabled={stopping || showFinalizing}
            aria-label={recording ? "停止录音" : "开始录音"}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
              recording ? "bg-destructive" : "bg-brand-pink"
            }`}
          >
            {recording ? <Square className="size-3 fill-current" /> : <Circle className="size-3 fill-current" />}
            {stopping ? "停止中…" : showFinalizing ? "归档中…" : recording ? "停止" : "录音"}
          </button>
          {onToggleDrawer && (
            <button
              onClick={onToggleDrawer}
              aria-label={drawerOpen ? "收起录音列表" : "展开录音列表"}
              title={drawerOpen ? "收起录音列表" : "展开录音列表"}
              className="grid size-6 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className={`size-4 transition-transform duration-300 ${drawerOpen ? "" : "rotate-180"}`} />
            </button>
          )}
        </div>
      </div>

      {/* 抽屉体：grid-template-rows 1fr↔0fr 动画收放（Chromium 原生支持过渡，向下收回只留标题栏） */}
      <div
        className="grid min-h-0 flex-1 transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: drawerOpen ? "1fr" : "0fr" }}
      >
        <div className="relative min-h-0 overflow-hidden">
          {/* 1025 归档提示终版位（欢哥）：absolute 覆盖层——悬浮于列表之上,不挤占布局不顶列表 */}
          {recToast && (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-brand-pink/70 px-3 py-0 text-xs font-medium leading-tight shadow-md text-white">
              <Disc3 className="size-3 shrink-0" />
              {recToast}
              {/* 1028 欢哥：5s 自动淡出前可随时手动关 */}
              <button
                onClick={() => { if (recToastTimer.current) clearTimeout(recToastTimer.current); setRecToast('') }}
                className="absolute right-1.5 grid size-4 place-items-center rounded-[6px] text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                title="关闭"
              >
                <X className="size-2.5" />
              </button>
            </div>
          )}
          {/* 录音记录 —— 可滚动 */}
          <div className="h-full overflow-y-auto scrollbar-thin p-4">
            {sessions.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">大家还没有录音</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    open={expanded === s.id}
                    now={now}
                    roomId={roomId}
                    currentUserId={currentUserId}
                    onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
                    onPatch={patchTrack}
                    onPreview={() => { setMixerMode("preview"); setMixerSessionId(s.id); setMixerMinimized(false) }}
                    onPublishEntry={openPublishMixer}
                    claimingId={claimingId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>

    {/* 混音器（1026 双模式同一组件：试听=房间回放 / 发表=创作面） */}
    {mixerSessionId !== null && (() => {
      const mixerSession = sessions.find(s => s.id === mixerSessionId)
      const sourceTracks = mixerMode === "publish"
        ? (mixerSession?.tracks || []).filter(t => t.allow_use === true || t.is_system)
        : (mixerSession?.tracks || [])
      const normalizedCount = sourceTracks.filter(t => t.normalized).length
      const totalCount = sourceTracks.length
      const loadingProgress = totalCount > 0 ? (normalizedCount / totalCount) * 100 : 100
      const isPublish = mixerMode === "publish"

      return (<>
        {!mixerMinimized && (
          <MixerFullscreen
            sessionLabel={`段落 ${mixerSession?.index}`}
            titleLabel={isPublish ? "发表混音" : "试听混音"}
            footerHint={isPublish
              ? "作品区间取决于定位器 AB 位置：AB 重合=全部分轨音频整体发表，AB 分开=按区间发表。"
              : "试听回放：调整仅本地生效，这可以辅助你决定是否授权使用自己的分轨或是否署名。"}
            tracks={mixerEngine.tracks}
            isOpen={true}
            isPlaying={mixerEngine.isPlaying}
            currentTime={mixerEngine.currentTime}
            duration={mixerEngine.duration}
            progress={mixerEngine.progress}
            loadingProgress={loadingProgress}
            mutes={mixerEngine.mutes}
            solos={mixerEngine.solos}
            levels={mixerEngine.levels}
            volumes={mixerEngine.volumes}
            pans={mixerEngine.pans}
            clips={mixerEngine.clips}
            masterVolume={mixerEngine.masterVolume}
            masterLevel={mixerEngine.masterLevel}
            masterClip={mixerEngine.masterClip}
            onClose={closeMixer}
            onMinimize={() => setMixerMinimized(true)}
            onPlayPause={mixerEngine.togglePlay}
            onStop={mixerEngine.stop}
            onSeek={mixerEngine.seek}
            onVolumeChange={mixerEngine.onVolumeChange}
            onPanChange={mixerEngine.onPanChange}
            onMuteToggle={mixerEngine.onMuteToggle}
            onSoloToggle={mixerEngine.onSoloToggle}
            onResetClip={mixerEngine.resetClip}
            onMasterVolumeChange={mixerEngine.onMasterVolumeChange}
            onResetMasterClip={mixerEngine.resetMasterClip}
            enableLocator
            locator={mixerEngine.locator}
            locatorActive={mixerEngine.locatorActive}
            onLocatorChange={(which, v) => { which === "a" ? mixerEngine.setLocatorA(v) : mixerEngine.setLocatorB(v) }}
            onLocatorMove={mixerEngine.moveLocator}
            onLocatorActiveChange={mixerEngine.setLocatorActive}
            loop={mixerEngine.loop}
            onLoopToggle={mixerEngine.setLoop}
            onResetAll={mixerEngine.resetAll}
            publishButton={isPublish ? (publishBtnState ?? undefined) : undefined}
            onPublishClick={runPublish}
            onClearMS={() => {
              mixerEngine.tracks.forEach(t => {
                if (mixerEngine.mutes[t.id]) mixerEngine.onMuteToggle(t.id, false)
                if (mixerEngine.solos[t.id]) mixerEngine.onSoloToggle(t.id, false)
              })
            }}
            countdownSec={countdownSec}
          />
        )}
        {mixerMinimized && (
          <MixerMini
            sessionLabel={`段落 ${mixerSession?.index}`}
            isPlaying={mixerEngine.isPlaying}
            currentTime={mixerEngine.currentTime}
            duration={mixerEngine.duration}
            progress={mixerEngine.progress}
            loadingProgress={loadingProgress}
            onTogglePlay={mixerEngine.togglePlay}
            onSeek={mixerEngine.seek}
            onClose={closeMixer}
            onFullscreen={() => setMixerMinimized(false)}
          />
        )}
      </>)
    })()}

    {/* 手慢一步弹窗（发表竞态败者） */}
    {claimTaken && (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
        onClick={() => setClaimTaken(null)}
      >
        <div
          className="jamony-modal-enter relative w-full max-w-xs rounded-2xl border px-5 py-5 text-center"
          style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs leading-relaxed text-white" style={{ lineHeight: 1.7 }}>
            手慢一步！<span style={{ color: "#00AAFF" }}>{claimTaken.nickname}</span>正在帮大家发表作品，请稍候。
          </p>
          <button
            onClick={() => setClaimTaken(null)}
            className="mt-4 rounded-[8px] px-5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
          >
            知道了
          </button>
        </div>
      </div>
    )}

    {/* 发表卡片（2026 上移至面板层：成品产自发表混音器，注入直开；往返保留已填字段） */}
    {publishSession && (() => {
      const auth = publishSession.tracks.filter(t => t.allow_use === true)
      return (
        <PublishWorkModal
          open={publishModalOpen}
          onClose={() => setPublishModalOpen(false)}
          session={{ index: publishSession.index, duration: publishSession.duration }}
          roomName={roomName || ""}
          roomStyle={roomStyle || ""}
          authors={auth
            .filter(t => !t.is_system && t.allow_attribution !== false)
            .map(t => ({ id: String(t.id), name: t.nickname, anonymous: false, instrument: instrumentEmoji(t.instrument_category) }))}
          anonymousCount={auth.filter(t => !t.is_system && t.allow_attribution === false).length}
          hasDrumTrack={auth.some(t => t.is_system === true)}
          roomId={roomId}
          sessionId={publishSession.id}
          currentUserId={currentUserId}
          authorizedTrackIds={auth.map(t => t.id)}
          authorizedTrackIsDrums={auth.map(t => t.is_system)}
          allTrackAuthors={auth.map(t => ({
            userId: t.user_id ?? 0,
            nickname: t.nickname,
            instrumentCategory: t.instrument_category,
            isAnonymous: t.allow_attribution === false,
          }))}
          livePublisherUserId={publishSession.publisher_user_id}
          injectedMix={injectedMix}
          deadlineMs={publishDeadlineMs}
          keepFieldsOnReopen
          onPublished={() => { /* socket sessions-update 自动刷新；草稿清空由面板 effect 处理 */ }}
        />
      )
    })()}

  </>
  )
}

function SessionCard({
  session,
  open,
  now,
  roomId,
  currentUserId,
  onToggle,
  onPatch,
  onPreview,
  onPublishEntry,
  claimingId,
}: {
  session: RecordingSession
  open: boolean
  now: number
  roomId?: string
  currentUserId?: number
  onToggle: () => void
  onPatch: (sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) => void
  onPreview?: () => void
  /** 1026 「去发表」入口（面板层抢锁→打开发表混音器） */
  onPublishEntry?: (session: RecordingSession) => void
  /** 面板层竞态进行中的 session id（「占位中」瞬态） */
  claimingId?: number | null
}) {
  const remaining = session.expires_at ? Math.max(0, Math.ceil((new Date(session.expires_at).getTime() - now) / 1000)) : 0
  const showCountdown = !session.all_locked && remaining > 0
  // 可发表=全员确权完毕 ∧ 至少一名真人乐手授权使用——作品不能是纯伴奏/纯looper,
  // 无真人参与无法发布作品(1029 欢哥铁律:前端灰+后端硬闸双拦)
  const canPublish = session.all_locked && session.agreed_count > 0
  // 1025 删除权前置(欢哥): 授权使用=所有权——本人轨未授权(=自动放弃)则按钮灰置,不再走"确认弹窗→403"尴尬链
  // 1028 死角根治(欢哥实测): 素材无主(全部人类轨已表态且全禁用,未决不算,looper不算)时任一轨主可删——单人禁用不再悬死
  const humanTracks = session.tracks.filter((t) => !t.is_system)
  const ownerless = humanTracks.length > 0 && humanTracks.every((t) => t.allow_use === false)
  const canDelete = session.tracks.some((t) => t.user_id === currentUserId && t.allow_use === true)
    || (ownerless && humanTracks.some((t) => t.user_id === currentUserId))
  const dialog = useJamonyDialog()
  const [delConfirm, setDelConfirm] = useState(false) // 1025 删除确认（欢哥四点定稿：与发表同现,授权=所有权）
  const refusedCount = session.tracks.filter(t => !t.is_system && t.allow_use === false).length

  return (
    <div className="rounded-[10px] border border-border bg-secondary">
      {/* 头部：段落信息 + 倒计时 + 发表按钮 + 展开（纤细版，欢哥 0923 瘦身） */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <button onClick={onToggle} className="flex items-center gap-2 text-left text-xs transition-colors hover:opacity-80">
            <span className="grid size-5 place-items-center rounded-[6px] bg-primary/20 text-[10px] font-bold text-brand-purple">{session.index}</span>
            <span>
              <span className="font-medium">段落 {session.index}</span>
              <span className="ml-2 text-[11px] text-muted-foreground">{session.duration} · {session.tracks.filter(t => !t.is_system).length} 人</span>
            </span>
          </button></div>

        <div className="flex items-center gap-2.5">
          {/* 倒计时 —— 全员共看一个，显示在去发表按钮左边 */}
          {showCountdown && (
            <span className="font-mono text-[11px] text-brand-pink">{fmt(remaining)} 后默认授权+署名</span>
          )}
          {/* 发表状态卡片 —— 全员 ①② 锁定后出现（1025 欢哥终版:已发表段同显授权文案,徽章删除不再占位） */}
          {session.all_locked && (
            <>
              <span className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-brand-green">{session.agreed_count}人已授权</span> · {refusedCount}人拒绝
              </span>
            </>
          )}
          {/* 1025 欢哥定稿: 授权入口显性化——置于发表按钮之前,点击照常弹授权抽屉 */}
          <button onClick={onToggle} className="flex items-center gap-1 rounded-md bg-brand-pink/75 px-2.5 py-1 text-[11px] font-bold text-white transition-transform hover:scale-[1.03]">
            授权
            <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {/* 1029 欢哥：试听入口从卡片左端 icon 迁到按钮行（授权后/去发表前），绿色胶囊同去发表款 */}
          {onPreview && (
            <button type="button" onClick={onPreview}
              className="flex items-center gap-1 rounded-md bg-brand-purple-deep px-3 py-1 text-xs font-bold text-white transition-all duration-200 hover:scale-[1.03]"
              aria-label="试听混音">
              <Headphones className="size-3" />
              试听
            </button>
          )}
          {/* 2026 去发表5态（欢哥定稿，全3字文案无站位跳动）：
              A 未全员授权=灰「去发表」 / B 可点 / C 「占位中」(竞态瞬间) / D 他人持锁=「发表中」 / E 已发表。
              点击=面板层抢锁→直开发表混音器（原确认弹窗与发表卡入口已上移退役） */}
          {(() => {
            const claiming = claimingId === session.id
            const isClaimed = session.publisher_user_id != null
            const isMine = isClaimed && session.publisher_user_id === currentUserId
            const isOthers = isClaimed && !isMine
            if (session.status === "published") return (
              <button disabled className="cursor-not-allowed rounded-md bg-brand-green/40 px-3 py-1 text-xs font-bold text-white opacity-60">
                已发表
              </button>
            )
            if (isOthers || claiming) return (
              <button disabled className={`cursor-not-allowed rounded-md bg-brand-blue/40 px-3 py-1 text-xs font-bold text-white opacity-40 ${claiming ? "animate-pulse" : ""}`}>
                {claiming ? "占位中" : "发表中"}
              </button>
            )
            return (
              <button
                onClick={() => onPublishEntry?.(session)}
                disabled={!canPublish || !onPublishEntry}
                title={canPublish ? undefined : session.all_locked
                  ? "作品必须有真人乐手授权参与——无人授权使用时无法发表"
                  : "等待所有乐手完成使用授权（倒计时结束自动默认授权）"}
                className={`rounded-md px-3 py-1 text-xs font-bold text-white transition-all duration-200 ${
                  canPublish
                    ? `${isMine ? "bg-brand-green" : "bg-brand-blue"} hover:scale-[1.03]`
                    : "cursor-not-allowed bg-brand-blue/40 opacity-40"
                }`}
              >
                {isMine ? "发表中" : "去发表"}
              </button>
            )
          })()}
          {/* 1028 死角第二层: 门槛原挂 canPublish(=有人授权才出按钮)——0人授权/全员禁用的段永远无按钮,
              ownerless 修复改了 disabled 却改不到"不出生"。渲染门槛=canDelete(已含授权者∨无主全判定) */}
          {canDelete && (
            <button
              onClick={() => canDelete && setDelConfirm(true)}
              disabled={!canDelete}
              title={canDelete ? '删除该录音' : '未授权使用该录音（视为放弃），无权删除'}
              className="grid size-6 place-items-center rounded-[6px] text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-3 py-1.5">
          <div className="flex flex-col gap-1">
            {session.tracks.map((t) => (
              <TrackRow key={t.id} track={t} session={session} roomId={roomId} currentUserId={currentUserId} onPatch={onPatch} />
            ))}
          </div>
        </div>
      )}

      {/* 1025 删除确认（欢哥定稿双文案）：已发表=软隐藏提示 / 未发表=物理删警示 */}
      {delConfirm && (
        <ConfirmModal
          text={session.status === 'published' ? '删除该作品不影响发表效果，只从列表删除，确认吗？' : '删除该录音？该段分轨文件将一并删除，不可恢复。'}
          confirmLabel="确认删除"
          onConfirm={async () => {
            setDelConfirm(false)
            try {
              const res = await fetch(`/api/rooms/${roomId}/sessions/${session.id}`, { method: "DELETE" })
              const data = await res.json()
              if (!data.ok) dialog.alert(data.msg || "删除失败")
              // 成功由 sessions-update 广播刷新列表
            } catch { dialog.alert("网络异常，删除失败") }
          }}
          onCancel={() => setDelConfirm(false)}
        />
      )}
    </div>
  )

}

function TrackRow({
  track,
  session,
  roomId,
  currentUserId,
  onPatch,
}: {
  track: Track
  session: RecordingSession
  roomId?: string
  currentUserId?: number
  onPatch: (sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) => void
}) {
  const isSelf = !track.is_system && track.user_id === currentUserId
  // 待确认的选择（①② 选完需弹窗确认才写死；③ 直接提交）
  const [pending, setPending] = useState<{ field: "allow_use" | "allow_attribution"; value: boolean } | null>(null)

  const emoji = track.is_system ? "🥁" : instrumentEmoji(track.instrument_category)

  function handleSelect(field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) {
    if (field === "allow_download") {
      onPatch(session.id, track.id, field, value)
      return
    }
    setPending({ field, value })
  }

  const confirmText = pending?.field === "allow_attribution"
    ? "确认后不可修改。后续可去「个人页面 → 我参与的作品」取消署名（不可恢复）。"
    : "确认你的选择吗？确认后不可修改。"

  return (
    <div className="flex items-center gap-2.5 rounded-[8px] px-2 py-1 text-xs">
      <span>{emoji}</span>
      <span className="w-20 shrink-0 font-medium">{track.nickname}</span>

      {/* 三个授权下拉（只有自己可见） */}
      {isSelf && (
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_use}
              nullLabel="使用授权"
              disabled={track.use_locked}
              options={[
                { label: "可使用", value: true, className: "text-brand-green", icon: <Check className="size-3" /> },
                { label: "禁用", value: false, className: "text-destructive", icon: <Ban className="size-3" /> },
              ]}
              onChange={(v) => handleSelect("allow_use", v)}
            />
            <HelpTip text="同意即可在发布的作品中使用你的分轨（不可撤销），禁用则不包含你的分轨" />
          </div>
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_attribution}
              nullLabel="选择署名"
              disabled={track.allow_use !== true || track.attribution_locked}
              options={[
                { label: "可署名", value: true, className: "text-brand-green", icon: <Check className="size-3" /> },
                { label: "匿名", value: false, className: "text-destructive", icon: <Ban className="size-3" /> },
              ]}
              onChange={(v) => handleSelect("allow_attribution", v)}
            />
            <HelpTip text="同意则在作品中展示你的用户名（不可撤销），匿名则隐藏用户名" />
          </div>
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_download}
              nullLabel="下载权限"
              options={[
                { label: "可下载", value: true, className: "text-brand-green", icon: <Check className="size-3" /> },
                { label: "禁下载", value: false, className: "text-destructive", icon: <Ban className="size-3" /> },
              ]}
              onChange={(v) => handleSelect("allow_download", v)}
            />
            <HelpTip text="同意则他人可下载你的分轨，禁用则仅你自己可下载" />
          </div>
        </div>
      )}

      {/* 非自己（含 jamony-looper 系统轨）：只显示状态文本（1028 欢哥定稿格式统一——
          授权=Check+绿文案 / 拒绝=Ban禁止符+红文案，lucide 线条同构，三态不再灰绿混杂） */}
      {!isSelf && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px]">
            {track.allow_use === true && <span className="flex items-center gap-0.5 text-brand-green"><Check className="size-3" /> 可使用</span>}
            {track.allow_use === false && <span className="flex items-center gap-0.5 text-destructive"><Ban className="size-3" /> 禁用</span>}
            {track.allow_use === null && <span className="text-muted-foreground">⏳ 选择中</span>}
          </span>
          {track.allow_use === true && track.allow_attribution !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              {track.allow_attribution === true
                ? <span className="flex items-center gap-0.5 text-[11px] text-brand-green"><Check className="size-3" /> 可署名</span>
                : <span className="flex items-center gap-0.5 text-[11px] text-destructive"><Ban className="size-3" /> 匿名</span>}
            </>
          )}
          {track.allow_download !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              {track.allow_download === true
                ? <span className="flex items-center gap-0.5 text-[11px] text-brand-green"><Check className="size-3" /> 可下载</span>
                : <span className="flex items-center gap-0.5 text-[11px] text-destructive"><Ban className="size-3" /> 禁下载</span>}
            </>
          )}
        </div>
      )}

      {/* 下载按钮：自己始终可见；他人 ③=可下载见下载 icon，否则见禁下载 icon（纤细版 20px） */}
      <div className="ml-auto">
        {isSelf ? (
          track.normalized ? (
            <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download-file`} className="grid size-5 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="下载我的分轨" download>
              <Download className="size-3" />
            </a>
          ) : (
            <span className="grid size-5 place-items-center cursor-not-allowed text-muted-foreground/40" title="音轨准备中">
              <span className="size-3 text-[8px] font-bold text-muted-foreground/30">⏳</span>
            </span>
          )
        ) : track.allow_download === true ? (
          track.normalized ? (
            <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download-file`} className="grid size-5 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={`下载 ${track.nickname} 的分轨`} download>
              <Download className="size-3" />
            </a>
          ) : (
            <span className="grid size-5 place-items-center cursor-not-allowed text-muted-foreground/40" title="音轨准备中">
              <span className="size-3 text-[8px] font-bold text-muted-foreground/30">⏳</span>
            </span>
          )
        ) : (
          <span className="grid size-5 place-items-center text-muted-foreground/40" title={track.allow_download === false ? `${track.nickname} 禁止下载` : "待授权"}>
            <Ban className="size-3" />
          </span>
        )}
      </div>

      {/* ①② 确认弹窗 */}
      {pending && (
        <ConfirmModal
          text={confirmText}
          onConfirm={() => { onPatch(session.id, track.id, pending.field, pending.value); setPending(null) }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}

// GP 读谱工作站（10-09 P2 工作站化，行为分层照搬 alphaTab 官网 demo）：
// 点轨切谱/缩放/五线六线/横竖排/节拍器=本地各看各的；S/M/单轨音量/倍速/走带=房级（全员可调，后动作胜出，播放瞬间定版——欢哥 10-09 定稿）
// 音频仍走幽灵乐手单流（jamsoul 广播）；本地 player 步骤③再开（静音只做指针）
type GpTrackInfo = { index: number; name: string; playbackInfo?: { volume: number } }
type GpApi = {
  destroy?: () => void
  load: (d: unknown, s?: () => void, e?: (x: Error) => void) => boolean
  renderTracks: (tracks: GpTrackInfo[]) => void
  changeTrackVolume?: (tracks: GpTrackInfo[], ratio: number) => void
  tracks?: GpTrackInfo[]
  play?: () => void
  pause?: () => void
  timePosition?: number
  scoreLoaded?: { on: (cb: (s: { tracks?: GpTrackInfo[] }) => void) => void }
  renderFinished?: { on: (cb: () => void) => void }
  renderStarted?: { on: (cb: (isResize: boolean) => void) => void }
  playerReady?: { on: (cb: () => void) => void }
  playerPositionChanged?: { on: (cb: (args: { currentTime: number; endTime: number }) => void) => void }
  soundFontLoaded?: { on: (cb: () => void) => void }
  soundFontLoad?: { on: (cb: (args: { loaded: number; total: number }) => void) => void }
  soundFontLoadFailed?: { on: (cb: (e: unknown) => void) => void }
  error?: { on: (cb: (e: unknown) => void) => void }
  beatMouseUp?: { on: (cb: (beat: { playbackStart?: number; absolutePlaybackStart?: number; playbackDuration?: number; voice?: { bar?: { masterBar?: unknown } } } | null) => void) => void }
  beatMouseDown?: { on: (cb: (beat: { absolutePlaybackStart?: number; playbackDuration?: number; voice?: { bar?: { masterBar?: unknown } } } | null) => void) => void }
  beatMouseMove?: { on: (cb: (beat: unknown) => void) => void }  // 拖选实时预览（⑥-2b）
  highlightPlaybackRange?: (startBeat: unknown, endBeat: unknown) => void  // ⑥-2b 选段高亮（官方自建选区API，只放标记不动播放）
  postRenderFinished?: { on: (cb: () => void) => void }  // 重渲染终了（内部选区重画之后——选区重穿挂钩点，1012修三）
  clearPlaybackRangeHighlight?: () => void
  tickCache?: { masterBars?: { start: number; masterBar?: unknown }[] } | null
  settings?: { display: { scale: number; staveProfile: number; layoutMode: number }; player: { scrollMode: number } }
  updateSettings?: () => void
  render?: () => void
  print?: () => void
  settingsUpdated?: { on: (cb: () => void) => void }
}

function GpWorkstation({ score, canClear, onClear, gpState, onPlay, onPause, onMix, onSpeed, onCountin, onLoop, onRange, canMix }: {
  score: RoomScore; canClear?: boolean; onClear?: () => void
  gpState?: { playing: boolean; startedAt?: string; startMs?: number; speed?: number; countInMs?: number; endMs?: number } | null
  onPlay?: (startMs?: number) => void; onPause?: () => void
  onMix?: (mix: GpMix) => void; onSpeed?: (speed: number) => void; onCountin?: (countin: boolean) => void; onLoop?: (loop: boolean) => void; onRange?: (range: { a: number; b: number } | null) => void; canMix?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 两层结构（10-09 滚动雪球根治）：外层viewport管滚动，内层host挂alphaTab——
  // 官网同款父子结构；若同div兼任两层，滚动公式 offset+barY 退化成 scrollTop+barY 滚雪球（每次多滚几行）
  const viewportRef = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState("")
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const url = score.files[0]
  const playing = !!gpState?.playing
  const [pending, setPending] = useState(false)
  // 分轨面板（步骤①）：tracks=展示用副本；realTracksRef=alphaTab 原轨对象（renderTracks 必须喂原对象）；renderedIdx=当前上屏轨
  const apiRef = useRef<GpApi | null>(null)
  const realTracksRef = useRef<GpTrackInfo[]>([])
  const [tracks, setTracks] = useState<GpTrackInfo[]>([])
  const renderedIdxRef = useRef<number[]>([])    // renderedIdx 镜像（换档effect读最新分轨选择，防闭包陈旧）
  const [renderedIdx, setRenderedIdx] = useState<number[]>([])
  renderedIdxRef.current = renderedIdx  // 每渲染同步
  const [panelOpen, setPanelOpen] = useState(false)  // 分轨弹层（10-09 欢哥定稿：工具栏只放入口，点开向上弹列表——吉他社样式）
  const [totalMs, setTotalMs] = useState(0)  // 谱面总时长（alphaTab 式 00:00/04:46 的分母；0=未知不显示）
  // 指针（步骤③）：本地静音 player 跟服务器走带；playerReady=音源就绪（就绪前不跟）；posMs=真实位置（秒变才setState防刷屏）
  const [playerReady, setPlayerReady] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const lastPosSecRef = useRef(-1)
  const [metronome, setMetronome] = useState(false)  // 本地节拍器（各自开关不进房混）
  // 自研节拍器引擎（1011）：click 弃 alphaSynth——它挂合成时间轴=出声恒慢缓冲水位(默认500ms≈250ms,
  // 欢哥85bpm实测慢不到半拍)；砍缓冲100ms又欠载翻车(已回滚)。正解=WebAudio 硬件时钟直调(baseLatency实测5ms)：
  // 追拍式调度(500ms轮询排未来2s拍点)，拍点出声墙钟=startedAt+(拍点-base)+lag(与谱子音频到达模型同式)——
  // 不受 player 卡顿/对表 seek 影响(player 卡了 click 照准)
  const metroRef = useRef<{
    ac: AudioContext | null; master: GainNode | null
    beats: { ms: number; accent: boolean }[]; nextIdx: number
    timer: ReturnType<typeof setInterval> | null
  }>({ ac: null, master: null, beats: [], nextIdx: 0, timer: null })
  const [sfPct, setSfPct] = useState(-1)  // 音源加载进度（首访可见；-1=不在加载）
  const [fileMeta, setFileMeta] = useState({ title: "", artist: "" })  // 谱内标题/作者（审计#9：demo从文件读，别只显示上传文件名）
  // 步骤④视图三件套（全本地）：缩放/五线六线/横竖排——枚举模块留存+当前值镜像（供菜单高亮）
  const atModuleRef = useRef<{ LayoutMode: Record<string, number>; ScrollMode: Record<string, number>; StaveProfile: Record<string, number> } | null>(null)
  const [zoomPct, setZoomPct] = useState(100)
  const [staveKey, setStaveKey] = useState("ScoreTab")
  const [layoutKey, setLayoutKey] = useState("page")
  const applyView = (patch: { zoom?: number; stave?: string; layout?: string }) => {
    const api = apiRef.current
    const at = atModuleRef.current
    if (!api?.settings || !at) return
    if (patch.zoom) { api.settings.display.scale = patch.zoom / 100; setZoomPct(patch.zoom) }
    if (patch.stave) { api.settings.display.staveProfile = at.StaveProfile[patch.stave] ?? at.StaveProfile.ScoreTab; setStaveKey(patch.stave) }
    if (patch.layout) {
      // Layout↔ScrollMode 联动照抄 demo：竖排=Page+Continuous；横排连续=Horizontal+Continuous；横排翻页=Horizontal+OffScreen
      // （滚动处理器由 alphaTab 按 layout 的 vertical 性自动选横/竖系，指针跟随逻辑全部原生）
      if (patch.layout === "page") { api.settings.display.layoutMode = at.LayoutMode.Page; api.settings.player.scrollMode = at.ScrollMode.Continuous }
      else if (patch.layout === "hbar") { api.settings.display.layoutMode = at.LayoutMode.Horizontal; api.settings.player.scrollMode = at.ScrollMode.Continuous }
      else { api.settings.display.layoutMode = at.LayoutMode.Horizontal; api.settings.player.scrollMode = at.ScrollMode.OffScreen }
      setLayoutKey(patch.layout)
    }
    api.updateSettings?.()
    api.render?.()
  }
  const [scrubMs, setScrubMs] = useState(0)  // 起始位置（10-09 欢哥定稿：未播放时点进度线/谱面设定，播放从指针处开播——谁点播放用谁的位置）
  const scrubMsRef = useRef(0)
  scrubMsRef.current = scrubMs  // 换档域换算读最新值
  // 倍速·本地烤 tempo 基建（10-10 步骤⑤根治版）：playbackSpeed 在我们环境（自托管worker+ScriptProcessor）
  // 实测无效——读回0.9但推进1.0x（欢哥日志铁证：事件每秒+1000ms谱面时间；源码定罪 _onSamplesPlayed
  // 按输出采样推进不带speed，四层设置链全通但调度层死路）→ 弃用，与服务器同构：tempoAutomations ×spd
  // 烤死谱模型，player 恒1.0x播放=天然变速。scoreLoaded 先于 player MIDI 生成触发，烤完即生效
  const speedRef = useRef(score.speed ?? 1)      // 已烤进谱的档（换档effect独占更新）

  // 空格=播放/暂停（1031 欢哥拍板，Guitar Pro 肌肉记忆）：与底部走带条主按钮同一条房级链
  // （断点续播换算/pending 防抖/后动作胜出全同款）；注册进全站空格仲裁器——
  // 谱在屏即注册，混音器后打开时在视觉顶层、空格随之让位，混音器关闭/最小化自动回落到谱
  useSpaceControl(!!onPlay || !!onPause, () => {
    if (pending) return
    setPending(true)
    playing ? onPause?.() : onPlay?.(Math.round(scrubMs * speedRef.current))
  })
  const bufRef = useRef<Uint8Array | null>(null) // 换档重载用的谱子原文
  const loadedRef = useRef(false)                // scoreLoaded 已过（换档才需要重载）
  const reloadSeekRef = useRef<number | null>(null)  // 重载后恢复的谱面位置（烤速域）
  const reloadRenderSelRef = useRef<number[] | "all" | null>(null)  // 重载后恢复的分轨选择（1011换档现场恢复）
  // 选段（1011 ⑥-2b）基建
  const selDownTickRef = useRef<number | null>(null)  // mousedown 记 A 的绝对tick（null=单击语义）
  const selDownBeatRef = useRef<unknown>(null)  // mousedown 的 beat 对象（拖动实时高亮用）
  const selTrackIdxRef = useRef<number | null>(null)  // 1012 修：用户在哪轨上框选的（回填高亮用同轨=不跳轨）
  const scoreRangeRef = useRef<{ a: number; b: number } | undefined>(undefined)
  scoreRangeRef.current = score.range
  // 选区高亮 beat 表（1012 修：按轨建）——旧版只建第 0 轨的表，切到其他轨独显时第 0 轨不在画面上，
  // alphaTab findBeat 找不到坐标抛异常（被吞）但 DOM 已"先清空后重建"=松手后紫色永远消失（欢哥六线谱实测定罪）
  const mbBeatsRef = useRef<Map<number, Map<unknown, unknown[]>>>(new Map())  // trackIndex → (masterBar → beats)
  // 音频时延补偿（10-10 欢哥"指针从头恒快1拍"）：指针=墙钟理论线，耳朵=网络流到达线，差=端到端音频时延（常数无漂移）。
  // 测法：ping端点取最小RTT/2（网络单程）+ 固定播放缓冲常数（编码+抖动缓冲+解码）；残差靠耳朵报数调常数
  const AUDIO_PLAYOUT_MS = 200
  const audioLagRef = useRef(0)
  // 时延补偿终态（1011 欢哥耳朵全绿验收）：jamsoul IPC 实测优先（每秒自适应），非 Electron/断链退 ping+常数兜底。
  // 不做用户自校（欢哥拍板：负担>收益）；测量代替常数——可观测即可计算，边界外（蓝牙/DAC）诚实告知
  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        let best = Infinity
        for (let i = 0; i < 5; i++) {
          const t0 = performance.now()
          const r = await fetch("/api/ping", { cache: "no-store" })
          if (r.ok) best = Math.min(best, performance.now() - t0)
        }
        if (!stop && Number.isFinite(best)) {
          audioLagRef.current = Math.min(1000, best / 2 + AUDIO_PLAYOUT_MS)
          console.log(`[gp时延] 兜底补偿=${Math.round(audioLagRef.current)}ms (RTT=${Math.round(best)}ms)`)
        }
      } catch (e) { /* 拿不到就0=纯墙钟指针 */ }
    })()
    // jamsoul IPC：gp=单向输出估计（物理推导零经验数字）；降级链防新旧二进制混搭崩坏（1010晚事故教训）
    const api = (window as unknown as { jamonyAPI?: { onJamsoulDelay?: (cb: (d: { gp?: number; overall?: number; ping?: number }) => void) => () => void } }).jamonyAPI
    let ipcCount = 0
    const off = api?.onJamsoulDelay?.((d) => {
      let lag = NaN
      if (Number.isFinite(d?.gp) && d.gp! > 0 && d.gp! <= 2000) lag = d.gp!
      else if (Number.isFinite(d?.overall) && d.overall! > 0 && d.overall! <= 3000) {
        lag = d.overall! - (Number.isFinite(d?.ping) ? d.ping! : 0) / 2
        if (!(lag > 0)) return
      }
      if (!Number.isFinite(lag)) return
      audioLagRef.current = Math.min(1000, lag)
      ipcCount++
      if (ipcCount <= 3) console.log(`[gp时延] jamsoul实测 lag=${Math.round(lag)}ms (gp=${d?.gp} overall=${d?.overall} ping=${d?.ping})`)
    })
    return () => { stop = true; off?.() }
  }, [])
  // tick→毫秒映射（谱面点击换算用）：scoreLoaded 时从本地生成的 MIDI 事件里捕获（与总时长同一套积分）
  const tickMapRef = useRef<{ tempos: { tick: number; bpm: number }[]; division: number } | null>(null)
  const tickToMs = (tick: number): number => {
    const t = tickMapRef.current
    if (!t || t.division <= 0) return 0
    let ms = 0, prevTick = 0, bpm = 120
    for (const p of t.tempos) {
      if (p.tick >= tick) break
      ms += ((p.tick - prevTick) / t.division) * (60000 / bpm)
      prevTick = p.tick; bpm = p.bpm
    }
    return ms + ((tick - prevTick) / t.division) * (60000 / bpm)
  }
  // ms→tick（⑥-2b 选段回填）：tickToMs 逆运算（烤速域；与服务器 gpMsToTick 同构）
  const msToTick = (ms: number): number => {
    const t = tickMapRef.current
    if (!t || t.division <= 0) return 0
    let tick = 0, prevTick = 0, accMs = 0, bpm = 120
    for (const p of t.tempos) {
      const segMs = ((p.tick - prevTick) / t.division) * (60000 / bpm)
      if (accMs + segMs >= ms) return Math.round(tick + ((ms - accMs) / (60000 / bpm)) * t.division)
      accMs += segMs; tick = p.tick; prevTick = p.tick; bpm = p.bpm
    }
    return Math.round(tick + ((ms - accMs) / (60000 / bpm)) * t.division)
  }
  const playingRef = useRef(false)
  playingRef.current = playing  // 事件回调防陈旧闭包
  // 倍速（10-10 步骤⑤）：房级、播放瞬间定版（与混音同语义）；score.speed=服务器真相源
  // （gp-speed 广播在 chat-socket 合并进 realtimeScore），emit 侧已乐观合并，这里无本地 state；
  // 服务器 tempo ×speed 烤进 live MIDI → 音频同倍速，本地 playbackSpeed 同设 → 指针/滚动/节拍器同船变速
  const speed = score.speed ?? 1
  const speedLocked = playing
  const countin = !!score.countin  // 预备拍（⑥-1）：服务器真相源（gp-countin 广播合并 realtimeScore），emit 侧乐观
  const loop = !!score.loop  // 循环（⑥-2a）：播完自动重头——⚠️播放中不锁（管"要不要再来"的未来行为，非已烤流）
  // 调音台（步骤②）：S/M/单轨音量=房级，后动作胜出、播放定版（欢哥 A 方案）；score.mix=服务器真相源，本地乐观+广播回填
  const [mix, setMix] = useState<GpMix>(score.mix ?? {})
  const mixRef = useRef(mix)
  useEffect(() => { const m = score.mix ?? {}; mixRef.current = m; setMix(m) }, [score.mix])
  const volEmitRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (volEmitRef.current) clearTimeout(volEmitRef.current) }, [])
  const toggleArr = (arr: number[] | undefined, i: number) => (arr?.includes(i) ? arr.filter((x) => x !== i) : [...(arr ?? []), i])
  // 播放中锁混音（欢哥 10-09 定稿：音频既成流不可变，UI 如实呈现——除暂停外全锁，
  // 禁用样式+悬停说明；点轨切谱=本地视觉行为不锁）
  const mixLocked = playing
  const pushMix = (next: GpMix) => { mixRef.current = next; setMix(next); onMix?.(next) }
  const toggleMute = (i: number) => { if (mixLocked || !canMix) return; pushMix({ ...mixRef.current, mutes: toggleArr(mixRef.current.mutes, i) }) }
  const toggleSolo = (i: number) => { if (mixLocked || !canMix) return; pushMix({ ...mixRef.current, solos: toggleArr(mixRef.current.solos, i) }) }
  // 滑条拖动节流：本地即时，上报尾随 120ms（拖动中不逐像素广播）；播放中锁（守卫兜底，样式层已禁）
  const setVol = (i: number, pct: number) => {
    if (mixLocked || !canMix) return
    const next = { ...mixRef.current, vols: { ...(mixRef.current.vols ?? {}), [String(i)]: pct } }
    mixRef.current = next
    setMix(next)
    if (volEmitRef.current) clearTimeout(volEmitRef.current)
    volEmitRef.current = setTimeout(() => onMix?.(next), 120)
  }
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { setPending(false) }, [playing, gpState?.startedAt])  // 状态广播回来解锁过渡态
  useEffect(() => { if (!pending) return; const t = setTimeout(() => setPending(false), 10000); return () => clearTimeout(t) }, [pending])

  const showTracks = (sel: number | "all") => {
    const api = apiRef.current
    if (!api) return
    const list = sel === "all" ? realTracksRef.current : [realTracksRef.current[sel]]
    if (!list || list.length === 0 || list[0] === undefined) return
    api.renderTracks(list)
  }

  useEffect(() => {
    let cancelled = false
    let api: GpApi | null = null
    loadedRef.current = false  // 换谱重置（防换档effect拿旧buf重复重载的竞态护栏）
    reloadSeekRef.current = null
    ;(async () => {
      try {
        const at = await import("@coderline/alphatab")
        atModuleRef.current = at as unknown as { LayoutMode: Record<string, number>; ScrollMode: Record<string, number>; StaveProfile: Record<string, number> }
        // 自托管资产清单（immutable缓存锚点）：音源(synth必需) + worker(打包环境起 synth worker 的唯一途径)
        const mf = await fetch("/soundfont/manifest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const settings = new at.Settings()
        settings.core.useWorkers = true           // 渲染worker（审计#1修复）：自托管scriptFile已验证worker通路，回归demo默认——渲染不再卡UI线程
        settings.core.fontDirectory = "/alphatab-font/"
        // ⚠️ blob worker 的 importScripts 解析不了相对URL——scriptFile 必须拼完整绝对URL（10-09 二修，欢哥实测卷宗定罪）
        if (mf?.worker) settings.core.scriptFile = new URL(`/alphatab/${mf.worker}`, window.location.origin).href
        settings.player.enablePlayer = true       // 步骤③指针：本地 player 只做走带指针+可选节拍器（全轨静音），音频仍走幽灵乐手
        // ⚠️合成缓冲保持默认500ms（1011夜教训）：砍到100ms求click低延迟→ScriptProcessor欠载(worker消息往返抖动>
        // 浅缓冲)→click饿死无声+位置推进断续=滚动卡顿。500是稳定性资产不是浪费；click延迟另修(自研WebAudio调度)
        // ⚠️打包环境（BrowserModule）下 worklet 加载走 new URL("./alphaTab.worklet.ts", undefined) 必炸且无 scriptFile 兜底
        // → 播放器整体起不来（10-09 指针无显示的真凶）。强制 ScriptProcessor 输出绕开 worklet，worker 走自托管 scriptFile
        settings.player.outputMode = at.PlayerOutputMode.WebAudioScriptProcessor
        // 关原生谱面交互（10-10 欢哥裁决）：alphaTab点击跳转/拖框选=本地播放器语义，与服务器推流冲突
        // （播放中点击会本地跳变1-2s再被对表拉回=信号干扰）；静止态点击定起点由 beatMouseUp 自接，播放中锁死
        settings.player.enableUserInteraction = false
        if (mf?.file) settings.player.soundFont = `/soundfont/${mf.file}`
        ;(settings.player as { scrollElement?: unknown }).scrollElement = viewportRef.current
        const res = await fetch(url)
        if (!res.ok) throw new Error(`谱子文件加载失败(${res.status})`)
        const buf = new Uint8Array(await res.arrayBuffer())
        if (cancelled) return
        const real = new at.AlphaTabApi(containerRef.current!, settings) as unknown as GpApi
        api = real
        apiRef.current = real
        // 关加载指示器用事件（load 回调在 1.8.4 上不可靠，谱面已渲染但 success 未触发——10-07 欢哥实测）
        real.scoreLoaded?.on?.((s: { tracks?: GpTrackInfo[]; title?: string; artist?: string }) => {
          if (cancelled) return
          setLoading(false)
          setFileMeta({ title: String(s.title || "").slice(0, 60), artist: String(s.artist || "").slice(0, 40) })
          const src = s.tracks ?? []
          realTracksRef.current = src  // 原对象留给 renderTracks
          // 选段高亮表（⑥-2b beat级；1012 按轨建）：每轨 masterBar→beats（highlightPlaybackRange 需要
          // **当前渲染中轨**的 beat 对象——不在画面上的轨没有坐标）
          try {
            const byTrack = new Map<number, Map<unknown, unknown[]>>()
            for (const tr of src as unknown as { index?: number; staves?: { bars?: { masterBar?: unknown; voices?: { beats?: unknown[] }[] }[] }[] }[]) {
              const m = new Map<unknown, unknown[]>()
              for (const st of tr.staves ?? []) for (const bar of st.bars ?? []) {
                const beats = bar.voices?.[0]?.beats ?? []
                if (bar.masterBar !== undefined && beats.length > 0) m.set(bar.masterBar, beats)
              }
              if (m.size > 0) byTrack.set(typeof tr.index === "number" ? tr.index : byTrack.size, m)
            }
            mbBeatsRef.current = byTrack
          } catch (e) { /* 高亮表失败不阻塞 */ }
          setTracks(src.map((t) => ({ index: t.index, name: String(t.name || `轨 ${t.index + 1}`).slice(0, 40) })))
          // 本地静音·根治版（10-10 欢哥jamsoul静音looper仍闻声=本地漏音定罪）：混音器级静音架不住
          // 本地MIDI里烤着的CC7音量事件在播放开始时重新充压——把模型 playbackInfo.volume 直接清0，
          // 内部生成(含任何重生成)烤出的CC7全为0，永久静音；节拍器独立通道不受影响；服务器生成用自己那份文件不受影响
          for (const t of src) { try { if (t.playbackInfo) t.playbackInfo.volume = 0 } catch (e) { /* 单轨失败不阻塞 */ } }
          // 烤 tempo（幂等：__origBpm 首次存原值）——必须在总时长积分之前（integral 读烤后 tempo=烤速域）
          const spd = speedRef.current
          try {
            for (const mb of (s as { masterBars?: { tempoAutomations?: { value: number; __origBpm?: number }[] }[] }).masterBars ?? []) {
              for (const a of mb.tempoAutomations ?? []) {
                if (typeof a.value !== "number" || !(a.value > 0)) continue
                if (a.__origBpm === undefined) a.__origBpm = a.value
                a.value = a.__origBpm * spd
              }
            }
          } catch (e) { /* 烤失败退原速，不阻塞 */ }
          loadedRef.current = true
          if (reloadSeekRef.current !== null) {
            // 换档重载·现场恢复（1011）：位置+分轨选择都回到换档前的现场——刷新是必须的（tempo重烤），
            // 但用户的"看哪一轨、停在哪一小节"不该丢。恢复须等渲染+tickCache 就绪（scoreLoaded 里太早
            // 会被冲掉），延迟窗口后一并恢复；换谱竞态由 cancelled 拦截
            const seek = reloadSeekRef.current
            reloadSeekRef.current = null
            const sel = reloadRenderSelRef.current
            reloadRenderSelRef.current = null
            setTimeout(() => {
              if (cancelled) return
              const api = apiRef.current
              if (!api) return
              if (sel && sel !== "all") {
                const list = sel.map((i) => realTracksRef.current[i]).filter(Boolean)
                if (list.length > 0) { try { api.renderTracks(list) } catch (e) { /* 恢复失败退全轨 */ } }
              }
              try { api.timePosition = seek } catch (e) { /* 恢复失败无碍 */ }
            }, 400)
          } else {
            setScrubMs(0)  // 换谱重置起始位置
          }
          lastPosSecRef.current = -1
          // 总时长：本地 MidiFileGenerator 生成事件流（与播放器/服务器同一条生成路径，反复记号展开一致），
          // tempo 积分出毫秒——烤后 tempo=烤速域时长（0.9x 显示5:38=这遍真实播放时长，GP改曲速心智）
          // ⚠️ 不用 midiFile.events getter——1.8.4 多轨下 this.events.push 自调用会无限递归，自己走 tracks[].events
          try {
            const m = (at as unknown as {
              midi: {
                MidiFile: new () => { division: number; tracks: { events: unknown[] }[] }
                AlphaSynthMidiFileHandler: new (f: unknown, smf1: boolean) => unknown
                MidiFileGenerator: new (score: unknown, meta: unknown, handler: unknown) => { generate: () => void }
              }
            }).midi
            const mf = new m.MidiFile()
            new m.MidiFileGenerator(s, null, new m.AlphaSynthMidiFileHandler(mf, true)).generate()
            let maxTick = 0
            const tempos: { tick: number; bpm: number }[] = []
            for (const tr of mf.tracks) for (const ev of tr.events as { tick: number; beatsPerMinute?: number }[]) {
              if (ev.tick > maxTick) maxTick = ev.tick
              if (typeof ev.beatsPerMinute === "number" && ev.beatsPerMinute > 0) tempos.push({ tick: ev.tick, bpm: ev.beatsPerMinute })
            }
            tempos.sort((a, b) => a.tick - b.tick)
            tickMapRef.current = { tempos, division: mf.division }  // 谱面点击 tick→ms 换算表
            // 拍点表（照搬 alphaSynth sequencer 拍点算法 alphaTab.js L35095+）：事件流 TimeSignature 驱动拍长，
            // 全曲 tick 轴每拍一点，accent=小节内第0拍——供自研 WebAudio 节拍器调度
            try {
              const sigs: { tick: number; numerator: number; denominatorIndex: number }[] = []
              for (const tr of mf.tracks) for (const ev of tr.events as { tick: number; numerator?: number; denominatorIndex?: number }[]) {
                if (typeof ev.numerator === "number") sigs.push({ tick: ev.tick, numerator: ev.numerator, denominatorIndex: ev.denominatorIndex ?? 2 })
              }
              sigs.sort((a, b) => a.tick - b.tick)
              const beats: { ms: number; accent: boolean }[] = []
              let mTick = 0, numerator = 4, beatTicks = mf.division  // 默认 4/4：一拍=division ticks（四分音符）
              const pushBeats = (untilTick: number) => {
                while (beatTicks > 0 && mTick < untilTick && mTick <= maxTick) {
                  beats.push({ ms: tickToMs(mTick), accent: Math.floor(mTick / beatTicks) % numerator === 0 })
                  mTick += beatTicks
                }
              }
              for (const sig of sigs) {
                pushBeats(sig.tick)
                numerator = sig.numerator
                beatTicks = Math.round(mf.division * 4 / Math.pow(2, sig.denominatorIndex))
              }
              pushBeats(maxTick + 1)
              metroRef.current.beats = beats
              metroRef.current.nextIdx = 0
            } catch (e) { /* 拍点失败节拍器静默不响，不阻塞主流程 */ }
            // 时延探针（10-10 欢哥"快半拍"精修）：把体感拍数量化成毫秒（烤后 BPM——耳朵听到的是变速后的拍）
            if (tempos.length > 0) {
              const bpm = tempos[0].bpm
              console.log(`[gp时延] 谱面 BPM=${Math.round(bpm)}（烤后） 一拍=${Math.round(60000 / bpm)}ms 半拍=${Math.round(30000 / bpm)}ms`)
            }
            const ms = tickToMs(maxTick)
            if (ms > 0 && Number.isFinite(ms)) setTotalMs(ms)
          } catch (e) { /* 总时长拿不到只显示走过时间，不影响主流程 */ }
        })
        // renderStarted 在窗口 resize 时也触发（jamsoul 窗口跟随会resize风暴），值没变就跳过 setState
        real.renderStarted?.on?.(() => {
          if (cancelled) return
          const idxs = (apiRef.current?.tracks ?? []).map((t) => t.index)
          setRenderedIdx((prev) => (prev.join() === idxs.join() ? prev : idxs))
        })
        real.renderFinished?.on?.(() => { if (!cancelled) setLoading(false) })
        // 1012 修三：alphaTab 重渲染时对选区"先清空后重建"，旧 beat 坐标失效（切轨/换显）就清空不重建——
        // 挂 postRenderFinished（在它内部重画之后）用当前渲染轨的 beat 把房级 range 重穿回去
        real.postRenderFinished?.on?.(() => { if (!cancelled && scoreRangeRef.current) applyRangeHighlightRef.current() })
        // 选段（1012 ⑥-2b beat级）：暂停态按下记 A，松开记 B——beat 级精确（absolutePlaybackStart 官方语义，
        // 同 alphaTab demo 可精确到音符）；同 beat 单击=定起点（10-09 原语义）或清选区（已有选区时）。播放中锁
        real.beatMouseDown?.on?.((beat) => {
          if (cancelled || playingRef.current || !beat) return
          selDownTickRef.current = typeof beat.absolutePlaybackStart === "number" ? beat.absolutePlaybackStart : null
          selDownBeatRef.current = beat
          const st = (beat as { voice?: { bar?: { staff?: { track?: { index?: number } } } } }).voice?.bar?.staff?.track
          if (st && typeof st.index === "number") selTrackIdxRef.current = st.index
        })
        // 拖选实时预览（1012）：拖动经过的 beat 即时染色（demo 同款——用户需要"已经开始选了"的反馈）
        real.beatMouseMove?.on?.((beat) => {
          if (cancelled || playingRef.current || !beat) return
          const downBeat = selDownBeatRef.current
          if (downBeat === null || downBeat === undefined) return
          try { apiRef.current?.highlightPlaybackRange?.(downBeat, beat) } catch (e) { /* 预览失败无碍 */ }
        })
        real.beatMouseUp?.on?.((beat) => {
          if (cancelled || playingRef.current || !beat) return
          const downTick = selDownTickRef.current
          selDownTickRef.current = null
          selDownBeatRef.current = null
          const upStart = typeof beat.absolutePlaybackStart === "number" ? beat.absolutePlaybackStart : null
          if (upStart === null) return
          // 同 beat（未拖）：已有选区→清选区回全曲；无选区→定起点（10-09 原语义）
          if (downTick === null || downTick === upStart) {
            if (scoreRangeRef.current) {
              onRange?.(null)
              try { apiRef.current?.clearPlaybackRangeHighlight?.() } catch (e) { /* 静默 */ }
              return
            }
            const ms = Math.max(0, Math.round(tickToMs(upStart)))
            setScrubMs(ms)
            const api = apiRef.current
            if (api) { try { api.timePosition = ms } catch (e) { /* 预览失败无碍 */ } }
            return
          }
          // 拖选 A-B（beat 级，方向自动归位）：B 端=松开 beat 的末（含该音符时值）
          const upEnd = upStart + (typeof beat.playbackDuration === "number" && beat.playbackDuration > 0 ? beat.playbackDuration : 240)
          const tickA = Math.min(downTick, upStart)
          const tickB = downTick < upStart ? upEnd : downTick + 240  // 反向拖时 B 端=按下 beat 末（近似一个四分音符兜底）
          const msA = tickToMs(tickA)
          const msB = tickToMs(tickB)
          if (msB > msA) {
            const orig = 1 / (speedRef.current || 1)  // 烤速域→原速域（房级 range 与倍速无关）
            const range = { a: Math.round(msA * orig), b: Math.round(msB * orig) }
            onRange?.(range)
            // demo 同款：选完指针跳到选区开头（黄色当前小节背景跟随）
            try { apiRef.current!.timePosition = Math.round(msA) } catch (e) { /* 预览失败无碍 */ }
            setScrubMs(Math.round(msA))
            console.log("[gp选段] beat级", range.a, "-", range.b, "ms(原速)")
          }
        })
        // 指针就绪（音源加载完才能跟走带）；位置事件秒变才更新（demo 同款节流），endTime 兜底总时长
        // 诊断日志（devtools 抓真相用，欢哥实测时看 console）
        real.error?.on?.((e: unknown) => console.error("[gp指针] alphaTab error:", e))
        real.soundFontLoaded?.on?.(() => { console.log("[gp指针] 音源加载完成"); setSfPct(-1) })
        real.soundFontLoad?.on?.((args: { loaded: number; total: number }) => { if (!cancelled && args.total > 0) setSfPct(Math.floor((args.loaded / args.total) * 100)) })
        real.soundFontLoadFailed?.on?.((e: unknown) => console.error("[gp指针] 音源加载失败:", e))
        real.playerReady?.on?.(() => { if (!cancelled) { console.log("[gp指针] 播放器就绪"); setPlayerReady(true) } })
        real.playerPositionChanged?.on?.((args: { currentTime: number; endTime: number }) => {
          if (cancelled) return
          setTotalMs((t) => (t > 0 ? t : args.endTime))
          const sec = Math.floor(args.currentTime / 1000)
          if (sec !== lastPosSecRef.current) { lastPosSecRef.current = sec; setPosMs(args.currentTime) }
        })
        bufRef.current = buf  // 换档重载用（原文，tempo 未烤）
        real.load(buf, () => { if (!cancelled) setLoading(false) }, (e: Error) => { if (!cancelled) { setErr("谱子解析失败：" + e.message); setLoading(false) } })
      } catch (e) {
        if (!cancelled) { setErr((e as Error)?.message || "渲染失败"); setLoading(false) }
      }
    })()
    return () => { cancelled = true; apiRef.current = null; realTracksRef.current = []; try { api?.destroy?.() } catch (e) { /* 卸载兜底 */ } }
  }, [url])

  // 跟走带（步骤③）：gp-state=唯一真相——播放=seek到 起点位置 再play；暂停=归零（服务器暂停即杀进程，重播位置由下次点播者定）
  // 倍速域（10-10 根治版）：本地已烤 tempo=烤速域，推进与墙钟1:1（不再×speed）；
  // 服务器 startMs 是原速域 → ÷spd 进烤速域；lag 是现实域直接减
  useEffect(() => {
    const api = apiRef.current
    if (!api || !playerReady) return
    try {
      if (gpState?.playing && gpState.startedAt) {
        const spd = gpState.speed ?? 1
        const base = (gpState.startMs ?? 0) / spd
        // 预备拍（⑥-1 修正版）：count-in 期间 player 不许起跑（旧版钳 target 但 player 自由跑，2s 对表
        // 才拽回=指针走4拍又弹回的观感）——指针死停在起点，定时到音乐进来的那一刻才 play
        const playLead = Date.now() - new Date(gpState.startedAt).getTime() - audioLagRef.current - (gpState.countInMs ?? 0)
        if (playLead < 0) {
          api.timePosition = base
          try { api.pause?.() } catch (e) { /* 静默 */ }
          console.log("[gp指针] count-in 中，", Math.round(-playLead), "ms 后起跑")
          const t = setTimeout(() => {
            const api2 = apiRef.current
            if (!api2) return
            try {
              api2.timePosition = Math.max(base, base + Date.now() - new Date(gpState.startedAt!).getTime() - audioLagRef.current - (gpState!.countInMs ?? 0))
              api2.play?.()
            } catch (e) { /* 静默 */ }
          }, -playLead)
          // cleanup 必挂：暂停/新 gp-state/卸载时 timer 必须死（否则暂停后到点强行 play）
          return () => clearTimeout(t)
        }
        const cap = gpState.endMs !== undefined ? gpState.endMs / spd : Infinity
        api.timePosition = Math.min(cap, Math.max(base, base + playLead))
        console.log("[gp指针] 跟走带 play @", api.timePosition, "speed=", spd, "countIn=", gpState.countInMs ?? 0)
        api.play?.()
      } else {
        // 断点续播（10-10 欢哥定稿）：暂停保留当前位置=下次播放起点（点播放即续播；点谱面其他处=改起点）；
        // 自然播完（已到尾部）则归零。不再回零。
        api.pause?.()
        const atPos = api.timePosition ?? 0
        // 自然播完归位（1012 range版）：有选区→回选区开头（demo 同款）；无选区→回全曲头
        const rangeHome = scoreRangeRef.current ? Math.round(scoreRangeRef.current.a * (speedRef.current || 1)) : 0
        const home = totalMs > 0 && atPos >= totalMs - 500 ? rangeHome : Math.max(0, Math.round(atPos))
        setScrubMs(home)
        try { if (totalMs > 0 && atPos >= totalMs - 500) api.timePosition = home } catch (e) { /* 静默 */ }
        setPosMs(0)
      }
    } catch (e) { console.error("[gp指针] 跟走带失败:", e) }
  }, [gpState?.playing, gpState?.startedAt, gpState?.startMs, playerReady])

  // 墙钟对表（每2s）：|本地位置-墙钟目标|>150ms 才 seek（seek 稀疏=平滑滚动交给 alphaTab 原生）
  useEffect(() => {
    if (!gpState?.playing || !gpState.startedAt || !playerReady) return
    const spd = gpState.speed ?? 1
    const base = (gpState.startMs ?? 0) / spd  // 原速域→烤速域
    const startedAtMs = new Date(gpState.startedAt).getTime()
    const countInMs = gpState.countInMs ?? 0
    const id = setInterval(() => {
      const api = apiRef.current
      if (!api) return
      // 倍速域（根治版）：本地烤速推进=墙钟1:1，target=base+墙钟elapsed-lag（无×speed）
      // 预备拍：countInMs 期间钳在 base；选段：上限钳 endMs（服务器掐尾重启间隙指针不越界）
      const cap = gpState.endMs !== undefined ? gpState.endMs / spd : Infinity
      const target = Math.min(cap, Math.max(base, base + Date.now() - startedAtMs - audioLagRef.current - countInMs))
      const diff = (api.timePosition ?? 0) - target
      console.log("[gp指针] 对表 tick 本地=", Math.round(api.timePosition ?? 0), "目标=", Math.round(target), "差=", Math.round(diff), "speed=", spd)
      if (Math.abs(diff) > 150) {
        console.log("[gp指针] 对表 seek 差=", Math.round(diff), "ms")
        try { api.timePosition = Math.max(0, target) } catch (e) { /* 忽略本轮 */ }
      }
    }, 2000)
    return () => clearInterval(id)
  }, [gpState?.playing, gpState?.startedAt, gpState?.startMs, playerReady])

  // 换档重烤（10-10 根治版）：暂停态换档（播放中UI已锁）→ tempo 重烤需要 player 重建 MIDI →
  // 重载原文（scoreLoaded 里按 speedRef 新值烤+积分）。位置域换算：同一谱面点 烤速ms_new = ms_old×old÷new
  // 现场记录（1011）：分轨选择一并存档，重载后恢复——刷新是必须的，状态丢失不是
  useEffect(() => {
    const spd = score.speed ?? 1
    const old = speedRef.current
    if (spd === old) return
    speedRef.current = spd
    if (!loadedRef.current) return  // 谱未加载：首载 scoreLoaded 直接按新档烤，无需动作
    const seek = Math.max(0, Math.round(scrubMsRef.current * old / spd))
    setScrubMs(seek)
    reloadSeekRef.current = seek
    const sel = renderedIdxRef.current
    reloadRenderSelRef.current = (sel.length > 0 && sel.length < realTracksRef.current.length) ? sel : "all"
    const api = apiRef.current
    if (api && bufRef.current) {
      try { api.load(bufRef.current, () => {}, () => {}) } catch (e) { console.error("[gp倍速] 换档重载失败:", e) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score.speed])

  // 自研节拍器调度（1011）：追拍式——每500ms把未来2s窗口内的拍点用 WebAudio 硬件时钟排掉；
  // 拍点出声墙钟 = startedAt + (拍点ms − base) + lag（与谱子音频到达耳朵同式）。
  // 重播/换起点必经暂停态（播放中锁UI）→ startedAt 变化即 effect 重跑从头重排，无回跳场景
  useEffect(() => {
    const m = metroRef.current
    const stop = () => {
      if (m.timer) { clearInterval(m.timer); m.timer = null }
      if (m.master) { try { m.master.gain.cancelScheduledValues(0); m.master.gain.value = 0 } catch (e) { /* 静默 */ } }
    }
    if (!metronome || !playing || !gpState?.startedAt || m.beats.length === 0) { stop(); return }
    // 懒建 AudioContext（节拍器按钮点击=用户手势，autoplay 策略放行）
    if (!m.ac || !m.master) {
      try {
        m.ac = new AudioContext()
        m.master = m.ac.createGain()
        m.master.gain.value = 1
        m.master.connect(m.ac.destination)
      } catch (e) { console.error("[节拍器] AudioContext 创建失败:", e); return }
    }
    if (m.ac.state === "suspended") { void m.ac.resume().catch(() => {}) }
    try { m.master.gain.value = 1 } catch (e) { /* 静默 */ }
    const startedAtWall = new Date(gpState.startedAt).getTime()
    const spd = gpState.speed ?? 1
    const base = (gpState.startMs ?? 0) / spd
    const countInMs = gpState.countInMs ?? 0  // 预备拍：内容拍点全部后移 countInMs（本地节拍器在 click 之后才进）
    const capMs = gpState.endMs !== undefined ? gpState.endMs / spd : Infinity  // 选段：上限外拍点不排
    const wallOf = (ms: number) => startedAtWall + countInMs + (ms - base) + audioLagRef.current
    m.nextIdx = 0
    const tickFn = () => {
      const ac = m.ac
      if (!ac || !m.master) return
      const now = Date.now()
      while (m.nextIdx < m.beats.length) {
        const b = m.beats[m.nextIdx]
        if (b.ms > capMs) break  // 选段终点外不再排
        const w = wallOf(b.ms)
        if (w > now + 2000) break
        if (w > now - 100) {  // 过期超100ms的拍跳过（重排时追齐）
          const t0 = ac.currentTime + Math.max(0.015, (w - now) / 1000)
          const osc = ac.createOscillator()
          const g = ac.createGain()
          osc.type = "sine"
          osc.frequency.value = b.accent ? 1318 : 880  // 重拍E6/弱拍A5
          g.gain.setValueAtTime(b.accent ? 0.5 : 0.28, t0)
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07)
          osc.connect(g)
          g.connect(m.master)
          osc.start(t0)
          osc.stop(t0 + 0.09)
        }
        m.nextIdx++
      }
    }
    tickFn()
    m.timer = setInterval(tickFn, 500)
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome, playing, gpState?.startedAt, gpState?.startMs, gpState?.speed])

  // 引擎卸载清理
  useEffect(() => () => {
    const m = metroRef.current
    if (m.timer) clearInterval(m.timer)
    try { void m.ac?.close() } catch (e) { /* 静默 */ }
  }, [])

  // 选区高亮回填（⑥-2b；1012 两修）：score.range（房级真相，广播/水合）→谱面 A-B 高亮；
  // 修一=B端留1tick边界余量（B=末音符结束点，恰等于下一音符起点——旧版 <= 把它圈进来=松手后自动多选一个音符）；
  // 修二=beat 取**当前渲染中轨**的表（旧版硬绑第0轨，独显其他轨时坐标不存在→alphaTab清空后重建抛异常=紫色消失）。
  // 抽成 ref 化的"重穿"函数：广播回填与每次重渲染（postRenderFinished 后，切轨/缩放重画）共用
  const applyRangeHighlightRef = useRef<() => void>(() => {})
  applyRangeHighlightRef.current = () => {
    const api = apiRef.current
    if (!api?.highlightPlaybackRange || !scoreRangeRef.current) return
    const spd = speedRef.current || 1
    const cache = api.tickCache
    if (!cache?.masterBars?.length) return
    const tA = msToTick(scoreRangeRef.current.a * spd), tB = msToTick(scoreRangeRef.current.b * spd)
    const byTrack = mbBeatsRef.current
    // 优先"用户框选时所在的轨"（全部渲染模式下预览圈在哪轨、回填就圈哪轨，不跳轨）；该轨未渲染退首个渲染轨
    const rendered = renderedIdxRef.current
    const idx = selTrackIdxRef.current != null && rendered.includes(selTrackIdxRef.current)
      ? selTrackIdxRef.current
      : (rendered.length > 0 ? rendered[0] : 0)
    const beatsMap = byTrack.get(idx) ?? (byTrack.size > 0 ? [...byTrack.values()][0] : undefined)
    if (!beatsMap) { console.warn("[gp选区回填] 无beat表（trackIndex=", idx, "）"); return }
    // 1012 终修（欢哥实测"前后各偶尔多圈一个音符且无规律"）：tick→ms→服务器→ms→tick 往返带 ±1~2 tick
    // 舍入漂移，旧"≤门槛"解析被漂移击穿边界=莫名扩选。改**就近吸附**：A端贴最近音符起点、B端贴最近
    // 音符结束点（alphaTab 官方全程抱 beat 对象无此问题；我们房级广播必须走 ms 往返，吸附容差=半个
    // 音符时值，漂移永远够不着）。B端语义=末音符结束（播放含末音符全程），与松手时 tickB 同构。
    type CandBeat = { absolutePlaybackStart?: number; playbackDuration?: number }
    const endOf = (b: CandBeat) => (b.absolutePlaybackStart ?? 0) + (typeof b.playbackDuration === "number" && b.playbackDuration > 0 ? b.playbackDuration : 240)
    const cand: CandBeat[] = []
    for (const x of cache.masterBars) {
      if (x.start <= tB) for (const b of (beatsMap.get(x.masterBar) ?? []) as CandBeat[]) {
        if (typeof b.absolutePlaybackStart === "number") cand.push(b)
      }
    }
    if (cand.length === 0) { console.warn("[gp选区回填] 无候选beat tA/tB=", tA, tB); return }
    let beatA = cand.reduce((p, c) => Math.abs((c.absolutePlaybackStart ?? 0) - tA) < Math.abs((p.absolutePlaybackStart ?? 0) - tA) ? c : p)
    let beatB = cand.reduce((p, c) => Math.abs(endOf(c) - tB) < Math.abs(endOf(p) - tB) ? c : p)
    if ((beatA.absolutePlaybackStart ?? 0) > (beatB.absolutePlaybackStart ?? 0)) { const t = beatA; beatA = beatB; beatB = t }  // 反向选归位
    console.log("[gp选区回填] tA/tB=", Math.round(tA), Math.round(tB), "→ A起=", beatA.absolutePlaybackStart, "B末=", endOf(beatB), "轨=", idx)
    try { api.highlightPlaybackRange(beatA, beatB) } catch (e) { console.warn("[gp选区回填] highlight异常:", e) }
  }
  useEffect(() => {
    const api = apiRef.current
    if (!api?.highlightPlaybackRange) return
    if (!score.range) { try { api.clearPlaybackRangeHighlight?.() } catch (e) { /* 静默 */ } return }
    applyRangeHighlightRef.current()
  }, [score.range, renderedIdx])  // renderedIdx 入依赖：切轨后用新渲染轨的beat重穿

  const allOn = tracks.length > 0 && renderedIdx.length === tracks.length
  const currentTrackName = allOn ? "全部" : (tracks.find((t) => renderedIdx.includes(t.index))?.name ?? "全部")

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPanelOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panelOpen])

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#0A0A0A" }}>
      {/* 头部：谱名 + 轨数 + 收回（走带已下移底部工具栏）；谱内title/artist优先（审计#9），无则退上传文件名 */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <span className="truncate text-xs font-semibold text-white">📄 {fileMeta.title || score.name}{fileMeta.artist ? ` · ${fileMeta.artist}` : ""}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          {!!score.tracks?.length && <span className="text-[11px] text-white/50">{score.tracks.length} 轨</span>}
          {canClear && onClear && (
            <button onClick={onClear} className="rounded-[6px] px-2 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/10 hover:text-white">收回</button>
          )}
        </div>
      </div>
      {/* 谱面：白底滚动区，全宽渲染（10-09 欢哥实测：侧栏挤压谱面每行小节数，分轨下移底部工具栏） */}
      <div className="relative min-h-0 flex-1">
        {loading && !err && <p className="absolute inset-x-0 top-2 z-10 text-center text-[11px]" style={{ color: "#8A8A8A" }}>谱面渲染中…</p>}
        {err && <p className="absolute inset-0 z-10 grid place-items-center bg-[#0A0A0A] px-6 text-center text-xs" style={{ color: "#FF5C5C" }}>{err}</p>}
        {/* select-none：拖选谱面时禁浏览器"复制式"文本选中（1012 欢哥实测干扰视觉）——选区视觉只归 .at-selection */}
        <div ref={viewportRef} className="h-full select-none overflow-auto scrollbar-thin" style={{ background: "#fff" }}>
          <div ref={containerRef} />
        </div>
      </div>
      {/* 底部工具栏（10-09 欢哥定稿布局）：走带+分轨+工作站功能全收这里，不占谱面水平空间。
          1014 欢哥定稿：gap-0.5 收紧间距（内容刚性放不下时收紧而非截断）；justify-center 整体居中左右对称 */}
      <div className="relative flex h-9 shrink-0 items-center justify-center gap-0.5 border-t border-white/10 px-2.5">
        {/* 走带进度线：播放中=真实位置（秒步进+1s线性过渡抹平）；未播放=可点设起始位置（本地指针预览，谁点播放用谁的位置） */}
        {totalMs > 0 && (
          <div
            className={`absolute inset-x-0 top-0 z-10 h-1.5 ${playing ? "" : "cursor-pointer"}`}
            title={playing ? undefined : "点击设定起始位置（播放从这里开始）"}
            onPointerDown={(e) => {
              if (playing) return
              const rect = e.currentTarget.getBoundingClientRect()
              const ms = Math.max(0, Math.min(totalMs, ((e.clientX - rect.left) / rect.width) * totalMs))
              setScrubMs(ms)
              const api = apiRef.current
              if (api) { try { api.timePosition = ms } catch (err) { /* 预览失败无碍 */ } }
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10">
              <div className="h-full transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, ((playing && posMs > 0 ? posMs : scrubMs) / totalMs) * 100)}%`, background: "#BBEE00" }} />
            </div>
          </div>
        )}
        {/* 回到开头（1013 欢哥定稿，alphaTab 同款、播放键左边）：暂停=指针/起始位归零；播放=从头重播（走带后动作胜出）。
            alphaTab 原始逻辑（欢哥 1013 补充）：有选区时回**选区起点A**（range.a 原速域）而非曲头 */}
        {(onPlay || onPause) && (() => {
          const rewMs = score.range && Number.isFinite(score.range.a) && score.range.a > 0 ? score.range.a : 0
          return (
          <button
            onClick={() => {
              if (pending) return
              if (playing) { setPending(true); onPlay?.(Math.round(rewMs)) }  // 播放中=房级走带重开（range 时服务器本就从A起播）
              else {
                const baked = rewMs * speedRef.current  // 原速域→本地烤速域（指针/起始位同域）
                setScrubMs(baked)
                try { if (apiRef.current) apiRef.current.timePosition = Math.round(baked) } catch (e) { /* 预览失败无碍 */ }
              }
            }}
            disabled={pending}
            title={(playing ? "回到开头重播" : "回到开头") + (rewMs > 0 ? "（选区起点）" : "")}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SkipBack className="size-3.5" fill="currentColor" />
          </button>
          )
        })()}
        {(onPlay || onPause) && (
          <button
            onClick={() => {
              if (pending) return
              setPending(true)
              // 倍速边界换算：scrubMs 是本地烤速域 → ×spd 转原速域发服务器（服务器裁剪按原速 tempo 积分）
              playing ? onPause?.() : onPlay?.(Math.round(scrubMs * speedRef.current))
            }}
            disabled={pending}
            title={playing ? "暂停" : "播放"}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <span className="text-[10px]">…</span> : playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
          </button>
        )}
        {/* 走带时间（常驻，alphaTab 控制栏样式）：走过时间 / 谱面总时长；播放时点亮，停止归零 */}
        {(() => {
          // 真实播放位置优先（步骤③指针事件，烤速域）；事件未到时退墙钟估算（烤速域=墙钟1:1）；未播放=起始位置预览
          const elapsed = playing && gpState?.startedAt
            ? Math.max(0, Math.floor((posMs > 0 ? posMs : now - new Date(gpState.startedAt).getTime()) / 1000))
            : Math.floor(scrubMs / 1000)
          // 时间区改回刚性（1014 欢哥反馈："…"截断不可接受）——间距收紧后放得下，truncate 仅留作极限兜底
          return (
            <span className="flex shrink-0 items-center gap-1 font-mono text-[11px]">
              {/* 绿点常驻占位（1014）：条件渲染会让整条工具栏在播放瞬间右移~10px、打印按钮被顶出——invisible 保位置零跳动 */}
              <span className={`size-1.5 shrink-0 rounded-full ${playing ? "animate-rec-pulse" : "invisible"}`} style={playing ? { background: "#BBEE00" } : undefined} />
              <span className="truncate" style={playing ? { color: "#BBEE00" } : { color: "rgba(255,255,255,0.6)" }}>
                {fmt(elapsed)}{totalMs > 0 ? ` / ${fmt(Math.floor(totalMs / 1000))}` : ""}{sfPct >= 0 ? ` · 音源 ${sfPct}%` : ""}
              </span>
            </span>
          )
        })()}
        {/* 倍速（步骤⑤·房级）：与混音同语义——后动作胜出、播放瞬间定版（服务器 tempo ×speed 重生成 live MIDI）；
            本地 playbackSpeed 即时设 → 指针/滚动/节拍器同船变速；播放中锁（音频既成流不可变） */}
        <ToolbarMenu
          title={!canMix ? "由合奏者控制" : speedLocked ? "播放中不能调速，请先暂停（倍速于播放时生效）" : "倍速（房级，全员同步）"}
          value={String(speed)}
          options={[
            { v: "0.25", t: "0.25x" }, { v: "0.5", t: "0.5x" }, { v: "0.75", t: "0.75x" },
            { v: "0.9", t: "0.9x" }, { v: "1", t: "1x" }, { v: "1.1", t: "1.1x" },
            { v: "1.25", t: "1.25x" }, { v: "1.5", t: "1.50x" }, { v: "2", t: "2x" },
          ]}
          onPick={(v) => { if (!speedLocked && canMix) onSpeed?.(Number(v)) }}
          disabled={!canMix || speedLocked}
        />
        {/* 分轨入口（10-09 欢哥定稿：吉他社样式）——工具栏只放一个按钮，点开向上弹列表；
            常驻（含单轨谱，点开就一条轨——避免用户猜"按钮没了是bug还是谱子问题"）；谱面始终全宽 */}
        {tracks.length >= 1 && (
          <div className="relative flex shrink-0">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              title={`分轨（当前：${currentTrackName}）`}
              className={`flex h-6 w-7 items-center justify-center rounded-[6px] transition-colors ${panelOpen ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >
              <SlidersHorizontal className="size-3.5" />
            </button>
            {panelOpen && (
              <>
                <div className="fixed inset-0 z-[1050]" onClick={() => setPanelOpen(false)} />
                <div className="absolute bottom-full left-0 z-[1100] mb-1.5 max-h-[50vh] w-64 overflow-y-auto rounded-lg border border-white/10 bg-[#141414] p-1 shadow-2xl scrollbar-thin">
                  <button
                    onClick={() => showTracks("all")}
                    className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11px] transition-colors ${allOn ? "bg-white/12 font-semibold text-white" : "text-white/60 hover:bg-white/8 hover:text-white/85"}`}
                  >
                    全部轨
                  </button>
                  {tracks.map((t, i) => (
                    <div
                      key={t.index}
                      onClick={() => showTracks(i)}
                      title={t.name}
                      className={`cursor-pointer rounded-[6px] px-2 py-1.5 transition-colors ${!allOn && renderedIdx.includes(t.index) ? "bg-white/12" : "hover:bg-white/8"}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-4 shrink-0 text-right font-mono text-[10px] opacity-50">{i + 1}</span>
                        <span className={`min-w-0 flex-1 truncate text-[11px] ${!allOn && renderedIdx.includes(t.index) ? "font-semibold text-white" : "text-white/55"}`}>{t.name}</span>
                        {/* S/M=房级混音（点行=本地切谱，控件须拦冒泡） */}
                        <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSolo(t.index) }}
                            title={!canMix ? "由合奏者控制" : mixLocked ? "播放中不能调整，请先暂停（混音于播放时生效）" : "独奏（房级，全员同步）"}
                            className={`grid h-4 w-[18px] place-items-center rounded text-[9px] font-bold transition-colors ${!canMix || mixLocked ? "cursor-not-allowed opacity-40" : ""} ${mix.solos?.includes(t.index) ? "text-black" : "bg-white/10 text-white/45 hover:text-white/85"}`}
                            style={mix.solos?.includes(t.index) ? { background: "#BBEE00" } : undefined}
                          >S</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleMute(t.index) }}
                            title={!canMix ? "由合奏者控制" : mixLocked ? "播放中不能调整，请先暂停（混音于播放时生效）" : "静音（房级，全员同步）"}
                            className={`grid h-4 w-[18px] place-items-center rounded text-[9px] font-bold transition-colors ${!canMix || mixLocked ? "cursor-not-allowed opacity-40" : ""} ${mix.mutes?.includes(t.index) ? "text-black" : "bg-white/10 text-white/45 hover:text-white/85"}`}
                            style={mix.mutes?.includes(t.index) ? { background: "#FF5C5C" } : undefined}
                          >M</button>
                        </span>
                      </div>
                      {/* 单轨音量（房级）：本地即时+尾随120ms上报；听众只读；播放中锁定（pointer-events 断交互，title 放外层才能悬停显示） */}
                      <div
                        className={`mt-1 flex items-center gap-1.5 pl-6 ${!canMix || mixLocked ? "cursor-not-allowed" : ""}`}
                        onClick={(e) => e.stopPropagation()}
                        title={!canMix ? "由合奏者控制" : mixLocked ? "播放中不能调整，请先暂停（混音于播放时生效）" : undefined}
                      >
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={mix.vols?.[String(t.index)] ?? 100}
                          onChange={(e) => setVol(t.index, Number(e.target.value))}
                          className={`min-w-0 flex-1 accent-[#BBEE00] ${!canMix || mixLocked ? "pointer-events-none opacity-40" : "cursor-pointer"}`}
                        />
                        <span className="w-7 shrink-0 text-right font-mono text-[9px] text-white/40">{mix.vols?.[String(t.index)] ?? 100}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* 右侧功能区（步骤④）：视图三件套下拉+打印——1013 欢哥新座次并入一条流（左起：回到开头/播放/绿点+时间/倍速/分轨/预备拍/节拍器/循环/缩放/五线六线/排版/打印） */}
          {/* 预备拍（1011 ⑥-1·房级）：服务器烤 N 拍 click 进流（N=第一拍号分子），全员一起听哒哒哒→音乐进；
              播放瞬间定版（三门规矩同款锁）；demo 位次=右区第一位（沙漏 icon 照搬） */}
          <button
            onClick={() => { if (!speedLocked && canMix) onCountin?.(!countin) }}
            title={!canMix ? "由合奏者控制" : speedLocked ? "播放中不能切换，请先暂停（预备拍于播放时生效）" : countin ? "预备拍开着 · 播放前数一小节再进" : "预备拍（播放前数一小节再进，全员同步）"}
            className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${!canMix || speedLocked ? "cursor-not-allowed opacity-40" : ""} ${countin ? "bg-white/12 text-[#BBEE00]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
          >
            <Hourglass className="size-3.5" />
          </button>
          {/* 节拍器（1011自研版）：本地各自开关不进房混——WebAudio 硬时钟直调，与谱子音频同式对齐 */}
          <button
            onClick={() => setMetronome((v) => !v)}
            title={metronome ? "节拍器开着（本地）· 点击关闭" : "节拍器（本地各自开关，不影响他人）"}
            className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${metronome ? "bg-white/12 text-[#BBEE00]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
          >
            <MetronomeIcon className="size-3.5" />
          </button>
          {/* 循环（1011 ⑥-2a·全曲版·房级）：播完自动回曲目头重播（倍速/预备拍/混音全继承——状态烤在MIDI里）；
              ⚠️播放中不锁（第N遍中途关=本遍播完即止）——与M/S/倍速/countin"烤进流"不同类 */}
          <button
            onClick={() => { if (canMix) onLoop?.(!loop) }}
            title={!canMix ? "由合奏者控制" : loop ? "循环开着 · 播完自动从头再来，点击关闭" : "循环播放（播完自动从头再来）"}
            className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${!canMix ? "cursor-not-allowed opacity-40" : loop ? "bg-white/12 text-[#BBEE00]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
          >
            <Repeat className="size-3.5" />
          </button>
          <ToolbarMenu
            title="缩放"
            icon={<Search className="mr-0.5 size-3 opacity-60" />}
            value={String(zoomPct)}
            options={[25, 50, 75, 90, 100, 110, 125, 150, 200].map((n) => ({ v: String(n), t: `${n}%` }))}
            onPick={(v) => applyView({ zoom: Number(v) })}
          />
          <ToolbarMenu
            title="五线谱 / 六线谱"
            value={staveKey}
            options={[
              { v: "ScoreTab", t: "五线+六线" },
              { v: "Score", t: "五线谱" },
              { v: "Tab", t: "六线谱" },
            ]}
            onPick={(v) => applyView({ stave: v })}
          />
          <ToolbarMenu
            title="谱面排版"
            value={layoutKey}
            options={[
              { v: "page", t: "竖排" },
              { v: "hbar", t: "横排·连续" },
              { v: "hscreen", t: "横排·翻页" },
            ]}
            onPick={(v) => applyView({ layout: v })}
          />
          <button
            onClick={() => { try { apiRef.current?.print?.() } catch (e) { /* 打印窗口被拦等 */ } }}
            title="打印谱面（本地打印机）"
            className="flex h-6 w-7 shrink-0 items-center justify-center rounded-[6px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Printer className="size-3.5" />
          </button>

      </div>
    </div>
  )
}
