"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { TopNav } from "@/components/jamony/top-nav"
import { LeftColumn } from "@/components/playing/left-column"
import { CenterColumn } from "@/components/playing/center-column"
import { RightColumn } from "@/components/playing/right-column"
import { DisconnectDialog } from "@/components/playing/disconnect-dialog"
import { KickConfirmDialog } from "@/components/playing/kick-confirm-dialog"
import { KickedDialog } from "@/components/playing/kicked-dialog"
import { DissolvedDialog } from "@/components/playing/dissolved-dialog"
import { BecomeHostDialog } from "@/components/playing/become-host-dialog"
import { ShareRoomHintDialog } from "@/components/playing/share-room-hint-dialog"
import { useAuth } from "@/lib/auth-context"
import { useChatSocket } from "@/lib/chat-socket"

declare global {
  interface Window {
    jamonyAPI?: {
      joinRoom: (p: { serverIp: string; port: number; nickname?: string }) => void
      killJamsoul: () => void
      onJamsoulLaunched: (cb: (data: unknown) => void) => void
      onJamsoulExited?: (cb: (data: unknown) => void) => void
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
  is_private: boolean
  room_code: string
  password?: string  // 加密房明文密码（成员/房主可见，用于分享房间）
  server_port: number
  stored_server_ip?: string
  musician_count: number
  listener_count: number
  max_musicians: number
}

export function PlayingPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { realtimeChords, pushChords, realtimeTheme, pushTheme, realtimeBpm, realtimeMembers, realtimeHostId, realtimeSessions, realtimeRecordingActive, kickedEvent, dissolvedEvent } = useChatSocket(params?.code as string, user?.nickname)
  const [room, setRoom] = useState<RoomData | null>(null)
  const [showShareHint, setShowShareHint] = useState(false)
  // 建房跳转带 ?new=1 → 弹分享引导窗（room 加载完才弹），并清掉 query 避免刷新重复弹
  useEffect(() => {
    if (searchParams?.get("new") === "1") {
      setShowShareHint(true)
      router.replace(`/room/${params?.code}/playing`)
    }
  }, [searchParams])
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
  const killingRef = useRef(false) // 主动杀 jamsoul 标记（doDisconnect 主动杀时 true，jamsoul-exited 不重复 alert）

  // 踢人相关：房主踢人确认 + 自己被踢通知
  const [kickTarget, setKickTarget] = useState<{ user_id: number; nickname: string } | null>(null)
  const [kickOpen, setKickOpen] = useState(false)
  const [kickedOpen, setKickedOpen] = useState(false)
  const kickedHandledRef = useRef(false) // 双 socket 实例都会收到 member-kicked，幂等防重复处理
  const [dissolvedOpen, setDissolvedOpen] = useState(false)
  const dissolvedHandledRef = useRef(false) // 房间解散广播全员收到，幂等防重复处理

  // 房主转移：effectiveHostId 实时跟随 broadcastMembers 的 hostId；转移给自己时弹通知
  const effectiveHostId = realtimeHostId ?? room?.host_id
  const [becomeHostOpen, setBecomeHostOpen] = useState(false)
  const prevHostIdRef = useRef<number | null>(null)

  // v3: 提取 launchJamsoul 为可复用的回调，供 useEffect 和 handleReconnect 共用
  const launchJamsoul = useCallback(() => {
    if (!room) return
    const payload = { serverIp: room.stored_server_ip || "39.96.30.128", port: room.server_port, nickname: user?.nickname }
    if (window.jamonyAPI) { window.jamonyAPI.joinRoom(payload) }
    else { window.postMessage({ type: "JOIN_ROOM", payload }, "*") }
    setAudioConnected(true)
    setMyRole("musician")
    if (user?.id && room?.id) {
      fetch(`/api/rooms/${room.room_code}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "musician" }),
      }).then(() => {
        setRefreshTrigger(n => n + 1)
        fetch(`/api/rooms/${room.room_code}`).then(r => r.json()).then(d => {
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
    const roomId = params?.code
    if (!roomId || !user?.id) return
    fetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          const roomData = {
            ...data.room,
            stored_server_ip: "39.96.30.128",
          }
          // 加密房非成员（GET 返回 server_port=null）→ 回详情页输密码
          if (roomData.is_private && !roomData.server_port) {
            router.replace(`/room/${roomId}`)
            return
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
              const payload = { serverIp: "39.96.30.128", port: roomData.server_port, nickname: user?.nickname }
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
  }, [params?.code, user?.id])

  const doDisconnect = (target: "stay" | "home" | "lobby") => {
    setConfirmOpen(false)
    killingRef.current = true  // 标记主动杀，jamsoul-exited 不重复 alert
    window.jamonyAPI?.killJamsoul?.()
    setAudioConnected(false)
    const rid = params?.code
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

  // 房主踢人
  const doKick = () => {
    if (!kickTarget || !room) return
    const target = kickTarget
    setKickOpen(false)
    setKickTarget(null)
    fetch(`/api/rooms/${room.room_code}/kick`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId: target.user_id }),
    }).then(r => r.json()).then(() => {
      // 成员列表靠 members-update 自动刷新，无需手动 setRefreshTrigger
    }).catch(() => {})
  }

  // jamony: 退出 jamony（页面 unload）→ leave 房间（服务器清理 room_members + 进程，避免房间残留回不去）
  useEffect(() => {
    const handler = () => {
      const rid = params?.code
      if (rid && user?.id && (myRole === "musician" || myRole === "listener")) {
        fetch(`/api/rooms/${rid}/leave`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }), keepalive: true,
        }).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [myRole, params, user])

  // jamsoul 子进程退出（用户叉掉/直接退出 jamsoul）→ 感知 + 切听众（主动杀时不 alert）
  useEffect(() => {
    const cleanup = window.jamonyAPI?.onJamsoulExited?.(() => {
      if (killingRef.current) { killingRef.current = false; return }  // doDisconnect 主动杀，不重复 alert
      if (!audioConnected) return
      setAudioConnected(false)
      setMyRole("listener")
      setListenerActive(false)
      setListenerKey(n => n + 1)
      const rid = params?.code
      if (rid && user?.id) {
        fetch(`/api/rooms/${rid}/join`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, role: "listener" }),
        }).then(() => setRefreshTrigger(n => n + 1)).catch(() => {})
      }
      alert("jamsoul 已关闭，已切换为听众身份")
    })
    return cleanup
  }, [audioConnected, params, user])

  // 收到 member-kicked 事件：若是自己被踢 → 断音频 + 弹通知（幂等）
  useEffect(() => {
    if (!kickedEvent || !user) return
    if (kickedEvent.userId !== user.id || kickedHandledRef.current) return
    kickedHandledRef.current = true
    // 合奏者杀 jamsoul 进程；听众停 Icecast 收听
    if (myRole === "musician") {
      window.jamonyAPI?.killJamsoul?.()
      setAudioConnected(false)
    } else {
      setListenerActive(false)
      setListenerKey(n => n + 1)
    }
    setKickedOpen(true)
  }, [kickedEvent, user, myRole])

  // 收到 room-dissolved 事件：房间解散（最后合奏者退出）→ 断音频 + 弹通知 + 跳大厅（全员收到，幂等）
  useEffect(() => {
    if (!dissolvedEvent || dissolvedHandledRef.current) return
    dissolvedHandledRef.current = true
    // 合奏者杀 jamsoul 进程；听众停 Icecast 收听
    if (myRole === "musician") {
      window.jamonyAPI?.killJamsoul?.()
      setAudioConnected(false)
    } else {
      setListenerActive(false)
      setListenerKey(n => n + 1)
    }
    setDissolvedOpen(true)
  }, [dissolvedEvent, myRole])

  // 房主转移感知：hostId 变化且新房主是自己（且之前不是）→ 弹「你已成为房主」
  useEffect(() => {
    if (effectiveHostId == null || !user) return
    if (prevHostIdRef.current !== null
      && prevHostIdRef.current !== effectiveHostId
      && effectiveHostId === user.id
      && prevHostIdRef.current !== user.id) {
      setBecomeHostOpen(true)
    }
    prevHostIdRef.current = effectiveHostId
  }, [effectiveHostId, user])


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
          <CenterColumn
            chords={chords}
            customTheme={customTheme}
            currentBpm={currentBpm}
            roomId={params?.code as string}
            myRole={myRole}
            currentUserId={user?.id}
            roomName={room?.name || ""}
            roomStyle={room?.style || ""}
            realtimeSessions={realtimeSessions}
            realtimeRecordingActive={realtimeRecordingActive}
          />
        </div>
        <div className="min-h-0">
          <RightColumn roomId={params?.code as string} room={room} refreshTrigger={refreshTrigger} realtimeMembers={realtimeMembers} currentUserId={user?.id} hostId={effectiveHostId} onKick={(m) => { setKickTarget({ user_id: m.user_id, nickname: m.nickname }); setKickOpen(true) }} />
        </div>
      </div>

      {null}
      <DisconnectDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => doDisconnect(confirmTarget)}
        isListener={myRole === "listener" && !audioConnected}
      />
      <KickConfirmDialog
        open={kickOpen}
        nickname={kickTarget?.nickname}
        onCancel={() => { setKickOpen(false); setKickTarget(null) }}
        onConfirm={doKick}
      />
      <KickedDialog
        open={kickedOpen}
        onConfirm={() => { setKickedOpen(false); router.replace("/lobby") }}
      />
      <DissolvedDialog
        open={dissolvedOpen}
        onConfirm={() => { setDissolvedOpen(false); router.replace("/lobby") }}
      />
      <BecomeHostDialog
        open={becomeHostOpen}
        onConfirm={() => setBecomeHostOpen(false)}
      />
      <ShareRoomHintDialog
        open={showShareHint && !!room}
        room={room}
        onClose={() => setShowShareHint(false)}
      />
    </div>
  )
}
