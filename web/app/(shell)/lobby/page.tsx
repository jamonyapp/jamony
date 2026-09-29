import { RoomListPage } from "@/components/room-list-page"

// 09-30 Tab 化：?tab= 经 window.location.search 读取（初始化时），无需 Suspense 边界
export default function LobbyPage() {
  return <RoomListPage />
}
