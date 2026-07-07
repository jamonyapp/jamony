"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Play, Pause, Heart, MessageCircle, Guitar, Check, ListMusic } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { usePlayer } from "@/components/jamony/player-context"
import { type Track } from "@/lib/jamony-data"
import { useAuth } from "@/lib/auth-context"

const GRADIENTS = [
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #9933FF, #FF33AA)",
  "linear-gradient(135deg, #FF33AA, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #FF33AA)",
  "linear-gradient(135deg, #9933FF, #BBEE00)",
]
import { UserPopover } from "@/components/jamony/user-popover"

function VinylCover({ track }: { track: Track }) {
  return (
    <div
      className="relative aspect-square w-44 shrink-0 overflow-hidden rounded-xl sm:w-48"
      style={{ background: track.gradient }}
    >
      <div className="absolute inset-0 bg-black/35" />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="detail-vinyl-sheen" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="82" fill="#111111" opacity="0.92" />
        {[72, 64, 56, 48, 40].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
        ))}
        <circle cx="100" cy="100" r="82" fill="url(#detail-vinyl-sheen)" />
        <circle cx="100" cy="100" r="30" fill="#1c1c1c" />
        <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <circle cx="100" cy="100" r="5" fill="#0a0a0a" />
      </svg>
      {track.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.coverImage} alt={track.title} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  )
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color, backgroundColor: `${color}26` }}
    >
      {text}
    </span>
  )
}

function Avatar({ name, gradient, size }: { name: string; gradient: string; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: gradient, fontSize: size * 0.4 }}
      aria-hidden
    >
      {name.charAt(0)}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-[13px] text-[#8A8A8A]">{children}</h2>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}

// 假评论池 — 带时间戳
interface MockComment {
  emoji: string
  name: string
  text: string
  time: string
}
const COMMENT_POOLS: Record<string, MockComment[]> = {
  default: [
    { emoji: "🎸", name: "小明", text: "第一次合奏放克，太爽了！", time: "Jun 17, 2026 · 13:59" },
    { emoji: "🥁", name: "阿强", text: "这节奏稳啊 👍 下次可以试试更快的 tempo，我已经练好了 16 分音符的节奏型，随时可以再来一次！", time: "Jun 16, 2026 · 21:30" },
    { emoji: "🎤", name: "小美", text: "下次再来一首！", time: "Jun 16, 2026 · 20:12" },
    { emoji: "🎹", name: "Nina", text: "groove 太舒服了！这把键盘的音色选得真好 😊", time: "Jun 15, 2026 · 09:45" },
    { emoji: "🎸", name: "老张", text: "大家的配合越来越默契了，下周末继续！", time: "Jun 14, 2026 · 23:05" },
  ],
}

function resolveId(): string {
  if (typeof window === "undefined") return ""
  return window.location.pathname.replace(/^\/library\//, "").replace(/\/$/, "")
}

function WorkDetailInner() {
  const router = useRouter()
  const { setQueue, playTrack, current, isPlaying, togglePlay, addToPlaylist } = usePlayer()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentText, setCommentText] = useState("")
  const [fromFilter, setFromFilter] = useState(false)
  const [track, setTrack] = useState<Track | null>(null)
  const [workAuthors, setWorkAuthors] = useState<any[]>([])
  const [anonymousCount, setAnonymousCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { loggedIn, setShowLoginModal } = useAuth()

  // 检测来源是否为筛选页（track-card 跳转前在 sessionStorage 标记；客户端导航下 document.referrer 不更新）
  useEffect(() => {
    if (typeof window !== "undefined") {
      setFromFilter(sessionStorage.getItem("libFrom") === "filter")
    }
  }, [])

  const handleSendComment = () => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!commentText.trim()) return
    console.log("[library] send comment:", commentText)
    setCommentText("")
  }

  // 从 /api/works 读取作品
  useEffect(() => {
    const id = resolveId()
    if (!id) { setLoading(false); return }

    Promise.all([
      fetch(`/api/works/${id}`).then(r => r.json()),
      fetch("/api/works").then(r => r.json()),
    ]).then(([workData, allData]) => {
      if (workData.ok) {
        const w = workData.work
        const mapped: Track = {
          id: String(w.id),
          title: w.title,
          author: w.author,
          type: w.type,
          nature: w.nature,
          styles: w.styles || [],
          instruments: w.instruments || [],
          plays: w.plays,
          likes: w.likes,
          comments: w.comments,
          duration: w.duration,
          gradient: w.coverGradient || GRADIENTS[w.id % GRADIENTS.length],
          date: w.date || "",
          members: w.members || [],
          coverImage: w.coverImage || "",
          mp3Url: w.mp3Url || "",
        }
        setTrack(mapped)
        setLikeCount(w.likes)
        setWorkAuthors(w.authors || [])
        setAnonymousCount(w.anonymousCount || 0)
      }
      if (allData.ok) {
        const queue: Track[] = allData.works.map((wr: any, i: number) => ({
          id: String(wr.id),
          title: wr.title,
          author: wr.author,
          type: wr.type,
          nature: wr.nature,
          styles: wr.styles || [],
          instruments: wr.instruments || [],
          plays: wr.plays,
          likes: wr.likes,
          comments: wr.comments,
          duration: wr.duration,
          gradient: wr.coverGradient || GRADIENTS[i % GRADIENTS.length],
          date: wr.date || "",
          members: wr.members || [],
          coverImage: wr.coverImage || "",
          mp3Url: wr.mp3Url || "",
        }))
        setQueue(queue)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [setQueue])

  // 加载中
  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center"><p className="text-[#8A8A8A]">加载中...</p></div>
  }

  // 如果没找到作品
  if (!track) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p className="text-[#9A9A9A]">作品未找到</p>
        <button onClick={() => router.push("/library")} className="text-sm text-[#00AAFF] hover:underline">
          返回作品库
        </button>
      </div>
    )
  }

  const isCurrent = current?.id === track.id
  const isCurrentPlaying = isCurrent && isPlaying

  function toggleLike() {
    if (!loggedIn) { setShowLoginModal(true); return }
    setLiked((prev) => {
      const next = !prev
      setLikeCount((c) => c + (next ? 1 : -1))
      return next
    })
  }

  function handlePlay() {
    if (isCurrent) {
      togglePlay()
    } else {
      playTrack(track)
    }
  }

  // 详情行
  const detailRows = [
    { label: "创作类型", value: track.type === "rehearsal" ? "排练作品" : "Jam 时刻" },
    { label: "性质", value: track.nature === "original" ? "Original" : "Cover" },
    { label: "风格", value: track.styles.join(" · ") },
    { label: "乐器", value: track.instruments.join(" · ") },
    { label: "发表时间", value: track.date },
    { label: "时长", value: track.duration },
  ]

  const comments = COMMENT_POOLS.default

  // 根据乐器分配假 emoji
  const instrumentEmojis: Record<string, string> = {
    "电吉他": "🎸", "木吉他": "🎸", "贝斯": "🎸",
    "鼓·小打": "🥁", "键盘乐器": "🎹", "主唱": "🎤",
    "管乐": "🎷", "弦乐": "🎻", "电子": "🎛️",
    "民乐": "🪕", "其他": "🎵",
  }

  // 给乐手分配假渐变和乐器
  const musicianGradients = [
    "linear-gradient(135deg,#00AAFF,#9933FF)",
    "linear-gradient(135deg,#9933FF,#FF33AA)",
    "linear-gradient(135deg,#FF33AA,#BBEE00)",
    "linear-gradient(135deg,#00AAFF,#BBEE00)",
    "linear-gradient(135deg,#00AAFF,#FF33AA)",
    "linear-gradient(135deg,#9933FF,#BBEE00)",
  ]

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav
        backLinks={
          fromFilter
            ? [{ label: "返回作品库", href: "/library" }, { label: "返回筛选", href: "/library/category" }]
            : [{ label: "返回作品库", href: "/library" }]
        }
      />

      <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-[3.75rem]">
        {/* 主视觉区 */}
        <section className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={handlePlay}
            className="group relative w-44 shrink-0 sm:w-48"
            aria-label={isCurrentPlaying ? "暂停" : "播放"}
          >
            <VinylCover track={track} />
            <div className={`absolute inset-0 flex items-center justify-center rounded-xl transition-colors ${isCurrentPlaying ? "bg-black/30" : "bg-black/0 group-hover:bg-black/30"}`}>
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-all ${
                  isCurrentPlaying
                    ? "scale-100 opacity-100"
                    : "scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                }`}
              >
                {isCurrentPlaying ? (
                  <Pause className="h-5 w-5 fill-white" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-white" />
                )}
              </span>
            </div>
          </button>

          <div className="flex flex-col gap-3 pt-1">
            <h1 className="text-2xl font-bold text-white sm:text-[28px]">
              {track.title}
            </h1>
            <p className="text-sm text-[#C9C9C9]">{track.author}</p>

            <div className="flex flex-wrap gap-2">
              {track.styles.map((s) => (
                <Tag key={s} text={s} color="#00AAFF" />
              ))}
              <Tag text={track.nature === "original" ? "Original" : "Cover"} color="#FF33AA" />
            </div>

            <div className="flex items-center gap-5 pt-1 text-sm text-white">
              <button
                type="button"
                onClick={handlePlay}
                className="flex items-center gap-1.5"
              >
                <Play className="h-4 w-4" fill="currentColor" />
                {track.plays}
              </button>
              <button
                type="button"
                onClick={toggleLike}
                aria-pressed={liked}
                aria-label="点赞"
                className="flex items-center gap-1.5 transition-colors"
                style={{ color: liked ? "#FF33AA" : undefined }}
              >
                <Heart className="h-4 w-4" fill={liked ? "#FF33AA" : "none"} />
                {likeCount}
              </button>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                {track.comments}
              </span>
              <button
                type="button"
                onClick={() => addToPlaylist(track)}
                className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
              >
                <ListMusic className="h-4 w-4" />
                加入播放列表
              </button>
            </div>

            {/* CTA — 放在右侧空白处 */}
            <div className="mt-5 flex items-center gap-4 rounded-xl border border-white/10 bg-[#0D0D0D] px-5 py-4">
              <p className="text-sm font-bold text-white">听不过瘾？来玩真的！</p>
              <button
                type="button"
                onClick={() => router.push("/lobby")}
                className="flex shrink-0 items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
                style={{ background: "linear-gradient(135deg, #9933FF, #FF33AA)" }}
              >
                <Guitar className="h-4 w-4" />
                去房间大厅
              </button>
            </div>
          </div>
        </section>

        {/* 作品详情区 */}
        <section className="mt-10">
          <SectionTitle>作品详情</SectionTitle>
          <dl className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 sm:grid-cols-2">
            {detailRows.map((row) => (
              <div
                key={row.label}
                className="flex items-start gap-3 border-b border-white/10 px-4 py-3 sm:[&:nth-last-child(-n+1)]:border-b-0"
              >
                <dt className="w-20 shrink-0 text-sm text-[#8A8A8A]">{row.label}</dt>
                <dd className="text-sm text-white">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 参与乐手区 */}
        <section className="mt-10">
          <SectionTitle>参与乐手</SectionTitle>

          {/* 署名乐手 */}
          {workAuthors.filter((a: any) => !a.is_anonymous).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-4">
              {workAuthors.filter((a: any) => !a.is_anonymous).map((a: any, i: number) => (
                <div key={a.user_id || `anon-${i}`} className="flex items-center gap-2">
                  <Avatar name={a.nickname} gradient={musicianGradients[i % musicianGradients.length]} size={36} />
                  <span className="text-sm text-white"><UserPopover nickname={a.nickname}>{a.nickname}</UserPopover></span>
                  <span className="text-base leading-none">
                    {instrumentEmojis[a.instrument_category] ?? "🎵"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 匿名乐手 */}
          {anonymousCount > 0 && (
            <p className="mt-3 text-sm" style={{ color: "#8A8A8A" }}>
              {anonymousCount}位匿名乐手
            </p>
          )}
        </section>

        {/* 评论区 — 可滚动 + 时间戳 + 输入框 */}
        <section className="mt-10">
          <SectionTitle>评论区</SectionTitle>

          {/* 评论输入框 */}
          <div className="mb-4 flex gap-3">
            <span
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
            >
              U
            </span>
            <div className="flex flex-1 flex-col gap-2">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="说点什么…"
                rows={2}
                className="w-full resize-none rounded-lg border border-[#1A1A1A] bg-[#0D0D0D] px-3 py-2 text-sm text-white placeholder:text-[#666] outline-none transition-colors focus:border-[#00AAFF]"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSendComment}
                  disabled={!commentText.trim()}
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
                >
                  发送
                </button>
              </div>
            </div>
          </div>

          {/* 评论列表 */}
          <div className="max-h-[320px] overflow-y-auto rounded-xl border border-white/10">
            <ul>
              {comments.map((c, i) => (
                <li
                  key={i}
                  className="border-b border-white/10 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">
                      {c.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-white"><UserPopover nickname={c.name}>{c.name}</UserPopover></span>
                        <span className="text-[11px] text-[#666]">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-[#C9C9C9]">{c.text}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-center text-xs text-[#8A8A8A]">
            评论区功能即将开放，敬请期待
          </p>
        </section>

      </div>

    </div>
  )
}

export function WorkDetailPage() {
  return <WorkDetailInner />
}
