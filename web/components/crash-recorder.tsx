"use client"

import { useEffect } from "react"

/* ============ 黑匣子（1031 发表黑屏排障，欢哥拍板读不猜）============
 * 渲染进程死法成谜（无 Crashpad/无 .ips/无统一日志=干净击杀），console 随进程陪葬。
 * 方案：window error/unhandledrejection + 手动阶段面包屑 → localStorage 环形缓冲（30 条）。
 * localStorage 跨进程死亡存活；本组件挂载时若发现上次残留 → 倾倒进 console（warn 级）→ 清空。
 * 面包屑入口：window.__jamonyLog(msg)（center-column 发表链路打点）。
 */
const KEY = "jamony-crash-ring"
const MAX = 30

function readRing(): string[] {
  try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(r) ? r : [] } catch { return [] }
}

export function CrashRecorder() {
  useEffect(() => {
    const prev = readRing()
    if (prev.length > 0) {
      console.warn(`[jamony-crash-ring] ⬇︎ 上次会话临终记录（${prev.length} 条，已清空，请完整抄送排障）`)
      prev.forEach(l => console.warn("  " + l))
      try { localStorage.setItem(KEY, "[]") } catch {}
    }
    const push = (line: string) => {
      const r = readRing()
      r.push(`${new Date().toISOString().slice(11, 23)} ${line}`)
      while (r.length > MAX) r.shift()
      try { localStorage.setItem(KEY, JSON.stringify(r)) } catch {}
    }
    ;(window as unknown as { __jamonyLog?: (m: string) => void }).__jamonyLog = (m: string) => {
      push(m)
      console.debug("[jamony-log]", m)
    }
    push("boot")
    const onErr = (e: ErrorEvent) => push(`ERROR ${e.message} @ ${String(e.filename).split("/").pop()}:${e.lineno}:${e.colno}`)
    const onRej = (e: PromiseRejectionEvent) => push(`REJECT ${String(e.reason)}`)
    window.addEventListener("error", onErr)
    window.addEventListener("unhandledrejection", onRej)
    return () => {
      window.removeEventListener("error", onErr)
      window.removeEventListener("unhandledrejection", onRej)
    }
  }, [])
  return null
}
