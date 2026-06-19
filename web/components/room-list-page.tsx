"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Plus, ChevronDown, Crown } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { RoomCard } from "@/components/room-card"
import { EmptyState } from "@/components/empty-state"
import { CreateRoomModal } from "@/components/create-room-modal"
import { RoomDetailModal } from "@/components/room-detail-modal"
import { useAuth } from "@/lib/auth-context"

type RoomItem = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  is_private: boolean
  max_musicians: number
  musician_count: number
  listener_count: number
  total_members: number
  server_port: number
  status: string
  created_at: string
}

const STYLE_EMOJI: Record<string, string> = {
  "摇滚": "🎸", "金属": "🎸", "流行": "🎤",
  "爵士": "🎷", "布鲁斯": "🎷",
  "民谣": "🪕", "古典": "🎻",
  "电子": "🎛️", "放克": "🎸",
  "嘻哈": "🎤", "R&B": "🎤",
  "国风": "🏮", "ACG": "🎹",
  "雷鬼": "🥁", "实验": "🔬",
}

const CATEGORY_ORDER = ["全部", "摇滚", "爵士", "民谣", "流行", "电子", "嘻哈", "国风", "古典", "实验"]

export function RoomListPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("全部")
  const [sort, setSort] = useState("members")
  const [sortOpen, setSortOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailRoomId, setDetailRoomId] = useState<number | null>(null)
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [loading, setLoading] = useState(true)
  const { loggedIn, setShowLoginModal } = useAuth()

  const fetchRooms = () => {
    setLoading(true)
    fetch("/api/rooms")
      .then(r => r.json())
      .then(data => { if (data.ok) setRooms(data.rooms); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchRooms() }, [])

  const filtered = useMemo(() => {
    let list = [...rooms]
    if (category !== "全部") list = list.filter((r) => r.style === category)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.style.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (sort === "members") return b.musician_count - a.musician_count
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return 0
    })
    return list
  }, [rooms, category, query, sort])

  const categories = useMemo(() => {
    const cats = new Set(rooms.map(r => r.style))
    return ["全部", ...CATEGORY_ORDER.filter(c => c !== "全部" && cats.has(c)), ...Array.from(cats).filter(c => !CATEGORY_ORDER.includes(c))]
  }, [rooms])

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav onRefresh={fetchRooms} />
      <main className="mx-auto max-w-7xl px-4 py-8 pt-11 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <span aria-hidden>🎸</span>房间列表
            </h1>
            <p className="text-sm" style={{ color: "#8A8A8A" }}>选择一个房间加入，或创建你自己的房间</p>
          </div>
          <button onClick={() => { if (!loggedIn) { setShowLoginModal(true); return }; setModalOpen(true) }}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:self-auto"
            style={{ backgroundImage: "linear-gradient(90deg, #9933ff 0%, #ff33aa 100%)" }}>
            <Plus className="h-4 w-4" />创建房间
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#666" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索房间名、风格..."
              className="w-full rounded-[10px] border px-4 py-2.5 pl-10 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#0D0D0D", borderColor: "#2A2A2A" }} />
          </div>
          <div className="relative">
            <button onClick={() => setSortOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-[10px] border px-4 py-2.5 text-sm text-white transition-colors hover:border-[#9933FF] sm:w-44"
              style={{ background: "#0D0D0D", borderColor: "#2A2A2A" }}>
              <span style={{ color: "#8A8A8A" }}>排序：</span>
              <span className="flex-1 text-left">{sort === "members" ? "人数最多" : "最新创建"}</span>
              <ChevronDown className="h-4 w-4" style={{ color: "#8A8A8A" }} />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-44 overflow-hidden rounded-xl border p-1 shadow-2xl"
                  style={{ background: "#0D0D0D", borderColor: "#2A2A2A" }}>
                  {([["members","人数最多"],["newest","最新创建"]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => { setSort(key); setSortOpen(false) }}
                      className="flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5"
                      style={{ color: sort === key ? "#FFFFFF" : "#8A8A8A" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: "#2A2A2A" }}>
          {categories.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)}
              className="relative px-3 py-1.5 text-sm transition-colors"
              style={{ color: category === cat ? "#FFFFFF" : "#8A8A8A" }}>
              {cat}
              {category === cat && <span className="absolute inset-x-2 -bottom-3 h-0.5 rounded-full" style={{ background: "#00AAFF" }} />}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-20 text-center text-sm" style={{ color: "#8A8A8A" }}>加载中...</div>
        ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {filtered.length > 0 ? (
            filtered.map((room) => {
              const mappedForCard = {
                id: String(room.id),
                name: room.name,
                emoji: STYLE_EMOJI[room.style] || "🎵",
                style: room.style || "通用",
                description: room.description,
                owner: { name: room.host_name, color: "purple" as const },
                ownerOnline: true,
                instruments: [] as string[],
                current: room.musician_count,
                capacity: room.max_musicians,
                latency: 28,
                isPrivate: room.is_private,
              }
              return <RoomCard key={room.id} room={mappedForCard} onSelect={() => setDetailRoomId(room.id)} />
            })
          ) : (
            <EmptyState onCreate={() => setModalOpen(true)} />
          )}
        </div>
        )}
      </main>
      <RoomDetailModal roomId={detailRoomId ? String(detailRoomId) : null} onClose={() => { setDetailRoomId(null); fetchRooms() }} />
      <CreateRoomModal open={modalOpen} onClose={() => { setModalOpen(false); fetchRooms() }} />
    </div>
  )
}
