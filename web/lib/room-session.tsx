"use client"

// 全局房间会话 Provider（10-06 漫游改造）
// "房间在场"语义从「playing 页在场」升级为「客户端在场」：
// - 心跳每 60s（musician/listener 都发），离开 playing 页漫游也不断
// - 服务端 L2 兜底交叉验证心跳：socket断+心跳活=漫游保房；心跳也停=真失联才清
// - 顶栏「回到房间/断开房间」按钮（非 playing 页）的数据源
// - disconnectRoom()：断开原房间工具函数（断开按钮/切换房间/建房切换/退出登录 四处共用）
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-context"

type RoomSession = {
  code: string
  name: string
  role: "musician" | "listener"
  hostId: number
  musicianCount?: number  // 唯一合奏者判定（漫游态叉 jamsoul 分流用）
}

type RoomSessionContextValue = {
  session: RoomSession | null
  refresh: () => Promise<void>
  setRole: (role: "musician" | "listener") => void
  disconnectRoom: () => Promise<void>
  // 听众收听全局化（10-07 漫游续听）：音频元素+Analyser 常驻 Provider，漫游不断流
  listening: number | null            // 正在收听的房间端口
  pausedPort: number | null           // 被 playbar 竞权暂停的端口（可恢复）
  startListening: (port: number) => void
  stopListening: () => void
  pauseForPlayback: () => void        // 竞权让路：暂停收听记住端口
  resumeListening: () => void
  analyserRef: React.RefObject<AnalyserNode | null>  // LevelMeter 画图消费
}

const RoomSessionContext = createContext<RoomSessionContextValue>({
  session: null,
  refresh: async () => {},
  setRole: () => {},
  disconnectRoom: async () => {},
  listening: null,
  pausedPort: null,
  startListening: () => {},
  stopListening: () => {},
  pauseForPlayback: () => {},
  resumeListening: () => {},
  analyserRef: { current: null },
})

export const useRoomSession = () => useContext(RoomSessionContext)

export function RoomSessionProvider({ children }: { children: React.ReactNode }) {
  const { user, loggedIn, ready } = useAuth()
  const pathname = usePathname()
  const [session, setSession] = useState<RoomSession | null>(null)

  // ===== 听众收听全局化（10-07）=====
  const [listening, setListening] = useState<number | null>(null)
  const [pausedPort, setPausedPort] = useState<number | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // 常驻音频图：audio + MediaElementSource + Analyser（建一次，漫游不拆）
  useEffect(() => {
    const audio = new Audio()
    audio.preload = "none"
    audio.crossOrigin = "anonymous"
    audio.volume = 0.8
    let ctx: AudioContext | null = null
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const src = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 32
      src.connect(analyser)
      analyser.connect(ctx.destination)
      analyserRef.current = analyser
    } catch (e) {
      console.log("[room-session] web audio init failed:", e)
    }
    audioElRef.current = audio
    audioCtxRef.current = ctx
    return () => {
      audio.pause()
      audio.src = ""
      ctx?.close()
      audioElRef.current = null
      audioCtxRef.current = null
      analyserRef.current = null
    }
  }, [])

  // listening 驱动播放/停止（Icecast 流）
  useEffect(() => {
    const audio = audioElRef.current
    const ctx = audioCtxRef.current
    if (!audio) return
    if (listening != null) {
      audio.src = `${window.location.protocol}//${window.location.hostname}/stream/room-${listening}`
      ctx?.resume().then(() => audio.play().catch((e: Error) => console.log("[icecast] play:", e.message)))
    } else {
      audio.pause()
      audio.src = ""
    }
  }, [listening])

  const startListening = useCallback((port: number) => {
    setPausedPort(null)
    setListening(port)
  }, [])
  const stopListening = useCallback(() => {
    setPausedPort(null)
    setListening(null)
  }, [])
  // playbar 竞权让路：暂停收听并记住端口（playbar 停止后不自动恢复，手动点"继续收听"）
  const pauseForPlayback = useCallback(() => {
    setListening(prev => {
      if (prev != null) setPausedPort(prev)
      return null
    })
  }, [])
  const resumeListening = useCallback(() => {
    setPausedPort(prev => {
      if (prev != null) setListening(prev)
      return null
    })
  }, [])
  // ===== 收听全局化完 =====

  const refresh = useCallback(async () => {
    if (!loggedIn) { setSession(null); return }
    try {
      const r = await fetch("/api/my-active-room", { credentials: "include" })
      const d = await r.json()
      if (d.ok && d.room) {
        setSession({ code: d.room.room_code, name: d.room.name, role: d.room.role, hostId: d.room.host_id, musicianCount: d.room.musician_count })
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

  // 漫游中叉掉 jamsoul 窗口：与 playing 页在场行为对齐（10-07 欢哥拍板）
  // 唯一合奏者 → leave 房间解散；非唯一合奏者 → 切听众（session 保留、心跳降级，回来还能听）
  // playing 页在场时页面有自己的处理与弹窗，这里只管漫游态（pathname 排除 playing）
  useEffect(() => {
    if (/^\/room\/[^/]+\/playing/.test(pathname || "")) return
    const cleanup = window.jamonyAPI?.onJamsoulExited?.(() => {
      if (!session || session.role !== "musician") return
      const uid = user?.id
      const s = session
      window.jamonyAPI?.killJamsoul?.()
      if (!uid) return
      if (s.musicianCount === 1) {
        // 唯一合奏者：房间解散
        setSession(null)
        fetch(`/api/rooms/${s.code}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid }),
          credentials: "include",
        }).catch(() => {})
      } else {
        // 非唯一合奏者：切听众
        setSession(prev => (prev ? { ...prev, role: "listener" } : prev))
        fetch(`/api/rooms/${s.code}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, role: "listener" }),
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
  // 听众断房同时停收听流（10-07）
  const disconnectRoom = useCallback(async () => {
    const s = session
    if (!s) return
    setSession(null)
    stopListening()
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
  }, [session, user?.id, stopListening])

  return (
    <RoomSessionContext.Provider
      value={{ session, refresh, setRole, disconnectRoom, listening, pausedPort, startListening, stopListening, pauseForPlayback, resumeListening, analyserRef }}
    >
      {children}
    </RoomSessionContext.Provider>
  )
}
