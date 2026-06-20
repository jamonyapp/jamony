"use client"

import { useEffect, useRef } from "react"

function getStreamUrl(port: number): string {
  const host = typeof window !== "undefined" ? window.location.hostname : "39.96.30.128"
  return `${typeof window !== "undefined" ? window.location.protocol : "http:"}//${host}/stream/room-${port}`
}

export function IcecastPlayer({ active, port }: { active: boolean; port?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!active || !port) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
        audioRef.current = null
      }
      return
    }

    const url = getStreamUrl(port)
    console.log("[icecast] playing:", url)

    const audio = new Audio(url)
    audioRef.current = audio
    audio.volume = 0.8

    audio.play().catch(() => {
      console.log("[icecast] autoplay blocked")
    })

    return () => {
      audio.pause()
      audio.src = ""
      audioRef.current = null
    }
  }, [active, port])

  return null
}
