"use client"

import { useEffect, useRef, useState } from "react"
import { Circle, Square, ChevronDown, Play, Pause, Disc3, ArrowRight, Download } from "lucide-react"
import { DAILY_THEME, RECORDINGS, type RecordingSession } from "@/lib/jam-data"

function fmt(total: number) {
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function parseDuration(d: string) {
  const [m, s] = d.split(":").map(Number)
  return (m || 0) * 60 + (s || 0)
}

export function CenterColumn({ chords }: { chords: string[] }) {
  const [elapsed, setElapsed] = useState(23 * 60 + 42)

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <main className="flex h-full flex-col gap-4 p-4">
      {/* 合奏大屏 —— 固定 16:9 比例，不随下方录音模块变化 */}
      <section className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[10px] border border-border">
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
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">当前主题</p>
            <p className="mt-2 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
              {DAILY_THEME.emoji} {DAILY_THEME.title}
            </p>
          </div>

          <div className="w-full">
            <p className="text-center text-xs uppercase tracking-[0.3em] text-white/50">和弦进程</p>
            <div className="mt-3">
              <ChordBoard chords={chords} />
            </div>
          </div>

          <div className="flex items-center gap-10">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">拍速</p>
              <p className="mt-1 text-xl font-bold text-white lg:text-2xl">120 BPM</p>
            </div>
            <div className="h-10 w-px bg-white/15" />
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">已合奏</p>
              <p className="mt-1 font-mono text-xl font-bold text-white lg:text-2xl">{fmt(elapsed)}</p>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 brand-gradient" />
      </section>

      {/* 录音功能 —— 占据剩余空间，内部可滚动 */}
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

  // 行数越多字号越小，保证排列整齐
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

  // 超过 4 行（即 > 4 句）时左右分栏
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
          { member: "阿May", instrumentEmoji: "🎸", duration: fmt(recTime) },
          { member: "你", instrumentEmoji: "🎸", duration: fmt(recTime) },
          { member: "老K", instrumentEmoji: "🎻", duration: fmt(recTime) },
          { member: "小鼓手", instrumentEmoji: "🥁", duration: fmt(recTime) },
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
}: {
  session: RecordingSession
  open: boolean
  onToggle: () => void
}) {
  const total = parseDuration(session.duration)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [muted, setMuted] = useState<Set<number>>(new Set())
  const [solo, setSolo] = useState<Set<number>>(new Set())
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setPos((p) => {
        if (p + 1 >= total) {
          setPlaying(false)
          return total
        }
        return p + 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [playing, total])

  function togglePlay() {
    if (pos >= total) setPos(0)
    setPlaying((p) => !p)
  }

  function stop() {
    setPlaying(false)
    setPos(0)
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = barRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setPos(Math.round(ratio * total))
  }

  function toggleSet(setter: typeof setMuted, idx: number) {
    setter((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  // 判断某轨在当前回放中是否发声：有独奏时只有独奏轨发声；否则未静音即发声
  function isAudible(idx: number) {
    if (solo.size > 0) return solo.has(idx)
    return !muted.has(idx)
  }

  const progress = total > 0 ? (pos / total) * 100 : 0

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
          {/* 主播放控制 + 进度条 */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              aria-label={playing ? "暂停" : "播放"}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-blue text-white transition-opacity hover:opacity-90"
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </button>
            <button
              onClick={stop}
              aria-label="停止"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground ring-1 ring-border transition-colors hover:bg-accent"
            >
              <Square className="size-3.5 fill-current" />
            </button>
            <span className="font-mono text-xs text-muted-foreground">{fmt(pos)}</span>
            <div
              ref={barRef}
              onClick={seek}
              className="group relative h-2 flex-1 cursor-pointer rounded-full bg-white/15 ring-1 ring-inset ring-white/10"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full brand-gradient"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-xs text-muted-foreground">{session.duration}</span>
            <button
              onClick={() => alert("下载功能即将上线，敬请期待！")}
              aria-label="下载该段全部分轨"
              title="即将开放"
              className="group relative grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground ring-1 ring-border transition-colors hover:bg-accent"
            >
              <Download className="size-4" />
              <span className="pointer-events-none absolute -top-7 right-0 whitespace-nowrap rounded-[6px] bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 ring-1 ring-border transition-opacity group-hover:opacity-100">
                即将开放
              </span>
            </button>
          </div>

          {/* 分轨列表 + M/S 控制 */}
          <div className="mt-3 flex flex-col gap-1">
            {session.tracks.map((t, i) => {
              const audible = isAudible(i)
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-[8px] px-2 py-2 text-sm transition-opacity ${
                    audible ? "" : "opacity-40"
                  }`}
                >
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleSet(setMuted, i)}
                      aria-label="静音该轨"
                      className={`grid size-6 place-items-center rounded-[6px] text-xs font-bold transition-colors ${
                        muted.has(i)
                          ? "bg-destructive text-white"
                          : "bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={() => toggleSet(setSolo, i)}
                      aria-label="独奏该轨"
                      className={`grid size-6 place-items-center rounded-[6px] text-xs font-bold transition-colors ${
                        solo.has(i)
                          ? "bg-brand-green text-black"
                          : "bg-accent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      S
                    </button>
                  </div>
                  <span>{t.instrumentEmoji}</span>
                  <span className="font-medium">{t.member}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {t.duration}.wav
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
