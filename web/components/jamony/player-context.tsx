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
  stop: () => void
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
  const repeatModeRef = useRef(repeatMode)
  useEffect(() => { repeatModeRef.current = repeatMode }, [repeatMode])
  const [playlist, setPlaylist] = useState<Track[]>([])
  const playlistRef = useRef(playlist)
  useEffect(() => { playlistRef.current = playlist }, [playlist])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // 跟踪当前曲目 id：切歌时旧 audio 被清空 src 也会触发 error，需据此忽略非当前曲目的 error
  const currentIdRef = useRef<string | undefined>(undefined)

  // 当前曲目变化时 → 创建新 Audio
  useEffect(() => {
    currentIdRef.current = current?.id
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
      // 播放列表空：停止；有作品：按模式自动下一首
      if (playlistRef.current.length === 0) {
        setIsPlaying(false)
        setCurrentTime(0)
        return
      }
      if (repeatModeRef.current === "repeat-one") {
        audio.currentTime = 0
        audio.play().catch((e) => console.warn("[player] 单曲循环重播失败:", e))
        return
      }
      playNextRef.current?.()
    })

    audio.addEventListener("error", () => {
      // 切歌时 cleanup 清空旧 audio 的 src 同样触发 error —— 只处理当前曲目的真实加载失败
      if (currentIdRef.current !== current?.id) return
      console.error("[player] 音频加载失败:", current.mp3Url)
      setIsPlaying(false)
    })

    // 播放/暂停统一交给下面的 isPlaying effect 处理，避免双 effect 竞态
    return () => {
      audio.pause()
      audio.src = ""
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  // 播放/暂停统一控制：isPlaying 变化或切歌(current?.id 变)时触发
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !current?.mp3Url) return

    if (isPlaying) {
      audio.play().catch((e) => console.warn("[player] 播放失败:", e))
    } else {
      audio.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, current?.id])

  const pickNext = useCallback(
    (dir: 1 | -1) => {
      if (!current || playlist.length === 0) return null
      if (repeatMode === "shuffle") {
        if (playlist.length === 1) return playlist[0]
        let next = current
        while (next.id === current.id) {
          next = playlist[Math.floor(Math.random() * playlist.length)]
        }
        return next
      }
      const idx = playlist.findIndex((t) => t.id === current.id)
      // 当前曲不在播放列表内：下一首取列表头，上一首取列表尾
      if (idx === -1) return dir === 1 ? playlist[0] : playlist[playlist.length - 1]
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= playlist.length) {
        // 越界：列表循环回到另一端，顺序播放返回 null
        return repeatMode === "repeat-all"
          ? playlist[(nextIdx + playlist.length) % playlist.length]
          : null
      }
      return playlist[nextIdx]
    },
    [current, playlist, repeatMode],
  )

  // ref 版的 playNext 供 ended 事件使用
  const playNextRef = useRef<() => void>(() => {})
  const playNext = useCallback(() => {
    const next = pickNext(1)
    if (!next) {
      // 无下一首：停止
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

  // 完全停止：同步暂停 audio + 清空当前曲目（用于离开播放场景，如跳转去房间大厅）
  // 同步操作 audioRef 立即停声，不依赖 isPlaying effect，避免跳转打断 effect 导致继续播放
  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = ""
      audioRef.current = null
    }
    setIsPlaying(false)
    setCurrent(null)
    setCurrentTime(0)
    setDuration(0)
  }, [])

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
      playTrack, togglePlay, stop, playNext, playPrev, seekTo,
      setQueue, cycleRepeatMode, addToPlaylist, removeFromPlaylist,
    }),
    [
      current, isPlaying, repeatMode, playlist, currentTime, duration, volume,
      playTrack, togglePlay, stop, playNext, playPrev, seekTo,
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
