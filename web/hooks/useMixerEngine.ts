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

const DEFAULT_GAIN = 1.0  // 0dB（unity），DAW 标准

export function useMixerEngine() {
  const audioCtxRef = useRef<AudioContext | null>(null)

  // 轨道数据
  const [tracks, setTracks] = useState<MixerTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // M/S/volumes/pans（state 单一来源，UI 读这些）
  const [mutes, setMutes] = useState<Record<string, boolean>>({})
  const [solos, setSolos] = useState<Record<string, boolean>>({})
  const [volumes, setVolumes] = useState<Record<string, number>>({})
  const [pans, setPans] = useState<Record<string, number>>({})

  // 实时电平
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [masterLevel, setMasterLevel] = useState(0)
  const [clips, setClips] = useState<Record<string, boolean>>({})
  const [masterClip, setMasterClip] = useState(false)

  // master
  const [masterVolume, setMasterVolume] = useState(DEFAULT_GAIN)

  // ref（避免闭包 + seek 恢复）
  const volumesRef = useRef<Record<string, number>>({})
  const pansRef = useRef<Record<string, number>>({})
  const mutesRef = useRef<Record<string, boolean>>({})
  const solosRef = useRef<Record<string, boolean>>({})
  const masterVolumeRef = useRef(DEFAULT_GAIN)
  const clipsRef = useRef<Record<string, boolean>>({})
  const masterClipRef = useRef(false)

  // 音频资源
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map())
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map())
  const analyserNodesRef = useRef<Map<string, AnalyserNode>>(new Map())
  const pannerNodesRef = useRef<Map<string, StereoPannerNode>>(new Map())
  const sourceNodesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map())
  const masterGainRef = useRef<GainNode | null>(null)
  const masterAnalyserRef = useRef<AnalyserNode | null>(null)

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

  // 计算某轨实际 gain（考虑 mute/solo）
  const effectiveGain = useCallback((id: string) => {
    const hasSolo = Object.values(solosRef.current).some(v => v)
    const isMuted = mutesRef.current[id] ?? false
    const isSoloed = solosRef.current[id] ?? false
    const savedVol = volumesRef.current[id] ?? DEFAULT_GAIN
    return hasSolo ? (isSoloed ? savedVol : 0) : (isMuted ? 0 : savedVol)
  }, [])

  // RAF 循环：走带位置 + 电平采样 + clip 检测（合并，~60fps）
  const rafTick = useCallback(() => {
    if (!isPlayingRef.current) return
    const elapsed = (performance.now() - startTimeRef.current) / 1000
    const next = Math.min(startOffsetRef.current + elapsed, durationRef.current)
    setCurrentTime(next)

    // 电平采样
    const lv: Record<string, number> = {}
    let newClip = false
    analyserNodesRef.current.forEach((analyser, id) => {
      const buf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)
      let sumSq = 0
      let peak = 0
      for (let i = 0; i < buf.length; i++) {
        const s = buf[i]
        sumSq += s * s
        const a = Math.abs(s)
        if (a > peak) peak = a
      }
      const rms = Math.sqrt(sumSq / buf.length)
      lv[id] = rms  // post-gain（analyser 在 gain 后），不再 *gain（修 double-gain bug）
      // clip 检测：峰值 ≥1（0dBFS）锁存
      if (peak >= 1.0 && !clipsRef.current[id]) {
        clipsRef.current[id] = true
        newClip = true
      }
    })
    setLevels(lv)
    if (newClip) setClips({ ...clipsRef.current })

    // master 电平 + clip
    if (masterAnalyserRef.current) {
      const mbuf = new Float32Array(masterAnalyserRef.current.fftSize)
      masterAnalyserRef.current.getFloatTimeDomainData(mbuf)
      let mSumSq = 0, mPeak = 0
      for (let i = 0; i < mbuf.length; i++) {
        mSumSq += mbuf[i] * mbuf[i]
        const a = Math.abs(mbuf[i])
        if (a > mPeak) mPeak = a
      }
      setMasterLevel(Math.sqrt(mSumSq / mbuf.length))
      if (mPeak >= 1.0 && !masterClipRef.current) {
        masterClipRef.current = true
        setMasterClip(true)
      }
    }

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

    buffers.forEach((buf, id) => {
      const gain = gains.get(id)
      if (!gain) return
      gain.gain.value = effectiveGain(id)

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
  }, [getCtx, effectiveGain, rafTick])

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

    // master 总线节点
    const masterGain = ctx.createGain()
    masterGain.gain.value = masterVolumeRef.current
    const masterAnalyser = ctx.createAnalyser()
    masterAnalyser.fftSize = 256
    masterGain.connect(masterAnalyser)
    masterAnalyser.connect(ctx.destination)
    masterGainRef.current = masterGain
    masterAnalyserRef.current = masterAnalyser

    const newBuffers = new Map<string, AudioBuffer>()
    const newGains = new Map<string, GainNode>()
    const newAnalysers = new Map<string, AnalyserNode>()
    const newPanners = new Map<string, StereoPannerNode>()
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
        gain.gain.value = DEFAULT_GAIN
        newGains.set(t.id, gain)

        // StereoPannerNode：gain → panner
        const panner = ctx.createStereoPanner()
        panner.pan.value = 0
        gain.connect(panner)
        newPanners.set(t.id, panner)

        // analyser：panner → analyser → masterGain（post-gain post-panner，连 masterGain 保持活跃）
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        panner.connect(analyser)
        analyser.connect(masterGain)
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
    pannerNodesRef.current = newPanners
    // 初始化默认值
    const initVols: Record<string, number> = {}
    const initPans: Record<string, number> = {}
    mixerTracks.forEach(t => {
      volumesRef.current[t.id] = DEFAULT_GAIN
      pansRef.current[t.id] = 0
      initVols[t.id] = DEFAULT_GAIN
      initPans[t.id] = 0
    })
    setVolumes(initVols)
    setPans(initPans)
    clipsRef.current = {}
    masterClipRef.current = false
    setClips({})
    setMasterClip(false)
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
    mutesRef.current = {}
    solosRef.current = {}
  }, [getCtx, stopAllSources])

  const play = useCallback(() => {
    playFromOffset(startOffsetRef.current)
  }, [playFromOffset])

  const pause = useCallback(() => {
    stopAllSources()
    startOffsetRef.current = currentTime
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [currentTime, stopAllSources])

  const stop = useCallback(() => {
    stopAllSources()
    startOffsetRef.current = 0
    isPlayingRef.current = false
    setIsPlaying(false)
    setCurrentTime(0)
  }, [stopAllSources])

  const seek = useCallback((ratio: number) => {
    const newTime = ratio * duration
    startOffsetRef.current = newTime
    setCurrentTime(newTime)
    if (isPlayingRef.current) {
      stopAllSources()
      playFromOffset(newTime)
    }
  }, [duration, stopAllSources, playFromOffset])

  // 回调
  const handleVolume = useCallback((id: string, value: number) => {
    volumesRef.current[id] = value
    setVolumes(prev => ({ ...prev, [id]: value }))
    const g = gainNodesRef.current.get(id)
    if (g && isPlayingRef.current) g.gain.value = effectiveGain(id)
  }, [effectiveGain])

  const handleMasterVolume = useCallback((value: number) => {
    masterVolumeRef.current = value
    setMasterVolume(value)
    if (masterGainRef.current) masterGainRef.current.gain.value = value
  }, [])

  const handleMute = useCallback((id: string, muted: boolean) => {
    mutesRef.current[id] = muted
    setMutes(prev => ({ ...prev, [id]: muted }))
    const gain = gainNodesRef.current.get(id)
    if (gain && isPlayingRef.current) gain.gain.value = effectiveGain(id)
  }, [effectiveGain])

  const handleSolo = useCallback((id: string, soloed: boolean) => {
    solosRef.current[id] = soloed
    setSolos(prev => ({ ...prev, [id]: soloed }))
    if (isPlayingRef.current) {
      gainNodesRef.current.forEach((gain, gid) => {
        gain.gain.value = effectiveGain(gid)
      })
    }
  }, [effectiveGain])

  const handlePan = useCallback((id: string, value: number) => {
    pansRef.current[id] = value
    setPans(prev => ({ ...prev, [id]: value }))
    const p = pannerNodesRef.current.get(id)
    if (p) p.pan.value = value
  }, [])

  const resetClip = useCallback((id: string) => {
    clipsRef.current[id] = false
    setClips(prev => ({ ...prev, [id]: false }))
  }, [])

  const resetMasterClip = useCallback(() => {
    masterClipRef.current = false
    setMasterClip(false)
  }, [])

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
    tracks, mutes, solos, volumes, pans, levels, clips,
    masterVolume, masterLevel, masterClip,
    loadTracks,
    play, pause, stop, seek,
    togglePlay: isPlaying ? pause : play,
    onVolumeChange: handleVolume,
    onMuteToggle: handleMute,
    onSoloToggle: handleSolo,
    onPanChange: handlePan,
    onMasterVolumeChange: handleMasterVolume,
    resetClip, resetMasterClip,
  }
}
