export type MemberStatus = "owner" | "ready"

export interface RoomMember {
  id: string
  name: string
  instrument: string
  instrumentEmoji: string
  status: MemberStatus
  color: "blue" | "purple" | "pink" | "lime"
}

export type Room = {
  id: string
  name: string
  emoji: string
  style: string
  category: string
  subStyle: string
  description: string
  createdAt: string
  owner: { name: string; color: "blue" | "purple" | "pink" | "lime" }
  ownerOnline: boolean
  instruments: string[]
  current: number
  capacity: number
  latency: number
  isPrivate: boolean
  serverIp: string
  port: number
  members: RoomMember[]
}

export type SubCategory = { id: string; label: string }

export type Category = {
  id: string; label: string; emoji: string; subs: SubCategory[]
}

export const COLOR_MAP: Record<string, string> = {
  blue: "#00aaff", purple: "#9933ff", pink: "#ff33aa", lime: "#bbee00",
}

export const categories: Category[] = [
  { id: 'all', label: '全部', emoji: '🎵', subs: [] },
  { id: 'pop', label: '流行/R&B', emoji: '🎤', subs: [{ id: 'pop', label: '流行' }, { id: 'rnb', label: 'R&B/灵魂乐' }] },
  { id: 'rock', label: '摇滚/金属', emoji: '🎸', subs: [{ id: 'rock', label: '摇滚' }, { id: 'metal', label: '金属/极端' }] },
  { id: 'folk', label: '民谣/乡村', emoji: '🪕', subs: [{ id: 'folk', label: '民谣' }, { id: 'country', label: '乡村' }] },
  { id: 'jazz', label: '爵士/律动', emoji: '🎷', subs: [{ id: 'jazz', label: '爵士' }, { id: 'blues', label: '布鲁斯' }, { id: 'bossa', label: 'Bossa Nova' }, { id: 'funk', label: '放克' }, { id: 'reggae', label: '雷鬼' }] },
  { id: 'electronic', label: '电子/氛围', emoji: '🔌', subs: [{ id: 'electronic', label: '电子' }, { id: 'newage', label: 'New Age' }, { id: 'experimental', label: '实验' }] },
  { id: 'vocal', label: '人声/合唱', emoji: '🎹', subs: [{ id: 'choir', label: '合唱' }] },
  { id: 'special', label: '特色', emoji: '🏮', subs: [{ id: 'guofeng', label: '国风/民乐' }, { id: 'acg', label: 'ACG/动漫' }] },
  { id: 'jam', label: '自由即兴', emoji: '🔀', subs: [] },
]

export const rooms: Room[] = [
  {
    id: '1', name: '周末即兴局', emoji: '🎸', style: '摇滚', category: 'rock', subStyle: 'rock',
    description: '周六晚8点，吉他贝斯鼓都来，主打经典摇滚翻唱和原创即兴。新手老手都欢迎！',
    createdAt: '创建于 2026年6月10日', owner: { name: '小明', color: 'purple' }, ownerOnline: true,
    instruments: ['🎸', '🥁', '🎤'], current: 3, capacity: 6, latency: 28, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm1', name: '小明', instrument: '吉他', instrumentEmoji: '🎸', status: 'owner', color: 'purple' },
      { id: 'm2', name: '阿豪', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'blue' },
      { id: 'm3', name: '小雪', instrument: '主唱', instrumentEmoji: '🎤', status: 'ready', color: 'pink' },
    ],
  },
  {
    id: '2', name: '爵士之夜', emoji: '🎷', style: '爵士', category: 'jazz', subStyle: 'jazz',
    description: '标准爵士曲目即兴，欢迎各种乐器加入。',
    createdAt: '创建于 2026年6月9日', owner: { name: '老王', color: 'blue' }, ownerOnline: true,
    instruments: ['🎷', '🎹', '🥁'], current: 4, capacity: 6, latency: 30, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm2-1', name: '老王', instrument: '萨克斯', instrumentEmoji: '🎷', status: 'owner', color: 'blue' },
      { id: 'm2-2', name: '小林', instrument: '钢琴', instrumentEmoji: '🎹', status: 'ready', color: 'purple' },
      { id: 'm2-3', name: '大壮', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'pink' },
      { id: 'm2-4', name: 'Cathy', instrument: '贝斯', instrumentEmoji: '🎸', status: 'ready', color: 'lime' },
    ],
  },
  {
    id: '3', name: '流行翻唱小组', emoji: '🎤', style: '流行', category: 'pop', subStyle: 'pop',
    description: '本周曲目《起风了》，一起来排练。',
    createdAt: '创建于 2026年6月8日', owner: { name: '小美', color: 'pink' }, ownerOnline: false,
    instruments: ['🎤', '🎸'], current: 2, capacity: 6, latency: 26, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm3-1', name: '小美', instrument: '主唱', instrumentEmoji: '🎤', status: 'owner', color: 'pink' },
      { id: 'm3-2', name: '阿杰', instrument: '吉他', instrumentEmoji: '🎸', status: 'ready', color: 'blue' },
    ],
  },
  {
    id: '4', name: '金属排练房', emoji: '🎸', style: '金属', category: 'rock', subStyle: 'metal',
    description: '双吉他鼓贝斯，缺主唱！',
    createdAt: '创建于 2026年6月7日', owner: { name: '阿强', color: 'purple' }, ownerOnline: true,
    instruments: ['🎸', '🎸', '🥁', '🎸'], current: 4, capacity: 6, latency: 32, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm4-1', name: '阿强', instrument: '主音吉他', instrumentEmoji: '🎸', status: 'owner', color: 'purple' },
      { id: 'm4-2', name: '铁柱', instrument: '节奏吉他', instrumentEmoji: '🎸', status: 'ready', color: 'blue' },
      { id: 'm4-3', name: '大鹏', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'pink' },
      { id: 'm4-4', name: '老黄', instrument: '贝斯', instrumentEmoji: '🎸', status: 'ready', color: 'lime' },
    ],
  },
  {
    id: '5', name: '民谣弹唱夜', emoji: '🪕', style: '民谣', category: 'folk', subStyle: 'folk',
    description: '木吉他+口琴，轻松弹唱夜晚。',
    createdAt: '创建于 2026年6月6日', owner: { name: '小李', color: 'lime' }, ownerOnline: true,
    instruments: ['🎸', '🎤'], current: 2, capacity: 6, latency: 27, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm5-1', name: '小李', instrument: '吉他', instrumentEmoji: '🎸', status: 'owner', color: 'lime' },
      { id: 'm5-2', name: '小芳', instrument: '主唱', instrumentEmoji: '🎤', status: 'ready', color: 'pink' },
    ],
  },
  {
    id: '6', name: 'Funk Night', emoji: '🎸', style: '放克', category: 'jazz', subStyle: 'funk',
    description: 'Groove is everything!',
    createdAt: '创建于 2026年6月5日', owner: { name: '贝斯手老张', color: 'blue' }, ownerOnline: true,
    instruments: ['🎸', '🥁', '🎤'], current: 3, capacity: 6, latency: 25, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm6-1', name: '贝斯手老张', instrument: '贝斯', instrumentEmoji: '🎸', status: 'owner', color: 'blue' },
      { id: 'm6-2', name: '鼓手阿华', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'purple' },
      { id: 'm6-3', name: 'Vicky', instrument: '主唱', instrumentEmoji: '🎤', status: 'ready', color: 'pink' },
    ],
  },
  {
    id: '7', name: '动漫OP翻奏', emoji: '🎹', style: 'ACG', category: 'special', subStyle: 'acg',
    description: '鬼灭/咒术/巨人OP从头翻到尾。',
    createdAt: '创建于 2026年6月4日', owner: { name: '阿宅', color: 'pink' }, ownerOnline: true,
    instruments: ['🎸', '🎹', '🥁'], current: 3, capacity: 6, latency: 26, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm7-1', name: '阿宅', instrument: '键盘', instrumentEmoji: '🎹', status: 'owner', color: 'pink' },
      { id: 'm7-2', name: '小新', instrument: '吉他', instrumentEmoji: '🎸', status: 'ready', color: 'blue' },
      { id: 'm7-3', name: '咚咚', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'lime' },
    ],
  },
  {
    id: '8', name: 'Bossa午后', emoji: '🎷', style: 'Bossa Nova', category: 'jazz', subStyle: 'bossa',
    description: '下午茶时间，轻柔的Bossa Nova。',
    createdAt: '创建于 2026年6月3日', owner: { name: 'Nina', color: 'lime' }, ownerOnline: false,
    instruments: ['🎸', '🎤', '🎹'], current: 3, capacity: 6, latency: 30, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm8-1', name: 'Nina', instrument: '主唱', instrumentEmoji: '🎤', status: 'owner', color: 'lime' },
      { id: 'm8-2', name: 'Carlos', instrument: '吉他', instrumentEmoji: '🎸', status: 'ready', color: 'purple' },
      { id: 'm8-3', name: '小野', instrument: '钢琴', instrumentEmoji: '🎹', status: 'ready', color: 'pink' },
    ],
  },
  {
    id: '9', name: '国风合奏', emoji: '🏮', style: '国风/民乐', category: 'special', subStyle: 'guofeng',
    description: '古筝+笛子+吉他改编古风曲目。',
    createdAt: '创建于 2026年6月2日', owner: { name: '小月', color: 'pink' }, ownerOnline: true,
    instruments: ['🎹', '🎻'], current: 2, capacity: 6, latency: 29, isPrivate: false,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm9-1', name: '小月', instrument: '古筝', instrumentEmoji: '🎹', status: 'owner', color: 'pink' },
      { id: 'm9-2', name: '阿竹', instrument: '笛子', instrumentEmoji: '🎻', status: 'ready', color: 'blue' },
    ],
  },
  {
    id: '10', name: '乐队B内部排练', emoji: '🎸', style: '摇滚', category: 'rock', subStyle: 'rock',
    description: '仅限乐队成员内部排练。',
    createdAt: '创建于 2026年6月1日', owner: { name: '张队', color: 'purple' }, ownerOnline: true,
    instruments: ['🎸', '🥁', '🎤', '🎹'], current: 4, capacity: 4, latency: 24, isPrivate: true,
    serverIp: '39.96.30.128', port: 22124,
    members: [
      { id: 'm10-1', name: '张队', instrument: '吉他', instrumentEmoji: '🎸', status: 'owner', color: 'purple' },
      { id: 'm10-2', name: '阿猛', instrument: '鼓', instrumentEmoji: '🥁', status: 'ready', color: 'blue' },
      { id: 'm10-3', name: '小琪', instrument: '主唱', instrumentEmoji: '🎤', status: 'ready', color: 'pink' },
      { id: 'm10-4', name: '阿辉', instrument: '键盘', instrumentEmoji: '🎹', status: 'ready', color: 'lime' },
    ],
  },
]
