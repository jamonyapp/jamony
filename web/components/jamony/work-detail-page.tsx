"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Play, Pause, ThumbsUp, MessageCircle, Check, ListMusic, Trash2 } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { usePlayer } from "@/components/jamony/player-context"
import { LikeButton } from "@/components/jamony/like-button"
import { CommentCount } from "@/components/jamony/comment-count"
import { useComments } from "@/lib/comments-context"
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

// 评论类型（一级评论含 replies；5.3 先用一级，5.4 接入 replies 展示）
interface Comment {
  id: number
  user_id: number
  nickname: string
  content: string
  parent_id: number | null
  reply_to_nickname: string | null
  created_at: string
  replies: Comment[]
  likes: number
  is_liked: boolean
}

// 相对时间格式化（刚刚 / X分钟前 / X小时前 / X天前 / 日期）
function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Math.max(0, Date.now() - t)
  const min = Math.floor(diff / 60000)
  if (min < 1) return "刚刚"
  if (min < 60) return `${min}分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}天前`
  return new Date(iso).toLocaleDateString("zh-CN")
}

// 举报预设理由
const REPORT_REASONS = ["垃圾广告", "辱骂攻击", "色情低俗", "诈骗信息", "其他"]

function resolveId(): string {
  if (typeof window === "undefined") return ""
  return window.location.pathname.replace(/^\/library\//, "").replace(/\/$/, "")
}

function WorkDetailInner() {
  const router = useRouter()
  const { setQueue, playTrack, current, isPlaying, togglePlay, stop, addToPlaylist } = usePlayer()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [commentText, setCommentText] = useState("")
  const [fromFilter, setFromFilter] = useState(false)
  const [track, setTrack] = useState<Track | null>(null)
  const [workAuthors, setWorkAuthors] = useState<any[]>([])
  const [anonymousCount, setAnonymousCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [intro, setIntro] = useState("")
  const [coverSong, setCoverSong] = useState("")
  const [coverAuthor, setCoverAuthor] = useState("")
  const [remixSource, setRemixSource] = useState("")
  const [comments, setComments] = useState<Comment[]>([])
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null)
  const [replyTo, setReplyTo] = useState<{ parentId: number; nickname: string } | null>(null)
  const [pendingReport, setPendingReport] = useState<Comment | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [reportCustom, setReportCustom] = useState("")
  const [reportSent, setReportSent] = useState(false)
  const { loggedIn, setShowLoginModal, user } = useAuth()
  const { adjustCount } = useComments()

  // 检测来源是否为筛选页（track-card 跳转前在 sessionStorage 标记；客户端导航下 document.referrer 不更新）
  useEffect(() => {
    if (typeof window !== "undefined") {
      setFromFilter(sessionStorage.getItem("libFrom") === "filter")
    }
  }, [])

  const handleSendComment = async () => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!commentText.trim() || !user || !track) return
    const content = commentText.trim()
    const parentId = replyTo?.parentId || null
    const replyToNickname = replyTo?.nickname || null
    setCommentText("")
    setReplyTo(null)
    try {
      const r = await fetch(`/api/works/${track.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, content, parentId, replyToNickname }),
      })
      const data = await r.json()
      if (data.ok) {
        if (parentId) {
          // 回复：追加到父评论 replies（回复不计入 works.comments）
          setComments((cs) => cs.map((c) => c.id === parentId ? { ...c, replies: [...c.replies, data.comment] } : c))
        } else {
          // 一级评论：顶部 + 评论数 +1
          setComments((cs) => [data.comment, ...cs])
          adjustCount(track.id, 1, track.comments)
        }
      }
    } catch {}
  }

  const handleDeleteComment = async (commentId: number, parentId: number | null) => {
    if (!user || !track) return
    try {
      const r = await fetch(`/api/works/${track.id}/comments/${commentId}?userId=${user.id}`, { method: 'DELETE' })
      const data = await r.json()
      if (data.ok) {
        if (parentId) {
          // 删除回复：从父评论 replies 移除（回复不计入 works.comments）
          setComments((cs) => cs.map((c) => c.id === parentId ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) } : c))
        } else {
          // 删除一级评论：移除 + 评论数 -1
          setComments((cs) => cs.filter((c) => c.id !== commentId))
          adjustCount(track.id, -1, track.comments)
        }
      }
    } catch {}
  }

  // 评论点赞/取消（一级评论与回复通用，遍历 comments + replies 更新）
  const handleLikeComment = async (commentId: number, isLiked: boolean) => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!user || !track) return
    const action = isLiked ? 'unlike' : 'like'
    const delta = isLiked ? -1 : 1
    // 乐观更新
    setComments((cs) => cs.map((c) => {
      if (c.id === commentId) return { ...c, is_liked: !isLiked, likes: c.likes + delta }
      if (c.replies.some((r) => r.id === commentId)) {
        return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, is_liked: !isLiked, likes: r.likes + delta } : r) }
      }
      return c
    }))
    try {
      const r = await fetch(`/api/works/${track.id}/comments/${commentId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, action }),
      })
      const data = await r.json()
      if (data.ok) {
        // 后端准确值校正
        setComments((cs) => cs.map((c) => {
          if (c.id === commentId) return { ...c, likes: data.likes }
          if (c.replies.some((r) => r.id === commentId)) {
            return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, likes: data.likes } : r) }
          }
          return c
        }))
      }
    } catch {}
  }

  // 举报评论
  const handleReport = async () => {
    if (!user || !track || !pendingReport) return
    const reason = reportReason === "其他" ? reportCustom.trim() : reportReason
    if (!reason) return
    try {
      await fetch(`/api/works/${track.id}/comments/${pendingReport.id}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, reason }),
      })
      setPendingReport(null)
      setReportReason("")
      setReportCustom("")
      setReportSent(true)
      setTimeout(() => setReportSent(false), 2000)
    } catch {}
  }

  // 从 /api/works 读取作品
  useEffect(() => {
    const id = resolveId()
    if (!id) { setLoading(false); return }

    const uidQ = user?.id ? `?userId=${user.id}` : ""
    Promise.all([
      fetch(`/api/works/${id}${uidQ}`).then(r => r.json()),
      fetch(`/api/works${uidQ}`).then(r => r.json()),
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
        setLiked(w.isLiked || false)
        setWorkAuthors(w.authors || [])
        setAnonymousCount(w.anonymousCount || 0)
        setIntro(w.description || "")
        setCoverSong(w.coverSong || "")
        setCoverAuthor(w.coverAuthor || "")
        setRemixSource(w.source || "")
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
  }, [setQueue, user?.id])

  // 拉取评论列表
  useEffect(() => {
    if (!track) return
    const uidQ = user?.id ? `?userId=${user.id}` : ""
    fetch(`/api/works/${track.id}/comments${uidQ}`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setComments(data.comments) })
      .catch(() => {})
  }, [track?.id, user?.id])

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

  function handlePlay() {
    if (isCurrent) {
      togglePlay()
    } else {
      playTrack(track)
    }
  }


  // 乐器 → emoji（发表时刻乐器快照，固化不受今后改主力乐器影响）
  const instrumentEmojis: Record<string, string> = {
    "电吉他": "🎸", "木吉他": "🎸", "贝斯": "🎸",
    "鼓·小打": "🥁", "打击乐器": "🥁", "键盘乐器": "🎹", "主唱": "🎤",
    "管乐": "🎷", "弦乐": "🎻", "电子": "🎛️",
    "民乐": "🪕", "其他": "🎵",
  }

  // 详情行
  const detailRows = [
    { label: "创作类型", value: track.type === "rehearsal" ? "排练作品" : "Jam 时刻" },
    { label: "性质", value: track.nature === "original" ? "原创" : track.nature === "cover" ? "翻唱" : "Remix" },
    { label: "风格", value: track.styles.join(" · ") },
    { label: "乐器", value: track.instruments.map(cat => instrumentEmojis[cat] ?? "🎵").join("  ") },
    { label: "发表时间", value: track.date },
    { label: "时长", value: track.duration },
  ]

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
        <section className="flex flex-col gap-5 pt-2 sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={handlePlay}
            className="group relative w-44 shrink-0 self-start sm:w-48"
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

          {/* 右侧：上半（信息列 + CTA）+ 下半（简介框拉通到最右） */}
          <div className="flex flex-1 flex-col gap-3 pt-1">
            <div className="flex gap-5 sm:items-start">
              <div className="flex flex-1 flex-col gap-3">
                <h1 className="text-2xl font-bold text-white sm:text-[28px]">
                  {track.title}
                </h1>

                <div className="flex flex-wrap gap-2">
                  {track.styles.map((s) => (
                    <Tag key={s} text={s} color="#00AAFF" />
                  ))}
                  <Tag text={track.nature === "original" ? "原创" : track.nature === "cover" ? "翻唱" : "Remix"} color="#FF33AA" />
                </div>

                {/* 翻唱/Remix 来源（发表时若填写则显示） */}
                {track.nature === "cover" && (coverSong || coverAuthor) && (
                  <p className="text-xs text-[#8A8A8A]">
                    翻唱自{coverSong ? `《${coverSong}》` : ""}{coverAuthor ? ` - ${coverAuthor}` : ""}
                  </p>
                )}
                {track.nature === "remix" && remixSource && (
                  <p className="text-xs text-[#8A8A8A]">素材来源：{remixSource}</p>
                )}

                <div className="flex items-center gap-5 pt-1 text-sm text-white">
                  <button
                    type="button"
                    onClick={handlePlay}
                    className="flex items-center gap-1.5"
                  >
                    <Play className="h-4 w-4" fill="currentColor" />
                    {track.plays}
                  </button>
                  <LikeButton workId={track.id} isLiked={liked} likes={likeCount} iconClass="h-4 w-4" />
                  <CommentCount
                    workId={track.id}
                    count={track.comments}
                    iconClass="h-4 w-4"
                    onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}
                  />
                  <button
                    type="button"
                    onClick={() => addToPlaylist(track)}
                    className="flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
                  >
                    <ListMusic className="h-4 w-4" />
                    加入播放列表
                  </button>
                </div>
              </div>

              {/* CTA — 右上角小卡片 */}
              <div className="flex shrink-0 flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#0D0D0D] px-5 py-4 sm:w-56">
                <p className="text-sm font-bold text-white">听不过瘾？来玩真的！</p>
                <button
                  type="button"
                  onClick={() => {
                    // 先同步停止播放，再跳转去房间大厅（与顶栏"返回首页"效果一致）
                    stop()
                    window.location.href = "/lobby"
                  }}
                  className="flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80"
                  style={{ background: "linear-gradient(135deg, #9933FF, #FF33AA)" }}
                >
                  去房间大厅
                </button>
              </div>
            </div>

            {/* 作品简介 — 去框纯文字，统一字号，预设 2 行空间，从第一行左端开始，贴齐封面底 */}
            <p className="mt-auto line-clamp-2 min-h-[2.875rem] text-sm leading-relaxed text-[#C9C9C9]">
              <span className="text-[#8A8A8A]">作品简介</span>　　{intro || "考验悟性的时刻到了！这些随性的乐手什么都不想说。"}
            </p>
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
        <section id="comments" className="mt-10">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[13px] text-[#8A8A8A]">评论区</h2>
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px]" style={{ color: "#666" }}>你可以摇滚，但文明永不过时。</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {/* 评论输入框 */}
          <div className="mb-4 flex gap-3">
            <span
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
            >
              {user?.nickname?.charAt(0) || "U"}
            </span>
            <div className="flex flex-1 flex-col gap-2">
              {replyTo && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "#8A8A8A" }}>
                  <span>回复 {replyTo.nickname}</span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="text-[#666] transition-colors hover:text-white"
                  >
                    取消
                  </button>
                </div>
              )}
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={replyTo ? `回复 ${replyTo.nickname}…` : "说点什么…"}
                rows={2}
                maxLength={200}
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
          {comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8A8A8A]">还没有评论，来抢沙发吧</p>
          ) : (
            <div className="max-h-[440px] overflow-y-auto rounded-xl border border-white/10">
              <ul>
                {comments.map((c) => (
                  <li key={c.id} className="border-b border-white/10 px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={c.nickname} gradient={musicianGradients[0]} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-white"><UserPopover nickname={c.nickname}>{c.nickname}</UserPopover></span>
                          <span className="text-[11px] text-[#666]">{formatRelativeTime(c.created_at)}</span>
                          {c.user_id === user?.id && (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(c)}
                              className="ml-auto text-[#999] transition-colors hover:text-[#FF33AA]"
                              aria-label="删除评论"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-[#C9C9C9]">{c.content}</p>
                        <div className="mt-1 flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => handleLikeComment(c.id, c.is_liked)}
                            className="flex items-center gap-1 text-[11px] transition-transform active:scale-125"
                            style={{ color: c.is_liked ? "#00AAFF" : "#666" }}
                            aria-label="点赞"
                          >
                            <ThumbsUp className="h-3 w-3" fill={c.is_liked ? "#00AAFF" : "none"} />
                            {c.likes}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyTo({ parentId: c.id, nickname: c.nickname })}
                            className="text-[11px] text-[#666] transition-colors hover:text-white"
                          >
                            回复
                          </button>
                          {c.user_id !== user?.id && (
                            <button
                              type="button"
                              onClick={() => setPendingReport(c)}
                              className="ml-auto text-[11px] text-[#666] transition-colors hover:text-[#FF33AA]"
                            >
                              举报
                            </button>
                          )}
                        </div>

                        {/* 回复列表（字号小颜色暗） */}
                        {c.replies.length > 0 && (
                          <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
                            {c.replies.map((r) => (
                              <div key={r.id} className="flex items-start gap-2">
                                <Avatar name={r.nickname} gradient={musicianGradients[0]} size={22} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-medium text-white"><UserPopover nickname={r.nickname}>{r.nickname}</UserPopover></span>
                                    <span className="text-[10px] text-[#666]">{formatRelativeTime(r.created_at)}</span>
                                    {r.user_id === user?.id && (
                                      <button
                                        type="button"
                                        onClick={() => setPendingDelete(r)}
                                        className="ml-auto text-[#999] transition-colors hover:text-[#FF33AA]"
                                        aria-label="删除回复"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs text-[#A0A0A0]">
                                    {r.reply_to_nickname && <span className="text-[#666]">回复 {r.reply_to_nickname}：</span>}
                                    {r.content}
                                  </p>
                                  <div className="mt-1 flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() => handleLikeComment(r.id, r.is_liked)}
                                      className="flex items-center gap-1 text-[10px] transition-transform active:scale-125"
                                      style={{ color: r.is_liked ? "#00AAFF" : "#666" }}
                                      aria-label="点赞"
                                    >
                                      <ThumbsUp className="h-2.5 w-2.5" fill={r.is_liked ? "#00AAFF" : "none"} />
                                      {r.likes}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setReplyTo({ parentId: c.id, nickname: r.nickname })}
                                      className="text-[10px] text-[#666] transition-colors hover:text-white"
                                    >
                                      回复
                                    </button>
                                    {r.user_id !== user?.id && (
                                      <button
                                        type="button"
                                        onClick={() => setPendingReport(r)}
                                        className="ml-auto text-[10px] text-[#666] transition-colors hover:text-[#FF33AA]"
                                      >
                                        举报
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 删除评论确认弹窗 */}
        {pendingDelete && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-6"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setPendingDelete(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border p-5"
              style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-white">确认删除这条评论吗？</p>
              <p className="mt-1 text-xs text-[#8A8A8A] line-clamp-2">{pendingDelete.content}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleDeleteComment(pendingDelete.id, pendingDelete.parent_id)
                    setPendingDelete(null)
                  }}
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-white"
                  style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 举报评论弹窗 */}
        {pendingReport && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-6"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => { setPendingReport(null); setReportReason(""); setReportCustom("") }}
          >
            <div
              className="w-full max-w-sm rounded-2xl border p-5"
              style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm text-white">举报这条评论</p>
              <p className="mt-1 text-xs text-[#8A8A8A] line-clamp-2">{pendingReport.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReportReason(r)}
                    className="rounded-full px-3 py-1 text-xs transition-colors"
                    style={reportReason === r
                      ? { background: "linear-gradient(135deg, #FF33AA, #9933FF)", color: "#fff" }
                      : { background: "#161616", color: "#8A8A8A" }}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reportReason === "其他" && (
                <textarea
                  value={reportCustom}
                  onChange={(e) => setReportCustom(e.target.value)}
                  placeholder="说明原因…"
                  rows={2}
                  maxLength={100}
                  className="mt-2 w-full resize-none rounded-lg border border-[#1A1A1A] bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#00AAFF]"
                />
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setPendingReport(null); setReportReason(""); setReportCustom("") }}
                  className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!reportReason || (reportReason === "其他" && !reportCustom.trim())}
                  onClick={handleReport}
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}
                >
                  提交举报
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 举报成功提示 */}
        {reportSent && (
          <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-xs text-white" style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}>
            举报已提交，感谢反馈
          </div>
        )}

      </div>

    </div>
  )
}

export function WorkDetailPage() {
  return <WorkDetailInner />
}
