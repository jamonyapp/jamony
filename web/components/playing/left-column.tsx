"use client"

import { Fragment, useEffect, useState } from "react"
import { Dices, Send, Wrench, Sparkles, PowerOff, Pencil, Lightbulb, Headphones, MessageSquareText } from "lucide-react"
import {
  DAILY_THEME,
  CHORD_STYLES,
  PHRASE_COUNTS,
  CHORD_POOLS,
  generateProgression,
} from "@/lib/jam-data"

type Tool = "chords" | "metronome"

export function LeftColumn({
  onPushChord,
  onPushTheme,
  audioConnected,
  roomGone,
  myRole,
  roomName,
  onDisconnect,
  onReconnect,
}: {
  onPushChord: (chords: string[], style: string) => void
  onPushTheme: (theme: string) => void
  audioConnected: boolean
  roomGone?: boolean
  myRole: "musician" | "listener"
  roomName?: string
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const [tool, setTool] = useState<Tool>("chords")
  const [style, setStyle] = useState<string>(CHORD_STYLES[0])
  const [phrases, setPhrases] = useState<number>(2)
  const [chords, setChords] = useState<string[]>([])
  const [customMode, setCustomMode] = useState(false)
  const [customInput, setCustomInput] = useState("")
  const [customTheme, setCustomTheme] = useState("")
  const [dailyTheme, setDailyTheme] = useState(DAILY_THEME)

  const isMusician = myRole === "musician" || audioConnected

  // Load today's theme
  useEffect(() => {
    fetch("/api/daily-theme")
      .then(r => r.json())
      .then(data => { if (data.ok) setDailyTheme(data.theme) })
      .catch(() => {})
  }, [])

  const displayChords = customMode
    ? customInput.split(/[\s,，|｜]+/).map((c) => c.trim()).filter(Boolean)
    : chords

  const handleGenerate = () => setChords(generateProgression(style, phrases))
  const handlePush = () => {
    if (displayChords.length > 0) onPushChord(displayChords, style)
  }

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin p-4" style={{ background: "#000" }}>
      {/* 今日主题 */}
      <section className="rounded-[10px] border p-4" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4" style={{ color: "#BBEE00" }} />
          <span>今日 jamony 主题</span>
        </div>
        <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>{dailyTheme.emoji} {dailyTheme.title}</p>

      </section>

      {/* 自定义主题（仅合奏者可见） */}
      {isMusician && !roomGone && (
        <section className="rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <MessageSquareText className="h-3.5 w-3.5" style={{ color: "#00AAFF" }} />
            <span>自定义主题</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input type="text" value={customTheme}
              onChange={(e) => setCustomTheme(e.target.value)}
              placeholder="输入你的主题..."
              className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-[#666]"
              style={{ background: "#141414", borderColor: "#2A2A2A" }}
            />
            <button onClick={() => onPushTheme(customTheme)}
              disabled={!customTheme.trim()}
              className="shrink-0 rounded-[8px] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              style={{ background: "#00AAFF" }}>
              推送到大屏
            </button>
          </div>
        </section>
      )}

      {/* 听众模式 */}
      {!isMusician ? (
        <section className="flex flex-1 flex-col items-center justify-center rounded-[10px] border p-6" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <Headphones className="h-12 w-12" style={{ color: "#FF33AA" }} />
          <p className="mt-4 text-lg font-bold text-white">正在收听</p>
          <p className="mt-2 text-center text-sm" style={{ color: "#8A8A8A" }}>
            不过瘾？<br/>点击下方，一起玩！
          </p>
        </section>
      ) : roomGone ? null : (
        <section className="flex flex-1 flex-col rounded-[10px] border p-4" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Wrench className="h-4 w-4" style={{ color: "#9933FF" }} />
            <span>🧰 Jam 魔盒</span>
          </div>

          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs" style={{ color: "#8A8A8A" }}>选择工具</span>
            <select value={tool} onChange={(e) => setTool(e.target.value as Tool)}
              className="rounded-[10px] border px-3 py-2.5 text-sm font-medium text-white outline-none"
              style={{ borderColor: "#1A1A1A", background: "#141414" }}>
              <option value="chords">💡 灵感进程</option>
              <option value="metronome">🥁 节拍器</option>
            </select>
          </label>

          <div className="mt-4 flex-1">
            {tool === "chords" ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#8A8A8A" }}>
                  <Lightbulb className="h-3.5 w-3.5" style={{ color: "#BBEE00" }} />
                  <span>灵感进程</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>风格</span>
                    <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={customMode}
                      className="rounded-[10px] border px-2 py-2 text-sm text-white outline-none disabled:opacity-50"
                      style={{ borderColor: "#1A1A1A", background: "#141414" }}>
                      {CHORD_STYLES.map((s) => (<option key={s} value={s}>{CHORD_POOLS[s].emoji} {s}</option>))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>乐句数量</span>
                    <select value={phrases} onChange={(e) => setPhrases(Number(e.target.value))} disabled={customMode}
                      className="rounded-[10px] border px-2 py-2 text-sm text-white outline-none disabled:opacity-50"
                      style={{ borderColor: "#1A1A1A", background: "#141414" }}>
                      {PHRASE_COUNTS.map((n) => (<option key={n} value={n}>{n} 句</option>))}
                    </select>
                  </label>
                </div>

                <div className="mt-3 min-h-[64px] rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#141414" }}>
                  {displayChords.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {Array.from({ length: Math.ceil(displayChords.length / 4) }).map((_, row) => (
                        <div key={row} className="flex items-center">
                          {Array.from({ length: 4 }).map((_, col) => {
                            const chord = displayChords[row * 4 + col]
                            return (
                              <Fragment key={col}>
                                <span className="flex-1 text-center font-mono text-sm font-semibold tracking-wide text-white">{chord ?? ""}</span>
                                {col < 3 && <span className="shrink-0 px-1 text-sm" style={{ color: "#666" }}>|</span>}
                              </Fragment>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-2 text-center text-sm" style={{ color: "#666" }}>{customMode ? "请输入和弦…" : "点击生成获取灵感"}</p>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={handleGenerate} disabled={customMode}
                    className="flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: "#141414", color: "#B0B0B0" }}>
                    <Dices className="h-4 w-4" style={{ color: "#00AAFF" }} />
                    生成
                  </button>
                  <button onClick={handlePush} disabled={displayChords.length === 0}
                    className="flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ background: "#9933FF" }}>
                    <Send className="h-4 w-4" />
                    推送至大屏
                  </button>
                </div>
              </div>
            ) : (
              <MetronomeTool />
            )}
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: "#666" }}>更多工具即将上线…</p>
        </section>
      )}

      {/* 底部按钮 */}
      {roomGone ? (
        <button disabled
          className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-base font-semibold cursor-not-allowed"
          style={{ background: "#222", color: "#666" }}>
          <PowerOff className="h-5 w-5" />
          房间已关闭
        </button>
      ) : audioConnected ? (
        <button onClick={onDisconnect}
          className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#FF5C5C" }}>
          <PowerOff className="h-5 w-5" />
          断开连接
        </button>
      ) : (
        <button onClick={onReconnect}
          className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-base font-semibold transition-opacity hover:brightness-110 active:scale-[0.97]"
          style={{ background: "#BBEE00", color: "#0D0D0D" }}>
          <PowerOff className="h-5 w-5" />
          音频连接
        </button>
      )}
    </aside>
  )
}

function MetronomeTool() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-2">
      <p className="font-mono text-3xl font-bold text-white">120 BPM</p>
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-3 w-3 rounded-full" style={{ background: "#BBEE00", animation: "rec-pulse 1.1s ease-in-out infinite", animationDelay: `${i * 0.5}s` }} />
        ))}
      </div>
      <p className="text-xs" style={{ color: "#8A8A8A" }}>🎵 即将上线</p>
    </div>
  )
}
