"use client"

import { Fragment, useState } from "react"
import { Dices, Send, Wrench, Sparkles, PowerOff, Pencil, Lightbulb } from "lucide-react"
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
  audioConnected,
  onDisconnect,
  onReconnect,
}: {
  onPushChord: (chords: string[], style: string) => void
  audioConnected: boolean
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const [tool, setTool] = useState<Tool>("chords")
  const [style, setStyle] = useState<string>(CHORD_STYLES[0])
  const [phrases, setPhrases] = useState<number>(2)
  // 初始用确定性进程，避免 SSR / 客户端随机不一致；随机仅在点击“生成”时发生
  const [chords, setChords] = useState<string[]>([])
  const [customMode, setCustomMode] = useState(false)
  const [customInput, setCustomInput] = useState("")

  const displayChords = customMode
    ? customInput
        .split(/[\s,，|｜]+/)
        .map((c) => c.trim())
        .filter(Boolean)
    : chords

  const handleGenerate = () => setChords(generateProgression(style, phrases))
  const handlePush = () => {
    if (displayChords.length > 0) onPushChord(displayChords, style)
  }

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin p-4">
      {/* 全员 Jam — 今日主题 */}
      <section className="rounded-[10px] border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>🎸</span>
          <span>全员 Jam</span>
          <Sparkles className="ml-auto size-4 text-brand-green" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">jamony 今日主题</p>
        <p className="mt-2 text-lg font-semibold brand-text-gradient">{DAILY_THEME.title}</p>
      </section>

      {/* Jam 魔盒 */}
      <section className="flex flex-1 flex-col rounded-[10px] border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Wrench className="size-4 text-brand-purple" />
          <span>🧰 Jam 魔盒</span>
        </div>

        {/* 工具选择下拉 */}
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">选择工具</span>
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value as Tool)}
            className="rounded-[10px] border border-border bg-secondary px-3 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="chords">💡 灵感进程</option>
            <option value="metronome">🥁 节拍器</option>
          </select>
        </label>

        {/* 工具内容 */}
        <div className="mt-4 flex-1">
          {tool === "chords" ? (
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Lightbulb className="size-3.5 text-brand-green" />
                <span>灵感进程</span>
              </div>

              {/* 风格 + 句数选择 */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">风格</span>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    disabled={customMode}
                    className="rounded-[10px] border border-border bg-secondary px-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    {CHORD_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {CHORD_POOLS[s].emoji} {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">乐句数量</span>
                  <select
                    value={phrases}
                    onChange={(e) => setPhrases(Number(e.target.value))}
                    disabled={customMode}
                    className="rounded-[10px] border border-border bg-secondary px-2 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    {PHRASE_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n} 句
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* 自定义输入切换 */}
              <button
                onClick={() => setCustomMode((v) => !v)}
                className={`mt-3 flex items-center justify-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-xs font-medium transition-colors ${
                  customMode
                    ? "border-brand-purple bg-primary/15 text-foreground"
                    : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Pencil className="size-3.5" />
                {customMode ? "自定义模式（已开启）" : "切换到自定义输入"}
              </button>

              {/* 自定义输入框 */}
              {customMode && (
                <input
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="手动输入和弦，用空格分隔，如 C G Am F"
                  className="mt-2 rounded-[10px] border border-border bg-secondary px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
              )}

              {/* 进程展示 — 每行固定 4 个和弦，整齐对齐 */}
              <div className="mt-3 min-h-[64px] rounded-[10px] border border-border bg-secondary p-3">
                {displayChords.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {Array.from({ length: Math.ceil(displayChords.length / 4) }).map((_, row) => (
                      <div key={row} className="flex items-center">
                        {Array.from({ length: 4 }).map((_, col) => {
                          const chord = displayChords[row * 4 + col]
                          return (
                            <Fragment key={col}>
                              <span className="flex-1 text-center font-mono text-sm font-semibold tracking-wide text-foreground">
                                {chord ?? ""}
                              </span>
                              {col < 3 && <span className="shrink-0 px-1 text-sm text-muted-foreground">|</span>}
                            </Fragment>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    {customMode ? "请输入和弦…" : "点击生成获取灵感"}
                  </p>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={customMode}
                  className="flex items-center justify-center gap-1.5 rounded-[10px] bg-secondary px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Dices className="size-4 text-brand-blue" />
                  生成
                </button>
                <button
                  onClick={handlePush}
                  disabled={displayChords.length === 0}
                  className="flex items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="size-4" />
                  推送至大屏
                </button>
              </div>
            </div>
          ) : (
            <MetronomeTool />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">更多工具即将上线…</p>
      </section>

      {/* 音频连接状态 */}
      {audioConnected ? (
        <button
          onClick={onDisconnect}
          className="flex items-center justify-center gap-2 rounded-[10px] bg-destructive px-4 py-3 text-base font-semibold text-destructive-foreground shadow-[0_0_24px_-6px_var(--brand-pink)] transition-opacity hover:opacity-90"
          style={{ color: "#fff" }}
        >
          <PowerOff className="size-5" />
          断开连接
        </button>
      ) : (
        <button
          onClick={onReconnect}
          className="flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-base font-semibold text-white transition-opacity hover:brightness-110 active:scale-[0.97]"
          style={{ background: "#BBEE00", color: "#0D0D0D" }}
        >
          <PowerOff className="size-5" />
          音频连接
        </button>
      )}
    </aside>
  )
}

function MetronomeTool() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-2">
      <p className="font-mono text-3xl font-bold text-foreground">120 BPM</p>
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-3 rounded-full bg-brand-green animate-rec-pulse"
            style={{ animationDelay: `${i * 0.5}s` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">🎵 即将上线</p>
    </div>
  )
}
