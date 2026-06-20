import { PlayingPage } from "@/components/playing/playing-page"

export function generateStaticParams() {
  return Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1) }))
}

export default function Page() {
  return <PlayingPage />
}
