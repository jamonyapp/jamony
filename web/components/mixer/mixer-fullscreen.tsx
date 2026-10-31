"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useSpaceControl } from "@/hooks/useSpaceControl"
import { Minimize2, Pause, Play, SkipBack, Square, X, AudioLines, Repeat, RotateCcw } from "lucide-react"
import { ChannelStrip } from "./channel-strip"
import { WaveformTrack } from "./waveform-track"
import { formatTime, LOCATOR_YELLOW, MIXER_COLORS, type MixerFullscreenProps } from "./types"

/* 1031 空格互斥（欢哥拍板「不能一按全都响应」）：全站空格仲裁器统一分发（useSpaceControl，
   与 GP 谱工作站共用）——后打开的=视觉顶层=空格独享，关闭自动回落次顶层。 */

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
  locatorActive,
  onLocatorChange,
  onLocatorMove,
  onLocatorActiveChange,
  loop,
  onLoopToggle,
  onResetAll,
  publishButton,
  onPublishClick,
  onAbandonPublish,
  onClearMS,
  countdownSec,
  icon = "🎸",
  titleLabel = "试听混音",
  footerHint = "你可以在这里试听本次录音，在下方调音台区域进行分轨调整。调整只作用于试听，不影响混音发表。",
}: MixerFullscreenProps) {
  const waveSeekRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // ───── 定位器（1031 Cubase 式重构，欢哥定稿）：区间常驻+独立开关+指针解耦 ─────
  const [locatorDrag, setLocatorDrag] = useState<"a" | "b" | null>(null)
  const [editing, setEditing] = useState<"a" | "b" | null>(null)
  const [editVal, setEditVal] = useState("")
  const locatorMoveRef = useRef<(e: PointerEvent) => void>(() => {})
  // 细条（边角5）：点击=开关（黄=生效/同色阴影=单纯指示）；拖拽=AB 锁定同步平移。
  // 点击vs拖拽判定=4px 位移阈值（防误触发开关的手感噪音）。
  const stripDragRef = useRef<{ startX: number; lastX: number; moved: boolean } | null>(null)

  // 缺省折叠态（program 不传 locator 也不会炸；折叠=B>A 不成立=零可视）
  const loc = locator ?? { a: 0, b: 0 }

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
    onLocatorChange(locatorDrag, v)
    console.debug("[mixer-locator] drag", locatorDrag, `${v.toFixed(2)}s`)
  }

  // 细条拖拽（scrub 同款 window 级范式）：增量 delta 交给引擎钳制；松手未超阈值=点击开关
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = stripDragRef.current
      if (!s || !onLocatorMove || duration <= 0) return
      if (!s.moved && Math.abs(e.clientX - s.startX) > 4) s.moved = true
      if (!s.moved) return
      const rect = waveSeekRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      const dx = e.clientX - s.lastX
      if (dx !== 0) {
        onLocatorMove((dx / rect.width) * duration)
        s.lastX = e.clientX
      }
    }
    const up = () => {
      const s = stripDragRef.current
      stripDragRef.current = null
      if (s && !s.moved && onLocatorActiveChange) {
        onLocatorActiveChange(!locatorActive)
        console.debug("[mixer-locator] strip toggle →", !locatorActive)
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [onLocatorMove, onLocatorActiveChange, locatorActive, duration])

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

  const locARatio = duration > 0 ? loc.a / duration : 0
  const locBRatio = duration > 0 ? loc.b / duration : 1
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

  // 空格键播放/暂停：注册进全站空格仲裁器（1031）——isOpen 时在栈顶独享，关闭/最小化让位
  useSpaceControl(isOpen, onPlayPause)

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
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: MIXER_COLORS.text }}>
              {icon ? <span className="text-lg">{icon}</span> : null}
              {sessionLabel}{titleLabel ? ` · ${titleLabel}` : ""}
            </h2>
            {/* 发表倒计时（1031 五轮欢哥：仅时间玫红，其余文案白；句号收尾。
                仅发表混音器传 countdownSec；发表成功后父组件不再传=隐藏） */}
            {typeof countdownSec === "number" && countdownSec > 0 && (
              <span
                className="ml-1 shrink-0 font-mono text-xs tabular-nums"
                style={{ color: MIXER_COLORS.text }}
                title="超时将自动释放发表权"
              >
                请在 <span style={{ color: MIXER_COLORS.pink }}>{Math.floor(countdownSec / 60)}m:{String(Math.floor(countdownSec % 60)).padStart(2, "0")}s</span> 内完成发表，超时将释放发表权。
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 复位所有调参值（1031 五轮欢哥：迁右侧按钮组首位，放弃发表左边） */}
            {onResetAll && (
              <button
                type="button"
                onClick={onResetAll}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-transform hover:scale-105"
                style={{ background: MIXER_COLORS.green, borderColor: "rgba(255,255,255,0.35)", color: "#FFFFFF" }}
                aria-label="复位所有调参值"
                title="复位所有调参值（音量/声像/总线/M/S/定位器/循环）"
              >
                <RotateCcw size={12} />
                复位所有调参值
              </button>
            )}
            {/* 放弃发表（1031 五轮欢哥：迁标题栏最小化钮左边；红色=退出性操作语言） */}
            {publishButton && onAbandonPublish && !publishButton.busy && (
              <button
                type="button"
                onClick={onAbandonPublish}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/10"
                style={{ color: MIXER_COLORS.red, border: "1px solid rgba(255,51,102,0.5)" }}
                title="释放当前发表权限，其他乐手可重新抢锁发表"
              >
                放弃发表
              </button>
            )}
            {/* 发表作品按钮（1031 五轮欢哥：迁标题栏；灰置时悬停显示原因） */}
            {publishButton && (
              <button
                type="button"
                onClick={onPublishClick}
                disabled={publishButton.disabled || publishButton.busy}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                style={{
                  // 1031 六轮欢哥：填充恒品牌蓝与卡片「去发表」同色（#00AAFF 同源）；
                  // 七轮：文案白字（深字衬暗整钮=「颜色偏深」的观感元凶）
                  background: publishButton.disabled ? "#333333" : MIXER_COLORS.blue,
                  color: publishButton.disabled ? "#888888" : "#FFFFFF",
                  opacity: publishButton.disabled ? 0.6 : 1,
                }}
                title={publishButton.disabled ? publishButton.reason : undefined}
              >
                {publishButton.label}
              </button>
            )}
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
        {/* select-none（1031 欢哥）：拖三角/细条/刮擦时浏览器把拖动当框选复制，
            分轨名文案被带上选择背景——波形区无任何供选择文案，静态关闭 */}
        <section
          className="relative shrink-0 overflow-y-auto px-3 py-3 select-none"
          style={tracks.length > 5 ? { maxHeight: 5 * 52 + 4 * 4 } : undefined}
        >
          <div className="relative flex w-full flex-col gap-1">
            {/* 定位器三角 sticky 锚（1029 欢哥·标准 DAW）：>5 轨滚动时三角钉在可视区顶可拖拽；
                线（区间条）仍贯穿全部分轨内容——滚到哪里，可见线头都从可视区顶与三角无缝相接 */}
            {enableLocator && duration > 0 && onLocatorChange && (
            <div className="sticky top-0 z-20 h-0">
              {/* 细条开关+拖拽平移（1031 欢哥 Cubase 定稿，边角5）：点击=选区生效开关
                  （黄=生效；与下方分轨阴影同色=未生效单纯指示）；拖拽=AB 锁定同步平移。
                  仅 B>A 有可视宽度（折叠态零宽=无热区，先拖 B 拉开区间） */}
              {loc.b > loc.a && onLocatorMove && onLocatorActiveChange && (
              <div
                className="absolute cursor-grab touch-none active:cursor-grabbing"
                style={{
                  // 高度=三角直角边（10px SVG）：下沿顶齐首轨上沿，不溢进音频块
                  // （1029 gap 判例同族：sticky 锚 h-0+gap-1=首轨顶在容器 +4px）
                  top: -6, height: 10,
                  left: `calc(184px + (100% - 184px - 12px) * ${locARatio})`,
                  width: `calc((100% - 184px - 12px) * ${locBRatio - locARatio})`,
                  // 1031 二轮（欢哥）：绿色阴影退役——未激活=白（单纯指示）；激活=品牌黄
                  background: locatorActive ? LOCATOR_YELLOW.fill : "rgba(255,255,255,0.07)",
                  borderLeft: `1px solid ${locatorActive ? LOCATOR_YELLOW.line : "rgba(255,255,255,0.55)"}`,
                  borderRight: `1px solid ${locatorActive ? LOCATOR_YELLOW.line : "rgba(255,255,255,0.55)"}`,
                }}
                onPointerDown={(e) => { e.stopPropagation(); setEditing(null); stripDragRef.current = { startX: e.clientX, lastX: e.clientX, moved: false } }}
                title={locatorActive
                  ? `定位器生效中（${formatTime(loc.a)} – ${formatTime(loc.b)}）：播放到 B 停止或循环回 A。点击关闭，拖动平移选区`
                  : `选区未生效（单纯指示）：点击启用定位器，拖动平移选区`}
                role="switch"
                aria-checked={!!locatorActive}
                aria-label="定位器选区开关"
              />
              )}
              {/* A 三角（Cubase 直角等腰：竖直角边贴线，水平直角边向右——斜边指向备选区） */}
              <div
                className="absolute -top-1.5 cursor-ew-resize touch-none"
                style={{ left: `calc(184px + (100% - 184px - 12px) * ${locARatio})`, width: 12, height: 14 }}
                onPointerDown={(e) => { e.stopPropagation(); setEditing(null); setLocatorDrag("a") }}
                onDoubleClick={() => { setEditing("a"); setEditVal(loc.a.toFixed(1)) }}
                title={`A ${formatTime(loc.a)}（拖拽调整，双击输入精确时间）`}
                role="slider"
                aria-label="定位器 A 点"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(loc.a)}
              >
                <svg width="10" height="10" className="block"><path d="M0 0 L10 0 L0 10 Z" fill="#BBEE00" /></svg>
              </div>
              {/* B 三角（Cubase 直角等腰：竖直角边贴线，水平直角边向左——斜边指向备选区；
                  折叠初始态与 A 拼合，B 在左侧（欢哥 Cubase 定稿） */}
              <div
                className="absolute -top-1.5 cursor-ew-resize touch-none"
                style={{ left: `calc(184px + (100% - 184px - 12px) * ${locBRatio} - 12px)`, width: 12, height: 14 }}
                onPointerDown={(e) => { e.stopPropagation(); setEditing(null); setLocatorDrag("b") }}
                onDoubleClick={() => { setEditing("b"); setEditVal(loc.b.toFixed(1)) }}
                title={`B ${formatTime(loc.b)}（拖拽调整，双击输入精确时间）`}
                role="slider"
                aria-label="定位器 B 点"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(loc.b)}
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
            {/* 纵向播放指针：仅覆盖波形画布区域（top-1=4px 补偿 sticky 锚与首轨间的 gap-1，顶端=首轨上沿） */}
            <div
              className="pointer-events-none absolute top-1 bottom-0"
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
                {loc.b > loc.a && (
                  <div
                    className="pointer-events-none absolute -top-1.5 bottom-0"
                    style={{
                      left: `calc(184px + (100% - 184px - 12px) * ${locARatio})`,
                      width: `calc((100% - 184px - 12px) * ${Math.max(0, locBRatio - locARatio)})`,
                      background: locatorActive ? LOCATOR_YELLOW.tint : "rgba(255,255,255,0.07)",
                      borderLeft: `1px solid ${locatorActive ? LOCATOR_YELLOW.line : "rgba(255,255,255,0.55)"}`,
                      borderRight: `1px solid ${locatorActive ? LOCATOR_YELLOW.line : "rgba(255,255,255,0.55)"}`,
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
                    {formatTime(locatorDrag === "a" ? loc.a : loc.b)}
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
                          if (v != null) onLocatorChange(editing, v)
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
              {/* 循环开关（1031 二轮欢哥：前移至停止后、时间前；归播放引擎与定位器解耦——
                  传了就渲染，program 不传=零感知。定位器生效=循环选区，未生效=整曲循环） */}
              {onLoopToggle && (
                <button
                  type="button"
                  onClick={() => onLoopToggle(!loop)}
                  className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                  style={{
                    color: loop ? MIXER_COLORS.green : MIXER_COLORS.textMuted,
                    border: `1px solid ${loop ? "rgba(187,238,0,0.5)" : MIXER_COLORS.border}`,
                  }}
                  aria-label="循环播放"
                  title="循环播放（定位器生效时循环选区，否则整曲循环）"
                >
                  <Repeat size={14} />
                </button>
              )}
            </div>

            <div className="shrink-0 font-mono text-sm tabular-nums" style={{ color: MIXER_COLORS.text }}>
              {formatTime(currentTime)}
              <span style={{ color: MIXER_COLORS.textMuted }}> / {formatTime(duration)}</span>
            </div>

            {/* 发表倒计时已迁标题栏（1031 三轮欢哥） */}

            {/* 提示文案统一灰（1031 七轮后欢哥回调：白色弃用） */}
            <p className="ml-auto text-xs" style={{ color: MIXER_COLORS.textMuted }}>
              {footerHint}
            </p>

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
            {/* 放弃发表/发表作品已迁标题栏（1031 五轮欢哥） */}
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
