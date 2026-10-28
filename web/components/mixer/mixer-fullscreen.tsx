"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Minimize2, Pause, Play, SkipBack, Square, X, AudioLines, Repeat, RotateCcw } from "lucide-react"
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
  enableLocator,
  locator,
  onLocatorChange,
  loop,
  onLoopToggle,
  onResetAll,
  publishButton,
  onPublishClick,
  onClearMS,
  countdownSec,
  icon = "🎸",
  titleLabel = "试听混音",
  footerHint = "你可以在这里试听本次录音，在下方调音台区域进行分轨调整。调整只作用于试听，不影响混音发表。",
}: MixerFullscreenProps) {
  const waveSeekRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // ───── 定位器（1026 Cubase 式）：拖拽态 + 双击精确输入态 ─────
  const [locatorDrag, setLocatorDrag] = useState<"a" | "b" | null>(null)
  const [editing, setEditing] = useState<"a" | "b" | null>(null)
  const [editVal, setEditVal] = useState("")
  const locatorMoveRef = useRef<(e: PointerEvent) => void>(() => {})

  const ratioFromClientX = useCallback((clientX: number) => {
    const el = waveSeekRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }, [])

  // 定位器拖拽（照抄 scrub 的 window 级监听范式；move 逻辑经 ref 取最新值，绑定只在拖拽会话首尾）
  useEffect(() => {
    if (!locatorDrag) return
    const move = (e: PointerEvent) => locatorMoveRef.current(e)
    const up = () => setLocatorDrag(null)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [locatorDrag])
  locatorMoveRef.current = (e: PointerEvent) => {
    if (!locatorDrag || !onLocatorChange || duration <= 0) return
    const v = ratioFromClientX(e.clientX) * duration
    if (locatorDrag === "a") onLocatorChange(v, locator?.b ?? null)
    else onLocatorChange(locator?.a ?? 0, v)
    console.debug("[mixer-locator] drag", locatorDrag, `${v.toFixed(2)}s`)
  }

  // 双击输入解析：纯秒（"12.5"）或 分:秒（"1:30.5"）
  const parseTimeInput = (raw: string): number | null => {
    const s = raw.trim()
    if (!s) return null
    if (s.includes(":")) {
      const [mm, ss] = s.split(":")
      const m = parseFloat(mm)
      const sec = parseFloat(ss)
      if (!Number.isFinite(m) || !Number.isFinite(sec)) return null
      return Math.max(0, m * 60 + sec)
    }
    const v = parseFloat(s)
    return Number.isFinite(v) ? Math.max(0, v) : null
  }

  const locARatio = duration > 0 ? (locator?.a ?? 0) / duration : 0
  const locBRatio = duration > 0 && locator?.b != null ? locator.b / duration : 1
  const hasAnyMS = !!(Object.values(mutes || {}).some(Boolean) || Object.values(solos || {}).some(Boolean))

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
      className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={`${sessionLabel}${titleLabel ? ` ${titleLabel}` : ""}`}
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
            {icon ? <span className="text-lg">{icon}</span> : null}
            {sessionLabel}{titleLabel ? ` · ${titleLabel}` : ""}
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
            {/* 定位器三角 sticky 锚（1029 欢哥·标准 DAW）：>5 轨滚动时三角钉在可视区顶可拖拽；
                线（区间条）仍贯穿全部分轨内容——滚到哪里，可见线头都从可视区顶与三角无缝相接 */}
            {enableLocator && duration > 0 && onLocatorChange && (
            <div className="sticky top-0 z-20 h-0">
              {/* A 三角（Cubase 直角等腰：竖直角边贴线，水平直角边向右——斜边指向备选区） */}
              <div
                className="absolute -top-2.5 cursor-ew-resize touch-none"
                style={{ left: `calc(184px + (100% - 184px - 12px) * ${locARatio ?? 0})`, width: 12, height: 14 }}
                onPointerDown={(e) => { e.stopPropagation(); setEditing(null); setLocatorDrag("a") }}
                onDoubleClick={() => { setEditing("a"); setEditVal((locator?.a ?? 0).toFixed(1)) }}
                title={`A ${formatTime(locator?.a ?? 0)}（拖拽调整，双击输入精确时间）`}
                role="slider"
                aria-label="定位器 A 点"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(locator?.a ?? 0)}
              >
                <svg width="10" height="10" className="block"><path d="M0 0 L10 0 L0 10 Z" fill="#BBEE00" /></svg>
              </div>
              {/* B 三角（Cubase 直角等腰：竖直角边贴线，水平直角边向左——斜边指向备选区） */}
              <div
                className="absolute -top-2.5 cursor-ew-resize touch-none"
                style={{ left: `calc(184px + (100% - 184px - 12px) * ${locBRatio ?? 1} - 12px)`, width: 12, height: 14 }}
                onPointerDown={(e) => { e.stopPropagation(); setEditing(null); setLocatorDrag("b") }}
                onDoubleClick={() => { setEditing("b"); setEditVal((locator?.b ?? duration).toFixed(1)) }}
                title={`B ${formatTime(locator?.b ?? duration)}（拖拽调整，双击输入精确时间）`}
                role="slider"
                aria-label="定位器 B 点"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(locator?.b ?? duration)}
              >
                <svg width="10" height="10" className="absolute right-0 block"><path d="M10 0 L0 0 L10 10 Z" fill="#BBEE00" /></svg>
              </div>
            </div>
            )}
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
            {/* ───── 定位器（1026，enableLocator 才渲染；program 不传=零感知）─────
                区间染色层（pointer-events-none，压在 scrub 层上方但不挡交互）+ A/B 直角三角
                （z 高于 scrub 层可拖拽）+ 拖拽时间码气泡 + 双击精确输入框 */}
            {enableLocator && duration > 0 && onLocatorChange && (
              <>
                {locator && (
                  <div
                    className="pointer-events-none absolute -top-2.5 bottom-0"
                    style={{
                      left: `calc(184px + (100% - 184px - 12px) * ${locARatio})`,
                      width: `calc((100% - 184px - 12px) * ${Math.max(0, locBRatio - locARatio)})`,
                      background: "rgba(187,238,0,0.07)",
                      borderLeft: "1px solid rgba(187,238,0,0.55)",
                      borderRight: "1px solid rgba(187,238,0,0.55)",
                    }}
                  />
                )}
                {/* 拖拽时间码气泡 */}
                {locatorDrag && (
                  <div
                    className="pointer-events-none absolute top-4 z-20 -translate-x-1/2 rounded px-1.5 py-0.5 font-mono text-[11px]"
                    style={{
                      left: `calc(184px + (100% - 184px - 12px) * ${locatorDrag === "a" ? locARatio : locBRatio})`,
                      background: "#000",
                      color: "#BBEE00",
                      border: "1px solid rgba(187,238,0,0.4)",
                    }}
                  >
                    {formatTime(locatorDrag === "a" ? (locator?.a ?? 0) : (locator?.b ?? duration))}
                  </div>
                )}
                {/* 双击精确输入框（秒 或 分:秒） */}
                {editing && (
                  <div
                    className="absolute top-5 z-30"
                    style={{ left: `calc(184px + (100% - 184px - 12px) * ${editing === "a" ? locARatio : locBRatio} - 55px)` }}
                  >
                    <input
                      autoFocus
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={() => setEditing(null)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === "Enter") {
                          const v = parseTimeInput(editVal)
                          if (v != null) {
                            if (editing === "a") onLocatorChange(v, locator?.b ?? null)
                            else onLocatorChange(locator?.a ?? 0, v)
                          }
                          setEditing(null)
                        } else if (e.key === "Escape") {
                          setEditing(null)
                        }
                      }}
                      placeholder="秒 或 分:秒"
                      className="w-[110px] rounded px-2 py-1 font-mono text-xs outline-none"
                      style={{ background: "#000", color: "#fff", border: "1px solid rgba(187,238,0,0.5)" }}
                    />
                  </div>
                )}
              </>
            )}
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

            {/* 发表倒计时（仅发表混音器传 countdownSec；发表成功后父组件不再传=隐藏） */}
            {typeof countdownSec === "number" && countdownSec > 0 && (
              <span
                className="shrink-0 font-mono text-xs tabular-nums"
                style={{ color: countdownSec < 120 ? MIXER_COLORS.yellow : MIXER_COLORS.textMuted }}
                title="超时将自动释放发表权"
              >
                请在 {Math.floor(countdownSec / 60)}m:{String(Math.floor(countdownSec % 60)).padStart(2, "0")}s 内完成发表，超时将释放发表权
              </span>
            )}

            <p className="ml-auto text-xs" style={{ color: MIXER_COLORS.textMuted }}>
              {footerHint}
            </p>

            {/* 区间循环开关（enableLocator 才渲染） */}
            {enableLocator && onLoopToggle && (
              <button
                type="button"
                onClick={() => onLoopToggle(!loop)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{
                  color: loop ? MIXER_COLORS.green : MIXER_COLORS.textMuted,
                  border: `1px solid ${loop ? "rgba(187,238,0,0.5)" : MIXER_COLORS.border}`,
                }}
                aria-label="区间循环播放"
                title="区间内循环播放"
              >
                <Repeat size={14} />
              </button>
            )}
            {/* 复位所有参数（音量/声像/总线/M/S/定位器一键回默认） */}
            {onResetAll && (
              <button
                type="button"
                onClick={onResetAll}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                style={{ color: MIXER_COLORS.textMuted, border: `1px solid ${MIXER_COLORS.border}` }}
                aria-label="复位所有参数"
                title="复位所有参数（音量/声像/总线/M/S/定位器）"
              >
                <RotateCcw size={14} />
              </button>
            )}
            {/* 一键清 M/S（闸2 便利钮：发表要求全员参与混音，存在 M/S 时才显示） */}
            {onClearMS && hasAnyMS && (
              <button
                type="button"
                onClick={onClearMS}
                className="shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-white/10"
                style={{ color: MIXER_COLORS.yellow, border: `1px solid ${MIXER_COLORS.border}` }}
                title="发表要求所有分轨参与混音；M/S 仅试听用，一键清除"
              >
                清除M/S
              </button>
            )}
            {/* 发表作品按钮（仅发表混音器；灰置时悬停显示原因） */}
            {publishButton && (
              <button
                type="button"
                onClick={onPublishClick}
                disabled={publishButton.disabled || publishButton.busy}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                style={{
                  background: publishButton.disabled ? "#333333" : publishButton.tone === "green" ? MIXER_COLORS.green : MIXER_COLORS.blue,
                  color: publishButton.disabled ? "#888888" : "#121212",
                  opacity: publishButton.disabled ? 0.6 : 1,
                }}
                title={publishButton.disabled ? publishButton.reason : undefined}
              >
                {publishButton.busy ? "生成中…" : publishButton.label}
              </button>
            )}
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
