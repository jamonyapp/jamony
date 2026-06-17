import { CategoryListPage } from "@/components/jamony/category-list-page"

type Tab = "全部作品" | "排练作品" | "Jam 时刻"

function resolveTab(value?: string): Tab {
  if (value === "rehearsal") return "排练作品"
  if (value === "jam") return "Jam 时刻"
  return "全部作品"
}

export default async function CategoryRoute({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  return <CategoryListPage initialTab={resolveTab(tab)} />
}
