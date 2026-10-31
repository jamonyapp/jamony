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

/** 草稿参数（1026 按 session 分仓 localStorage；M/S 不入草稿——试听工具不跨会话残留）
    1031 定位器重构：区间常驻+开关独立——老草稿 locator.b 可为 null=曲尾，载入时折算；
    locatorActive 缺省=false（老草稿自动落到关）。 */
export interface MixerDraft {
  volumes?: Record<string, number>
  pans?: Record<string, number>
  master?: number
  locator?: { a: number; b: number | null } | null
  locatorActive?: boolean
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

  // 定位器（1031 Cubase 式重构，欢哥定稿三轴解耦）：
  // 区间 {A,B} 常驻（默认折叠在 0，拖 B 向右拉开）——只是「告诉播放器范围」；
  // locatorActive=独立开关（细条点击）——关=区间单纯指示，不参与任何播放约束；
  // loop 归播放引擎——定位器开=循环选区，定位器关=循环整曲。
  const [locator, setLocator] = useState<{ a: number; b: number }>({ a: 0, b: 0 })
  const [locatorActive, setLocatorActiveState] = useState(false)
  const [loop, setLoopState] = useState(false)

  // ref（避免闭包 + seek 恢复）
  const volumesRef = useRef<Record<string, number>>({})
  const pansRef = useRef<Record<string, number>>({})
  const mutesRef = useRef<Record<string, boolean>>({})
  const solosRef = useRef<Record<string, boolean>>({})
  const masterVolumeRef = useRef(DEFAULT_GAIN)
  const clipsRef = useRef<Record<string, boolean>>({})
  const masterClipRef = useRef(false)
  const locatorRef = useRef<{ a: number; b: number }>({ a: 0, b: 0 })
  const locatorActiveRef = useRef(false)
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
    // 1031 行为矩阵（欢哥定稿，三轴独立）：区间生效 = 开关开 ∧ B>A ∧ 本趟起点在 B 之前
    // （从选区外播进来也算「进入」）；生效则本趟终点=B，否则终点=曲尾。
    // 指针在 B 之后=选区已过，正常播到曲尾。区间拖动中 B 值实时更新=实时收窄生效。
    const lc = locatorRef.current
    const rangeOn = locatorActiveRef.current && lc.b > lc.a && startOffsetRef.current < lc.b
    const endAt = rangeOn ? lc.b : durationRef.current
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
      if (loopRef.current) {
        // 循环回头点=域起点：选区趟回 A（从此锁定选区循环）；整曲趟回 0。
        // 边角1级联（欢哥拍板）：指针在 B 后开播→整曲趟到尾回 0→第二趟起点 0<B
        // 即为选区趟→自然进选区循环，无特判。
        restartRef.current(rangeOn ? lc.a : 0)
        return
      }
      isPlayingRef.current = false
      setIsPlaying(false)
      stopAllSources()  // ⚠️ 音源必须杀：只停 UI 不停声=幽灵发声（1031 欢哥实测选区一shot到B）
      // 归位哲学（欢哥：「指针停在终点没意义」）：一shot播完回域起点——选区趟回 A，整曲趟回 0
      const home = rangeOn ? lc.a : 0
      startOffsetRef.current = home
      setCurrentTime(home)
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
    // 1031 指针解耦（欢哥拍板）：播放起点不再钳制进区间——指针自由放置任意点，
    // 到哪算哪由 rafTick 行为矩阵实时判定（选区趟/整曲趟）。
    offset = Math.max(0, Math.min(offset, durationRef.current))
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

    // 草稿 master 先落 ref；定位器暂存本地变量（区间终值依赖曲长，解码完再定稿）
    if (initial && Number.isFinite(initial.master) && (initial.master as number) > 0) {
      masterVolumeRef.current = initial.master as number
    }
    const draftLoc = (initial && initial.locator) ? { a: initial.locator.a, b: initial.locator.b } : null
    locatorActiveRef.current = !!(initial && initial.locatorActive)
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
    // 定位器定稿（1031）：无草稿=折叠 {0,0}（Cubase 初始态）；老草稿 b=null→曲尾；
    // 折叠态（b=a）合法，仅防倒挂
    if (draftLoc) {
      const da = Math.max(0, Math.min(draftLoc.a, maxDuration))
      const db = Math.max(da, Math.min(draftLoc.b ?? maxDuration, maxDuration))
      locatorRef.current = { a: da, b: db }
    } else {
      locatorRef.current = { a: 0, b: 0 }
    }
    setLocator(locatorRef.current)
    setLocatorActiveState(locatorActiveRef.current)
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
    // 1031 边角3（欢哥拍板）：停止钮一律回开头，与定位器彻底解耦（单键单义）
    startOffsetRef.current = 0
    isPlayingRef.current = false
    setIsPlaying(false)
    setCurrentTime(0)
  }, [stopAllSources])

  const seek = useCallback((ratio: number) => {
    // 1031 指针解耦：波形任意点可点可拖，不再钳制进选区
    const newTime = Math.min(1, Math.max(0, ratio)) * duration
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

  // ───── 定位器 API（1031 Cubase 式重构：区间常驻 {A,B}；开关独立）─────
  // 1031 二轮（欢哥拍板）：0.5s 最小间距废除——B 可拉回与 A 完全重合（任意位置折叠，
  // 两线合一=空选区）；A 亦可折向 B。折叠态 b>a 不成立=零播放约束（rafTick/发表区间同判）。
  const setLocatorA = useCallback((v: number) => {
    const cur = locatorRef.current
    const a = Math.max(0, Math.min(v, cur.b)) // 不越过 B
    locatorRef.current = { a, b: cur.b }
    setLocator(locatorRef.current)
  }, [])

  const setLocatorB = useCallback((v: number) => {
    const cur = locatorRef.current
    const b = Math.max(cur.a, Math.min(v, durationRef.current || 0)) // 不越过 A，不超曲长
    locatorRef.current = { a: cur.a, b }
    setLocator(locatorRef.current)
  }, [])

  // 边角5（欢哥拍板）：细条拖拽=AB 锁定同步平移（保宽度；增量 delta，两端钳制 0/曲尾）
  const moveLocator = useCallback((deltaSec: number) => {
    const cur = locatorRef.current
    const d = durationRef.current || 0
    const shift = Math.max(-cur.a, Math.min(deltaSec, d - cur.b))
    if (shift === 0) return
    locatorRef.current = { a: cur.a + shift, b: cur.b + shift }
    setLocator(locatorRef.current)
  }, [])

  // 开关独立（细条点击，1031 欢哥拍板）：关=区间单纯指示，播放约束全部失效
  const setLocatorActive = useCallback((v: boolean) => {
    locatorActiveRef.current = v
    setLocatorActiveState(v)
  }, [])

  const setLoop = useCallback((v: boolean) => {
    loopRef.current = v
    setLoopState(v)
  }, [])

  /** 复位所有参数（1026 定案+1031 定位器新义）：音量1.0/声像0/总线1.0/M/S清/定位器折叠+开关关/循环关 */
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
    locatorRef.current = { a: 0, b: 0 }
    locatorActiveRef.current = false
    loopRef.current = false
    setVolumes(vols)
    setPans(pns)
    setMutes({})
    setSolos({})
    setMasterVolume(DEFAULT_GAIN)
    setLocator({ a: 0, b: 0 })
    setLocatorActiveState(false)
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
    locator, locatorActive, loop,
    loadTracks,
    play, pause, stop, seek,
    setLocatorA, setLocatorB, moveLocator, setLocatorActive, setLoop, resetAll, getBuffers,
    togglePlay: isPlaying ? pause : play,
    onVolumeChange: handleVolume,
    onMuteToggle: handleMute,
    onSoloToggle: handleSolo,
    onPanChange: handlePan,
    onMasterVolumeChange: handleMasterVolume,
    resetClip, resetMasterClip,
  }
}
