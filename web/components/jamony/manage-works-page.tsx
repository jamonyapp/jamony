"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Heart, MessageCircle, Pencil, Play, Trash2, X, ArrowLeft } from "lucide-react"
import { TopNav } from "@/components/jamony/top-nav"
import { useAuth } from "@/lib/auth-context"

export type Work = {
  id: number
  title: string
  type: string
  plays: number
  likes: number
  comments: number
  duration: string
  date: string
  styles: string[]
}

const ALL_STYLES = ["摇滚","民谣","爵士","布鲁斯","放克","电子","流行","嘻哈","国风","古典","R&B","金属","ACG","雷鬼","实验"]

function TypeBadge({ type }: { type: string }) {
  const isJam = type === "jam"
  const color = isJam ? "#FF33AA" : "#00AAFF"
  const label = isJam ? "Jam" : "排练"
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ color, backgroundColor: `${color}1F` }}>
      {label}
    </span>
  )
}

function StyleTag({ label }: { label: string }) {
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.08)" }}>
      {label}
    </span>
  )
}

function Stat({ icon, value }: { icon: React.ReactNode; value: number | string }) {
  return <span className="flex items-center gap-1">{icon}{value}</span>
}

function WorkCard({ work, onSave, onDelete }: { work: Work; onSave: (next: Work) => void; onDelete: (id: number) => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view")
  const [title, setTitle] = useState(work.title)
  const [styles, setStyles] = useState<string[]>(work.styles)

  function startEdit() {
    setTitle(work.title)
    setStyles(work.styles)
    setMode("edit")
  }

  function toggleStyle(s: string) {
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
  }

  function save() {
    onSave({ ...work, title: title.trim() || work.title, styles })
    setMode("view")
  }

  if (mode === "edit") {
    return (
      <div className="rounded-[10px] border border-[#1A1A1A1A] bg-[#0D0D0D] p-4">
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-[10px] border border-[#2A2A2A] bg-[#141414] px-3 py-2 text-[15px] font-bold text-white outline-none transition-colors focus:border-[#9933FF]"
          placeholder="作品标题" autoFocus />
        <div className="mt-3">
          <p className="mb-2 text-xs" style={{ color: "#8A8A8A" }}>风格标签</p>
          <div className="flex flex-wrap gap-2">
            {ALL_STYLES.map((s) => {
              const active = styles.includes(s)
              return (
                <button key={s} type="button" onClick={() => toggleStyle(s)}
                  className="rounded-md px-2 py-1 text-[11px] transition-colors"
                  style={active ? { color: "#00AAFF", backgroundColor: "rgba(0,170,255,0.16)" } : { color: "#8A8A8A", backgroundColor: "#141414" }}>
                  {s}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setMode("view")}
            className="flex items-center gap-1 rounded-[10px] border border-[#2A2A2A] px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white"
            style={{ color: "#8A8A8A" }}>
            <X className="h-3.5 w-3.5" />取消
          </button>
          <button type="button" onClick={save}
            className="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}>
            <Check className="h-3.5 w-3.5" />保存
          </button>
        </div>
      </div>
    )
  }

  if (mode === "confirm") {
    return (
      <div className="flex flex-col gap-3 rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm" style={{ color: "#B0B0B0" }}>
          确认删除《<span className="text-white">{work.title}</span>》？
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode("view")}
            className="rounded-[10px] border border-[#2A2A2A] px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white"
            style={{ color: "#8A8A8A" }}>取消</button>
          <button type="button" onClick={() => onDelete(work.id)}
            className="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "#FF5C5C" }}>
            <Trash2 className="h-3.5 w-3.5" />删除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-white">{work.title}</h3>
          <TypeBadge type={work.type} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "#8A8A8A" }}>
          <Stat icon={<Play className="h-3 w-3" />} value={work.plays} />
          <Stat icon={<Heart className="h-3 w-3" />} value={work.likes} />
          <Stat icon={<MessageCircle className="h-3 w-3" />} value={work.comments} />
          <span>·</span><span>{work.duration}</span><span>·</span><span>{work.date}</span>
        </div>
        {work.styles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {work.styles.map((s) => <StyleTag key={s} label={s} />)}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
        <button type="button" onClick={startEdit}
          className="flex items-center justify-center gap-1 rounded-[10px] border border-[#2A2A2A] px-3 py-1.5 text-xs transition-colors hover:border-[#3A3A3A] hover:text-white"
          style={{ color: "#8A8A8A" }}>
          <Pencil className="h-3.5 w-3.5" />编辑
        </button>
        <button type="button" onClick={() => setMode("confirm")}
          className="flex items-center justify-center gap-1 rounded-[10px] border border-[#2A2A2A] px-3 py-1.5 text-xs transition-colors hover:border-[#FF5C5C]/50"
          style={{ color: "#FF5C5C", hoverBackground: "rgba(255,92,92,0.1)" }}>
          <Trash2 className="h-3.5 w-3.5" />删除
        </button>
      </div>
    </div>
  )
}

export function ManageWorksPage() {
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { user, loggedIn, ready, setShowLoginModal } = useAuth()

  useEffect(() => {
    if (!ready) return
    if (!loggedIn || !user) {
      setShowLoginModal(true)
      return
    }
    fetch(`/api/tracks/by-author/${encodeURIComponent(user.nickname)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setWorks(data.tracks)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [ready, loggedIn, user, setShowLoginModal])

  async function handleSave(next: Work) {
    const res = await fetch(`/api/tracks/${next.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next.title, styles: next.styles }),
    })
    const data = await res.json()
    if (data.ok) setWorks((prev) => prev.map((w) => (w.id === next.id ? data.track : w)))
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/tracks/${id}`, { method: "DELETE" })
    const data = await res.json()
    if (data.ok) setWorks((prev) => prev.filter((w) => w.id !== id))
  }

  if (!ready) return <div className="min-h-screen bg-black text-white"><TopNav /></div>
  if (!loggedIn || !user) return <div className="min-h-screen bg-black text-white"><TopNav /></div>

  return (
    <div className="min-h-screen bg-black text-white">
      <TopNav backLinks={[{ label: "返回个人主页", href: user ? `/profile?nickname=${encodeURIComponent(user.nickname)}` : "/" }]} />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-20">
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-bold text-white">作品管理</h1>
          <span className="text-xs" style={{ color: "#8A8A8A" }}>共 {works.length} 个作品</span>
        </div>
        {works.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] px-6 py-20 text-center">
            <p className="text-base font-medium" style={{ color: "#B0B0B0" }}>暂无作品</p>
            <p className="mt-2 text-xs" style={{ color: "#8A8A8A" }}>当你录制并保存合奏后，作品将显示在这里</p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {works.map((work) => (
              <WorkCard key={work.id} work={work} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
