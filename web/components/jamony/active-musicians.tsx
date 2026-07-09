"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"

const INSTRUMENT_ICON: Record<string, string> = {
  "电吉他": "🎸",
  "原声吉他": "🎸",
  "贝斯": "🎸",
  "打击乐器": "🥁",
  "键盘乐器": "🎹",
  "主唱": "🎤",
  "萨克斯": "🎷",
  "弦乐": "🎻",
  "管乐": "🎷",
  "民乐": "🪕",
  "听众": "🎧",
}

const GRADIENTS = [
  "linear-gradient(135deg, #00AAFF, #9933FF)",
  "linear-gradient(135deg, #9933FF, #FF33AA)",
  "linear-gradient(135deg, #00AAFF, #FF33AA)",
  "linear-gradient(135deg, #9933FF, #BBEE00)",
  "linear-gradient(135deg, #FF33AA, #BBEE00)",
  "linear-gradient(135deg, #00AAFF, #BBEE00)",
]

type Musician = {
  id: number
  nickname: string
  primary_instrument: string
  instrument_category: string
}

export function ActiveMusicians() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [itemWidth, setItemWidth] = useState(0)
  const [offset, setOffset] = useState(0)
  const [musicians, setMusicians] = useState<Musician[]>([])

  useEffect(() => {
    fetch("/api/users?limit=16")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setMusicians(data.users)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (musicians.length === 0) return
    const el = containerRef.current
    if (!el) return
    const measure = () => setItemWidth(el.clientWidth / 8.5)
    // small delay so the DOM is ready after musicians load
    const t = setTimeout(() => {
      measure()
      const ro = new ResizeObserver(measure)
      ro.observe(el)
    }, 50)
    return () => clearTimeout(t)
  }, [musicians.length])

  const containerWidth = itemWidth * 8.5
  const totalWidth = itemWidth * musicians.length
  const maxTranslate = Math.max(0, totalWidth - containerWidth)
  const translate = Math.min(offset * itemWidth, maxTranslate)

  const canScrollLeft = offset > 0
  const canScrollRight = translate < maxTranslate - 0.5

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">活跃乐手</h2>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0, #000 6%, #000 90%, transparent 100%)",
            maskImage:
              "linear-gradient(to right, transparent 0, #000 6%, #000 90%, transparent 100%)",
          }}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${translate}px)` }}
          >
            {musicians.map((m, i) => {
              const faded = i < offset
              const grad = GRADIENTS[i % GRADIENTS.length]
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => router.push(`/profile?nickname=${encodeURIComponent(m.nickname)}`)}
                  style={{
                    width: itemWidth || undefined,
                    opacity: faded ? 0 : 1,
                    filter: faded ? "blur(6px)" : "blur(0px)",
                  }}
                  className="flex shrink-0 flex-col items-center gap-2.5 px-0.5 transition-all duration-500 ease-out"
                >
                  <span
                    className="flex items-center justify-center rounded-full font-bold text-white"
                    style={{
                      background: grad,
                      height: 72,
                      width: 72,
                      fontSize: 24,
                    }}
                  >
                    {m.nickname.charAt(0)}
                  </span>
                  <span className="max-w-full truncate text-[13px] font-medium text-white">
                    {m.nickname}
                  </span>
                  <span className="text-[18px] leading-none text-[#8A8A8A]">
                    {INSTRUMENT_ICON[m.instrument_category] || "🎵"}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {canScrollLeft && (
          <button
            type="button"
            aria-label="向左滚动"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            className="absolute left-0 top-9 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white hover:text-black"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {canScrollRight && (
          <button
            type="button"
            aria-label="向右滚动"
            onClick={() => setOffset((o) => o + 1)}
            className="absolute right-0 top-9 z-10 flex h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition-colors hover:bg-white hover:text-black"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </section>
  )
}
