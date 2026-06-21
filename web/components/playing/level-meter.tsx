"use client"

import { useEffect, useRef, useCallback } from "react"

export function LevelMeter({ port, active }: { port?: number; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef(0)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Setup audio graph once on mount
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "none"
    audio.crossOrigin = "anonymous"
    audio.volume = 0.8
    audioRef.current = audio

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = audioCtx
      const src = audioCtx.createMediaElementSource(audio)
      sourceRef.current = src
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 32
      analyserRef.current = analyser
      src.connect(analyser)
      analyser.connect(audioCtx.destination)
    } catch (e) {
      console.log("[levelmeter] web audio init failed:", e)
    }

    return () => {
      cancelAnimationFrame(animRef.current)
      audio.pause()
      audio.src = ""
      audioCtxRef.current?.close()
      audioCtxRef.current = null
    }
  }, [])

  // Start/stop on active change
  useEffect(() => {
    const audio = audioRef.current
    const ctx = audioCtxRef.current
    if (!audio || !ctx) return

    if (active && port) {
      const url = `${window.location.protocol}//${window.location.hostname}/stream/room-${port}`
      audio.src = url

      ctx.resume().then(() => {
        audio.play().catch((e: Error) => console.log("[levelmeter] play:", e.message))
      })

      // Start visualization
      if (canvasRef.current && analyserRef.current) {
        const analyser = analyserRef.current!
        const canvas = canvasRef.current
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
      }
    } else {
      cancelAnimationFrame(animRef.current)
      audio.pause()
      audio.src = ""
    }
  }, [active, port])

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
