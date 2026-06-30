"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { MixerTrack } from "@/components/mixer/types"

/** 从 AudioBuffer 提取波形峰值，downsample 到 targetCount 点 */
function extractPeaks(buf: AudioBuffer, targetCount: number): number[] {
  const raw = buf.getChannelData(0)
  const peaks: number[] = []
  const bucketSize = Math.max(1, Math.floor(raw.length / targetCount))
  for (let i = 0; i < targetCount; i++) {
    let max = 0
    const end = Math.min((i + 1) * bucketSize, raw.length)
    for (let j = i * bucketSize; j < end; j++) {
      const abs = Math.abs(raw[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }
  return peaks
}

export function useMixerEngine() {
  const audioCtxRef = useRef<AudioContext | null>(null)

  // 轨道数据
  const [tracks, setTracks] = useState<MixerTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 播放状态（用 ref 避免闭包陷阱）
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // M/S
  const [mutes, setMutes] = useState<Record<string, boolean>>({})
  const [solos, setSolos] = useState<Record<string, boolean>>({})

  // 实时电平
  const [levels, setLevels] = useState<Record<string, number>>({})

  // 保存用户设置的音量（避免 seek 时被 0.78 覆盖）
  const volumesRef = useRef<Record<string, number>>({})

  // 音频资源
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const analyserNodesRef = useRef<Map<string, AnalyserNode>>(new Map())
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map())

  // 播放位置追踪
  const startTimeRef = useRef(0)
  const startOffsetRef = useRef(0)
  const rafRef = useRef(0)
  const durationRef = useRef(0)
  const rafTickRef = useRef<() => void>(() => {})

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return audioCtxRef.current
  }, [])

  // 独立的电平轮询（50ms 间隔，不依赖 RAF）
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!isPlaying) {
      setLevels({})
      return
    }
    levelTimerRef.current = setInterval(() => {
      const lv: Record<string, number> = {}
      analyserNodesRef.current.forEach((analyser, id) => {
        const buf = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(buf)
        let sumSq = 0
        for (let i = 0; i < buf.length; i++) {
          const s = buf[i]
          sumSq += s * s
        }
        lv[id] = Math.sqrt(sumSq / buf.length)
      })
      setLevels(lv)
    }, 50)
    return () => { clearInterval(levelTimerRef.current!); levelTimerRef.current = null }
  }, [isPlaying])

  // RAF 循环：只更新走带位置
  const rafTick = useCallback(() => {
    if (!isPlayingRef.current) return
    const elapsed = (performance.now() - startTimeRef.current) / 1000
    const next = Math.min(startOffsetRef.current + elapsed, durationRef.current)
    setCurrentTime(next)
    if (next >= durationRef.current) {
      isPlayingRef.current = false
      setIsPlaying(false)
      startOffsetRef.current = 0
      setCurrentTime(0)
      return
    }
    rafRef.current = requestAnimationFrame(rafTickRef.current)
  }, [])

  rafTickRef.current = rafTick

  // 停止所有当前音源
  const stopAllSources = useCallback(() => {
    sourceNodesRef.current.forEach(src => {
      try { src.stop() } catch {}
    })
    sourceNodesRef.current = new Map()
    cancelAnimationFrame(rafRef.current)
  }, [])

  // 从当前偏移量播放
  const playFromOffset = useCallback((offset: number) => {
    const ctx = getCtx()
    const buffers = buffersRef.current
    const gains = gainNodesRef.current
    const soloIds = new Set(Object.keys(solos).filter(k => solos[k]))
    const hasSolo = soloIds.size > 0

    buffers.forEach((buf, id) => {
      const gain = gains.get(id)
      if (!gain) return
      const isMuted = mutes[id] ?? false
      const isSoloed = solos[id] ?? false
      const savedVol = volumesRef.current[id] ?? 0.78
      gain.gain.value = hasSolo ? (isSoloed ? savedVol : 0) : (isMuted ? 0 : savedVol)

      if (offset >= buf.duration) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(gain)
      src.start(0, offset)
      sourceNodesRef.current.set(id, src)
    })

    startTimeRef.current = performance.now()
    startOffsetRef.current = offset
    isPlayingRef.current = true
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(rafTick)
  }, [getCtx, mutes, solos, rafTick])

  // 加载音轨
  const loadTracks = useCallback(async (mixerTracks: MixerTrack[]) => {
    const ctx = getCtx()
    setLoading(true)
    setLoadProgress(0)
    setLoadError(null)
    setTracks([])
    stopAllSources()
    startOffsetRef.current = 0
    setCurrentTime(0)

    const newBuffers = new Map<string, AudioBuffer>()
    const newGains = new Map<string, GainNode>()
    const newAnalysers = new Map<string, AnalyserNode>()
    const newPeaks: Record<string, number[]> = {}
    let maxDuration = 0

    for (let i = 0; i < mixerTracks.length; i++) {
      const t = mixerTracks[i]
      try {
        const res = await fetch(t.wavUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const arrayBuf = await res.arrayBuffer()
        const audioBuf = await ctx.decodeAudioData(arrayBuf)
        newBuffers.set(t.id, audioBuf)

        const gain = ctx.createGain()
        gain.gain.value = 0.78
        newGains.set(t.id, gain)

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        // 链路：gain → analyser → destination
        gain.connect(analyser)
        analyser.connect(ctx.destination)
        newAnalysers.set(t.id, analyser)

        const peaks = extractPeaks(audioBuf, 200)
        newPeaks[t.id] = peaks
        maxDuration = Math.max(maxDuration, audioBuf.duration)
        setLoadProgress(Math.round(((i + 1) / mixerTracks.length) * 100))
      } catch (e: any) {
        console.error(`[mixer] load failed: ${t.name}`, e)
        setLoadError(`${t.name}: ${e.message}`)
        setLoading(false)
        return
      }
    }

    buffersRef.current = newBuffers
    gainNodesRef.current = newGains
    analyserNodesRef.current = newAnalysers
    // 初始化每个轨的默认音量
    mixerTracks.forEach(t => { volumesRef.current[t.id] = 0.78 })
    const pk = newPeaks
    setTracks(mixerTracks.map(t => ({
      ...t,
      peaks: pk[t.id] || [],
      duration: maxDuration,
    })))
    durationRef.current = maxDuration
    setDuration(maxDuration)
    setCurrentTime(0)
    setLoadProgress(100)
    setLoading(false)
    setMutes({})
    setSolos({})
  }, [getCtx, stopAllSources])

  // 播放
  const play = useCallback(() => {
    playFromOffset(startOffsetRef.current)
  }, [playFromOffset])

  // 暂停
  const pause = useCallback(() => {
    stopAllSources()
    startOffsetRef.current = currentTime
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [currentTime, stopAllSources])

  // 停止
  const stop = useCallback(() => {
    stopAllSources()
    startOffsetRef.current = 0
    isPlayingRef.current = false
    setIsPlaying(false)
    setCurrentTime(0)
  }, [stopAllSources])

  // 跳转
  const seek = useCallback((ratio: number) => {
    const newTime = ratio * duration
    startOffsetRef.current = newTime
    setCurrentTime(newTime)
    if (isPlayingRef.current) {
      stopAllSources()
      playFromOffset(newTime)
    }
  }, [duration, stopAllSources, playFromOffset])

  // M/S 回调
  const handleVolume = useCallback((id: string, value: number) => {
    volumesRef.current[id] = value
    const g = gainNodesRef.current.get(id)
    if (g) g.gain.value = value
  }, [])

  const handleMute = useCallback((id: string, muted: boolean) => {
    setMutes(prev => ({ ...prev, [id]: muted }))
    const gain = gainNodesRef.current.get(id)
    if (gain && isPlayingRef.current) {
      const hasSolo = Object.values(solos).some(v => v)
      const savedVol = volumesRef.current[id] ?? 0.78
      gain.gain.value = muted ? 0 : (hasSolo && !solos[id] ? 0 : savedVol)
    }
  }, [solos])

  const handleSolo = useCallback((id: string, soloed: boolean) => {
    setSolos(prev => ({ ...prev, [id]: soloed }))
    if (isPlayingRef.current) {
      const nextSolos = { ...solos, [id]: soloed }
      const hasSolo = Object.values(nextSolos).some(v => v)
      gainNodesRef.current.forEach((gain, gid) => {
        const savedVol = volumesRef.current[gid] ?? 0.78
        if (hasSolo) gain.gain.value = nextSolos[gid] ? savedVol : 0
        else gain.gain.value = (mutes[gid] ?? false) ? 0 : savedVol
      })
    }
  }, [mutes, solos])

  // 清理
  useEffect(() => {
    return () => {
      stopAllSources()
      audioCtxRef.current?.close()
    }
  }, [stopAllSources])

  const progress = duration > 0 ? currentTime / duration : 0

  return {
    loading, loadProgress, loadError,
    isPlaying, currentTime, duration, progress,
    tracks, mutes, solos, levels,
    loadTracks,
    play, pause, stop, seek,
    togglePlay: isPlaying ? pause : play,
    onVolumeChange: handleVolume,
    onMuteToggle: handleMute,
    onSoloToggle: handleSolo,
  }
}
