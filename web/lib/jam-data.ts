// 全部为前端静态模拟数据，不依赖任何后端接口

export const DAILY_THEME = {
  title: "布鲁斯 · Key of E",
  emoji: "🎸",
}

export const ROOM = {
  id: "demo",
  name: "周末即兴局",
  styleEmoji: "🎸",
  styleTag: "布鲁斯 / 即兴",
  description: "周末的放松局，慢摇布鲁斯为主，欢迎吉他、贝斯、鼓和键盘一起 jam。氛围轻松，不追求完美，享受当下。",
  creator: "阿May",
  createdAt: "2025-06-12 20:30",
  online: 5,
  capacity: 8,
  latencyMs: 28,
  serverIp: "39.96.30.128",
  port: 22124,
}

export type Member = {
  id: string
  name: string
  instrument: string
  instrumentEmoji: string
  color: string
  isSelf?: boolean
  online: boolean
}

export const MEMBERS: Member[] = [
  { id: "m1", name: "阿May", instrument: "主音吉他", instrumentEmoji: "🎸", color: "#00AAFF", online: true },
  { id: "m2", name: "你", instrument: "节奏吉他", instrumentEmoji: "🎸", color: "#9933FF", isSelf: true, online: true },
  { id: "m3", name: "老K", instrument: "贝斯", instrumentEmoji: "🎻", color: "#FF33AA", online: true },
  { id: "m4", name: "小鼓手", instrument: "架子鼓", instrumentEmoji: "🥁", color: "#BBEE00", online: true },
  { id: "m5", name: "Echo", instrument: "键盘", instrumentEmoji: "🎹", color: "#00AAFF", online: true },
]

export type ChordPreset = {
  id: string
  style: string
  emoji: string
  chords: string[]
}

export const CHORD_PRESETS: ChordPreset[] = [
  { id: "blues", style: "布鲁斯", emoji: "🎸", chords: ["E7", "A7", "E7", "E7"] },
  { id: "jazz", style: "爵士", emoji: "🎷", chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"] },
  { id: "pop", style: "流行", emoji: "🎤", chords: ["C", "G", "Am", "F"] },
  { id: "rock", style: "摇滚", emoji: "🤘", chords: ["A5", "D5", "E5", "A5"] },
  { id: "folk", style: "民谣", emoji: "🪕", chords: ["G", "Em", "C", "D"] },
]

// 各风格可用和弦库，用于按句数随机生成进程
// 和弦代号尽量精简（避免 Bm7b5 / Cadd9 这类过长文本影响排版）
export const CHORD_POOLS: Record<string, { emoji: string; pool: string[] }> = {
  布鲁斯: { emoji: "🎸", pool: ["E7", "A7", "B7", "C7", "D7", "G7"] },
  爵士: { emoji: "🎷", pool: ["Cm7", "Dm7", "Em7", "Fm7", "G7", "Am7", "A7", "D7"] },
  流行: { emoji: "🎤", pool: ["C", "G", "Am", "F", "Dm", "Em"] },
  摇滚: { emoji: "🤘", pool: ["A5", "D5", "E5", "G5", "C5", "B5"] },
  民谣: { emoji: "🪕", pool: ["G", "Em", "C", "D", "Am", "A"] },
}

export const CHORD_STYLES = Object.keys(CHORD_POOLS)
export const PHRASE_COUNTS = [1, 2, 4, 8] as const

// 按风格 + 句数随机生成一条和弦进程（每句 4 个和弦）
export function generateProgression(style: string, phrases: number): string[] {
  const pool = CHORD_POOLS[style]?.pool ?? CHORD_POOLS["流行"].pool
  const chords: string[] = []
  for (let i = 0; i < phrases * 4; i++) {
    chords.push(pool[Math.floor(Math.random() * pool.length)])
  }
  return chords
}

export type Track = {
  member: string
  instrumentEmoji: string
  duration: string
  allowUse: boolean | null          // null = 未选择, true = 允许, false = 不允许
  allowAttribution: boolean | null  // null = 未选择, true = 署名, false = 匿名
  allowDownload: boolean | null     // null = 未选择, true = 可下载, false = 禁下载
}

export type RecordingSession = {
  id: string
  index: number
  duration: string
  participants: number
  tracks: Track[]
}

export const RECORDINGS: RecordingSession[] = [
  {
    id: "s1",
    index: 1,
    duration: "04:12",
    participants: 4,
    tracks: [
      { member: "阿May", instrumentEmoji: "🎸", duration: "04:12", allowUse: true, allowAttribution: true, allowDownload: true },
      { member: "你", instrumentEmoji: "🎸", duration: "04:10", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "老K", instrumentEmoji: "🎻", duration: "04:12", allowUse: true, allowAttribution: false, allowDownload: false },
      { member: "小鼓手", instrumentEmoji: "🥁", duration: "04:11", allowUse: false, allowAttribution: null, allowDownload: null },
    ],
  },
  {
    id: "s2",
    index: 2,
    duration: "06:48",
    participants: 5,
    tracks: [
      { member: "阿May", instrumentEmoji: "🎸", duration: "06:48", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "你", instrumentEmoji: "🎸", duration: "06:45", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "老K", instrumentEmoji: "🎻", duration: "06:48", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "小鼓手", instrumentEmoji: "🥁", duration: "06:47", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "Echo", instrumentEmoji: "🎹", duration: "06:40", allowUse: null, allowAttribution: null, allowDownload: null },
    ],
  },
  {
    id: "s3",
    index: 3,
    duration: "02:35",
    participants: 3,
    tracks: [
      { member: "阿May", instrumentEmoji: "🎸", duration: "02:35", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "老K", instrumentEmoji: "🎻", duration: "02:35", allowUse: null, allowAttribution: null, allowDownload: null },
      { member: "Echo", instrumentEmoji: "🎹", duration: "02:30", allowUse: null, allowAttribution: null, allowDownload: null },
    ],
  },
]

export type ChatMessage = {
  id: string
  author: string
  content: string
  time: string
  isSelf?: boolean
}

export const CHAT_MESSAGES: ChatMessage[] = [
  { id: "c1", author: "阿May", content: "大家热好身了吗，先来个慢摇布鲁斯", time: "20:31" },
  { id: "c2", author: "老K", content: "贝斯准备好了 🎻", time: "20:32" },
  { id: "c3", author: "你", content: "节奏吉他跟上，E7 走起", time: "20:32", isSelf: true },
  { id: "c4", author: "小鼓手", content: "数四拍我进", time: "20:33" },
  { id: "c5", author: "Echo", content: "键盘垫一点氛围 🎹", time: "20:34" },
]
