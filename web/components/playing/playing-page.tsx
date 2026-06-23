"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { TopNav } from "@/components/jamony/top-nav"
import { LeftColumn } from "@/components/playing/left-column"
import { CenterColumn } from "@/components/playing/center-column"
import { RightColumn } from "@/components/playing/right-column"
import { DisconnectDialog } from "@/components/playing/disconnect-dialog"
import { useAuth } from "@/lib/auth-context"
import { useChatSocket } from "@/lib/chat-socket"

declare global {
  interface Window {
    jamonyAPI?: {
      joinRoom: (p: { serverIp: string; port: number }) => void
      killJamsoul: () => void
      onJamsoulLaunched: (cb: (data: unknown) => void) => void
    }
  }
}

type RoomData = {
  id: number
  name: string
  description: string
  style: string
  host_id: number
  host_name: string
  server_port: number
  stored_server_ip?: string
  musician_count: number
  listener_count: number
  max_musicians: number
}

export function PlayingPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { realtimeChords, pushChords, realtimeTheme, pushTheme, realtimeBpm } = useChatSocket(params?.id as string, user?.nickname)
  const [room, setRoom] = useState<RoomData | null>(null)
  const [chords, setChords] = useState<string[]>([])
  const [customTheme, setCustomTheme] = useState("")
  const [chordTextFromPush, setChordTextFromPush] = useState("")
  const [currentBpm, setCurrentBpm] = useState(0)
  const [listenerActive, setListenerActive] = useState(false)
  useEffect(() => { if (realtimeChords.length > 0) { setChords(realtimeChords); setChordTextFromPush(realtimeChords.join(' ')) } }, [realtimeChords])
  useEffect(() => { if (realtimeTheme) setCustomTheme(realtimeTheme) }, [realtimeTheme])
  const initBpmRef = useRef(false)
  const BUILD_VERSION = "2026-06-23-v3"
  useEffect(() => {
    if (realtimeBpm > 0) { setCurrentBpm(realtimeBpm); initBpmRef.current = true }
    else if (initBpmRef.current && realtimeBpm === 0) setCurrentBpm(0)
  }, [realtimeBpm])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [audioConnected, setAudioConnected] = useState(false)
  const [roomGone, setRoomGone] = useState(false)
  const [myRole, setMyRole] = useState<"musician" | "listener">("musician")
  const [refreshTrigger, setRefreshTrigger] = useState(0) // v2 - listenerActive cleanup
  const [confirmTarget, setConfirmTarget] = useState<"stay" | "home" | "lobby">("stay")
  const [listenerKey, setListenerKey] = useState(0)
  const pendingSwitchRef = useRef(false) // v3 — 监听→合奏切换：Icecast 停干净后再启动 jamsoul

  // v3: 提取 launchJamsoul 为可复用的回调，供 useEffect 和 handleReconnect 共用
  const launchJamsoul = useCallback(() => {
    if (!room) return
    const payload = { serverIp: room.stored_server_ip || "39.96.30.128", port: room.server_port }
    if (window.jamonyAPI) { window.jamonyAPI.joinRoom(payload) }
    else { window.postMessage({ type: "JOIN_ROOM", payload }, "*") }
    setAudioConnected(true)
    setMyRole("musician")
    if (user?.id && room?.id) {
      fetch(`/api/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "musician" }),
      }).then(() => {
        setRefreshTrigger(n => n + 1)
        fetch(`/api/rooms/${room.id}`).then(r => r.json()).then(d => {
          if (d.ok) setRoom(prev => prev ? {...prev, musician_count: d.room.musician_count, listener_count: d.room.listener_count} : prev)
        })
      }).catch(() => {})
    }
  }, [room, user?.id])

  // v3: Icecast 停干净后再启动 jamsoul（事件驱动，不用 setTimeout）
  useEffect(() => {
    if (!listenerActive && pendingSwitchRef.current) {
      pendingSwitchRef.current = false
      launchJamsoul()
    }
  }, [listenerActive, launchJamsoul])

  // 从 API 读取房间数据 + 检测用户角色
  useEffect(() => {
    const roomId = params?.id
    if (!roomId || !user?.id) return
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const roomData = {
            ...data.room,
            stored_server_ip: "39.96.30.128",
          }
          setRoom(roomData)
          // 检测当前用户在房间的角色
          const me = (data.members || []).find((m: any) => m.user_id === user.id)
          const role = me?.role || "musician"
          setMyRole(role)

          // 加载已保存的房间主题
          if (data.room.current_theme) setCustomTheme(data.room.current_theme)
          // 加载已保存的和弦进程
          if (data.room.current_chords) setChords(data.room.current_chords.split(' '))
          if (data.room.current_bpm) setCurrentBpm(data.room.current_bpm)

          // 仅合奏者自动调起 jamsoul
          if (role === "musician") {
            setTimeout(() => {
              const payload = { serverIp: "39.96.30.128", port: roomData.server_port }
              if (window.jamonyAPI) {
                window.jamonyAPI.joinRoom(payload)
              } else {
                window.postMessage({ type: "JOIN_ROOM", payload }, "*")
              }
              setAudioConnected(true)
              // 更新音频状态到数据库
              fetch(`/api/rooms/${roomId}/members/${user.id}/audio-status`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ audioStatus: "connected" }),
              }).catch(() => {})
            }, 500)
          }
        }
      })
      .catch(() => {})
  }, [params?.id, user?.id])

  const doDisconnect = (target: "stay" | "home" | "lobby") => {
    setConfirmOpen(false)
    window.jamonyAPI?.killJamsoul?.()
    setAudioConnected(false)
    const rid = params?.id
    if (!rid || !user?.id) return

    if (target === "stay") {
      // 断开但不离开页面 → 切换为听众
      setMyRole("listener")
      setListenerActive(false)  // 停 Icecast，回来时显示"开始收听"
      setListenerKey(n => n + 1)
      fetch(`/api/rooms/${rid}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "listener" }),
      }).then(() => {
        setRefreshTrigger(n => n + 1)
        // 重新拉取房间数据
        fetch(`/api/rooms/${rid}`).then(r => r.json()).then(d => {
          if (d.ok) setRoom(prev => prev ? {...prev, musician_count: d.room.musician_count, listener_count: d.room.listener_count} : prev)
        })
      }).catch(() => {})
    } else {
      // 离开房间
      fetch(`/api/rooms/${rid}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      }).then(() => setRoomGone(true)).catch(() => {})
      if (target === "home") router.push("/")
      else if (target === "lobby") router.push("/lobby")
    }
  }

  const handleReconnect = () => {
    if (!room || roomGone) return
    if (room.musician_count >= room.max_musicians) {
      alert("合奏名额已满")
      return
    }

    // v3: 如果正在收听 Icecast，先停掉 → useEffect 监听 listenerActive=false 后自动 launchJamsoul
    if (listenerActive) {
      pendingSwitchRef.current = true
      setListenerActive(false)
      setListenerKey(n => n + 1)
    } else {
      launchJamsoul()
    }
  }

  
  return (
    <div className="flex h-screen flex-col pt-11 bg-black">
      <TopNav
        onBackHome={() => {
          if (roomGone) { window.location.href = "/"; return }
          if (audioConnected || myRole === "listener") { setConfirmTarget("home"); setConfirmOpen(true) }
          else window.location.href = "/"
        }}
        backLinks={[{
          label: "返回大厅",
          href: "/lobby",
          onClick: () => {
            if (roomGone) { window.location.href = "/lobby"; return }
            if (audioConnected || myRole === "listener") { setConfirmTarget("lobby"); setConfirmOpen(true) }
            else window.location.href = "/lobby"
          },
        }]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22%_minmax(0,1fr)_30%]">
        <div className="min-h-0 border-b lg:border-b-0 lg:border-r" style={{ borderColor: "#1A1A1A" }}>
          <LeftColumn
            onPushChord={(c) => { setChords(c); pushChords(c) }}
            onPushTheme={(t) => { setCustomTheme(t); pushTheme(t) }}
            customTheme={customTheme}
            chordTextFromPush={chordTextFromPush}
            realtimeBpm={realtimeBpm}
            audioConnected={audioConnected}
            roomGone={roomGone}
            myRole={myRole}
            roomName={room?.name}
            roomPort={room?.server_port}
            listenerActive={listenerActive}
            listenerKey={listenerKey}
            buildVersion={BUILD_VERSION}
            onStartListening={() => setListenerActive(p => !p)}
            onDisconnect={() => { setConfirmTarget("stay"); setConfirmOpen(true) }}
            onReconnect={handleReconnect}
          />
        </div>
        <div className="min-h-0 border-b lg:border-b-0 lg:border-r" style={{ borderColor: "#1A1A1A" }}>
          <CenterColumn chords={chords} customTheme={customTheme} currentBpm={currentBpm} />
        </div>
        <div className="min-h-0">
          <RightColumn roomId={params?.id as string} room={room} refreshTrigger={refreshTrigger} />
        </div>
      </div>

      {null}
      <DisconnectDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => doDisconnect(confirmTarget)}
        isListener={myRole === "listener" && !audioConnected}
      />
    </div>
  )
}
