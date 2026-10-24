"use client"

import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import type { GpMix, RoomScore } from "@/lib/jam-data"

export type GpState = { playing: boolean; startedAt?: string; startMs?: number; speed?: number; countInMs?: number; endMs?: number }

// program 背景轨（1015）：物料（轨+混音快照）与走带态分离——对照 current_score/gp_state 双通道模式
export type ProgramTrack = { id: string; name: string; file: string; size: number; uploadedBy: number; uploadedByName: string }
export type ProgramMix = { vols: Record<string, number>; mutes: string[]; solos?: string[]; pans?: Record<string, number>; master?: number }
// vols 0-200（100=0dB 原声，200=+6dB 头空间——1016 欢哥拍板对齐录音混音器 DAW 级）；pans -1~1；master 0-200 同 vols 口径
export type ProgramData = { tracks: ProgramTrack[]; mix: ProgramMix; totalMs?: number } | null
export type ProgramState = { playing: boolean; startedAt?: string; startMs?: number; totalMs?: number }

export type ChatMessage = {
  id: string
  author: string
  avatarUrl?: string
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
  const [realtimeScore, setRealtimeScore] = useState<RoomScore | null>(null)
  const [realtimeGpState, setRealtimeGpState] = useState<GpState | null>(null)
  const [realtimeProgram, setRealtimeProgram] = useState<ProgramData>(null)
  const [realtimeProgramState, setRealtimeProgramState] = useState<ProgramState | null>(null)
  const [programError, setProgramError] = useState<{ msg: string; ts: number } | null>(null)
  const [chatRejected, setChatRejected] = useState<{ msg: string; ts: number } | null>(null)
  const [realtimeBpm, setRealtimeBpm] = useState<number>(0)
  const [realtimeMembers, setRealtimeMembers] = useState<any[]>([])
  const [realtimeHostId, setRealtimeHostId] = useState<number | null>(null)
  const [realtimeSessions, setRealtimeSessions] = useState<any[] | null>(null)
  const [realtimeRecordingActive, setRealtimeRecordingActive] = useState<boolean | null>(null)
  const [realtimeRecordingBy, setRealtimeRecordingBy] = useState<number | null>(null) // 发起者（强刷回来恢复"停止"按钮归属）
  const [realtimeRecordingStartedAt, setRealtimeRecordingStartedAt] = useState<string | null>(null) // 服务端起始时刻（强刷回来秒表校准不归零）
  const [realtimeRecordingMax, setRealtimeRecordingMax] = useState<number | null>(null) // 单段上限秒数（服务器下发，前端双计时显示剩余）
  const [kickedEvent, setKickedEvent] = useState<{ userId: number; roomCode: string; ts: number } | null>(null)
  const [dissolvedEvent, setDissolvedEvent] = useState<{ roomCode: string; ts: number } | null>(null)

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

    // 1024 Step6: 聊天事前审被拒(拒绝级不广播)——仅发送者收到提示
    socket.on("chat-rejected", (data: { msg: string }) => {
      if (data && data.msg) setChatRejected({ msg: data.msg, ts: Date.now() })
    })

    socket.on("chords-update", (data: { chords: string[] }) => {
      setRealtimeChords(data.chords || [])
    })

    socket.on("theme-update", (data: { theme: string }) => {
      setRealtimeTheme(data.theme || "")
    })

    socket.on("score-update", (data: { score: RoomScore | null }) => {
      setRealtimeScore(data.score ?? null)
    })

    socket.on("gp-state", (data: GpState) => {
      setRealtimeGpState(data)
    })

    // program 背景轨（1015）：物料/走带双通道 + 错误反馈（起播失败原因直接弹给点播者）
    socket.on("program-update", (data: { program: ProgramData }) => {
      setRealtimeProgram(data.program ?? null)
    })

    socket.on("program-state", (data: ProgramState) => {
      setRealtimeProgramState(data)
    })

    socket.on("program-error", (data: { msg: string }) => {
      if (data && data.msg) setProgramError({ msg: data.msg, ts: Date.now() })
    })

    // GP 调音台（10-09 步骤②）：房级混音广播，后动作胜出；合并进当前谱（必新对象，同值跳过坑）
    socket.on("gp-mix", (data: { mix: GpMix }) => {
      setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, mix: data.mix } : prev))
    })

    // GP 倍速（10-10 步骤⑤）：房级广播，后动作胜出；合并进当前谱（必新对象，同值跳过坑）
    socket.on("gp-speed", (data: { speed: number }) => {
      setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, speed: data.speed } : prev))
    })

    // GP 预备拍（1011 ⑥-1）：房级开关广播
    socket.on("gp-countin", (data: { countin: boolean }) => {
      setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, countin: data.countin } : prev))
    })

    // GP 循环（1011 ⑥-2a）：房级开关广播
    socket.on("gp-loop", (data: { loop: boolean }) => {
      setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, loop: data.loop } : prev))
    })

    // GP 选段（1011 ⑥-2b）：房级 A-B 广播（null=清选区回全曲）
    socket.on("gp-range", (data: { range: { a: number; b: number } | null }) => {
      setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, range: data.range ?? undefined } : prev))
    })

    socket.on("bpm-update", (data: { bpm: number }) => {
      setRealtimeBpm(data.bpm || 0)
    })

    socket.on("members-update", (data: { members: any[]; hostId?: number }) => {
      setRealtimeMembers(data.members || [])
      if (data.hostId != null) setRealtimeHostId(data.hostId)
    })

    socket.on("member-kicked", (data: { userId: number; roomCode: string }) => {
      if (data && data.userId) setKickedEvent({ userId: data.userId, roomCode: data.roomCode, ts: Date.now() })
    })

    socket.on("room-dissolved", (data: { roomCode: string }) => {
      if (data && data.roomCode) setDissolvedEvent({ roomCode: data.roomCode, ts: Date.now() })
    })

    socket.on("sessions-update", (data: { sessions: any[] }) => {
      setRealtimeSessions(data.sessions || [])
    })

    socket.on("recording-state", (data: { active: boolean; userId?: number; startedAt?: string; maxSeconds?: number }) => {
      setRealtimeRecordingActive(!!data.active)
      setRealtimeRecordingBy(data.active ? (data.userId ?? null) : null)
      setRealtimeRecordingStartedAt(data.active ? (data.startedAt ?? null) : null)
      setRealtimeRecordingMax(data.active ? (data.maxSeconds ?? null) : null)
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

  const pushScore = (score: RoomScore) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("push-score", { roomId, score })
    setRealtimeScore(score)
  }

  const playGp = (startMs?: number) => { if (!socketRef.current || !roomId) return; socketRef.current.emit("gp-play", { roomId, startMs: Math.max(0, Math.round(startMs ?? 0)) }) }
  const pauseGp = () => { if (!socketRef.current || !roomId) return; socketRef.current.emit("gp-pause", { roomId }) }

  // program 背景轨走带（1015）：pause=服务器杀进程位置由下次点播定（GP pause 同语义，前端 mini 条本地记指针）
  const playProgram = (startMs?: number) => { if (!socketRef.current || !roomId) return; socketRef.current.emit("program-play", { roomId, startMs: Math.max(0, Math.round(startMs ?? 0)) }) }
  const pauseProgram = () => { if (!socketRef.current || !roomId) return; socketRef.current.emit("program-pause", { roomId }) }
  const stopProgram = () => { if (!socketRef.current || !roomId) return; socketRef.current.emit("program-stop", { roomId }) }
  // 混音实时同步（1014 拍板②）：乐观本地+广播（滑条组件侧节流后调用）
  const updateProgramMix = (mix: ProgramMix) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("program-mix", { roomId, mix })
    setRealtimeProgram((prev) => (prev ? { ...prev, mix } : prev))
  }
  // 水合（强刷/后进）：照 hydrateScore 模式喂单一真相源
  const hydrateProgram = (program: ProgramData, state: ProgramState | null) => { setRealtimeProgram(program); setRealtimeProgramState(state) }
  // GP 调音台：乐观本地+广播（滑条由组件侧节流后调用，这里即时发）
  const updateGpMix = (mix: GpMix) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("gp-mix", { roomId, mix })
    setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, mix } : prev))
  }

  // GP 倍速（10-10 步骤⑤）：乐观本地+广播（离散档无节流）
  const setGpSpeed = (speed: number) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("gp-speed", { roomId, speed })
    setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, speed } : prev))
  }

  // GP 预备拍（1011 ⑥-1）：乐观本地+广播
  const setGpCountin = (countin: boolean) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("gp-countin", { roomId, countin })
    setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, countin } : prev))
  }

  // GP 循环（1011 ⑥-2a）：乐观本地+广播
  const setGpLoop = (loop: boolean) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("gp-loop", { roomId, loop })
    setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, loop } : prev))
  }

  // GP 选段（1011 ⑥-2b）：乐观本地+广播（null=清除）
  const setGpRange = (range: { a: number; b: number } | null) => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("gp-range", { roomId, range })
    setRealtimeScore((prev) => (prev && prev.type === "gp" ? { ...prev, range: range ?? undefined } : prev))
  }

  // 水合（强刷/后进）：喂 realtimeScore 单一真相源。此前 playing-page 另有独立 score state，
  // 水合走独立 state 而 realtimeScore=null → gp-mix/gp-speed 的乐观与广播合并被 `prev &&` 静默丢弃
  // （10-10 倍速双 bug 根因：UI 不切换+本地 playbackSpeed 恒 1 而服务器已变速=指针原速被对表拽回）
  const hydrateScore = (score: RoomScore | null) => { setRealtimeScore(score) }

  const clearScore = () => {
    if (!socketRef.current || !roomId) return
    socketRef.current.emit("clear-score", { roomId })
    setRealtimeScore(null)
  }

  return { messages, sendMessage, connected, realtimeChords, pushChords, realtimeTheme, pushTheme, pushScore, clearScore, hydrateScore, realtimeScore, realtimeGpState, playGp, pauseGp, updateGpMix, setGpSpeed, setGpCountin, setGpLoop, setGpRange, realtimeBpm, realtimeMembers, realtimeHostId, realtimeSessions, realtimeRecordingActive, realtimeRecordingBy, realtimeRecordingStartedAt, realtimeRecordingMax, kickedEvent, dissolvedEvent, realtimeProgram, realtimeProgramState, programError, playProgram, pauseProgram, stopProgram, updateProgramMix, hydrateProgram, chatRejected }
}
