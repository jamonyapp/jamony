"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { LevelMeter } from "@/components/playing/level-meter"
import { FilterSelect } from "@/components/jamony/filter-select"
import { useParams } from "next/navigation"
import { Sparkles, PowerOff, Plug, Headphones, Play, Square, Upload, Download, Trash2, Music4 } from "lucide-react"
import {
  DAILY_THEME,
  CHORD_STYLES,
  PHRASE_COUNTS,
  CHORD_POOLS,
  generateProgression,
  type RoomScore,
} from "@/lib/jam-data"
import { ProgramPanel } from "@/components/playing/program-tool"
import { HoverName } from "@/components/playing/hover-fullname"
import type { ProgramData, ProgramMix, ProgramState } from "@/lib/chat-socket"

type Tool = "chords" | "drums" | "score" | "program"

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
  listenerActive,
  onStartListening,
  onDisconnect,
  onReconnect,
  onLeaveRoom,
  currentScore,
  onPushScore,
  onClearScore,
  program,
  programState,
  programError,
  onOpenProgramMixer,
  onProgramPlay,
  onProgramPause,
  onProgramStop,
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
  listenerActive?: boolean
  onStartListening?: () => void
  onDisconnect: () => void
  onReconnect: () => void
  onLeaveRoom: () => void
  currentScore?: RoomScore | null
  onPushScore: (score: RoomScore) => void
  onClearScore: () => void
  program: ProgramData
  programState: ProgramState | null
  programError: { msg: string; ts: number } | null
  onOpenProgramMixer: () => void
  onProgramPlay: (startMs?: number) => void
  onProgramPause: () => void
  onProgramStop: () => void
}) {
  const [tool, setTool] = useState<Tool>("drums")  // 默认鼓机（使用概率高于灵感进程，欢哥 2026-09-23 定）
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
      {/* 今日主题 + 自定义主题（合并；1013 纵向压缩 p-4→p-3） */}
      <section className="shrink-0 rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4" style={{ color: "#BBEE00" }} />
          <span>今日 jamony 主题</span>
        </div>

        <p className="mt-1 text-xs" style={{ color: "#8A8A8A" }}>{dailyTheme.emoji} {dailyTheme.title}</p>

        {isMusician && !roomGone && (
          <div className="mt-2 flex items-center gap-2 border-t pt-2" style={{ borderColor: "#1A1A1A" }}>
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
        <section className="flex flex-1 flex-col items-center justify-center rounded-[10px] border p-6 pt-16" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <Headphones className="h-10 w-10" style={{ color: "#BBEE00" }} />
          <p className="mt-4 text-lg font-bold text-white">{listenerActive ? "收听中" : ""}</p>

          {listenerActive && <LevelMeter active={true} />}

          {onStartListening && (
            <button onClick={onStartListening}
              className="mt-5 rounded-[8px] px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:brightness-110 active:scale-[0.97]"
              style={{ background: listenerActive ? "#FF5C5C" : "linear-gradient(90deg, #9933FF, #FF33AA)" }}>
              {listenerActive ? "断开收听" : "开始收听"}
            </button>
          )}
          <p className="mt-auto text-center text-sm" style={{ color: "#8A8A8A" }}>
            不过瘾？接上乐器！<br/>点击下方按钮，一起嗨！
          </p>
        </section>
      ) : roomGone ? null : (
        <section className="flex min-h-0 flex-1 flex-col rounded-[10px] border p-3" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">

            <span>🧰 Jam 魔盒</span>
          </div>

          <label className="mt-2 flex flex-col gap-1">
            <span className="text-xs" style={{ color: "#8A8A8A" }}>选择工具</span>
            <FilterSelect variant="compact" label="选择工具" value={tool} onChange={(v) => setTool(v as Tool)}
              options={[{ value: "drums", label: "🥁 鼓机" }, { value: "score", label: "📄 乐谱共享" }, { value: "program", label: "🎧 Program" }, { value: "chords", label: "💡 灵感进程" }]} />
          </label>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {tool === "chords" ? (
              <div className="flex h-full flex-col">
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>风格</span>
                    <FilterSelect variant="compact" label="风格" value={style} onChange={setStyle}
                      options={CHORD_STYLES.map((s) => ({ value: s, label: s }))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8A8A8A" }}>乐句数量</span>
                    <FilterSelect variant="compact" label="乐句数量" value={String(phrases)}
                      onChange={(v) => setPhrases(Number(v))}
                      options={PHRASE_COUNTS.map((n) => ({ value: String(n), label: `${n} 句` }))} />
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
            ) : tool === "score" ? (
              <div className="flex h-full flex-col">
                {/* ⑥-3 魔盒合一（1013 欢哥拍板）：双模块合一上传——一个文件口按扩展名自动分诊
                    （GP族=单份走 GP 链；PDF=单份；图片组=按文件名排序成页）；累积列表在大屏顶部"谱架" */}
                <div className="min-h-0 flex-1">
                  <ScorePanel roomId={params?.code as string} currentScore={currentScore ?? null} onPushScore={onPushScore} />
                </div>
              </div>
            ) : tool === "program" ? (
              <ProgramPanel roomId={params?.code as string} program={program} progState={programState} error={programError}
                canOperate={myRole === "musician"} onOpenMixer={onOpenProgramMixer}
                playProgram={onProgramPlay} pauseProgram={onProgramPause} stopProgram={onProgramStop} />
            ) : (
              <DrumMachineTool roomId={params?.code as string} realtimeBpm={realtimeBpm || 0} />
            )}
          </div>
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
      ) : (
        /* 10-07 漫游化收口：并排双按钮——身份切换（实心主按钮）+ 离开房间（深色配角）；shrink-0 保底常驻（1013 左栏不滚） */
        <div className="grid shrink-0 grid-cols-2 gap-2">
          {audioConnected ? (
            <button onClick={onDisconnect}
              className="rounded-[10px] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-[0.97]"
              style={{ background: "#FF5C5C" }}>
              切为听众
            </button>
          ) : (
            <button onClick={onReconnect}
              className="rounded-[10px] py-2.5 text-sm font-semibold transition-opacity hover:brightness-110 active:scale-[0.97]"
              style={{ background: "#BBEE00", color: "#0D0D0D" }}>
              切为合奏者
            </button>
          )}
          <button onClick={onLeaveRoom}
            className="rounded-[10px] border py-2.5 text-sm font-medium transition-colors hover:bg-white/5 active:scale-[0.97]"
            style={{ background: "#141414", borderColor: "#2A2A2A", color: "#B0B0B0" }}>
            离开房间
          </button>
        </div>
      )}

    </aside>
  )
}

function DrumMachineTool({ roomId, realtimeBpm }: { roomId?: string; realtimeBpm?: number }) {
  const [running, setRunning] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [style, setStyle] = useState("basic")  // 默认基础节奏（欢哥 0923 定）
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
          // 文件列表由下面 [style] effect 统一加载（原先这里硬编码 rock 初始化，
          // 与 [style] effect 异步竞态可能列表/选中错位，删掉让单一数据源）
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
          setSelectedFile(flist[0] || "")  // 默认第一个节奏型（原随机选，欢哥 0923 定）
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
    rock: "摇滚", funk: "放克", jazz: "爵士", rnb: "RnB",
    metal: "金属", folk: "乡村/民谣", reggae: "雷鬼", basic: "基础节奏",
    pop: "流行", punk: "朋克", soul: "灵魂",
  }
  const extName = (f: string) => {
    return f.replace(/.mid$/, '').split('/').pop() || ''
  }
  const idx = files.indexOf(selectedFile)
  const currentLabel = idx >= 0 ? extName(selectedFile) : ''

  return (
    <div className="flex h-full flex-col gap-4 py-2">
      {/* 风格 + 节奏型并排 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1.5 block text-xs" style={{ color: "#8A8A8A" }}>风格</label>
          <FilterSelect variant="compact" label="风格" value={style} onChange={setStyle} disabled={running}
            options={styles.map((s) => ({ value: s, label: styleLabels[s] || s }))} />
        </div>
        <div className="group relative">
          <label className="mb-1.5 block text-xs" style={{ color: "#8A8A8A" }}>节奏型</label>
          {currentLabel && (
            <span className="pointer-events-none absolute -top-1 right-0 z-50 rounded border bg-black px-1.5 py-0.5 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100" style={{ borderColor: "#333", marginTop: "-2px", whiteSpace: "nowrap" }}>
              {currentLabel}
            </span>
          )}
          <FilterSelect variant="compact" label="节奏型" value={selectedFile} onChange={setSelectedFile} disabled={running}
            options={files.map((f) => ({ value: f, label: extName(f) }))} />
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
// 乐谱管理面板（⑥-3 1013 欢哥 11 条设计定稿）：魔盒=房间乐谱管理面板
// 两按钮=上传乐谱+投屏乐谱（选中后投）；列表框内部滚动；行=类型图标+文件名+上传者；
// 排序按格式分组（GP/制谱类→PDF→图片），同类新→旧；每行 下载+删除（垃圾桶）icon。
// 投屏分诊：图片/PDF 直接投；GP族/musicxml/capx 加载 alphatab；.sib/.mscz 专有格式只存取（下载后本地打开）。
// 删除=直接删服务器文件（仅合奏者，与上传对齐；若删的是大屏正显内容，服务器连带收回大屏）。
type ShelfItem = {
  id: number
  name: string
  type: "gp" | "notation" | "pdf" | "images"
  files: string[]
  midUrl?: string
  tracks?: { name: string }[]
  by: string
  at: string
}

// 从 files[0] URL 取后缀（含点，小写；随机存储名保留了原扩展名）
function extOf(files: string[] | undefined): string {
  const u = Array.isArray(files) && files.length > 0 ? String(files[0]) : ""
  const i = u.lastIndexOf(".")
  return i >= 0 ? u.slice(i).toLowerCase() : ""
}

function ScorePanel({ roomId, currentScore, onPushScore }: {
  roomId?: string
  currentScore: RoomScore | null
  onPushScore: (score: RoomScore) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<ShelfItem[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [hint, setHint] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<ShelfItem | null>(null)  // 1013 欢哥定稿：删正投屏的谱先弹闸
  const [confirmSwitch, setConfirmSwitch] = useState<ShelfItem | null>(null)  // 1013 欢哥定稿：热切换常驻确认（不可忽略）

  const GP_EXT = /\.(gp|gpx|gp[345]|musicxml|mxl|capx)$/i
  const NOTATION_EXT = /\.(sib|mscz|mscx)$/i
  const IMG_EXT = /\.(png|jpe?g|webp)$/i
  const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gp,.gpx,.gp3,.gp4,.gp5,.musicxml,.mxl,.capx,.sib,.mscz,.mscx"

  const load = () => {
    if (!roomId) return
    fetch(`/api/rooms/${roomId}/scores`)
      .then(r => r.json())
      .then(d => { if (d.ok) setItems(d.scores || []) })
      .catch(() => {})
  }
  useEffect(() => { load() }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePick = async (e: import("react").ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || [])
    e.target.value = ""
    setError(""); setHint("")
    if (list.length === 0 || !roomId) return
    const bad = list.find(f => !GP_EXT.test(f.name) && !NOTATION_EXT.test(f.name) && !IMG_EXT.test(f.name) && !/\.pdf$/i.test(f.name))
    if (bad) { setError(`「${bad.name}」类型不支持（图片/PDF/GP/制谱文件）`); return }
    const oversize = list.find(f => f.size > 10 * 1024 * 1024)
    if (oversize) { setError(`「${oversize.name}」超过 10MB 上限`); return }
    setUploading(true)
    try {
      const fd = new FormData()
      list.forEach(f => fd.append("files", f))
      const res = await fetch(`/api/rooms/${roomId}/score/upload`, { method: "POST", body: fd })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "上传失败"); return }
      setHint(`已上传 ${list.length} 份`)
      load()
    } catch {
      setError("上传失败，请重试")
    } finally {
      setUploading(false)
    }
  }

  const sel = items.find(it => it.id === selected) || null

  const handleStage = () => {
    if (!sel) { setError("先在列表里点选一份乐谱"); return }
    if (sel.type === "notation") { setError("西贝柳斯/MuseScore 文件请下载后在本地打开"); return }
    // 1013 欢哥定稿：大屏已有谱时热切换常驻弹窗（不可忽略）——要么先收回大屏再投，要么过确认闸；
    // 确认后服务器 push-score 原位替换（停走带+收回+上新一体，与删除正投屏谱同套收口）
    if (currentScore) { setConfirmSwitch(sel); return }
    doStage(sel)
  }

  const doStage = (item: ShelfItem) => {
    if (item.type === "gp") {
      onPushScore({ type: "gp", name: item.name, files: item.files, midUrl: item.midUrl, tracks: item.tracks })
    } else {
      onPushScore({ type: item.type as "pdf" | "images", name: item.name, files: item.files })  // notation 已在上游闸掉
    }
    setConfirmSwitch(null)
    setError(""); setHint(`已投屏：${item.name}`)
  }

    // 清空整个谱架（1016 欢哥：乐谱共享三按钮"上传/清空/投屏"——批量删+投屏内容随删收回）
  const clearShelf = async () => {
    if (!roomId || items.length === 0) return
    if (!confirm("清空谱架全部乐谱？")) return
    setError(""); setHint("")
    try {
      const res = await fetch(`/api/rooms/${roomId}/score/shelf`, { method: "DELETE" })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "清空失败"); return }
      setSelected(null)
      setHint(`已清空 ${data.removed ?? 0} 份`)
      load()
    } catch {
      setError("清空失败，请重试")
    }
  }

  // 垃圾桶=删它所在的那一行（1013 修复：旧版删"当前选中行"，直接点行内垃圾桶时无选中态=静默不动）
  const handleDeleteFor = (item: ShelfItem) => {
    // 正投屏中的谱删除前先过闸（1013 欢哥定稿：弹窗"删除将终止投屏"，返回/删除二选一）
    const projecting = !!currentScore && Array.isArray(currentScore.files) && item.files.some(u => currentScore.files!.includes(u))
    if (projecting) { setConfirmDelete(item); return }
    void doDelete(item)
  }

  const doDelete = async (victim: ShelfItem) => {
    if (!roomId) return
    try {
      const res = await fetch(`/api/rooms/${roomId}/score/shelf/${victim.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!data.ok) { setError(data.msg || "删除失败"); return }
      setSelected(null)
      setHint(`已删除：${victim.name}`)
      load()
    } catch {
      setError("删除失败，请重试")
    } finally {
      setConfirmDelete(null)
    }
  }

  // 1013 欢哥：🎼=手机通用图标、FileMusic=抖音感，双双否决——制谱类换 lucide Music4（纯音符线条）上 jamony 紫
  const typeIcon = (t: ShelfItem["type"]) =>
    t === "gp" || t === "notation"
      ? <Music4 className="size-3.5 shrink-0" style={{ color: "#9933FF" }} />
      : <span className="text-sm">{t === "pdf" ? "📕" : "📄"}</span>

  return (
    <div className="flex h-full flex-col gap-2 py-1">
      {/* 三按钮：上传 + 清空 + 投屏（1016 欢哥，对齐 Program 三键节奏；投屏对选中项生效） */}
      <input ref={fileInputRef} type="file" multiple hidden accept={ACCEPT} onChange={handlePick} />
      <div className="grid shrink-0 grid-cols-3 gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="rounded-[6px] border py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "#3A3A3A", color: "#E0E0E0" }}>
          {uploading ? "上传中…" : "⬆ 上传"}
        </button>
        <button onClick={clearShelf} disabled={uploading || items.length === 0}
          className="rounded-[6px] border py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "#3A3A3A", color: "#E0E0E0" }}>
          清空
        </button>
        <button onClick={handleStage}
          className="rounded-[6px] py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "#9933FF" }} disabled={!sel || sel.type === "notation"}>
          投屏
        </button>
      </div>
      {/* 1013 欢哥定稿：一行不折（MusicXML 等长词由文件对话框过滤+报错承担，这里只留代表性枚举） */}
      <p className="shrink-0 whitespace-nowrap text-center text-[10px]" style={{ color: "#666" }}>
        支持图片/PDF/gp等格式 · 单个≤10MB
      </p>

      {/* 乐谱列表（内部纵向滚动；格式分组排序：GP/制谱→PDF→图片，同类新→旧） */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border scrollbar-thin" style={{ borderColor: "#2A2A2A", background: "#141414" }}>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] leading-relaxed" style={{ color: "#8A8A8A" }}>
            谱架空着<br />上传的乐谱都在这里，选中即可投屏
          </p>
        ) : items.map((it, idx) => (
          <div key={it.id}
            onClick={() => { setSelected(it.id === selected ? null : it.id); setError(""); setHint("") }}
            className={`group relative flex cursor-pointer items-center gap-1.5 border-b px-2 py-1.5 transition-colors last:border-b-0 ${it.id === selected ? "bg-white/10" : "hover:bg-white/5"}`}
            style={{ borderColor: "#222" }}>
            <span className="shrink-0 text-sm">{typeIcon(it.type)}</span>
            <HoverName full={`${it.name}${extOf(it.files)}`} base={it.name} ext={extOf(it.files)} first={idx === 0}
              wrapClass={`flex items-baseline ${it.id === selected ? "font-medium text-white" : "text-white/80"}`}>
              <p className="truncate text-[10px]" style={{ color: "#6A6A6A" }}>
                {it.by}{it.by ? " · " : ""}{new Date(it.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </HoverName>
            <a href={`/api/rooms/${roomId}/score/download/${it.id}`} title="下载" onClick={e => e.stopPropagation()}
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-white/45 transition-colors hover:bg-white/10 hover:text-white">
              <Download className="size-3" />
            </a>
            <button onClick={e => { e.stopPropagation(); handleDeleteFor(it) }} title="删除（直接删服务器文件）"
              className="grid size-6 shrink-0 place-items-center rounded-[6px] text-white/45 transition-colors hover:bg-white/10 hover:text-white">
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>

      {hint && <p className="shrink-0 truncate text-[11px]" style={{ color: "#8A8A8A" }}>{hint}</p>}
      {error && <p className="shrink-0 text-[11px]" style={{ color: "#FF5C5C" }}>{error}</p>}

      {/* 热切换确认闸（1013 欢哥定稿：常驻不可忽略）：返回=不动；确认=服务器原位替换（收回当前+上新） */}
      {confirmSwitch && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setConfirmSwitch(null)}>
          <div className="w-full max-w-xs rounded-[10px] border p-5 text-center" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">当前正有乐谱投屏，确认切换吗？</h3>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
              确认后将收回「{currentScore?.name}」<br />并投屏「{confirmSwitch.name}」
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmSwitch(null)}
                className="rounded-[8px] border py-2 text-xs transition-colors hover:bg-white/5"
                style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                返回
              </button>
              <button onClick={() => doStage(confirmSwitch)}
                className="rounded-[8px] py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "#9933FF" }}>
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除正投屏谱确认闸（1013 欢哥定稿）：返回=不动；删除=服务器先停播清状态收回大屏再删文件 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-xs rounded-[10px] border p-5 text-center" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white">该曲谱正在投屏，删除将终止投屏</h3>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "#8A8A8A" }}>
              确定删除「{confirmDelete.name}」？
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="rounded-[8px] border py-2 text-xs transition-colors hover:bg-white/5"
                style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}>
                返回
              </button>
              <button onClick={() => void doDelete(confirmDelete)}
                className="rounded-[8px] py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "#FF5C5C" }}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

