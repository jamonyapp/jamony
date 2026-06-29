"use client"

import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

export type ChatMessage = {
  id: string
  author: string
  content: string
  time: string
  isSelf?: boolean
}

export function useChatSocket(roomId?: string, nickname?: string) {
  const socketRef = useRef<Socket | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [realtimeChords, setRealtimeChords] = useState<string[]>([])
  const [realtimeTheme, setRealtimeTheme] = useState<string>("")
  const [realtimeBpm, setRealtimeBpm] = useState<number>(0)
  const [realtimeMembers, setRealtimeMembers] = useState<any[]>([])
  const [realtimeSessions, setRealtimeSessions] = useState<any[] | null>(null)
  const [realtimeRecordingActive, setRealtimeRecordingActive] = useState<boolean | null>(null)

  useEffect(() => {
    if (!roomId || !nickname) return

    const socketUrl = `${window.location.protocol}//${window.location.hostname}`
    const socket = io(socketUrl, {
      path: "/socket.io",
    })
    socketRef.current = socket

    socket.on("connect", () => {
      setConnected(true)
      socket.emit("join-room", roomId)
    })

    socket.on("chat-message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, isSelf: msg.author === nickname }])
    })

    socket.on("chords-update", (data: { chords: string[] }) => {
      setRealtimeChords(data.chords || [])
    })

    socket.on("theme-update", (data: { theme: string }) => {
      setRealtimeTheme(data.theme || "")
    })

    socket.on("bpm-update", (data: { bpm: number }) => {
      setRealtimeBpm(data.bpm || 0)
    })

    socket.on("members-update", (data: { members: any[] }) => {
      setRealtimeMembers(data.members || [])
    })

    socket.on("sessions-update", (data: { sessions: any[] }) => {
      setRealtimeSessions(data.sessions || [])
    })

    socket.on("recording-state", (data: { active: boolean }) => {
      setRealtimeRecordingActive(!!data.active)
    })

    socket.on("normalize-done", (data: { sessionId: number; trackId: number }) => {
      setRealtimeSessions((prev) => {
        if (!prev) return prev;
        return prev.map((s) =>
          s.id === data.sessionId
            ? { ...s, tracks: (s as any).tracks.map((t: any) =>
                t.id === data.trackId ? { ...t, normalized: true } : t
              )}
            : s
        );
      });
    })

    socket.on("disconnect", () => {
      setConnected(false)
    })

    return () => {
      socket.emit("leave-room", roomId)
      socket.disconnect()
      socketRef.current = null
    }
  }, [roomId, nickname])

  const sendMessage = (message: string) => {
    if (!socketRef.current || !message.trim() || !roomId) return
    const msg = message.trim()
    socketRef.current.emit("chat-message", { roomId, message: msg, author: nickname })
  }

  const pushChords = (chords: string[]) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("push-chords", { roomId, chords })
    setRealtimeChords(chords)
  }

  const pushTheme = (theme: string) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("push-theme", { roomId, theme })
    setRealtimeTheme(theme)
  }

  return { messages, sendMessage, connected, realtimeChords, pushChords, realtimeTheme, pushTheme, realtimeBpm, realtimeMembers, realtimeSessions, realtimeRecordingActive }
}
