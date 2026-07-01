"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import {
  X,
  Loader2,
  Play,
  Pause,
  Square,
  Check,
  Shield,
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"

/* ============ 类型 ============ */
interface Author {
  id: string
  name: string
  anonymous: boolean
  instrument: string // emoji
}

interface PublishWorkModalProps {
  open: boolean
  onClose: () => void
  session: { index: number; duration: string }
  roomName: string
  roomStyle: string
  authors: Author[]
  anonymousCount: number
  hasDrumTrack: boolean
  /* demo 用：初始注入错误态 */
  forceMixError?: boolean
  forcePublishFail?: boolean
  forceLockLost?: boolean
}

type State = "mixing" | "form" | "publishing" | "success" | "failure" | "lockLost"

const STYLES = [
  "摇滚",
  "民谣",
  "爵士",
  "布鲁斯",
  "放克",
  "雷鬼",
  "电子",
  "古典",
  "流行",
  "嘻哈",
  "R&B",
  "国风",
  "金属",
  "ACG",
  "实验",
]

const PALETTE = ["#00AAFF", "#9933FF", "#FF33AA", "#BBEE00"]

const DECLARATION = `【jamony 作品发布声明】
1. 共创：本作品由房间内所有授权参与者共同创作，所有署名作者共享创作权，无独占者。发表者仅代为发起流程，不享额外权益。任何商用行为请联系创作者或创作者之前自行协商。
2. 责任：所有署名作者对本作品内容（演奏、改编、来源标注）共同负责。jamony 仅作展示与技术平台，不参与创作，不承担任何连带责任。
3. 不可删除：作品一经发表不可删除。退出署名须至「个人信息页 → 我参与的作品」取消署名（变更匿名，不可恢复）。
4. 版权与来源：原创须为共创者原创；翻唱/Remix 建议标注来源。涉第三方版权由作者自行处理授权。
5. 投诉下架：jamony 实行「通知-删除」避风港规则，有权对涉权/违规作品经核实后下架。`

/* 随机品牌渐变 */
function randomGradient(): string {
  const n = Math.random() > 0.5 ? 3 : 2
  const shuffled = [...PALETTE].sort(() => Math.random() - 0.5).slice(0, n)
  const angle = Math.floor(Math.random() * 360)
  return `linear-gradient(${angle}deg, ${shuffled.join(", ")})`
}

/* 黑胶纹理 */
function VinylRecord() {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      style={{ opacity: 0.16 }}
      className="absolute inset-0 m-auto h-3/4 w-3/4"
    >
      <circle cx="50" cy="50" r="48" fill="#000" />
      <circle cx="50" cy="50" r="40" stroke="#fff" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="33" stroke="#fff" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="26" stroke="#fff" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="19" stroke="#fff" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="11" fill="#fff" />
      <circle cx="50" cy="50" r="2.2" fill="#000" />
    </svg>
  )
}

const TOTAL_SECONDS = 204 // 03:24

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function PublishWorkModal({
  open,
  onClose,
  session,
  roomName,
  roomStyle,
  authors,
  anonymousCount,
  hasDrumTrack,
  forceMixError,
  forcePublishFail,
  forceLockLost,
}: PublishWorkModalProps) {
  const [state, setState] = useState<State>("mixing")
  const [mixDone, setMixDone] = useState(false)
  const [mixError, setMixError] = useState(false)

  /* 封面 */
  const [gradient, setGradient] = useState<string>(() => randomGradient())
  const [uploaded, setUploaded] = useState(false)

  /* 播放器 */
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* 表单 */
  const [name, setName] = useState("")
  const [style, setStyle] = useState("")
  const [copyright, setCopyright] = useState<"" | "原创" | "翻唱" | "Remix">("")
  const [coverName, setCoverName] = useState("")
  const [coverAuthor, setCoverAuthor] = useState("")
  const [remixSource, setRemixSource] = useState("")
  const [intro, setIntro] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [declOpen, setDeclOpen] = useState(false)

  const nonAnonAuthors = authors.filter((a) => !a.anonymous)

  /* 初始化：打开时重置 + 启动混音计时 */
  useEffect(() => {
    if (!open) return
    setState(forceLockLost ? "lockLost" : "form")
    setMixDone(false)
    setMixError(false)
    setName(`jam-${roomName}`)
    setStyle(roomStyle)
    setCopyright("")
    setCoverName("")
    setCoverAuthor("")
    setRemixSource("")
    setIntro("")
    setAgreed(false)
    setDeclOpen(false)
    setPlaying(false)
    setCurrent(0)

    if (forceLockLost) return

    if (forceMixError) {
      const t = setTimeout(() => setMixError(true), 800)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => setMixDone(true), 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomName, roomStyle, forceMixError, forceLockLost])

  /* demo：注入发表失败 —— 在 form 就绪后直接进 failure 供预览 */
  useEffect(() => {
    if (open && forcePublishFail) {
      const t = setTimeout(() => setState("failure"), 400)
      return () => clearTimeout(t)
    }
  }, [open, forcePublishFail])

  /* 播放器计时 */
  useEffect(() => {
    if (playing) {
      playRef.current = setInterval(() => {
        setCurrent((c) => {
          if (c >= TOTAL_SECONDS) {
            setPlaying(false)
            return TOTAL_SECONDS
          }
          return c + 1
        })
      }, 1000)
    }
    return () => {
      if (playRef.current) clearInterval(playRef.current)
    }
  }, [playing])

  if (!open) return null

  /* 混音失败重试 */
  const retryMix = () => {
    setMixError(false)
    setMixDone(false)
    setTimeout(() => setMixDone(true), 2000)
  }

  /* 发表 */
  const handlePublish = () => {
    setState("publishing")
    setTimeout(() => setState("success"), 1500)
  }

  const progress = (current / TOTAL_SECONDS) * 100

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mixDone) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setCurrent(Math.round(ratio * TOTAL_SECONDS))
  }

  const publishDisabled =
    !mixDone || !name.trim() || !style || !copyright || !agreed

  /* 成功态手动关闭 */
  const handleSuccessClose = () => {
    setState("mixing")
    setMixDone(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <style>{`
        @keyframes jamonyModalEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .jamony-modal-enter { animation: jamonyModalEnter 0.2s ease-out; }
        .jamony-input:focus { border-color: #9933FF !important; outline: none; }
      `}</style>

      <div
        className="jamony-modal-enter relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "#0D0D0D",
          borderColor: "#1A1A1A",
          fontFamily: "'Geist Sans', 'Noto Sans SC', sans-serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "#1A1A1A" }}
        >
          <h2 className="text-base font-semibold text-white">发表作品</h2>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.97]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容区 */}
        {state === "success" ? (
          <SuccessBody onClose={handleSuccessClose} />
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {/* 混音提示（全宽） */}
            <MixNotice
              mixDone={mixDone}
              mixError={mixError}
              onRetry={retryMix}
              onAbort={onClose}
            />

            {/* 两栏布局 */}
            <div className="mt-4 flex gap-5">
              {/* ===== 左栏：封面+播放器+信息 ===== */}
              <div className="w-80 shrink-0 flex flex-col gap-3">
                {/* 封面 + 乐器 emoji 并排 */}
                <div className="flex gap-3">
                  {/* 封面图 */}
                  <div
                    className="relative flex aspect-square w-52 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
                    style={
                      uploaded
                        ? { backgroundColor: "#161616" }
                        : { background: gradient }
                    }
                  >
                    {uploaded ? (
                      <span className="text-sm" style={{ color: "#8A8A8A" }}>
                        已上传
                      </span>
                    ) : (
                      <VinylRecord />
                    )}
                    {/* 操作按钮叠加在封面底部 */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-5">
                      <button
                        onClick={() => {
                          setUploaded(false)
                          setGradient(randomGradient())
                        }}
                        className="flex items-center gap-0.5 rounded-lg border px-2 py-0.5 text-[10px] text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.97]"
                        style={{ borderColor: "rgba(255,255,255,0.25)" }}
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        换一张
                      </button>
                      <button
                        onClick={() => setUploaded((u) => !u)}
                        className="flex items-center gap-0.5 rounded-lg border px-2 py-0.5 text-[10px] text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.97]"
                        style={{ borderColor: "rgba(255,255,255,0.25)" }}
                      >
                        <Upload className="h-2.5 w-2.5" />
                        上传
                      </button>
                    </div>
                  </div>

                  {/* 乐器 emoji 两列网格 —— 仅图标，顶齐 */}
                  <div className="grid w-full grid-cols-2 content-start gap-x-0 gap-y-2">
                    {authors.map((a) => (
                      <span key={a.id} className="flex items-center text-xl leading-none">{a.instrument}</span>
                    ))}
                    {hasDrumTrack && <span className="flex items-center text-xl leading-none">🥁</span>}
                  </div>
                </div>

                {/* 播放器 */}
                {!mixDone ? (
                  <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "#5A5A5A" }}
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    混音完成后可试听成片
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-3"
                  >
                    <button
                      onClick={() => setPlaying((p) => !p)}
                      className="rounded-lg p-1 text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.97]"
                      aria-label={playing ? "暂停" : "播放"}
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setPlaying(false)
                        setCurrent(0)
                      }}
                      className="rounded-lg p-1 text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.97]"
                      aria-label="停止"
                    >
                      <Square className="h-4 w-4" />
                    </button>
                    <div
                      className="relative h-1.5 flex-1 cursor-pointer rounded-full"
                      style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                      onClick={seek}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${progress}%`,
                          background: "linear-gradient(90deg,#00AAFF,#9933FF)",
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-sm tabular-nums" style={{ color: "#8A8A8A" }}>
                      {fmt(current)} / {fmt(TOTAL_SECONDS)}
                    </span>
                  </div>
                )}

                {/* 段落信息 */}
                <p className="text-xs" style={{ color: "#8A8A8A" }}>
                  段落 {session.index} · {session.duration} ·{" "}
                  {nonAnonAuthors.length + anonymousCount} 轨
                </p>

                {/* 作者 chips */}
                <div className="flex flex-wrap gap-1.5">
                  {nonAnonAuthors.map((a) => (
                    <span
                      key={a.id}
                      className="rounded-full border px-3 py-1 text-sm"
                      style={{
                        backgroundColor: "rgba(153,51,255,0.12)",
                        color: "#9933FF",
                        borderColor: "rgba(153,51,255,0.3)",
                      }}
                    >
                      {a.name}
                    </span>
                  ))}
                  {hasDrumTrack && (
                    <span
                      className="rounded-full px-3 py-1 text-sm"
                      style={{ backgroundColor: "#1C1C1C", color: "#8A8A8A" }}
                    >
                      🥁 jamony-looper
                    </span>
                  )}
                  {anonymousCount > 0 && (
                    <span
                      className="rounded-full px-3 py-1 text-sm"
                      style={{ backgroundColor: "#1C1C1C", color: "#8A8A8A" }}
                    >
                      {anonymousCount} 位匿名乐手
                    </span>
                  )}
                </div>
              </div>

              {/* ===== 右栏：表单 ===== */}
              <div className="flex-1 space-y-4">
                {/* 作品名称 */}
                <div>
                  <label className="text-xs" style={{ color: "#9A9A9A" }}>
                    作品名称 <span style={{ color: "#FF3B5C" }}>*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={20}
                      className="jamony-input w-full rounded-lg border px-3 py-2 pr-14 text-sm text-white transition-all duration-200"
                      style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                      placeholder="给作品起个名字"
                    />
                    <span
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                      style={{ color: "#5A5A5A" }}
                    >
                      {name.length}/20
                    </span>
                  </div>
                </div>

                {/* 风格 */}
                <div>
                  <label className="text-xs" style={{ color: "#9A9A9A" }}>
                    风格 <span style={{ color: "#FF3B5C" }}>*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <select
                      value={style}
                      onChange={(e) => setStyle(e.target.value)}
                      className="jamony-input w-full appearance-none rounded-lg border px-3 py-2 pr-9 text-xs text-white transition-all duration-200"
                      style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                    >
                      {STYLES.map((s) => (
                        <option key={s} value={s} style={{ backgroundColor: "#141414" }}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                      style={{ color: "#8A8A8A" }}
                    />
                  </div>
                </div>

                {/* 版权类型 */}
                <div>
                  <label className="text-xs" style={{ color: "#9A9A9A" }}>
                    版权类型 <span style={{ color: "#FF3B5C" }}>*</span>
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    {(["原创", "翻唱", "Remix"] as const).map((c) => {
                      const active = copyright === c
                      return (
                        <button
                          key={c}
                          onClick={() => setCopyright(c)}
                          className="flex-1 rounded-lg py-1.5 text-xs transition-all duration-200 active:scale-[0.97]"
                          style={
                            active
                              ? {
                                  background: "linear-gradient(90deg,#9933FF,#FF33AA)",
                                  color: "#FFFFFF",
                                }
                              : { backgroundColor: "#161616", color: "#8A8A8A" }
                          }
                        >
                          {c}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 来源（条件） */}
                {copyright === "翻唱" && (
                  <div>
                    <p className="text-xs" style={{ color: "#5A5A5A" }}>
                      建议标注，便于溯源(可选)
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        value={coverName}
                        onChange={(e) => setCoverName(e.target.value)}
                        className="jamony-input w-full rounded-lg border px-3 py-2 text-xs text-white transition-all duration-200"
                        style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                        placeholder="原曲名（建议填写）"
                      />
                      <input
                        value={coverAuthor}
                        onChange={(e) => setCoverAuthor(e.target.value)}
                        className="jamony-input w-full rounded-lg border px-3 py-2 text-xs text-white transition-all duration-200"
                        style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                        placeholder="原作者（建议填写）"
                      />
                    </div>
                  </div>
                )}
                {copyright === "Remix" && (
                  <div>
                    <p className="text-xs" style={{ color: "#5A5A5A" }}>
                      建议标注，便于溯源(可选)
                    </p>
                    <input
                      value={remixSource}
                      onChange={(e) => setRemixSource(e.target.value)}
                      className="jamony-input mt-1.5 w-full rounded-lg border px-3 py-2 text-xs text-white transition-all duration-200"
                      style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                      placeholder="素材来源（建议填写）"
                    />
                  </div>
                )}

                {/* 作品简介 */}
                <div>
                  <label className="text-xs" style={{ color: "#9A9A9A" }}>
                    作品简介
                  </label>
                  <div className="relative mt-1.5">
                    <textarea
                      value={intro}
                      onChange={(e) => setIntro(e.target.value)}
                      maxLength={50}
                      rows={2}
                      className="jamony-input w-full resize-none rounded-lg border px-3 py-2 text-xs text-white transition-all duration-200"
                      style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
                      placeholder="一句话介绍一下这首作品（建议填写）"
                    />
                    <span
                      className="pointer-events-none absolute bottom-2 right-3 text-xs"
                      style={{ color: "#5A5A5A" }}
                    >
                      {intro.length}/50
                    </span>
                  </div>
                </div>

                {/* 不可删除提醒 */}
                <div
                  className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
                  style={{ backgroundColor: "#161616", borderColor: "#2A2A2A", color: "#8A8A8A" }}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#FF3B5C" }} />
                  <span>
                    作品发表后不可删除，作者可至「个人信息页 → 我参与的作品」取消署名（变更匿名，不可恢复）
                  </span>
                </div>

                {/* 责任承诺 */}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-white">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="h-4 w-4 accent-[#9933FF]"
                      />
                      全部作者已阅读并同意声明
                    </label>
                    <button
                      onClick={() => setDeclOpen((o) => !o)}
                      className="flex items-center gap-0.5 text-xs transition-all duration-200 active:scale-[0.97]"
                      style={{ color: "#9933FF" }}
                    >
                      查看完整声明
                      {declOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {declOpen && (
                    <div
                      className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border p-3 text-xs leading-relaxed"
                      style={{ borderColor: "#2A2A2A", color: "#B0B0B0" }}
                    >
                      {DECLARATION}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 底栏 */}
        <Footer
          state={state}
          publishDisabled={publishDisabled}
          mixDone={mixDone}
          onClose={onClose}
          onPublish={handlePublish}
          onRetry={() => setState("publishing")}
          onBack={() => setState("form")}
        />
      </div>
    </div>
  )
}

/* ============ 子组件 ============ */

function MixNotice({
  mixDone,
  mixError,
  onRetry,
  onAbort,
}: {
  mixDone: boolean
  mixError: boolean
  onRetry: () => void
  onAbort: () => void
}) {
  if (mixDone) return null

  if (mixError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "#FF3B5C" }}>
        <AlertTriangle className="h-4 w-4" />
        混音失败，请重试
        <button
          onClick={onRetry}
          className="rounded-lg border px-2.5 py-1 text-white transition-all duration-200 hover:bg-white/5 active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A" }}
        >
          重试
        </button>
        <button
          onClick={onAbort}
          className="rounded-lg border px-2.5 py-1 transition-all duration-200 hover:bg-white/5 active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          放弃
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: "#8A8A8A" }}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      正在自动混音…
    </div>
  )
}

function SuccessBody({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "#BBEE00" }}
      >
        <Check className="h-8 w-8" style={{ color: "#000" }} strokeWidth={3} />
      </div>
      <h3 className="text-lg font-semibold text-white">作品已发表</h3>
      <button
        onClick={onClose}
        className="rounded-[10px] px-6 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
        style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
      >
        OK
      </button>
    </div>
  )
}

function Footer({
  state,
  publishDisabled,
  mixDone,
  onClose,
  onPublish,
  onRetry,
  onBack,
}: {
  state: State
  publishDisabled: boolean
  mixDone: boolean
  onClose: () => void
  onPublish: () => void
  onRetry: () => void
  onBack: () => void
}) {
  if (state === "success") return null

  const border = { borderColor: "#1A1A1A" }

  if (state === "publishing") {
    return (
      <div className="flex items-center justify-center gap-2 border-t px-5 py-4" style={border}>
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#9933FF" }} />
        <span className="text-sm" style={{ color: "#8A8A8A" }}>
          正在编码上传…请勿关闭页面
        </span>
      </div>
    )
  }

  if (state === "failure") {
    return (
      <div className="flex flex-col items-center gap-3 border-t px-5 py-4" style={border}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#FF3B5C" }}>
          <AlertTriangle className="h-4 w-4" />
          发表失败：网络编码上传中断
        </div>
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border px-5 py-2 text-sm transition-all duration-200 hover:text-white active:scale-[0.97]"
            style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
          >
            返回修改
          </button>
          <button
            onClick={onRetry}
            className="rounded-[10px] px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
            style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  if (state === "lockLost") {
    return (
      <div className="flex flex-col items-center gap-3 border-t px-5 py-4" style={border}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#FF3B5C" }}>
          <AlertTriangle className="h-4 w-4" />
          超时，发表资格已释放，他人可接手
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border px-5 py-2 text-sm transition-all duration-200 hover:text-white active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          关闭
        </button>
      </div>
    )
  }

  /* form */
  return (
    <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={border}>
      <button
        onClick={onClose}
        className="rounded-lg border px-5 py-2 text-sm transition-all duration-200 hover:text-white active:scale-[0.97]"
        style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
      >
        取消
      </button>
      <div className="flex items-center gap-2">
        {!mixDone && (
          <span className="text-xs" style={{ color: "#8A8A8A" }}>
            等待混音完成…
          </span>
        )}
        <button
          onClick={onPublish}
          disabled={publishDisabled}
          className="rounded-[10px] px-5 py-2 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
        >
          一键发表
        </button>
      </div>
    </div>
  )
}

/* ============ Demo 包裹 ============ */
export function PublishWorkModalDemo() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"normal" | "mixFail" | "publishFail" | "lockLost">("normal")

  const mockProps = {
    session: { index: 3, duration: "04:12" },
    roomName: "放克忍者的客厅",
    roomStyle: "放克",
    authors: [
      { id: "1", name: "放克忍者", anonymous: false, instrument: "🎸" },
      { id: "2", name: "小明", anonymous: false, instrument: "🎹" },
      { id: "3", name: "小红", anonymous: true, instrument: "🎤" },
    ],
    anonymousCount: 1,
    hasDrumTrack: true,
  }

  const openWith = (m: typeof mode) => {
    setMode(m)
    setOpen(true)
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6"
      style={{ backgroundColor: "#000", fontFamily: "'Geist Sans', 'Noto Sans SC', sans-serif" }}
    >
      <button
        onClick={() => openWith("normal")}
        className="rounded-[10px] px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
        style={{ background: "linear-gradient(90deg,#9933FF,#FF33AA)" }}
      >
        打开发表卡片
      </button>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          onClick={() => openWith("mixFail")}
          className="rounded-lg border px-3 py-1.5 text-xs transition-all duration-200 hover:text-white active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          模拟混音失败
        </button>
        <button
          onClick={() => openWith("publishFail")}
          className="rounded-lg border px-3 py-1.5 text-xs transition-all duration-200 hover:text-white active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          模拟发表失败
        </button>
        <button
          onClick={() => openWith("lockLost")}
          className="rounded-lg border px-3 py-1.5 text-xs transition-all duration-200 hover:text-white active:scale-[0.97]"
          style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
        >
          模拟超时锁丢失
        </button>
      </div>

      <PublishWorkModal
        open={open}
        onClose={() => setOpen(false)}
        {...mockProps}
        forceMixError={mode === "mixFail"}
        forcePublishFail={mode === "publishFail"}
        forceLockLost={mode === "lockLost"}
      />
    </div>
  )
}
