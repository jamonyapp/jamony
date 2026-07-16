"use client"

import { type Notice } from "@/lib/jamony-data"
import { mapNotice } from "@/lib/notice-mappers"
import { UserPopover } from "@/components/jamony/user-popover"
import { Avatar } from "@/components/jamony/avatar"
import { NoticeDetailModal } from "@/components/jamony/notice-detail-modal"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./section-header"


// Deep "underground rehearsal room" palette: dark base + neon accent stripe.
const noteThemes = [
  { bg: "#4A1515", stripe: "#FF33AA" }, // 深红
  { bg: "#15254A", stripe: "#00AAFF" }, // 深蓝
  { bg: "#2A154A", stripe: "#9933FF" }, // 深紫
  { bg: "#154A2A", stripe: "#BBEE00" }, // 深绿
  { bg: "#4A2A15", stripe: "#FF6633" }, // 深橙
]

// 4 columns × 2 rows fixed grid. Each card fills a random fraction (76%–100%) of its
// grid cell so the wall still looks casually "hand-pinned" with notes of varied sizes,
// while always keeping exactly 4 per row. justify controls which edge it hugs.
type Layout = { rotate: number; mt: number; pin: string; wPct: number; justify: string }
const layouts: Layout[] = [
  { rotate: -2.5, mt: 6, pin: "tl", wPct: 92, justify: "flex-start" },
  { rotate: 2.0, mt: -8, pin: "tr", wPct: 78, justify: "flex-end" },
  { rotate: -1.2, mt: 10, pin: "tr", wPct: 100, justify: "center" },
  { rotate: 2.8, mt: -6, pin: "tl", wPct: 82, justify: "flex-start" },
  { rotate: -3.0, mt: 4, pin: "bl", wPct: 96, justify: "flex-end" },
  { rotate: 1.5, mt: -10, pin: "tr", wPct: 76, justify: "center" },
  { rotate: -1.8, mt: 8, pin: "tl", wPct: 88, justify: "flex-start" },
  { rotate: 2.4, mt: -4, pin: "br", wPct: 100, justify: "flex-end" },
]

const pinPos: Record<string, string> = {
  tl: "left-3 top-2",
  tr: "right-3 top-2",
  bl: "left-3 bottom-2",
  br: "right-3 bottom-2",
}

function Pin({ pos, color }: { pos: string; color: string }) {
  return (
    <span className={`absolute z-10 ${pinPos[pos]}`} aria-hidden>
      <span
        className="jamony-pin block h-3 w-3 rounded-full"
        style={
          {
            background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 45%, ${color} 100%)`,
            boxShadow: "0 2px 3px rgba(0,0,0,0.7), inset 0 1px 1px rgba(255,255,255,0.6)",
            "--stripe": color,
          } as React.CSSProperties
        }
      />
    </span>
  )
}

function NoteCard({ notice, index, onOpen }: { notice: Notice; index: number; onOpen: () => void }) {
  const theme = noteThemes[index % noteThemes.length]
  const l = layouts[index % layouts.length]

  return (
    <div className="flex" style={{ justifyContent: l.justify }}>
      <button
        type="button"
        onClick={onOpen}
        className="jamony-note relative block text-left"
        style={
          {
            "--tilt": `${l.rotate}deg`,
            width: `${l.wPct}%`,
            marginTop: l.mt,
          } as React.CSSProperties
        }
      >
        <Pin pos={l.pin} color={theme.stripe} />
      <div
        className="relative overflow-hidden rounded-[4px] p-4 pl-5"
        style={{
          backgroundImage: `url('${notice.imageUrl || `/images/jamony-board-bg-${String(notice.bgIndex).padStart(2, "0")}.webp`}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "#EDEDED",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.06) inset, 0 10px 22px rgba(0,0,0,0.6), 0 3px 6px rgba(0,0,0,0.5)",
        }}
      >
        {/* 深色渐变叠加保证文字可读 */}
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.25) 100%)" }}
          aria-hidden
        />
        {/* left neon category stripe */}
        <span
          className="jamony-stripe absolute inset-y-0 left-0 w-1"
          style={{ background: theme.stripe, "--stripe": theme.stripe } as React.CSSProperties}
        />

        <div className="relative">
          <h3 className="text-[15px] font-bold leading-snug" style={{ color: "#FFFFFF" }}>
            {notice.title}
          </h3>
          <div className="mt-1.5">
            <p className="text-[13px] leading-relaxed line-clamp-3" style={{ color: "#E8E8E8" }}>
              {notice.body}
            </p>
            <span className="mt-0.5 inline-block text-[11px]" style={{ color: "#BBBBBB" }}>
              ... 更多
            </span>
          </div>
          <p className="mt-3 flex items-center justify-end gap-1.5 text-right text-[13px]" style={{ color: "#CCCCCC" }}>
            <Avatar nickname={notice.author} avatarUrl={notice.authorAvatar} size={20} /><UserPopover nickname={notice.author}>{notice.author}</UserPopover>
          </p>
          <p className="mt-0.5 text-right text-[11px]" style={{ color: "#9A9A9A" }}>{notice.time}</p>
        </div>

        {/* curled bottom-right corner */}
        <span
          className="pointer-events-none absolute bottom-0 right-0 h-6 w-6"
          style={{
            background: "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.5) 50%)",
            borderTopLeftRadius: 8,
            boxShadow: "-2px -2px 4px rgba(0,0,0,0.4)",
          }}
          aria-hidden
        />
        </div>
      </button>
    </div>
  )
}

export function BoardScreen() {
  const router = useRouter()
  const [list, setList] = useState<Notice[]>([])
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null)

  useEffect(() => {
    const fetchNotices = () => {
      fetch("/api/notices?limit=8")
        .then((r) => r.json())
        .then((data) => { if (data.ok) setList((data.notices || []).map(mapNotice)) })
        .catch(() => {})
    }
    fetchNotices()
    const t = setInterval(fetchNotices, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <section>
      <SectionHeader title="公告牌" linkLabel="全部公告" onLink={() => router.push("/board")} />

      {/* neon-wall photo background */}
      <div
        className="relative overflow-hidden rounded-xl p-6"
        style={{
          backgroundColor: "#000000",
          backgroundImage: "url('/images/board-background.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.8)",
        }}
      >
        {/* dark overlay so the pinned notes stay readable on top of the neon wall */}
        <span
          className="pointer-events-none absolute inset-0"
          style={{ background: "rgba(0,0,0,0.55)" }}
          aria-hidden
        />

        <div className="relative grid grid-cols-4 items-start gap-x-6 gap-y-10">
          {list.slice(0, 8).map((notice, i) => (
            <NoteCard key={notice.id} notice={notice} index={i} onOpen={() => setActiveNotice(notice)} />
          ))}
        </div>
      </div>

      {activeNotice && <NoticeDetailModal notice={activeNotice} onClose={() => setActiveNotice(null)} />}
    </section>
  )
}

