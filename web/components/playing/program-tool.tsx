"use client"

// program 背景轨（1015 开工，1014 方案定稿）：高质量伴奏音频多轨工具
// 架构定稿要点：服务端渲染推流（ffmpeg amix→jack-stdin→幽灵乐手），前端本地不出声（防双声打架）
// ——本组件=遥控器+仪表盘：波形/指针走 socket 房级锚点（program-state 平移 gp-state 模型），
// 本地 decodeAudioData 仅供波形 peaks+伪电平显示；MixerFullscreen/MixerMini 纯受控复用零改动。

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Pause, Play, SkipBack, Square, Trash2, X } from "lucide-react"
import { HoverName } from "@/components/playing/hover-fullname"
import { MixerFullscreen } from "@/components/mixer/mixer-fullscreen"
import { TRACK_COLORS, formatTime, type MixerTrack } from "@/components/mixer/types"
import { extractPeaks } from "@/hooks/useMixerEngine"
import { useJamonyDialog } from "@/components/jamony/dialog"
import type { ProgramData, ProgramMix, ProgramState, ProgramTrack } from "@/lib/chat-socket"

const PROGRAM_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".m4a"]
const PROGRAM_MAX_TRACKS = 8
const PROGRAM_MAX_MB = 10

// ── 波形数据源：fetch 轨文件 → decodeAudioData → peaks（decode 是离线操作，不搭图不出声）──
let decodeCtx: AudioContext | null = null
function getDecodeCtx() {
  if (!decodeCtx) decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return decodeCtx
}

function trackUrl(roomId: string, t: ProgramTrack) {
  return `/api/rooms/${roomId}/program/files/${t.file}`
}

function useProgramTracks(roomId: string, program: ProgramData) {
  const [mixerTracks, setMixerTracks] = useState<MixerTrack[]>([])
  const [progress, setProgress] = useState(100)
  // 轨集签名（id 列表）变化才重新 decode；mix 变化不重 decode
  const sig = (program?.tracks || []).map(t => t.id).join(",")
  const sigRef = useRef("")
  useEffect(() => {
    const tracks = program?.tracks || []
    if (!tracks.length) { setMixerTracks([]); setProgress(100); sigRef.current = ""; return }
    if (sigRef.current === sig && mixerTracks.length === tracks.length) return
    sigRef.current = sig
    let cancelled = false
    setProgress(0)
    const ctx = getDecodeCtx()
    ;(async () => {
      const out: MixerTrack[] = []
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i]
        const mt: MixerTrack = {
          id: t.id, name: t.name, instrument: "🎵",
          wavUrl: trackUrl(roomId, t), duration: 0, color: TRACK_COLORS[i % TRACK_COLORS.length],
        }
        try {
          const res = await fetch(mt.wavUrl)
          if (!res.ok) throw new Error(String(res.status))
          const buf = await res.arrayBuffer()
          const audio = await ctx.decodeAudioData(buf)
          if (cancelled) return
          mt.duration = audio.duration
          mt.peaks = extractPeaks(audio, 400)
        } catch (e) {
          console.error("program track decode fail:", t.name, e)
          mt.duration = 0
          mt.peaks = []
        }
        out.push(mt)
        if (!cancelled) setProgress(Math.round(((i + 1) / tracks.length) * 100))
      }
      if (!cancelled) setMixerTracks(out)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, sig])
  return { mixerTracks, loadingProgress: progress }
}

// ── 指针时钟：playing=服务器锚点(startMs+墙钟 elapsed)；暂停=本地记位 ──
// 钟差说明：startedAt 是服务器钟，本地 Date.now() 直减含双端钟差（通常 <1s，指针显示可接受；
// 要更准接 /api/ping RTT/2 修正——GP 音频级对表那套，这里 MVP 不接，波形指针非采样级诉求）
export function useProgramClock(state: ProgramState | null) {
  const [currentTime, setCurrentTime] = useState(0)
  const pausedAtRef = useRef(0)  // 暂停位置（服务器 pause 不记位置，前端本地锁定——GP 同语义）
  const lastPlayingRef = useRef(false)
  useEffect(() => {
    if (!state || !state.playing) {
      if (lastPlayingRef.current) pausedAtRef.current = currentTime  // 播→停瞬间锁定指针
      lastPlayingRef.current = false
      return
    }
    lastPlayingRef.current = true
    let raf = 0
    const tick = () => {
      const st = state
      const t = (st.startMs || 0) + (Date.now() - new Date(st.startedAt || 0).getTime())
      setCurrentTime(Math.min(Math.max(0, t), st.totalMs || t))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.playing, state?.startedAt, state?.startMs, state?.totalMs])
  const setPausedAt = useCallback((ms: number) => { pausedAtRef.current = ms; setCurrentTime(ms) }, [])
  return { currentTime, pausedAtRef, setPausedAt }
}

// ── Stage：program 版混音器全屏弹层，playing-page 挂载 ──
// 1016 欢哥定稿：浮窗 mini 已废——常驻走带条（ProgramTransportBar）在左栏列表下方，全屏混音器缩小=收起（条仍在）
export function ProgramStage(props: {
  roomId: string
  program: ProgramData
  progState: ProgramState | null
  open: boolean
  canOperate: boolean
  onClose: () => void
  playProgram: (startMs?: number) => void
  pauseProgram: () => void
  stopProgram: () => void
  updateProgramMix: (mix: ProgramMix) => void
}) {
  const { roomId, program, progState, open, canOperate } = props
  const dialog = useJamonyDialog()
  const { mixerTracks, loadingProgress } = useProgramTracks(roomId, program)
  const { currentTime, pausedAtRef, setPausedAt } = useProgramClock(progState)
  const totalMs = progState?.totalMs || Math.max(0, ...mixerTracks.map(t => t.duration * 1000), 0)
  const playing = !!(progState && progState.playing)

  const mix = program?.mix || { vols: {}, mutes: [], solos: [], pans: {}, master: 100 }
  const solos = mix.solos || []
  const pans = mix.pans || {}
  const masterGain = (mix.master ?? 100) / 100
  const hasSolo = solos.length > 0

  // 消波锁存（1016 四功能：对齐录音混音器——峰值≥1(0dBFS) 灯亮锁存，手动点灭；伪电平源=peaks，ref 防闭包）
  const [clips, setClips] = useState<Record<string, boolean>>({})
  const [masterClip, setMasterClip] = useState(false)
  const clipsRef = useRef<Record<string, boolean>>({})
  const masterClipRef = useRef(false)
  const handleResetClip = (trackId: string) => { delete clipsRef.current[trackId]; setClips({ ...clipsRef.current }) }
  const handleResetMasterClip = () => { masterClipRef.current = false; setMasterClip(false) }

  // 伪电平：波形 peaks 即电平源（本地不出声，analyser 无从谈起；指针扫到哪段取该段峰值=与真实内容一致）
  // solo 规则=录音 effectiveGain 同款：有 solo 只显 solo 轨；master=各轨功率合成（RMS 平方和开方）× 总增益
  const levels: Record<string, number> = {}
  let masterSq = 0
  if (playing) {
    for (const t of mixerTracks) {
      if (!t.peaks || !t.peaks.length) continue
      const audible = hasSolo ? solos.includes(t.id) : !mix.mutes.includes(t.id)
      if (!audible) continue
      const idx = Math.min(t.peaks.length - 1, Math.floor((currentTime / (totalMs || 1)) * t.peaks.length))
      const vol = (mix.vols[t.id] ?? 100) / 100
      const lv = (t.peaks[idx] || 0) * vol
      levels[t.id] = lv
      masterSq += lv * lv
    }
  }
  const masterLevel = Math.sqrt(masterSq) * masterGain

  // clip 检测（effect 随指针每帧跑，锁存只翻转时 set 不风暴）
  useEffect(() => {
    if (!playing) return
    let hit = false
    for (const [id, lv] of Object.entries(levels)) {
      if (lv >= 1 && !clipsRef.current[id]) { clipsRef.current[id] = true; hit = true }
    }
    if (hit) setClips({ ...clipsRef.current })
    if (masterLevel >= 1 && !masterClipRef.current) { masterClipRef.current = true; setMasterClip(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, playing])

  const mutes: Record<string, boolean> = {}
  const solosMap: Record<string, boolean> = {}
  const volumes: Record<string, number> = {}
  const pansMap: Record<string, number> = {}
  for (const t of program?.tracks || []) {
    mutes[t.id] = mix.mutes.includes(t.id)
    solosMap[t.id] = solos.includes(t.id)
    volumes[t.id] = (mix.vols[t.id] ?? 100) / 100  // 100=0dB 原声；上限 200=+6dB（1016 对齐录音推子量程）
    pansMap[t.id] = pans[t.id] ?? 0
  }

  // mix 全量补丁（updateProgramMix 发全量，后动作胜出；solos/pans/master 兜底默认值防丢字段）
  const mixPatch = (partial: Partial<ProgramMix>): ProgramMix => ({
    vols: mix.vols, mutes: mix.mutes, solos, pans, master: mix.master ?? 100, ...partial,
  })

  const handlePlayPause = () => {
    if (!canOperate) return
    if (playing) props.pauseProgram()
    else props.playProgram(pausedAtRef.current)
  }
  const handleStop = () => {
    if (!canOperate) return
    props.stopProgram()
    setPausedAt(0)
  }
  const handleSeek = (ratio: number) => {
    if (!canOperate) return
    const ms = Math.round(ratio * totalMs)
    if (playing) props.playProgram(ms)  // 播放中 seek=服务器 -ss 重 spawn（接缝~1s，mix 同款重启路径）
    else setPausedAt(ms)
  }
  const handleVolume = (trackId: string, gain: number) => {
    if (!canOperate || !program) return
    props.updateProgramMix(mixPatch({ vols: { ...mix.vols, [trackId]: Math.round(Math.min(2, Math.max(0, gain)) * 100) } }))
  }
  const handleMute = (trackId: string, muted: boolean) => {
    if (!canOperate || !program) return
    // M/S 同轨互斥（1016 欢哥：DAW 惯例——开 M 自动解除该轨 S，反之亦然，一键直达目标态）
    props.updateProgramMix(mixPatch({
      mutes: muted ? [...new Set([...mix.mutes, trackId])] : mix.mutes.filter(m => m !== trackId),
      solos: muted ? solos.filter(m => m !== trackId) : solos,
    }))
  }
  const handleSolo = (trackId: string, soloed: boolean) => {
    if (!canOperate || !program) return
    props.updateProgramMix(mixPatch({
      solos: soloed ? [...new Set([...solos, trackId])] : solos.filter(m => m !== trackId),
      mutes: soloed ? mix.mutes.filter(m => m !== trackId) : mix.mutes,
    }))
  }
  const handlePan = (trackId: string, pan: number) => {
    if (!canOperate || !program) return
    props.updateProgramMix(mixPatch({ pans: { ...pans, [trackId]: Math.max(-1, Math.min(1, pan)) } }))
  }
  const handleMaster = (gain: number) => {
    if (!canOperate) return
    props.updateProgramMix(mixPatch({ master: Math.round(Math.min(2, Math.max(0, gain)) * 100) }))
  }

  if (!open || !program || !program.tracks.length) return null
  const seekSec = currentTime / 1000
  return (
    <MixerFullscreen
      sessionLabel="Program Mixer"
      tracks={mixerTracks}
      isOpen
      isPlaying={playing}
      currentTime={seekSec}
      duration={totalMs / 1000}
      progress={totalMs > 0 ? currentTime / totalMs : 0}
      loadingProgress={loadingProgress}
      mutes={mutes}
      solos={solosMap}
      levels={levels}
      volumes={volumes}
      pans={pansMap}
      clips={clips}
      masterVolume={masterGain}
      masterLevel={masterLevel}
      masterClip={masterClip}
      onClose={props.onClose}
      onMinimize={props.onClose}  // 缩小=收起全屏（左栏走带条常驻，1016）
      onPlayPause={handlePlayPause}
      onStop={handleStop}
      onSeek={handleSeek}
      onVolumeChange={handleVolume}
      onMuteToggle={handleMute}
      onSoloToggle={handleSolo}
      onPanChange={handlePan}
      onResetClip={handleResetClip}
      onMasterVolumeChange={handleMaster}
      onResetMasterClip={handleResetMasterClip}
      icon={false}
      titleLabel=""
      footerHint="播放由服务器渲染并推流至全房间；音量/静音调整实时同步（播放中调整将接缝续播）。"
    />
  )
}

// ── 常驻走带控制条（1016 欢哥定稿：mini 从浮窗改固定组件，列表框下方；本身=控制混音器走带的入口）──
// 秀气迷你：回到开头 / 播放暂停 / 停止 / 时间(正叙/总长) / 可点拖进度条；自跑时钟（rAF 只重渲染本条）
function ProgramTransportBar({ progState, canOperate, trackCount, totalMsHint, playProgram, pauseProgram, stopProgram }: {
  progState: ProgramState | null
  canOperate: boolean
  trackCount: number
  totalMsHint?: number
  playProgram: (startMs?: number) => void
  pauseProgram: () => void
  stopProgram: () => void
}) {
  const { currentTime, pausedAtRef, setPausedAt } = useProgramClock(progState)
  const [lastTotal, setLastTotal] = useState(0)  // stop 后 progState 清了仍显示总长（记住最近一次）
  useEffect(() => { if (progState?.totalMs) setLastTotal(progState.totalMs) }, [progState?.totalMs])
  const playing = !!(progState && progState.playing)
  // 总长三级来源：走带态下发 > 记住的最近值 > 物料自带（1016：上传即随物料下发，未播过也有）
  const totalMs = progState?.totalMs || lastTotal || totalMsHint || 0
  const progress = totalMs > 0 ? Math.min(1, currentTime / totalMs) : 0
  const barRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)
  const seekTo = (clientX: number) => {
    const el = barRef.current
    if (!el || !canOperate || totalMs <= 0) return
    const rect = el.getBoundingClientRect()
    const ms = Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * totalMs)
    if (playing) playProgram(ms)  // 播放中 seek=服务器 -ss 重 spawn
    else setPausedAt(ms)
  }
  useEffect(() => {
    const move = (e: PointerEvent) => { if (dragRef.current) seekTo(e.clientX) }
    const up = () => { dragRef.current = false }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
  })
  const btnBase = "grid place-items-center rounded-full transition-colors disabled:opacity-30"
  return (
    <div className="flex shrink-0 flex-col gap-1.5 rounded-[8px] border px-2 py-1.5" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
      {/* 行1：走带按钮 + 时间 */}
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="回到开头" title="回到开头" disabled={!canOperate || trackCount === 0}
          onClick={() => (playing ? playProgram(0) : setPausedAt(0))}
          className={`${btnBase} size-5 hover:bg-white/10`} style={{ color: "#AAA" }}>
          <SkipBack size={12} fill="currentColor" />
        </button>
        <button type="button" aria-label={playing ? "暂停" : "播放"} title={playing ? "暂停" : "播放"} disabled={!canOperate || trackCount === 0}
          onClick={() => (playing ? pauseProgram() : playProgram(pausedAtRef.current))}
          className={`${btnBase} size-5 hover:bg-white/10`} style={{ color: "#AAA" }}>
          {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" aria-label="停止" title="停止" disabled={!canOperate || !playing}
          onClick={() => { stopProgram(); setPausedAt(0) }}
          className={`${btnBase} size-5 hover:bg-white/10`} style={{ color: "#AAA" }}>
          <Square size={10} fill="currentColor" />
        </button>
        <span className="shrink-0 font-mono text-[10px] tabular-nums" style={{ color: "#DDD" }}>
          {formatTime(currentTime / 1000)}
          <span className="opacity-50"> / {totalMs > 0 ? formatTime(totalMs / 1000) : "--:--"}</span>
        </span>
      </div>
      {/* 行2：进度条独占全宽（1016 欢哥：拆两行换大进度条，点拖更顺手） */}
      <div ref={barRef} role="slider" aria-label="进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
        className="relative h-1.5 w-full cursor-pointer rounded-full" style={{ background: "#2A2A2A" }}
        onPointerDown={(e) => { dragRef.current = true; seekTo(e.clientX) }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress * 100}%`, background: "#9933FF" }} />
      </div>
    </div>
  )
}

// ── Panel：左栏魔盒面板（上传/轨管理/入口）──
export function ProgramPanel(props: {
  roomId: string
  program: ProgramData
  progState: ProgramState | null
  error: { msg: string; ts: number } | null
  canOperate: boolean
  onOpenMixer: () => void
  playProgram: (startMs?: number) => void
  pauseProgram: () => void
  stopProgram: () => void
}) {
  const dialog = useJamonyDialog()
  const { roomId, program, progState, error, canOperate } = props
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const tracks = program?.tracks || []
  const playing = !!(progState && progState.playing)

  const pick = (list: FileList | null) => {
    if (!list || !list.length) return
    setLocalErr(null)
    if (tracks.length + list.length > PROGRAM_MAX_TRACKS) { setLocalErr(`最多 ${PROGRAM_MAX_TRACKS} 轨（当前 ${tracks.length} 轨）`); return }
    for (const f of Array.from(list)) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase()
      if (!PROGRAM_EXTS.includes(ext)) { setLocalErr(`不支持的格式：${f.name}（${PROGRAM_EXTS.join("/")}）`); return }
      if (f.size > PROGRAM_MAX_MB * 1024 * 1024) { setLocalErr(`「${f.name}」超过 ${PROGRAM_MAX_MB}MB（建议用 mp3）`); return }
    }
    const fd = new FormData()
    Array.from(list).forEach(f => fd.append("files", f))
    setBusy(true)
    fetch(`/api/rooms/${roomId}/program/tracks`, { method: "POST", body: fd })
      .then(r => r.json())
      .then(j => { if (!j.ok) setLocalErr(j.msg || "上传失败") })
      .catch(() => setLocalErr("上传失败，请重试"))
      .finally(() => setBusy(false))
  }

  const del = async (tid: string) => {
    setLocalErr(null); setBusy(true)
    try {
      const r = await fetch(`/api/rooms/${roomId}/program/tracks/${tid}`, { method: "DELETE" })
      const j = await r.json()
      if (!j.ok) setLocalErr(j.msg || "删除失败")
    } catch { setLocalErr("删除失败") }
    setBusy(false)
  }

  const clearAll = async () => {
    if (!(await dialog.confirm("清空全部伴奏轨？", { danger: true, confirmText: "清空" }))) return
    setLocalErr(null); setBusy(true)
    try {
      const r = await fetch(`/api/rooms/${roomId}/program`, { method: "DELETE" })
      const j = await r.json()
      if (!j.ok) setLocalErr(j.msg || "清空失败")
    } catch { setLocalErr("清空失败") }
    setBusy(false)
  }

  // 错误条（socket program-error 4s 自动消失）
  const [errVisible, setErrVisible] = useState(false)
  useEffect(() => {
    if (!error) return
    setErrVisible(true)
    const t = setTimeout(() => setErrVisible(false), 4000)
    return () => clearTimeout(t)
  }, [error?.ts])
  const errMsg = localErr || (errVisible && error ? error.msg : null)

  return (
    <div className="flex h-full flex-col gap-2 py-1">
      {/* 提示条（错误/成功，照 ScorePanel 顶部条位置；出错才占位） */}
      {errMsg && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          <span className="flex-1">{errMsg}</span>
          <button type="button" onClick={() => { setLocalErr(null); setErrVisible(false) }} aria-label="关闭提示"><X size={12} className="mt-0.5" /></button>
        </div>
      )}

      {/* 顶部三按钮：上传 + 清空 + 混音器（1016 欢哥定稿：混音器聚顶，播放撤下另有安排） */}
      <input ref={fileRef} type="file" multiple hidden accept={PROGRAM_EXTS.join(",")} onChange={e => { pick(e.target.files); e.target.value = "" }} />
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || !canOperate}
          className="rounded-[6px] border py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "#3A3A3A", color: "#E0E0E0" }}>
          {busy ? "上传中…" : "⬆ 上传"}
        </button>
        <button type="button" onClick={clearAll} disabled={busy || !tracks.length || !canOperate}
          className="rounded-[6px] border py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "#3A3A3A", color: "#E0E0E0" }}>
          清空
        </button>
        <button type="button" onClick={props.onOpenMixer} disabled={!tracks.length}
          className="rounded-[6px] border py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-40"
          style={{ borderColor: "#3A3A3A", color: "#E0E0E0" }}>
          混音器
        </button>
      </div>
      {/* 格式说明一行（照乐谱共享：一行不折，只留代表性枚举） */}
      <p className="shrink-0 whitespace-nowrap text-center text-[10px]" style={{ color: "#666" }}>
        支持mp3/wav等格式 · 单个≤10MB · 最多8轨
      </p>

      {/* 轨列表框（照乐谱共享列表框：同容器/行分隔/空态样式） */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border scrollbar-thin" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
        {tracks.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] leading-relaxed" style={{ color: "#8A8A8A" }}>
            还没有伴奏轨<br />上传的音频都在这里，按「播放」全屋同响
          </p>
        ) : tracks.map((t, i) => (
          <div key={t.id}
            className="group relative flex cursor-default items-center gap-1.5 border-b px-2 py-1.5 transition-colors last:border-b-0 hover:bg-white/5"
            style={{ borderColor: "#222" }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
            <HoverName full={t.name}
              base={t.name.slice(0, t.name.lastIndexOf(".")) || t.name}
              ext={t.name.includes(".") ? t.name.slice(t.name.lastIndexOf(".")).toLowerCase() : ""}
              first={i === 0}>
              <p className="truncate text-[10px]" style={{ color: "#6A6A6A" }}>
                {t.uploadedByName || "乐手"} · {(t.size / 1024 / 1024).toFixed(1)}MB
              </p>
            </HoverName>
            {/* 行内按钮组：下载 + 删除（1016 欢哥：结构照乐谱共享同款） */}
            <a href={`/api/rooms/${roomId}/program/download/${t.id}`} title="下载" onClick={e => e.stopPropagation()}
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-white/45 transition-colors hover:bg-white/10 hover:text-white">
              <Download className="size-3" />
            </a>
            {canOperate && (
              <button type="button" onClick={() => del(t.id)} disabled={busy} aria-label={`删除 ${t.name}`} title="删除"
                className="grid size-6 shrink-0 place-items-center rounded-[6px] text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-20">
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 常驻走带控制条（1016 欢哥定稿：替代独立停止按钮；听众只读显示；有轨即常可点，直接开播不必先进混音器） */}
      <ProgramTransportBar progState={progState} canOperate={canOperate} trackCount={tracks.length} totalMsHint={program?.totalMs}
        playProgram={props.playProgram} pauseProgram={props.pauseProgram} stopProgram={props.stopProgram} />
      {!canOperate && tracks.length > 0 && (
        <p className="shrink-0 text-[10px]" style={{ color: "#666" }}>播放与混音由房间内合奏者操作</p>
      )}
    </div>
  )
}
