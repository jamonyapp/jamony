"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Play, Heart, MessageCircle, ChevronLeft, Settings } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { useAuth } from "@/lib/auth-context"

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
  jam_count: number
  total_likes: number
  followers_count: number
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
        if (data.ok) setProfile(data.user)
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [nickname, loggedIn, ready, setShowLoginModal])

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
        <main className="mx-auto max-w-3xl px-4 pt-11">
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
        <main className="mx-auto max-w-3xl px-4 pt-11">
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

  const isSelf = loggedIn && currentUser?.nickname === nickname
  const styles: string[] = profile.styles || []
  const instrument = profile.primary_instrument + (profile.secondary_instrument ? ` · ${profile.secondary_instrument}` : "")

  // mock works for now — will connect to API later
  const works = [
    { title: "Funk Jam #47", time: "2026-06-14", type: "Jam时刻" as const, typeColor: "#FF33AA" as const, plays: "3.2k", likes: "412", comments: "38" },
    { title: "雨中布鲁斯", time: "2026-06-12", type: "Jam时刻" as const, typeColor: "#FF33AA" as const, plays: "2.3k", likes: "96", comments: "23" },
    { title: "秋日的风", time: "2026-05-28", type: "排练作品" as const, typeColor: "#00AAFF" as const, plays: "856", likes: "72", comments: "12" },
    { title: "夏夜民谣", time: "2026-06-10", type: "排练作品" as const, typeColor: "#00AAFF" as const, plays: "856", likes: "72", comments: "12" },
  ]

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />

      <main className="mx-auto max-w-3xl px-4 pt-11">
        <div className="py-8">
          {/* 个人资料区 */}
          <section className="flex items-start gap-5">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-4xl font-bold text-black"
              style={{ background: profile.avatar_index ? `linear-gradient(135deg, #00AAFF, #9933FF)` : GRADIENT }}
            >
              {profile.nickname.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{profile.nickname}</h1>
                {isSelf && (
                  <button
                    type="button"
                    onClick={() => window.location.href = "/settings"}
                    className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                    title="个人设置"
                  >
                    <Settings className="h-4 w-4" style={{ color: "#8A8A8A" }} />
                  </button>
                )}
              </div>
              {profile.signature && <p className="mt-1 text-[14px] text-[#B0B0B0]">{profile.signature}</p>}
              <p className="mt-2 text-[13px] text-[#8A8A8A]">
                {profile.city}{instrument ? ` · ${instrument}` : ""}
              </p>
              <span className="mt-3 inline-block rounded-[10px] bg-[#0D0D0D] px-2.5 py-1 text-[12px] text-[#B0B0B0] ring-1 ring-[#1A1A1A]">
                Lv.{profile.level} · {profile.points.toLocaleString()} 积分
              </span>
            </div>
          </section>

          {/* 统计数据区 */}
          <section className="mt-8 grid grid-cols-4 gap-3">
            {[
              { value: profile.works_count.toLocaleString(), label: "作品" },
              { value: profile.jam_count.toLocaleString(), label: "合奏" },
              { value: profile.total_likes.toLocaleString(), label: "获赞" },
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

          {/* 个人简介区 */}
          {profile.bio && (
            <section className="mt-10">
              <SectionLabel>个人简介</SectionLabel>
              <p className="mt-3 text-[14px] leading-relaxed text-[#C9C9C9]">{profile.bio}</p>
            </section>
          )}

          {/* 擅长风格区 */}
          {styles.length > 0 && (
            <section className="mt-10">
              <SectionLabel>擅长风格</SectionLabel>
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
              <h2 className="text-[16px] font-bold text-white">作品记录</h2>
              {isSelf && (
                <button
                  type="button"
                  onClick={() => console.log("[v0] 作品管理页面建设中")}
                  className="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
                  style={{ borderColor: "#2A2A2A", color: "#8A8A8A" }}
                >
                  管理作品
                </button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {works.map((w) => (
                <article
                  key={w.title}
                  className="relative overflow-hidden rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] p-4"
                >
                  <span
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ background: GRADIENT }}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-bold text-white">{w.title}</h3>
                    <span
                      className="shrink-0 text-[11px] font-medium"
                      style={{ color: w.typeColor }}
                    >
                      {w.type}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#8A8A8A]">{w.time}</p>

                  <div className="mt-4 flex items-center gap-4 text-[12px] text-[#8A8A8A]">
                    <span className="flex items-center gap-1">
                      <Play className="h-3.5 w-3.5" />
                      {w.plays}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" />
                      {w.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {w.comments}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
