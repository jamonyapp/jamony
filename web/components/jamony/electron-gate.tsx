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

// #2 API 版本兼容头：所有 fetch 带 X-Jamony-Version，留好接口供未来后端按版本返回不同格式
if (typeof window !== "undefined" && !(window.fetch as any)._jamonyVersionPatched) {
  const origFetch = window.fetch
  const patched = (input: any, init?: any) => {
    const headers = new Headers(init?.headers)
    if (!headers.has('X-Jamony-Version')) headers.set('X-Jamony-Version', '1.0.0')
    return origFetch(input, { ...init, headers })
  }
  ;(patched as any)._jamonyVersionPatched = true
  window.fetch = patched as any
}
