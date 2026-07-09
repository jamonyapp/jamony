import { PlayingPage } from "@/components/playing/playing-page"

export function generateStaticParams() {
  return Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1) }))
}

export default function Page() {
  return (
    <>
      {/* BUILD:2026-06-23-v3 — 如果你在网页源码里看到这行注释，说明新代码已部署 */}
      <PlayingPage />
    </>
  )
}
