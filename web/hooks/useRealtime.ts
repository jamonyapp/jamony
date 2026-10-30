import { useEffect, useRef } from "react"
import { io } from "socket.io-client"

type RealtimeOpts = {
  /** 兜底轮询间隔（ms）；不传=不轮询（事件为主，如高光/作品库/官方动态） */
  pollMs?: number
  /** 重拉上下文依赖（如 [user?.id] 登录态变化须重拉 isLiked）；不传=挂载一次 */
  deps?: unknown[]
}

// 1030 实时化通用 hook（rooms-changed 模式第三次复制即抽象，欢哥 1030 拍板）：
// 全局广播事件（rooms-changed/board-changed/works-changed）→ 300ms 防抖重拉
// + focus/visibility 即时重拉（治 Electron 后台定时器节流，回来第一眼必新鲜）
// + 可选兜底轮询（socket 要登录态，未登录访客靠它；也兜到期类读时过滤无事件的场景）。
// 同 url+path 的 io() 自动多路复用同一 Manager——首页同屏多组件挂本 hook 不会连接风暴。
// 事件只管「结构性变化秒级」；计数类（播放/点赞/评论数）维持既有轮询节奏，别往发射点加。
export function useRealtime(events: string | string[], refetch: () => void, opts: RealtimeOpts = {}) {
  const ref = useRef(refetch)
  ref.current = refetch
  useEffect(() => {
    const fetchNow = () => ref.current()
    fetchNow()
    const t = opts.pollMs ? setInterval(fetchNow, opts.pollMs) : null
    const socketUrl = `${window.location.protocol}//${window.location.hostname}`
    const socket = io(socketUrl, { path: "/socket.io" })
    let debounce: ReturnType<typeof setTimeout> | null = null
    const bump = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(fetchNow, 300) }
    for (const ev of Array.isArray(events) ? events : [events]) socket.on(ev, bump)
    const onWake = () => { if (document.visibilityState === "visible") fetchNow() }
    window.addEventListener("focus", onWake)
    document.addEventListener("visibilitychange", onWake)
    return () => {
      if (t) clearInterval(t)
      socket.disconnect()
      window.removeEventListener("focus", onWake)
      document.removeEventListener("visibilitychange", onWake)
      if (debounce) clearTimeout(debounce)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps ?? [])
}
