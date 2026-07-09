"use client"

import { useEffect, useState } from "react"
import { TopNav } from "@/components/jamony/top-nav"
import { useAuth } from "@/lib/auth-context"
import { TrackCard } from "@/components/jamony/track-card"
import { AnonymizeDialog } from "@/components/jamony/anonymize-dialog"
import type { Track } from "@/lib/jamony-data"

type SortKey = "desc" | "asc" | "likes"

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "desc", label: "最新" },
  { key: "asc", label: "最早" },
  { key: "likes", label: "最多点赞" },
]

const TAB_OPTIONS = [
  { key: "all", label: "全部" },
  { key: "named", label: "署名" },
  { key: "anon", label: "匿名" },
] as const

export function ManageWorksPage({ nickname }: { nickname: string }) {
  const { user: currentUser, loggedIn, ready, setShowLoginModal } = useAuth()
  const [userId, setUserId] = useState<number | null>(null)
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>("desc")
  const [tab, setTab] = useState<"all" | "named" | "anon">("all")
  const [anonymizeTarget, setAnonymizeTarget] = useState<{ id: number; title: string } | null>(null)

  // 拿 userId（未登录弹窗）
  useEffect(() => {
    if (!ready) return
    if (!loggedIn) {
      setShowLoginModal(true)
      setLoading(false)
      return
    }
    if (!nickname) return
    fetch(`/api/users/by-nickname/${encodeURIComponent(nickname)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setUserId(data.user.id)
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [ready, loggedIn, nickname, setShowLoginModal])

  const isSelf = loggedIn && userId !== null && currentUser?.id === userId

  // 拉作品（sort 变化重拉）
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    fetch(`/api/users/${userId}/works?sort=${sort}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setWorks(data.works)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [userId, sort])

  async function refreshWorks() {
    if (!userId) return
    const res = await fetch(`/api/users/${userId}/works?sort=${sort}`)
    const data = await res.json()
    if (data.ok) setWorks(data.works)
  }

  if (!ready) return <div className="min-h-screen bg-black text-white"><TopNav /></div>
  if (!loggedIn) return <div className="min-h-screen bg-black text-white"><TopNav /></div>

  // 前端 Tab 筛选（仅自己视角；看别人后端只返回署名作品，无需筛选）
  let filteredWorks = works
  if (isSelf && tab !== "all") {
    filteredWorks = works.filter((w) => {
      const me = w.authors?.find((a: any) => a.user_id === currentUser?.id)
      const isAnon = me?.is_anonymous === true
      return tab === "anon" ? isAnon : !isAnon
    })
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav backLinks={[{ label: "返回个人主页", href: `/profile?nickname=${encodeURIComponent(nickname)}` }]} />
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-16 md:px-6">
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-bold text-white">{isSelf ? "我参与的作品" : `${nickname} 参与的作品`}</h1>
          <span className="text-xs" style={{ color: "#8A8A8A" }}>共 {filteredWorks.length} 个</span>
        </div>

        {/* 排序 */}
        <div className="mt-5 flex items-center gap-2">
          <span className="text-xs" style={{ color: "#6A6A6A" }}>排序</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSort(opt.key)}
              className="rounded-full px-3 py-1 text-xs transition-colors"
              style={sort === opt.key
                ? { color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.12)" }
                : { color: "#8A8A8A", backgroundColor: "#0D0D0D", border: "1px solid #2A2A2A" }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 署名/匿名 Tab（仅自己视角） */}
        {isSelf && (
          <div className="mt-3 flex items-center gap-2">
            {TAB_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTab(opt.key)}
                className="rounded-full px-3 py-1 text-xs transition-colors"
                style={tab === opt.key
                  ? { color: "#FFFFFF", backgroundColor: "rgba(153,51,255,0.2)", border: "1px solid #9933FF" }
                  : { color: "#8A8A8A", backgroundColor: "#0D0D0D", border: "1px solid #2A2A2A" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* 作品列表 */}
        {loading ? (
          <p className="mt-10 text-sm" style={{ color: "#8A8A8A" }}>加载中...</p>
        ) : filteredWorks.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] px-6 py-20 text-center">
            <p className="text-base font-medium" style={{ color: "#B0B0B0" }}>暂无作品</p>
            <p className="mt-2 text-xs" style={{ color: "#8A8A8A" }}>参与录制并发表合奏后，作品将显示在这里</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredWorks.map((w: any) => {
              const me = w.authors?.find((a: any) => a.user_id === currentUser?.id)
              const isAnon = me?.is_anonymous === true
              const canAnonymize = isSelf && !!me && !isAnon
              const track: Track = {
                id: String(w.id), title: w.title, author: w.author, type: w.type,
                nature: w.nature, styles: w.styles || [], instruments: w.instruments || [],
                plays: w.plays, likes: w.likes, comments: w.comments, duration: w.duration,
                gradient: w.gradient, date: w.date, members: w.members || [],
                coverImage: w.coverImage, mp3Url: w.mp3Url, isLiked: w.isLiked ?? false,
              }
              return (
                <TrackCard
                  key={w.id}
                  track={track}
                  size="compact"
                  extraMenuItems={canAnonymize ? [{ label: "取消署名", danger: true, onClick: () => setAnonymizeTarget({ id: w.id, title: w.title }) }] : undefined}
                  badges={isSelf && me && isAnon ? [{ text: "你已匿名", color: "#9A9A9A" }] : undefined}
                />
              )
            })}
          </div>
        )}
      </main>

      {anonymizeTarget && (
        <AnonymizeDialog
          workId={anonymizeTarget.id}
          workTitle={anonymizeTarget.title}
          onClose={() => setAnonymizeTarget(null)}
          onDone={() => { setAnonymizeTarget(null); refreshWorks() }}
        />
      )}
    </div>
  )
}
