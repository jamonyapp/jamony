import type { ReactNode } from "react"

// PlayerBar 已在根 layout 全局挂载（全站播放器，播放时显示）
export default function LibraryLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
