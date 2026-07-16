"use client"

import type React from "react"
import { useCallback, useEffect, useRef } from "react"
import { Minimize2, Pause, Play, SkipBack, Square, X, AudioLines } from "lucide-react"
import { ChannelStrip } from "./channel-strip"
import { WaveformTrack } from "./waveform-track"
import { formatTime, MIXER_COLORS, type MixerFullscreenProps } from "./types"

export function MixerFullscreen({
  sessionLabel,
  tracks,
  isOpen,
  isPlaying,
  currentTime,
  duration,
  progress,
  loadingProgress,
  mutes,
  solos,
  levels,
  onClose,
  onMinimize,
  onPlayPause,
  onStop,
  onSeek,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  volumes,
  pans,
  clips,
  onResetClip,
  masterVolume,
  masterLevel,
  masterClip,
  onMasterVolumeChange,
  onResetMasterClip,
}: MixerFullscreenProps) {
  const waveSeekRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // 在波形区按位置 → 指针跳转，联动走带时间
  const handleWaveSeek = useCallback(
    (clientX: number) => {
      const el = waveSeekRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      onSeek(Math.min(1, Math.max(0, ratio)))
    },
    [onSeek],
  )

  // 空格键播放/暂停：在弹窗打开时生效，输入框聚焦时不拦截
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return
      e.preventDefault()
      onPlayPause()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onPlayPause])

  // 支持按住后左右拖动指针（scrub）：window 级监听，拖出区域也能跟随
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (draggingRef.current) handleWaveSeek(e.clientX)
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
  }, [handleWaveSeek])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`${sessionLabel} 试听混音`}
    >
      <div
        className="relative flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl"
        style={{
          background: MIXER_COLORS.background,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          animation: "mixerIn 0.18s ease-out",
        }}
      >
        {/* ───── 顶部操作栏 ───── */}
        <header
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${MIXER_COLORS.border}` }}
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: MIXER_COLORS.text }}>
            <span className="text-lg">🎸</span>
            {sessionLabel} · 试听混音
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMinimize}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              style={{ color: MIXER_COLORS.textMuted }}
              aria-label="缩小为浮动窗"
            >
              <Minimize2 size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-white/10"
              style={{ color: MIXER_COLORS.textMuted }}
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* ───── 1. 波形区（高度跟随轨道数；≤5 条贴合内容，>5 条固定高度并滚动） ───── */}
        <section
          className="relative shrink-0 overflow-y-auto px-3 py-3"
          style={tracks.length > 5 ? { maxHeight: 5 * 52 + 4 * 4 } : undefined}
        >
          <div className="relative flex w-full flex-col gap-1">
            {tracks.map((t) => (
              <WaveformTrack
                key={t.id}
                id={t.id}
                name={t.name}
                instrument={t.instrument}
                color={t.color}
                peaks={t.peaks}
                active={isPlaying}
                muted={mutes?.[t.id] || false}
              />
            ))}
            {/* 波形点击跳转层：覆盖波形画布区域（左侧标签宽 160 + gap 12 + padding 12） */}
            <div
              ref={waveSeekRef}
              className="absolute top-0 bottom-0 cursor-ew-resize touch-none"
              style={{ left: 184, right: 12 }}
              onPointerDown={(e) => {
                draggingRef.current = true
                handleWaveSeek(e.clientX)
              }}
              role="slider"
              aria-label="点击或拖动波形调整播放位置"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            />
            {/* 纵向播放指针：仅覆盖波形画布区域 */}
            <div
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                left: `calc(184px + (100% - 184px - 12px) * ${progress})`,
                width: 2,
                background: MIXER_COLORS.text,
                boxShadow: "0 0 8px rgba(255,255,255,0.7)",
                willChange: "left",
              }}
            />
          </div>
        </section>

        {/* ───── 2. 走带区 ───── */}
        <section className="px-4 pb-3">
          <div
            className="flex items-center gap-4 px-4 py-2.5"
            style={{ background: "#222", borderRadius: 10 }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSeek(0)}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                style={{ color: MIXER_COLORS.textMuted, border: `1px solid ${MIXER_COLORS.border}` }}
                aria-label="回到开头"
                title="回到开头"
              >
                <SkipBack size={15} fill="currentColor" />
              </button>
              <button
                type="button"
                onClick={onPlayPause}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105"
                style={{ background: MIXER_COLORS.green, color: "#121212" }}
                aria-label={isPlaying ? "暂停" : "播放"}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={onStop}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                style={{ color: MIXER_COLORS.textMuted, border: `1px solid ${MIXER_COLORS.border}` }}
                aria-label="停止"
              >
                <Square size={14} fill="currentColor" />
              </button>
            </div>

            <div className="shrink-0 font-mono text-sm tabular-nums" style={{ color: MIXER_COLORS.text }}>
              {formatTime(currentTime)}
              <span style={{ color: MIXER_COLORS.textMuted }}> / {formatTime(duration)}</span>
            </div>

            <p className="ml-auto text-xs" style={{ color: MIXER_COLORS.textMuted }}>
              你可以在这里试听本次录音，在下方调音台区域进行分轨调整。调整只作用于试听，不影响混音发表。
            </p>
          </div>
        </section>

        {/* ───── 3. 调音台区（固定高度） ───── */}
        <section className="shrink-0 overflow-hidden px-4 pb-4" style={{ height: 360 }}>
          <div
            className="flex h-full gap-2 overflow-x-auto rounded-xl p-3"
            style={{ background: MIXER_COLORS.panel, boxShadow: "inset 0 0 0 1px #2a2a2a" }}
          >
            {tracks.map((t) => (
              <ChannelStrip
                key={t.id}
                id={t.id}
                name={t.name}
                instrument={t.instrument}
                color={t.color}
                playing={isPlaying}
                level={levels?.[t.id] ?? 0}
                volume={volumes?.[t.id] ?? 1}
                pan={pans?.[t.id] ?? 0}
                muted={mutes?.[t.id] ?? false}
                soloed={solos?.[t.id] ?? false}
                clipped={clips?.[t.id] ?? false}
                onVolumeChange={onVolumeChange}
                onPanChange={onPanChange}
                onMuteToggle={onMuteToggle}
                onSoloToggle={onSoloToggle}
                onResetClip={onResetClip}
              />
            ))}
            <ChannelStrip
              id="master"
              name="Master"
              instrument={<AudioLines className="h-4 w-4" style={{ color: MIXER_COLORS.purple }} />}
              color={MIXER_COLORS.purple}
              isMaster
              playing={isPlaying}
              level={masterLevel ?? 0}
              volume={masterVolume ?? 1}
              clipped={masterClip ?? false}
              onVolumeChange={(_id, v) => onMasterVolumeChange?.(v)}
              onResetClip={onResetMasterClip ? () => onResetMasterClip() : undefined}
            />
          </div>
        </section>
      {/* 加载遮罩：normalization + 波形加载总进度 */}
      {loadingProgress !== undefined && loadingProgress < 100 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
          style={{ background: "rgba(18,18,18,0.92)" }}>
          <div className="flex w-80 flex-col items-center gap-6">
            <p className="text-sm font-medium" style={{ color: MIXER_COLORS.textMuted }}>音轨准备中</p>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full" style={{ background: "#222" }}>
              <div className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${loadingProgress}%`,
                  background: `linear-gradient(to right, ${MIXER_COLORS.purple}, ${MIXER_COLORS.blue})`,
                }}
              />
            </div>
            <span className="font-mono text-sm" style={{ color: MIXER_COLORS.text }}>
              {Math.round(loadingProgress)}%
            </span>
          </div>
        </div>
      )}
      </div>

      <style>{`
        @keyframes mixerIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
