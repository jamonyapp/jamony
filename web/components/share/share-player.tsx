"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause } from "lucide-react"

// 1110 落地页播放器·欢哥重做批: 点播不自动播(微信内自动播被平台拦,且突然出声不礼貌);
// 纯黑底+明度差分层(jamony 风格); 大圆播放键+纵向居中细进度条(hover 出拖点)+双侧时间;
// 进度条点击跳转;媒体绝对地址由页面层拼好传入。
export function SharePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setCur(el.currentTime)
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

  if (!src) {
    return <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950 py-4 text-center text-sm text-zinc-500">音频暂不可用</div>
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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current
    if (!el || !total) return
    const rect = e.currentTarget.getBoundingClientRect()
    el.currentTime = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * total
  }

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const pct = total ? (cur / total) * 100 : 0

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950 p-4">
      <audio ref={audioRef} src={src} preload="metadata" />
      <div className="flex items-center gap-4">
        <button
          aria-label={playing ? "暂停" : "播放"}
          onClick={toggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-sm transition-transform active:scale-95"
        >
          {playing ? (
            <Pause className="h-5 w-5 fill-black" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-black" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {/* 进度条: 容器定高+items-center=轨道纵向居中;group hover 出拖点 */}
          <div className="group flex h-5 cursor-pointer items-center" onClick={seek}>
            <div className="relative h-1 w-full rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                style={{ left: `calc(${pct}% - 6px)` }}
              />
            </div>
          </div>
          <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-zinc-500">
            <span>{fmt(cur)}</span>
            <span>{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
