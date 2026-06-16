"use client"

import { useMemo, useState } from "react"
import { Search, Plus, ChevronDown } from "lucide-react"
import { rooms as allRooms, type Room } from "@/lib/rooms-data"
import { TopNav } from "@/components/jamony/top-nav"
import { CategoryNav } from "@/components/category-nav"
import { RoomCard } from "@/components/room-card"
import { EmptyState } from "@/components/empty-state"
import { CreateRoomModal } from "@/components/create-room-modal"
import { RoomDetailModal } from "@/components/room-detail-modal"

type SortKey = "members" | "newest" | "latency"

const sortLabels: Record<SortKey, string> = {
  members: "人数最多",
  newest: "最新创建",
  latency: "延迟最低",
}

export function RoomListPage() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [sub, setSub] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>("members")
  const [sortOpen, setSortOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const filtered = useMemo(() => {
    void refreshKey // 刷新时重新计算
    let list = [...allRooms]
    if (category !== "all") list = list.filter((r) => r.category === category)
    if (sub) list = list.filter((r) => r.subStyle === sub)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.style.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (a.isPrivate !== b.isPrivate) return a.isPrivate ? 1 : -1
      const fullA = a.current >= a.capacity, fullB = b.current >= b.capacity
      if (fullA !== fullB) return fullA ? 1 : -1
      if (sort === "members") return b.current - a.current
      if (sort === "latency") return a.latency - b.latency
      return Number(b.id) - Number(a.id)
    })
    return list
  }, [category, sub, query, sort])

  return (
    <div className="min-h-screen bg-background">
      <TopNav onRefresh={handleRefresh} />
      <main className="mx-auto max-w-7xl px-4 py-8 pt-11 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <span aria-hidden>🎸</span>房间列表
            </h1>
            <p className="text-pretty text-muted-foreground">选择一个房间加入，或创建你自己的房间</p>
          </div>
          <button onClick={() => setModalOpen(true)}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:self-auto"
            style={{ backgroundImage: "linear-gradient(90deg, #9933ff 0%, #ff33aa 100%)" }}>
            <Plus className="h-4 w-4" />创建房间
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索房间名、风格、乐器..."
              className="w-full rounded-[10px] border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-purple" />
          </div>
          <div className="relative">
            <button onClick={() => setSortOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:border-brand-purple sm:w-44">
              <span className="text-muted-foreground">排序：</span>
              <span className="flex-1 text-left">{sortLabels[sort]}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-44 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl">
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <button key={key} onClick={() => { setSort(key); setSortOpen(false) }}
                      className={`flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary ${sort === key ? "text-foreground" : "text-muted-foreground"}`}>
                      {sortLabels[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-6">
          <CategoryNav activeCategory={category} activeSub={sub}
            onCategoryChange={setCategory} onSubChange={setSub} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.length > 0 ? (
            filtered.map((room) => <RoomCard key={room.id} room={room} onSelect={() => setDetailRoomId(room.id)} />)
          ) : (
            <EmptyState onCreate={() => setModalOpen(true)} />
          )}
        </div>
      </main>
      <RoomDetailModal roomId={detailRoomId} onClose={() => setDetailRoomId(null)} />
      <CreateRoomModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
