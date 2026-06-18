"use client"

import { useMemo, useState } from "react"
import { Plus, X, Heart, MessageCircle, ChevronDown, Search } from "lucide-react"
import {
  type Notice,
  type NoticeType,
  notices as initialNotices,
  NOTICE_TYPES,
  NOTICE_TYPE_LABEL,
  NOTICE_TYPE_COLOR,
} from "@/lib/jamony-data"
import { PublishNoticeModal } from "@/components/jamony/publish-notice-modal"
import { TopNav } from "@/components/jamony/top-nav"

const PAGE_SIZE = 20
const LOAD_MORE_SIZE = 12

type SortOption = "latest" | "hot"

export function BoardPage() {
  const [allNotices, setAllNotices] = useState<Notice[]>(initialNotices)
  const [activeTab, setActiveTab] = useState<NoticeType | "all">("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortOption>("latest")
  const [cityFilter, setCityFilter] = useState<string>("all")
  const [styleFilter, setStyleFilter] = useState<string>("all")
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [publishOpen, setPublishOpen] = useState(false)
  const [detail, setDetail] = useState<Notice | null>(null)

  const cities = useMemo(
    () => Array.from(new Set(allNotices.map((n) => n.city))),
    [allNotices],
  )
  const styles = useMemo(
    () => Array.from(new Set(allNotices.map((n) => n.style))),
    [allNotices],
  )

  const filtered = useMemo(() => {
    let list = allNotices
    if (activeTab !== "all") list = list.filter((n) => n.type === activeTab)
    if (cityFilter !== "all") list = list.filter((n) => n.city === cityFilter)
    if (styleFilter !== "all") list = list.filter((n) => n.style === styleFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (n) => n.title.toLowerCase().includes(q) || n.author.toLowerCase().includes(q),
      )
    }
    if (sort === "hot") {
      console.log("[v0] sort by hot (placeholder)")
    }
    return list
  }, [allNotices, activeTab, cityFilter, styleFilter, sort, search])

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  const handlePublish = (notice: Notice) => {
    setAllNotices((prev) => [notice, ...prev])
    setActiveTab("all")
  }

  const resetPaging = () => setVisibleCount(PAGE_SIZE)

  const handleRefresh = () => {
    setAllNotices(initialNotices)
    setActiveTab("all")
    setSearch("")
    setSort("latest")
    setCityFilter("all")
    setStyleFilter("all")
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav onRefresh={handleRefresh} />
      <div className="mx-auto max-w-7xl px-4 py-8 pt-[2.75rem] md:px-8">
        {/* 标题区 */}
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold md:text-3xl">公告牌</h1>
          <button
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          >
            <Plus className="h-4 w-4" />
            发布公告
          </button>
        </header>

        {/* Tab 分类 */}
        <nav
          className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b"
          style={{ borderColor: "#1A1A1A" }}
        >
          <div className="flex flex-wrap gap-1">
            <TabButton
              label="全部"
              active={activeTab === "all"}
              onClick={() => {
                setActiveTab("all")
                resetPaging()
              }}
            />
            {NOTICE_TYPES.map((t) => (
              <TabButton
                key={t}
                label={NOTICE_TYPE_LABEL[t]}
                active={activeTab === t}
                onClick={() => {
                  setActiveTab(t)
                  resetPaging()
                }}
              />
            ))}
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A8A]" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                resetPaging()
              }}
              placeholder="搜公告标题、作者..."
              className="w-48 rounded-full border py-1.5 pl-9 pr-3 text-sm text-white placeholder:text-[#8A8A8A] outline-none transition-colors focus:border-[#9933FF] md:w-56"
              style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
            />
          </div>
        </nav>

        {/* 筛选栏 */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <FilterSelect
            label="排序"
            value={sort}
            onChange={(v) => {
              setSort(v as SortOption)
              resetPaging()
            }}
            options={[
              { value: "latest", label: "最新发布" },
              { value: "hot", label: "最热" },
            ]}
          />
          <FilterSelect
            label="城市"
            value={cityFilter}
            onChange={(v) => {
              setCityFilter(v)
              resetPaging()
            }}
            options={[{ value: "all", label: "全部" }, ...cities.map((c) => ({ value: c, label: c }))]}
          />
          <FilterSelect
            label="风格"
            value={styleFilter}
            onChange={(v) => {
              setStyleFilter(v)
              resetPaging()
            }}
            options={[{ value: "all", label: "全部" }, ...styles.map((s) => ({ value: s, label: s }))]}
          />
        </div>

        {/* 瀑布流 */}
        {visible.length === 0 ? (
          <p className="py-20 text-center text-[#8A8A8A]">暂无符合条件的公告</p>
        ) : (
          <div className="columns-2 gap-5 md:columns-3 lg:columns-4">
            {visible.map((n) => (
              <NoticeCard key={n.id} notice={n} onClick={() => setDetail(n)} />
            ))}
          </div>
        )}

        {/* 加载更多 */}
        {hasMore && (
          <div className="mt-10 flex justify-center">
            <button
              onClick={() => setVisibleCount((c) => c + LOAD_MORE_SIZE)}
              className="rounded-full border px-6 py-2.5 text-sm text-white transition-colors hover:bg-[#141414]"
              style={{ borderColor: "#2A2A2A" }}
            >
              加载更多
            </button>
          </div>
        )}
      </div>

      <PublishNoticeModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onPublish={handlePublish}
      />

      <NoticeDetailModal notice={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-3 text-sm font-medium transition-colors"
      style={{ color: active ? "#fff" : "#8A8A8A" }}
    >
      {label}
      {active && (
        <span
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full"
          style={{ backgroundColor: "#00AAFF" }}
        />
      )}
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#8A8A8A]">
      {label}：
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded-lg border py-1.5 pl-3 pr-8 text-sm text-white outline-none transition-colors focus:border-[#9933FF]"
          style={{ backgroundColor: "#141414", borderColor: "#2A2A2A" }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#141414] text-white">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A8A8A]" />
      </div>
    </label>
  )
}

function NoticeCard({ notice, onClick }: { notice: Notice; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="jamony-card group mb-5 block w-full overflow-hidden rounded-[10px] text-left transition-transform duration-200 hover:-translate-y-[3px]"
      style={{ backgroundColor: "#141414" }}
    >
      {/* 画面区域 */}
      <div
        className="relative w-full bg-cover bg-center"
        style={{
          backgroundImage: `url('/images/jamony-board-bg-${String(notice.bgIndex).padStart(2, "0")}.webp')`,
          aspectRatio: notice.bgIndex % 3 === 0 ? "3 / 4" : notice.bgIndex % 2 === 0 ? "1 / 1" : "4 / 5",
        }}
      >
        <span className="absolute inset-0 bg-black/25" />
        <span
          className="absolute bottom-0 left-0 right-0 h-2/3"
          style={{
            background: "linear-gradient(to top, rgba(10,10,10,0.95), rgba(10,10,10,0))",
          }}
        />
      </div>

      {/* 标题区 */}
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-bold leading-snug text-white">{notice.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "#8A8A8A" }}>
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: NOTICE_TYPE_COLOR[notice.type] }}
          />
          {NOTICE_TYPE_LABEL[notice.type]} · from：{notice.author}
        </p>
      </div>
    </button>
  )
}

function NoticeDetailModal({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  if (!notice) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="jamony-modal-enter w-full max-w-lg overflow-hidden rounded-2xl border"
        style={{ backgroundColor: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative h-44 w-full bg-cover bg-center"
          style={{
            backgroundImage: `url('/images/jamony-board-bg-${String(notice.bgIndex).padStart(2, "0")}.webp')`,
          }}
        >
          <span className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] to-transparent" />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: NOTICE_TYPE_COLOR[notice.type] }}
            />
            <span className="text-sm font-semibold" style={{ color: NOTICE_TYPE_COLOR[notice.type] }}>
              {NOTICE_TYPE_LABEL[notice.type]} · {notice.city}
            </span>
          </div>

          <h2 className="mb-3 text-lg font-bold text-white">{notice.title}</h2>
          <p className="text-sm leading-relaxed text-[#C9C9C9]">{notice.body}</p>

          <div className="my-5 h-px w-full" style={{ backgroundColor: "#1A1A1A" }} />

          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Meta label="发布人" value={notice.author} />
            <Meta label="发布时间" value={notice.time} />
            <Meta label="风格" value={notice.style} />
            <Meta label="城市" value={notice.city} />
          </dl>

          <div className="mt-6 flex gap-3">
            <button
              className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
            >
              <MessageCircle className="h-4 w-4" />
              联系
            </button>
            <button
              className="flex items-center justify-center gap-2 rounded-lg border px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#141414]"
              style={{ borderColor: "#2A2A2A" }}
            >
              <Heart className="h-4 w-4" />
              收藏
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-[#8A8A8A]">{label}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
