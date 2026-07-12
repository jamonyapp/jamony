import { RoomDetailClient } from "@/components/room-detail-client"

// SSR：房间 id 运行时动态渲染，不再预渲染（原 generateStaticParams 1-500 已删）

export default function RoomDetailPage() {
  return <RoomDetailClient />
}
