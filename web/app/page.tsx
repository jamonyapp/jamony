"use client"

import { BoardScreen } from "@/components/jamony/board-screen"
import { HeroSection } from "@/components/jamony/hero-section"
import { HighlightsScreen } from "@/components/jamony/highlights-screen"
import { LeftSidebar } from "@/components/jamony/left-sidebar"
import { RoomsScreen } from "@/components/jamony/rooms-screen"
import { TopNav } from "@/components/jamony/top-nav"

export default function Home() {
  return (
    <div className="min-h-screen font-sans" style={{ background: "#000000" }}>
      <TopNav onRefresh={() => window.location.reload()} />
      <LeftSidebar />
      <main className="ml-60 mt-11 min-h-[calc(100vh-2.75rem)] px-8 py-8">
        <div className="flex flex-col gap-8">
          <HeroSection />
          <RoomsScreen />
          <BoardScreen />
          <HighlightsScreen />
        </div>
      </main>
    </div>
  )
}
