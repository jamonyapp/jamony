"use client"

import { highlights, tracks, type Highlight } from "@/lib/jamony-data"
import { Heart, Pause, Play, SkipBack, SkipForward, X, ExternalLink, ListMusic, MessageCircle } from "lucide-react"
import { useState } from "react"
import { SectionHeader } from "./section-header"

const DISC_ANGLES = [-2.0, 1.6, -1.4, 2.2]

function VinylRecord() {
  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-[42%] h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2"
      viewBox="0 0 100 100"
      fill="none"
      style={{ opacity: 0.16 }}
      aria-hidden
    >
      <circle cx="50" cy="50" r="48" fill="#000000" />
      <circle cx="50" cy="50" r="40" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="33" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="26" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="19" stroke="#FFFFFF" strokeWidth="0.6" />
      <circle cx="50" cy="50" r="11" fill="#FFFFFF" />
      <circle cx="50" cy="50" r="2.2" fill="#000000" />
    </svg>
  )
}

function HighlightCard({ item, angle, onOpen }: { item: Highlight; angle: number; onOpen: () => void }) {
  return (
    <button
      className="jamony-disc group relative aspect-square w-full overflow-hidden rounded-[10px] text-left"
      style={{
        background: item.gradient,
        transform: `rotate(${angle}deg)`,
        boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
      }}
      onClick={onOpen}
    >
      <VinylRecord />

      <span
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7))" }}
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
        <h3 className="text-[15px] font-bold text-white">{item.title}</h3>
        <span className="text-[12px]" style={{ color: "#D0D0D0" }}>
          {item.players}
        </span>
        <div className="flex items-center gap-1 text-[12px] text-white">
          <Heart className="h-3.5 w-3.5" fill="currentColor" />
          {item.likes}
        </div>
      </div>

      <span className="jamony-play absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors">
        <Play className="h-4 w-4" fill="currentColor" />
      </span>

      <span className="jamony-progress absolute inset-x-3 bottom-1.5 h-1 rounded-full" aria-hidden>
        <span className="block h-full w-1/3 rounded-full bg-white/80" />
      </span>
    </button>
  )
}

// 根据高亮标题匹配作品库 Track ID
function findTrackId(title: string): string | null {
  const found = tracks.find((t) => t.title === title)
  return found ? found.id : null
}

function DetailModal({ item, onClose }: { item: Highlight; onClose: () => void }) {
  const [playing, setPlaying] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSent, setFeedbackSent] = useState(false)

  const trackId = findTrackId(item.title)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="jamony-modal-enter relative w-full max-w-2xl rounded-2xl border p-6"
        style={{ background: "#0D0D0D", borderColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="关闭"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col gap-6 sm:flex-row">
          {/* Vinyl */}
          <div className="mx-auto shrink-0">
            <div
              className="relative flex h-44 w-44 items-center justify-center rounded-full"
              style={{
                background: `${item.gradient}, repeating-radial-gradient(circle at center, rgba(0,0,0,0.35) 0 2px, transparent 2px 5px)`,
                backgroundBlendMode: "overlay",
                boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
              }}
            >
              <span className="absolute inset-0 rounded-full" style={{ background: "repeating-radial-gradient(circle at center, rgba(0,0,0,0.4) 0 1px, transparent 1px 4px)" }} />
              <button
                className="relative flex h-16 w-16 items-center justify-center rounded-full text-white transition-transform active:scale-95"
                style={{ background: "#9933FF", boxShadow: "0 0 20px rgba(153,51,255,0.6)" }}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="h-6 w-6" fill="currentColor" />}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <h3 className="text-2xl font-bold text-white">{item.title}</h3>
            <p className="text-[13px]" style={{ color: "#8A8A8A" }}>
              作者
            </p>
            {/* 直接列出所有作者成员 */}
            <div className="flex flex-col gap-1">
              {item.members.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[13px] text-white">
                  <span>{m.instrument}</span>
                  <span>{m.name}</span>
                </div>
              ))}
            </div>
            <span
              className="mt-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: "rgba(0,170,255,0.12)", color: "#00AAFF" }}
            >
              {item.style}
            </span>
          </div>
        </div>

        {/* Player controls */}
        <div className="mt-6 flex items-center gap-3">
          <button className="text-white/70 transition-colors hover:text-white" onClick={() => console.log("[v0] prev")}>
            <SkipBack className="h-5 w-5" fill="currentColor" />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
          <button className="text-white/70 transition-colors hover:text-white" onClick={() => console.log("[v0] next")}>
            <SkipForward className="h-5 w-5" fill="currentColor" />
          </button>
          <div className="relative mx-2 h-1.5 flex-1 rounded-full bg-white/15">
            <span
              className="absolute inset-y-0 left-0 w-3/5 rounded-full"
              style={{ background: "linear-gradient(90deg, #00AAFF, #9933FF)" }}
            />
          </div>
          <span className="text-[12px] tabular-nums" style={{ color: "#8A8A8A" }}>
            03:24 / {item.duration}
          </span>
        </div>

        {/* 3 action buttons */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (trackId) window.location.href = `/library/${trackId}`
              else console.log("[highlights] no matching track for", item.title)
            }}
            className="flex items-center gap-1.5 rounded-lg border border-[#1A1A1A] px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-white/5"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            查看详情
          </button>
          <button
            type="button"
            onClick={() => console.log("[highlights] add to playlist:", item.title)}
            className="flex items-center gap-1.5 rounded-lg border border-[#1A1A1A] px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-white/5"
          >
            <ListMusic className="h-3.5 w-3.5" />
            加入播放列表
          </button>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#1A1A1A] px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-white/5"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            反馈
          </button>

          <span className="ml-auto flex items-center gap-1.5 text-[13px] text-white">
            <Heart className="h-4 w-4" style={{ color: "#FF33AA" }} fill="currentColor" />
            {item.likes}
          </span>
        </div>

        {/* 反馈输入框 */}
        {feedbackOpen && !feedbackSent && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[#1A1A1A] p-3">
            <textarea
              autoFocus
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="请输入需要反馈的内容…"
              rows={2}
              className="w-full resize-none rounded-md border border-[#1A1A1A] bg-black px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-[#666] focus:border-[#00AAFF]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setFeedbackOpen(false); setFeedbackText("") }}
                className="px-3 py-1 text-[12px] text-[#9A9A9A] transition-colors hover:text-white"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!feedbackText.trim()}
                onClick={() => {
                  console.log("[highlights] feedback:", feedbackText, "-", item.title)
                  setFeedbackSent(true)
                  setTimeout(() => { setFeedbackSent(false); setFeedbackOpen(false); setFeedbackText("") }, 1500)
                }}
                className="rounded-md px-3 py-1 text-[12px] font-medium text-white disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
              >
                发送
              </button>
            </div>
          </div>
        )}
        {feedbackSent && (
          <div className="mt-3 text-center text-[12px]" style={{ color: "#BBEE00" }}>
            ✓ 感谢你的反馈！
          </div>
        )}
      </div>
    </div>
  )
}

export function HighlightsScreen() {
  const [active, setActive] = useState<Highlight | null>(null)
  return (
    <section>
      <SectionHeader title="⭐ 高光时刻" linkLabel="作品库" onLink={() => window.location.href = "/library"} />
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {highlights.map((item, i) => (
          <HighlightCard
            key={item.id}
            item={item}
            angle={DISC_ANGLES[i % DISC_ANGLES.length]}
            onOpen={() => setActive(item)}
          />
        ))}
      </div>
      {active && <DetailModal item={active} onClose={() => setActive(null)} />}
    </section>
  )
}
