import { tracks } from "@/lib/jamony-data"
import { WorkDetailPage } from "@/components/jamony/work-detail-page"

export function generateStaticParams() {
  return tracks.map((t) => ({ id: t.id }))
}

export default function DetailRoute() {
  return <WorkDetailPage />
}
