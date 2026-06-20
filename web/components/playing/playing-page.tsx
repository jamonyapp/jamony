"use client"

import { useEffect, useState } from "react"
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
  const { realtimeChords, pushChords } = useChatSocket(params?.id as string, user?.nickname)
  const [room, setRoom] = useState<RoomData | null>(null)
  const [chords, setChords] = useState<string[]>([])
  useEffect(() => { if (realtimeChords.length > 0) setChords(realtimeChords) }, [realtimeChords])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [audioConnected, setAudioConnected] = useState(false)
  const [roomGone, setRoomGone] = useState(false)
  const [myRole, setMyRole] = useState<"musician" | "listener">("musician")
  const [confirmTarget, setConfirmTarget] = useState<"stay" | "home" | "lobby">("stay")

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
    // 退出房间（只剩自己时自动解散）
    const rid = params?.id
    if (rid && user?.id) {
      fetch(`/api/rooms/${rid}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {})
    }
    if (target === "home") router.push("/")
    else if (target === "lobby") router.push("/lobby")
  }

  const handleReconnect = () => {
    if (!room || roomGone) return
    // 检查合奏名额
    if (room.musician_count >= room.max_musicians) {
      alert("合奏名额已满")
      return
    }
    const payload = { serverIp: room.stored_server_ip || "39.96.30.128", port: room.server_port }
    if (window.jamonyAPI) {
      window.jamonyAPI.joinRoom(payload)
    } else {
      window.postMessage({ type: "JOIN_ROOM", payload }, "*")
    }
    setAudioConnected(true)
    setMyRole("musician")
    // 更新数据库
    if (user?.id) {
      fetch(`/api/rooms/${room.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "musician" }),
      }).catch(() => {})
      fetch(`/api/rooms/${room.id}/members/${user.id}/audio-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioStatus: "connected" }),
      }).catch(() => {})
    }
  }

  const handleLaunchJamsoul = () => {
    if (!room) return
    handleReconnect()
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

      {room && !audioConnected && !roomGone && (
        <div className="flex items-center justify-center gap-3 border-b px-4 py-2" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <span className="text-sm text-white">{room.name}</span>
          <span className="text-xs" style={{ color: "#8A8A8A" }}>
            🎸 {room.musician_count}/{room.max_musicians} · 🎧 {room.listener_count}
          </span>
          <button onClick={handleLaunchJamsoul}
            className="rounded-[8px] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(90deg, #9933FF, #FF33AA)" }}>
            连接音频
          </button>
        </div>
      )}
      {room && !audioConnected && roomGone && (
        <div className="flex items-center justify-center gap-3 border-b px-4 py-2" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }}>
          <span className="text-sm" style={{ color: "#8A8A8A" }}>房间已关闭</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22%_minmax(0,1fr)_30%]">
        <div className="min-h-0 border-b lg:border-b-0 lg:border-r" style={{ borderColor: "#1A1A1A" }}>
          <LeftColumn
            onPushChord={(c) => { setChords(c); pushChords(c) }}
            audioConnected={audioConnected}
            roomGone={roomGone}
            myRole={myRole}
            roomName={room?.name}
            onDisconnect={() => { setConfirmTarget("stay"); setConfirmOpen(true) }}
            onReconnect={handleReconnect}
          />
        </div>
        <div className="min-h-0 border-b lg:border-b-0 lg:border-r" style={{ borderColor: "#1A1A1A" }}>
          <CenterColumn chords={chords} />
        </div>
        <div className="min-h-0">
          <RightColumn roomId={params?.id as string} room={room} />
        </div>
      </div>

      <DisconnectDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => doDisconnect(confirmTarget)}
      />
    </div>
  )
}
