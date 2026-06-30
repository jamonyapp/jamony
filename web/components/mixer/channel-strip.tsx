"use client"

import type React from "react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { MIXER_COLORS } from "./types"

interface ChannelStripProps {
  id: string
  name: string
  instrument: string
  color: string
  isMaster?: boolean
  /** 是否在播放（电平条闪烁） */
  playing: boolean
  onVolumeChange?: (id: string, value: number) => void
  onPanChange?: (id: string, value: number) => void
  onMuteToggle?: (id: string, muted: boolean) => void
  onSoloToggle?: (id: string, soloed: boolean) => void
}

/** 横向声相滑块，返回 -1~1 */
function PanSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      onChange(Math.min(1, Math.max(-1, ratio * 2 - 1)))
    },
    [onChange],
  )

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (draggingRef.current) updateFromClientX(e.clientX)
    }
    const up = () => {
      draggingRef.current = false
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [updateFromClientX])

  const pct = (value + 1) / 2

  return (
    <div
      ref={trackRef}
      className="relative h-1.5 w-full cursor-ew-resize rounded-full"
      style={{ background: "#0e0e0e", boxShadow: "inset 0 0 0 1px #333" }}
      onPointerDown={(e) => {
        draggingRef.current = true
        updateFromClientX(e.clientX)
      }}
    >
      {/* 中心刻度 */}
      <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2" style={{ background: "#555" }} />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${pct * 100}%`, background: MIXER_COLORS.pink, boxShadow: `0 0 6px ${MIXER_COLORS.pink}88` }}
      />
    </div>
  )
}

/** 消波(Clipping)阈值：电平峰值超过此值视为失真 */
const CLIP_THRESHOLD = 0.96

/**
 * Cubase 风格推子+电平一体槽：
 * 单一垂直槽内显示跳动电平，推子手柄横跨槽上拖动决定音量，
 * 槽顶有一个独立消波小方块，失真时亮红。
 */
function FaderMeter({
  value,
  onChange,
  playing,
  muted,
  clipped,
  onClip,
  onResetClip,
  accent,
}: {
  value: number
  onChange: (v: number) => void
  playing: boolean
  muted: boolean
  clipped: boolean
  onClip: () => void
  onResetClip: () => void
  accent: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [level, setLevel] = useState(0)
  const onClipRef = useRef(onClip)
  onClipRef.current = onClip

  // 实时电平模拟
  useEffect(() => {
    if (!playing || muted) {
      setLevel(0)
      return
    }
    let raf = 0
    const tick = () => {
      const target = value * (0.4 + Math.random() * 0.6)
      setLevel((prev) => {
        const next = prev + (target - prev) * 0.4
        if (next >= CLIP_THRESHOLD) onClipRef.current()
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, value, muted])

  const updateFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = 1 - (clientY - rect.top) / rect.height
      onChange(Math.min(1, Math.max(0, ratio)))
    },
    [onChange],
  )

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (draggingRef.current) updateFromClientY(e.clientY)
    }
    const up = () => {
      draggingRef.current = false
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [updateFromClientY])

  return (
    <div className="flex h-full flex-col items-center gap-1">
      {/* 顶部独立消波小方块：失真亮红，点击复位 */}
      <button
        type="button"
        onClick={onResetClip}
        className="h-2.5 w-7 shrink-0 rounded-sm transition-colors"
        style={{
          background: clipped ? MIXER_COLORS.red : "#1a1a1a",
          boxShadow: clipped ? `0 0 8px ${MIXER_COLORS.red}` : "inset 0 0 0 1px #333",
        }}
        aria-label={clipped ? "已消波失真，点击复位" : "消波指示，正常"}
        aria-pressed={clipped}
      />

      {/* 推子槽：内部跳动电平 + 横跨手柄 */}
      <div
        ref={trackRef}
        className="relative w-7 flex-1 cursor-ns-resize overflow-hidden rounded-md"
        style={{ background: "#0c0c0c", boxShadow: "inset 0 0 0 1px #2c2c2c" }}
        onPointerDown={(e) => {
          draggingRef.current = true
          updateFromClientY(e.clientY)
        }}
      >
        {/* 电平条（槽内跳动）：蓝→绿→黄渐变，填充不使用红色，失真仅靠顶部消波灯提示 */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            height: `${level * 100}%`,
            background: `linear-gradient(to top, ${MIXER_COLORS.blue}, ${MIXER_COLORS.green} 70%, ${MIXER_COLORS.yellow})`,
            transition: "height 0.05s linear",
          }}
        />
        {/* 音量填充刻度线（半透明，标示推子设定值） */}
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            bottom: 0,
            height: `${value * 100}%`,
            boxShadow: `inset 0 0 0 1px ${accent}33`,
          }}
        />
        {/* 推子手柄：横跨槽宽 */}
        <div
          className="absolute left-1/2 h-3 w-9 -translate-x-1/2 rounded-sm"
          style={{
            bottom: `calc(${value * 100}% - 6px)`,
            background: "#e8e8e8",
            boxShadow: "0 1px 4px rgba(0,0,0,0.7)",
            willChange: "bottom",
          }}
        >
          {/* 手柄中线 */}
          <div className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2" style={{ background: "#999" }} />
        </div>
      </div>
    </div>
  )
}

function ChannelStripImpl({
  id,
  name,
  instrument,
  color,
  isMaster = false,
  playing,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
}: ChannelStripProps) {
  const [volume, setVolume] = useState(0.78)
  const [pan, setPan] = useState(0)
  const [muted, setMuted] = useState(false)
  const [soloed, setSoloed] = useState(false)
  const [clipped, setClipped] = useState(false)
  const [editingDb, setEditingDb] = useState(false)
  const [editingPan, setEditingPan] = useState(false)
  const [dbDraft, setDbDraft] = useState("")
  const [panDraft, setPanDraft] = useState("")

  // 停止播放时清除消波锁存
  useEffect(() => {
    if (!playing) setClipped(false)
  }, [playing])

  const handleVolume = (v: number) => {
    setVolume(v)
    onVolumeChange?.(id, v)
  }
  const handlePan = (v: number) => {
    setPan(v)
    onPanChange?.(id, v)
  }
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    onMuteToggle?.(id, next)
  }
  const toggleSolo = () => {
    const next = !soloed
    setSoloed(next)
    onSoloToggle?.(id, next)
  }

  const dbValue = volume <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(volume)
  const dbLabel = volume <= 0 ? "-∞" : dbValue.toFixed(1)

  // 提交手动输入的 dB（范围 -60~0 dB，对应音量 0~1）
  const commitDb = () => {
    setEditingDb(false)
    const parsed = Number.parseFloat(dbDraft)
    if (!Number.isFinite(parsed)) return
    const clampedDb = Math.min(0, Math.max(-60, parsed))
    handleVolume(Math.min(1, Math.max(0, Math.pow(10, clampedDb / 20))))
  }

  // 提��手动输入的声相（-100=L100, 0=C, 100=R100）
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

  return (
    <div
      className="flex h-full shrink-0 flex-col items-center gap-2 rounded-lg px-2 py-3"
      style={{
        width: isMaster ? 96 : 72,
        background: isMaster ? "#15151f" : MIXER_COLORS.panel,
        boxShadow: `inset 0 0 0 1px ${isMaster ? MIXER_COLORS.purple + "55" : "#2a2a2a"}`,
      }}
    >
      {/* dB 值（可手动输入，双击/单击编辑） */}
      {editingDb ? (
        <input
          autoFocus
          value={dbDraft}
          onChange={(e) => setDbDraft(e.target.value)}
          onBlur={commitDb}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitDb()
            if (e.key === "Escape") setEditingDb(false)
          }}
          inputMode="decimal"
          className="w-12 rounded bg-black px-1 py-0.5 text-center font-mono text-[10px] outline-none"
          style={{ color: MIXER_COLORS.text, boxShadow: `0 0 0 1px ${MIXER_COLORS.blue}` }}
          aria-label="输入电平 dB 值"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDbDraft(volume <= 0 ? "-60" : dbValue.toFixed(1))
            setEditingDb(true)
          }}
          className="rounded font-mono text-[10px] transition-colors hover:bg-white/10"
          style={{ color: MIXER_COLORS.textMuted, padding: "1px 4px" }}
          title="点击手动输入电平"
        >
          {dbLabel}
          <span className="ml-0.5">dB</span>
        </button>
      )}

      {/* 推子 + 电平一体槽（Cubase 风格） */}
      <div className="flex min-h-0 flex-1 items-stretch justify-center">
        <FaderMeter
          value={volume}
          onChange={handleVolume}
          playing={playing}
          muted={muted}
          clipped={clipped}
          onClip={() => setClipped(true)}
          onResetClip={() => setClipped(false)}
          accent={color}
        />
      </div>

      {/* 声相（可手动输入，支持 C / L50 / R30 / 数字） */}
      <div className="w-full px-0.5">
        <PanSlider value={pan} onChange={handlePan} />
        <div className="mt-1 flex justify-center">
          {editingPan ? (
            <input
              autoFocus
              value={panDraft}
              onChange={(e) => setPanDraft(e.target.value)}
              onBlur={commitPan}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitPan()
                if (e.key === "Escape") setEditingPan(false)
              }}
              className="w-12 rounded bg-black px-1 py-0.5 text-center font-mono text-[9px] outline-none"
              style={{ color: MIXER_COLORS.text, boxShadow: `0 0 0 1px ${MIXER_COLORS.pink}` }}
              aria-label="输入声相，例如 C、L50、R30"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setPanDraft(panLabel)
                setEditingPan(true)
              }}
              className="rounded text-center font-mono text-[9px] transition-colors hover:bg-white/10"
              style={{ color: MIXER_COLORS.textMuted, padding: "1px 4px" }}
              title="点击手动输入声相"
            >
              {panLabel}
            </button>
          )}
        </div>
      </div>

      {/* M / S */}
      {!isMaster ? (
        <div className="flex w-full gap-1">
          <button
            type="button"
            onClick={toggleMute}
            className="flex-1 rounded py-1 text-[11px] font-bold transition-colors"
            style={{
              background: muted ? MIXER_COLORS.red : "#262626",
              color: muted ? "#fff" : MIXER_COLORS.textMuted,
            }}
            aria-pressed={muted}
            aria-label="静音"
          >
            M
          </button>
          <button
            type="button"
            onClick={toggleSolo}
            className="flex-1 rounded py-1 text-[11px] font-bold transition-colors"
            style={{
              background: soloed ? MIXER_COLORS.green : "#262626",
              color: soloed ? "#121212" : MIXER_COLORS.textMuted,
            }}
            aria-pressed={soloed}
            aria-label="独奏"
          >
            S
          </button>
        </div>
      ) : (
        <div
          className="w-full rounded py-1 text-center text-[11px] font-bold"
          style={{ background: "#262626", color: MIXER_COLORS.purple }}
        >
          MAIN
        </div>
      )}

      {/* 轨道名 */}
      <div className="flex w-full flex-col items-center gap-0.5">
        <span className="text-base leading-none">{instrument}</span>
        <span className="w-full truncate text-center text-[10px]" style={{ color: MIXER_COLORS.text }}>
          {isMaster ? "Master" : name}
        </span>
      </div>
    </div>
  )
}

/** memo 化：播放走带时父组件每帧重渲染，调音台 props 不变则跳过，避免点击/拖动卡顿 */
export const ChannelStrip = memo(ChannelStripImpl)
