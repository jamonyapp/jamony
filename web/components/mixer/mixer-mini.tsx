"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { GripHorizontal, Maximize2, Pause, Play, X } from "lucide-react"
import { formatTime, MIXER_COLORS, type MixerMiniProps } from "./types"

export function MixerMini({
  sessionLabel,
  isPlaying,
  currentTime,
  duration,
  progress,
  loadingProgress,
  onTogglePlay,
  onSeek,
  onClose,
  onFullscreen,
}: MixerMiniProps) {
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  // 初始定位到右下角
  useEffect(() => {
    setPos({ x: window.innerWidth - 344, y: window.innerHeight - 124 })
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return
      const x = Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - 320)
      const y = Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - 100)
      setPos({ x, y })
    }
    const up = () => {
      dragRef.current = null
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [])

  const handleSeek = useCallback(
    (clientX: number) => {
      const el = progressRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
    },
    [onSeek],
  )

  return (
    <div
      className="fixed z-[60] select-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: 320,
        background: MIXER_COLORS.panel,
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        border: `1px solid ${MIXER_COLORS.border}`,
        animation: "miniIn 0.18s ease-out",
      }}
    >
      {/* 拖动手柄 */}
      <div
        className="flex cursor-grab items-center justify-between px-3 py-1.5 active:cursor-grabbing"
        style={{ borderBottom: `1px solid ${MIXER_COLORS.border}` }}
        onPointerDown={(e) => {
          dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        }}
      >
        <div className="flex items-center gap-1.5 text-xs" style={{ color: MIXER_COLORS.textMuted }}>
          <GripHorizontal size={14} />
          <span style={{ color: MIXER_COLORS.text }}>{sessionLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onFullscreen}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
            style={{ color: MIXER_COLORS.textMuted }}
            aria-label="全屏还原"
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-white/10"
            style={{ color: MIXER_COLORS.textMuted }}
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 加载中：迷你进度条 */}
      {loadingProgress !== undefined && loadingProgress < 100 ? (
        <div className="flex flex-col items-center gap-3 px-3 py-3">
          <p className="text-[11px] font-medium" style={{ color: MIXER_COLORS.textMuted }}>音轨准备中</p>
          <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: "#222" }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${loadingProgress}%`,
                background: `linear-gradient(to right, ${MIXER_COLORS.purple}, ${MIXER_COLORS.blue})`,
              }}
            />
          </div>
          <span className="font-mono text-[11px]" style={{ color: MIXER_COLORS.text }}>
            {Math.round(loadingProgress)}%
          </span>
        </div>
      ) : (
        /* 迷你走带 */
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
            style={{ background: MIXER_COLORS.green, color: "#121212" }}
            aria-label={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="font-mono text-[11px] tabular-nums" style={{ color: MIXER_COLORS.text }}>
              {formatTime(currentTime)}
              <span style={{ color: MIXER_COLORS.textMuted }}> / {formatTime(duration)}</span>
            </div>
            <div
              ref={progressRef}
              className="relative h-1.5 w-full cursor-pointer rounded-full"
              style={{ background: "#0e0e0e" }}
              onPointerDown={(e) => handleSeek(e.clientX)}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${progress * 100}%`,
                  background: `linear-gradient(to right, ${MIXER_COLORS.purple}, ${MIXER_COLORS.blue})`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes miniIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
