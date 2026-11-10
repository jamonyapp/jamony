"use client"

import { useEffect, useRef, useState } from "react"

// 1110 落地页播放器:点播不自动播(微信内自动播被平台拦,且突然出声不礼貌)。
// 纯黑底+明度差分层(jamony 风格);进度条点击跳转;媒体绝对地址由页面层拼好传入。
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
    el.addEventListener("timeupdate", onTime)
    el.addEventListener("loadedmetadata", onMeta)
    el.addEventListener("ended", onEnd)
    return () => {
      el.removeEventListener("timeupdate", onTime)
      el.removeEventListener("loadedmetadata", onMeta)
      el.removeEventListener("ended", onEnd)
    }
  }, [])

  if (!src) {
    return <div className="mt-6 rounded-lg bg-zinc-900 py-4 text-center text-sm text-zinc-500">音频暂不可用</div>
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
    el.currentTime = ((e.clientX - rect.left) / rect.width) * total
  }

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const pct = total ? (cur / total) * 100 : 0

  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg bg-zinc-900 p-3">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        aria-label={playing ? "暂停" : "播放"}
        onClick={toggle}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-black active:bg-zinc-300"
      >
        {playing ? (
          <span className="flex gap-[3px]">
            <span className="block h-3.5 w-[3px] bg-black" />
            <span className="block h-3.5 w-[3px] bg-black" />
          </span>
        ) : (
          <span className="ml-0.5 block h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-black" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="group h-4 cursor-pointer items-center" onClick={seek}>
          <div className="mt-[7px] h-[3px] w-full rounded bg-zinc-700">
            <div className="h-full rounded bg-zinc-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[11px] tabular-nums text-zinc-500">
          <span>{fmt(cur)}</span>
          <span>{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}
