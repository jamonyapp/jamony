"use client"

import { useEffect, type ReactNode } from "react"

/**
 * 强制客户端 only：非 Electron 客户端（普通浏览器）访问 → 重定向官网下载页。
 * Electron 的 User-Agent 自带 "Electron" 字样，检测到即放行。
 * 这段逻辑在前端跑（服务器页面），不是改 Electron 客户端。
 */
export function ElectronGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.userAgent.includes("Electron")) {
      window.location.href = "https://jamonyapp.com"
    }
  }, [])
  return <>{children}</>
}
