import { rooms } from "@/lib/rooms-data"
import { PlayingPage } from "@/components/playing/playing-page"

export function generateStaticParams() {
  return rooms.map((room) => ({ id: room.id }))
}

export default function Page() {
  return <PlayingPage />
}
