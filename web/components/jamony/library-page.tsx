"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Disc3, ChevronRight, Target } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { TrackCard } from "@/components/jamony/track-card"
import { usePlayer } from "@/components/jamony/player-context"
import { useAuth } from "@/lib/auth-context"
import { TracksSkeleton } from "@/components/jamony/tracks-skeleton"
import { type Track } from "@/lib/jamony-data"

const GRADIENTS = [
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #9933FF, #FF33AA)",
  "linear-gradient(135deg, #FF33AA, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #FF33AA)",
  "linear-gradient(135deg, #9933FF, #BBEE00)",
]

function matchTrack(t: Track, q: string): boolean {
  if (!q) return true
  const haystack = [
    t.title,
    t.author,
    t.type === "rehearsal" ? "排练" : "Jam",
    t.nature === "original" ? "Original" : "Cover",
    ...t.styles,
    ...t.instruments,
    ...t.members,
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(q.toLowerCase())
}

function Section({
  icon,
  title,
  tracks,
  href,
}: {
  icon: React.ReactNode
  title: string
  tracks: Track[]
  href?: string
}) {
  const router = useRouter()
  if (tracks.length === 0) return null

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          {icon}
          {title}
        </h2>
        <button
          type="button"
          onClick={() => (href ? router.push(href) : console.log("[v0] 查看更多:", title))}
          className="flex items-center gap-0.5 text-sm text-[#9A9A9A] transition-colors hover:text-white"
        >
          更多
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
        {tracks.map((t) => (
          <TrackCard key={t.id} track={t} />
        ))}
      </div>
    </section>
  )
}

function LibraryInner() {
  const [query, setQuery] = useState("")
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const { setQueue } = usePlayer()
  const { user } = useAuth()

  // 从 /api/works 读取作品
  useEffect(() => {
    const uidQ = user?.id ? `?userId=${user.id}` : ""
    fetch(`/api/works${uidQ}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return
        const mapped: Track[] = data.works.map((w: any, i: number) => ({
          id: String(w.id),
          title: w.title,
          author: w.author,
          type: w.type as Track["type"],
          nature: w.nature as Track["nature"],
          styles: w.styles || [],
          instruments: w.instruments || [],
          plays: w.plays,
          likes: w.likes,
          comments: w.comments,
          duration: w.duration,
          gradient: w.coverGradient || GRADIENTS[i % GRADIENTS.length],
          date: w.date || "",
          members: w.members || [],
          coverImage: w.coverImage || "",
          mp3Url: w.mp3Url || "",
          isLiked: w.isLiked || false,
        }))
        setAllTracks(mapped)
        setQueue(mapped)
      })
      .finally(() => setLoading(false))
  }, [setQueue, user?.id])

  const rehearsalTracks = allTracks.filter(t => t.type === "rehearsal")
  const jamTracks = allTracks.filter(t => t.type === "jam")

  const filteredRehearsal = useMemo(
    () => rehearsalTracks.filter((t) => matchTrack(t, query)),
    [query, rehearsalTracks],
  )
  const filteredJam = useMemo(
    () => jamTracks.filter((t) => matchTrack(t, query)),
    [query, jamTracks],
  )

  const noResults =
    query && filteredRehearsal.length === 0 && filteredJam.length === 0

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav onRefresh={() => window.location.reload()} />
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-[3.25rem] md:px-6">
        {/* 标题 + 搜索 */}
        <div className="mb-8 flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">作品库</h1>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜作品名、作者、标签..."
              className="w-full rounded-full border border-[#1A1A1A] bg-[#0D0D0D] py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#00AAFF]"
            />
          </div>
        </div>

        {loading ? (
          <>
            <div className="mb-4 h-6 w-28 animate-pulse rounded bg-[#141414]" />
            <TracksSkeleton count={8} />
          </>
        ) : allTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1A1A1A] bg-[#0D0D0D] py-20 text-center">
            <Disc3 className="mb-4 h-12 w-12 text-[#333]" />
            <p className="text-base font-medium text-white">作品库还没有作品</p>
            <p className="mt-1 text-sm text-[#9A9A9A]">
              去房间里录一首，成为第一个发表作品的人吧！
            </p>
          </div>
        ) : noResults ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[#1A1A1A] bg-[#0D0D0D] py-20 text-center">
            <Disc3 className="mb-4 h-12 w-12 text-[#333]" />
            <p className="text-base font-medium text-white">没有找到相关作品</p>
            <p className="mt-1 text-sm text-[#9A9A9A]">
              换个关键词试试，或者去房间里录一首属于你的作品吧！
            </p>
          </div>
        ) : (
          <>
            <Section
              icon={<Target className="h-5 w-5" style={{ color: "#00AAFF" }} />}
              title="排练作品"
              tracks={filteredRehearsal}
              href="/library/category?tab=rehearsal"
            />
            <Section
              icon={null}
              title="Jam 时刻"
              tracks={filteredJam}
              href="/library/category?tab=jam"
            />
          </>
        )}
      </div>

    </div>
  )
}

export function LibraryPage() {
  return <LibraryInner />
}
