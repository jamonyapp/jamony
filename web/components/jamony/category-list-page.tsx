"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Search } from "lucide-react"
import { TrackCard } from "@/components/jamony/track-card"
import { usePlayer } from "@/components/jamony/player-context"
import { useAuth } from "@/lib/auth-context"
import { TracksSkeleton } from "@/components/jamony/tracks-skeleton"
import { TopNav } from "@/components/jamony/top-nav"
import { type Track } from "@/lib/jamony-data"

const GRADIENTS = [
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #9933FF, #FF33AA)",
  "linear-gradient(135deg, #FF33AA, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #FF33AA)",
  "linear-gradient(135deg, #9933FF, #BBEE00)",
]

const PAGE_SIZE = 12
const ALL = "全部"

type Tab = "全部作品" | "排练作品" | "Jam 时刻"
const TABS: Tab[] = ["全部作品", "排练作品", "Jam 时刻"]
const NATURE_OPTIONS = ["Original", "Cover"]

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  const isActive = value !== ALL
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-lg border bg-[#0D0D0D] py-2 pl-3 pr-8 text-sm text-white transition-colors focus:outline-none ${
          isActive ? "border-[#00AAFF]" : "border-[#1A1A1A]"
        }`}
      >
        <option value={ALL} className="bg-[#0D0D0D] text-white">
          {label}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#0D0D0D] text-white">
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A9A]" />
    </div>
  )
}

function matchTrack(t: Track, q: string): boolean {
  if (!q) return true
  const query = q.toLowerCase()
  const haystack = [t.title, t.author, ...t.styles, ...t.instruments, ...t.members]
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

function resolveTabFromUrl(): Tab {
  if (typeof window === "undefined") return "全部作品"
  const params = new URLSearchParams(window.location.search)
  const t = params.get("tab")
  if (t === "rehearsal") return "排练作品"
  if (t === "jam") return "Jam 时刻"
  return "全部作品"
}

function CategoryListInner() {
  const router = useRouter()
  const { setQueue } = usePlayer()
  const { user } = useAuth()
  const [allTracks, setAllTracks] = useState<Track[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>(resolveTabFromUrl)
  const [query, setQuery] = useState("")
  const [style, setStyle] = useState(ALL)
  const [nature, setNature] = useState(ALL)
  const [instrument, setInstrument] = useState(ALL)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // 切 Tab 同步到 URL（刷新/后退可还原状态）
  function changeTab(next: Tab) {
    setTab(next)
    const param = next === "排练作品" ? "rehearsal" : next === "Jam 时刻" ? "jam" : ""
    const qs = param ? `?tab=${param}` : ""
    router.replace(`/library/category${qs}`, { scroll: false })
  }

  // 从 API 读取作品
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
          type: w.type,
          nature: w.nature,
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
        setLoaded(true)
      })
  }, [setQueue, user?.id])

  const STYLE_OPTIONS = [...new Set(allTracks.flatMap((t) => t.styles))].sort()
  const INSTRUMENT_OPTIONS = [...new Set(allTracks.flatMap((t) => t.instruments))].sort()

  const filtered = useMemo(() => {
    return allTracks.filter((t) => {
      if (tab === "排练作品" && t.type !== "rehearsal") return false
      if (tab === "Jam 时刻" && t.type !== "jam") return false
      if (style !== ALL && !t.styles.includes(style)) return false
      if (nature !== ALL && t.nature !== (nature === "Original" ? "original" : "cover"))
        return false
      if (instrument !== ALL && !t.instruments.includes(instrument)) return false
      if (query && !matchTrack(t, query)) return false
      return true
    })
  }, [allTracks, tab, query, style, nature, instrument])

  // 筛选条件变化时重置页码
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [tab, query, style, nature, instrument])

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  // 无限滚动
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => v + PAGE_SIZE)
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, shown.length])

  return (
    <div className="min-h-screen bg-black pb-28">
      <TopNav backLinks={[{ label: "返回作品库", href: "/library" }]} />
      <div className="mx-auto max-w-7xl px-4 pt-[3.25rem] md:px-6">

        {/* 第一行：Tabs + 搜索框 */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xs font-medium text-[#666]">筛选</span>
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => changeTab(t)}
                className={`relative pb-1.5 text-sm font-medium transition-colors ${
                  tab === t ? "text-white" : "text-[#9A9A9A] hover:text-white"
                }`}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#00AAFF]" />
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#666]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜作品名、作者、标签..."
              className="w-full rounded-full border border-[#1A1A1A] bg-[#0D0D0D] py-2 pl-9 pr-4 text-sm text-white placeholder:text-[#666] focus:border-[#00AAFF] focus:outline-none"
            />
          </div>
        </div>

        {/* 第二行：筛选器 */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <FilterSelect label="风格" value={style} options={STYLE_OPTIONS} onChange={setStyle} />
          <FilterSelect label="性质" value={nature} options={NATURE_OPTIONS} onChange={setNature} />
          <FilterSelect label="乐器" value={instrument} options={INSTRUMENT_OPTIONS} onChange={setInstrument} />
        </div>

        {/* 作品网格 — 直接用现有的 TrackCard（已含 icon） */}
        {!loaded ? (
          <TracksSkeleton count={12} />
        ) : shown.length > 0 ? (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
            {shown.map((t) => (
              <TrackCard key={t.id} track={t} />
            ))}
          </div>
        ) : allTracks.length === 0 ? (
          <div className="py-[60px] text-center text-sm text-[#9A9A9A]">
            作品库还没有作品，去房间里录第一首吧！
          </div>
        ) : (
          <div className="py-[60px] text-center text-sm text-[#9A9A9A]">
            没有找到符合条件的作品
          </div>
        )}

        {/* 无限滚动哨兵 / 结束提示 */}
        {shown.length > 0 && (
          <div ref={sentinelRef} className="py-8 text-center text-xs text-[#9A9A9A]">
            {hasMore ? "加载中..." : "已展示全部作品"}
          </div>
        )}
      </div>

    </div>
  )
}

export function CategoryListPage() {
  return <CategoryListInner />
}
