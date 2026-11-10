"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"

// 1110 落地页播放器·定稿(欢哥批): [键][cur/total][进度条]单行垂直居中=进度条与键圆心等高;
// iOS/微信无视 preload=metadata→时长不加载→拖点不动/无法拖动三连 bug——durationchange+canplay+
// loadedmetadata+play+timeupdate 五口兜底取 duration;播放态纯事件驱动(不乐观更新);
// Pointer Events 统一鼠标/触摸拖拽(边拖边跳),touch-none 防滚动劫持。
export function SharePlayer({ src }: { src: string }) {
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
      syncDuration() // iOS 流式: duration 常迟至播放后才给,timeupdate 兜底
    }
    const onPlay = () => { setPlaying(true); syncDuration() }
    const onPause = () => setPlaying(false)
    const onEnd = () => setPlaying(false)
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

  if (!src) {
    return <div className="mt-6 rounded-2xl bg-zinc-950 py-4 text-center text-sm text-zinc-500">音频暂不可用</div>
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      if (el.ended) el.currentTime = 0 // 播完重听:从头
      el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
    // 播放态不乐观更新: onPlay/onPause 事件驱动(状态永远真实)
  }

  const ratioAt = (clientX: number) => {
    const bar = barRef.current
    const el = audioRef.current
    if (!bar) return 0
    // duration 实时现查(iOS 播放后才有效),不信 state 的 total(可能还是0)
    const dur = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : total
    if (!dur) return 0
    const rect = bar.getBoundingClientRect()
    return { ratio: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1), dur }
  }

  const seekTo = (clientX: number) => {
    const el = audioRef.current
    const r = ratioAt(clientX)
    if (!r || !r.dur || !el) return
    const t = r.ratio * r.dur
    setCur(t)
    el.currentTime = t
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!total && !(audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0)) {
      return // 时长未就绪(iOS 未播放过)——不响应,避免拖点假死在0
    }
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
    <div className="mt-6 rounded-2xl bg-zinc-950 px-4 py-3.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      {/* 单行三件: 键+时间+进度条——items-center=进度条与播放键圆心等高 */}
      <div className="flex items-center gap-3">
        <button
          aria-label={playing ? "暂停" : "播放"}
          onClick={toggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform active:scale-90"
        >
          {playing ? (
            <Pause className="h-4 w-4 fill-black" />
          ) : (
            <Play className="ml-px h-4 w-4 fill-black" />
          )}
        </button>
        <span className="shrink-0 text-[11px] tabular-nums leading-none text-zinc-400">
          {fmt(cur)}/{fmt(total)}
        </span>
        <div
          ref={barRef}
          className={`flex h-4 min-w-0 flex-1 cursor-pointer touch-none items-center ${dragging ? "select-none" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className={`w-full rounded-full bg-zinc-800 transition-all ${dragging ? "h-1" : "h-[3px] group-hover:h-1"}`}>
            <div className="relative h-full">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
              <div
                className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${dragging ? "h-3 w-3" : "h-2.5 w-2.5"}`}
                style={{ left: `calc(${pct}% - 5px)` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
