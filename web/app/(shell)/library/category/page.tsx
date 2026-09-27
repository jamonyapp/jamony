"use client"

import dynamic from "next/dynamic"

const CategoryListPage = dynamic(
  () => import("@/components/jamony/category-list-page").then((m) => ({ default: m.CategoryListPage })),
  { ssr: false },
)

export default function CategoryRoute() {
  return <CategoryListPage />
}
