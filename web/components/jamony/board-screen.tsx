"use client"

import { type Notice } from "@/lib/jamony-data"
import { mapNotice } from "@/lib/notice-mappers"
import { UserPopover } from "@/components/jamony/user-popover"
import { Avatar } from "@/components/jamony/avatar"
import { NoticeDetailModal } from "@/components/jamony/notice-detail-modal"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { SectionHeader } from "./section-header"


// Deep "underground rehearsal room" palette: dark base per theme
// (欢哥 08-31: stripe 发光条已移除, 仅保留底色区分主题).
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
// (欢哥 08-31: pin 字段保留占位避免改动数组结构, 图钉已不再渲染)
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

// 欢哥 08-31: Pin 彩色图钉组件已移除（连同 pinPos 表, 觉得土）

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
      {/* 欢哥 08-31: 移除彩色图钉+左侧发光条（照片背景保留——欢哥只让移除外层墙面大图） */}
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

      {/* 欢哥 08-31: 外层背景整体移除——参考高光时刻, 卡片直接裸放在页面上 */}
      <div className="grid grid-cols-4 items-start gap-x-6 gap-y-10">
        {list.slice(0, 8).map((notice, i) => (
          <NoteCard key={notice.id} notice={notice} index={i} onOpen={() => setActiveNotice(notice)} />
        ))}
      </div>

      {activeNotice && <NoticeDetailModal notice={activeNotice} onClose={() => setActiveNotice(null)} />}
    </section>
  )
}

