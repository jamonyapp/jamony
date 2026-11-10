import { redirect } from "next/navigation"

// 09-28 作品库改版：筛选页已升为一级页 /library，本路由保留仅作旧链接重定向
// （带 tab 参数无损跳转）
export default async function CategoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  redirect(tab === "rehearsal" || tab === "jam" ? `/library?tab=${tab}` : "/library")
}
