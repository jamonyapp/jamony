"use client"

import { ArrowLeft } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

// 返回父级表：每条路由的上一级；首页 → null（按钮禁用变暗）
// 09-27 左栏常驻改造：全站统一的返回箭头（欢哥设计：纯图标无文字，首页变暗不可点）
function getParent(
  pathname: string,
  typeParam: string | null,
  nicknameParam: string | null,
  selfNickname?: string
): string | null {
  if (pathname === "/") return null
  if (pathname === "/lobby")
    return typeParam === "public" || typeParam === "private" ? "/lobby" : "/"
  if (pathname === "/board" || pathname === "/library" || pathname === "/profile") return "/"
  if (pathname === "/library/category") return "/library"
  if (pathname.startsWith("/library/")) {
    // 作品详情：来源是筛选页（track-card 跳转前 sessionStorage 标记 libFrom="filter"）→返回筛选，否则返回作品库
    if (typeof window !== "undefined" && sessionStorage.getItem("libFrom") === "filter")
      return "/library/category"
    return "/library"
  }
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
    searchParams.get("type"),
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
