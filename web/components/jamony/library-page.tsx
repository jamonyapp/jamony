"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Guitar, Disc3, ChevronRight, Target } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { TrackCard } from "@/components/jamony/track-card"
import { ActiveMusicians } from "@/components/jamony/active-musicians"
import { PlayerBar } from "@/components/jamony/player-bar"
import { PlayerProvider, usePlayer } from "@/components/jamony/player-context"
import { rehearsalTracks, jamTracks, type Track } from "@/lib/jamony-data"

function matchTrack(t: Track, q: string): boolean {
  if (!q) return true
  const haystack = [
    t.title,
    t.author,
    t.type === "rehearsal" ? "排练" : "Jam",
    t.nature === "original" ? "Original" : "Cover",
    t.scale,
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
  const { setQueue } = usePlayer()

  // 整个作品库作为默认播放队列
  useEffect(() => {
    setQueue([...rehearsalTracks, ...jamTracks])
  }, [setQueue])

  const filteredRehearsal = useMemo(
    () => rehearsalTracks.filter((t) => matchTrack(t, query)),
    [query],
  )
  const filteredJam = useMemo(
    () => jamTracks.filter((t) => matchTrack(t, query)),
    [query],
  )

  const noResults =
    query && filteredRehearsal.length === 0 && filteredJam.length === 0

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav />
      <div className="mx-auto max-w-7xl px-4 pb-28 pt-[3.25rem] md:px-6">
        {/* 标题 + 搜索 */}
        <div className="mb-8 flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">作品库</h1>
            <p className="mt-1 text-sm text-[#9A9A9A]">听不过瘾？来玩真的！</p>
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

        {noResults ? (
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
              icon={<Guitar className="h-5 w-5" style={{ color: "#FF33AA" }} />}
              title="Jam 时刻"
              tracks={filteredJam}
              href="/library/category?tab=jam"
            />
            {!query && <ActiveMusicians />}
          </>
        )}
      </div>

      <PlayerBar />
    </div>
  )
}

export function LibraryPage() {
  return (
    <PlayerProvider>
      <LibraryInner />
    </PlayerProvider>
  )
}
