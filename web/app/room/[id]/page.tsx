import { rooms } from "@/lib/rooms-data"
import { RoomDetailClient } from "@/components/room-detail-client"

export function generateStaticParams() {
  return rooms.map((room) => ({ id: room.id }))
}

export default function RoomDetailPage() {
  return <RoomDetailClient />
}
