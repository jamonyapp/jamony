"use client"

import { Fragment, useEffect, useState } from "react"
import { LevelMeter } from "@/components/playing/level-meter"
import { useParams } from "next/navigation"
import { Sparkles, PowerOff, Plug, Headphones, Play, Square } from "lucide-react"
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
  customTheme,
  chordTextFromPush,
  realtimeBpm,
  audioConnected,
  roomGone,
  myRole,
  roomName,
  roomPort,
  listenerActive,
  listenerKey,
  onStartListening,
  onDisconnect,
  onReconnect,
}: {
  onPushChord: (chords: string[], style: string) => void
  onPushTheme: (theme: string) => void
  customTheme?: string
  chordTextFromPush?: string
  realtimeBpm?: number
  audioConnected: boolean
  roomGone?: boolean
  myRole: "musician" | "listener"
  roomName?: string
  roomPort?: number
  listenerActive?: boolean
  listenerKey?: number
  onStartListening?: () => void
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const [tool, setTool] = useState<Tool>("chords")
  const [style, setStyle] = useState<string>(CHORD_STYLES[0])
  const [phrases, setPhrases] = useState<number>(2)
  const [chordText, setChordText] = useState("")
  const [customThemeInput, setCustomThemeInput] = useState("")
  // 同步来自他人的和弦推送
  useEffect(() => { if (chordTextFromPush) setChordText(chordTextFromPush) }, [chordTextFromPush])
  const params = useParams()
  const [dailyTheme, setDailyTheme] = useState(DAILY_THEME)

  const isMusician = myRole === "musician" || audioConnected

  // Load today's theme
  useEffect(() => {
    fetch("/api/daily-theme")
      .then(r => r.json())
      .then(data => { if (data.ok) setDailyTheme(data.theme) })
      .catch(() => {})
  }, [])

  const handleGenerate = () => {
    const prog = generateProgression(style, phrases)
    const rows = []
    for (let i = 0; i < prog.length; i += 4) {
      rows.push(prog.slice(i, i + 4).join('  |  '))
    }
    setChordText(rows.join('\n'))
  }
  const handlePush = () => {
    const chords = chordText.split(/[\s,，|｜]+/).map(c => c.trim()).filter(Boolean)
    if (chords.length > 0) onPushChord(chords, style)
  }


  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin p-4" style={{ background: "#000" }}>
      {/* 今日主题 + 自定义主题（合并） */}
      <section className="rounded-[10px] border p-4" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4" style={{ color: "#BBEE00" }} />
          <span>今日 jamony 主题</span>
        </div>

        <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>{dailyTheme.emoji} {dailyTheme.title}</p>

        {isMusician && !roomGone && (
          <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "#1A1A1A" }}>
            <input type="text" value={customThemeInput}
              onChange={(e) => setCustomThemeInput(e.target.value)}
              placeholder="输入你的主题..."
              className="min-w-0 flex-1 rounded-[8px] border px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-[#666]"
              style={{ background: "#141414", borderColor: "#2A2A2A" }}
            />
            <button onClick={() => onPushTheme(customThemeInput)}
              disabled={!customThemeInput.trim()}
              className="shrink-0 rounded-[8px] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              style={{ background: "#00AAFF" }}>
              推至大屏
            </button>
          </div>
        )}
      </section>

      {/* 听众模式 */}
      {!isMusician ? (
        <section className="flex flex-1 flex-col items-center justify-center rounded-[10px] border p-6" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <Headphones className="h-10 w-10" style={{ color: "#BBEE00" }} />
          <p className="mt-4 text-lg font-bold text-white">{listenerActive ? "收听中" : ""}</p>
          <p className="mt-2 text-center text-sm" style={{ color: "#8A8A8A" }}>
            不过瘾？<br/>接上乐器，一起玩！
          </p>

          {listenerActive && <LevelMeter key={listenerKey} port={roomPort} active={true} />}

          {onStartListening && (
            <button onClick={onStartListening}
              className="mt-5 rounded-[8px] px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:brightness-110 active:scale-[0.97]"
              style={{ background: listenerActive ? "#FF5C5C" : "linear-gradient(90deg, #9933FF, #FF33AA)" }}>
              {listenerActive ? "断开收听" : "开始收听"}
            </button>
          )}
        </section>
      ) : roomGone ? null : (
        <section className="flex flex-1 flex-col rounded-[10px] border p-4" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">

            <span>🧰 Jam 魔盒</span>
          </div>

          <label className="mt-3 flex flex-col gap-1">
            <span className="text-xs" style={{ color: "#8A8A8A" }}>选择工具</span>
            <select value={tool} onChange={(e) => setTool(e.target.value as Tool)}
              className="rounded-[10px] border px-3 py-2.5 text-sm font-medium text-white outline-none"
              style={{ borderColor: "#1A1A1A", background: "#141414" }}>
              <option value="chords">💡 灵感进程</option>
              <option value="drums">🥁 鼓机</option>
            </select>
          </label>

          <div className="mt-4 flex-1">
            {tool === "chords" ? (
              <div className="flex h-full flex-col">
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>风格</span>
                    <select value={style} onChange={(e) => setStyle(e.target.value)} className="rounded-[10px] border px-2 py-2 text-sm text-white outline-none"
                      style={{ borderColor: "#1A1A1A", background: "#141414" }}>
                      {CHORD_STYLES.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>乐句数量</span>
                    <select value={phrases} onChange={(e) => setPhrases(Number(e.target.value))}
                      className="rounded-[10px] border px-2 py-2 text-sm text-white outline-none disabled:opacity-50"
                      style={{ borderColor: "#1A1A1A", background: "#141414" }}>
                      {PHRASE_COUNTS.map((n) => (<option key={n} value={n}>{n} 句</option>))}
                    </select>
                  </label>
                </div>

                <textarea value={chordText} onChange={(e) => setChordText(e.target.value)}
                  placeholder="输入或点击下方随机生成"
                  className="mt-3 min-h-[80px] flex-1 w-full resize-none rounded-[8px] border p-2 font-mono text-sm text-white outline-none scrollbar-thin"
                  style={{ borderColor: "#1A1A1A", background: "#141414" }}
                   />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={handleGenerate}
                    className="rounded-[6px] py-1.5 text-xs font-medium disabled:opacity-40"
                    style={{ background: "#222", color: "#DDD" }}>
                    随机生成
                  </button>
                  <button onClick={handlePush} disabled={!chordText.trim()}
                    className="rounded-[6px] py-1.5 text-xs font-medium text-white disabled:opacity-40"
                    style={{ background: "#9933FF" }}>
                    推至大屏
                  </button>
                </div>
              </div>
            ) : (
              <DrumMachineTool roomId={params?.id as string} realtimeBpm={realtimeBpm || 0} />
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
          <Plug className="h-5 w-5" />
          音频连接
        </button>
      )}
    </aside>
  )
}

function DrumMachineTool({ roomId, realtimeBpm }: { roomId?: string; realtimeBpm?: number }) {
  const [running, setRunning] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [style, setStyle] = useState("rock")
  const [styles, setStyles] = useState<string[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadText, setLoadText] = useState("")
  // 实时同步其他合奏者的鼓机操作
  useEffect(() => {
    if (realtimeBpm && realtimeBpm > 0) setRunning(true)
    else if (realtimeBpm === 0) setRunning(false)
  }, [realtimeBpm])

  // 定时心跳检测（掉线/进程被杀自动恢复）
  useEffect(() => {
    if (!roomId) return
    const interval = setInterval(() => {
      fetch(`/api/rooms/${roomId}/drums/status`)
        .then(r => r.json())
        .then(data => { if (data.ok) setRunning(data.running) })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [roomId])

  useEffect(() => {
    fetch("/api/drums/styles")
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setStyles(Object.keys(data.styles))
          setFiles(data.styles.rock || [])
        }
      })
      .catch(() => {})
  }, [])

  // 页面加载时检查鼓机是否已在运行
  useEffect(() => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}/drums/status`)
      .then(r => r.json())
      .then(data => { if (data.ok && data.running) setRunning(true) })
      .catch(() => {})
  }, [roomId])

  useEffect(() => {
    fetch("/api/drums/styles")
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const flist = data.styles[style] || []
          setFiles(flist)
          setSelectedFile(flist[Math.floor(Math.random() * flist.length)] || "")
        }
      })
      .catch(() => {})
  }, [style])

  const start = async () => {
    if (!roomId) return
    setLoading(true)
    setLoadText("启动中…")
    const timer1 = setTimeout(() => setLoadText("音色渲染…"), 1500)
    const timer2 = setTimeout(() => setLoadText("同步其他乐手…"), 3500)
    try {
      const res = await fetch(`/api/rooms/${roomId}/drums/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, bpm, file: selectedFile }),
      })
      const data = await res.json()
      clearTimeout(timer1); clearTimeout(timer2)
      if (data.ok) setRunning(true)
    } catch {}
    setLoading(false)
  }

  const stop = async () => {
    if (!roomId) return
    try {
      await fetch(`/api/rooms/${roomId}/drums/stop`, { method: "POST" })
    } catch {}
    setRunning(false)
  }

  const styleLabels: Record<string, string> = {
    rock: "摇滚", funk: "放克", jazz: "爵士", blues: "布鲁斯",
    metal: "金属", folk: "民谣", latin: "拉丁", basic: "基础节奏",
  }
  const extName = (f: string) => {
    const name = f.replace(/.mid$/, '').split('/').pop() || ''
    return name.replace(/^(Beat|Vrs)\d+-/i, '')
  }
  const idx = files.indexOf(selectedFile)
  const currentLabel = idx >= 0 ? String(idx + 1).padStart(3, '0') + '-' + extName(selectedFile) : ''

  return (
    <div className="flex h-full flex-col gap-4 py-2">
      {/* 风格 + 节奏型并排 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "#8A8A8A" }}>风格</label>
          <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={running}
            className="w-full rounded-[6px] border px-2 py-1.5 text-xs text-white outline-none disabled:opacity-50"
            style={{ borderColor: "#222", background: "#0D0D0D" }}>
            {styles.map((s) => (
              <option key={s} value={s} className="bg-[#0D0D0D] text-white">{styleLabels[s] || s}</option>
            ))}
          </select>
        </div>
        <div className="group relative">
          <label className="mb-1.5 block text-xs" style={{ color: "#8A8A8A" }}>节奏型</label>
          {currentLabel && (
            <span className="pointer-events-none absolute -top-1 right-0 z-50 rounded border bg-black px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100" style={{ borderColor: "#333", marginTop: "-2px", whiteSpace: "nowrap" }}>
              {currentLabel}
            </span>
          )}
          <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)} disabled={running}
            className="w-full rounded-[6px] border px-2 py-1.5 text-xs text-white outline-none disabled:opacity-50 truncate"
            style={{ borderColor: "#222", background: "#0D0D0D" }}>
            {files.map((f, i) => {
              const n = String(i + 1).padStart(3, '0')
              return <option key={f} value={f} className="bg-[#0D0D0D] text-white truncate">{n}-{extName(f)}</option>
            })}
          </select>
        </div>
      </div>

      {/* BPM */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "#8A8A8A" }}>BPM</span>
          <span className="font-mono text-xs text-white">{bpm}</span>
        </div>
        <input type="range" min="40" max="220" value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          disabled={running}
          className="mt-0.5 w-full accent-[#9933FF] h-1.5 disabled:opacity-50" />
      </div>

      {/* 启动/停止 */}
      <button onClick={running ? stop : start} disabled={loading}
        className="flex items-center justify-center gap-2 w-full rounded-[6px] py-2 text-sm font-semibold transition-opacity hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
        style={running ? { background: "#FF5C5C", color: "#fff" } : { background: "linear-gradient(90deg, #9933FF, #FF33AA)", color: "#fff" }}>
        {loading ? loadText : running ? <><Square className="h-4 w-4" /> 停止鼓机</> : <><Play className="h-4 w-4" /> 启动鼓机</>}
      </button>
    </div>
  )

}
