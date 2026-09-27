import { Suspense } from "react"
import { BoardPage } from "@/components/jamony/board-page"

export default function BoardRoute() {
  return (
    <Suspense fallback={null}>
      <BoardPage />
    </Suspense>
  )
}
