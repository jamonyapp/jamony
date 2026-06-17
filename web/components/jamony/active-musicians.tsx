"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { musicians } from "@/lib/jamony-data"

export function ActiveMusicians() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [itemWidth, setItemWidth] = useState(0)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setItemWidth(el.clientWidth / 8.5)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => console.log("[library] go to profile:", m.name)}
                  style={{
                    width: itemWidth || undefined,
                    opacity: faded ? 0 : 1,
                    filter: faded ? "blur(6px)" : "blur(0px)",
                  }}
                  className="flex shrink-0 flex-col items-center gap-2.5 px-0.5 transition-all duration-500 ease-out"
                >
                  <span
                    className="flex items-center justify-center rounded-full text-3xl font-bold text-white"
                    style={{
                      background: m.avatarGradient,
                      height: 96,
                      width: 96,
                    }}
                  >
                    {m.name.charAt(0)}
                  </span>
                  <span className="max-w-full truncate text-[15px] font-medium text-white">
                    {m.name}
                  </span>
                  <span className="text-[13px] text-[#8A8A8A]">
                    {m.primaryInstrument}
                    {m.secondaryInstrument ?? ""}
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
