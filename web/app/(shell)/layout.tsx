"use client"

import { Suspense } from "react"
import { LeftSidebar } from "@/components/jamony/left-sidebar"
import { ShellBack } from "@/components/jamony/shell-back"
import { UserCluster } from "@/components/jamony/user-cluster"

// (shell) 壳布局 —— 09-27 左栏常驻改造（欢哥版：无顶栏）
// 左栏全高常驻；舞台区顶部一条固定不滚动的横行：左端返回箭头 + 右端用户簇（刷新/消息/头像）。
// 合奏页 /room/[code]/playing 在本组之外（app/room），保持全屏工作台零改动。
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <LeftSidebar />

      {/* 固定横行：不随内容滚动；黑→透明渐变 scrim 让滚动内容从底下穿过不扎眼 */}
      <div
        className="fixed left-60 right-0 top-0 z-50 flex h-11 items-center justify-between px-4"
        style={{ background: "linear-gradient(to bottom, #000000 70%, rgba(0,0,0,0))" }}
      >
        {/* useSearchParams 需 Suspense 边界（Next 预渲染要求），占位与按钮同尺寸防跳动 */}
        <Suspense fallback={<div className="h-8 w-8" />}>
          <ShellBack />
        </Suspense>
        <UserCluster onRefresh={() => window.location.reload()} />
      </div>

      <main className="ml-60 min-h-screen pt-11">{children}</main>
    </>
  )
}
