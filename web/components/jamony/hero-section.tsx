"use client"

export function HeroSection() {
  return (
    <div className="flex flex-col items-center gap-5 pb-4 pt-10">
      {/* 主标题 */}
      <h1 className="text-center text-[52px] font-bold leading-[1] tracking-[0.01em] text-white md:text-[80px] md:leading-[1] md:tracking-[0.02em]">
        此刻想
        <span className="bg-gradient-to-r from-[#00AAFF] via-[#9933FF] to-[#fb23c2] bg-clip-text text-transparent">
          玩
        </span>
        点什么？
      </h1>

      {/* 三个提示词（欢哥 08-31: 两轮调亮 #666→#B0B0B0→#E0E0E0） */}
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-light tracking-[0.15em]" style={{ color: "#E0E0E0" }}>
          jam
        </span>
        <span className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "#999" }} />
        <span className="text-[15px] font-light tracking-[0.1em]" style={{ color: "#E0E0E0" }}>
          排练
        </span>
        <span className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "#999" }} />
        <span className="text-[15px] font-light tracking-[0.1em]" style={{ color: "#E0E0E0" }}>
          随便听听
        </span>
      </div>
    </div>
  )
}
