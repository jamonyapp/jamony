"use client"

import { useState, useCallback } from "react"

export function useMixerEngine() {
  const [loading, setLoading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const loadTracks = useCallback(async (_tracks: { id: string; wavUrl: string }[]) => {
    // TODO: 实装音频加载 + 波形峰值提取
    setLoading(true)
    setLoadProgress(0)
    setLoadError(null)
    // 模拟加载
    await new Promise(r => setTimeout(r, 500))
    setLoadProgress(1)
    setLoading(false)
  }, [])

  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p)
  }, [])

  const stop = useCallback(() => {
    setIsPlaying(false)
    setCurrentTime(0)
  }, [])

  const seek = useCallback((_time: number) => {
    // TODO
  }, [])

  return {
    loading,
    loadProgress,
    loadError,
    isPlaying,
    currentTime,
    duration,
    loadTracks,
    togglePlay,
    stop,
    seek,
  }
}
