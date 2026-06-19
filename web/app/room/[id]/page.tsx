import { RoomDetailClient } from "@/components/room-detail-client"

export function generateStaticParams() {
  // 预生成 room/1 ~ room/10 用于静态导出
  return Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1) }))
}

export default function RoomDetailPage() {
  return <RoomDetailClient />
}
