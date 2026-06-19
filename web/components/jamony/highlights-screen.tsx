"use client"

import { highlights, type Highlight } from "@/lib/jamony-data"
import { Heart, Pause, Play, SkipBack, SkipForward, X, ExternalLink, ListMusic, MessageCircle } from "lucide-react"
import { useState } from "react"
import { SectionHeader } from "./section-header"
import { useAuth } from "@/lib/auth-context"

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

function DetailModal({ item, onClose }: { item: Highlight; onClose: () => void }) {
  const [playing, setPlaying] = useState(true)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSent, setFeedbackSent] = useState(false)
  const { loggedIn, setShowLoginModal } = useAuth()

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="jamony-modal-enter relative w-full max-w-2xl rounded-2xl border p-5"
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

        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Vinyl */}
          <div className="mx-auto shrink-0">
            <div
              className="relative flex h-36 w-36 items-center justify-center rounded-full sm:h-44 sm:w-44"
              style={{
                background: `${item.gradient}, repeating-radial-gradient(circle at center, rgba(0,0,0,0.35) 0 2px, transparent 2px 5px)`,
                backgroundBlendMode: "overlay",
                boxShadow: "0 12px 30px rgba(0,0,0,0.6)",
              }}
            >
              <span className="absolute inset-0 rounded-full" style={{ background: "repeating-radial-gradient(circle at center, rgba(0,0,0,0.4) 0 1px, transparent 1px 4px)" }} />
              <button
                className="relative flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform active:scale-95 sm:h-16 sm:w-16"
                style={{ background: "#9933FF", boxShadow: "0 0 20px rgba(153,51,255,0.6)" }}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <Pause className="h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" /> : <Play className="h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" />}
              </button>
            </div>
          </div>

          {/* Info + Members + Actions */}
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white sm:text-2xl">{item.title}</h3>
              {/* 点赞放在名字后面 */}
              <span className="flex shrink-0 items-center gap-1 text-[13px] text-white">
                <Heart className="h-4 w-4" style={{ color: "#FF33AA" }} fill="currentColor" />
                {item.likes}
              </span>
            </div>

            {/* 风格标签紧随名称 */}
            <span
              className="w-fit rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-[11px]"
              style={{ background: "rgba(0,170,255,0.12)", color: "#00AAFF" }}
            >
              {item.style}
            </span>

            {/* 作者 + 成员 同一行 */}
            <div className="flex flex-wrap items-center gap-1 text-[12px] sm:text-[13px]" style={{ color: "#8A8A8A" }}>
              <span>作者</span>
              {item.members.map((m, i) => (
                <span key={i} className="flex items-center gap-1 text-white">
                  {i > 0 && <span className="text-[#333]">·</span>}
                  <span>{m.instrument}</span>
                  <span>{m.name}</span>
                </span>
              ))}
            </div>

            {/* 3 个操作按钮 */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!loggedIn) { setShowLoginModal(true); return }
                  if (item.trackId) window.location.href = `/library/${item.trackId}`
                  else console.log("[highlights] no matching track for", item.title)
                }}
                className="flex items-center gap-1 rounded-lg border border-[#1A1A1A] px-2.5 py-1 text-[11px] text-white transition-colors hover:bg-white/5 sm:text-[12px]"
              >
                <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                查看详情
              </button>
              <button
                type="button"
                onClick={() => console.log("[highlights] add to playlist:", item.title)}
                className="flex items-center gap-1 rounded-lg border border-[#1A1A1A] px-2.5 py-1 text-[11px] text-white transition-colors hover:bg-white/5 sm:text-[12px]"
              >
                <ListMusic className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                加入播放列表
              </button>
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="flex items-center gap-1 rounded-lg border border-[#1A1A1A] px-2.5 py-1 text-[11px] text-white transition-colors hover:bg-white/5 sm:text-[12px]"
              >
                <MessageCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                反馈
              </button>
            </div>
          </div>
        </div>

        {/* Player controls */}
        <div className="mt-4 flex items-center gap-3">
          <button className="text-white/70 transition-colors hover:text-white" onClick={() => console.log("[v0] prev")}>
            <SkipBack className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" />
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black sm:h-9 sm:w-9"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" /> : <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />}
          </button>
          <button className="text-white/70 transition-colors hover:text-white" onClick={() => console.log("[v0] next")}>
            <SkipForward className="h-4 w-4 sm:h-5 sm:w-5" fill="currentColor" />
          </button>
          <div className="relative mx-1 h-1 flex-1 rounded-full bg-white/15 sm:mx-2 sm:h-1.5">
            <span
              className="absolute inset-y-0 left-0 w-3/5 rounded-full"
              style={{ background: "linear-gradient(90deg, #00AAFF, #9933FF)" }}
            />
          </div>
          <span className="text-[11px] tabular-nums sm:text-[12px]" style={{ color: "#8A8A8A" }}>
            03:24 / {item.duration}
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
