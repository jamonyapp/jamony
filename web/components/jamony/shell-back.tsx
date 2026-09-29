"use client"

import { ArrowLeft } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

// 返回父级表：每条路由的上一级；首页 → null（按钮禁用变暗）
// 09-27 左栏常驻改造：全站统一的返回箭头（欢哥设计：纯图标无文字，首页变暗不可点）
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
  const disabled = parent === null

  return (
    <button
      aria-label={disabled ? "已在首页" : "返回上一级"}
      disabled={disabled}
      onClick={() => parent && router.push(parent)}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        disabled
          ? "cursor-default opacity-30"
          : "text-white hover:bg-white/5 active:scale-[0.97]"
      }`}
      title={disabled ? undefined : "返回上一级"}
    >
      <ArrowLeft className="h-[18px] w-[18px]" />
    </button>
  )
}
