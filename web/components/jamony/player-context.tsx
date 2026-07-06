"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  currentTime: number
  duration: number
  volume: number
  setVolume: (v: number) => void
  playTrack: (track: Track) => void
  togglePlay: () => void
  playNext: () => void
  playPrev: () => void
  seekTo: (time: number) => void
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
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 当前曲目变化时 → 创建新 Audio
  useEffect(() => {
    if (!current?.mp3Url) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
      setCurrentTime(0)
      setDuration(0)
      setIsPlaying(false)
      return
    }

    const audio = new Audio(current.mp3Url)
    audio.preload = "auto"
    audio.volume = volume
    audioRef.current = audio

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration)
    })

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener("ended", () => {
      // 自动下一首
      playNextRef.current?.()
    })

    audio.addEventListener("error", () => {
      console.error("[player] 音频加载失败:", current.mp3Url)
      setIsPlaying(false)
    })

    if (isPlaying) {
      audio.play().catch((e) => console.warn("[player] 播放失败:", e))
    }

    return () => {
      audio.pause()
      audio.src = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // 播放/暂停切换时控制 Audio
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current?.mp3Url) return

    if (isPlaying) {
      audio.play().catch((e) => console.warn("[player] 播放失败:", e))
    } else {
      audio.pause()
    }
  }, [isPlaying, current?.mp3Url])

  // ref 版的 playNext 供 ended 事件使用
  const playNextRef = useRef<() => void>(() => {})
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
    if (!next) {
      // 无下一首：回到停止状态，进度归零
      setIsPlaying(false)
      setCurrentTime(0)
      if (audioRef.current) audioRef.current.currentTime = 0
      return
    }
    setCurrent(next)
    setIsPlaying(true)
  }, [pickNext])

  playNextRef.current = playNext

  const playPrev = useCallback(() => {
    const prev = pickNext(-1)
    if (!prev) return
    setCurrent(prev)
    setIsPlaying(true)
  }, [pickNext])

  const playTrack = useCallback(
    (track: Track) => {
      if (current?.id === track.id) {
        // 同曲 → 从头再放
        if (audioRef.current) {
          audioRef.current.currentTime = 0
        }
        setCurrentTime(0)
        setIsPlaying(true)
        return
      }
      setCurrent(track)
      setIsPlaying(true)
    },
    [current],
  )

  const togglePlay = useCallback(() => {
    if (!current) return
    setIsPlaying((p) => !p)
  }, [current])

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => {
      const next = REPEAT_MODES[(REPEAT_MODES.indexOf(m) + 1) % REPEAT_MODES.length]
      return next
    })
  }, [])

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }, [])

  // 音量变化 → 同步到 audio
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  const addToPlaylist = useCallback((track: Track) => {
    setPlaylist((list) => {
      if (list.some((t) => t.id === track.id)) return list
      return [...list, track]
    })
  }, [])

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist((list) => list.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(
    () => ({
      current, isPlaying, repeatMode, playlist,
      currentTime, duration, volume, setVolume,
      playTrack, togglePlay, playNext, playPrev, seekTo,
      setQueue, cycleRepeatMode, addToPlaylist, removeFromPlaylist,
    }),
    [
      current, isPlaying, repeatMode, playlist, currentTime, duration, volume,
      playTrack, togglePlay, playNext, playPrev, seekTo,
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
