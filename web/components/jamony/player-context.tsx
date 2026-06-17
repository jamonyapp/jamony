"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Track } from "@/lib/jamony-data"

export type RepeatMode = "sequential" | "repeat-one" | "repeat-all" | "shuffle"

export const REPEAT_MODES: RepeatMode[] = [
  "sequential",
  "repeat-one",
  "repeat-all",
  "shuffle",
]

export const REPEAT_MODE_LABEL: Record<RepeatMode, string> = {
  sequential: "顺序播放",
  "repeat-one": "单曲循环",
  "repeat-all": "列表循环",
  shuffle: "随机播放",
}

interface PlayerContextValue {
  current: Track | null
  isPlaying: boolean
  repeatMode: RepeatMode
  playlist: Track[]
  playTrack: (track: Track) => void
  togglePlay: () => void
  playNext: () => void
  playPrev: () => void
  setQueue: (tracks: Track[]) => void
  cycleRepeatMode: () => void
  addToPlaylist: (track: Track) => void
  removeFromPlaylist: (id: string) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Track[]>([])
  const [current, setCurrent] = useState<Track | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("sequential")
  const [playlist, setPlaylist] = useState<Track[]>([])

  const playTrack = useCallback(
    (track: Track) => {
      if (current?.id === track.id) {
        console.log("[v0] 重新从头播放:", track.title)
        setIsPlaying(true)
        return
      }
      console.log("[v0] 播放作品:", track.title)
      setCurrent(track)
      setIsPlaying(true)
    },
    [current],
  )

  const togglePlay = useCallback(() => {
    setCurrent((c) => {
      if (!c) {
        console.log("[v0] 暂无加载作品，无法播放")
        return c
      }
      setIsPlaying((p) => {
        console.log("[v0] 切换播放/暂停:", !p)
        return !p
      })
      return c
    })
  }, [])

  const pickNext = useCallback(
    (dir: 1 | -1) => {
      if (!current || queue.length === 0) return null
      if (repeatMode === "shuffle") {
        if (queue.length === 1) return queue[0]
        let next = current
        while (next.id === current.id) {
          next = queue[Math.floor(Math.random() * queue.length)]
        }
        return next
      }
      const idx = queue.findIndex((t) => t.id === current.id)
      const nextIdx = (idx + dir + queue.length) % queue.length
      return queue[nextIdx]
    },
    [current, queue, repeatMode],
  )

  const playNext = useCallback(() => {
    const next = pickNext(1)
    if (!next) return
    console.log("[v0] 下一首:", next.title)
    setCurrent(next)
    setIsPlaying(true)
  }, [pickNext])

  const playPrev = useCallback(() => {
    const prev = pickNext(-1)
    if (!prev) return
    console.log("[v0] 上一首:", prev.title)
    setCurrent(prev)
    setIsPlaying(true)
  }, [pickNext])

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => {
      const next = REPEAT_MODES[(REPEAT_MODES.indexOf(m) + 1) % REPEAT_MODES.length]
      console.log("[v0] 切换播放模式:", REPEAT_MODE_LABEL[next])
      return next
    })
  }, [])

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist((list) => {
      if (list.some((t) => t.id === track.id)) {
        console.log("[v0] 作品已在播放列表:", track.title)
        return list
      }
      console.log("[v0] 加入播放列表:", track.title)
      return [...list, track]
    })
  }, [])

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist((list) => {
      console.log("[v0] 从播放列表移除:", id)
      return list.filter((t) => t.id !== id)
    })
  }, [])

  const value = useMemo(
    () => ({
      current,
      isPlaying,
      repeatMode,
      playlist,
      playTrack,
      togglePlay,
      playNext,
      playPrev,
      setQueue,
      cycleRepeatMode,
      addToPlaylist,
      removeFromPlaylist,
    }),
    [
      current, isPlaying, repeatMode, playlist,
      playTrack, togglePlay, playNext, playPrev,
      cycleRepeatMode, addToPlaylist, removeFromPlaylist,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider")
  return ctx
}
