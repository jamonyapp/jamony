import type { ReactNode } from "react"
import { PlayerProvider } from "@/components/jamony/player-context"
import { PlayerBar } from "@/components/jamony/player-bar"

// 作品库共享 PlayerProvider + PlayerBar：跨页面（一级/筛选/详情）不卸载，播放不中断
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <PlayerProvider>
      {children}
      <PlayerBar />
    </PlayerProvider>
  )
}
