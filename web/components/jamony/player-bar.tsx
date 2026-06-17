"use client"

import { useState } from "react"
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Repeat,
  Repeat1,
  Shuffle,
  ArrowRight,
  ListMusic,
  X,
} from "lucide-react"
import { usePlayer, REPEAT_MODE_LABEL, type RepeatMode } from "@/components/jamony/player-context"
import { formatCount } from "@/lib/jamony-data"

function RepeatIcon({ mode }: { mode: RepeatMode }) {
  if (mode === "repeat-one") return <Repeat1 className="h-4 w-4" />
  if (mode === "repeat-all") return <Repeat className="h-4 w-4" />
  if (mode === "shuffle") return <Shuffle className="h-4 w-4" />
  return <ArrowRight className="h-4 w-4" />
}

export function PlayerBar() {
  const {
    current,
    isPlaying,
    repeatMode,
    playlist,
    togglePlay,
    playNext,
    playPrev,
    cycleRepeatMode,
    playTrack,
    removeFromPlaylist,
  } = usePlayer()

  const [listOpen, setListOpen] = useState(false)
  const hasTrack = Boolean(current)
  const modeActive = repeatMode !== "sequential"

  return (
    <>
      {/* 播放列表弹窗 */}
      {listOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setListOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70" aria-hidden />
          <div
            className="relative z-10 mb-16 flex max-h-[70vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl border border-[#1A1A1A] bg-black sm:mb-0 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="播放列表"
          >
            <div className="flex items-center justify-between border-b border-[#1A1A1A] px-4 py-3">
              <div className="flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-white" />
                <h2 className="text-sm font-bold text-white">播放列表</h2>
                <span className="text-xs text-[#9A9A9A]">{playlist.length} 首</span>
              </div>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setListOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#9A9A9A] transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {playlist.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-[#666]">
                  播放列表为空，点击作品「···」菜单加入播放列表
                </p>
              ) : (
                playlist.map((t) => {
                  const active = current?.id === t.id
                  return (
                    <div
                      key={t.id}
                      className={`group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5 ${
                        active ? "bg-white/5" : ""
                      }`}
                      onClick={() => playTrack(t)}
                    >
                      <div
                        className="h-10 w-10 shrink-0 rounded-md"
                        style={{ background: t.gradient }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium"
                          style={{ color: active ? "#00AAFF" : "#FFFFFF" }}
                        >
                          {t.title}
                        </p>
                        <p className="truncate text-xs text-[#9A9A9A]">
                          {t.author} · {formatCount(t.plays)} 播放
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-[#9A9A9A]">
                        {t.duration}
                      </span>
                      <button
                        type="button"
                        aria-label="移除"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFromPlaylist(t.id)
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#666] opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-[#1A1A1A]"
        style={{ background: "#0D0D0D" }}
      >
        <div className="mx-auto flex h-full max-w-[1280px] items-center gap-4 px-4 md:px-6">
          {/* 左侧：色块 + 信息 */}
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
              style={{
                background: current ? current.gradient : "#1A1A1A",
              }}
              aria-hidden
            >
              {!current && <ListMusic className="h-5 w-5 text-[#555]" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">
                {current ? current.title : "未在播放"}
              </p>
              <p className="truncate text-xs text-[#9A9A9A]">
                {current ? current.author : "选择一个作品开始播放"}
              </p>
            </div>
          </div>

          {/* 中左：控制按钮 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="上一首"
              onClick={playPrev}
              disabled={!hasTrack}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white disabled:opacity-30"
            >
              <SkipBack className="h-4 w-4 fill-current" />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? "暂停" : "播放"}
              onClick={togglePlay}
              disabled={!hasTrack}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-black" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-black" />
              )}
            </button>
            <button
              type="button"
              aria-label="下一首"
              onClick={playNext}
              disabled={!hasTrack}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:text-white disabled:opacity-30"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          </div>

          {/* 中间：进度条 */}
          <div className="flex flex-1 items-center gap-3">
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: hasTrack ? "33%" : "0%",
                  background: "linear-gradient(90deg, #00AAFF, #9933FF)",
                }}
              />
            </div>
            <span className="hidden shrink-0 text-xs tabular-nums text-[#9A9A9A] sm:block">
              {hasTrack ? "01:50" : "00:00"} / {current ? current.duration : "00:00"}
            </span>
          </div>

          {/* 右侧：播放模式 + 播放列表 + 音量 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`播放模式：${REPEAT_MODE_LABEL[repeatMode]}`}
              title={REPEAT_MODE_LABEL[repeatMode]}
              onClick={cycleRepeatMode}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: modeActive ? "#00AAFF" : "#9A9A9A" }}
            >
              <RepeatIcon mode={repeatMode} />
            </button>
            <button
              type="button"
              aria-label="播放列表"
              onClick={() => setListOpen((o) => !o)}
              className="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: listOpen ? "#00AAFF" : "#9A9A9A" }}
            >
              <ListMusic className="h-4 w-4" />
              {playlist.length > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black"
                  style={{ background: "#00AAFF" }}
                >
                  {playlist.length}
                </span>
              )}
            </button>
            <div className="ml-1 hidden items-center gap-2 md:flex">
              <Volume2 className="h-4 w-4 text-[#9A9A9A]" />
              <div className="relative h-1 w-20 overflow-hidden rounded-full bg-white/15">
                <div className="absolute inset-y-0 left-0 w-2/3 rounded-full bg-white/70" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
