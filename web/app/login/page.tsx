"use client"

import { LoginModal } from "@/components/jamony/login-modal"

// 1109 强登录: 登录框=jamony 第一屏——middleware 把未登录/掉线用户全部推到此页
// 门外只有验证码, 门内才是全部 jamony; 品牌句与服务号简介同稿(全站口径一致)
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4">
      <div className="flex flex-col items-center gap-4">
        <img src="/jamony_logo.png" alt="jamony" className="h-20 w-20 rounded-full object-cover" />
        <p className="text-2xl font-bold tracking-wide text-white">jamony · 即鸣</p>
        <p className="text-sm" style={{ color: "#8A8A8A" }}>更低延迟的线上合奏社区</p>
      </div>
      <LoginModal embedded />
    </div>
  )
}
