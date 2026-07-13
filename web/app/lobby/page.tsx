import { Suspense } from "react"
import { RoomListPage } from "@/components/room-list-page"

// useSearchParams 需 Suspense 边界（双栏首页 vs ?type=全列表）
export default function LobbyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <RoomListPage />
    </Suspense>
  )
}
