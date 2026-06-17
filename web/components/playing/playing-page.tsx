"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TopNav } from "@/components/jamony/top-nav"
import { LeftColumn } from "@/components/playing/left-column"
import { CenterColumn } from "@/components/playing/center-column"
import { RightColumn } from "@/components/playing/right-column"
import { DisconnectDialog } from "@/components/playing/disconnect-dialog"
import { CHORD_PRESETS, ROOM } from "@/lib/jam-data"

// Electron API 类型扩展
declare global {
  interface Window {
    jamonyAPI?: {
      joinRoom: (p: { serverIp: string; port: number }) => void
      killJamsoul: () => void
      onJamsoulLaunched: (cb: (data: unknown) => void) => void
    }
  }
}

export function PlayingPage() {
  const router = useRouter()
  const [chords, setChords] = useState<string[]>(CHORD_PRESETS[0].chords)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [audioConnected, setAudioConnected] = useState(false)
  // "stay"=左下角断开 | "home"=回首页 | "lobby"=回大厅
  const [confirmTarget, setConfirmTarget] = useState<"stay" | "home" | "lobby">("stay")

  const doDisconnect = (target: "stay" | "home" | "lobby") => {
    setConfirmOpen(false)
    window.jamonyAPI?.killJamsoul?.()
    console.log("[jamony] Audio disconnected, target:", target)
    setAudioConnected(false)
    if (target === "home") router.push("/")
    else if (target === "lobby") router.push("/lobby")
    // "stay" → 留在合奏中页面
  }

  const handleReconnect = () => {
    const payload = { serverIp: ROOM.serverIp, port: ROOM.port }
    if (window.jamonyAPI) {
      console.log("[jamony] Reconnecting audio:", JSON.stringify(payload))
      window.jamonyAPI.joinRoom(payload)
    } else {
      window.postMessage({ type: "JOIN_ROOM", payload }, "*")
    }
    setAudioConnected(true)
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopNav
        onBackHome={() => {
          if (audioConnected) { setConfirmTarget("home"); setConfirmOpen(true) }
          else window.location.href = "/"
        }}
        backLinks={[{
          label: "返回大厅",
          href: "/lobby",
          onClick: () => {
            if (audioConnected) { setConfirmTarget("lobby"); setConfirmOpen(true) }
            else window.location.href = "/lobby"
          },
        }]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22%_minmax(0,1fr)_30%]">
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <LeftColumn
            onPushChord={(c) => setChords(c)}
            audioConnected={audioConnected}
            onDisconnect={() => { setConfirmTarget("stay"); setConfirmOpen(true) }}
            onReconnect={handleReconnect}
          />
        </div>
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <CenterColumn chords={chords} />
        </div>
        <div className="min-h-0">
          <RightColumn />
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
