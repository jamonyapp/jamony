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
  /** 推子增益 gain（trackId → 0~2，1=0dB） */
  volumes?: Record<string, number>
  /** 声像（trackId → -1~1） */
  pans?: Record<string, number>
  /** 消波锁存（trackId → boolean） */
  clips?: Record<string, boolean>
  onResetClip?: (trackId: string) => void
  /** master 总线 */
  masterVolume?: number
  masterLevel?: number
  masterClip?: boolean
  onMasterVolumeChange?: (value: number) => void
  onResetMasterClip?: () => void
  /** 标题尾（1014 按调起方区分）：录音试听默认"试听混音"；program 传空串=纯 sessionLabel（默认参数对 undefined 生效，须显式传 ""） */
  titleLabel?: string
  /** 走带区提示文案：默认试听文案；program 链路传专属提示 */
  footerHint?: string
  /** 标题栏图标：默认 🎸；传 false 不渲染（1016 欢哥：Program Mixer 纯文字） */
  icon?: React.ReactNode

  /* ───── 1026 定位器/发表（全可选；program 不传=DOM 与现状一致，回归机器判据）───── */
  /** 开启定位器 UI（录音双混音器传；program 不传） */
  enableLocator?: boolean
  /** 定位器（秒）；null=未设（A 渲染在 0 位、B 在末位） */
  locator?: { a: number; b: number | null } | null
  onLocatorChange?: (a: number, b: number | null) => void
  /** 区间循环开关（enableLocator 时渲染） */
  loop?: boolean
  onLoopToggle?: (v: boolean) => void
  /** 复位所有参数（音量/声像/总线/M/S/定位器一键回默认） */
  onResetAll?: () => void
  /** 发表按钮（仅发表混音器传；灰置时 title=reason） */
  publishButton?: { label: string; disabled: boolean; reason?: string; busy?: boolean; tone?: "blue" | "green" | "gray" }
  onPublishClick?: () => void
  /** 一键清除 M/S（闸2 便利钮；存在 M/S 时自动显示） */
  onClearMS?: () => void
  /** 发表倒计时剩余秒（undefined=不渲染；发表成功后不再传即隐藏） */
  countdownSec?: number
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
