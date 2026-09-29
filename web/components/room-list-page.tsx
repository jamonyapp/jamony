"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, Plus, KeyRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { RoomCard } from "@/components/room-card"
import { EmptyState } from "@/components/empty-state"
import { CreateRoomModal } from "@/components/create-room-modal"
import { RoomDetailModal } from "@/components/room-detail-modal"
import { FilterSelect } from "@/components/jamony/filter-select"
import { useAuth } from "@/lib/auth-context"
import { PROFICIENCY_MAP, PROFICIENCY_ORDER } from "@/lib/proficiency"

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

const PAGE_SIZE = 12  // 无限滚动每批（4列×3排），对齐作品库
const ALL = "全部"

// ───── Tab：公开 / 加密（09-30 欢哥定稿：不加"全部"，加密房只是浏览，进入靠门牌码）─────
type RoomTab = "public" | "private"
const TABS: { key: RoomTab; label: string }[] = [
  { key: "public", label: "公开房间" },
  { key: "private", label: "加密房间" },
]

// 合奏人数：按当前实时合奏人数分区间档位（0人空房不落档——找人不进空房）
const PLAYER_OPTIONS = [
  { value: "1-2", label: "1-2人" },
  { value: "3-4", label: "3-4人" },
  { value: "5+", label: "＞4人" },
]

// Lv 等级：房主建房的演奏水平要求（p=新手局 … fff=大神局）
const PROF_OPTIONS = PROFICIENCY_ORDER.map((p) => ({
  value: p,
  label: `Lv=${p} · ${PROFICIENCY_MAP[p].label}`,
}))

const SORT_OPTIONS = [
  { value: "members", label: "人数最多" },
  { value: "newest", label: "最新创建" },
]

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

// Tab 初始值从 URL 还原（tab= 新参数；type= 为旧双栏时代链接，兼容直读）
function resolveTabFromUrl(): RoomTab {
  if (typeof window === "undefined") return "public"
  const params = new URLSearchParams(window.location.search)
  const t = params.get("tab") ?? params.get("type")
  return t === "private" ? "private" : "public"
}

export function RoomListPage() {
  const router = useRouter()
  const [tab, setTab] = useState<RoomTab>(resolveTabFromUrl)
  const [query, setQuery] = useState("")
  const [style, setStyle] = useState(ALL)
  const [players, setPlayers] = useState(ALL)
  const [prof, setProf] = useState(ALL)
  const [sort, setSort] = useState("members")
  const [visible, setVisible] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailRoomId, setDetailRoomId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState("")
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [latency, setLatency] = useState(28)
  const [loading, setLoading] = useState(true)
  const { loggedIn, setShowLoginModal } = useAuth()

  const fetchRooms = () => {
    // 延迟测纯网络（/api/ping 不查 DB），与拉房间解耦，避免 DB 耗时虚高延迟
    const pingStart = Date.now()
    fetch("/api/ping").then(() => setLatency(Date.now() - pingStart)).catch(() => {})
    fetch("/api/rooms")
      .then(r => r.json())
      .then(data => { if (data.ok) setRooms(data.rooms); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchRooms()
    const t = setInterval(fetchRooms, 15000)  // 15秒刷新，卡片人数实时更新（不影响滚动位置）
    return () => clearInterval(t)
  }, [])

  // 切 Tab 同步到 URL（replace 不入历史，与作品库一致；刷新/收藏可还原）
  function changeTab(next: RoomTab) {
    setTab(next)
    router.replace(next === "private" ? "/lobby?tab=private" : "/lobby", { scroll: false })
  }

  // 风格选项动态生成：取当前 Tab 下实际存在的风格（跟随 15s 轮询更新，新风格自动出现）
  const categories = useMemo(() => {
    const cats = new Set(rooms.filter(r => r.is_private === (tab === "private")).map(r => r.style))
    const known = CATEGORY_ORDER.filter(c => c !== "全部" && cats.has(c))
    const extra = Array.from(cats).filter(c => !CATEGORY_ORDER.includes(c))
    return [...known, ...extra].map(c => ({ value: c, label: c }))
  }, [rooms, tab])

  // Tab + 搜索 + 风格/人数/Lv 筛选 + 排序（纯前端，房间数据本就全量拉取）
  const filtered = useMemo(() => {
    let list = rooms.filter(r => r.is_private === (tab === "private"))
    if (style !== ALL) list = list.filter(r => r.style === style)
    if (players !== ALL) {
      list = list.filter(r => {
        const n = r.musician_count
        if (players === "1-2") return n >= 1 && n <= 2
        if (players === "3-4") return n >= 3 && n <= 4
        return n >= 5  // ＞4人
      })
    }
    if (prof !== ALL) list = list.filter(r => r.proficiency === prof)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.style.toLowerCase().includes(q) || (r.room_code || "").toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      if (sort === "members") return b.musician_count - a.musician_count
      if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return 0
    })
    return list
  }, [rooms, tab, style, players, prof, query, sort])

  // 筛选条件变化时重置分页（rooms 轮询更新不在此列，不打断浏览位置）
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [tab, query, style, players, prof, sort])

  // 选中风格在当前 Tab 下已无房间时（如切 Tab/房间解散），自动退回全部，避免"按钮看着没选却过滤成空"
  useEffect(() => {
    if (style !== ALL && !categories.some(c => c.value === style)) setStyle(ALL)
  }, [categories, style])

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length
  const tabTotal = rooms.filter(r => r.is_private === (tab === "private")).length

  // 无限滚动（作品库同款）
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

  // 门牌码加入：输入 8 位 code → 打开详情弹窗（RoomDetailModal 自行处理存在/不存在/加密房密码）
  const handleJoinByCode = () => {
    const code = codeInput.trim().toUpperCase()
    if (!code) return
    setCodeInput("")
    setDetailRoomId(code)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* 头部：左=标题+Tab行(副标题位) 右=门牌码+创建按钮簇底对齐（09-28 紧凑布局语言） */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">房间大厅</h1>
            <nav className="-mb-1.5 flex flex-wrap gap-6">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => changeTab(t.key)}
                  className={`relative pb-1.5 text-sm font-medium transition-colors ${
                    tab === t.key ? "text-white" : "text-[#9A9A9A] hover:text-white"
                  }`}
                >
                  {t.label}
                  {tab === t.key && (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#00AAFF]" />
                  )}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#9933FF" }} />
              <input value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleJoinByCode() }}
                placeholder="输入8位门牌码加入房间"
                className="w-full rounded-[10px] border px-4 py-1.5 pl-10 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
                style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} />
            </div>
            <button onClick={() => { if (!loggedIn) { setShowLoginModal(true); return }; setModalOpen(true) }}
              className="flex items-center gap-1.5 self-start rounded-[10px] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97] sm:self-auto"
              style={{ backgroundImage: "linear-gradient(90deg, #9933ff 0%, #ff33aa 100%)" }}>
              <Plus className="h-4 w-4" />创建房间
            </button>
          </div>
        </div>

        {/* 筛选行：搜索 + 风格/合奏人数/Lv等级/排序（规格同作品库） */}
        <div className="mb-6 mt-8 flex flex-wrap items-center gap-4">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "#666" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索房间名、风格..."
              className="w-full rounded-[10px] border px-4 py-1.5 pl-10 text-sm text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
              style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }} />
          </div>
          <FilterSelect label="风格" value={style} options={categories} onChange={setStyle} />
          <FilterSelect label="合奏人数" value={players} options={PLAYER_OPTIONS} onChange={setPlayers} />
          <FilterSelect label="水平等级" value={prof} options={PROF_OPTIONS} onChange={setProf} />
          <FilterSelect label="排序" value={sort} options={SORT_OPTIONS} onChange={setSort} allValue={null} />
        </div>

        {/* 房间网格 */}
        {loading ? (
          <div className="mt-20 text-center text-sm" style={{ color: "#8A8A8A" }}>加载中...</div>
        ) : shown.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {shown.map((room) => (
              <RoomCard key={room.id} room={mapRoomToCard(room, latency)} onSelect={() => setDetailRoomId(room.room_code)} />
            ))}
          </div>
        ) : tabTotal === 0 ? (
          <EmptyState
            message={tab === "public" ? "还没有公开房间，来创建一个吧！" : "还没有加密房间，来创建一个吧！"}
            onCreate={() => setModalOpen(true)} />
        ) : (
          <div className="py-[60px] text-center text-sm text-[#9A9A9A]">没有找到符合条件的房间</div>
        )}

        {/* 无限滚动哨兵 / 结束提示 */}
        {shown.length > 0 && (
          <div ref={sentinelRef} className="py-8 text-center text-xs text-[#9A9A9A]">
            {hasMore ? "加载中..." : "已展示全部房间"}
          </div>
        )}
      </main>
      <RoomDetailModal roomId={detailRoomId} onClose={() => { setDetailRoomId(null); fetchRooms() }} />
      <CreateRoomModal open={modalOpen} onClose={() => { setModalOpen(false); fetchRooms() }} />
    </div>
  )
}
