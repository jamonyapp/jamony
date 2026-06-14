"use client"

import { useState } from "react"
import { TopNav } from "@/components/playing/top-nav"
import { LeftColumn } from "@/components/playing/left-column"
import { CenterColumn } from "@/components/playing/center-column"
import { RightColumn } from "@/components/playing/right-column"
import { DisconnectDialog } from "@/components/playing/disconnect-dialog"
import { CHORD_PRESETS } from "@/lib/jam-data"

export default function PlayingPage() {
  const [chords, setChords] = useState<string[]>(CHORD_PRESETS[0].chords)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [disconnected, setDisconnected] = useState(false)

  if (disconnected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl font-bold">已断开连接</p>
        <p className="text-sm text-muted-foreground">
          调音台进程已结束，正在返回房间大厅…（此跳转由 Electron 控制）
        </p>
        <button
          onClick={() => setDisconnected(false)}
          className="mt-2 rounded-[10px] bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          重新进入演示
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopNav onBack={() => setConfirmOpen(true)} />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[22%_minmax(0,1fr)_30%]">
        <div className="min-h-0 border-b border-border lg:border-b-0 lg:border-r">
          <LeftColumn
            onPushChord={(c) => setChords(c)}
            onDisconnect={() => setConfirmOpen(true)}
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
        onConfirm={() => {
          setConfirmOpen(false)
          setDisconnected(true)
        }}
      />
    </div>
  )
}
