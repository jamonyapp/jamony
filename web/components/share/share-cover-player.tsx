"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Play, Pause } from "lucide-react"

// 1110 落地页·封面即播放器(欢哥拍板方案A,嫂子首屏反馈): 封面中央半透明大播放键(整封面可点=零思考成本,
// YouTube/SoundCloud/Apple Podcasts 分享页同款);进度条贴封面底边内侧+底部渐变遮罩保可读;
// 时间右下角悬浮;播放中封面压暗=「正在播放」状态感。iOS 时长五口兜底+Pointer拖拽快进快退。
export function ShareCoverPlayer({ src, gradient, children, badge }: {
  src: string
  gradient: string
  children: ReactNode  // 封面图(<img>,由页面拼绝对地址)
  badge?: ReactNode    // 翻唱/改编角标
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => { draggingRef.current = dragging }, [dragging])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const syncDuration = () => {
      const d = el.duration
      if (Number.isFinite(d) && d > 0) setTotal(d)
    }
    const onTime = () => {
      if (!draggingRef.current) setCur(el.currentTime)
      syncDuration()
    }
    const onPlay = () => { setPlaying(true); syncDuration() }
    const onPause = () => setPlaying(false)
    const onEnd = () => { setPlaying(false); setCur(0) } // 播完圆点回开头(欢哥批)
    el.addEventListener("timeupdate", onTime)
    el.addEventListener("durationchange", syncDuration)
    el.addEventListener("loadedmetadata", syncDuration)
    el.addEventListener("canplay", syncDuration)
    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    el.addEventListener("ended", onEnd)
    return () => {
      el.removeEventListener("timeupdate", onTime)
      el.removeEventListener("durationchange", syncDuration)
      el.removeEventListener("loadedmetadata", syncDuration)
      el.removeEventListener("canplay", syncDuration)
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
      el.removeEventListener("ended", onEnd)
    }
  }, [])

  const durationNow = () => {
    const el = audioRef.current
    if (el && Number.isFinite(el.duration) && el.duration > 0) return el.duration
    return total
  }

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      if (el.ended) el.currentTime = 0
      el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }

  const seekTo = (clientX: number) => {
    const bar = barRef.current
    const el = audioRef.current
    const dur = durationNow()
    if (!bar || !dur || !el) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    const t = ratio * dur
    setCur(t)
    el.currentTime = t
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation() // 进度区不触发封面播放
    if (!durationNow()) return
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    seekTo(e.clientX)
  }
  const onPointerUp = () => setDragging(false)

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s <= 0) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const pct = total ? (cur / total) * 100 : 0

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px] select-none overflow-hidden rounded-lg" style={{ background: gradient }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      {children}
      {/* 播放中封面压暗=正在播放状态感 */}
      {playing && <div className="absolute inset-0 bg-black/25" />}
      {badge}
      {/* 整封面可点=播放/暂停(进度区除外——其 pointer 已 stopPropagation) */}
      <button
        type="button"
        aria-label={playing ? "暂停" : "播放"}
        className="absolute inset-0 grid cursor-pointer place-items-center"
        onClick={toggle}
      >
        <span className={`flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all active:scale-90 ${playing ? "opacity-80" : ""}`}>
          {playing ? (
            <Pause className="h-8 w-8 fill-white text-white" />
          ) : (
            <Play className="ml-1 h-8 w-8 fill-white text-white" />
          )}
        </span>
      </button>
      {/* 底部渐变遮罩: 保证进度/时间在任何封面图上可读 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
      {/* 时间: 进度条上方,与其右端对齐——拖点永不到此(欢哥批) */}
      <div className="pointer-events-none absolute bottom-3.5 right-3.5 z-10 text-[10px] tabular-nums leading-none text-white/90 drop-shadow">
        {fmt(cur)} / {fmt(total)}
      </div>
      {/* 进度条: 贴封面底边内侧,左右留边避开圆角弧度(Apple Music 同款处理);纵向居中命中区,可点可拖 */}
      <div
        ref={barRef}
        className={`absolute bottom-0 left-3.5 right-3.5 z-20 flex h-5 touch-none items-end cursor-pointer ${dragging ? "select-none" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className={`w-full rounded-full bg-white/25 transition-all ${dragging ? "my-1 h-1.5" : "mb-1.5 h-[3px]"}`}>
          <div className="relative h-full">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
            <div
              className={`absolute rounded-full bg-white shadow transition-transform ${dragging ? "h-3 w-3" : "h-2.5 w-2.5"}`}
              style={{ left: `calc(${pct}% - 5px)`, top: "50%", transform: "translateY(-50%)" }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
