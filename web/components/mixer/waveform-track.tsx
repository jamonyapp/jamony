"use client"

import { memo, useEffect, useRef } from "react"
import { MIXER_COLORS } from "./types"

interface WaveformTrackProps {
  id: string
  name: string
  instrument: string
  color: string
  /** 该轨是否正在发声（用于微光动效） */
  active: boolean
  muted: boolean
}

/** 基于 id 生成确定性的伪波形峰值，保证每次渲染一致 */
function generatePeaks(seed: string, count: number): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const peaks: number[] = []
  let state = h >>> 0
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    const r = state / 0xffffffff
    // 制造一些起伏的包络
    const envelope = 0.35 + 0.65 * Math.abs(Math.sin((i / count) * Math.PI * 6 + h))
    peaks.push(Math.max(0.06, r * envelope))
  }
  return peaks
}

function WaveformTrackImpl({ id, name, instrument, color, active, muted }: WaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const barCount = Math.max(40, Math.floor(w / 3))
      const peaks = generatePeaks(id, barCount)
      const gap = 1
      const barW = (w - gap * (barCount - 1)) / barCount
      const mid = h / 2

      const gradient = ctx.createLinearGradient(0, 0, w, 0)
      gradient.addColorStop(0, MIXER_COLORS.green)
      gradient.addColorStop(1, MIXER_COLORS.blue)
      ctx.fillStyle = gradient
      ctx.globalAlpha = muted ? 0.25 : 1

      for (let i = 0; i < barCount; i++) {
        const peak = peaks[i]
        const barH = peak * (h - 4)
        const x = i * (barW + gap)
        ctx.fillRect(x, mid - barH / 2, barW, barH)
      }
      ctx.globalAlpha = 1
    }

    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [id, color, muted])

  return (
    <div className="relative flex shrink-0 items-center gap-3 rounded-md px-3" style={{ height: 52 }}>
      {/* 标签 */}
      <div className="z-10 flex w-40 shrink-0 items-center gap-2 truncate">
        <span className="text-base leading-none">{instrument}</span>
        <span className="truncate text-sm" style={{ color: muted ? MIXER_COLORS.textMuted : MIXER_COLORS.text }}>
          {name}
        </span>
      </div>
      {/* 波形画布 */}
      <div
        className="relative h-full flex-1 overflow-hidden rounded"
        style={{
          background: MIXER_COLORS.waveBg,
          boxShadow: active && !muted ? `0 0 16px ${color}55, inset 0 0 0 1px ${color}33` : "inset 0 0 0 1px #2a2a2a",
          transition: "box-shadow 0.3s ease",
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
    </div>
  )
}

/** memo 化：播放走带时父组件每帧重渲染，但本组件 props 不变，跳过重渲染避免卡顿 */
export const WaveformTrack = memo(WaveformTrackImpl)
