"use client"

import { useEffect, useRef, useState } from "react"
import { MoreHorizontal, Pause, Play, Heart, MessageCircle } from "lucide-react"
import { VinylRecord } from "@/components/jamony/vinyl-record"
import { usePlayer } from "@/components/jamony/player-context"
import { formatCount, type Track } from "@/lib/jamony-data"
import { useAuth } from "@/lib/auth-context"

function WaveBars() {
  return (
    <div className="flex h-14 w-14 items-center justify-center gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            background: "#FFFFFF",
            animation: `jamony-wave 0.9s ease-in-out ${i * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export function TrackCard({ track }: { track: Track }) {
  const { current, isPlaying, playTrack, togglePlay, addToPlaylist } = usePlayer()
  const { loggedIn, setShowLoginModal } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSent, setFeedbackSent] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isCurrent = current?.id === track.id
  const isActivePlaying = isCurrent && isPlaying

  useEffect(() => {
    if (!menuOpen && !feedbackOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setFeedbackOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen, feedbackOpen])

  function handleCardClick() {
    if (isCurrent) {
      playTrack(track)
    } else {
      playTrack(track)
    }
  }

  function handleCenterButton(e: React.MouseEvent) {
    e.stopPropagation()
    if (isCurrent) {
      togglePlay()
    } else {
      playTrack(track)
    }
  }

  function handleMenuItem(action: string) {
    console.log("[v0] 菜单操作:", action, "-", track.title)
    if (action === "detail") {
      if (!loggedIn) { setShowLoginModal(true); return }
      window.location.href = `/library/${track.id}`
      return
    }
    if (action === "feedback") {
      setFeedbackOpen(true)
      return
    }
    if (action === "playlist") {
      addToPlaylist(track)
    }
    setMenuOpen(false)
  }

  function sendFeedback() {
    console.log("[v0] 反馈内容:", feedbackText, "-", track.title)
    setFeedbackSent(true)
    setTimeout(() => {
      setFeedbackSent(false)
      setFeedbackOpen(false)
      setMenuOpen(false)
      setFeedbackText("")
    }, 1500)
  }

  const hasCover = Boolean(track.coverImage)

  return (
    <div
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-[10px] transition-all duration-200 hover:-translate-y-[2px]"
      style={{
        background: hasCover ? "#111" : track.gradient,
        boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
      }}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      aria-label={`播放 ${track.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      {hasCover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.coverImage || "/placeholder.svg"}
          alt={track.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <VinylRecord />
      )}

      {/* 底部暗色遮罩 */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.7))",
        }}
        aria-hidden
      />

      {/* 中央播放/暂停按钮 或 波形 */}
      <div className="absolute left-1/2 top-[42%] z-10 -translate-x-1/2 -translate-y-1/2">
        {isActivePlaying ? (
          <>
            <div className="group-hover:hidden">
              <WaveBars />
            </div>
            <button
              type="button"
              onClick={handleCenterButton}
              aria-label="暂停"
              className="hidden h-14 w-14 items-center justify-center rounded-full bg-white shadow-xl group-hover:flex"
            >
              <Pause className="h-6 w-6 fill-black text-black" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCenterButton}
            aria-label="播放"
            className="flex h-14 w-14 scale-90 items-center justify-center rounded-full opacity-0 shadow-xl transition-all duration-500 ease-out group-hover:scale-100 group-hover:opacity-100"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
          </button>
        )}
      </div>

      {/* 右上角更多按钮 */}
      <div ref={menuRef} className="absolute right-2 top-2 z-20">
        <button
          type="button"
          aria-label="更多"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((o) => !o)
            setFeedbackOpen(false)
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-opacity duration-200 hover:bg-black/60 ${
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {menuOpen && (
          <div
            className={`absolute right-0 top-9 overflow-hidden rounded-[10px] border border-[#1A1A1A] bg-[#0D0D0D] py-1 shadow-2xl ${
              feedbackOpen ? "w-64" : "w-44"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {!feedbackOpen ? (
              <>
                <button
                  type="button"
                  onClick={() => handleMenuItem("detail")}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white transition-colors hover:bg-white/5"
                >
                  查看详情
                </button>
                <button
                  type="button"
                  onClick={() => handleMenuItem("playlist")}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white transition-colors hover:bg-white/5"
                >
                  加入播放列表
                </button>
                <button
                  type="button"
                  onClick={() => handleMenuItem("feedback")}
                  className="block w-full px-3 py-2 text-left text-[13px] text-white transition-colors hover:bg-white/5"
                >
                  反馈
                </button>
              </>
            ) : feedbackSent ? (
              <div className="px-4 py-6 text-center text-[13px]" style={{ color: "#BBEE00" }}>
                ✓ 感谢你的反馈！
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-3">
                <p className="text-[12px] text-[#9A9A9A]">反馈给作品作者</p>
                <textarea
                  autoFocus
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="请输入需要反馈的内容…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#1A1A1A] bg-black px-3 py-2 text-[13px] text-white outline-none placeholder:text-[#666] transition-colors focus:border-[#00AAFF]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); setFeedbackOpen(false) }}
                    className="rounded-md px-3 py-1.5 text-[12px] text-[#9A9A9A] transition-colors hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!feedbackText.trim()}
                    onClick={sendFeedback}
                    className="rounded-md px-4 py-1.5 text-[12px] font-medium text-white transition-opacity disabled:opacity-30"
                    style={{ background: "linear-gradient(135deg, #00AAFF, #9933FF)" }}
                  >
                    发送
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 文案 */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 p-3">
        <h3 className="truncate text-[15px] font-bold text-white">
          {track.title}
        </h3>
        <span className="text-[12px]" style={{ color: "#D0D0D0" }}>
          {track.author}
        </span>
        <div className="flex items-center gap-2 text-[12px] text-white">
          <span className="flex items-center gap-0.5">
            <Play className="h-3 w-3 fill-white" />
            {formatCount(track.plays)}
          </span>
          <span className="flex items-center gap-0.5">
            <Heart className="h-3 w-3" />
            {formatCount(track.likes)}
          </span>
          <span className="flex items-center gap-0.5">
            <MessageCircle className="h-3 w-3" />
            {track.comments}
          </span>
        </div>
      </div>
    </div>
  )
}
