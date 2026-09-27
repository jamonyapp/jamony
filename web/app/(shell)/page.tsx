"use client"

import { BoardScreen } from "@/components/jamony/board-screen"
import { HeroSection } from "@/components/jamony/hero-section"
import { HighlightsScreen } from "@/components/jamony/highlights-screen"
import { RoomsScreen } from "@/components/jamony/rooms-screen"
import { ActiveMusicians } from "@/components/jamony/active-musicians"

// 首页 —— 09-27 左栏常驻改造：TopNav/LeftSidebar/外层 main 让位都由 (shell) 布局承担，
// 页内只留五段内容流（px-8 py-8 与改造前一致）
export default function Home() {
  return (
    <div className="min-h-screen font-sans px-8 py-8" style={{ background: "#000000" }}>
      <div className="flex flex-col gap-8">
        <HeroSection />
        <RoomsScreen />
        <BoardScreen />
        <ActiveMusicians />
        <HighlightsScreen />
      </div>
    </div>
  )
}
