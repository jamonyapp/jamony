"use client"

import { Disc3, Home, MessageSquare, Music, Plus, Radio, ScrollText, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CreateRoomModal } from "@/components/create-room-modal"
import { PublishNoticeModal } from "@/components/jamony/publish-notice-modal"
import type { Notice } from "@/lib/jamony-data"
import { useAuth } from "@/lib/auth-context"

const navItems = [
  { icon: Home, label: "首页", href: "/" },
  { icon: Music, label: "房间大厅", href: "/lobby" },
  { icon: ScrollText, label: "公告牌", href: "/board" },
  { icon: Disc3, label: "作品库", href: "/library" },
]

export function LeftSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [createRoomOpen, setCreateRoomOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const { loggedIn, setShowLoginModal } = useAuth()

  const requireAuth = (fn: () => void) => {
    if (!loggedIn) { setShowLoginModal(true); return }
    fn()
  }

  return (
    <aside
      className="fixed bottom-0 left-0 top-11 z-40 flex w-60 flex-col border-r px-3 py-4"
      style={{ background: "transparent", borderColor: "#1A1A1A" }}
    >
      {/* CTA buttons */}
      <div className="flex flex-col gap-2">
        <button
          className="flex items-center justify-center gap-2 rounded-[10px] py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.97]"
          style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          onClick={() => requireAuth(() => setCreateRoomOpen(true))}
        >
          <Plus className="h-4 w-4" />
          创建房间
        </button>
        <button
          className="flex items-center justify-center gap-2 rounded-[10px] border py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-white/5 active:scale-[0.97]"
          style={{ borderColor: "rgba(255,255,255,0.4)" }}
          onClick={() => requireAuth(() => setPublishOpen(true))}
        >
          <Plus className="h-4 w-4" />
          发布公告
        </button>
      </div>

      <div className="my-4 h-px" style={{ background: "#1A1A1A" }} />

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = item.href === pathname || (item.href === "/" && pathname === "/")
          return (
            <button
              key={item.label}
              className="relative flex h-11 items-center gap-3 rounded-md px-3 text-[14px] transition-colors hover:bg-white/5"
              style={{ color: active ? "#FFFFFF" : "#AAAAAA", fontWeight: active ? 700 : 400 }}
              onClick={() => {
                if (item.href) router.push(item.href)
                else console.log("[v0] nav", item.label, "(coming soon)")
              }}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full"
                  style={{ background: "#00AAFF" }}
                />
              )}
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="my-4 h-px" style={{ background: "#1A1A1A" }} />

      {/* Bottom area */}
      <div className="mt-auto flex flex-col gap-2">
        {/* official update card */}
        <div
          className="rounded-[10px] border p-3"
          style={{
            borderColor: "#1A1A1A",
            background: "rgba(0,170,255,0.05)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 shrink-0" style={{ color: "#00AAFF" }} />
            <span className="text-[12px] font-bold" style={{ color: "#00AAFF" }}>
              官方动态
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#C8C8C8" }}>
            jamony 可能还不够好，但我们一直在向前，就像玩音乐。
          </p>
          <p className="mt-2 text-right text-[11px]" style={{ color: "#8A8A8A" }}>
            —— jamony 工作室
          </p>
        </div>
        <button
          className="flex items-center gap-3 rounded-md px-3 py-2 text-[14px] transition-colors hover:bg-white/5"
          style={{ color: "#AAAAAA" }}
          onClick={() => setFeedbackOpen(true)}
        >
          <MessageSquare className="h-[18px] w-[18px]" />
          意见反馈
        </button>
      </div>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      <CreateRoomModal open={createRoomOpen} onClose={() => setCreateRoomOpen(false)} />
      <PublishNoticeModal open={publishOpen} onClose={() => setPublishOpen(false)} onPublish={(notice) => console.log("[jamony] published notice from sidebar:", notice.id)} />
    </aside>
  )
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("")
  const [sent, setSent] = useState(false)

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  function handleSend() {
    if (sent) return
    console.log("[v0] feedback submitted:", value)
    setValue("")
    setSent(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="jamony-modal-enter relative w-full max-w-md rounded-2xl border p-6"
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

        <h3 className="text-lg font-bold text-white">意见反馈</h3>

        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="请告诉我你的想法或问题..."
          rows={5}
          className="mt-4 w-full resize-none rounded-xl border bg-transparent p-3 text-[14px] text-white outline-none transition-colors placeholder:text-[#666] focus:border-[#9933FF]"
          style={{ borderColor: "#1A1A1A" }}
        />

        {sent && (
          <p className="mt-3 text-[13px] font-medium" style={{ color: "#3FCF6E" }}>
            ✓ 感谢你的反馈！
          </p>
        )}

        <button
          className="mt-4 w-full rounded-[10px] py-2.5 text-[14px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-80"
          style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
          onClick={handleSend}
          disabled={sent}
        >
          {sent ? "已发送" : "发送"}
        </button>
      </div>
    </div>
  )
}
