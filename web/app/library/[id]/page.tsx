import { WorkDetailPage } from "@/components/jamony/work-detail-page"

export function generateStaticParams() {
  const ids = []
  for (let i = 1; i <= 18; i++) ids.push({ id: String(i) })
  return ids
}

export default function DetailRoute() {
  return <WorkDetailPage />
}
