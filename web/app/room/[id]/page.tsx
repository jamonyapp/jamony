import { RoomDetailClient } from "@/components/room-detail-client"

export function generateStaticParams() {
  // 预生成 room/1 ~ room/500 用于静态导出（房间 id 自增，需覆盖新建房间）
  return Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1) }))
}

export default function RoomDetailPage() {
  return <RoomDetailClient />
}
