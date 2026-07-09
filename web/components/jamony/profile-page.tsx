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
import type { Track } from "@/lib/jamony-data"

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
  followers_count: number
  following_count: number
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
          // 加载该用户参与的 works
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
            <Avatar nickname={profile.nickname} avatarUrl={profile.avatar_url} size={96} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{profile.nickname}</h1>
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
              <p className="mt-2 text-[13px] text-[#8A8A8A]">
                {profile.city}{instrument ? ` · ${instrument}` : ""}
              </p>
              <span className="mt-3 inline-block rounded-[10px] bg-[#0D0D0D] px-2.5 py-1 text-[12px] text-[#B0B0B0] ring-1 ring-[#1A1A1A]">
                🎵 免费用户
              </span>
            </div>
          </section>

          {/* 统计数据区 */}
          <section className="mt-8 grid grid-cols-4 gap-3">
            {[
              { value: profile.works_count.toLocaleString(), label: "参与作品" },
              { value: profile.total_likes.toLocaleString(), label: "获赞" },
              { value: profile.following_count.toLocaleString(), label: "关注" },
              { value: profile.followers_count.toLocaleString(), label: "粉丝" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center justify-center rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] py-4"
              >
                <span className="text-[20px] font-bold text-white">{s.value}</span>
                <span className="mt-1 text-[11px] text-[#8A8A8A]">{s.label}</span>
              </div>
            ))}
          </section>

          {/* 擅长风格区 */}
          {styles.length > 0 && (
            <section className="mt-10">
              <SectionLabel>风格偏好</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {styles.map((g) => (
                  <span
                    key={g}
                    className="rounded-full px-3 py-1 text-[13px]"
                    style={{ color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.12)" }}
                  >
                    {g}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 作品记录区 */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-white">我参与的作品</h2>
              {isSelf && (
                <button
                  type="button"
                  onClick={() => router.push(`/profile/works?nickname=${encodeURIComponent(nickname)}`)}
                  className="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                  style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
                >
                  显示全部
                </button>
              )}
            </div>
            {userWorks.length === 0 ? (
              <p className="mt-4 text-sm" style={{ color: "#8A8A8A" }}>暂无作品记录</p>
            ) : (
            <div className="mt-4 grid grid-cols-4 gap-3">
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
    </div>
  )
}
