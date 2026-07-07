import type { ReactNode } from "react"
import { PlayerBar } from "@/components/jamony/player-bar"

// PlayerProvider 已在根 layout 全局提供（首页↔作品库↔详情页共享，跨页面不卸载）
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PlayerBar />
    </>
  )
}
