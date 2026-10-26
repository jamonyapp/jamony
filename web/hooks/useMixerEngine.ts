"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { MixerTrack } from "@/components/mixer/types"
import { applyFixedLimiter } from "@/lib/render-mix"

/** 从 AudioBuffer 提取波形峰值，downsample 到 targetCount 点（1015 起 program 背景轨波形共用） */
export function extractPeaks(buf: AudioBuffer, targetCount: number): number[] {
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

/** 草稿参数（1026 按 session 分仓 localStorage；M/S 不入草稿——试听工具不跨会话残留） */
export interface MixerDraft {
  volumes?: Record<string, number>
  pans?: Record<string, number>
  master?: number
  locator?: { a: number; b: number | null } | null
  loop?: boolean
}

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

  // 定位器（1026 Cubase 式）：{a,b} 秒，b=null=到末尾；整体 null=未启用（全曲）
  const [locator, setLocator] = useState<{ a: number; b: number | null } | null>(null)
  // 区间内循环开关
  const [loop, setLoopState] = useState(false)

  // ref（避免闭包 + seek 恢复）
  const volumesRef = useRef<Record<string, number>>({})
  const pansRef = useRef<Record<string, number>>({})
  const mutesRef = useRef<Record<string, boolean>>({})
  const solosRef = useRef<Record<string, boolean>>({})
  const masterVolumeRef = useRef(DEFAULT_GAIN)
  const clipsRef = useRef<Record<string, boolean>>({})
  const masterClipRef = useRef(false)
  const locatorRef = useRef<{ a: number; b: number | null } | null>(null)
  const loopRef = useRef(false)
  // 区间循环重启桥（rafTick 经 ref 调用，避免 useCallback 循环依赖）
  const restartRef = useRef<(offset: number) => void>(() => {})

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
  const levelFrameRef = useRef(0)  // 电平隔帧采样计数（~30fps）
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
    // 定位器生效时终点=区间 B（1026）；区间可拖动中实时收窄生效
    const endAt = locatorRef.current ? (locatorRef.current.b ?? durationRef.current) : durationRef.current
    const next = Math.min(startOffsetRef.current + elapsed, endAt)
    setCurrentTime(next)

    // 电平采样：隔帧 ~30fps（Cubase 等 DAW 主流；60fps 色块跳动过灵敏）。走带位置仍每帧 60fps。
    levelFrameRef.current = (levelFrameRef.current + 1) % 2
    if (levelFrameRef.current === 0) {
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
    }  // end 电平采样 30fps

    if (next >= endAt) {
      if (loopRef.current && locatorRef.current) {
        // 区间循环：回 A 重启（1026 定位器配套）
        restartRef.current(locatorRef.current.a)
        return
      }
      isPlayingRef.current = false
      setIsPlaying(false)
      startOffsetRef.current = locatorRef.current ? locatorRef.current.a : 0
      setCurrentTime(locatorRef.current ? locatorRef.current.a : 0)
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
    // 定位器生效时播放约束在区间内（1026）
    const lc = locatorRef.current
    if (lc) {
      const end = lc.b ?? durationRef.current
      offset = Math.min(Math.max(offset, lc.a), Math.max(lc.a, end - 0.05))
    }
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

  // 区间循环重启桥赋值（rafTick 经 restartRef 调用）
  restartRef.current = (offset: number) => {
    stopAllSources()
    playFromOffset(offset)
  }

  // 加载音轨（initial=草稿参数覆盖，1026 携带试听调整进发表混音器；M/S 永远全新默认）
  const loadTracks = useCallback(async (mixerTracks: MixerTrack[], initial?: MixerDraft) => {
    const ctx = getCtx()
    setLoading(true)
    setLoadProgress(0)
    setLoadError(null)
    setTracks([])
    stopAllSources()
    startOffsetRef.current = 0
    setCurrentTime(0)

    // 草稿 master/定位器先落 ref（总线节点与播放约束读的是 ref）
    if (initial && Number.isFinite(initial.master) && (initial.master as number) > 0) {
      masterVolumeRef.current = initial.master as number
    }
    locatorRef.current = (initial && initial.locator) ? { a: initial.locator.a, b: initial.locator.b } : null
    loopRef.current = !!(initial && initial.loop)

    // master 总线：masterGain → analyser（表头=限幅器前的诚实表头，clip 灯改义「限幅介入指示」）
    // → limiter(fixed-v1 安全限幅器，与 renderMix 离线链同参同位) → destination
    const masterGain = ctx.createGain()
    masterGain.gain.value = masterVolumeRef.current
    const masterAnalyser = ctx.createAnalyser()
    masterAnalyser.fftSize = 256
    const limiter = ctx.createDynamicsCompressor()
    applyFixedLimiter(limiter)
    masterGain.connect(masterAnalyser)
    masterAnalyser.connect(limiter)
    limiter.connect(ctx.destination)
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
    // 初始化默认值 + 草稿覆盖（volumes/pans 按 trackId 对号入座，缺轨键回默认）
    const initVols: Record<string, number> = {}
    const initPans: Record<string, number> = {}
    mixerTracks.forEach(t => {
      const dv = (initial && Number.isFinite(initial.volumes?.[t.id])) ? (initial.volumes![t.id] as number) : DEFAULT_GAIN
      const dp = (initial && Number.isFinite(initial.pans?.[t.id])) ? (initial.pans![t.id] as number) : 0
      volumesRef.current[t.id] = dv
      pansRef.current[t.id] = dp
      initVols[t.id] = dv
      initPans[t.id] = dp
    })
    setVolumes(initVols)
    setPans(initPans)
    setMasterVolume(masterVolumeRef.current)
    setLocator(locatorRef.current)
    setLoopState(loopRef.current)
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
    // 定位器生效时停在区间头（DAW 惯例），否则回 0
    const backTo = locatorRef.current ? locatorRef.current.a : 0
    startOffsetRef.current = backTo
    isPlayingRef.current = false
    setIsPlaying(false)
    setCurrentTime(backTo)
  }, [stopAllSources])

  const seek = useCallback((ratio: number) => {
    let newTime = ratio * duration
    // 定位器生效时 seek 钳制进区间（2026 Cubase 式）
    const lc = locatorRef.current
    if (lc) {
      const end = lc.b ?? duration
      newTime = Math.min(Math.max(newTime, lc.a), Math.max(lc.a, end - 0.05))
    }
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

  // M/S 同轨互斥（1016 欢哥：DAW 惯例对齐 program 混音器——开 M 自动解除该轨 S、反之亦然）
  const handleMute = useCallback((id: string, muted: boolean) => {
    mutesRef.current[id] = muted
    if (muted && solosRef.current[id]) {
      solosRef.current[id] = false
      setSolos(prev => ({ ...prev, [id]: false }))
    }
    setMutes(prev => ({ ...prev, [id]: muted }))
    // 全轨刷 gain：互斥可能改变 solo 集合（hasSolo 翻转影响所有轨的 effectiveGain）
    if (isPlayingRef.current) {
      gainNodesRef.current.forEach((gain, gid) => {
        gain.gain.value = effectiveGain(gid)
      })
    }
  }, [effectiveGain])

  const handleSolo = useCallback((id: string, soloed: boolean) => {
    solosRef.current[id] = soloed
    if (soloed && mutesRef.current[id]) {
      mutesRef.current[id] = false
      setMutes(prev => ({ ...prev, [id]: false }))
    }
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

  // ───── 定位器 API（1026 Cubase 式：双三角 A/B，最小间距 0.5s）─────
  const setLocatorA = useCallback((v: number) => {
    const cur = locatorRef.current
    const d = durationRef.current || 0
    const end = cur?.b ?? d
    const a = Math.max(0, Math.min(v, Math.max(0, end - 0.5)))
    locatorRef.current = { a, b: cur?.b ?? null }
    setLocator(locatorRef.current)
  }, [])

  const setLocatorB = useCallback((v: number) => {
    const cur = locatorRef.current
    const d = durationRef.current || 0
    const a = cur?.a ?? 0
    const b = Math.max(a + 0.5, Math.min(v, d)) // B 不超曲长
    locatorRef.current = { a, b }
    setLocator(locatorRef.current)
  }, [])

  const clearLocator = useCallback(() => {
    locatorRef.current = null
    loopRef.current = false
    setLocator(null)
    setLoopState(false)
  }, [])

  const setLoop = useCallback((v: boolean) => {
    loopRef.current = v
    setLoopState(v)
  }, [])

  /** 复位所有参数（1026 欢哥定案）：音量1.0/声像0/总线1.0/M/S清/定位器清 */
  const resetAll = useCallback(() => {
    const ids = [...buffersRef.current.keys()]
    const vols: Record<string, number> = {}
    const pns: Record<string, number> = {}
    ids.forEach(id => {
      volumesRef.current[id] = DEFAULT_GAIN
      pansRef.current[id] = 0
      vols[id] = DEFAULT_GAIN
      pns[id] = 0
      const g = gainNodesRef.current.get(id)
      if (g) g.gain.value = DEFAULT_GAIN
      const p = pannerNodesRef.current.get(id)
      if (p) p.pan.value = 0
    })
    mutesRef.current = {}
    solosRef.current = {}
    masterVolumeRef.current = DEFAULT_GAIN
    if (masterGainRef.current) masterGainRef.current.gain.value = DEFAULT_GAIN
    locatorRef.current = null
    loopRef.current = false
    setVolumes(vols)
    setPans(pns)
    setMutes({})
    setSolos({})
    setMasterVolume(DEFAULT_GAIN)
    setLocator(null)
    setLoopState(false)
  }, [])

  /** 渲染/区间预检数据源：已解码 buffer 快照（免二次下载，1026） */
  const getBuffers = useCallback(() => new Map(buffersRef.current), [])

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
    locator, loop,
    loadTracks,
    play, pause, stop, seek,
    setLocatorA, setLocatorB, clearLocator, setLoop, resetAll, getBuffers,
    togglePlay: isPlaying ? pause : play,
    onVolumeChange: handleVolume,
    onMuteToggle: handleMute,
    onSoloToggle: handleSolo,
    onPanChange: handlePan,
    onMasterVolumeChange: handleMasterVolume,
    resetClip, resetMasterClip,
  }
}
