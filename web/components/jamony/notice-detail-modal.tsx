"use client"

import { useEffect, useState, type ReactNode } from "react"
import { X, Pencil, Trash2, Flag, Heart } from "lucide-react"
import { type Notice, NOTICE_TYPE_COLOR, NOTICE_TYPE_LABEL } from "@/lib/jamony-data"
import { useAuth } from "@/lib/auth-context"
import { UserPopover } from "@/components/jamony/user-popover"
import { CommentSection } from "@/components/jamony/comment-section"

const REPORT_REASONS = ["垃圾广告", "违规内容", "色情低俗", "诈骗信息", "其他"]

// 公告详情弹窗（统一组件）：board-page / board-screen / top-nav 全局三处复用
// onEdit/onDelete 可选：传了才显示编辑/删除按钮（发布者可见）
export function NoticeDetailModal({
  notice, onClose, onEdit, onDelete,
}: {
  notice: Notice | null
  onClose: () => void
  onEdit?: (n: Notice) => void
  onDelete?: (n: Notice) => void
}) {
  const { loggedIn, setShowLoginModal, user } = useAuth()
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportCustom, setReportCustom] = useState("")
  const [reportSent, setReportSent] = useState(false)
  const [isFav, setIsFav] = useState(false)
  useEffect(() => { setIsFav(!!notice?.isFavorited) }, [notice?.id])
  if (!notice) return null
  const isOwner = !!user && notice.authorId === user.id
  const expired = !!notice.expireAt && new Date(notice.expireAt).getTime() < Date.now()

  const requireAuth = (fn: () => void) => {
    if (!loggedIn) { setShowLoginModal(true); return }
    fn()
  }

  const handleToggleFavorite = async () => {
    const next = !isFav
    setIsFav(next)  // 乐观更新
    try {
      const res = await fetch(`/api/notices/${notice.id}/favorite`, { method: next ? "POST" : "DELETE", credentials: "include" })
      if (!res.ok) setIsFav(!next)
    } catch { setIsFav(!next) }
  }

  const handleReportNotice = async () => {
    const reason = reportReason === "其他" ? reportCustom.trim() : reportReason
    if (!reason || !notice) return
    try {
      await fetch(`/api/notices/${notice.id}/report`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ reason }),
      })
      setReportOpen(false); setReportReason(""); setReportCustom("")
      setReportSent(true)
      setTimeout(() => setReportSent(false), 2000)
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", animation: "jamony-fade-in 200ms ease-out" }} onClick={onClose}>
      <div className="jamony-modal-enter w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border" style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
        <div className="relative h-44 w-full bg-cover bg-center" style={{ backgroundImage: `url('${notice.imageUrl || `/images/jamony-board-bg-${String(notice.bgIndex).padStart(2, "0")}.webp`}')` }}>
          <span className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] to-transparent" />
          <button onClick={onClose} className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70" aria-label="关闭"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NOTICE_TYPE_COLOR[notice.type] }} />
            <span className="text-sm font-semibold" style={{ color: NOTICE_TYPE_COLOR[notice.type] }}>{NOTICE_TYPE_LABEL[notice.type]} · {notice.city}</span>
          </div>

          <h2 className="mb-3 text-lg font-bold text-white">{notice.title}</h2>
          <p className="text-sm leading-relaxed text-[#C9C9C9]">{notice.body}</p>

          <div className="my-5 h-px w-full" style={{ backgroundColor: "#1A1A1A" }} />

          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Meta label="发布人" value={<UserPopover nickname={notice.author}><span className="text-white">{notice.author}</span></UserPopover>} />
            <Meta label="发布时间" value={notice.time} />
            <Meta label="风格" value={notice.style} />
            <Meta label="城市" value={notice.city} />
          </dl>

          {!expired && <CommentSection subjectType="notice" subjectId={notice.id} fallbackCount={notice.comments} />}

          <div className="mt-6 flex gap-3">
            {expired ? (
              isOwner && onDelete && (
                <button className="flex items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm transition-colors hover:bg-[#141414]" style={{ borderColor: "#2A2A2A", color: "#FF5C5C" }} onClick={() => onDelete(notice)}>
                  <Trash2 className="h-4 w-4" />删除
                </button>
              )
            ) : (
              <>
                {isOwner && onEdit && (
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }} onClick={() => onEdit(notice)}>
                    <Pencil className="h-4 w-4" />编辑
                  </button>
                )}
                {isOwner && onDelete && (
                  <button className="flex items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm transition-colors hover:bg-[#141414]" style={{ borderColor: "#2A2A2A", color: "#FF5C5C" }} onClick={() => onDelete(notice)}>
                    <Trash2 className="h-4 w-4" />删除
                  </button>
                )}
                {!isOwner && (
                  <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }} onClick={() => requireAuth(() => setReportOpen(true))}>
                    <Flag className="h-4 w-4" />举报
                  </button>
                )}
                <button className="flex items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm transition-colors hover:bg-[#141414]" style={{ borderColor: isFav ? "#FF33AA" : "#2A2A2A", color: isFav ? "#FF33AA" : "#fff" }} onClick={() => requireAuth(handleToggleFavorite)}>
                  <Heart className="h-4 w-4" fill={isFav ? "#FF33AA" : "none"} />{isFav ? "已收藏" : "收藏"}
                </button>
              </>
            )}
          </div>

          {reportOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => { setReportOpen(false); setReportReason(""); setReportCustom("") }}>
              <div className="w-full max-w-sm rounded-2xl border p-5" style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
                <p className="text-sm text-white">举报这条公告</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REPORT_REASONS.map((r) => (
                    <button key={r} type="button" onClick={() => setReportReason(r)} className="rounded-full px-3 py-1 text-xs transition-colors" style={reportReason === r ? { background: "linear-gradient(135deg, #FF33AA, #9933FF)", color: "#fff" } : { background: "#161616", color: "#8A8A8A" }}>{r}</button>
                  ))}
                </div>
                {reportReason === "其他" && (
                  <textarea value={reportCustom} onChange={(e) => setReportCustom(e.target.value)} placeholder="说明原因…" rows={2} maxLength={100} className="mt-2 w-full resize-none rounded-lg border border-[#1A1A1A] bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#00AAFF]" />
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => { setReportOpen(false); setReportReason(""); setReportCustom("") }} className="px-4 py-1.5 text-xs text-[#9A9A9A] transition-colors hover:text-white">取消</button>
                  <button type="button" disabled={!reportReason || (reportReason === "其他" && !reportCustom.trim())} onClick={handleReportNotice} className="rounded-full px-4 py-1.5 text-xs font-medium text-white disabled:opacity-30" style={{ background: "linear-gradient(135deg, #FF33AA, #9933FF)" }}>提交举报</button>
                </div>
              </div>
            </div>
          )}
          {reportSent && (
            <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-xs text-white" style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}>举报已提交，感谢反馈</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string | ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-[#8A8A8A]">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
