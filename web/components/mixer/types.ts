export interface MixerTrack {
  id: string
  name: string // 用户名
  instrument: string // emoji
  wavUrl: string
  duration: number // 秒
  color: string // 轨颜色
  peaks?: number[] // 波形峰值数据（0~1），加载后填充
}

export interface MixerFullscreenProps {
  sessionLabel: string // "段落 1"
  tracks: MixerTrack[]
  isOpen: boolean
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number // 0~1
  /** 0~100，< 100 时显示加载遮罩层 */
  loadingProgress?: number
  /** M/S 状态（trackId → boolean） */
  mutes?: Record<string, boolean>
  solos?: Record<string, boolean>
  /** 实时电平（trackId → 0~1） */
  levels?: Record<string, number>
  onClose: () => void
  onMinimize: () => void
  onPlayPause: () => void
  onStop: () => void
  onSeek: (ratio: number) => void
  onVolumeChange?: (trackId: string, value: number) => void
  onPanChange?: (trackId: string, value: number) => void
  onMuteToggle?: (trackId: string, muted: boolean) => void
  onSoloToggle?: (trackId: string, soloed: boolean) => void
}

export interface MixerMiniProps {
  sessionLabel: string
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number // 0~1
  loadingProgress?: number
  onTogglePlay: () => void
  onSeek: (ratio: number) => void
  onClose: () => void
  onFullscreen: () => void
}

// 8 色循环调色板（jamony 品牌色系，用于轨道染色）
export const TRACK_COLORS = [
  "#00AAFF", // 品牌蓝
  "#9933FF", // 品牌紫
  "#FF33AA", // 品牌粉
  "#BBEE00", // 品牌绿
  "#FF8800", // 暖橙
  "#44DDDD", // 青
  "#FF5577", // 玫红
  "#AAAAAA", // 灰
]

// jamony 品牌配色
export const MIXER_COLORS = {
  background: "#121212",
  panel: "#1A1A1A",
  waveBg: "#1A1A1A",
  purple: "#9933FF",
  blue: "#00AAFF",
  pink: "#FF33AA",
  green: "#BBEE00",
  yellow: "#FFCC00",
  red: "#FF3366",
  text: "#FFFFFF",
  textMuted: "#999999",
  border: "#333333",
} as const

export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const m = Math.floor(safe / 60)
  const s = Math.floor(safe % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}
