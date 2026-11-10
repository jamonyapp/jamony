"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"

// 1110 落地页播放器·秀气终版(欢哥批: 前版"笨"): 小圆键+细轨道+常显小拖点;
// Pointer Events 统一鼠标/触摸——手机可拖拽快进快退(边拖边跳), 拖点不再 hover-only(手机无 hover);
// 点播不自动播;纯黑底明度差分层。
export function SharePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => { if (!draggingRef.current) setCur(el.currentTime) }
    const onMeta = () => setTotal(el.duration || 0)
    const onEnd = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    el.addEventListener("timeupdate", onTime)
    el.addEventListener("loadedmetadata", onMeta)
    el.addEventListener("ended", onEnd)
    el.addEventListener("play", onPlay)
    el.addEventListener("pause", onPause)
    return () => {
      el.removeEventListener("timeupdate", onTime)
      el.removeEventListener("loadedmetadata", onMeta)
      el.removeEventListener("ended", onEnd)
      el.removeEventListener("play", onPlay)
      el.removeEventListener("pause", onPause)
    }
  }, [])

  // 拖拽中 timeupdate 不要抢写 cur(否则拖点抖动)
  const draggingRef = useRef(false)
  useEffect(() => { draggingRef.current = dragging }, [dragging])

  if (!src) {
    return <div className="mt-6 rounded-2xl bg-zinc-950 py-4 text-center text-sm text-zinc-500">音频暂不可用</div>
  }

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      if (el.ended) el.currentTime = 0 // 播完重听:从头
      el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  const ratioAt = (clientX: number) => {
    const bar = barRef.current
    if (!bar || !total) return 0
    const rect = bar.getBoundingClientRect()
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  }

  const seekTo = (clientX: number) => {
    const t = ratioAt(clientX) * total
    setCur(t)
    if (audioRef.current) audioRef.current.currentTime = t
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!total) return
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
    if (!Number.isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const pct = total ? (cur / total) * 100 : 0

  return (
    <div className="mt-6 rounded-2xl bg-zinc-950 px-4 py-3.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-3.5">
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
        <div className="min-w-0 flex-1">
          {/* 进度轨道: 纵向居中;拖点常显(手机可见);拖动/悬停时轨道微变粗=质感 */}
          <div
            ref={barRef}
            className={`group flex h-4 cursor-pointer touch-none items-center ${dragging ? "select-none" : ""}`}
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
          <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-zinc-500">
            <span>{fmt(cur)}</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
