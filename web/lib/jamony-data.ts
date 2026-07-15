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

export type NoticeType = "offline" | "online"

export type Notice = {
  id: string
  title: string
  body: string
  author: string
  time: string
  type: NoticeType
  city: string
  style: string
  bgIndex: number
  imageUrl?: string
  category?: string
  jamTime?: string
  level?: string
  neededCount?: number
  expireAt?: string
  authorId?: number
  authorAvatar?: string
  comments?: number
  likes?: number
}

export const BG_COUNT = 17

export const NOTICE_TYPE_LABEL: Record<NoticeType, string> = {
  "offline": "线下约起",
  "online": "线上约起",
}

export const NOTICE_TYPE_COLOR: Record<NoticeType, string> = {
  "offline": "#00AAFF",
  "online": "#FF33AA",
}

export const NOTICE_TYPES: NoticeType[] = [
  "offline",
  "online",
]

// 线下公告细分类别（菜单选择，不自定义；线上 category 留空 = 约 jam）
export const NOTICE_CATEGORIES = ["演出", "组队", "租售", "其他"] as const

// 城市/风格选项（与 settings-page 个人信息一致，提取共享）
export const CITIES = ["北京", "上海", "广州", "深圳", "成都", "杭州", "重庆", "武汉", "西安", "南京", "苏州", "天津", "长沙", "郑州", "东莞", "青岛", "沈阳", "宁波", "昆明", "大连", "厦门", "合肥", "佛山", "福州", "哈尔滨", "济南", "温州", "长春", "石家庄", "常州", "泉州", "南宁", "贵阳", "南昌", "太原", "烟台", "嘉兴", "南通", "金华", "徐州", "海口", "乌鲁木齐", "呼和浩特", "银川", "西宁", "兰州", "拉萨", "三亚", "丽江", "大理"]
export const STYLE_OPTIONS = ["摇滚", "民谣", "爵士", "布鲁斯", "放克", "雷鬼", "电子", "古典", "流行", "嘻哈", "R&B", "国风", "金属", "ACG", "Bossa Nova", "实验"]

export const notices: Notice[] = [
  { id: "n1", title: "线下组队·北京 寻贝斯/鼓/键盘", body: "我是吉他手，玩了 8 年金属，现在想组一支稳定排练的乐队。寻贝斯、鼓、键盘各一名，每周固定排练两次，地点在朝阳区。有原创计划，目标是年底登台。", author: "摇滚老张", time: "2026-06-15 14:30", type: "offline", city: "北京", style: "金属", bgIndex: 3 },
  { id: "n2", title: "今晚 8 点 Blues 线上即兴", body: "求贝斯 + 鼓手，今晚八点开麦线上 Jam，曲目偏慢速布鲁斯，氛围轻松，新手也欢迎。", author: "蓝调小王", time: "2026-06-16 10:00", type: "online", city: "线上", style: "布鲁斯", bgIndex: 7 },
  { id: "n3", title: "周六上海 Livehouse 演出招观众", body: "本周六晚在静安一家 Livehouse 有演出，三支独立乐队拼盘，门票 80，现场扫码进群领优惠。", author: "Echo乐队", time: "2026-06-14 19:20", type: "offline", city: "上海", style: "摇滚", bgIndex: 11 },
  { id: "n4", title: "线上 Live 直播：民谣之夜", body: "本周日晚 9 点开始线上 Live 直播，纯木吉他 + 人声，分享近期的几首原创民谣，欢迎来听。", author: "南方木吉他", time: "2026-06-13 21:00", type: "online", city: "线上", style: "民谣", bgIndex: 5 },
  { id: "n5", title: "成都爵士三重奏招键盘", body: "成都本地爵士三重奏长期缺一名键盘手，曲目以标准曲为主，有读谱能力优先，每周末玉林一带排练。", author: "锦城爵士", time: "2026-06-12 16:45", type: "offline", city: "成都", style: "爵士", bgIndex: 9 },
  { id: "n6", title: "电子音乐线上拼贴 Jam", body: "想找几位玩合成器和采样的朋友一起做线上电子拼贴，远程协作，输出一张合辑。", author: "合成器幽灵", time: "2026-06-11 23:10", type: "online", city: "线上", style: "电子", bgIndex: 14 },
  { id: "n7", title: "杭州放克乐队招主唱", body: "杭州一支放克乐队招一名有舞台表现力的主唱，要求节奏感强、能带动现场，有演出计划。", author: "钱塘放克", time: "2026-06-10 13:00", type: "offline", city: "杭州", style: "放克", bgIndex: 2 },
  { id: "n8", title: "深圳地下嘻哈开放麦", body: "本周五深圳南山一家小酒馆开放麦，欢迎 rapper 上台，beat 自带或现场选，先到先得。", author: "湾区韵脚", time: "2026-06-09 20:30", type: "offline", city: "深圳", style: "嘻哈", bgIndex: 16 },
  { id: "n9", title: "线上 Live：古典吉他小品集", body: "周三晚线上 Live，弹一组古典吉他小品，从巴洛克到现代，安静地听一晚音乐。", author: "六弦居士", time: "2026-06-08 21:30", type: "online", city: "线上", style: "古典", bgIndex: 6 },
  { id: "n10", title: "广州国风跨界组队", body: "想做国风与现代编曲的跨界项目，寻笛、琵琶、鼓手，广州本地，对传统乐器改编有兴趣的来。", author: "岭南新声", time: "2026-06-07 11:15", type: "offline", city: "广州", style: "国风", bgIndex: 1 },
  { id: "n11", title: "雷鬼线上慢摇 Jam", body: "找几位喜欢雷鬼和 Dub 的朋友线上慢摇，主打松弛感，节奏吉他和贝斯尤其欢迎。", author: "海岛节拍", time: "2026-06-06 22:00", type: "online", city: "线上", style: "雷鬼", bgIndex: 12 },
  { id: "n12", title: "北京流行翻唱乐队招鼓手", body: "北京一支流行翻唱乐队缺常驻鼓手，曲目偏华语金曲，商演机会多，有意私聊。", author: "京味流行", time: "2026-06-05 15:40", type: "offline", city: "北京", style: "流行", bgIndex: 8 },
  { id: "n13", title: "上海仓库 Livehouse 金属之夜", body: "本月底上海一处仓库改造的场地举办金属之夜，四支乐队轮番上场，欢迎重口味乐迷。", author: "钢铁洪流", time: "2026-06-04 18:00", type: "offline", city: "上海", style: "金属", bgIndex: 15 },
  { id: "n14", title: "线上 Live：深夜布鲁斯电台", body: "每周二深夜的线上布鲁斯电台又来了，边弹边聊，点歌也行，欢迎来陪我熬夜。", author: "午夜蓝调", time: "2026-06-03 23:50", type: "online", city: "线上", style: "布鲁斯", bgIndex: 10 },
  { id: "n15", title: "成都民谣围炉夜招吉他手", body: "成都一群民谣爱好者的围炉夜，缺一名能弹能唱的吉他手，氛围温暖，重在交流。", author: "巷子口民谣", time: "2026-06-02 19:30", type: "offline", city: "成都", style: "民谣", bgIndex: 4 },
  { id: "n16", title: "线上爵士即兴工作坊", body: "线上爵士即兴工作坊第三期开启，主题是 ii-V-I 的即兴思路，带上你的乐器一起练。", author: "Swing研习社", time: "2026-06-01 20:00", type: "online", city: "线上", style: "爵士", bgIndex: 13 },
  { id: "n17", title: "深圳电子现场招 VJ", body: "深圳一场电子现场缺一名 VJ 做视觉，能配合 DJ 节奏出画面，作品集发我看看。", author: "霓虹脉冲", time: "2026-05-31 17:20", type: "offline", city: "深圳", style: "电子", bgIndex: 17 },
  { id: "n18", title: "杭州古典与摇滚融合实验", body: "想尝试把弦乐四重奏和摇滚乐队结合的实验项目，杭州，寻小提琴、大提琴及编曲伙伴。", author: "西湖弦音", time: "2026-05-30 14:10", type: "offline", city: "杭州", style: "古典", bgIndex: 6 },
  { id: "n19", title: "线上 Live：放克贝斯专场", body: "周六线上 Live 放克贝斯专场，slap 到底，讲点小技巧，欢迎贝斯手来切磋。", author: "低音怪兽", time: "2026-05-29 21:15", type: "online", city: "线上", style: "放克", bgIndex: 2 },
  { id: "n20", title: "广州嘻哈 Cypher 线下局", body: "广州天河本周日下午嘻哈 Cypher 线下局，自由 freestyle，beatbox 也欢迎加入。", author: "羊城韵社", time: "2026-05-28 16:00", type: "offline", city: "广州", style: "嘻哈", bgIndex: 9 },
  { id: "n21", title: "线上国风合奏招二胡", body: "在做一首国风线上合奏作品，已有古筝和笛子，缺一名二胡，远程录音协作即可。", author: "云水谣", time: "2026-05-27 22:40", type: "online", city: "线上", style: "国风", bgIndex: 5 },
  { id: "n22", title: "北京雷鬼派对找乐手", body: "北京三里屯一场雷鬼主题派对找现场乐手，节奏吉他、键盘、管乐都要，气氛超棒。", author: "京城阳光", time: "2026-05-26 18:50", type: "offline", city: "北京", style: "雷鬼", bgIndex: 11 },
  { id: "n23", title: "线上 Live：流行钢琴弹唱", body: "今晚线上 Live 流行钢琴弹唱，点歌区开放，华语欧美都可以，来点你想听的。", author: "琴键日记", time: "2026-05-25 20:20", type: "online", city: "线上", style: "流行", bgIndex: 7 },
  { id: "n24", title: "上海摇滚现场招吉他手救场", body: "本周末上海一场摇滚现场原吉他手临时有事，急寻一名能快速扒谱救场的吉他手，有酬劳。", author: "魔都之声", time: "2026-05-24 13:30", type: "offline", city: "上海", style: "摇滚", bgIndex: 3 },
  { id: "n25", title: "成都电子线上协作招主唱", body: "成都电子制作人，已有几条 demo，想找一名声线有特点的主唱远程协作，风格偏 future bass。", author: "蓉城脉动", time: "2026-05-23 23:00", type: "online", city: "成都", style: "电子", bgIndex: 16 },
  { id: "n26", title: "深圳民谣小酒馆驻唱招募", body: "深圳福田一家民谣小酒馆招周末驻唱，能弹能唱，曲库够用，待遇面议，氛围安静温馨。", author: "南城谣", time: "2026-05-22 15:10", type: "offline", city: "深圳", style: "民谣", bgIndex: 8 },
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
  trackId: string
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
    trackId: "1",
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
    trackId: "17",
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
    trackId: "18",
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
    trackId: "4",
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

// Deterministic gradient from a seed (nickname), so avatar fallback color is stable per user.
export function hashGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff
  const colors = ['#00AAFF', '#9933FF', '#FF33AA', '#BBEE00', '#00E0A4', '#FF8A3D', '#6A5CFF', '#FF5C5C']
  const c1 = colors[Math.abs(h) % colors.length]
  const c2 = colors[(Math.abs(h) >> 4) % colors.length]
  return `linear-gradient(135deg, ${c1}, ${c2})`
}

// ── 作品库 Track ──

export type TrackType = "rehearsal" | "jam"
export type TrackNature = "original" | "cover"

export interface Track {
  id: string
  title: string
  author: string
  type: TrackType
  nature: TrackNature
  styles: string[]
  instruments: string[]
  plays: number
  likes: number
  comments: number
  isLiked?: boolean
  duration: string
  gradient: string
  date: string
  members: string[]
  coverImage?: string
  mp3Url?: string
}

export function formatCount(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  }
  return String(n)
}

// ── 活跃乐手 Musician ──

export type Musician = {
  id: number
  name: string
  primaryInstrument: string
  secondaryInstrument?: string
  avatarGradient: string
}

export const musicians: Musician[] = [
  { id: 1, name: "老张", primaryInstrument: "🎸", secondaryInstrument: "🎹", avatarGradient: "linear-gradient(135deg, #00AAFF, #9933FF)" },
  { id: 2, name: "小李", primaryInstrument: "🎸", avatarGradient: "linear-gradient(135deg, #9933FF, #FF33AA)" },
  { id: 3, name: "Nina", primaryInstrument: "🎹", avatarGradient: "linear-gradient(135deg, #00AAFF, #FF33AA)" },
  { id: 4, name: "阿强", primaryInstrument: "🥁", avatarGradient: "linear-gradient(135deg, #9933FF, #BBEE00)" },
  { id: 5, name: "小美", primaryInstrument: "🎤", avatarGradient: "linear-gradient(135deg, #FF33AA, #BBEE00)" },
  { id: 6, name: "电音客", primaryInstrument: "🎛️", avatarGradient: "linear-gradient(135deg, #00AAFF, #BBEE00)" },
  { id: 7, name: "提琴手", primaryInstrument: "🎻", avatarGradient: "linear-gradient(135deg, #00AAFF, #9933FF)" },
  { id: 8, name: "MC狗哥", primaryInstrument: "🎤", avatarGradient: "linear-gradient(135deg, #9933FF, #FF33AA)" },
  { id: 9, name: "Blues王", primaryInstrument: "🎸", avatarGradient: "linear-gradient(135deg, #00AAFF, #FF33AA)" },
  { id: 10, name: "六弦居士", primaryInstrument: "🎸", avatarGradient: "linear-gradient(135deg, #9933FF, #BBEE00)" },
  { id: 11, name: "小明", primaryInstrument: "🥁", avatarGradient: "linear-gradient(135deg, #FF33AA, #BBEE00)" },
  { id: 12, name: "老王", primaryInstrument: "🎹", avatarGradient: "linear-gradient(135deg, #00AAFF, #BBEE00)" },
  { id: 13, name: "阿宅", primaryInstrument: "🎸", avatarGradient: "linear-gradient(135deg, #00AAFF, #9933FF)" },
  { id: 14, name: "合成器幽灵", primaryInstrument: "🎛️", avatarGradient: "linear-gradient(135deg, #9933FF, #FF33AA)" },
  { id: 15, name: "城南谣", primaryInstrument: "🎸", avatarGradient: "linear-gradient(135deg, #00AAFF, #FF33AA)" },
  { id: 16, name: "海岛节拍", primaryInstrument: "🥁", avatarGradient: "linear-gradient(135deg, #9933FF, #BBEE00)" },
]
