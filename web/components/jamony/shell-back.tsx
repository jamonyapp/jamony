"use client"

import { ChevronLeft } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

// 返回父级表：每条路由的上一级；首页 → null（按钮视觉隐去但保留 w-8 占位，
// 否则顶行 justify-between 只剩右簇会塌到左侧——10-07 踩坑）
// 09-27 左栏常驻改造：全站统一的返回按钮（纯符号无文字）
function getParent(
  pathname: string,
  nicknameParam: string | null,
  selfNickname?: string
): string | null {
  if (pathname === "/") return null
  // /lobby 09-30 Tab 化后 ?tab= 是页内状态（replace 不入历史），父级一律首页（同 /library）
  if (pathname === "/lobby" || pathname === "/board" || pathname === "/library" || pathname === "/profile") return "/"
  // 作品详情 → 作品库（09-28 改版后筛选页即一级页，libFrom 双态区分退役）
  if (pathname.startsWith("/library/")) return "/library"
  if (pathname === "/profile/works")
    return nicknameParam ? `/profile?nickname=${encodeURIComponent(nicknameParam)}` : "/profile"
  if (pathname === "/settings")
    return selfNickname ? `/profile?nickname=${encodeURIComponent(selfNickname)}` : "/"
  if (pathname.startsWith("/room/")) return "/lobby" // 房间准备页（playing 不在壳内，不走这里）
  return "/"
}

export function ShellBack() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const parent = getParent(
    pathname,
    searchParams.get("nickname"),
    user?.nickname
  )

  // 首页无父级 → 视觉隐去，保留等尺寸占位（顶行布局不塌）
  if (parent === null) return <div className="h-8 w-8" aria-hidden />

  return (
    <button
      aria-label="返回上一级"
      onClick={() => router.push(parent)}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/5 active:scale-[0.97]"
      title="返回上一级"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  )
}
