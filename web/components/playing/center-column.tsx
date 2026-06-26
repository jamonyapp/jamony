"use client"

import { useEffect, useRef, useState } from "react"
import { Circle, Square, ChevronDown, Disc3, ArrowRight, Download, Ban, Check, X, ChevronUp } from "lucide-react"
import { instrumentEmoji, type RecordingSession, type Track } from "@/lib/jam-data"

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

// 确认弹窗（①② 选择确认后写死不可改；去发表入口提示）
function ConfirmModal({ text, confirmLabel, onConfirm, onCancel }: { text: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70" onClick={onCancel}>
      <div className="w-[320px] rounded-[10px] border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-[8px] bg-accent py-2 text-sm font-medium text-muted-foreground hover:bg-accent/80">再想想</button>
          <button onClick={onConfirm} className="flex-1 rounded-[8px] bg-brand-pink py-2 text-sm font-bold text-white hover:brightness-110">{confirmLabel || "确认"}</button>
        </div>
      </div>
    </div>
  )
}

export function CenterColumn({
  chords,
  customTheme,
  currentBpm,
  roomId,
  myRole,
  currentUserId,
  realtimeSessions,
  realtimeRecordingActive,
}: {
  chords: string[]
  customTheme?: string
  currentBpm?: number
  roomId?: string
  myRole?: "musician" | "listener"
  currentUserId?: number
  realtimeSessions?: RecordingSession[] | null
  realtimeRecordingActive?: boolean | null
}) {
  const [todayTheme, setTodayTheme] = useState({ title: "加载中...", emoji: "🎵" })
  useEffect(() => {
    fetch("/api/daily-theme")
      .then(r => r.json())
      .then(data => { if (data.ok) setTodayTheme(data.theme) })
      .catch(() => {})
  }, [])

  const isListener = myRole === "listener"

  return (
    <main className="flex h-full flex-col gap-4 p-4">
      {/* 合奏大屏 */}
      <section className="relative aspect-video w-full shrink-0 overflow-hidden rounded-[10px] border" style={{ borderColor: "#1A1A1A" }}>
        <img src="/images/stage-backdrop.png" alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(60% 50% at 50% 40%, rgba(153,51,255,0.35), transparent 70%)" }} />
        <div className="relative flex h-full flex-col items-center justify-center gap-5 px-6 py-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">本房间主题</p>
            <p className="mt-2 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
              {customTheme && customTheme.length > 0 ? customTheme : `${todayTheme.emoji} ${todayTheme.title}`}
            </p>
          </div>
          {chords.length > 0 && (
            <div className="w-full">
              <p className="text-center text-xs uppercase tracking-[0.3em] text-white/50">和弦进程</p>
              <div className="mt-3"><ChordBoard chords={chords} /></div>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">拍速</p>
            <p className="mt-1 text-xl font-bold text-white lg:text-2xl">{currentBpm && currentBpm > 0 ? currentBpm + " BPM" : "custom"}</p>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: "linear-gradient(90deg, #00AAFF, #9933FF, #FF33AA, #BBEE00)" }} />
      </section>

      {/* 录音功能 —— 听众不可见 */}
      {!isListener && (
        <RecordingPanel
          roomId={roomId}
          currentUserId={currentUserId}
          realtimeSessions={realtimeSessions}
          realtimeRecordingActive={realtimeRecordingActive}
        />
      )}
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
    lines.length <= 2 ? "text-xl sm:text-2xl lg:text-3xl"
      : lines.length <= 4 ? "text-base sm:text-lg lg:text-xl"
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
        <div className="flex flex-col gap-1">{left.map((l, i) => <Line key={i} line={l} />)}</div>
        <ArrowRight className="size-8 shrink-0 text-brand-green lg:size-10" strokeWidth={3} />
        <div className="flex flex-col gap-1">{right.map((l, i) => <Line key={i} line={l} />)}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {lines.map((l, i) => <Line key={i} line={l} />)}
    </div>
  )
}

function RecordingPanel({
  roomId,
  currentUserId,
  realtimeSessions,
  realtimeRecordingActive,
}: {
  roomId?: string
  currentUserId?: number
  realtimeSessions?: RecordingSession[] | null
  realtimeRecordingActive?: boolean | null
}) {
  const [sessions, setSessions] = useState<RecordingSession[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingMine, setRecordingMine] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const [now, setNow] = useState(Date.now())
  const fetchingRef = useRef(false)

  // 首屏拉取一次 session 列表（之后由 socket 实时推送覆盖）
  useEffect(() => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}/sessions`)
      .then(r => r.json())
      .then(data => { if (data.ok) setSessions(data.sessions || []) })
      .catch(() => {})
  }, [roomId])

  // socket 实时推送优先
  useEffect(() => {
    if (realtimeSessions) setSessions(realtimeSessions)
  }, [realtimeSessions])

  // 录音状态同步（他人开始/停止录音）
  useEffect(() => {
    if (realtimeRecordingActive === null) return
    setRecording(realtimeRecordingActive)
    if (!realtimeRecordingActive) setRecordingMine(false)
  }, [realtimeRecordingActive])

  // 录音计时
  useEffect(() => {
    if (!recording) return
    const id = setInterval(() => setRecTime((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [recording])

  // 全局 1 秒滴答（倒计时显示用）
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 有 session 倒计时到点且仍未全员锁定 → 触发一次拉取（服务端懒处理超时默认并广播）
  useEffect(() => {
    if (!roomId) return
    const hasExpired = sessions.some(s => s.expires_at && new Date(s.expires_at).getTime() < now && !s.all_locked)
    if (hasExpired && !fetchingRef.current) {
      fetchingRef.current = true
      fetch(`/api/rooms/${roomId}/sessions`)
        .then(r => r.json())
        .then(data => { if (data.ok) setSessions(data.sessions || []) })
        .catch(() => {})
        .finally(() => { fetchingRef.current = false })
    }
  }, [now, sessions, roomId])

  const startRecording = async () => {
    if (!roomId || !currentUserId) return
    const res = await fetch(`/api/rooms/${roomId}/recording/start`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId }),
    })
    const data = await res.json()
    if (data.ok) {
      setRecording(true); setRecordingMine(true); setRecTime(0)
    } else {
      alert(data.msg || "无法开始录音")
    }
  }

  const stopRecording = async () => {
    if (!roomId || !currentUserId) return
    const res = await fetch(`/api/rooms/${roomId}/recording/stop`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, duration: fmt(recTime) }),
    })
    const data = await res.json()
    if (data.ok) {
      setRecording(false); setRecordingMine(false); setRecTime(0)
    }
  }

  async function patchTrack(sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) {
    if (!roomId || !currentUserId) return
    await fetch(`/api/rooms/${roomId}/sessions/${sessionId}/tracks/${trackId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUserId, field, value }),
    })
    // 成功后由 socket sessions-update 推送新状态覆盖
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
            onClick={() => (recordingMine ? stopRecording() : !recording && startRecording())}
            disabled={recording && !recordingMine}
            aria-label={recording ? "停止录音" : "开始录音"}
            className={`flex items-center gap-2 rounded-full pl-3 pr-5 text-sm font-bold text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
              recording ? "bg-destructive" : "bg-brand-pink"
            }`}
          >
            <span className={`my-1 grid size-11 place-items-center rounded-full bg-white/20 ${recording ? "animate-rec-pulse" : ""}`}>
              {recording ? <Square className="size-5 fill-current" /> : <Circle className="size-5 fill-current" />}
            </span>
            {recording ? (recordingMine ? "停止" : "录音中") : "录音"}
          </button>
        </div>
      </div>

      {/* 录音记录 —— 可滚动 */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-4">
        {sessions.length === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">朋友们还没有录音</div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                open={expanded === s.id}
                now={now}
                roomId={roomId}
                currentUserId={currentUserId}
                onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))}
                onPatch={patchTrack}
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
  now,
  roomId,
  currentUserId,
  onToggle,
  onPatch,
}: {
  session: RecordingSession
  open: boolean
  now: number
  roomId?: string
  currentUserId?: number
  onToggle: () => void
  onPatch: (sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) => void
}) {
  const remaining = session.expires_at ? Math.max(0, Math.ceil((new Date(session.expires_at).getTime() - now) / 1000)) : 0
  const showCountdown = !session.all_locked && remaining > 0
  const canPublish = session.all_locked && session.agreed_count > 0
  const [publishOpen, setPublishOpen] = useState(false)
  const refusedCount = session.tracks.filter(t => !t.is_system && t.allow_use === false).length

  return (
    <div className="rounded-[10px] border border-border bg-secondary">
      {/* 头部：段落信息 + 倒计时 + 发表按钮 + 展开 */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <button onClick={onToggle} className="flex items-center gap-3 text-left text-sm transition-colors hover:opacity-80">
          <span className="grid size-7 place-items-center rounded-[8px] bg-primary/20 text-xs font-bold text-brand-purple">{session.index}</span>
          <span>
            <span className="font-medium">段落 {session.index}</span>
            <span className="ml-2 text-xs text-muted-foreground">{session.duration} · {session.tracks.filter(t => !t.is_system).length} 人</span>
          </span>
        </button>

        <div className="flex items-center gap-3">
          {/* 倒计时 —— 全员共看一个，显示在去发表按钮左边 */}
          {showCountdown && (
            <span className="font-mono text-xs text-brand-pink">{fmt(remaining)} 后默认授权+署名</span>
          )}
          {/* 发表状态卡片 —— 全员 ①② 锁定后出现 */}
          {canPublish && (
            <>
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-brand-green">{session.agreed_count}人已授权</span> · {refusedCount}人拒绝
              </span>
              <button
                onClick={() => setPublishOpen(true)}
                className="rounded-full bg-brand-blue px-4 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.03]"
              >
                去发表
              </button>
            </>
          )}
          <button onClick={onToggle} className="text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-3 py-3">
          <div className="flex flex-col gap-2">
            {session.tracks.map((t) => (
              <TrackRow key={t.id} track={t} session={session} roomId={roomId} currentUserId={currentUserId} onPatch={onPatch} />
            ))}
          </div>
        </div>
      )}

      {publishOpen && (
        <ConfirmModal
          text="你正代表所有乐手进入发表流程，感谢你的义务付出——jamony。"
          confirmLabel="OK"
          onConfirm={() => setPublishOpen(false)}
          onCancel={() => setPublishOpen(false)}
        />
      )}
    </div>
  )
}

function TrackRow({
  track,
  session,
  roomId,
  currentUserId,
  onPatch,
}: {
  track: Track
  session: RecordingSession
  roomId?: string
  currentUserId?: number
  onPatch: (sessionId: number, trackId: number, field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) => void
}) {
  const isSelf = !track.is_system && track.user_id === currentUserId
  // 待确认的选择（①② 选完需弹窗确认才写死；③ 直接提交）
  const [pending, setPending] = useState<{ field: "allow_use" | "allow_attribution"; value: boolean } | null>(null)

  const emoji = track.is_system ? "🥁" : instrumentEmoji(track.instrument_category)

  function handleSelect(field: "allow_use" | "allow_attribution" | "allow_download", value: boolean) {
    if (field === "allow_download") {
      onPatch(session.id, track.id, field, value)
      return
    }
    setPending({ field, value })
  }

  const confirmText = pending?.field === "allow_attribution"
    ? "确认后不可修改。后续可去「个人页面 → 我参与的作品」取消署名（不可恢复）。"
    : "确认你的选择吗？确认后不可修改。"

  return (
    <div className="flex items-center gap-3 rounded-[8px] px-2 py-1 text-sm">
      <span>{emoji}</span>
      <span className="w-20 shrink-0 font-medium">{track.nickname}</span>

      {/* 三个授权下拉（只有自己可见） */}
      {isSelf && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_use}
              nullLabel="请选择"
              disabled={track.use_locked}
              options={[
                { label: "可使用", value: true, className: "text-brand-green" },
                { label: "禁用", value: false, className: "text-destructive" },
              ]}
              onChange={(v) => handleSelect("allow_use", v)}
            />
            <HelpTip text="同意即可在发布的作品中使用你的分轨（不可撤销），禁用则不包含你的分轨" />
          </div>
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_attribution}
              nullLabel="请选择"
              disabled={track.allow_use !== true || track.attribution_locked}
              options={[
                { label: "可署名", value: true, className: "text-brand-green" },
                { label: "匿名", value: false, className: "text-muted-foreground" },
              ]}
              onChange={(v) => handleSelect("allow_attribution", v)}
            />
            <HelpTip text="同意则在作品中展示你的用户名（不可撤销），匿名则隐藏用户名" />
          </div>
          <div className="flex items-center gap-1">
            <DropdownSelect
              value={track.allow_download}
              nullLabel="请选择"
              options={[
                { label: "可下载", value: true, className: "text-brand-green" },
                { label: "禁下载", value: false, className: "text-destructive" },
              ]}
              onChange={(v) => handleSelect("allow_download", v)}
            />
            <HelpTip text="同意则他人可下载你的分轨，禁用则仅你自己可下载" />
          </div>
        </div>
      )}

      {/* 非自己（含 jamony-looper 系统轨）：只显示状态文本 */}
      {!isSelf && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {track.allow_use === true && <span className="text-brand-green"><Check className="inline size-3" /> 可使用</span>}
            {track.allow_use === false && <span className="text-destructive"><X className="inline size-3" /> 禁用</span>}
            {track.allow_use === null && <span>⏳ 选择中</span>}
          </span>
          {track.allow_use === true && track.allow_attribution !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">{track.allow_attribution === true ? "可署名" : "匿名"}</span>
            </>
          )}
          {track.allow_download !== null && (
            <>
              <span className="text-[11px] text-muted-foreground">·</span>
              <span className="text-[11px] text-muted-foreground">
                {track.allow_download === true ? <span className="text-brand-green">可下载</span> : <span className="text-destructive">禁下载</span>}
              </span>
            </>
          )}
        </div>
      )}

      {/* 下载按钮：自己始终可见；他人 ③=可下载见下载 icon，否则见禁下载 icon */}
      <div className="ml-auto">
        {isSelf ? (
          <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download?userId=${currentUserId}`} className="grid size-7 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="下载我的分轨" download>
            <Download className="size-3.5" />
          </a>
        ) : track.allow_download === true ? (
          <a href={`/api/rooms/${roomId}/sessions/${session.id}/tracks/${track.id}/download?userId=${currentUserId}`} className="grid size-7 place-items-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={`下载 ${track.nickname} 的分轨`} download>
            <Download className="size-3.5" />
          </a>
        ) : (
          <span className="grid size-7 place-items-center text-muted-foreground/40" title={track.allow_download === false ? `${track.nickname} 禁止下载` : "待授权"}>
            <Ban className="size-3.5" />
          </span>
        )}
      </div>

      {/* ①② 确认弹窗 */}
      {pending && (
        <ConfirmModal
          text={confirmText}
          onConfirm={() => { onPatch(session.id, track.id, pending.field, pending.value); setPending(null) }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
