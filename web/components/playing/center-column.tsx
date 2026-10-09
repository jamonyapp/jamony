"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Circle, Square, ChevronDown, ChevronLeft, ChevronRight, Disc3, Headphones, ArrowRight, Download, Ban, Check, X, ChevronUp, SlidersHorizontal, Play, Pause } from "lucide-react"
import { instrumentEmoji, type RecordingSession, type Track, type RoomScore, type GpMix } from "@/lib/jam-data"
import { MixerFullscreen } from "@/components/mixer/mixer-fullscreen"
import { MixerMini } from "@/components/mixer/mixer-mini"
import { useMixerEngine } from "@/hooks/useMixerEngine"
import { TRACK_COLORS, type MixerTrack } from "@/components/mixer/types"
import PublishWorkModal from "@/components/publishing/publish-work-modal"

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
  options: { label: string; value: boolean; className?: string }[]
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
          disabled
            ? "cursor-not-allowed bg-accent/50 text-muted-foreground/40"
            : isDecided
              ? (activeOption?.className || "bg-accent text-foreground")
              : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground"
        }`}
      >
        <span>{displayText}</span>
        {!disabled && (open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-[8px] border border-border bg-popover py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`whitespace-nowrap px-3 py-1 text-left text-[11px] font-bold transition-colors hover:bg-accent ${
                value === opt.value ? (opt.className || "text-foreground") : "text-muted-foreground"
              } ${value === opt.value ? "bg-accent" : ""}`}
            >
              {opt.label}
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
  score,
  onClearScore,
  gpState,
  onGpPlay,
  onGpPause,
  onGpMix,
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
  score?: RoomScore | null
  onClearScore?: () => void
  gpState?: { playing: boolean; startedAt?: string } | null
  onGpPlay?: (startMs?: number) => void
  onGpPause?: () => void
  onGpMix?: (mix: GpMix) => void
}) {
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
          <ScoreViewer score={score} canClear={myRole !== "listener"} onClear={onClearScore} gpState={gpState} onGpPlay={onGpPlay} onGpPause={onGpPause} onGpMix={onGpMix} />
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
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((o) => !o)}
        />
      )}
    </main>
  )
}

// 谱面查看器：图片=各自本地翻页+缩放+拖拽（零同步，欢哥 10-07 定稿），PDF=Chromium 原生查看器自带全套
function ScoreViewer({ score, canClear, onClear, gpState, onGpPlay, onGpPause, onGpMix }: { score: RoomScore; canClear?: boolean; onClear?: () => void; gpState?: { playing: boolean; startedAt?: string; startMs?: number } | null; onGpPlay?: (startMs?: number) => void; onGpPause?: () => void; onGpMix?: (mix: GpMix) => void }) {
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

  // GP 谱走工作站（alphaTab 渲染，自有滚动；不走图片缩放/翻页那套舞台）——须在全部 hooks 之后
  if (score.type === "gp") return <GpWorkstation score={score} canClear={canClear} onClear={onClear} gpState={gpState} onPlay={onGpPlay} onPause={onGpPause} onMix={onGpMix} canMix={canClear} />

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
  drawerOpen?: boolean
  onToggleDrawer?: () => void
}) {
  const [sessions, setSessions] = useState<RecordingSession[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [mixerSessionId, setMixerSessionId] = useState<number | null>(null)
  const [mixerMinimized, setMixerMinimized] = useState(false)
  const mixerEngine = useMixerEngine()
  const mixerTracksLoadedRef = useRef(false)
  const [recording, setRecording] = useState(false)
  const [recordingMine, setRecordingMine] = useState(false)
  const [stopping, setStopping] = useState(false) // 停止中过渡态（0923：服务器快停响应回来前按钮显示"停止中…"并禁用，防连点误开新段）
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

  // 混音器：标准化完成后自动加载音轨
  useEffect(() => {
    if (mixerSessionId === null) {
      mixerTracksLoadedRef.current = false
      return
    }
    const mixerSession = sessions.find(s => s.id === mixerSessionId)
    if (!mixerSession) return
    const allTracks = mixerSession.tracks
    const allNormalized = allTracks.every(t => t.normalized)
    if (allNormalized && allTracks.length > 0 && !mixerTracksLoadedRef.current && roomId && currentUserId) {
      mixerTracksLoadedRef.current = true
      const tracks: MixerTrack[] = allTracks.map((t, i) => ({
        id: String(t.id),
        name: t.nickname,
        instrument: t.is_system ? "🥁" : instrumentEmoji(t.instrument_category),
        wavUrl: `/api/rooms/${roomId}/sessions/${mixerSessionId}/tracks/${t.id}/download?userId=${currentUserId}`,
        duration: 0,
        color: TRACK_COLORS[i % TRACK_COLORS.length],
      }))
      mixerEngine.loadTracks(tracks)
    }
  }, [mixerSessionId, sessions, roomId, currentUserId, mixerEngine])

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
    }
  }, [realtimeRecordingActive, realtimeRecordingBy, realtimeRecordingStartedAt, currentUserId])

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
      alert(data.msg || "无法开始录音")
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
    }
  }

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
            onClick={() => (recordingMine ? stopRecording() : !recording && !stopping && startRecording())}
            disabled={(recording && !recordingMine) || stopping}
            aria-label={recording ? "停止录音" : "开始录音"}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
              recording ? "bg-destructive" : "bg-brand-pink"
            }`}
          >
            {recording ? <Square className="size-3 fill-current" /> : <Circle className="size-3 fill-current" />}
            {stopping ? "停止中…" : recording ? (recordingMine ? "停止" : "录音中") : "录音"}
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
        <div className="min-h-0 overflow-hidden">
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
                    roomName={roomName}
                    roomStyle={roomStyle}
                    currentUserId={currentUserId}
                    onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
                    onPatch={patchTrack}
                    onPreview={() => { setMixerSessionId(s.id); setMixerMinimized(false) }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>

    {/* 试听混音器 */}
    {mixerSessionId !== null && (() => {
      const mixerSession = sessions.find(s => s.id === mixerSessionId)
      const allTracks = mixerSession?.tracks || []
      const normalizedCount = allTracks.filter(t => t.normalized).length
      const totalCount = allTracks.length
      const loadingProgress = totalCount > 0 ? (normalizedCount / totalCount) * 100 : 100
      const mixerTracks: MixerTrack[] = allTracks.map((t, i) => ({
        id: String(t.id),
        name: t.nickname,
        instrument: t.is_system ? "🥁" : instrumentEmoji(t.instrument_category),
        wavUrl: `/api/rooms/${roomId}/sessions/${mixerSessionId}/tracks/${t.id}/download?userId=${currentUserId}`,
        duration: 0,
        color: TRACK_COLORS[i % TRACK_COLORS.length],
      }))

      return (<>
        {!mixerMinimized && (
          <MixerFullscreen
            sessionLabel={`段落 ${mixerSession?.index}`}
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
            onClose={() => { setMixerSessionId(null); setMixerMinimized(false) }}
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
            onClose={() => setMixerSessionId(null)}
            onFullscreen={() => setMixerMinimized(false)}
          />
        )}
      </>)
    })()}
  </>
  )
}

function SessionCard({
  session,
  open,
  now,
  roomId,
  roomName,
  roomStyle,
  currentUserId,
  onToggle,
  onPatch,
  onPreview,
}: {
  session: RecordingSession
  open: boolean
  now: number
  roomId?: string
  roomName?: string
  roomStyle?: string
  currentUserId?: number
  onToggle: () => void
  onPatch: (sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) => void
  onPreview?: () => void
}) {
  const remaining = session.expires_at ? Math.max(0, Math.ceil((new Date(session.expires_at).getTime() - now) / 1000)) : 0
  const showCountdown = !session.all_locked && remaining > 0
  const canPublish = session.all_locked && session.agreed_count > 0
  const [publishOpen, setPublishOpen] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimTaken, setClaimTaken] = useState<{ userId: number; nickname: string } | null>(null)
  const [showClaimConfirm, setShowClaimConfirm] = useState(false) // 抢锁成功后确认弹窗
  const publishClaimedRef = useRef(false) // 跟踪当前用户是否抢到锁
  const refusedCount = session.tracks.filter(t => !t.is_system && t.allow_use === false).length

  /* PublishWorkModal 数据映射 — useMemo 防止引用变化导致混音无限循环 */
  const authorizedTracks = useMemo(
    () => session.tracks.filter(t => t.allow_use === true),
    [session.tracks]
  )
  const publishAuthors = useMemo(
    () => authorizedTracks
      .filter(t => !t.is_system && t.allow_attribution !== false)
      .map(t => ({
        id: String(t.id),
        name: t.nickname,
        anonymous: false,
        instrument: instrumentEmoji(t.instrument_category),
      })),
    [authorizedTracks]
  )
  const publishAnonymousCount = authorizedTracks.filter(t => !t.is_system && t.allow_attribution === false).length
  const publishHasDrumTrack = authorizedTracks.some(t => t.is_system === true)
  const authorizedTrackIds = useMemo(() => authorizedTracks.map(t => t.id), [authorizedTracks])
  const authorizedTrackIsDrums = useMemo(() => authorizedTracks.map(t => t.is_system), [authorizedTracks])
  /** 全量作者数据（含匿名参与者 + jamony-looper 系统鼓轨），用于发表时存档 */
  const allTrackAuthors = useMemo(
    () => authorizedTracks
      .map(t => ({
        userId: t.user_id ?? 0,
        nickname: t.nickname,
        instrumentCategory: t.instrument_category,
        isAnonymous: t.allow_attribution === false,
      })),
    [authorizedTracks]
  )

  return (
    <div className="rounded-[10px] border border-border bg-secondary">
      {/* 头部：段落信息 + 倒计时 + 发表按钮 + 展开（纤细版，欢哥 0923 瘦身） */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {onPreview && (
            <button type="button" onClick={onPreview}
              className="flex size-5 items-center justify-center rounded-full transition-all hover:scale-105"
              style={{color:"#FFFFFF",background:"rgba(255,255,255,0.1)",boxShadow:"0 0 0 1px rgba(255,255,255,0.2)"}}
              aria-label="试听混音">
              <Headphones size={12} />
            </button>
          )}
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
          {/* 发表状态卡片 —— 全员 ①② 锁定后出现 */}
          {session.all_locked && (
            <>
              {session.status === "published" ? (
                <span className="rounded-full bg-brand-green/20 px-3 py-1 text-[11px] font-bold text-brand-green">
                  ✓ 已发表
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-brand-green">{session.agreed_count}人已授权</span> · {refusedCount}人拒绝
                  </span>
                  {canPublish && handlePublishButton()}
                </>
              )}
            </>
          )}
          <button onClick={onToggle} className="text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
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

      {publishOpen && (
        <PublishWorkModal
          open={publishOpen}
          onClose={() => {
            setPublishOpen(false)
            // 关闭发表卡片但未发表 → 释放锁
            if (currentUserId && publishClaimedRef.current && session.status !== "published") {
              publishClaimedRef.current = false
              fetch(`/api/rooms/${roomId}/sessions/${session.id}/release-claim`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId }),
              }).catch(() => {})
            }
          }}
          session={{ index: session.index, duration: session.duration }}
          roomName={roomName || ""}
          roomStyle={roomStyle || ""}
          authors={publishAuthors}
          anonymousCount={publishAnonymousCount}
          hasDrumTrack={publishHasDrumTrack}
          roomId={roomId}
          sessionId={session.id}
          currentUserId={currentUserId}
          authorizedTrackIds={authorizedTrackIds}
          authorizedTrackIsDrums={authorizedTrackIsDrums}
          allTrackAuthors={allTrackAuthors}
          livePublisherUserId={session.publisher_user_id}
          onPublished={() => {
            // 发表成功后，socket 会推 sessions-update，自动刷新
            console.log(`session ${session.id} published`)
          }}
        />
      )}

      {/* 手慢一步弹窗 */}
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

      {/* 抢锁成功确认弹窗 */}
      {showClaimConfirm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => {
            setShowClaimConfirm(false)
            // 用户点背板关闭 → 释放锁
            if (currentUserId && roomId) {
              publishClaimedRef.current = false
              fetch(`/api/rooms/${roomId}/sessions/${session.id}/release-claim`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId }),
              }).catch(() => {})
            }
          }}
        >
          <div
            className="jamony-modal-enter relative w-full max-w-xs rounded-2xl border px-5 py-5 text-center"
            style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs leading-relaxed text-white" style={{ lineHeight: 1.7 }}>
              兵贵神速！感谢你为大家发表作品，请在5分钟内完成发表。超时将自动释放权限。
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              <button
                onClick={() => {
                  setShowClaimConfirm(false)
                  // 放弃发表 → 释放锁
                  if (currentUserId && roomId) {
                    publishClaimedRef.current = false
                    fetch(`/api/rooms/${roomId}/sessions/${session.id}/release-claim`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userId: currentUserId }),
                    }).catch(() => {})
                  }
                }}
                className="rounded-lg border px-4 py-1.5 text-xs transition-all duration-200 hover:text-white active:scale-[0.97]"
                style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
              >
                暂不发表
              </button>
              <button
                onClick={() => {
                  setShowClaimConfirm(false)
                  setPublishOpen(true)
                }}
                className="rounded-[8px] px-5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
              >
                开始发表
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /** 发表按钮：先到先得抢锁逻辑 */
  function handlePublishButton() {
    const isClaimed = session.publisher_user_id !== null && session.publisher_user_id !== undefined
    const isMine = isClaimed && session.publisher_user_id === currentUserId
    const isOthers = isClaimed && !isMine

    return (
      <button
        onClick={async () => {
          if (!currentUserId || !roomId) return

          // 已被别人占着 → 弹手慢一步
          if (isOthers) {
            setClaimTaken({
              userId: session.publisher_user_id!,
              nickname: session.publisher_nickname || "未知用户",
            })
            return
          }

          // 原本就是我抢到的 → 标记一下确保 release-claim 能走
          if (isMine) {
            publishClaimedRef.current = true
            setPublishOpen(true)
            return
          }

          // 第一次点击 → 先抢锁
          if (!isClaimed) {
            setClaiming(true)
            try {
              const res = await fetch(`/api/rooms/${roomId}/sessions/${session.id}/claim-publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId }),
              })
              const data = await res.json()
              if (!data.claimed) {
                // 被别人抢了
                setClaimTaken({
                  userId: data.publisher_user_id,
                  nickname: data.publisher_nickname || "未知用户",
                })
                return
              }
              publishClaimedRef.current = true
              // 抢锁成功，先弹确认框再打开发表卡片
              setShowClaimConfirm(true)
              return
            } catch (e) {
              console.error("抢锁失败:", e)
              return
            } finally {
              setClaiming(false)
            }
          }

          // 已抢到或原本就是我 → 打开发表卡片
          setPublishOpen(true)
        }}
        disabled={claiming || isOthers}
        className={`rounded-full px-3 py-1 text-xs font-bold text-white transition-all duration-200
          ${claiming ? "animate-pulse opacity-50" : ""}
          ${isOthers ? "cursor-not-allowed opacity-40" : "hover:scale-[1.03]"}
          ${isMine ? "bg-brand-green" : ""}
          ${!isClaimed ? "bg-brand-blue" : ""}`}
      >
        {claiming ? "抢占中…" : isMine ? "继续发表" : "去发表"}
      </button>
    )
  }

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
              nullLabel="选择授权"
              disabled={track.use_locked}
              options={[
                { label: "可使用", value: true, className: "text-brand-green" },
                { label: "禁用", value: false, className: "text-destructive" },
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
                { label: "可署名", value: true, className: "text-brand-green" },
                { label: "匿名", value: false, className: "text-muted-foreground" },
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
                { label: "可下载", value: true, className: "text-brand-green" },
                { label: "禁下载", value: false, className: "text-destructive" },
              ]}
              onChange={(v) => handleSelect("allow_download", v)}
            />
            <HelpTip text="同意则他人可下载你的分轨，禁用则仅你自己可下载" />
          </div>
        </div>
      )}

      {/* 非自己（含 jamony-looper 系统轨）：只显示状态文本 */}
      {!isSelf && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {track.allow_use === true && <span className="text-brand-green"><Check className="inline size-3" /> 可使用</span>}
            {track.allow_use === false && <span className="text-destructive"><X className="inline size-3" /> 禁用</span>}
            {track.allow_use === null && <span>⏳ 选择中</span>}
          </span>
          {track.allow_use === true && track.allow_attribution !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">{track.allow_attribution === true ? "可署名" : "匿名"}</span>
            </>
          )}
          {track.allow_download !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">
                {track.allow_download === true ? <span className="text-brand-green">可下载</span> : <span className="text-destructive">禁下载</span>}
              </span>
            </>
          )}
        </div>
      )}

      {/* 下载按钮：自己始终可见；他人 ③=可下载见下载 icon，否则见禁下载 icon（纤细版 20px） */}
      <div className="ml-auto">
        {isSelf ? (
          track.normalized ? (
            <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download?userId=${currentUserId}`} className="grid size-5 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="下载我的分轨" download>
              <Download className="size-3" />
            </a>
          ) : (
            <span className="grid size-5 place-items-center cursor-not-allowed text-muted-foreground/40" title="音轨准备中">
              <span className="size-3 text-[8px] font-bold text-muted-foreground/30">⏳</span>
            </span>
          )
        ) : track.allow_download === true ? (
          track.normalized ? (
            <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download?userId=${currentUserId}`} className="grid size-5 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={`下载 ${track.nickname} 的分轨`} download>
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
type GpTrackInfo = { index: number; name: string }
type GpApi = {
  destroy?: () => void
  load: (d: unknown, s?: () => void, e?: (x: Error) => void) => boolean
  renderTracks: (tracks: GpTrackInfo[]) => void
  changeTrackVolume?: (tracks: GpTrackInfo[], ratio: number) => void
  tracks?: GpTrackInfo[]
  play?: () => void
  pause?: () => void
  timePosition?: number
  metronomeVolume?: number
  scoreLoaded?: { on: (cb: (s: { tracks?: GpTrackInfo[] }) => void) => void }
  renderFinished?: { on: (cb: () => void) => void }
  renderStarted?: { on: (cb: (isResize: boolean) => void) => void }
  playerReady?: { on: (cb: () => void) => void }
  playerPositionChanged?: { on: (cb: (args: { currentTime: number; endTime: number }) => void) => void }
  soundFontLoaded?: { on: (cb: () => void) => void }
  soundFontLoad?: { on: (cb: (args: { loaded: number; total: number }) => void) => void }
  soundFontLoadFailed?: { on: (cb: (e: unknown) => void) => void }
  error?: { on: (cb: (e: unknown) => void) => void }
  beatMouseUp?: { on: (cb: (beat: { playbackStart?: number; voice?: { bar?: { masterBar?: unknown } } } | null) => void) => void }
  tickCache?: { masterBars?: { start: number; masterBar?: unknown }[] } | null
}

function GpWorkstation({ score, canClear, onClear, gpState, onPlay, onPause, onMix, canMix }: {
  score: RoomScore; canClear?: boolean; onClear?: () => void
  gpState?: { playing: boolean; startedAt?: string; startMs?: number } | null
  onPlay?: (startMs?: number) => void; onPause?: () => void
  onMix?: (mix: GpMix) => void; canMix?: boolean
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
  const [renderedIdx, setRenderedIdx] = useState<number[]>([])
  const [panelOpen, setPanelOpen] = useState(false)  // 分轨弹层（10-09 欢哥定稿：工具栏只放入口，点开向上弹列表——吉他社样式）
  const [totalMs, setTotalMs] = useState(0)  // 谱面总时长（alphaTab 式 00:00/04:46 的分母；0=未知不显示）
  // 指针（步骤③）：本地静音 player 跟服务器走带；playerReady=音源就绪（就绪前不跟）；posMs=真实位置（秒变才setState防刷屏）
  const [playerReady, setPlayerReady] = useState(false)
  const [posMs, setPosMs] = useState(0)
  const lastPosSecRef = useRef(-1)
  const [metronome, setMetronome] = useState(false)  // 本地节拍器（各自开关不进房混；播放器链路通了已正常出声——10-09晚复测）
  const [sfPct, setSfPct] = useState(-1)  // 音源加载进度（首访可见；-1=不在加载）
  const [fileMeta, setFileMeta] = useState({ title: "", artist: "" })  // 谱内标题/作者（审计#9：demo从文件读，别只显示上传文件名）
  const [scrubMs, setScrubMs] = useState(0)  // 起始位置（10-09 欢哥定稿：未播放时点进度线/谱面设定，播放从指针处开播——谁点播放用谁的位置）
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
  const playingRef = useRef(false)
  playingRef.current = playing  // 事件回调防陈旧闭包
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
    ;(async () => {
      try {
        const at = await import("@coderline/alphatab")
        // 自托管资产清单（immutable缓存锚点）：音源(synth必需) + worker(打包环境起 synth worker 的唯一途径)
        const mf = await fetch("/soundfont/manifest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        const settings = new at.Settings()
        settings.core.useWorkers = true           // 渲染worker（审计#1修复）：自托管scriptFile已验证worker通路，回归demo默认——渲染不再卡UI线程
        settings.core.fontDirectory = "/alphatab-font/"
        // ⚠️ blob worker 的 importScripts 解析不了相对URL——scriptFile 必须拼完整绝对URL（10-09 二修，欢哥实测卷宗定罪）
        if (mf?.worker) settings.core.scriptFile = new URL(`/alphatab/${mf.worker}`, window.location.origin).href
        settings.player.enablePlayer = true       // 步骤③指针：本地 player 只做走带指针+可选节拍器（全轨静音），音频仍走幽灵乐手
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
          setTracks(src.map((t) => ({ index: t.index, name: String(t.name || `轨 ${t.index + 1}`).slice(0, 40) })))
          // 本地播放全轨静音（音频单源=幽灵乐手，架构定稿）；节拍器走 metronomeVolume 独立通道不受影响
          try { real.changeTrackVolume?.(src, 0) } catch (e) { /* 静音失败最多漏声，不阻塞 */ }
          setScrubMs(0)  // 换谱重置起始位置
          lastPosSecRef.current = -1
          // 总时长：本地 MidiFileGenerator 生成事件流（与播放器/服务器同一条生成路径，反复记号展开一致），tempo 积分出毫秒
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
        // 谱面点击=定起始位置（10-09 重做版）：绝对tick=所点小节的 MasterBarTickLookup.start + 小节内偏移
        // ⚠️1.8.4 的 beat.playbackStart 是小节内相对量（首版踩坑），绝对起点从 api.tickCache.masterBars 反查
        // （反复记号会生成多个lookup指向同一小节——取第一次出现，语义="从视觉上这个小节开始"）
        real.beatMouseUp?.on?.((beat) => {
          if (cancelled || playingRef.current || !beat) return
          const cache = apiRef.current?.tickCache
          const mb = beat.voice?.bar?.masterBar
          const barStart = cache?.masterBars?.find((m) => m.masterBar === mb)?.start
          if (barStart === undefined) return  // tickCache 未就绪（播放器还在加载）——不误跳
          const ms = Math.max(0, Math.round(tickToMs(barStart + (beat.playbackStart ?? 0))))
          console.log("[gp指针] 谱面点击 小节起点tick=", barStart, "偏移=", beat.playbackStart, "→ms=", ms)
          setScrubMs(ms)
          const api = apiRef.current
          if (api) { try { api.timePosition = ms } catch (e) { /* 预览失败无碍 */ } }
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
        real.load(buf, () => { if (!cancelled) setLoading(false) }, (e: Error) => { if (!cancelled) { setErr("谱子解析失败：" + e.message); setLoading(false) } })
      } catch (e) {
        if (!cancelled) { setErr((e as Error)?.message || "渲染失败"); setLoading(false) }
      }
    })()
    return () => { cancelled = true; apiRef.current = null; realTracksRef.current = []; try { api?.destroy?.() } catch (e) { /* 卸载兜底 */ } }
  }, [url])

  // 跟走带（步骤③）：gp-state=唯一真相——播放=seek到 startMs+墙钟elapsed 再play；暂停=归零（服务器暂停即杀进程，重播位置由下次点播者定）
  useEffect(() => {
    const api = apiRef.current
    if (!api || !playerReady) return
    try {
      if (gpState?.playing && gpState.startedAt) {
        api.timePosition = Math.max(0, (gpState.startMs ?? 0) + Date.now() - new Date(gpState.startedAt).getTime())
        console.log("[gp指针] 跟走带 play @", api.timePosition)
        api.play?.()
      } else {
        api.pause?.()
        api.timePosition = 0
        setScrubMs(0)
        setPosMs(0)
      }
    } catch (e) { console.error("[gp指针] 跟走带失败:", e) }
  }, [gpState?.playing, gpState?.startedAt, gpState?.startMs, playerReady])

  // 墙钟对表（每2s）：|本地位置-墙钟目标|>150ms 才 seek（seek 稀疏=平滑滚动交给 alphaTab 原生）
  useEffect(() => {
    if (!gpState?.playing || !gpState.startedAt || !playerReady) return
    const base = gpState.startMs ?? 0
    const startedAtMs = new Date(gpState.startedAt).getTime()
    const id = setInterval(() => {
      const api = apiRef.current
      if (!api) return
      const target = base + Date.now() - startedAtMs
      const diff = (api.timePosition ?? 0) - target
      console.log("[gp指针] 对表 tick 本地=", Math.round(api.timePosition ?? 0), "目标=", Math.round(target), "差=", Math.round(diff))
      if (Math.abs(diff) > 150) {
        console.log("[gp指针] 对表 seek 差=", Math.round(diff), "ms")
        try { api.timePosition = Math.max(0, target) } catch (e) { /* 忽略本轮 */ }
      }
    }, 2000)
    return () => clearInterval(id)
  }, [gpState?.playing, gpState?.startedAt, gpState?.startMs, playerReady])

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
        <div ref={viewportRef} className="h-full overflow-y-auto scrollbar-thin" style={{ background: "#fff" }}>
          <div ref={containerRef} />
        </div>
      </div>
      {/* 底部工具栏（10-09 欢哥定稿布局）：走带+分轨+工作站功能全收这里，不占谱面水平空间 */}
      <div className="relative flex h-9 shrink-0 items-center gap-2 border-t border-white/10 px-3">
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
        {(onPlay || onPause) && (
          <button
            onClick={() => { if (pending) return; setPending(true); (playing ? onPause?.() : onPlay?.(scrubMs)) }}
            disabled={pending}
            title={playing ? "暂停" : "播放"}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-white transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <span className="text-[10px]">…</span> : playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="size-4" fill="currentColor" />}
          </button>
        )}
        {/* 走带时间（常驻，alphaTab 控制栏样式）：走过时间 / 谱面总时长；播放时点亮，停止归零 */}
        {(() => {
          // 真实播放位置优先（步骤③指针事件）；事件未到时退墙钟估算；未播放=起始位置预览（随进度线点击）
          const elapsed = playing && gpState?.startedAt
            ? Math.max(0, Math.floor((posMs > 0 ? posMs : now - new Date(gpState.startedAt).getTime()) / 1000))
            : Math.floor(scrubMs / 1000)
          return (
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
              {playing && <span className="size-1.5 animate-rec-pulse rounded-full" style={{ background: "#BBEE00" }} />}
              <span style={playing ? { color: "#BBEE00" } : { color: "rgba(255,255,255,0.6)" }}>{fmt(elapsed)}</span>
              {totalMs > 0 && <span className="text-white/35">/ {fmt(Math.floor(totalMs / 1000))}</span>}
              {sfPct >= 0 && <span className="text-white/40">· 音源 {sfPct}%</span>}
            </span>
          )
        })()}
        {/* 分轨入口（10-09 欢哥定稿：吉他社样式）——工具栏只放一个按钮，点开向上弹列表；
            常驻（含单轨谱，点开就一条轨——避免用户猜"按钮没了是bug还是谱子问题"）；谱面始终全宽 */}
        {tracks.length >= 1 && (
          <div className="relative flex">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              title={`分轨（当前：${currentTrackName}）`}
              className={`flex h-6 w-7 items-center justify-center rounded-[6px] transition-colors ${panelOpen ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            >
              <SlidersHorizontal className="size-3.5" />
            </button>
            {panelOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPanelOpen(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-1.5 max-h-[50vh] w-64 overflow-y-auto rounded-lg border border-white/10 bg-[#141414] p-1 shadow-2xl scrollbar-thin">
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
        {/* 节拍器（步骤③顺手）：本地各自开关不进房混，走带对表保证跟拍 */}
        <button
          onClick={() => {
            const next = !metronome
            setMetronome(next)
            const api = apiRef.current
            if (api) { try { api.metronomeVolume = next ? 1 : 0 } catch (e) { /* 静默 */ } }
          }}
          title={metronome ? "节拍器开着（本地）· 点击关闭" : "节拍器（本地各自开关，不影响他人）"}
          className={`flex h-6 w-7 shrink-0 items-center justify-center rounded-[6px] transition-colors ${metronome ? "bg-white/12 text-[#BBEE00]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
        >
          <MetronomeIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
