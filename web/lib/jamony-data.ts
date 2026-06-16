export type Room = {
  id: string
  title: string
  desc: string
  host: string
  instruments: string[]
  current: number
  max: number
}

export const rooms: Room[] = [
  { id: "1", title: "周末即兴局", desc: "周末了来玩即兴！", host: "小明", instruments: ["🎸", "🥁", "🎤"], current: 4, max: 6 },
  { id: "2", title: "爵士之夜", desc: "标准爵士曲目即兴", host: "老王", instruments: ["🎷", "🎹", "🥁"], current: 5, max: 6 },
  { id: "3", title: "流行翻唱小组", desc: "本周曲目《起风了》", host: "小美", instruments: ["🎤", "🎸"], current: 3, max: 6 },
  { id: "4", title: "金属排练房", desc: "双吉他鼓贝斯", host: "阿强", instruments: ["🎸", "🎸", "🥁"], current: 3, max: 6 },
  { id: "5", title: "民谣弹唱夜", desc: "木吉他+口琴", host: "小李", instruments: ["🎸", "🎤"], current: 2, max: 6 },
  { id: "6", title: "Funk Night", desc: "Groove is everything!", host: "老张", instruments: ["🎸", "🥁", "🎤"], current: 4, max: 6 },
  { id: "7", title: "动漫OP翻奏", desc: "鬼灭咒术巨人从头翻", host: "阿宅", instruments: ["🎸", "🎹", "🥁"], current: 3, max: 6 },
  { id: "8", title: "Bossa午后", desc: "下午茶Bossa", host: "Nina", instruments: ["🎸", "🎤", "🎹"], current: 2, max: 6 },
  { id: "9", title: "布鲁斯酒馆", desc: "12 小节 Blues", host: "Blues王", instruments: ["🎸", "🎹", "🥁"], current: 4, max: 6 },
  { id: "10", title: "电子氛围实验", desc: "合成器+采样", host: "电音客", instruments: ["🎹", "🎛️"], current: 3, max: 6 },
  { id: "r11", title: "即兴说唱 cypher", desc: "随便来一段", host: "MC狗哥", instruments: ["🎤", "🥁"], current: 3, max: 6 },
  { id: "r12", title: "古典室内乐", desc: "弦乐四重奏", host: "提琴手", instruments: ["🎻", "🎻", "🎻"], current: 3, max: 6 },
]

export type Notice = {
  id: string
  title: string
  body: string
  author: string
  time: string
}

export const notices: Notice[] = [
  { id: "n1", title: "线下组队·北京", body: "我是吉他手，寻贝斯/鼓/键盘，风格金属，最好有排练经验，我们每周日下午排练，已有原创作品 3 首。", author: "摇滚老张", time: "2026-06-15 14:30" },
  { id: "n2", title: "今晚 8 点 Blues 即兴", body: "求贝斯+鼓手，线上，布鲁斯即兴，今晚 8 点准时开搞，欢迎各路布鲁斯爱好者加入，我们一起玩 12 小节！", author: "蓝调小王", time: "2026-06-16 10:00" },
  { id: "n3", title: "6/16 饭桶乐队即兴专场", body: "线上 Live，欢迎围观。饭桶乐队首次公开即兴专场，风格涵盖摇滚/放克/雷鬼，预计时长 2 小时，预约提醒不会错过。", author: "饭桶乐队", time: "2026-06-14 20:00" },
  { id: "n4", title: "6/20 上海 livehouse 演出", body: "票价 80 元，海报已出。上海育音堂，我们和另外两支乐队一起，晚上 8 点开场，现场见！", author: "地下通道乐队", time: "2026-06-13 09:15" },
  { id: "n5", title: "成都组原创乐队", body: "寻所有乐手，有排练房，风格不限。我们在成都高新区，每周可以排练 2-3 次，目标是写原创作品。", author: "追梦的阿飞", time: "2026-06-12 16:45" },
  { id: "n6", title: "明晚 9 点 民谣翻唱局", body: "有吉他即可加入，线上即兴。明晚 9 点在 jamony 上，来一把木吉他就可以，我也会弹，一起玩。", author: "民谣小李", time: "2026-06-16 08:00" },
  { id: "n7", title: "本周五爵士四重奏 Live", body: "线上直播，预约提醒。本周五晚 8 点，钢琴/萨克斯/贝斯/鼓的四重奏线上直播，欢迎来听。", author: "爵士猫乐队", time: "2026-06-10 12:00" },
  { id: "n8", title: "周末金属排练", body: "缺主唱，有排练房，杭州。周末下午，我们双吉他已齐，鼓和贝斯也有，就差一个能吼的主唱。", author: "金属头", time: "2026-06-15 22:10" },
]

export type Highlight = {
  id: string
  title: string
  players: string
  likes: number
  duration: string
  gradient: string
  date: string
  members: { name: string; instrument: string }[]
  style: string
}

export const highlights: Highlight[] = [
  {
    id: "h1",
    title: "Funk Jam #47",
    players: "4 位乐手",
    likes: 128,
    duration: "5:30",
    gradient: "linear-gradient(135deg, #00AAFF, #9933FF)",
    date: "2026-06-14",
    style: "Funk / Groove",
    members: [
      { name: "老张", instrument: "🎸" },
      { name: "小明", instrument: "🥁" },
      { name: "小美", instrument: "🎤" },
      { name: "Nina", instrument: "🎹" },
    ],
  },
  {
    id: "h2",
    title: "雨中布鲁斯",
    players: "3 位乐手",
    likes: 96,
    duration: "4:15",
    gradient: "linear-gradient(135deg, #9933FF, #FF33AA)",
    date: "2026-06-12",
    style: "Blues",
    members: [
      { name: "Blues王", instrument: "🎸" },
      { name: "老王", instrument: "🎹" },
      { name: "阿强", instrument: "🥁" },
    ],
  },
  {
    id: "h3",
    title: "夏夜民谣",
    players: "2 位乐手",
    likes: 72,
    duration: "3:48",
    gradient: "linear-gradient(135deg, #FF33AA, #BBEE00)",
    date: "2026-06-10",
    style: "Folk",
    members: [
      { name: "小李", instrument: "🎸" },
      { name: "小美", instrument: "🎤" },
    ],
  },
  {
    id: "h4",
    title: "电子梦",
    players: "3 位乐手",
    likes: 64,
    duration: "6:02",
    gradient: "linear-gradient(135deg, #00AAFF, #BBEE00)",
    date: "2026-06-08",
    style: "Electronic",
    members: [
      { name: "电音客", instrument: "🎹" },
      { name: "MC狗哥", instrument: "🎤" },
      { name: "阿宅", instrument: "🎛️" },
    ],
  },
]

// Deterministic pseudo-random angle from an id, so rotation is stable across refreshes.
export function hashAngle(id: string, range: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0xffffffff
  }
  const norm = (Math.abs(h) % 1000) / 1000 // 0..1
  return (norm * 2 - 1) * range // -range..+range
}
