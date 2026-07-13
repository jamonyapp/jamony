"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Plus, ChevronDown } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { TopNav } from "@/components/jamony/top-nav"
import { RoomCard } from "@/components/room-card"
import { EmptyState } from "@/components/empty-state"
import { CreateRoomModal } from "@/components/create-room-modal"
import { RoomDetailModal } from "@/components/room-detail-modal"
import { SectionHeader } from "@/components/jamony/section-header"
import { useAuth } from "@/lib/auth-context"

type RoomItem = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  host_avatar_url?: string
  is_private: boolean
  room_code: string
  proficiency?: string
  max_musicians: number
  musician_count: number
  listener_count: number
  total_members: number
  server_port?: number  // 列表接口已不返回 server_port
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

const ROOMS_PER_SECTION = 16  // 每栏展示 4排×4

function mapRoomToCard(room: RoomItem, latency: number) {
  return {
    id: String(room.id),
    name: room.name,
    emoji: STYLE_EMOJI[room.style] || "🎵",
    style: room.style || "通用",
    description: room.description,
    owner: { name: room.host_name, avatarUrl: room.host_avatar_url, color: "purple" as const },
    ownerOnline: true,
    instruments: [] as string[],
    current: room.musician_count,
    capacity: room.max_musicians,
    latency,
    isPrivate: room.is_private,
    proficiency: room.proficiency,
    listener_count: room.listener_count,
  }
}

export function RoomListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const listType = searchParams.get("type") // null=双栏首页 | "public" | "private"
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("全部")
  const [sort, setSort] = useState("members")
  const [sortOpen, setSortOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [latency, setLatency] = useState(28)
  const [loading, setLoading] = useState(true)
  const { loggedIn, setShowLoginModal } = useAuth()

  const fetchRooms = () => {
    const start = Date.now()
    fetch("/api/rooms")
      .then(r => r.json())
      .then(data => { setLatency(Date.now() - start); if (data.ok) setRooms(data.rooms); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchRooms()
    const t = setInterval(fetchRooms, 15000)  // 15秒刷新，卡片人数实时更新
    return () => clearInterval(t)
  }, [])

  const categories = useMemo(() => {
    const cats = new Set(rooms.map(r => r.style))
    return ["全部", ...CATEGORY_ORDER.filter(c => c !== "全部" && cats.has(c)), ...Array.from(cats).filter(c => !CATEGORY_ORDER.includes(c))]
  }, [rooms])

  // 全列表过滤（搜索/分类/排序 + type）
  const filtered = useMemo(() => {
    let list = [...rooms]
    if (listType === "public") list = list.filter(r => !r.is_private)
    else if (listType === "private") list = list.filter(r => r.is_private)
    if (category !== "全部") list = list.filter(r => r.style === category)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.style.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (sort === "members") return b.musician_count - a.musician_count
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return 0
    })
    return list
  }, [rooms, category, query, sort, listType])

  const renderSearchSort = () => (
    <>
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
    </>
  )

  // ───── 全列表模式（?type=public|private）─────
  if (listType === "public" || listType === "private") {
    const title = listType === "public" ? "公开房间" : "加密房间"
    return (
      <div className="min-h-screen bg-black text-white">
        <TopNav onRefresh={fetchRooms} />
        <main className="mx-auto max-w-7xl px-4 py-8 pt-11 sm:px-6">
          <button onClick={() => router.push("/lobby")} className="mb-4 text-sm transition-colors hover:text-white" style={{ color: "#8A8A8A" }}>
            ← 返回大厅
          </button>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <span aria-hidden>{listType === "public" ? "🎸" : "🔒"}</span>{title}
          </h1>
          {renderSearchSort()}
          {loading ? (
            <div className="mt-20 text-center text-sm" style={{ color: "#8A8A8A" }}>加载中...</div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {filtered.length > 0 ? (
                filtered.map((room) => (
                  <RoomCard key={room.id} room={mapRoomToCard(room, latency)} onSelect={() => setDetailRoomId(room.room_code)} />
                ))
              ) : (
                <EmptyState onCreate={() => setModalOpen(true)} />
              )}
            </div>
          )}
        </main>
        <RoomDetailModal roomId={detailRoomId} onClose={() => { setDetailRoomId(null); fetchRooms() }} />
        <CreateRoomModal open={modalOpen} onClose={() => { setModalOpen(false); fetchRooms() }} />
      </div>
    )
  }

  // ───── 双栏 shelf 首页 ─────
  const publicRooms = rooms.filter(r => !r.is_private).slice(0, ROOMS_PER_SECTION)
  const privateRooms = rooms.filter(r => r.is_private).slice(0, ROOMS_PER_SECTION)

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav onRefresh={fetchRooms} />
      <main className="mx-auto max-w-7xl px-4 py-8 pt-11 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <span aria-hidden>🎸</span>房间大厅
            </h1>
            <p className="text-sm" style={{ color: "#8A8A8A" }}>选择一个房间加入，或创建你自己的房间</p>
          </div>
          <button onClick={() => { if (!loggedIn) { setShowLoginModal(true); return }; setModalOpen(true) }}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:self-auto"
            style={{ backgroundImage: "linear-gradient(90deg, #9933ff 0%, #ff33aa 100%)" }}>
            <Plus className="h-4 w-4" />创建房间
          </button>
        </div>

        {loading ? (
          <div className="mt-20 text-center text-sm" style={{ color: "#8A8A8A" }}>加载中...</div>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            <section>
              <SectionHeader title="公开房间" linkLabel="更多公开房间" onLink={() => router.push("/lobby?type=public")} />
              {publicRooms.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {publicRooms.map((room) => (
                    <RoomCard key={room.id} room={mapRoomToCard(room, latency)} onSelect={() => setDetailRoomId(room.room_code)} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-[10px] border border-dashed py-12" style={{ borderColor: "#2A2A2A" }}>
                  <p className="text-sm" style={{ color: "#8A8A8A" }}>暂无公开房间</p>
                </div>
              )}
            </section>

            <section>
              <SectionHeader title="加密房间" linkLabel="更多加密房间" onLink={() => router.push("/lobby?type=private")} />
              {privateRooms.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {privateRooms.map((room) => (
                    <RoomCard key={room.id} room={mapRoomToCard(room, latency)} onSelect={() => setDetailRoomId(room.room_code)} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-[10px] border border-dashed py-12" style={{ borderColor: "#2A2A2A" }}>
                  <p className="text-sm" style={{ color: "#8A8A8A" }}>暂无加密房间</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <RoomDetailModal roomId={detailRoomId ? String(detailRoomId) : null} onClose={() => { setDetailRoomId(null); fetchRooms() }} />
      <CreateRoomModal open={modalOpen} onClose={() => { setModalOpen(false); fetchRooms() }} />
    </div>
  )
}
