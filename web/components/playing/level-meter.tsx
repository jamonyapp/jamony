"use client"

import { useEffect, useRef } from "react"
import { useRoomSession } from "@/lib/room-session"

// 听众电平可视化（10-07 漫游续听改造：音频元素+Analyser 已上移 RoomSessionProvider
// 全局常驻，本组件只从共享 analyser 读频谱画 canvas——漫游回来画布自动恢复，流不断）
export function LevelMeter({ active }: { active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const { analyserRef } = useRoomSession()

  useEffect(() => {
    if (!active) { cancelAnimationFrame(animRef.current); return }
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    if (!analyser || !canvas) return

    const ctx2d = canvas.getContext("2d")!
    const W = canvas.width
    const H = canvas.height
    const barCount = 12
    const barW = 4
    const gap = 3
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      if (!analyser) return
      analyser.getByteFrequencyData(dataArray)
      ctx2d.clearRect(0, 0, W, H)

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor(i * bufferLength / barCount)
        const val = dataArray[idx] / 255
        const barH = Math.max(2, val * H)
        const x = i * (barW + gap)
        const y = H - barH
        ctx2d.fillStyle = val < 0.4 ? "#BBEE00" : "#FF33AA"
        ctx2d.globalAlpha = 0.3 + val * 0.7
        ctx2d.fillRect(x, y, barW, barH)
        ctx2d.globalAlpha = 1
      }
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [active, analyserRef])

  return (
    <canvas
      ref={canvasRef}
      width={90}
      height={24}
      className="mt-3 rounded"
      style={{ display: active ? "block" : "none" }}
    />
  )
}
