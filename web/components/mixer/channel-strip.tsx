"use client"

import type React from "react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MIXER_COLORS } from "./types"

interface ChannelStripProps {
  id: string
  name: string
  instrument: React.ReactNode
  color: string
  isMaster?: boolean
  playing: boolean
  /** 实时电平 RMS 0~1 */
  level?: number
  /** 推子增益 gain（线性，0~2，1=0dB）—— 从引擎 state 读 */
  volume?: number
  /** 声像 -1~1 —— 引擎 state */
  pan?: number
  muted?: boolean
  soloed?: boolean
  clipped?: boolean
  onVolumeChange?: (id: string, value: number) => void
  onPanChange?: (id: string, value: number) => void
  onMuteToggle?: (id: string, muted: boolean) => void
  onSoloToggle?: (id: string, soloed: boolean) => void
  onResetClip?: (id: string) => void
}

// ===== dB 工具（Cubase 式：标尺 +6~-60dB，gain 对数）=====
const MIN_DB = -60
const MAX_DB = 6
const DB_SPAN = MAX_DB - MIN_DB  // 66

/** dB → 槽内位置%（+6=100%, 0≈91%, -60=0%）线性 dB 刻度 */
function dbToPercent(db: number): number {
  return ((db - MIN_DB) / DB_SPAN) * 100
}
/** gain（线性）→ dB */
function gainToDB(gain: number): number {
  return gain <= 0.0001 ? MIN_DB : 20 * Math.log10(gain)
}
/** dB → gain（线性） */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}
/** RMS → dBFS（-60~0，>0 不 clamp 留给消波） */
function rmsToDBFS(rms: number): number {
  return rms <= 0.000001 ? MIN_DB : 20 * Math.log10(rms)
}

/** Cubase 风格刻度 */
const DB_TICKS = [
  { db: 6, label: "+6" },
  { db: 0, label: "0" },
  { db: -6, label: "-6" },
  { db: -12, label: "-12" },
  { db: -18, label: "-18" },
  { db: -24, label: "-24" },
  { db: -36, label: "-36" },
  { db: -48, label: "-48" },
  { db: -60, label: "-60" },
]

/** 横向声相滑块，-1~1 */
function PanSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    onChange(Math.min(1, Math.max(-1, ratio * 2 - 1)))
  }, [onChange])

  useEffect(() => {
    const move = (e: PointerEvent) => { if (draggingRef.current) updateFromClientX(e.clientX) }
    const up = () => { draggingRef.current = false }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
  }, [updateFromClientX])

  const pct = (value + 1) / 2
  return (
    <div ref={trackRef} className="relative h-1.5 w-full cursor-ew-resize rounded-full"
      style={{ background: "#0e0e0e", boxShadow: "inset 0 0 0 1px #333" }}
      onPointerDown={(e) => { draggingRef.current = true; updateFromClientX(e.clientX) }}>
      <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2" style={{ background: "#555" }} />
      <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${pct * 100}%`, background: MIXER_COLORS.pink, boxShadow: `0 0 6px ${MIXER_COLORS.pink}88` }} />
    </div>
  )
}

/** Cubase 风格推子+电平一体槽：左 dB 刻度，右电平+推子（dB 绑定） */
function FaderMeter({
  volume, onChange, playing, muted, clipped, onResetClip, accent, level = 0,
}: {
  volume: number
  onChange: (gain: number) => void
  playing: boolean
  muted: boolean
  clipped: boolean
  onResetClip: () => void
  accent: string
  level?: number
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // 电平：RMS → dBFS → 位置%
  const rms = (!playing || muted) ? 0 : Math.max(0, level)
  const meterDB = rmsToDBFS(rms)
  const meterPercent = Math.max(0, Math.min(100, dbToPercent(meterDB)))

  // 推子：gain → dB → 位置%
  const faderDB = gainToDB(volume)
  const faderPercent = Math.max(0, Math.min(100, dbToPercent(faderDB)))

  // 拖动：clientY → ratio(0-1) → dB → gain
  const updateFromClientY = useCallback((clientY: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = 1 - (clientY - rect.top) / rect.height
    const db = MIN_DB + Math.max(0, Math.min(1, ratio)) * DB_SPAN
    onChange(dbToGain(db))
  }, [onChange])

  useEffect(() => {
    const move = (e: PointerEvent) => { if (draggingRef.current) updateFromClientY(e.clientY) }
    const up = () => { draggingRef.current = false }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
  }, [updateFromClientY])

  return (
    <div className="flex h-full flex-col items-center">
      <div className="flex min-h-0 flex-1 gap-0.5">
        {/* 左列：消波灯占位 + dB 刻度（flex-1 和推子槽对齐） */}
        <div className="flex w-3 shrink-0 flex-col">
          <div className="mb-[2px] h-2 shrink-0" />
          <div className="relative flex-1">
            {DB_TICKS.map((tick) => {
              const top = 100 - dbToPercent(tick.db)
              return (
                <div key={tick.db}>
                  <div className="absolute right-0 h-px" style={{ top: `${top}%`, width: 6, background: tick.db === 0 ? "#888" : "#444" }} />
                  <span className="absolute right-[7px] -translate-y-1/2 font-mono" style={{ top: `${top}%`, color: tick.db === 0 ? "#999" : "#666", fontSize: 7, lineHeight: "7px" }}>
                    {tick.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 右列：消波灯 + 推子槽 */}
        <div className="flex flex-1 flex-col items-center">
          {/* 消波灯（突破0dBFS 点亮红灯，手动点灭） */}
          <button type="button" onClick={onResetClip}
            className="mb-[2px] h-2 w-5 shrink-0 rounded-sm transition-colors"
            style={{ background: clipped ? MIXER_COLORS.red : "#1a1a1a", boxShadow: clipped ? `0 0 6px ${MIXER_COLORS.red}` : "inset 0 0 0 1px #333" }}
            aria-label={clipped ? "已消波，点击复位" : "消波指示"} aria-pressed={clipped} />

          {/* 推子槽（电平条 + 推子手柄共享 dB 标尺；overflow-visible 手柄不裁） */}
          <div ref={trackRef} className="relative flex-1 w-6 cursor-ns-resize overflow-visible rounded-sm"
            style={{ background: "#0c0c0c", boxShadow: "inset 0 0 0 1px #2c2c2c" }}
            onPointerDown={(e) => { draggingRef.current = true; updateFromClientY(e.clientY) }}>
            {/* 电平条（底部向上，蓝→绿→黄；无 transition 避免 60fps 卡顿） */}
            <div className="absolute inset-x-0 bottom-0 overflow-hidden rounded-sm" style={{
              height: `${meterPercent}%`,
              background: `linear-gradient(to top, ${MIXER_COLORS.blue}, ${MIXER_COLORS.green} 55%, ${MIXER_COLORS.yellow} 80%)`,
            }} />
            {/* 0dB 参考线 */}
            <div className="pointer-events-none absolute inset-x-0 h-px" style={{ bottom: `${dbToPercent(0)}%`, background: "#666" }} />
            {/* 推子手柄（位置 = gain 的 dB 位置，电平不超过此高度） */}
            <div className="absolute left-1/2 h-3 w-[14px] rounded-sm"
              style={{ bottom: `${faderPercent}%`, transform: "translateX(-50%) translateY(50%)", background: "#e8e8e8", boxShadow: "0 1px 4px rgba(0,0,0,0.7)" }}>
              <div className="absolute left-1/2 top-1/2 h-px w-2.5 -translate-x-1/2 -translate-y-1/2" style={{ background: accent }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChannelStripImpl({
  id, name, instrument, color, isMaster = false, playing,
  level, volume = 1, pan = 0, muted = false, soloed = false, clipped = false,
  onVolumeChange, onPanChange, onMuteToggle, onSoloToggle, onResetClip,
}: ChannelStripProps) {
  const [editingPan, setEditingPan] = useState(false)
  const [panDraft, setPanDraft] = useState("")

  // M/S 互斥：点 M 关 S，点 S 关 M
  const toggleMute = () => {
    const next = !muted
    onMuteToggle?.(id, next)
    if (next && soloed) onSoloToggle?.(id, false)
  }
  const toggleSolo = () => {
    const next = !soloed
    onSoloToggle?.(id, next)
    if (next && muted) onMuteToggle?.(id, false)
  }

  const handleVolume = (gain: number) => onVolumeChange?.(id, gain)
  const handlePan = (v: number) => onPanChange?.(id, v)

  const commitPan = () => {
    setEditingPan(false)
    const raw = panDraft.trim().toUpperCase()
    let n: number
    if (raw === "C" || raw === "") n = 0
    else if (raw.startsWith("L")) n = -Math.abs(Number.parseFloat(raw.slice(1)) || 0)
    else if (raw.startsWith("R")) n = Math.abs(Number.parseFloat(raw.slice(1)) || 0)
    else n = Number.parseFloat(raw)
    if (!Number.isFinite(n)) return
    handlePan(Math.min(1, Math.max(-1, n / 100)))
  }

  const panLabel = pan === 0 ? "C" : pan < 0 ? `L${Math.round(-pan * 100)}` : `R${Math.round(pan * 100)}`
  const faderDB = gainToDB(volume)

  return (
    <div className="flex h-full shrink-0 flex-col items-center gap-2 rounded-lg px-2 py-3"
      style={{ width: isMaster ? 96 : 72, background: isMaster ? "#15151f" : MIXER_COLORS.panel, boxShadow: `inset 0 0 0 1px ${isMaster ? MIXER_COLORS.purple + "55" : "#2a2a2a"}` }}>
      {/* dB 值（推子增益 dB） */}
      <div className="rounded px-1 font-mono text-[10px] tabular-nums" style={{ color: MIXER_COLORS.textMuted }}>
        {volume <= 0.0001 ? "-∞" : `${faderDB > 0 ? "+" : ""}${faderDB.toFixed(1)}`}
      </div>

      {/* 推子 + 电平一体槽 */}
      <div className="flex min-h-0 flex-1 items-stretch justify-center">
        <FaderMeter
          volume={volume}
          onChange={handleVolume}
          playing={playing}
          muted={muted}
          clipped={clipped}
          onResetClip={() => onResetClip?.(id)}
          accent={color}
          level={level}
        />
      </div>

      {/* 声像 */}
      <div className="w-full px-0.5">
        <PanSlider value={pan} onChange={handlePan} />
        <div className="mt-1 flex justify-center">
          {editingPan ? (
            <input autoFocus value={panDraft}
              onChange={(e) => setPanDraft(e.target.value)}
              onBlur={commitPan}
              onKeyDown={(e) => { if (e.key === "Enter") commitPan(); if (e.key === "Escape") setEditingPan(false) }}
              className="w-12 rounded bg-black px-1 py-0.5 text-center font-mono text-[9px] outline-none"
              style={{ color: MIXER_COLORS.text, boxShadow: `0 0 0 1px ${MIXER_COLORS.pink}` }}
              aria-label="输入声相，例如 C、L50、R30" />
          ) : (
            <button type="button" onClick={() => { setPanDraft(panLabel); setEditingPan(true) }}
              className="rounded text-center font-mono text-[9px] transition-colors hover:bg-white/10"
              style={{ color: MIXER_COLORS.textMuted, padding: "1px 4px" }} title="点击手动输入声相">
              {panLabel}
            </button>
          )}
        </div>
      </div>

      {/* M / S（互斥）或 MAIN */}
      {!isMaster ? (
        <div className="flex w-full gap-1">
          <button type="button" onClick={toggleMute} className="flex-1 rounded py-1 text-[11px] font-bold transition-colors"
            style={{ background: muted ? MIXER_COLORS.red : "#262626", color: muted ? "#fff" : MIXER_COLORS.textMuted }}
            aria-pressed={muted} aria-label="静音">M</button>
          <button type="button" onClick={toggleSolo} className="flex-1 rounded py-1 text-[11px] font-bold transition-colors"
            style={{ background: soloed ? MIXER_COLORS.green : "#262626", color: soloed ? "#121212" : MIXER_COLORS.textMuted }}
            aria-pressed={soloed} aria-label="独奏">S</button>
        </div>
      ) : (
        <div className="w-full rounded py-1 text-center text-[11px] font-bold" style={{ background: "#262626", color: MIXER_COLORS.purple }}>MAIN</div>
      )}

      {/* 轨道名 */}
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="text-base leading-none">{instrument}</span>
        <span className="w-full truncate text-center text-[10px]" style={{ color: MIXER_COLORS.text }}>{isMaster ? "Master" : name}</span>
      </div>
    </div>
  )
}

export const ChannelStrip = memo(ChannelStripImpl)
