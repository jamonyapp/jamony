"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Settings } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { useAuth } from "@/lib/auth-context"
import { TrackCard } from "@/components/jamony/track-card"
import { AnonymizeDialog } from "@/components/jamony/anonymize-dialog"
import { FollowButton } from "@/components/jamony/follow-button"
import { Avatar } from "@/components/jamony/avatar"
import { UserPopover } from "@/components/jamony/user-popover"
import { NoticeDetailModal } from "@/components/jamony/notice-detail-modal"
import { PublishNoticeModal } from "@/components/jamony/publish-notice-modal"
import { mapNotice } from "@/lib/notice-mappers"
import { type Track, type Notice, NOTICE_TYPE_COLOR, NOTICE_TYPE_LABEL } from "@/lib/jamony-data"

const GRADIENT = "linear-gradient(90deg, #00AAFF, #9933FF, #FF33AA, #BBEE00)"

type UserProfile = {
  id: number
  nickname: string
  bio: string
  signature: string
  city: string
  primary_instrument: string
  secondary_instrument: string
  styles: string[]
  avatar_index: number
  level: number
  points: number
  works_count: number
  total_likes: number
  followers_count: number | null
  following_count: number | null
  is_following?: boolean
  avatar_url?: string
  created_at: string
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="inline-block border-b border-[#1A1A1A] pb-1 text-[13px] text-[#8A8A8A]">
      {children}
    </h2>
  )
}

export function ProfilePage({ nickname }: { nickname: string }) {
  const router = useRouter()
  const { user: currentUser, loggedIn, ready, setShowLoginModal } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [userWorks, setUserWorks] = useState<any[]>([])
  const [anonymizeTarget, setAnonymizeTarget] = useState<{ id: number; title: string } | null>(null)
  const [myNotices, setMyNotices] = useState<Notice[]>([])
  const [noticeDetail, setNoticeDetail] = useState<Notice | null>(null)
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [myFavorites, setMyFavorites] = useState<Notice[]>([])
  const [myFavWorks, setMyFavWorks] = useState<any[]>([])
  const [favDetail, setFavDetail] = useState<Notice | null>(null)
  const [tab, setTab] = useState<'works' | 'notices' | 'favorites' | 'following' | 'followers'>('works')
  const [followingList, setFollowingList] = useState<any[] | null>(null)
  const [followersList, setFollowersList] = useState<any[] | null>(null)
  const [followPrivateMsg, setFollowPrivateMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!loggedIn) {
      setShowLoginModal(true)
      setLoading(false)
      return
    }
    async function load() {
      try {
        const res = await fetch(`/api/users/by-nickname/${encodeURIComponent(nickname)}`)
        const data = await res.json()
        if (data.ok) {
          setProfile(data.user)
          // works tab 默认，立即拉；其他 tab 懒加载
          const worksRes = await fetch(`/api/users/${data.user.id}/works`)
          const worksData = await worksRes.json()
          if (worksData.ok) {
            setUserWorks(worksData.works)
          }
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [nickname, loggedIn, ready, setShowLoginModal])

  async function refreshWorks() {
    if (!profile) return
    try {
      const worksRes = await fetch(`/api/users/${profile.id}/works`)
      const worksData = await worksRes.json()
      if (worksData.ok) setUserWorks(worksData.works)
    } catch { /* ignore */ }
  }

  async function refreshProfile() {
    try {
      const res = await fetch(`/api/users/by-nickname/${encodeURIComponent(nickname)}`)
      const data = await res.json()
      if (data.ok) setProfile(data.user)
    } catch { /* ignore */ }
  }

  async function refreshNotices() {
    if (!profile) return
    try {
      const res = await fetch(`/api/users/${profile.id}/notices`, { credentials: "include" })
      const data = await res.json()
      if (data.ok) setMyNotices((data.notices || []).map(mapNotice))
    } catch { /* ignore */ }
  }

  // tab 懒加载：切换时按需 fetch 对应数据
  useEffect(() => {
    if (!profile) return
    const pid = profile.id
    const self = loggedIn && currentUser?.id === pid
    if (tab === 'notices') {
      fetch(`/api/users/${pid}/notices`, { credentials: 'include' }).then(r => r.json()).then(d => { if (d.ok) setMyNotices((d.notices || []).map(mapNotice)) }).catch(() => {})
    } else if (tab === 'favorites' && self) {
      fetch(`/api/users/${pid}/favorites`, { credentials: 'include' }).then(r => r.json()).then(d => { if (d.ok) { setMyFavorites((d.notices || []).map(mapNotice)); setMyFavWorks(d.works || []) } }).catch(() => {})
    } else if (tab === 'following') {
      setFollowPrivateMsg(null)
      fetch(`/api/users/${pid}/following`, { credentials: 'include' }).then(r => r.json()).then(d => { if (d.ok) setFollowingList(d.users || []); else if (d.msg) { setFollowingList([]); setFollowPrivateMsg(d.msg) } }).catch(() => {})
    } else if (tab === 'followers') {
      setFollowPrivateMsg(null)
      fetch(`/api/users/${pid}/followers`, { credentials: 'include' }).then(r => r.json()).then(d => { if (d.ok) setFollowersList(d.users || []); else if (d.msg) { setFollowersList([]); setFollowPrivateMsg(d.msg) } }).catch(() => {})
    }
  }, [tab, profile, loggedIn, currentUser])

  const handleNoticeEdit = (n: Notice) => {
    setNoticeDetail(null)
    setEditingNotice(n)
    setPublishOpen(true)
  }
  const handleNoticeDelete = async (n: Notice) => {
    if (!confirm(`确认删除公告「${n.title}」？`)) return
    try {
      const res = await fetch(`/api/notices/${n.id}`, { method: "DELETE", credentials: "include" })
      const data = await res.json()
      if (!data.ok) { alert(data.msg || "删除失败"); return }
      setMyNotices((prev) => prev.filter((x) => x.id !== n.id))
      setNoticeDetail(null)
    } catch { alert("网络错误") }
  }
  const handleNoticePublished = (n: Notice) => {
    setMyNotices((prev) => {
      const idx = prev.findIndex((x) => x.id === n.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = n; return next }
      return [n, ...prev]
    })
  }

  if (!ready) {
    return <div className="min-h-screen bg-black text-white"><TopNav /></div>
  }

  // 未登录 → 显示透明占位（弹窗已弹出）
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav />
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-11">
          <div className="flex h-64 items-center justify-center">
            <p className="text-[#8A8A8A]">加载中...</p>
          </div>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav />
        <main className="mx-auto max-w-3xl px-4 pb-20 pt-11">
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <p className="text-lg text-[#8A8A8A]">用户不存在</p>
            <button onClick={() => router.push("/")} className="text-sm text-[#00AAFF] hover:underline">
              返回首页
            </button>
          </div>
        </main>
      </div>
    )
  }

  const isSelf = loggedIn && currentUser?.id === profile.id
  const styles: string[] = profile.styles || []
  const instrument = profile.primary_instrument + (profile.secondary_instrument ? ` · ${profile.secondary_instrument}` : "")

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-11">
        <div className="py-8">
          {/* 个人资料区 */}
          <section className="flex items-start gap-5">
            <Avatar nickname={profile.nickname} avatarUrl={profile.avatar_url} size={112} className="shrink-0" />
            <div className="min-w-0 flex-1 self-stretch py-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{profile.nickname}</h1>
                <span className="rounded-[8px] bg-[#0D0D0D] px-2 py-0.5 text-[11px] text-[#B0B0B0] ring-1 ring-[#1A1A1A]">🎵 免费用户</span>
                {isSelf ? (
                  <button
                    type="button"
                    onClick={() => router.push("/settings")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                    title="个人设置"
                  >
                    <Settings className="h-4 w-4" style={{ color: "#8A8A8A" }} />
                  </button>
                ) : (
                  <FollowButton targetUserId={profile.id} initialIsFollowing={!!profile.is_following} onAfterToggle={refreshProfile} />
                )}
              </div>
              {profile.signature && <p className="mt-1 text-[14px] text-[#B0B0B0]">{profile.signature}</p>}
              <p className="mt-1 text-[13px] text-[#8A8A8A]">
                {profile.city}{instrument ? ` · ${instrument}` : ""}
              </p>
              {styles.length > 0 && (
                <p className="mt-1.5 text-[13px] text-[#8A8A8A]">风格偏好：{styles.join('、')}</p>
              )}
            </div>
          </section>

          {/* 统计数据区 */}
          <section className="mt-8 grid grid-cols-4 gap-3">
            {[
              { value: profile.works_count.toLocaleString(), label: "参与作品", tab: 'works' as const, clickable: true },
              { value: profile.total_likes.toLocaleString(), label: "获赞", tab: null, clickable: false },
              { value: profile.following_count == null ? '--' : profile.following_count.toLocaleString(), label: "关注", tab: 'following' as const, clickable: true },
              { value: profile.followers_count == null ? '--' : profile.followers_count.toLocaleString(), label: "粉丝", tab: 'followers' as const, clickable: true },
            ].map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={!s.clickable}
                onClick={() => s.tab && setTab(s.tab as 'works' | 'notices' | 'favorites' | 'following' | 'followers')}
                className={`flex flex-col items-center justify-center rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] py-4 ${s.clickable ? 'cursor-pointer transition-colors hover:bg-white/5' : 'cursor-default'}`}
              >
                <span className="text-[20px] font-bold text-white">{s.value}</span>
                <span className="mt-1 text-[11px] text-[#8A8A8A]">{s.label}</span>
              </button>
            ))}
          </section>

          {/* tab 头 */}
          <section className="mt-8 flex gap-1 border-b border-[#1A1A1A]">
            {([
              { key: 'works', label: '作品' },
              { key: 'notices', label: '公告' },
              ...(isSelf ? [{ key: 'favorites', label: '收藏' }] : []),
              { key: 'following', label: '关注' },
              { key: 'followers', label: '粉丝' },
            ] as const).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key as 'works' | 'notices' | 'favorites' | 'following' | 'followers')}
                className="relative px-4 py-2.5 text-[14px] transition-colors"
                style={{ color: tab === t.key ? '#fff' : '#8A8A8A', fontWeight: tab === t.key ? 600 : 400 }}
              >
                {t.label}
                {tab === t.key && <span className="absolute inset-x-3 -bottom-px h-0.5" style={{ background: '#00AAFF' }} />}
              </button>
            ))}
          </section>

          {/* tab body */}
          <section className="mt-6 min-h-[200px]">
            {tab === 'works' && (
              <div>
                {isSelf && userWorks.length > 0 && (
                  <div className="mb-3 flex justify-end">
                    <button type="button" onClick={() => router.push(`/profile/works?nickname=${encodeURIComponent(nickname)}`)}
                      className="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                      style={{ borderColor: '#2A2A2A', color: '#8A8A8A' }}>显示全部</button>
                  </div>
                )}
                {userWorks.length === 0 ? (
                  <p className="text-sm" style={{ color: '#8A8A8A' }}>暂无作品记录</p>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {userWorks.slice(0, 8).map((w: any) => {
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
                        <TrackCard key={w.id} track={track} size="compact"
                          extraMenuItems={canAnonymize ? [{ label: "取消署名", danger: true, onClick: () => setAnonymizeTarget({ id: w.id, title: w.title }) }] : undefined}
                          badges={isSelf && me && isAnon ? [{ text: "你已匿名", color: "#9A9A9A" }] : undefined}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'notices' && (
              <div>
                {myNotices.length === 0 ? (
                  <p className="text-sm" style={{ color: '#8A8A8A' }}>暂无公告</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {myNotices.map((n) => {
                      const expired = !!n.expireAt && new Date(n.expireAt).getTime() < Date.now()
                      return (
                        <button key={n.id} onClick={() => setNoticeDetail(n)}
                          className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-white/5"
                          style={{ borderColor: '#1A1A1A', opacity: expired ? 0.5 : 1 }}>
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: NOTICE_TYPE_COLOR[n.type] }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{n.title}</p>
                            <p className="text-xs" style={{ color: '#8A8A8A' }}>{NOTICE_TYPE_LABEL[n.type]} · {n.city} · {n.time}</p>
                          </div>
                          {expired && <span className="text-xs" style={{ color: '#FF5C5C' }}>已过期</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === 'favorites' && isSelf && (
              <div className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-3 text-[13px] text-[#8A8A8A]">收藏的公告</h3>
                  {myFavorites.length === 0 ? (
                    <p className="text-sm" style={{ color: '#8A8A8A' }}>暂无</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {myFavorites.map((n) => {
                        const expired = !!n.expireAt && new Date(n.expireAt).getTime() < Date.now()
                        return (
                          <button key={n.id} onClick={() => setFavDetail(n)}
                            className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-white/5"
                            style={{ borderColor: '#1A1A1A', opacity: expired ? 0.5 : 1 }}>
                            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: NOTICE_TYPE_COLOR[n.type] }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-white">{n.title}</p>
                              <p className="text-xs" style={{ color: '#8A8A8A' }}>{NOTICE_TYPE_LABEL[n.type]} · {n.city} · {n.time}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: '#8A8A8A' }}>
                                <Avatar nickname={n.author} avatarUrl={n.authorAvatar} size={14} />
                                <UserPopover nickname={n.author}>{n.author}</UserPopover>
                              </p>
                            </div>
                            {expired && <span className="text-xs" style={{ color: '#FF5C5C' }}>已过期</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="mb-3 text-[13px] text-[#8A8A8A]">收藏的作品</h3>
                  {myFavWorks.length === 0 ? (
                    <p className="text-sm" style={{ color: '#8A8A8A' }}>暂无</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-3">
                      {myFavWorks.map((w: any) => {
                        const track: Track = {
                          id: String(w.id), title: w.title,
                          author: w.author_anonymous ? '匿名乐手' : (w.author_name || '未知'),
                          type: 'jam', nature: w.copyright_type === 'cover' ? 'cover' : 'original', styles: [], instruments: [],
                          plays: w.plays || 0, likes: w.likes || 0, comments: w.comments || 0,
                          duration: w.duration || '', gradient: w.cover_gradient || '',
                          date: w.created_at || '', members: [],
                          coverImage: w.cover_image_path ? w.cover_image_path.replace('/var/jamony/works', '/works') : '',
                          mp3Url: w.mp3_path ? w.mp3_path.replace('/var/jamony/works', '/works') : '',
                          isLiked: false,
                        }
                        return (
                          <TrackCard key={w.id} track={track} size="compact" />
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {(tab === 'following' || tab === 'followers') && (
              <div>
                {followPrivateMsg ? (
                  <p className="flex h-32 items-center justify-center text-sm" style={{ color: '#8A8A8A' }}>{followPrivateMsg}</p>
                ) : (tab === 'following' ? followingList : followersList) === null ? (
                  <p className="text-sm" style={{ color: '#8A8A8A' }}>加载中...</p>
                ) : (tab === 'following' ? followingList : followersList)!.length === 0 ? (
                  <p className="text-sm" style={{ color: '#8A8A8A' }}>暂无</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(tab === 'following' ? followingList : followersList)!.map((u: any) => (
                      <button key={u.id} onClick={() => router.push(`/profile?nickname=${encodeURIComponent(u.nickname)}`)}
                        className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-white/5"
                        style={{ borderColor: '#1A1A1A' }}>
                        <Avatar nickname={u.nickname} avatarUrl={u.avatar_url} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{u.nickname}</p>
                          <p className="text-xs" style={{ color: '#8A8A8A' }}>{u.city}{u.instrument_category ? ` · ${u.instrument_category}` : ''}</p>
                        </div>
                        {currentUser?.id !== u.id && (
                          <FollowButton targetUserId={u.id} initialIsFollowing={!!u.is_following} onAfterToggle={refreshProfile} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
      {anonymizeTarget && (
        <AnonymizeDialog
          workId={anonymizeTarget.id}
          workTitle={anonymizeTarget.title}
          onClose={() => setAnonymizeTarget(null)}
          onDone={() => { setAnonymizeTarget(null); refreshWorks() }}
        />
      )}
      <NoticeDetailModal notice={noticeDetail} onClose={() => setNoticeDetail(null)} onEdit={handleNoticeEdit} onDelete={handleNoticeDelete} />
      <NoticeDetailModal notice={favDetail} onClose={() => setFavDetail(null)} />
      <PublishNoticeModal open={publishOpen} onClose={() => { setPublishOpen(false); setEditingNotice(null) }} onPublished={handleNoticePublished} initialNotice={editingNotice} />
    </div>
  )
}
