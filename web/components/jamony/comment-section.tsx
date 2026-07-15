"use client"

import { useEffect, useState } from "react"
import { ThumbsUp, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { Avatar } from "@/components/jamony/avatar"
import { UserPopover } from "@/components/jamony/user-popover"

// 通用评论区组件：subjectType 切 API（work→/api/works, notice→/api/notices）
// 从 work-detail-page 评论逻辑提取，自管 comments state，不用 comments-context

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
  avatar_url?: string
}

const REPORT_REASONS = ["垃圾广告", "辱骂攻击", "色情低俗", "诈骗信息", "其他"]

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

export function CommentSection({
  subjectType,
  subjectId,
}: {
  subjectType: "work" | "notice"
  subjectId: string | number
  fallbackCount?: number
}) {
  const { loggedIn, setShowLoginModal, user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState("")
  const [replyTo, setReplyTo] = useState<{ parentId: number; nickname: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null)
  const [pendingReport, setPendingReport] = useState<Comment | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [reportCustom, setReportCustom] = useState("")
  const [reportSent, setReportSent] = useState(false)

  const apiBase = `/api/${subjectType === "work" ? "works" : "notices"}/${subjectId}/comments`

  useEffect(() => {
    const uidQ = user?.id ? `?userId=${user.id}` : ""
    fetch(`${apiBase}${uidQ}`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setComments(data.comments) })
      .catch(() => {})
  }, [subjectId, user?.id])

  const handleSendComment = async () => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!commentText.trim() || !user) return
    const content = commentText.trim()
    const parentId = replyTo?.parentId || null
    const replyToNickname = replyTo?.nickname || null
    setCommentText("")
    setReplyTo(null)
    try {
      const r = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, content, parentId, replyToNickname }),
      })
      const data = await r.json()
      if (data.ok) {
        const nc = { ...data.comment, avatar_url: user.avatarUrl }
        if (parentId) {
          setComments((cs) => cs.map((c) => c.id === parentId ? { ...c, replies: [...c.replies, nc] } : c))
        } else {
          setComments((cs) => [nc, ...cs])
        }
      }
    } catch {}
  }

  const handleDeleteComment = async (commentId: number, parentId: number | null) => {
    if (!user) return
    try {
      const r = await fetch(`${apiBase}/${commentId}?userId=${user.id}`, { method: "DELETE" })
      const data = await r.json()
      if (data.ok) {
        if (parentId) {
          setComments((cs) => cs.map((c) => c.id === parentId ? { ...c, replies: c.replies.filter((r) => r.id !== commentId) } : c))
        } else {
          setComments((cs) => cs.filter((c) => c.id !== commentId))
        }
      }
    } catch {}
  }

  const handleLikeComment = async (commentId: number, isLiked: boolean) => {
    if (!loggedIn) { setShowLoginModal(true); return }
    if (!user) return
    const action = isLiked ? "unlike" : "like"
    const delta = isLiked ? -1 : 1
    setComments((cs) => cs.map((c) => {
      if (c.id === commentId) return { ...c, is_liked: !isLiked, likes: c.likes + delta }
      if (c.replies.some((r) => r.id === commentId)) {
        return { ...c, replies: c.replies.map((r) => r.id === commentId ? { ...r, is_liked: !isLiked, likes: r.likes + delta } : r) }
      }
      return c
    }))
    try {
      const r = await fetch(`${apiBase}/${commentId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action }),
      })
      const data = await r.json()
      if (data.ok) {
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

  const handleReport = async () => {
    if (!user || !pendingReport) return
    const reason = reportReason === "其他" ? reportCustom.trim() : reportReason
    if (!reason) return
    try {
      await fetch(`${apiBase}/${pendingReport.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, reason }),
      })
      setPendingReport(null)
      setReportReason("")
      setReportCustom("")
      setReportSent(true)
      setTimeout(() => setReportSent(false), 2000)
    } catch {}
  }

  return (
    <section id="comments" className="mt-5">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[13px] text-[#8A8A8A]">评论</h2>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      {/* 输入框 */}
      <div className="mb-4 flex gap-3">
        <Avatar nickname={user?.nickname || "U"} avatarUrl={user?.avatarUrl} size={28} className="mt-1" />
        <div className="flex flex-1 flex-col gap-2">
          {replyTo && (
            <div className="flex items-center gap-2 text-xs" style={{ color: "#8A8A8A" }}>
              <span>回复 {replyTo.nickname}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-[#9A9A9A] transition-colors hover:text-white">取消</button>
            </div>
          )}
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={replyTo ? `回复 ${replyTo.nickname}…` : "说点什么…"}
            rows={2}
            maxLength={200}
            className="w-full resize-none rounded-lg border border-[#1A1A1A] bg-[#0D0D0D] px-3 py-2 text-sm text-white placeholder:text-[#9A9A9A] outline-none transition-colors focus:border-[#00AAFF]"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSendComment}
              disabled={!commentText.trim()}
              className="rounded-full px-4 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-30"
              style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
            >发送</button>
          </div>
        </div>
      </div>

      {/* 列表 */}
      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#8A8A8A]">还没有评论，来抢沙发吧</p>
      ) : (
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-white/10">
          <ul>
            {comments.map((c) => (
              <li key={c.id} className="border-b border-white/10 px-4 py-3 last:border-b-0">
                <div className="flex items-start gap-2.5">
                  <Avatar nickname={c.nickname} avatarUrl={c.avatar_url} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-white"><UserPopover nickname={c.nickname}>{c.nickname}</UserPopover></span>
                      <span className="text-[11px] text-[#9A9A9A]">{formatRelativeTime(c.created_at)}</span>
                      {c.user_id === user?.id && (
                        <button type="button" onClick={() => setPendingDelete(c)} className="ml-auto text-[#999] transition-colors hover:text-[#FF33AA]" aria-label="删除评论">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-[#C9C9C9]">{c.content}</p>
                    <div className="mt-1 flex items-center gap-4">
                      <button type="button" onClick={() => handleLikeComment(c.id, c.is_liked)} className="flex items-center gap-1 text-[11px] transition-transform active:scale-125" style={{ color: c.is_liked ? "#00AAFF" : "#9A9A9A" }} aria-label="点赞">
                        <ThumbsUp className="h-3 w-3" fill={c.is_liked ? "#00AAFF" : "none"} />{c.likes}
                      </button>
                      <button type="button" onClick={() => setReplyTo({ parentId: c.id, nickname: c.nickname })} className="text-[11px] text-[#9A9A9A] transition-colors hover:text-white">回复</button>
                      {c.user_id !== user?.id && (
                        <button type="button" onClick={() => setPendingReport(c)} className="ml-auto text-[11px] text-[#9A9A9A] transition-colors hover:text-[#FF33AA]">举报</button>
                      )}
                    </div>

                    {c.replies.length > 0 && (
                      <div className="mt-2 space-y-2 border-l border-white/10 pl-3">
                        {c.replies.map((r) => (
                          <div key={r.id} className="flex items-start gap-2">
                            <Avatar nickname={r.nickname} avatarUrl={r.avatar_url} size={20} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-medium text-white"><UserPopover nickname={r.nickname}>{r.nickname}</UserPopover></span>
                                <span className="text-[10px] text-[#9A9A9A]">{formatRelativeTime(r.created_at)}</span>
                                {r.user_id === user?.id && (
                                  <button type="button" onClick={() => setPendingDelete(r)} className="ml-auto text-[#999] transition-colors hover:text-[#FF33AA]" aria-label="删除回复">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-[#A0A0A0]">
                                {r.reply_to_nickname && <span className="text-[#9A9A9A]">回复 {r.reply_to_nickname}：</span>}
                                {r.content}
                              </p>
                              <div className="mt-1 flex items-center gap-3">
                                <button type="button" onClick={() => handleLikeComment(r.id, r.is_liked)} className="flex items-center gap-1 text-[10px] transition-transform active:scale-125" style={{ color: r.is_liked ? "#00AAFF" : "#9A9A9A" }} aria-label="点赞">
                                  <ThumbsUp className="h-2.5 w-2.5" fill={r.is_liked ? "#00AAFF" : "none"} />{r.likes}
                                </button>
                                <button type="button" onClick={() => setReplyTo({ parentId: c.id, nickname: r.nickname })} className="text-[10px] text-[#9A9A9A] transition-colors hover:text-white">回复</button>
                                {r.user_id !== user?.id && (
                                  <button type="button" onClick={() => setPendingReport(r)} className="ml-auto text-[10px] text-[#9A9A9A] transition-colors hover:text-[#FF33AA]">举报</button>
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

      {/* 删除确认弹窗 */}
      {pendingDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-white">确认删除这条评论吗？</p>
            <p className="mt-1 text-xs text-[#8A8A8A] line-clamp-2">{pendingDelete.content}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white">取消</button>
              <button type="button" onClick={async () => { await handleDeleteComment(pendingDelete.id, pendingDelete.parent_id); setPendingDelete(null) }} className="rounded-full px-4 py-1.5 text-xs font-medium text-white" style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}>删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 举报弹窗 */}
      {pendingReport && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => { setPendingReport(null); setReportReason(""); setReportCustom("") }}>
          <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-white">举报这条评论</p>
            <p className="mt-1 text-xs text-[#8A8A8A] line-clamp-2">{pendingReport.content}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REPORT_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setReportReason(r)} className="rounded-full px-3 py-1 text-xs transition-colors" style={reportReason === r ? { background: "linear-gradient(135deg, #FF33AA, #9933FF)", color: "#fff" } : { background: "#161616", color: "#8A8A8A" }}>{r}</button>
              ))}
            </div>
            {reportReason === "其他" && (
              <textarea value={reportCustom} onChange={(e) => setReportCustom(e.target.value)} placeholder="说明原因…" rows={2} maxLength={100} className="mt-2 w-full resize-none rounded-lg border border-[#1A1A1A] bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#00AAFF]" />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setPendingReport(null); setReportReason(""); setReportCustom("") }} className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white">取消</button>
              <button type="button" disabled={!reportReason || (reportReason === "其他" && !reportCustom.trim())} onClick={handleReport} className="rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-30" style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}>提交举报</button>
            </div>
          </div>
        </div>
      )}

      {reportSent && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-xs text-white" style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}>举报已提交，感谢反馈</div>
      )}
    </section>
  )
}
