"use client"

// 全局房间会话 Provider（10-06 漫游改造）
// "房间在场"语义从「playing 页在场」升级为「客户端在场」：
// - 心跳每 60s（musician/listener 都发），离开 playing 页漫游也不断
// - 服务端 L2 兜底交叉验证心跳：socket断+心跳活=漫游保房；心跳也停=真失联才清
// - 顶栏「回到房间/断开房间」按钮（非 playing 页）的数据源
// - disconnectRoom()：断开原房间工具函数（断开按钮/切换房间/建房切换/退出登录 四处共用）
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

type RoomSession = {
  code: string
  name: string
  role: "musician" | "listener"
  hostId: number
}

type RoomSessionContextValue = {
  session: RoomSession | null
  refresh: () => Promise<void>
  setRole: (role: "musician" | "listener") => void
  disconnectRoom: () => Promise<void>
}

const RoomSessionContext = createContext<RoomSessionContextValue>({
  session: null,
  refresh: async () => {},
  setRole: () => {},
  disconnectRoom: async () => {},
})

export const useRoomSession = () => useContext(RoomSessionContext)

export function RoomSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, loggedIn, ready } = useAuth()
  const pathname = usePathname()
  const [session, setSession] = useState<RoomSession | null>(null)

  const refresh = useCallback(async () => {
    if (!loggedIn) { setSession(null); return }
    try {
      const r = await fetch("/api/my-active-room", { credentials: "include" })
      const d = await r.json()
      if (d.ok && d.room) {
        setSession({ code: d.room.room_code, name: d.room.name, role: d.room.role, hostId: d.room.host_id })
      } else {
        setSession(null)
      }
    } catch {}
  }, [loggedIn])

  // auth 就绪后查一次（登录/登出/页面刷新恢复）
  useEffect(() => { if (ready) refresh() }, [ready, refresh])

  // 10-07 修漫游退出丢 leave：主进程 currentRoom 改为跟随全局 session 生命周期
  // （原绑在 playing 页 unmount 上，漫游改造后"离开playing页≠离开房间"，卸载清空导致
  //   漫游态关 app 时 sendLeaveRequest 静默跳过，只能靠 L2 60s+ 兜底）
  useEffect(() => {
    if (session) window.jamonyAPI?.enterRoom?.({ roomCode: session.code, userId: user?.id ?? 0 })
    else window.jamonyAPI?.leaveRoom?.()
  }, [session?.code])

  // 全局心跳：有活跃房间就发，60s 一拍首拍立即
  // 403=已不在房间 404=房间没了 → 停心跳清状态（被清/房解散）
  useEffect(() => {
    if (!session || !loggedIn) return
    const code = session.code
    const beat = () => {
      fetch(`/api/rooms/${code}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
        .then(r => {
          if (r.status === 403 || r.status === 404) setSession(null)
        })
        .catch(() => {})
    }
    beat()
    const t = setInterval(beat, 60000)
    return () => clearInterval(t)
  }, [session?.code, loggedIn])

  // 漫游中叉掉 jamsoul 窗口：音频在场结束 → 按断开处理（leave，唯一合奏者解散由服务端统一判）
  // playing 页在场时页面有自己的处理与弹窗，这里只管漫游态（pathname 排除 playing）
  useEffect(() => {
    if (/^\/room\/[^/]+\/playing/.test(pathname || "")) return
    const cleanup = window.jamonyAPI?.onJamsoulExited?.(() => {
      if (!session || session.role !== "musician") return
      const uid = user?.id
      const code = session.code
      setSession(null)
      window.jamonyAPI?.killJamsoul?.()
      if (uid) {
        fetch(`/api/rooms/${code}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
          credentials: "include",
        }).catch(() => {})
      }
    })
    return () => { cleanup?.() }
  }, [pathname, session, user?.id])

  // playing 页内身份切换（断开连接→切听众 / 重连→合奏）时同步给全局
  const setRole = useCallback((role: "musician" | "listener") => {
    setSession(s => (s ? { ...s, role } : s))
  }, [])

  // 断开原房间：musician 杀 jamsoul；两身份都 leave（唯一合奏者解散由服务端 removeMemberAndCheckDissolve 判）
  const disconnectRoom = useCallback(async () => {
    const s = session
    if (!s) return
    setSession(null)
    if (s.role === "musician") window.jamonyAPI?.killJamsoul?.()
    if (user?.id) {
      try {
        await fetch(`/api/rooms/${s.code}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
          credentials: "include",
        })
      } catch {}
    }
  }, [session, user?.id])

  return (
    <RoomSessionContext.Provider value={{ session, refresh, setRole, disconnectRoom }}>
      {children}
    </RoomSessionContext.Provider>
  )
}
