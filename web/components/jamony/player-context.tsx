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
  pause: () => void
  stop: () => void
  playNext: () => void
  playPrev: () => void
  seekTo: (time: number) => void
  setQueue: (tracks: Track[]) => void
  cycleRepeatMode: () => void
  addToPlaylist: (track: Track) => void
  removeFromPlaylist: (id: string) => void
}

import { useRoomSession } from "@/lib/room-session"
import { AlertTriangle } from "lucide-react"

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
  // 当前曲目这次播放是否已计入播放量（防同一播放多次 +1；切歌/循环/重播时重置）
  const countedRef = useRef(false)

  // 当前曲目变化时 → 创建新 Audio
  useEffect(() => {
    currentIdRef.current = current?.id
    countedRef.current = false  // 切歌 → 新一轮播放，重新计计数
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
        countedRef.current = false  // 单曲循环重播 → 新一轮，重新计计数
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

  // 播放量计数：播满门槛（min(30秒, 50%总时长)）才 +1，每首每次播放只计一次
  useEffect(() => {
    if (!current?.id || !isPlaying) return
    if (countedRef.current) return
    const threshold = duration > 0 ? Math.min(30, duration * 0.5) : 30
    if (currentTime >= threshold) {
      countedRef.current = true
      fetch(`/api/works/${current.id}/play`, { method: 'POST' }).catch(() => {})
    }
  }, [currentTime, isPlaying, current?.id, duration])

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
        // 同曲 → 从头再放（算新一轮播放，重新计计数）
        if (audioRef.current) {
          audioRef.current.currentTime = 0
        }
        setCurrentTime(0)
        countedRef.current = false
        setIsPlaying(true)
        return
      }
      setCurrent(track)
      setIsPlaying(true)
      // 播放量计数改由门槛 effect 触发（播满 min(30秒, 50%总时长) 才 +1）
    },
    [current],
  )

  const togglePlay = useCallback(() => {
    if (!current) return
    setIsPlaying((p) => !p)
  }, [current])

  // ===== 10-07 房间音频竞权守卫（全站播放入口统一拦截，含作品库等直调 playTrack 的页面）=====
  const roomSession = useRoomSession()
  const [playGuardOpen, setPlayGuardOpen] = useState(false)
  const [noRemind, setNoRemind] = useState(false)
  const pendingPlayRef = useRef<null | (() => void)>(null)

  const guardedPlay = useCallback((action: () => void, isToggle = false) => {
    if (isToggle && isPlaying) { action(); return }  // 暂停方向不拦
    if (roomSession.listening != null) {             // 听众收听中 → Icecast 让路（胶囊可恢复）
      roomSession.pauseForPlayback()
      action()
      return
    }
    if (roomSession.session?.role === "musician" && localStorage.getItem("jamony_playbar_musician_ok") !== "1") {
      pendingPlayRef.current = action                // 合奏者 → 一次确认（不再提示）
      setPlayGuardOpen(true)
      return
    }
    action()
  }, [isPlaying, roomSession])

  const guardedPlayTrack = useCallback((track: Track) => guardedPlay(() => playTrack(track)), [guardedPlay, playTrack])
  const guardedTogglePlay = useCallback(() => guardedPlay(togglePlay, true), [guardedPlay, togglePlay])

  const confirmGuardedPlay = () => {
    if (noRemind) localStorage.setItem("jamony_playbar_musician_ok", "1")
    setPlayGuardOpen(false)
    pendingPlayRef.current?.()
    pendingPlayRef.current = null
  }
  // ===== 守卫完 =====

  // 暂停但记住曲目：同步停声，保留 current/进度/时长（09-27 欢哥：进房间暂停作品，
  // 离开房间后 PlayerBar 继续显示之前在听的内容，可续播。PlayerBar 在 /room 下由
  // pathname 挡住不渲染，房间内行为不变）
  const pause = useCallback(() => {
    const audio = audioRef.current
    if (audio) audio.pause()
    setIsPlaying(false)
  }, [])

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
      playTrack: guardedPlayTrack, togglePlay: guardedTogglePlay, pause, stop, playNext, playPrev, seekTo,
      setQueue, cycleRepeatMode, addToPlaylist, removeFromPlaylist,
    }),
    [
      current, isPlaying, repeatMode, playlist, currentTime, duration, volume,
      guardedPlayTrack, guardedTogglePlay, pause, stop, playNext, playPrev, seekTo,
      cycleRepeatMode, addToPlaylist, removeFromPlaylist,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* 合奏者播放确认（守卫下沉后由 Provider 统一渲染，全站生效） */}
      {playGuardOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => { setPlayGuardOpen(false); pendingPlayRef.current = null }}>
          <div className="w-full max-w-sm rounded-[10px] border p-6 text-center" style={{ borderColor: "#1A1A1A", background: "#0D0D0D" }} onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto grid size-12 place-items-center rounded-full" style={{ background: "rgba(255,184,77,0.15)" }}>
              <AlertTriangle className="size-6" style={{ color: "#ffb84d" }} />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-white">正在合奏中</h2>
            <p className="mt-1 text-sm" style={{ color: "#8A8A8A" }}>
              播放作品将与房间混音同时出声；若未戴耳机，作品声可能经麦克风传给房间成员。
            </p>
            <label className="mt-3 flex items-center justify-center gap-2 text-xs" style={{ color: "#8A8A8A" }}>
              <input type="checkbox" checked={noRemind} onChange={(e) => setNoRemind(e.target.checked)} />
              不再提示
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={() => { setPlayGuardOpen(false); pendingPlayRef.current = null }}
                className="rounded-[10px] px-4 py-2.5 text-sm font-medium" style={{ background: "#141414", color: "#B0B0B0" }}>
                取消
              </button>
              <button onClick={confirmGuardedPlay}
                className="rounded-[10px] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: "#9933FF" }}>
                播放
              </button>
            </div>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider")
  return ctx
}
