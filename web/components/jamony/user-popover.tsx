"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { useRouter } from "next/navigation"

type PopoverUser = {
  nickname: string
  primary_instrument: string
  instrument_category: string
  city: string
  level: number
  points: number
}

type PopoverPos = { top: number; left: number } | null

export function UserPopover({
  nickname,
  children,
}: {
  nickname: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [pos, setPos] = useState<PopoverPos>(null)
  const [user, setUser] = useState<PopoverUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)

  const close = () => { setPos(null); setImgOpen(false) }

  useEffect(() => {
    if (!pos) return
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [pos])

  const handleClick = async () => {
    if (pos) { close(); return }
    // position relative to the trigger element
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ top: rect.bottom + 6, left: Math.max(10, rect.left - 60) })

    if (!user) {
      setLoading(true)
      try {
        const res = await fetch(`/api/users/by-nickname/${encodeURIComponent(nickname)}`)
        const data = await res.json()
        if (data.ok) setUser(data.user)
      } catch {}
      setLoading(false)
    }
  }

  const instrumentIcon: Record<string, string> = {
    "原声吉他": "🎸", "电吉他": "🎸", "贝斯": "🎸",
    "打击乐器": "🥁", "键盘乐器": "🎹", "主唱": "🎤",
    "弦乐": "🎻", "管乐": "🎷", "民乐": "🪕", "其他": "🎵", "听众": "🎧",
  }

  const cat = user?.instrument_category || ""
  const icon = instrumentIcon[cat] || "🎵"

  return (
    <>
      <span ref={triggerRef} onClick={handleClick} className="inline cursor-pointer hover:opacity-80 transition-opacity">
        {children}
      </span>

      {pos && (
        <div
          ref={popRef}
          className="fixed z-[80] w-56 overflow-hidden rounded-[14px] border shadow-2xl"
          style={{ top: pos.top, left: pos.left, background: "#0D0D0D", borderColor: "#1A1A1A" }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-10"><span className="text-xs" style={{ color: "#8A8A8A" }}>加载中...</span></div>
          ) : user ? (
            <>
              {/* 顶部个人信息 */}
              <div className="flex items-start gap-3 p-4 pb-3">
                <button
                  onClick={() => setImgOpen(true)}
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-xl font-bold text-white transition-transform hover:scale-105"
                  style={{ background: `linear-gradient(135deg, #00AAFF, #9933FF)` }}
                >
                  {user.nickname.charAt(0)}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold text-white truncate">{user.nickname}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[13px]" style={{ color: "#B0B0B0" }}>
                    {icon} {user.primary_instrument}
                  </p>
                  <p className="mt-0.5 text-[12px]" style={{ color: "#8A8A8A" }}>
                    Lv.{user.level} · {user.points.toLocaleString()} 积分
                  </p>
                </div>
              </div>

              <div className="px-4 pb-2">
                <span className="inline-block rounded-md px-2 py-0.5 text-[11px]" style={{ color: "#FF33AA", backgroundColor: "rgba(255,51,170,0.10)" }}>
                  🎵 免费用户
                </span>
              </div>

              <div className="border-t px-4 py-3" style={{ borderColor: "#1A1A1A" }}>
                <button
                  onClick={() => router.push(`/profile?nickname=${encodeURIComponent(user.nickname)}`)}
                  className="w-full rounded-[10px] py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}
                >
                  查看个人主页 →
                </button>
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center text-xs" style={{ color: "#8A8A8A" }}>用户信息加载失败</div>
          )}
        </div>
      )}

      {/* 头像放大 */}
      {imgOpen && user && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setImgOpen(false)}
        >
          <div
            className="flex h-[120px] w-[120px] items-center justify-center rounded-full text-5xl font-bold text-white shadow-2xl"
            style={{ background: `linear-gradient(135deg, #00AAFF, #9933FF)` }}
            onClick={(e) => e.stopPropagation()}
          >
            {user.nickname.charAt(0)}
          </div>
        </div>
      )}
    </>
  )
}
