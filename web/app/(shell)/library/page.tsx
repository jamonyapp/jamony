"use client"

import dynamic from "next/dynamic"

// 09-28 作品库改版：筛选页升为一级页（原"标题+双分节+更多"的预览页废弃——排练栏
// 常空时退化为多余一跳）。/library 直接渲染筛选列表，Tab 切换同步 ?tab 到本路由
const CategoryListPage = dynamic(
  () => import("@/components/jamony/category-list-page").then((m) => ({ default: m.CategoryListPage })),
  { ssr: false },
)

export default function LibraryRoute() {
  return <CategoryListPage />
}
