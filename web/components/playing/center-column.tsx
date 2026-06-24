"use client"

import { useEffect, useRef, useState } from "react"
import { Circle, Square, ChevronDown, Disc3, ArrowRight, Download, Ban, Music, Check, X, ChevronUp } from "lucide-react"
import { RECORDINGS, type RecordingSession, type Track } from "@/lib/jam-data"

function parseDuration(d: string) {
  const [m, s] = d.split(":").map(Number)
  return (m || 0) * 60 + (s || 0)
}

function fmt(total: number) {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

// 帮助按钮 — 圆圈问号
function HelpTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [show])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShow((o) => !o)}
        className="grid size-4 place-items-center rounded-full bg-accent text-[10px] text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        aria-label="帮助"
      >
        ?
      </button>
      {show && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-[8px] border border-border bg-popover p-2.5 text-[11px] leading-relaxed text-popover-foreground shadow-lg">
          {text}
        </div>
      )}
    </div>
  )
}

// 下拉选择器组件
function DropdownSelect({
  value,
  options,
  onChange,
  disabled,
  nullLabel,
}: {
  value: boolean | null
  options: { label: string; value: boolean; className?: string }[]
  onChange: (v: boolean) => void
  disabled?: boolean
  nullLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const displayText = value === null ? (nullLabel || "未选择") : options.find((o) => o.value === value)?.label ?? "未选择"
  const isDecided = value !== null
  const activeOption = options.find((o) => o.value === value)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-bold transition-colors ${
          disabled
            ? "cursor-not-allowed bg-accent/50 text-muted-foreground/40"
            : isDecided
              ? (activeOption?.className || "bg-accent text-foreground")
              : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground"
        }`}
      >
        <span>{displayText}</span>
        {!disabled && (open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full z-10 mt-1 flex flex-col overflow-hidden rounded-[8px] border border-border bg-popover py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`whitespace-nowrap px-3 py-1.5 text-left text-[11px] font-bold transition-colors hover:bg-accent ${
                value === opt.value ? (opt.className || "text-foreground") : "text-muted-foreground"
              } ${value === opt.value ? "bg-accent" : ""}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CenterColumn({ chords, customTheme, currentBpm }: { chords: string[]; customTheme?: string; currentBpm?: number }) {
  const [todayTheme, setTodayTheme] = useState({ title: "加载中...", emoji: "🎵" })
  useEffect(() => {
    fetch("/api/daily-theme")
      .then(r => r.json())
      .then(data => { if (data.ok) setTodayTheme(data.theme) })
      .catch(() => {})
  }, [])
  return (
    <main className="flex h-full flex-col gap-4 p-4">
      {/* 合奏大屏 */}
      <section className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[10px] border" style={{ borderColor: "#1A1A1A" }}>
        <img
          src="/images/stage-backdrop.png"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-black/65" />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 40%, rgba(153,51,255,0.35), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 py-6 text-center">
          <div>
            <>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">本房间主题</p>
              <p className="mt-2 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
                {customTheme && customTheme.length > 0 ? customTheme : `${todayTheme.emoji} ${todayTheme.title}`}
              </p>
            </>
          </div>

          {chords.length > 0 && (
          <div className="w-full">
            <p className="text-center text-xs uppercase tracking-[0.3em] text-white/50">和弦进程</p>
            <div className="mt-3">
              <ChordBoard chords={chords} />
            </div>
          </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">拍速</p>
            <p className="mt-1 text-xl font-bold text-white lg:text-2xl">{currentBpm && currentBpm > 0 ? currentBpm + " BPM" : "custom"}</p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: "linear-gradient(90deg, #00AAFF, #9933FF, #FF33AA, #BBEE00)" }} />
      </section>

      {/* 录音功能 */}
      <RecordingPanel />
    </main>
  )
}

// 把和弦按每句 4 个分行；8 句时左右分栏中间放大箭头
function ChordBoard({ chords }: { chords: string[] }) {
  const lines: string[][] = []
  for (let i = 0; i < chords.length; i += 4) {
    lines.push(chords.slice(i, i + 4))
  }
  if (lines.length === 0) return null

  const sizeClass =
    lines.length <= 2
      ? "text-xl sm:text-2xl lg:text-3xl"
      : lines.length <= 4
        ? "text-base sm:text-lg lg:text-xl"
        : "text-sm sm:text-base lg:text-lg"

  const Line = ({ line }: { line: string[] }) => (
    <p className={`font-mono font-semibold leading-relaxed tracking-wide text-white ${sizeClass}`}>
      {line.map((c, i) => (
        <span key={i}>
          <span className="inline-block min-w-[2.5em] text-center">{c}</span>
          {i < line.length - 1 && <span className="text-white/30">|</span>}
        </span>
      ))}
    </p>
  )

  if (lines.length > 4) {
    const mid = Math.ceil(lines.length / 2)
    const left = lines.slice(0, mid)
    const right = lines.slice(mid)
    return (
      <div className="flex items-center justify-center gap-5">
        <div className="flex flex-col gap-1">
          {left.map((l, i) => (
            <Line key={i} line={l} />
          ))}
        </div>
        <ArrowRight className="size-8 shrink-0 text-brand-green lg:size-10" strokeWidth={3} />
        <div className="flex flex-col gap-1">
          {right.map((l, i) => (
            <Line key={i} line={l} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {lines.map((l, i) => (
        <Line key={i} line={l} />
      ))}
    </div>
  )
}

function RecordingPanel() {
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [sessions, setSessions] = useState<RecordingSession[]>(RECORDINGS)
  const [expanded, setExpanded] = useState<string | null>(RECORDINGS[0]?.id ?? null)

  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecTime((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  function toggle() {
    if (recording) {
      const newSession: RecordingSession = {
        id: `s${Date.now()}`,
        index: sessions.length + 1,
        duration: fmt(recTime),
        participants: 4,
        tracks: [
          { member: "阿May", instrumentEmoji: "🎸", duration: fmt(recTime), allowUse: null, allowAttribution: null, allowDownload: null },
          { member: "你", instrumentEmoji: "🎸", duration: fmt(recTime), allowUse: null, allowAttribution: null, allowDownload: null },
          { member: "老K", instrumentEmoji: "🎻", duration: fmt(recTime), allowUse: null, allowAttribution: null, allowDownload: null },
          { member: "小鼓手", instrumentEmoji: "🥁", duration: fmt(recTime), allowUse: null, allowAttribution: null, allowDownload: null },
        ],
      }
      setSessions((s) => [...s, newSession])
      setExpanded(newSession.id)
      setRecTime(0)
      setRecording(false)
    } else {
      setRecording(true)
    }
  }

  function handleTrackChoice(sessionId: string, trackIndex: number, field: "allowUse" | "allowAttribution" | "allowDownload", value: boolean) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s
        const newTracks = s.tracks.map((t, i) => {
          if (i !== trackIndex) return t
          if (field === "allowUse" && value === false) {
            // 如果拒绝使用音轨，同时重置署名（下载保持独立）
            return { ...t, allowUse: false, allowAttribution: null }
          }
          return { ...t, [field]: value }
        })
        return { ...s, tracks: newTracks }
      })
    )
  }

  // 判断一个 session 的所有人是否都已作出授权选择
  function sessionAllDecided(session: RecordingSession) {
    return session.tracks.length > 0 && session.tracks.every((t) => t.allowUse !== null)
  }
  // 计算一个 session 中有几人同意发表
  function sessionAgreedCount(session: RecordingSession) {
    return session.tracks.filter((t) => t.allowUse === true).length
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[10px] border border-border bg-card">
      {/* 录音控制栏 */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Disc3 className="size-4 text-brand-pink" />
            本房间录音
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sessions.length === 0 ? "朋友们还没有录音" : `已录制 ${sessions.length} 段`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {recording && (
            <span className="flex items-center gap-2 font-mono text-sm text-brand-pink">
              <span className="size-2 animate-rec-pulse rounded-full bg-brand-pink" />
              {fmt(recTime)}
            </span>
          )}
          <button
            onClick={toggle}
            aria-label={recording ? "停止录音" : "开始录音"}
            className={`flex items-center gap-2 rounded-full pl-3 pr-5 text-sm font-bold text-white transition-transform hover:scale-[1.03] ${
              recording ? "bg-destructive" : "bg-brand-pink"
            }`}
          >
            <span
              className={`my-1 grid size-11 place-items-center rounded-full bg-white/20 ${
                recording ? "animate-rec-pulse" : ""
              }`}
            >
              {recording ? (
                <Square className="size-5 fill-current" />
              ) : (
                <Circle className="size-5 fill-current" />
              )}
            </span>
            {recording ? "停止" : "录音"}
          </button>
        </div>
      </div>

      {/* 录音记录 —— 可滚动 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
        {sessions.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            朋友们还没有录音
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                open={expanded === s.id}
                onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
                onTrackChoice={handleTrackChoice}
                allDecided={sessionAllDecided(s)}
                agreedCount={sessionAgreedCount(s)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SessionCard({
  session,
  open,
  onToggle,
  onTrackChoice,
  allDecided,
  agreedCount,
}: {
  session: RecordingSession
  open: boolean
  onToggle: () => void
  onTrackChoice: (sessionId: string, trackIndex: number, field: "allowUse" | "allowAttribution" | "allowDownload", value: boolean) => void
  allDecided: boolean
  agreedCount: number
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-secondary">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-[8px] bg-primary/20 text-xs font-bold text-brand-purple">
            {session.index}
          </span>
          <span>
            <span className="font-medium">段落 {session.index}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {session.duration} · {session.participants} 人
            </span>
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          {/* 分轨属性列表 */}
          <div className="flex flex-col gap-2">
            {session.tracks.map((t, i) => (
              <TrackRow
                key={i}
                track={t}
                index={i}
                sessionId={session.id}
                onTrackChoice={onTrackChoice}
              />
            ))}
          </div>

          {/* 去发表作品按钮 */}
          {allDecided && agreedCount > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-[10px] border border-brand-blue/30 bg-brand-blue/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Music className="size-4 text-brand-blue" />
                <span>
                  所有人已选择 · <span className="font-semibold text-brand-green">{agreedCount}</span> 人同意发表
                  {agreedCount < session.tracks.length && (
                    <span className="text-muted-foreground"> · {session.tracks.length - agreedCount} 人拒绝（音轨排除）</span>
                  )}
                </span>
              </div>
              <button
                onClick={() => alert("🎵 进入混音台 → 调整各轨音量/声相 → 发布到作品库")}
                className="flex items-center gap-2 rounded-full bg-brand-blue px-5 py-2 text-sm font-bold text-white transition-transform hover:scale-[1.03]"
              >
                <Music className="size-4" />
                去发表作品
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TrackRow({
  track,
  index,
  sessionId,
  onTrackChoice,
}: {
  track: Track
  index: number
  sessionId: string
  onTrackChoice: (sessionId: string, trackIndex: number, field: "allowUse" | "allowAttribution" | "allowDownload", value: boolean) => void
}) {
  const isSelf = track.member === "你"

  return (
    <div className="flex items-center gap-3 rounded-[8px] px-2 py-2 text-sm">
      {/* 乐器 icon + 用户名 */}
      <span>{track.instrumentEmoji}</span>
      <span className="w-14 shrink-0 font-medium">{track.member}</span>

      {/* 三个授权下拉选择器（只有自己可见） */}
      {isSelf && (
        <div className="flex items-center gap-4">
          {/* 授权使用权 */}
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allowUse}
              nullLabel="请选择"
              options={[
                { label: "可使用", value: true, className: "text-brand-green" },
                { label: "禁用", value: false, className: "text-destructive" },
              ]}
              onChange={(v) => onTrackChoice(sessionId, index, "allowUse", v)}
            />
            <HelpTip text="同意即可在发布的作品中使用你的分轨（不可撤销），禁用则不包含你的分轨" />
          </div>
          {/* 选择署名权 */}
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allowAttribution}
              nullLabel="请选择"
              options={[
                { label: "可署名", value: true, className: "text-brand-green" },
                { label: "匿名", value: false, className: "text-muted-foreground" },
              ]}
              onChange={(v) => onTrackChoice(sessionId, index, "allowAttribution", v)}
              disabled={track.allowUse !== true}
            />
            <HelpTip text="同意则在作品中展示你的用户名（不可撤销），匿名则隐藏用户名" />
          </div>
          {/* 选择下载权 */}
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allowDownload}
              nullLabel="请选择"
              options={[
                { label: "可下载", value: true, className: "text-brand-green" },
                { label: "禁下载", value: false, className: "text-destructive" },
              ]}
              onChange={(v) => onTrackChoice(sessionId, index, "allowDownload", v)}
            />
            <HelpTip text="同意则他人可下载你的分轨，禁用则仅你自己可下载" />
          </div>
        </div>
      )}

      {/* 非自己，只显示状态文本 */}
      {!isSelf && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {track.allowUse === true && <span className="text-brand-green"><Check className="inline size-3" /> 可使用</span>}
            {track.allowUse === false && <span className="text-destructive"><X className="inline size-3" /> 禁用</span>}
            {track.allowUse === null && <span>⏳ 选择中</span>}
          </span>
          {/* 署名状态（仅允许使用时显示） */}
          {track.allowUse === true && track.allowAttribution !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">
                {track.allowAttribution === true ? "可署名" : "匿名"}
              </span>
            </>
          )}
          {/* 下载状态（独立显示） */}
          {track.allowDownload !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">
                {track.allowDownload === true ? <span className="text-brand-green">可下载</span> : <span className="text-destructive">禁下载</span>}
              </span>
            </>
          )}
        </div>
      )}

      {/* 下载按钮 */}
      <div className="ml-auto">
        {isSelf ? (
          <button
            onClick={() => alert(`下载 ${track.member} 的分轨`)}
            className="grid size-7 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="下载我的分轨"
          >
            <Download className="size-3.5" />
          </button>
        ) : track.allowDownload === true ? (
          <button
            onClick={() => alert(`下载 ${track.member} 的分轨`)}
            className="grid size-7 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`下载 ${track.member} 的分轨`}
          >
            <Download className="size-3.5" />
          </button>
        ) : (
          <span
            className="grid size-7 place-items-center text-muted-foreground/40"
            title={track.allowDownload === false ? `${track.member} 禁止下载` : "待授权"}
          >
            <Ban className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}
