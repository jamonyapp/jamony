"use client"

import { useEffect, useState } from "react"
import { X, CheckCheck, Trash2 } from "lucide-react"
import { useNotifications, type Notif } from "@/lib/notifications-context"
import { Avatar } from "@/components/jamony/avatar"

const TABS = [
  { key: "comment", label: "评论", types: ["comment_reply"] as string[] },
  { key: "notice", label: "通知", types: ["like", "follow", "system"] as string[] },
  { key: "message", label: "私信", types: [] as string[] },
] as const

export function NotificationDrawer({ open, onClose, onOpenNotice }: { open: boolean; onClose: () => void; onOpenNotice?: (noticeId: number) => void }) {
  const { fetchList, markRead, markAllRead, deleteNotif } = useNotifications()
  const [tab, setTab] = useState<"comment" | "notice" | "message">("comment")
  const [list, setList] = useState<Notif[]>([])
  const [loading, setLoading] = useState(false)
  const [replyingId, setReplyingId] = useState<number | null>(null)
  const [replyText, setReplyText] = useState("")
  const [replySent, setReplySent] = useState<number | null>(null)
  const [myReplies, setMyReplies] = useState<Record<number, string>>({})

  useEffect(() => {
    if (open) {
      setLoading(true)
      fetchList().then((l) => { setList(l); setLoading(false) })
    }
  }, [open])

  const tabDef = TABS.find((t) => t.key === tab)!
  const filtered = tab === "message" ? [] : list.filter((n) => tabDef.types.includes(n.type))

  const handleClick = async (n: Notif) => {
    if (!n.read_at) await markRead(n.id)
    // system 通知（过期）不跳转——过期公告 GET /:id 过滤过期会 404；comment_reply 才弹详情
    if (n.notice_id && n.type === "comment_reply") onOpenNotice?.(n.notice_id)
  }

  const handleDelete = async (e: React.MouseEvent, n: Notif) => {
    e.stopPropagation()
    await deleteNotif(n.id)
    setList((l) => l.filter((x) => x.id !== n.id))
  }

  const handleReadAll = async () => {
    await markAllRead()
    setList((l) => l.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
  }

  // 快速回复：直接回复触发通知的那条评论（parentId=comment_id, replyToNickname=actor）
  const handleQuickReply = async (n: Notif) => {
    if (!replyText.trim() || !n.notice_id) return
    try {
      const r = await fetch(`/api/notices/${n.notice_id}/comments`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ content: replyText.trim(), parentId: n.comment_id, replyToNickname: n.actor_nickname }),
      })
      const data = await r.json()
      if (data.ok) {
        if (!n.read_at) await markRead(n.id)
        const replyContent = replyText.trim()
        setMyReplies((prev) => ({ ...prev, [n.id]: replyContent }))
        setReplyText(""); setReplyingId(null)
        setReplySent(n.id)
        setTimeout(() => setReplySent(null), 2000)
        fetchList().then(setList)
      }
    } catch {}
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-[55] bg-black/50" onClick={onClose} />}
      <div
        className={`fixed right-0 top-0 z-[60] h-full w-[420px] max-w-[90vw] transform border-l transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
      >
        {/* header: 3 tab + 一键全读 + 关闭 */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "#1A1A1A" }}>
          <div className="flex gap-5">
            {TABS.map((t) => {
              const unread = list.filter((n) => t.types.includes(n.type) && !n.read_at).length
              return (
                <button key={t.key} onClick={() => setTab(t.key)} className="relative text-sm font-medium transition-colors"
                  style={{ color: tab === t.key ? "#fff" : "#8A8A8A" }}>
                  {t.label}
                  {unread > 0 && <span className="absolute -right-2 -top-1 h-2 w-2 rounded-full" style={{ background: "#FF33AA" }} />}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3">
            {tab !== "message" && filtered.some((n) => !n.read_at) && (
              <button onClick={handleReadAll} className="text-[#9A9A9A] transition-colors hover:text-white" title="全部已读">
                <CheckCheck className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="text-[#9A9A9A] transition-colors hover:text-white" aria-label="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
          {tab === "message" ? (
            <p className="py-20 text-center text-sm" style={{ color: "#8A8A8A" }}>私信功能即将上线</p>
          ) : loading ? (
            <p className="py-20 text-center text-sm" style={{ color: "#8A8A8A" }}>加载中...</p>
          ) : filtered.length === 0 ? (
            <p className="py-20 text-center text-sm" style={{ color: "#8A8A8A" }}>{tab === "comment" ? "暂无评论通知" : "暂无通知"}</p>
          ) : (
            filtered.map((n) => (
              <div key={n.id} onClick={() => handleClick(n)}
                className="group flex cursor-pointer items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-white/5"
                style={{ borderColor: "#1A1A1A", background: n.read_at ? "transparent" : "rgba(153,51,255,0.06)" }}>
                <Avatar nickname={n.actor_nickname || "U"} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">
                    {n.type === "system" ? (n.message || "系统通知") : `${n.actor_nickname}${n.count > 1 ? ` 等${n.count}人` : ""} 回复了你的公告「${n.notice_title || ""}」`}
                  </p>
                  {n.comment_content && (
                    <p className="mt-1 border-l-2 pl-2 text-xs" style={{ color: "#C8C8C8", borderColor: "#9933FF" }}>
                      <span className="font-medium text-white">{n.actor_nickname}</span>：{n.comment_content}
                    </p>
                  )}
                  {myReplies[n.id] && (
                    <p className="mt-1 border-l-2 pl-2 text-xs" style={{ color: "#7BE495", borderColor: "#7BE495" }}>你：{myReplies[n.id]}</p>
                  )}
                  <p className="mt-0.5 text-xs" style={{ color: "#8A8A8A" }}>{new Date(n.updated_at).toLocaleString("zh-CN")}</p>
                  {n.type === "comment_reply" && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      {replyingId === n.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder={`回复 ${n.actor_nickname}…`} rows={2} maxLength={200}
                            className="w-full resize-none rounded-lg border border-[#2A2A2A] bg-[#0D0D0D] px-3 py-2 text-sm text-white outline-none focus:border-[#9933FF]" />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => { setReplyingId(null); setReplyText("") }} className="text-xs text-[#9A9A9A] transition-colors hover:text-white">取消</button>
                            <button onClick={() => handleQuickReply(n)} disabled={!replyText.trim()} className="rounded-full px-4 py-1 text-xs font-medium text-white disabled:opacity-30" style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}>发送</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReplyingId(n.id); setReplyText("") }} className="text-xs transition-colors hover:text-white" style={{ color: replySent === n.id ? "#7BE495" : "#9A9A9A" }}>
                          {replySent === n.id ? "已回复 ✓" : "回复"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span onClick={(e) => handleDelete(e, n)} className="mt-0.5 text-[#5A5A5A] opacity-0 transition-opacity hover:text-[#FF33AA] group-hover:opacity-100" aria-label="删除">
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
