const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
// 1029 env 持久化（照搬 admin 的 .env 机制，零依赖版）：JWT_SECRET/ADMIN_INTERNAL_KEY 等此前只活在
// 旧进程环境里（dump.pm2 不存=机器重启即丢，JWT 会落回下方 dev 兜底=全员掉登录+token 可伪造）。
// 已在环境里的键优先（pm2 ecosystem 注入不覆盖）；.env 仅服务器存在（600），永不进 git。
try {
  const envFile = require('path').join(__dirname, '.env')
  if (require('fs').existsSync(envFile)) {
    for (const line of require('fs').readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
} catch (e) {}
const http = require("http")
const { Server } = require("socket.io")
const { spawn, execFile } = require('child_process')
const promisify = require('util').promisify
// ⭐ 1029 房间隔离宪法：同步子进程/同步密码学调用会冻结整个事件循环=任何房间触发全站所有房间一起卡
//   （鼓机启动实测冻结 5.394s）。本进程 execSync 已全数退役（仅剩 aliyun.env/rpc密钥两处 64 字节级
//   readFileSync=微秒，非冻结源）；重活一律 execFileAsync（数组参数，零 shell 注入面）或独立子进程。
//   子进程内部（manage-jamsoul 等）用 sync 合法——进程边界=防火墙。
const execFileAsync = promisify(execFile)
const { Pool, types: pgTypes } = require('pg')
// 1025 雪花前置: BIGINT 列默认被驱动解析为 string——jamony 的 bigint 恒 < 2^53(迷你雪花),
// 全局解析回 number, 旧代码(parseInt 严格比较/JWT number 载荷)零改动
pgTypes.setTypeParser(20, (v) => parseInt(v, 10))
const net = require('net')
const fs = require('fs')
const path = require('path')
const multer = require('multer')

const app = express()
app.set('trust proxy', 1)  // nginx 反代，从 X-Forwarded-For 取真实 IP（限频用）
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: true, credentials: true } })
const PORT = 3001

const pool = new Pool({
  user: 'jamony_api',
  password: 'jamony2026api',
  host: 'localhost',
  database: 'jamony',
  port: 5432,
})

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

/* multer — 发表作品文件上传 */
const worksDir = '/var/jamony/works'
try { if (!fs.existsSync(worksDir)) fs.mkdirSync(worksDir, { recursive: true }) } catch (e) { console.error('Works dir error:', e) }
const upload = multer({ dest: worksDir, limits: { fileSize: 50 * 1024 * 1024 } })

/* multer — 头像上传（独立目录，前端 canvas 裁剪后的 1:1 真图） */
const avatarsDir = '/var/jamony/avatars'
try { if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true }) } catch (e) { console.error('Avatars dir error:', e) }
const avatarUpload = multer({ dest: avatarsDir, limits: { fileSize: 10 * 1024 * 1024 } })

/* multer — 申诉截图上传（1023 七件套③: 可选单图; 机密取证目录, 不挂公开静态路由, admin 工作台 4b 经鉴权端点取） */
const appealsDir = '/var/jamony/appeals'
try { if (!fs.existsSync(appealsDir)) fs.mkdirSync(appealsDir, { recursive: true }) } catch (e) { console.error('Appeals dir error:', e) }
const appealUpload = multer({ dest: appealsDir, limits: { fileSize: 10 * 1024 * 1024 } })

/* multer — 公告牌图片上传（不裁剪，直接存原图，前端 CSS object-fit 适配卡片） */
const noticesDir = '/var/jamony/notices'
try { if (!fs.existsSync(noticesDir)) fs.mkdirSync(noticesDir, { recursive: true }) } catch (e) { console.error('Notices dir error:', e) }
const noticeImageUpload = multer({ dest: noticesDir, limits: { fileSize: 10 * 1024 * 1024 } })

/* multer — 房间投谱上传（10-07 魔盒 P1：图片/PDF；P2 加 GP 谱，排练物料，房间解散即清，不进作品库）
   按房间码分目录存，随机文件名保留后缀（sendFile 靠后缀出 Content-Type） */
const scoresDir = '/var/jamony/scores'
try { if (!fs.existsSync(scoresDir)) fs.mkdirSync(scoresDir, { recursive: true }) } catch (e) { console.error('Scores dir error:', e) }
const SCORE_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gp', '.gpx', '.gp3', '.gp4', '.gp5', '.musicxml', '.mxl', '.capx']
const GP_EXTS = ['.gp', '.gpx', '.gp3', '.gp4', '.gp5']
/* 需要服务端转 MIDI 的谱子格式（GP 全系 + MusicXML/Capella——古典乐手 Sibelius/MuseScore 习惯，欢哥 10-07 拍板放行）
   musicxml/mxl 已真枪解析验证；capx 走 alphaTab 官方 Capella 解析器，坏文件返回明确报错 */
const CONVERT_EXTS = [...GP_EXTS, '.musicxml', '.mxl', '.capx']

/* multer — program 背景轨上传（1015 开工，1014 方案定稿：高质量伴奏音频，8 轨上限 10M/轨欢哥拍板）
   排练物料语义同 scores：按房间码分目录、随机文件名保留后缀、房间解散即清、不进作品库
   播放走 ffmpeg amix（混音快照烤进命令）→ jack-stdin → 幽灵乐手（1015 干跑实测闭环：48k s16le stereoline） */
const programsDir = '/var/jamony/programs'
try { if (!fs.existsSync(programsDir)) fs.mkdirSync(programsDir, { recursive: true }) } catch (e) { console.error('Programs dir error:', e) }
const PROGRAM_EXTS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a']
const PROGRAM_MAX_TRACKS = 8

/* alphaTab — GP 谱服务端转换（10-07 P2 步骤②前置：GP→MIDI 走 fluidsynth→幽灵乐手，音频单源=欢哥架构定稿）
   ScoreLoader→MidiFileGenerator→toBinary 与 alphaTab 浏览器播放器同一条生成代码路径，时值无损 */
// GP 烤制（1029 P2 抽 lib/gp-bake*.js，worker 线程执行——纯 JS CPU 计算曾占主事件循环亚秒级，
// 房间隔离宪法：任何房间的烤制不得冻全站）。主进程经 gpToMidiAsync 调用，签名/语义与原 gpToMidi 一致。
const { gpToMidiAsync } = require('./lib/gp-bake-async')

// GP 混音状态清洗：mutes/solos=去重轨索引数组(<64)，vols=轨索引→0-100；后动作胜出故只做形状约束
function sanitizeGpMix(mix) {
  const clean = { mutes: [], solos: [], vols: {} }
  if (!mix || typeof mix !== 'object') return clean
  const ints = (a) => Array.isArray(a) ? [...new Set(a.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 64))] : []
  clean.mutes = ints(mix.mutes)
  clean.solos = ints(mix.solos)
  if (mix.vols && typeof mix.vols === 'object') {
    for (const [k, v] of Object.entries(mix.vols)) {
      const i = Number(k)
      const p = Math.round(Number(v))
      if (Number.isInteger(i) && i >= 0 && i < 64 && Number.isFinite(p)) clean.vols[i] = Math.min(100, Math.max(0, p))
    }
  }
  return clean
}

// GP 倍速档白名单（10-10 步骤⑤）：逐档照搬 alphaTab 官网 demo 控制栏（index.html .at-speed-options 九档）；
// 首版我自拟五档+百分比格式被欢哥问倒，查证后照抄；非白名单一律退 1
const GP_SPEEDS = [0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]
function sanitizeGpSpeed(v) {
  const n = Number(v)
  return GP_SPEEDS.includes(n) ? n : 1
}
const scoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const code = String(req.params.code || '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!code) return cb(new Error('房间码无效'))
      const dir = path.join(scoresDir, code)
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { return cb(e) }
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      cb(null, `score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${SCORE_EXTS.includes(ext) ? ext : ''}`)
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },  // 1013 欢哥定稿：单个 ≤10MB（前端同口径）
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (SCORE_EXTS.includes(ext)) cb(null, true)
    else cb(new Error('仅支持 PDF/PNG/JPG/WEBP 格式'))
  }
})
const programUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const code = String(req.params.code || '').replace(/[^a-zA-Z0-9_-]/g, '')
      if (!code) return cb(new Error('房间码无效'))
      const dir = path.join(programsDir, code)
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { return cb(e) }
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase()
      cb(null, `prog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${PROGRAM_EXTS.includes(ext) ? ext : ''}`)
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },  // 1014 欢哥定稿：10M/轨，鼓励 mp3（对硬盘容量负责）
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    if (PROGRAM_EXTS.includes(ext)) cb(null, true)
    else cb(new Error('仅支持 MP3/WAV/OGG/FLAC/M4A 格式'))
  }
})

// 1029 异步化：pbkdf2Sync 600k 迭代≈100-300ms 全站冻结（任何用户登录时其他房间抖）；改线程池异步
const pbkdf2Async = promisify(crypto.pbkdf2).bind(crypto)

async function verifyPassword(password, hashStr) {
  const parts = hashStr.split(':')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false
  const digest = parts[1]
  const iterations = parseInt(parts[2])
  const salt = parts[3]
  const storedHash = Buffer.from(parts[4], 'base64')
  const derivedKey = await pbkdf2Async(password, salt, iterations, storedHash.length, digest)
  return crypto.timingSafeEqual(derivedKey, storedHash)
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const iterations = 600000
  const key = await pbkdf2Async(password, salt, iterations, 32, 'sha256')
  return `pbkdf2:sha256:${iterations}:${salt}:${key.toString('base64')}`
}

// room_code：8位去易混淆字符集（去 0/O/1/I/L），crypto 随机生成
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateRoomCode() {
  const bytes = crypto.randomBytes(8)
  let s = ''
  for (let i = 0; i < 8; i++) s += CODE_CHARS[bytes[i] % 32]
  return s
}

// 按 room_code 查房间 id（大小写容错），id 退为内部 FK
async function getRoomIdByCode(code) {
  const r = await pool.query('SELECT id FROM rooms WHERE UPPER(room_code)=UPPER($1)', [code])
  return r.rows.length > 0 ? r.rows[0].id : null
}

// ========== 频率限制（内存计数器，内测期够用；公测可换 Redis）==========
const rateBuckets = new Map()  // key -> {count, resetAt}
function rateCheck(key, limit, windowMs) {
  const now = Date.now()
  const b = rateBuckets.get(key)
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  b.count++
  return b.count <= limit
}

const loginFailBuckets = new Map()  // nickname -> {count, lockUntil}
function recordLoginFail(nickname) {
  const f = loginFailBuckets.get(nickname) || { count: 0, lockUntil: 0 }
  f.count++
  if (f.count >= 5) f.lockUntil = Date.now() + 15 * 60 * 1000  // 连续失败5次锁15分钟
  loginFailBuckets.set(nickname, f)
}
function isAccountLocked(nickname) {
  const f = loginFailBuckets.get(nickname)
  return !!(f && f.lockUntil && f.lockUntil > Date.now())
}
function clearLoginFail(nickname) {
  loginFailBuckets.delete(nickname)
}

// 活跃乐手榜 60s 内存缓存（所有客户端共享一份；策展型模块无需实时；仅缓存规范请求 page=1&limit=16）
const activeMusiciansCache = { data: null, expiresAt: 0 }

// ========== JWT 鉴权基础设施 ==========
const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'jamony-dev-secret-change-in-prod'
const COOKIE_NAME = 'jamony_token'
const TOKEN_MAX_AGE = 7 * 24 * 3600 * 1000  // 7 天

// 解析 cookie（express 不内置，手写避免装 cookie-parser）
function parseCookies(req) {
  const list = {}
  const rc = req.headers.cookie
  if (!rc) return list
  rc.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=')
    if (k) list[k] = v.join('=')
  })
  return list
}

// 签 JWT + Set httpOnly cookie
function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' })
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: TOKEN_MAX_AGE,
    sameSite: 'lax',
    // secure: true,  // 公测 HTTPS 启用
  })
}

// 鉴权中间件：验 cookie JWT → req.userId；滑动续期（剩余<1天重签 cookie）
// 在线维度（1022）：认证通过即"在线"，节流更新 users.last_seen_at（每用户每分钟至多一次 UPDATE）
const lastSeenMap = new Map() // userId -> 上次写库 ts
function touchLastSeen(userId) {
  const now = Date.now()
  if (now - (lastSeenMap.get(userId) || 0) < 60000) return
  lastSeenMap.set(userId, now)
  pool.query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [userId]).catch(() => {})
  if (lastSeenMap.size > 5000) { // 顺手清扫过期项，防长跑膨胀
    for (const [uid, ts] of lastSeenMap) if (now - ts > 10 * 60000) lastSeenMap.delete(uid)
  }
}

// banned 拦截缓存: userId → {v, at}; 60s TTL(封/解封最迟 1 分钟生效), 防膨胀同 touchLastSeen 清扫
// requireAuth/optionalAuth 每请求查一次 restriction, 缓存兜住 DB 压力
// 1024: 到期惰性恢复集中地——restricted(限发N天)/demoted(降级N天)/banned(定时封号N天) 过期顺手回 normal。
// 原先恢复只埋在发布守卫, 降级用户到期后第一件事是进房弹琴, 那条路没有恢复逻辑; 集中到此后全路径统一
// (无期限封号 restricted_until=NULL, 天然不进恢复条件, 零误伤)
const restrictionCache = new Map()
async function getUserRestriction(userId) {
  const hit = restrictionCache.get(userId)
  if (hit && Date.now() - hit.at < 60000) return hit.v
  const r = await pool.query('SELECT restriction, restricted_until FROM users WHERE id=$1', [userId])
  let v = r.rows[0] ? r.rows[0].restriction : 'normal'
  if ((v === 'restricted' || v === 'demoted' || v === 'banned') && r.rows[0].restricted_until
      && new Date(r.rows[0].restricted_until).getTime() <= Date.now()) {
    await pool.query(
      `UPDATE users SET restriction='normal', restricted_until=NULL, restricted_at=NULL WHERE id=$1 AND restriction=$2`,
      [userId, v]
    ).catch(() => {})
    v = 'normal'
  }
  restrictionCache.set(userId, { v, at: Date.now() })
  if (restrictionCache.size > 5000) {
    const now = Date.now()
    for (const [uid, e] of restrictionCache) if (now - e.at > 60000) restrictionCache.delete(uid)
  }
  return v
}

// 会话解析共用体: 验签 JWT → req.userId/nickname + 滑续期 cookie; 返回 decoded, 失败返 null(已回 401)
function parseSession(req, res) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) { res.status(401).json({ ok: false, msg: '未登录' }); return null }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.id
    req.nickname = decoded.nickname
    const remaining = decoded.exp * 1000 - Date.now()
    if (remaining < 24 * 3600 * 1000) {
      const newToken = jwt.sign({ id: decoded.id, nickname: decoded.nickname }, JWT_SECRET, { expiresIn: '7d' })
      res.cookie(COOKIE_NAME, newToken, { httpOnly: true, maxAge: TOKEN_MAX_AGE, sameSite: 'lax' })
    }
    return decoded
  } catch (e) {
    res.status(401).json({ ok: false, msg: '登录已过期' })
    return null
  }
}

// 1023 七件套⑧: 封号拦截——requireAuth 对 banned 一律 401{code:'BANNED'}, web 据此跳拦截页(含申诉表单)
function requireAuth(req, res, next) {
  const decoded = parseSession(req, res)
  if (!decoded) return
  getUserRestriction(decoded.id).then((restriction) => {
    if (restriction === 'banned') return res.status(401).json({ ok: false, code: 'BANNED', msg: '该账号已被封禁' })
    touchLastSeen(decoded.id)
    next()
  }).catch(() => res.status(401).json({ ok: false, msg: '登录已过期' }))
}

// 申诉专用鉴权(⑦封号申诉权): 与 requireAuth 同, 唯一区别=banned 放行——封号用户的会话只够提交/查看申诉, 其余端点全被上面拦死
function requireAuthAllowBanned(req, res, next) {
  const decoded = parseSession(req, res)
  if (!decoded) return
  touchLastSeen(decoded.id)
  next()
}

// 可选鉴权：解析 cookie JWT → req.userId；未登录/失败不拦截（req.userId=null），保持端点公开
// 持有效登录逛大厅也是"在线"（口径：任意已认证请求）——验证成功即 touch
// banned 例外(1023): 401{code:'BANNED'}——封号用户不得出现在"在线"口径里, web 拦截页接走
function optionalAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) { req.userId = null; req.nickname = null; return next() }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    getUserRestriction(decoded.id).then((restriction) => {
      if (restriction === 'banned') return res.status(401).json({ ok: false, code: 'BANNED', msg: '该账号已被封禁' })
      req.userId = decoded.id
      req.nickname = decoded.nickname
      touchLastSeen(decoded.id)
      next()
    }).catch(() => { req.userId = null; req.nickname = null; next() })
  } catch (e) {
    req.userId = null
    req.nickname = null
    next()
  }
}

/* ========== 内容机审（1023 内容安全 A 阶段，lib/moderation.js 引擎）==========
   三态语义: reject=硬拦不放行(不写内容库) / suspect=放行+写 moderation_logs 供 admin 疑似流巡查(零人工) / pass=放行
   fail-open: 引擎异常或日志写入失败一律放行, 绝不阻塞业务发布链路 */
const { moderateText } = require('./lib/moderation')
// 1025 迷你雪花: 暴露面主实体显式发号(15-16位长数字,JS安全域); 日志类表保留SERIAL
const { nextId } = require('./lib/snowflake')
const { probeMaxVolumeDb } = require('./lib/probe-volume')
const MODERATION_REJECT_MSG = '内容包含违规信息，请修改后重发'

// 返回 true=放行, false=拒绝; kind: notice|notice_comment|work|work_comment|room|theme|chat|message
async function moderatePublishText(kind, targetId, userId, nickname, text) {
  const channel = CHANNEL_OF_KIND[kind] || 'publish'
  let verdict = 'pass'
  let hits = []
  try {
    const r = moderateText(text)
    verdict = r.verdict
    hits = r.hits
  } catch (e) {
    console.error('[moderation] 引擎异常, fail-open 放行:', e.message)
    return true
  }
  if (verdict === 'reject') {
    // 1024 欢哥拍板: 拒绝尝试也入库——试门锁的人(不管换词还是换内容)频繁尝试就是心怀不轨,
    // 防的罚的就是这种人; 否则对只发广告词留案底的人不公平。全文取证仅存服务端私密表。
    try {
      await pool.query(
        `INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel)
         VALUES ($1,$2,$3,$4,$5,'reject',$6,$7)`,
        [kind, String(targetId == null ? '' : targetId), userId || null, nickname || '', String(text || ''), JSON.stringify(hits), channel]
      )
      console.log(`[moderation] 拒绝发布(已留痕) kind=${kind} ch=${channel} user=${userId}(${nickname}) hits=${hits.length}`)
    } catch (e) {
      console.error('[moderation] 拒绝日志写入失败(仍拦截):', e.message)
    }
    await checkRejectEscalation(userId, channel) // 拒绝计数升级: 高危词试锁累计→直接限发(跳过watch); 各渠道独立计数
    return false
  }
  if (verdict === 'suspect') {
    try {
      await pool.query(
        `INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel)
         VALUES ($1,$2,$3,$4,$5,'suspect',$6,$7)`,
        [kind, String(targetId == null ? '' : targetId), userId || null, nickname || '', String(text || ''), JSON.stringify(hits), channel]
      )
      console.log(`[moderation] 疑似标记 kind=${kind} ch=${channel} user=${userId}(${nickname}) hits=${hits.length}`)
    } catch (e) {
      console.error('[moderation] 疑似日志写入失败(不阻塞发布):', e.message)
    }
    await checkSuspectEscalation(userId, channel) // 滑窗计数+自动升级(normal→watch→restricted); 各渠道独立计数
  }
  return true
}

/* ===== 图片双管审核(1024 图片线): OCR文字→现成词库引擎 + 图像本体→内容审核增强版 =====
   两管并行, 任一拒绝级=拒传; 任一疑似=放行+标记计数; 双管皆故障=fail-open放行(与文本引擎同哲学)
   verdict 语义/入库/升级链与 moderatePublishText 完全同构, 汇入同一五级阶梯 */
let aliyunAkCache
function getAliyunKeys() {
  if (aliyunAkCache !== undefined) return aliyunAkCache
  try {
    const t = fs.readFileSync('/var/jamony/aliyun.env', 'utf8')
    const id = (t.match(/^ALIYUN_ACCESS_KEY_ID=(.+)$/m) || [])[1]
    const sec = (t.match(/^ALIYUN_ACCESS_KEY_SECRET=(.+)$/m) || [])[1]
    const nls = (t.match(/^ALIYUN_NLS_APPKEY=(.+)$/m) || [])[1]
    aliyunAkCache = (id && sec) ? { id: id.trim(), secret: sec.trim(), nlsAppKey: nls ? nls.trim() : null } : null
  } catch (e) { aliyunAkCache = null }
  if (!aliyunAkCache) console.error('[moderation] 阿里云密钥未配置(/var/jamony/aliyun.env), 图片审核 fail-open')
  return aliyunAkCache
}

let ALIYUN_SDK
function getAliyunSDK() {
  if (ALIYUN_SDK) return ALIYUN_SDK
  const keys = getAliyunKeys()
  if (!keys) return null
  const OCR = require('@alicloud/ocr-api20210707')
  const Green = require('@alicloud/green20220302')
  const { Config } = require('@alicloud/openapi-client')
  ALIYUN_SDK = {
    ocr: new OCR.default(new Config({ accessKeyId: keys.id, accessKeySecret: keys.secret, endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com' })),
    OCRReq: OCR.RecognizeAllTextRequest,
    green: new Green.default(new Config({ accessKeyId: keys.id, accessKeySecret: keys.secret, endpoint: 'green-cip.cn-beijing.aliyuncs.com' })),
    GreenReq: Green.ImageModerationRequest,
  }
  return ALIYUN_SDK
}

// 返回 true=放行, false=拒绝; kind 走 CHANNEL_OF_KIND 渠道
async function moderateImage(kind, filePath, userId, nickname) {
  console.log(`[moderation] 图片审核开始 kind=${kind}`)
  const channel = CHANNEL_OF_KIND[kind] || 'publish'
  const sdk = getAliyunSDK()
  if (!sdk) return true
  // 双管并行: OCR(本地流) + 图像审核(公网URL, 文件须已落到静态路由可寻址路径)
  const [ocrR, imgR] = await Promise.allSettled([
    sdk.ocr.recognizeAllText(new sdk.OCRReq({ body: fs.createReadStream(filePath), type: 'General' })),
    sdk.green.imageModeration(new sdk.GreenReq({ service: 'baselineCheck', serviceParameters: JSON.stringify({ imageUrl: 'http://123.57.33.130' + filePath.replace('/var/jamony', '') }) })),
  ])
  // 管一: OCR 文本 → 词库引擎(词在 data.content 汇总字段, wideBlocks 分块仅兜底——1024 E2E 破案)
  let ocrVerdict = 'pass', ocrHits = [], ocrText = ''
  if (ocrR.status === 'fulfilled') {
    try {
      const d = (ocrR.value.body && ocrR.value.body.data) || {}
      const sub = d.subImages || []
      ocrText = (String(d.content || '') || sub.flatMap((s) => (s.wideBlocks || []).map((b) => b.words)).join(' ')).slice(0, 300)
      if (ocrText) {
        const r = moderateText(ocrText)
        ocrVerdict = r.verdict
        ocrHits = r.hits
      }
    } catch (e) { console.error('[moderation] 图片OCR结果解析失败(该管忽略):', e.message) }
  } else { console.error('[moderation] 图片OCR调用失败(该管忽略):', String(ocrR.reason).slice(0, 120)) }
  // 管二: 图像本体 → riskLevel 映射三态
  let imgVerdict = 'pass', riskLevel = '', imgTips = ''
  if (imgR.status === 'fulfilled') {
    try {
      const d = (imgR.value.body && imgR.value.body.data) || {}
      riskLevel = d.riskLevel || ''
      imgTips = JSON.stringify((d.reason && d.reason.riskTips) || []).slice(0, 200)
      if (riskLevel === 'block') imgVerdict = 'reject'
      else if (riskLevel === 'review' || riskLevel === 'recognitionLoading') imgVerdict = 'suspect'
    } catch (e) { console.error('[moderation] 图片审核结果解析失败(该管忽略):', e.message) }
  } else { console.error('[moderation] 图片审核调用失败(该管忽略):', String(imgR.reason).slice(0, 120)) }
  // 双管皆故障 → fail-open
  if (ocrR.status === 'rejected' && imgR.status === 'rejected') {
    console.error('[moderation] 图片双管全故障, fail-open 放行 kind=' + kind)
    return true
  }
  // 合并判定(拒绝级最重) + 入库 + 升级链(与文本同构)
  const verdict = ocrVerdict === 'reject' || imgVerdict === 'reject' ? 'reject'
    : (ocrVerdict === 'suspect' || imgVerdict === 'suspect') ? 'suspect' : 'pass'
  if (verdict === 'pass') return true
  const evidence = `[图片] OCR:"${ocrText.slice(0, 150)}" | 图像:${riskLevel}${imgTips}`
  try {
    await pool.query(
      `INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel)
       VALUES ($1,'',$2,$3,$4,$5,$6,$7)`,
      [kind, userId || null, nickname || '', evidence, verdict, JSON.stringify(ocrHits.length ? ocrHits : [riskLevel || 'ocr']), channel]
    )
    console.log(`[moderation] 图片${verdict === 'reject' ? '拒传(已留痕)' : '疑似标记'} kind=${kind} ch=${channel} user=${userId}(${nickname})`)
  } catch (e) { console.error('[moderation] 图片日志写入失败:', e.message) }
  if (verdict === 'reject') { await checkRejectEscalation(userId, channel); return false }
  await checkSuspectEscalation(userId, channel)
  return true
}

/* ===== 作品音频审核(1024 音频线, 欢哥定稿A模式) =====
   发布不阻塞但音频锁定: 卡片仅本人/署名乐手可见挂"审核中"角标, 审毕通过才进公域+解锁试听
   ASR转写→词库: pass/suspect=解锁(suspect照常计数), reject=自动下架+计数+通知指路申诉
   ASR故障=fail-hold(保持pending, 兜底扫描每5分钟补审超10分钟的滞留任务) */
const workAudioInFlight = new Set()

async function submitWorkAudioReview(workId) {
  if (workAudioInFlight.has(workId)) return
  workAudioInFlight.add(workId)
  let reviewMp3 = null
  try {
    const w = await pool.query("SELECT id, title, mp3_path, publisher_user_id, audio_review FROM works WHERE id=$1", [workId])
    const row = w.rows[0]
    if (!row || !row.mp3_path || row.audio_review !== 'pending') return
    const keys = getAliyunKeys()
    if (!keys || !keys.nlsAppKey) { console.error(`[moderation] 作品${workId}音频审核: NLS AppKey未配置, 保持审核中`); return }
    // ASR 仅支持 16k——转码审核副本(单声道mp3), 审完即删, 原作不动
    reviewMp3 = row.mp3_path.replace(/\.mp3$/i, '') + '-review16k.mp3'
    try {
      // 1029 异步化：原 execSync 同步转码=发表作品时全站冻结数秒~数十秒（120s 超时上限）——房间隔离事故主体之一
      await execFileAsync('ffmpeg', ['-y', '-i', row.mp3_path, '-ar', '16000', '-ac', '1', '-b:a', '64k', reviewMp3, '-loglevel', 'error'], { timeout: 120000 })
    } catch (e) { console.error(`[moderation] 作品${workId}审核副本转码失败, 保持审核中:`, e.message); return }
    const fileLink = 'http://123.57.33.130' + reviewMp3.replace('/var/jamony/works', '/works')
    const NLSClient = require('@alicloud/nls-filetrans-2018-08-17')
    const nls = new NLSClient({ accessKeyId: keys.id, accessKeySecret: keys.secret, endpoint: 'https://filetrans.cn-beijing.aliyuncs.com' })
    const sub = await nls.submitTask({ Task: JSON.stringify({ appkey: keys.nlsAppKey, file_link: fileLink, version: '4.0' }) })
    if (sub.StatusText !== 'SUCCESS') { console.error(`[moderation] 作品${workId}ASR提交失败(${sub.StatusText}), 保持审核中`); return }
    // 轮询: 3s×60(3分钟上限)
    let text = '', statusText = ''
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const q = await nls.getTaskResult({ TaskId: sub.TaskId })
      statusText = q.StatusText
      if (statusText === 'SUCCESS') { text = ((q.Result && q.Result.sentences) || []).map((s) => s.text).join(' ').slice(0, 500); break }
      if (statusText === 'SUCCESS_WITH_NO_VALID_FRAGMENT') { text = ''; break } // 纯器乐无人声=正常放行
      if (statusText !== 'RUNNING' && statusText !== 'QUEUED' && statusText !== 'QUEUEING') break
    }
    if (statusText !== 'SUCCESS' && statusText !== 'SUCCESS_WITH_NO_VALID_FRAGMENT') {
      console.error(`[moderation] 作品${workId}ASR异常态(${statusText}), 保持审核中待兜底补审`)
      return
    }
    // 转写文本→词库(与文本线同引擎)
    let verdict = 'pass', hits = []
    if (text) { const r = moderateText(text); verdict = r.verdict; hits = r.hits }
    const channel = CHANNEL_OF_KIND['work_audio'] || 'publish'
    if (verdict === 'reject') {
      await pool.query("UPDATE works SET status='taken_down', audio_review='rejected', audio_transcript=$2, audio_reviewed_at=NOW(), asr_task_id=$3 WHERE id=$1 AND audio_review='pending'", [workId, text.slice(0, 400), String(sub.TaskId || '')])
      try {
        await pool.query(`INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel) VALUES ('work_audio',$1,$2,$3,$4,'reject',$5,$6)`,
          [String(workId), row.publisher_user_id, '', `[音频转写]${text.slice(0, 200)}`, JSON.stringify(hits), channel])
      } catch (e) { console.error('[moderation] 音频日志写入失败:', e.message) }
      const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [row.publisher_user_id])
      const cfg = await getModerationConfig()
      await createNotification({ recipientId: row.publisher_user_id, type: 'restriction', message: `您的作品《${row.title}》因音频内容违规已被自动下架。如认为误判，您可以到个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）。请您注意在jamony的行为规范。` })
      console.log(`[moderation] 作品${workId}音频审核拒绝→自动下架(发布者${row.publisher_user_id}${u.rows[0] ? '(' + u.rows[0].nickname + ')' : ''})`)
      await checkRejectEscalation(row.publisher_user_id, channel)
    } else {
      // 1025 ASR 审计留痕(欢哥: 监管问"是否审核过"须能自证)——转写文本+审毕时间+云侧TaskId 与作品同行, pass/reject 同档留证
      await pool.query("UPDATE works SET audio_review='passed', audio_transcript=$2, audio_reviewed_at=NOW(), asr_task_id=$3 WHERE id=$1 AND audio_review='pending'", [workId, text.slice(0, 400), String(sub.TaskId || '')])
      if (verdict === 'suspect') {
        try {
          await pool.query(`INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel) VALUES ('work_audio',$1,$2,$3,$4,'suspect',$5,$6)`,
            [String(workId), row.publisher_user_id, '', `[音频转写]${text.slice(0, 200)}`, JSON.stringify(hits), channel])
        } catch (e) { console.error('[moderation] 音频日志写入失败:', e.message) }
        await checkSuspectEscalation(row.publisher_user_id, channel)
        console.log(`[moderation] 作品${workId}音频审核疑似→放行+标记`)
      } else {
        console.log(`[moderation] 作品${workId}音频审核通过${text ? '(含人声)' : '(纯器乐)'}`)
      }
    }
  } catch (e) {
    console.error(`[moderation] 作品${workId}音频审核异常, 保持审核中待兜底:`, e.message)
  } finally {
    workAudioInFlight.delete(workId)
    if (reviewMp3) { try { fs.unlinkSync(reviewMp3) } catch (e) {} }
  }
}

// 兜底扫描: pending超10分钟重提(进程重启丢任务/ASR故障滞留的都由这里自愈)
setInterval(async () => {
  try {
    const r = await pool.query("SELECT id FROM works WHERE audio_review='pending' AND created_at < NOW() - INTERVAL '10 minutes' AND mp3_path IS NOT NULL AND mp3_path <> '' LIMIT 10")
    for (const row of r.rows) submitWorkAudioReview(row.id)
  } catch (e) { /* 静默: 下轮再试 */ }
}, 5 * 60 * 1000).unref()

/* ===== 累计升级 + 限发守卫（1023 内容安全 A 阶段 Step3）=====
   滑窗计数: normal 疑似累计≥阈值→watch(观察); watch 期间再犯→restricted(限发 N 天, 到期自动恢复)
   阈值全部来自 site_config 'moderation_config'(jsonb: {threshold,window_days,restrict_days}), 5分钟缓存, 无配置用默认 */
// 1024 Step5: 全套量刑参数进配置中心(admin 只授权超级管理员); watchReturn/autoDemote/autoBan/cycle/round 五键为同日去硬编码升格
// 1024 Step6: 渠道分组(欢哥定稿)——门面(publish)=公告牌/作品/房间名简介/推送主题, 流动(interact)=评论/聊天/私信(预留)
// 分组按内容性质不按传输通道(推送主题走socket但属门面); 判定参数与计数分渠道独立可配, 处罚阶梯共享(封的是人不是渠道)
const MODERATION_DEFAULTS = { threshold: 5, windowDays: 90, restrictDays: 7, appealDays: 3, rejectThreshold: 5, watchReturnDays: 30, autoDemoteDays: 7, demoteCycleThreshold: 3, autoBanDays: 7, autoBanPermanentRound: 3, interactThreshold: 5, interactWindowDays: 90, interactRejectThreshold: 5, streamSampleIntervalMin: 30, streamSampleSeconds: 60, streamDissolveThreshold: 3, maxActiveRooms: 15, roomCreateHourlyLimit: 5 }
const CHANNEL_OF_KIND = { notice: 'publish', work: 'publish', room: 'publish', theme: 'publish', notice_image: 'publish', avatar: 'publish', work_cover: 'publish', work_audio: 'publish', score_image: 'publish', score: 'publish', notice_comment: 'interact', work_comment: 'interact', chat: 'interact', message: 'interact', chords: 'interact' }
let moderationCfgCache = { data: MODERATION_DEFAULTS, at: 0 }

async function getModerationConfig() {
  if (Date.now() - moderationCfgCache.at < 5 * 60 * 1000) return moderationCfgCache.data
  try {
    const r = await pool.query(`SELECT value FROM site_config WHERE key = 'moderation_config'`)
    let v = r.rows[0] && r.rows[0].value
    if (typeof v === 'string') v = JSON.parse(v) // 兼容 text 写入
    if (v && typeof v === 'object') {
      moderationCfgCache.data = {
        threshold: Number(v.threshold) || MODERATION_DEFAULTS.threshold,
        windowDays: Number(v.window_days) || MODERATION_DEFAULTS.windowDays,
        restrictDays: Number(v.restrict_days) || MODERATION_DEFAULTS.restrictDays,
        appealDays: Number(v.appeal_days) || MODERATION_DEFAULTS.appealDays, // 1023 欢哥拍板: 申诉期 3 天(锚定处罚生效时刻, 与惩罚时长解耦)
        rejectThreshold: Number(v.reject_threshold) || MODERATION_DEFAULTS.rejectThreshold, // 1024 欢哥拍板: 高危词试锁累计阈值, 达标直接限发
        watchReturnDays: Number(v.watch_return_days) || MODERATION_DEFAULTS.watchReturnDays, // 观察期无新疑似回归正常
        autoDemoteDays: Number(v.auto_demote_days) || MODERATION_DEFAULTS.autoDemoteDays, // 二进宫自动降级时长
        demoteCycleThreshold: Number(v.demote_cycle_threshold) || MODERATION_DEFAULTS.demoteCycleThreshold, // 几次降级触发自动封号
        autoBanDays: Number(v.auto_ban_days) || MODERATION_DEFAULTS.autoBanDays, // 自动封号时长(终审前各轮)
        autoBanPermanentRound: Number(v.auto_ban_permanent_round) || MODERATION_DEFAULTS.autoBanPermanentRound, // 第几轮起无期限
        interactThreshold: Number(v.interact_threshold) || MODERATION_DEFAULTS.interactThreshold, // 流动渠道(评论/聊天)疑似阈值
        interactWindowDays: Number(v.interact_window_days) || MODERATION_DEFAULTS.interactWindowDays,
        interactRejectThreshold: Number(v.interact_reject_threshold) || MODERATION_DEFAULTS.interactRejectThreshold,
        streamSampleIntervalMin: Number(v.stream_sample_interval_min) || MODERATION_DEFAULTS.streamSampleIntervalMin, // 房间推流抽检间隔(分)
        streamSampleSeconds: Number(v.stream_sample_seconds) || MODERATION_DEFAULTS.streamSampleSeconds, // 每次采样时长(秒)
        streamDissolveThreshold: Number(v.stream_dissolve_threshold) || MODERATION_DEFAULTS.streamDissolveThreshold, // 熔断阈值(采样不过审次数)
        maxActiveRooms: Number(v.max_active_rooms) || MODERATION_DEFAULTS.maxActiveRooms, // 运营闸门(暂混居此配置,参数多了再拆): 并发活跃房上限=收割者搭档, 防每房150-300MB资源耗尽OOM; 默认15=升配扳机(12-15房)之下留余量
        roomCreateHourlyLimit: Number(v.room_create_hourly_limit) || MODERATION_DEFAULTS.roomCreateHourlyLimit, // 1026 建房频率闸: 每账号每小时建房间数上限——B闸限并发不限频率, 防「建-散-建」churn 打进程spawn
      }
    } else {
      moderationCfgCache.data = MODERATION_DEFAULTS
    }
  } catch (e) {
    moderationCfgCache.data = MODERATION_DEFAULTS
  }
  moderationCfgCache.at = Date.now()
  return moderationCfgCache.data
}

// 降级落地+三轮累犯自动封号(1024 自动化闭环: 人工demote与二进宫自动降级共用同一条通道, 第三次落地自动封号)
async function applyDemoteEscalation(userId, days, cfg, actor, isAuto) {
  const upd = await pool.query(
    `UPDATE users SET restriction='demoted', restricted_until=${days ? `NOW() + ($2 || ' days')::interval` : 'NULL'}, restricted_at=NOW(), demoted_count=demoted_count+1, demote_cycle_count=demote_cycle_count+1
     WHERE id=$1 RETURNING restricted_until, demoted_count, demote_cycle_count, auto_ban_rounds`,
    days ? [userId, String(days)] : [userId]
  )
  const row = upd.rows[0]
  // 本轮第3次降级落地即升级封号(覆盖降级只发一条通知); 第1/2轮=定时, 终审轮起=无期限(轮次天数全部走配置)
  if (row.demote_cycle_count >= cfg.demoteCycleThreshold) {
    const permanent = row.auto_ban_rounds >= cfg.autoBanPermanentRound - 1
    const banUpd = await pool.query(
      `UPDATE users SET restriction='banned', restricted_until=${permanent ? 'NULL' : `NOW() + ($2 || ' days')::interval`}, restricted_at=NOW(), banned_count=banned_count+1, demote_cycle_count=0, auto_ban_rounds=auto_ban_rounds+1
       WHERE id=$1 RETURNING restricted_until, auto_ban_rounds`,
      permanent ? [userId] : [userId, String(cfg.autoBanDays)]
    )
    restrictionCache.set(userId, { v: 'banned', at: Date.now() })
    kickUserSockets(userId) // 1024 BANNED识别: 自动封号同样即时断连+客户端杀jamsoul
    const bu = banUpd.rows[0].restricted_until ? new Date(banUpd.rows[0].restricted_until) : null
    const bDate = bu ? `${bu.getMonth() + 1}月${bu.getDate()}日` : ''
    await createNotification({ recipientId: userId, type: 'restriction', message: bu
      ? `您已多次被降级（累计3次），系统已自动封禁该账号，将于${bDate}自动解封。您仍可提交申诉（处罚生效后${cfg.appealDays}天内有效）。请您注意在jamony的行为规范。`
      : `您已多次被降级（累计3次），系统已自动永久封禁该账号，此处罚不会自动解除，您仍可提交申诉（处罚生效后${cfg.appealDays}天内有效）。请您注意在jamony的行为规范。` })
    console.log(`[moderation] 用户${userId}三轮降级累犯→自动封号(第${banUpd.rows[0].auto_ban_rounds}轮, ${permanent ? '无期限' : '7天'}) by ${actor}`)
    return { autoBanned: true, rounds: banUpd.rows[0].auto_ban_rounds, restrictedUntil: banUpd.rows[0].restricted_until }
  }
  restrictionCache.set(userId, { v: 'demoted', at: Date.now() })
  const until = row.restricted_until ? new Date(row.restricted_until) : null
  const dateStr = until ? `${until.getMonth() + 1}月${until.getDate()}日` : ''
  const appealTail = until
    ? `，将于${dateStr}自动解除。您可以到个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）`
    : `。此处罚不会自动解除，如有异议请前往个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）`
  const prefix = isAuto ? '由于您在发布限制解除后再次违规，' : '因为违规，'
  await createNotification({ recipientId: userId, type: 'restriction', message: `${prefix}您已被降级为听众，只能以听众身份进入房间，发布功能已被限制${appealTail}。请您注意在jamony的行为规范。` })
  console.log(`[moderation] 用户${userId}降级(${isAuto ? '二进宫自动' : '人工'}${until ? `, ${days}天` : ', 无期限'}) by ${actor}`)
  return { autoBanned: false, demotedCount: row.demoted_count, restrictedUntil: row.restricted_until }
}

// 疑似入库后调用: 滑窗计数 + 自动升级(normal→watch→restricted); channel 各渠道独立计数与阈值(1024 Step6)
async function checkSuspectEscalation(userId, channel = 'publish') {
  if (!userId) return
  try {
    const cfg = await getModerationConfig()
    const th = channel === 'interact' ? cfg.interactThreshold : cfg.threshold
    const win = channel === 'interact' ? cfg.interactWindowDays : cfg.windowDays
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM moderation_logs
       WHERE user_id=$1 AND verdict='suspect' AND channel=$2 AND created_at > NOW() - ($3 || ' days')::interval`,
      [userId, channel, String(win)]
    )
    const cur = await pool.query('SELECT restriction FROM users WHERE id=$1', [userId])
    const restriction = cur.rows[0] ? cur.rows[0].restriction : 'normal'
    if (restriction === 'normal' && cnt.rows[0].c >= th) {
      await pool.query(`UPDATE users SET restriction='watch' WHERE id=$1 AND restriction='normal'`, [userId])
      console.log(`[moderation] 用户${userId}进入观察名单(疑似滑窗累计${cnt.rows[0].c}次/阈值${cfg.threshold})`)
      // ①处罚站内信: watch 档=预警(无功能限制), 提醒规范+预告再犯后果
      await createNotification({ recipientId: userId, type: 'restriction', message: `系统注意到您近期发布的内容多次触发疑似标记。请您留意在jamony的行为规范，若继续违规，发布功能将被限制。` })
    } else if (restriction === 'watch' && cnt.rows[0].c > th) {
      // 1024 欢哥: 二进宫自动降级——限发解禁后再犯(restricted_count≥1)不再给限发, 直接送降级通道(与人工降级同链, 满三轮自动封号)
      const rc = await pool.query('SELECT restricted_count FROM users WHERE id=$1', [userId])
      if (rc.rows[0] && rc.rows[0].restricted_count >= 1) {
        await applyDemoteEscalation(userId, cfg.autoDemoteDays, cfg, 'system', true)
        return
      }
      const upd = await pool.query(
        `UPDATE users SET restriction='restricted', restricted_until=NOW() + ($2 || ' days')::interval, restricted_at=NOW(), restricted_count=restricted_count+1
         WHERE id=$1 AND restriction='watch' RETURNING restricted_until`,
        [userId, String(cfg.restrictDays)]
      )
      console.log(`[moderation] 用户${userId}限发${cfg.restrictDays}天(观察名单内再犯, 滑窗累计${cnt.rows[0].c}次)`)
      restrictionCache.set(userId, { v: 'restricted', at: Date.now() }) // 进程内缓存即时同步
      // ①处罚站内信: restricted 档, 文案与 403 同源+申诉提示(日期取 DB RETURNING, 单一事实源)
      const until = new Date(upd.rows[0].restricted_until)
      const dateStr = `${until.getMonth() + 1}月${until.getDate()}日`
      await createNotification({ recipientId: userId, type: 'restriction', message: `因发布内容违规频繁，系统已限制您的部分功能，将于${dateStr}自动解除。您可以到个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）。请您注意在jamony的行为规范。` })
    }
  } catch (e) {
    console.error('[moderation] 升级检查失败(不影响发布):', e.message)
  }
}

// 拒绝尝试入库后调用(1024 欢哥拍板): 高危词试锁独立计数, 累计≥阈值 → 直接限发(跳过watch档,
// 发广告词的还有观察缓冲, 碰核心词的不配); 误伤由申诉兜底。与疑似计数分开——混算后"3广告+2涉政"该判哪档说不清
async function checkRejectEscalation(userId, channel = 'publish') {
  if (!userId) return
  try {
    const cfg = await getModerationConfig()
    const rth = channel === 'interact' ? cfg.interactRejectThreshold : cfg.rejectThreshold
    const rwin = channel === 'interact' ? cfg.interactWindowDays : cfg.windowDays
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM moderation_logs
       WHERE user_id=$1 AND verdict='reject' AND channel=$2 AND created_at > NOW() - ($3 || ' days')::interval`,
      [userId, channel, String(rwin)]
    )
    if (cnt.rows[0].c < rth) return
    const cur = await pool.query('SELECT restriction FROM users WHERE id=$1', [userId])
    const restriction = cur.rows[0] ? cur.rows[0].restriction : 'normal'
    if (restriction === 'restricted' || restriction === 'demoted' || restriction === 'banned') return // 已在处罚态, 不重置计时
    const upd = await pool.query(
      `UPDATE users SET restriction='restricted', restricted_until=NOW() + ($2 || ' days')::interval, restricted_at=NOW(), restricted_count=restricted_count+1
       WHERE id=$1 RETURNING restricted_until`,
      [userId, String(cfg.restrictDays)]
    )
    console.log(`[moderation] 用户${userId}限发${cfg.restrictDays}天(高危词试锁累计${cnt.rows[0].c}次/阈值${rth} 渠道${channel}, 直接跳档)`)
    restrictionCache.set(userId, { v: 'restricted', at: Date.now() })
    const until = new Date(upd.rows[0].restricted_until)
    const dateStr = `${until.getMonth() + 1}月${until.getDate()}日`
    await createNotification({ recipientId: userId, type: 'restriction', message: `因多次尝试发布严重违规内容，系统已限制您的部分功能，将于${dateStr}自动解除。您可以到个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）。请您注意在jamony的行为规范。` })
  } catch (e) {
    console.error('[moderation] 拒绝升级检查失败(不影响拦截):', e.message)
  }
}

// 限发守卫: restricted(未过期)/demoted/banned 不可发布(restricted/demoted 到期恢复已集中到 getUserRestriction)
// 受限时直接以此处文案回 403(带具体解封日期, 欢哥 1023 定稿文案), 返回 true=可发布
// 1023 七件套②: 403 带 code:'RESTRICTED', web 错误层据此弹受限专用 Dialog(文案+申诉入口)
async function guardCanPublish(userId, res) {
  if (!userId) return true
  try {
    // watch 回归(观察名单 N 天无新疑似→恢复正常; 惰性, 发布时顺手判; N=配置 watchReturnDays, 1024 Step5 去硬编码)
    const cfg = await getModerationConfig()
    await pool.query(
      `UPDATE users SET restriction='normal'
       WHERE id=$1 AND restriction='watch'
       AND NOT EXISTS (SELECT 1 FROM moderation_logs WHERE user_id=$1 AND verdict='suspect' AND created_at > NOW() - ($2 || ' days')::interval)`,
      [userId, String(cfg.watchReturnDays)]
    )
    const r = await pool.query(
      `SELECT restriction, restricted_until FROM users WHERE id=$1 AND restriction IN ('restricted','demoted','banned')
       AND (restricted_until IS NULL OR restricted_until > NOW())`,
      [userId]
    )
    if (r.rows.length === 0) return true
    const row = r.rows[0]
    // 1024 欢哥: 所有提醒文案带申诉有效期(处罚生效后N天, 配置中心取), 不让用户过期了才知道
    const appealHint = `您可以到个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）。`
    if (row.restriction === 'restricted' && row.restricted_until) {
      const d = new Date(row.restricted_until)
      const dateStr = `${d.getMonth() + 1}月${d.getDate()}日`
      res.status(403).json({ ok: false, code: 'RESTRICTED', msg: `因发布内容违规频繁，系统已限制您的部分功能，将于${dateStr}自动解除。${appealHint}请您注意在jamony的行为规范。` })
    } else if (!row.restricted_until) {
      // 1024 欢哥: 无期限处罚必须明示"不会自动解除", 不让用户误以为有期限只是没告知
      const noAutoHint = `此处罚不会自动解除，如有异议请前往个人主页-申诉进行申诉（处罚生效后${cfg.appealDays}天内有效）。`
      res.status(403).json({ ok: false, code: 'RESTRICTED', msg: `因发布违规内容，您的部分功能已被限制。${noAutoHint}请您注意在jamony的行为规范。` })
    } else {
      res.status(403).json({ ok: false, code: 'RESTRICTED', msg: `因发布违规内容，您的部分功能已被限制。${appealHint}请您注意在jamony的行为规范。` })
    }
    return false
  } catch (e) {
    return true // fail-open: 守卫查询异常不拦发布
  }
}

// ========== 申诉（1023 七件套③④⑦: 理由必填+截图可选; 3天时限锚定处罚生效; banned 豁免放行） ==========
app.post('/api/appeals', requireAuthAllowBanned, appealUpload.single('screenshot'), async (req, res) => {
  try {
    const reason = String(req.body?.reason ?? '').trim()
    if (reason.length < 10) return res.status(400).json({ ok: false, msg: '请写清申诉理由（至少 10 个字）' })
    if (reason.length > 1000) return res.status(400).json({ ok: false, msg: '申诉理由过长（≤1000 字）' })

    // 可申诉态: restricted/demoted/banned(watch 无功能限制, 无可申诉之实)
    const u = await pool.query('SELECT nickname, restriction, restricted_at, restricted_until FROM users WHERE id=$1', [req.userId])
    if (u.rows.length === 0) return res.status(400).json({ ok: false, msg: '用户不存在' })
    const user = u.rows[0]
    if (!['restricted', 'demoted', 'banned'].includes(user.restriction)) {
      return res.status(400).json({ ok: false, msg: '当前账号状态正常，无需申诉' })
    }

    // 申诉期 = 处罚生效时刻起 appeal_days 天(默认3, 欢哥 1023 拍板: 与惩罚时长解耦); restricted_at 为空(历史处置)从宽放行
    const cfg = await getModerationConfig()
    if (user.restricted_at && new Date(user.restricted_at).getTime() < Date.now() - cfg.appealDays * 24 * 3600 * 1000) {
      return res.status(403).json({ ok: false, msg: `申诉期为处罚生效后${cfg.appealDays}天内，您的申诉期已过` })
    }

    // 防滥用按"处罚周期"计(1024 欢哥抓漏): 只数本轮处罚(restricted_at)之后的申诉——
    // 解禁后再犯=新周期=新申诉权, 旧周期的申诉不占额度; restricted_at 为空(历史数据)退化为全局判定
    const since = user.restricted_at || null
    const pend = await pool.query(
      `SELECT id FROM appeals WHERE user_id=$1 AND status='pending' AND (created_at > $2 OR $2 IS NULL)`,
      [req.userId, since]
    )
    if (pend.rows.length > 0) return res.status(429).json({ ok: false, msg: '本轮处罚您已有一条申诉在审核中，请耐心等待处理' })
    const recent = await pool.query(
      `SELECT id FROM appeals WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 day' AND (created_at > $2 OR $2 IS NULL)`,
      [req.userId, since]
    )
    if (recent.rows.length > 0) return res.status(429).json({ ok: false, msg: '每天仅可提交一次申诉，请明天再试' })

    // 截图(可选): 仅收图片; multer 随机名+补扩展名; 机密目录不公开静态服务
    let screenshotPath = null
    if (req.file) {
      if (!/^image\//.test(req.file.mimetype || '')) {
        try { fs.unlinkSync(req.file.path) } catch (e) {}
        return res.status(400).json({ ok: false, msg: '截图仅支持图片文件' })
      }
      const m = (req.file.originalname || '').toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)
      const ext = m ? m[1].replace('jpeg', 'jpg') : 'png'
      const finalPath = `${req.file.path}.${ext}`
      try { fs.renameSync(req.file.path, finalPath) } catch (e) {}
      screenshotPath = finalPath
    }

    // 处罚快照(防事后争议): 处置状态+生效/到期时刻+滑窗疑似计数
    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM moderation_logs WHERE user_id=$1 AND verdict='suspect' AND created_at > NOW() - ($2 || ' days')::interval`,
      [req.userId, String(cfg.windowDays)]
    )
    const snapshot = { restriction: user.restriction, restricted_at: user.restricted_at, restricted_until: user.restricted_until, suspect_count: cnt.rows[0].c }

    const ins = await pool.query(
      `INSERT INTO appeals (user_id, nickname, reason, screenshot_path, snapshot) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [req.userId, user.nickname, reason, screenshotPath, JSON.stringify(snapshot)]
    )
    res.json({ ok: true, appeal: ins.rows[0] })
  } catch (e) {
    console.error('appeal submit error:', e.message)
    res.status(500).json({ ok: false, msg: '提交失败，稍后再试' })
  }
})

// 我的申诉列表(④进度页数据源; banned 会话可达=封号用户看得见处理结果, ⑤回执在 banned 场景的唯一通道)
// 1024: 附 punishment{restriction, appeal_deadline, appeal_days}——申诉tab/封号页据此显示截止日期/过期态
app.get('/api/my-appeals', requireAuthAllowBanned, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, status, reason, (screenshot_path IS NOT NULL) AS has_screenshot, reject_reason, created_at, handled_at
       FROM appeals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [req.userId]
    )
    let punishment = null
    const cfg = await getModerationConfig()
    const u = await pool.query('SELECT restriction, restricted_at, restricted_until FROM users WHERE id=$1', [req.userId])
    const row = u.rows[0]
    if (row && ['restricted', 'demoted', 'banned'].includes(row.restriction) && row.restricted_at) {
      const deadline = new Date(new Date(row.restricted_at).getTime() + cfg.appealDays * 24 * 3600 * 1000)
      punishment = { restriction: row.restriction, restricted_until: row.restricted_until, appeal_deadline: deadline.toISOString(), appeal_days: cfg.appealDays }
    }
    res.json({ ok: true, appeals: r.rows, punishment })
  } catch (e) {
    console.error('my-appeals error:', e.message)
    res.status(500).json({ ok: false, msg: '加载失败' })
  }
})

// ========== 登录 ==========
app.post('/api/login', async (req, res) => {
  try {
    if (!rateCheck(`login:${req.ip}`, 10, 3600 * 1000)) {
      return res.status(429).json({ ok: false, msg: '尝试过于频繁，请1小时后再试' })
    }
    const { nickname, password } = req.body
    if (!nickname || !password) {
      return res.status(400).json({ ok: false, msg: '请输入用户名和密码' })
    }
    if (isAccountLocked(nickname)) {
      const f = loginFailBuckets.get(nickname)
      const min = Math.ceil((f.lockUntil - Date.now()) / 60000)
      return res.status(429).json({ ok: false, msg: `账号已锁定，${min}分钟后重试` })
    }

    const result = await pool.query('SELECT * FROM users WHERE nickname = $1', [nickname])
    if (result.rows.length === 0) {
      recordLoginFail(nickname)
      return res.status(401).json({ ok: false, msg: '用户名或密码错误' })
    }

    const user = result.rows[0]
    if (!(await verifyPassword(password, user.password_hash))) {
      recordLoginFail(nickname)
      return res.status(401).json({ ok: false, msg: '用户名或密码错误' })
    }

    clearLoginFail(nickname)
    // ⑦封号申诉权(1023): banned 照发会话(申诉端点放行), 响应带 banned 标记 → web 跳拦截页(其余端点已被 requireAuth 拦死)
    const banRow = await pool.query('SELECT restriction FROM users WHERE id=$1', [user.id])
    if (banRow.rows[0] && banRow.rows[0].restriction === 'banned') {
      setAuthCookie(res, { id: user.id, nickname: user.nickname })
      return res.json({ ok: true, banned: true, msg: '该账号已被封禁，相关功能已被冻结。您仍可提交申诉。' })
    }
    const userPayload = {
      id: user.id,
      nickname: user.nickname,
      avatarIndex: user.avatar_index,
      avatarUrl: user.avatar_url ? user.avatar_url.replace('/var/jamony/avatars', '/avatars') : '', // 08-30 修复: 登录响应补头像, 顶栏此前显示渐变兜底
      bio: user.bio,
      city: user.city,
      primaryInstrument: user.primary_instrument,
      instrumentCategory: user.instrument_category || '',
      secondaryInstrument: user.secondary_instrument || '',
      level: user.level,
      points: user.points,
    }
    setAuthCookie(res, userPayload)
    res.json({ ok: true, user: userPayload })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 注册 ==========
app.post('/api/register', async (req, res) => {
  try {
    if (!rateCheck(`register:${req.ip}`, 5, 3600 * 1000)) {
      return res.status(429).json({ ok: false, msg: '注册过于频繁，请1小时后再试' })
    }
    const { nickname, password, primaryInstrument, instrumentCategory } = req.body
    if (!nickname || !password || !primaryInstrument) {
      return res.status(400).json({ ok: false, msg: '请填写所有必填项' })
    }
    if (nickname.length < 2 || nickname.length > 16) {
      return res.status(400).json({ ok: false, msg: '昵称长度 2-16 个字符' })
    }
    // jamony 1018: 注册密码下限 6→8(欢哥:更安全;改密码端点同步)
    if (password.length < 8) {
      return res.status(400).json({ ok: false, msg: '密码至少 8 位' })
    }

    // jamony 10-18 欢哥拍板: 官方品牌保护——昵称包含 jamony(不分大小写)一律拒绝,
    // 提示语与重名规则一致(不暴露封禁原因,防冒充官方); jamony-looper 等系统用户名同受此规则覆盖
    if (nickname.toLowerCase().includes('jamony')) {
      return res.status(409).json({ ok: false, msg: '该昵称已被注册' })
    }

    // 机审：注册昵称过词库闸（1023 内容安全；拒绝级直接拒，疑似级放行+标记）
    if (!(await moderatePublishText('profile', null, null, nickname, nickname))) {
      return res.status(400).json({ ok: false, msg: '昵称包含违规信息，请更换' })
    }

    // 查重
    const exist = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname])
    if (exist.rows.length > 0) {
      return res.status(409).json({ ok: false, msg: '该昵称已被注册' })
    }

    const hash = await hashPassword(password)
    const avatar = Math.floor(Math.random() * 30) + 1

    const cat = instrumentCategory || primaryInstrument
    const newUserId = nextId() // 1025 雪花: 显式发号
    const result = await pool.query(
      `INSERT INTO users (id, nickname, password_hash, primary_instrument, instrument_category, avatar_index, bio, city, level, points)
       VALUES ($6, $1, $2, $3, $5, $4, '', '', 1, 0)
       RETURNING nickname, avatar_index, avatar_url, bio, city, primary_instrument, instrument_category, level, points`,
      [nickname, hash, primaryInstrument, avatar, cat, newUserId]
    )

    const user = { id: newUserId, ...result.rows[0] }
    const userPayload = {
      id: user.id,
      nickname: user.nickname,
      avatarIndex: user.avatar_index,
      avatarUrl: user.avatar_url ? user.avatar_url.replace('/var/jamony/avatars', '/avatars') : '', // 08-30 修复: 与 login 同步补头像
      bio: user.bio || '',
      city: user.city || '',
      primaryInstrument: user.primary_instrument,
      instrumentCategory: user.instrument_category || '',
      secondaryInstrument: '',
      level: user.level,
      points: user.points,
    }
    setAuthCookie(res, userPayload)
    res.json({ ok: true, user: userPayload })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 登出（清 cookie）==========
app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME)
  res.json({ ok: true })
})

// ========== 当前活跃房间（10-06 漫游改造：壳层 mount 查询，决定顶栏"回到房间/断开房间"显隐） ==========
app.get('/api/my-active-room', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.room_code, r.name, r.host_id, rm.role,
              (SELECT COUNT(*) FROM room_members rm2 WHERE rm2.room_id = r.id AND rm2.role = 'musician')::int AS musician_count
       FROM room_members rm JOIN rooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND r.status NOT IN ('closed','archived')`,
      [req.userId]
    )
    if (r.rows.length === 0) return res.json({ ok: true, room: null })
    res.json({ ok: true, room: r.rows[0] })
  } catch (err) {
    console.error('My active room error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 当前登录态（前端刷新恢复用）==========
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nickname, avatar_index, avatar_url, bio, signature, styles, city, primary_instrument, instrument_category, secondary_instrument, level, points, restriction FROM users WHERE id=$1',
      [req.userId]
    )
    if (result.rows.length === 0) return res.status(401).json({ ok: false, msg: '用户不存在' })
    const u = result.rows[0]
    res.json({
      ok: true,
      user: {
        id: u.id,
        nickname: u.nickname,
        avatarIndex: u.avatar_index,
        avatarUrl: u.avatar_url ? u.avatar_url.replace('/var/jamony/avatars', '/avatars') : '',
        bio: u.bio || '',
        signature: u.signature || '',
        styles: u.styles || [],
        city: u.city || '',
        primaryInstrument: u.primary_instrument,
        instrumentCategory: u.instrument_category || '',
        secondaryInstrument: u.secondary_instrument || '',
        level: u.level,
        points: u.points,
        restriction: u.restriction || 'normal', // 1024: 申诉tab据此显示提交表单
      }
    })
  } catch (err) {
    console.error('Me error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取单个用户 ==========
app.get('/api/users/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.bio, u.signature, u.city, u.primary_instrument, u.instrument_category, u.secondary_instrument,
              u.styles, u.avatar_index, u.avatar_url, u.level, u.points, u.created_at,
              (SELECT COUNT(*) FROM work_authors wa WHERE wa.user_id = u.id AND (wa.is_anonymous = FALSE OR $2 = u.id))::int AS works_count,
              (SELECT COALESCE(SUM(w.likes), 0) FROM works w JOIN work_authors wa ON wa.work_id = w.id WHERE wa.user_id = u.id AND (wa.is_anonymous = FALSE OR $2 = u.id))::int AS total_likes,
              (SELECT COUNT(*) FROM follows WHERE followee_id = u.id)::int AS followers_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = u.id)::int AS following_count,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following,
              u.follow_list_private
       FROM users u WHERE u.id = $1`, [id, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    const userRow = result.rows[0]
    if (userRow.avatar_url) userRow.avatar_url = userRow.avatar_url.replace('/var/jamony/avatars', '/avatars')
    // 关注/粉丝列表隐私：非本人且私密时，隐藏 count（前端显示 --）
    if (userRow.follow_list_private && req.userId !== parseInt(id)) {
      userRow.followers_count = null
      userRow.following_count = null
    }
    res.json({ ok: true, user: userRow })
  } catch (err) {
    console.error('User fetch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 按昵称获取用户 ==========
app.get('/api/users/by-nickname/:nickname', optionalAuth, async (req, res) => {
  try {
    const { nickname } = req.params
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.bio, u.signature, u.city, u.primary_instrument, u.instrument_category, u.secondary_instrument,
              u.styles, u.avatar_index, u.avatar_url, u.level, u.points, u.created_at,
              (SELECT COUNT(*) FROM work_authors wa WHERE wa.user_id = u.id AND (wa.is_anonymous = FALSE OR $2 = u.id))::int AS works_count,
              (SELECT COALESCE(SUM(w.likes), 0) FROM works w JOIN work_authors wa ON wa.work_id = w.id WHERE wa.user_id = u.id AND (wa.is_anonymous = FALSE OR $2 = u.id))::int AS total_likes,
              (SELECT COUNT(*) FROM follows WHERE followee_id = u.id)::int AS followers_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = u.id)::int AS following_count,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following,
              u.follow_list_private
       FROM users u WHERE u.nickname = $1`, [nickname, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    const userRow = result.rows[0]
    if (userRow.avatar_url) userRow.avatar_url = userRow.avatar_url.replace('/var/jamony/avatars', '/avatars')
    if (userRow.follow_list_private && req.userId !== userRow.id) {
      userRow.followers_count = null
      userRow.following_count = null
    }
    res.json({ ok: true, user: userRow })
  } catch (err) {
    console.error('User fetch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取用户列表（分页） ==========
app.get('/api/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    // 60s 缓存命中直接返回（仅规范请求；其余参数现场算）
    if (page === 1 && limit === 16 && activeMusiciansCache.data && Date.now() < activeMusiciansCache.expiresAt) {
      return res.json(activeMusiciansCache.data)
    }

    // ===== 真用户档：门槛档（近3天合奏≥1h）+ 补位档（有会话记录的真人），同权重排序 =====
    // 权重口径与 by-nickname 端点一致：公开署名（is_anonymous=FALSE）作品的 likes/followers/plays
    const real = await pool.query(
      `WITH sess AS (
         SELECT user_id,
                SUM(GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(ended_at, last_seen), NOW())
                     - GREATEST(started_at, NOW() - INTERVAL '3 days')))))::int AS secs_3d
         FROM musician_sessions GROUP BY user_id
       )
       SELECT u.id, u.nickname, u.primary_instrument, u.instrument_category, u.avatar_index, u.avatar_url,
              (SELECT COALESCE(SUM(w.likes), 0) FROM works w JOIN work_authors wa ON wa.work_id = w.id
                WHERE wa.user_id = u.id AND wa.is_anonymous = FALSE)::int AS total_likes,
              (SELECT COUNT(*) FROM follows WHERE followee_id = u.id)::int AS followers_count,
              (SELECT COALESCE(SUM(w.plays), 0) FROM works w JOIN work_authors wa ON wa.work_id = w.id
                WHERE wa.user_id = u.id AND wa.is_anonymous = FALSE)::int AS total_plays,
              COALESCE((SELECT MAX(ms.last_seen) FROM musician_sessions ms WHERE ms.user_id = u.id), u.created_at) AS last_activity,
              CASE WHEN COALESCE(s.secs_3d, 0) >= 3600 THEN 0 ELSE 1 END AS tier
       FROM users u LEFT JOIN sess s ON s.user_id = u.id
       WHERE u.id != 0 AND u.is_seed = FALSE
         AND (COALESCE(s.secs_3d, 0) >= 3600
              OR EXISTS (SELECT 1 FROM musician_sessions ms WHERE ms.user_id = u.id))
       ORDER BY tier ASC, total_likes DESC, followers_count DESC, total_plays DESC, last_activity DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    let users = real.rows
    // ===== 假号补位：真用户不足时按当日种子轮换补满（永远垫底；md5(id+当日日期) 同日所有人同批）=====
    if (users.length < limit) {
      const seed = await pool.query(
        `SELECT id, nickname, primary_instrument, instrument_category, avatar_index, avatar_url, 2 AS tier
         FROM users WHERE is_seed = TRUE AND id != 0
         ORDER BY md5(id::text || ':' || CURRENT_DATE::text)
         LIMIT $1`,
        [limit - users.length]
      )
      users = users.concat(seed.rows)
    }
    users = users.map(r => { if (r.avatar_url) r.avatar_url = r.avatar_url.replace('/var/jamony/avatars', '/avatars'); return r })

    const payload = { ok: true, users, total: users.length, page, totalPages: 1 }
    if (page === 1 && limit === 16) {
      activeMusiciansCache.data = payload
      activeMusiciansCache.expiresAt = Date.now() + 60000
    }
    res.json(payload)
  } catch (err) {
    console.error('Users list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取作品列表（分页） ==========
app.get('/api/tracks', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    const type = req.query.type || ''
    const sort = req.query.sort || 'newest'

    let where = ''
    let params = [limit, offset]
    let idx = 3

    if (type === 'rehearsal') {
      where = "WHERE type = 'rehearsal'"
    } else if (type === 'jam') {
      where = "WHERE type = 'jam'"
    }

    let order = 'ORDER BY date DESC, id DESC'
    if (sort === 'hot') order = 'ORDER BY plays DESC'
    if (sort === 'likes') order = 'ORDER BY likes DESC'

    const result = await pool.query(
      `SELECT * FROM tracks ${where} ${order} LIMIT $1 OFFSET $2`, params
    )
    const count = await pool.query(`SELECT COUNT(*) FROM tracks ${where}`)

    res.json({
      ok: true,
      tracks: result.rows,
      total: parseInt(count.rows[0].count),
      page,
      totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
    })
  } catch (err) {
    console.error('Tracks list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取单个作品 ==========
app.get('/api/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query('SELECT * FROM tracks WHERE id = $1', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '作品不存在' })
    }
    res.json({ ok: true, track: result.rows[0] })
  } catch (err) {
    console.error('Track fetch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取某个用户的作品 ==========
app.get('/api/users/:userId/tracks', async (req, res) => {
  try {
    const { userId } = req.params
    const result = await pool.query(
      "SELECT * FROM tracks WHERE $1 = ANY(members) ORDER BY date DESC LIMIT 20",
      [userId]
    )
    res.json({ ok: true, tracks: result.rows })
  } catch (err) {
    console.error('User tracks error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取某用户参与的作品（work_authors → works）==========
app.get('/api/users/:userId/works', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params
    const isSelf = req.userId !== null && String(req.userId) === String(userId)
    const anonFilter = isSelf ? '' : 'AND wa.is_anonymous = FALSE'
    let orderBy = 'w.created_at DESC'
    if (req.query.sort === 'asc') orderBy = 'w.created_at ASC'
    else if (req.query.sort === 'likes') orderBy = 'w.likes DESC'
    const result = await pool.query(`
      SELECT w.*, (
        SELECT COALESCE(json_agg(row_to_json(wa_sub) ORDER BY wa_sub.id), '[]'::json)
        FROM (
          SELECT wa.id, wa.user_id, COALESCE(u.nickname, wa.nickname) AS nickname, wa.instrument_category, wa.is_anonymous, COALESCE(u.is_system, FALSE) AS is_system, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url
          FROM work_authors wa LEFT JOIN users u ON u.id = wa.user_id WHERE wa.work_id = w.id
        ) wa_sub
      ) AS authors
      FROM works w
      WHERE w.status = 'published'
      AND w.id IN (SELECT work_id FROM work_authors wa WHERE wa.user_id = $1 ${anonFilter})
      ${isSelf ? '' : "AND (w.audio_review = 'passed' OR w.audio_review IS NULL)"}
      ORDER BY ${orderBy}
    `, [userId])

    const works = result.rows.map(row => {
      const authors = row.authors || []
      const realAuthors = authors.filter(a => !a.is_system)
      const namedAuthors = realAuthors.filter(a => !a.is_anonymous)
      const anonymousCount = realAuthors.filter(a => a.is_anonymous).length
      const members = namedAuthors.map(a => a.nickname)
      const instruments = [...new Set(authors.map(a => a.instrument_category).filter(Boolean))]
      const nature = (row.copyright_type === '原创') ? 'original' : 'cover'
      const mp3Url = row.mp3_path ? row.mp3_path.replace('/var/jamony/works', '/works') : ''
      const coverUrl = row.cover_image_path ? row.cover_image_path.replace('/var/jamony/works', '/works') : ''
      const gradient = row.cover_gradient || 'linear-gradient(135deg, #00AAFF, #9933FF)'
      const audioReview = row.audio_review || null // 1024: 'pending'本人角标"音频审核中"(公域列表已过滤不出现)
      let author = ''
      if (namedAuthors.length === 0) {
        author = `${realAuthors.length}位匿名乐手`
      } else if (namedAuthors.length === 1 && realAuthors.length === 1) {
        author = namedAuthors[0].nickname
      } else {
        author = `${realAuthors.length}位乐手`
      }
      return {
        id: row.id,
        title: row.title,
        author, type: 'jam', nature,
        styles: row.style ? [row.style] : [],
        instruments, plays: row.plays || 0, likes: row.likes || 0, comments: row.comments || 0,
        duration: row.duration || '', gradient,
        date: row.created_at ? row.created_at.toISOString().slice(0, 10) : '',
        members, coverImage: coverUrl,
        mp3Url, anonymousCount, style: row.style || '',
        copyrightType: row.copyright_type || '', coverGradient: gradient,
        hasDrumTrack: row.has_drum_track || false,
        audioReview, // 1024 音频线: 本人视角返回, 前端挂"音频审核中"角标+锁播放
        authors,
      }
    })

    res.json({ ok: true, works })
  } catch (err) {
    console.error('User works error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 按作者名获取作品 ==========
app.get('/api/tracks/by-author/:authorName', async (req, res) => {
  try {
    const { authorName } = req.params
    const result = await pool.query(
      "SELECT * FROM tracks WHERE author_name = $1 OR $1 = ANY(members) ORDER BY date DESC",
      [authorName]
    )
    res.json({ ok: true, tracks: result.rows })
  } catch (err) {
    console.error('Author tracks error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 更新作品 ==========
app.patch('/api/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { title, styles } = req.body

    let sets = []
    let params = []
    let idx = 1

    if (title) {
      sets.push(`title = $${idx++}`)
      params.push(title)
    }
    if (styles) {
      sets.push(`styles = $${idx++}`)
      params.push('{' + styles.join(',') + '}')
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, msg: '没有要更新的字段' })
    }

    params.push(id)
    const result = await pool.query(
      `UPDATE tracks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '作品不存在' })
    }

    res.json({ ok: true, track: result.rows[0] })
  } catch (err) {
    console.error('Track update error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 删除作品 ==========
app.delete('/api/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query('DELETE FROM tracks WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '作品不存在' })
    }
    res.json({ ok: true, msg: '已删除' })
  } catch (err) {
    console.error('Track delete error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 更新用户资料 ==========
app.patch('/api/users/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (parseInt(id) !== req.userId) {
      return res.status(403).json({ ok: false, msg: '只能修改自己的资料' })
    }
    const { nickname, bio, signature, city, primaryInstrument, instrumentCategory, styles, avatarIndex, email, followListPrivate } = req.body

    const sets = []
    const params = []
    let idx = 1

    if (nickname !== undefined) {
      // 品牌保护与注册同规(1018): 改名同样拦截 jamony 保留字(此前仅注册检查, 改名可绕过——1023 补)
      if (String(nickname).toLowerCase().includes('jamony')) {
        return res.status(409).json({ ok: false, msg: '该昵称已被注册' })
      }
      sets.push(`nickname = $${idx++}`); params.push(nickname)
    }
    if (bio !== undefined) { sets.push(`bio = $${idx++}`); params.push(bio) }
    if (signature !== undefined) { sets.push(`signature = $${idx++}`); params.push(signature) }
    if (city !== undefined) { sets.push(`city = $${idx++}`); params.push(city) }
    if (primaryInstrument !== undefined) { sets.push(`primary_instrument = $${idx++}`); params.push(primaryInstrument) }
    if (instrumentCategory !== undefined) { sets.push(`instrument_category = $${idx++}`); params.push(instrumentCategory) }
    if (avatarIndex !== undefined) { sets.push(`avatar_index = $${idx++}`); params.push(avatarIndex) }
    if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email) }
    if (followListPrivate !== undefined) { sets.push(`follow_list_private = $${idx++}`); params.push(!!followListPrivate) }
    if (styles !== undefined) {
      sets.push(`styles = $${idx++}`)
      params.push('{' + styles.join(',') + '}')
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, msg: '没有要更新的字段' })
    }

    // 机审：个人资料自由文本全量过闸（昵称/介绍/签名/城市/乐器/类别/风格/邮箱，1023 内容安全）
    const profileText = [nickname, bio, signature, city, primaryInstrument, instrumentCategory, email, ...(Array.isArray(styles) ? styles : [])]
      .filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (profileText && !(await moderatePublishText('profile', req.userId, req.userId, req.nickname, profileText))) {
      return res.status(400).json({ ok: false, msg: '资料包含违规信息，请修改后重发' })
    }

    sets.push(`updated_at = NOW()`)
    params.push(id)
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, nickname, avatar_index, avatar_url, bio, signature, styles, city, primary_instrument, instrument_category, secondary_instrument, level, points, follow_list_private`,
      params
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    const u = result.rows[0]
    res.json({
      ok: true,
      user: {
        id: u.id,
        nickname: u.nickname,
        avatarIndex: u.avatar_index,
        avatarUrl: u.avatar_url ? u.avatar_url.replace('/var/jamony/avatars', '/avatars') : '',
        bio: u.bio || '',
        signature: u.signature || '',
        styles: u.styles || [],
        city: u.city || '',
        primaryInstrument: u.primary_instrument,
        instrumentCategory: u.instrument_category || '',
        secondaryInstrument: u.secondary_instrument || '',
        level: u.level,
        points: u.points,
        followListPrivate: !!u.follow_list_private,
      }
    })
  } catch (err) {
    console.error('User update error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 修改密码 ==========
app.post('/api/users/:id/password', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    if (parseInt(id) !== req.userId) {
      return res.status(403).json({ ok: false, msg: '只能修改自己的密码' })
    }
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ ok: false, msg: '请填写完整' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, msg: '新密码至少 8 位' })
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    const user = result.rows[0]
    if (!(await verifyPassword(oldPassword, user.password_hash))) {
      return res.status(401).json({ ok: false, msg: '旧密码错误' })
    }

    const hash = await hashPassword(newPassword)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id])

    res.json({ ok: true, msg: '密码已修改' })
  } catch (err) {
    console.error('Password change error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 关注 ==========
app.post('/api/users/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id)
    if (!targetId || targetId === req.userId) {
      return res.status(400).json({ ok: false, msg: '不能关注自己' })
    }
    const inserted = await pool.query(
      'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
      [req.userId, targetId]
    )
    if (inserted.rows.length > 0) {
      const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [req.userId])
      await createNotification({ recipientId: targetId, type: 'follow', actorId: req.userId, actorNickname: u.rows[0]?.nickname })
    }
    res.json({ ok: true, isFollowing: true })
  } catch (err) {
    console.error('Follow error:', err)
    res.status(500).json({ ok: false, msg: '关注失败' })
  }
})

app.delete('/api/users/:id/follow', requireAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id)
    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2',
      [req.userId, targetId]
    )
    res.json({ ok: true, isFollowing: false })
  } catch (err) {
    console.error('Unfollow error:', err)
    res.status(500).json({ ok: false, msg: '取消关注失败' })
  }
})

app.get('/api/me/following', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT followee_id FROM follows WHERE follower_id = $1',
      [req.userId]
    )
    res.json({ ok: true, following: result.rows.map(r => r.followee_id) })
  } catch (err) {
    console.error('Following list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 某用户的关注列表（带用户详情；受 follow_list_private 隐私控制）
app.get('/api/users/:id/following', optionalAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id)
    if (!targetId) return res.status(404).json({ ok: false, msg: '用户不存在' })
    const priv = await pool.query('SELECT follow_list_private FROM users WHERE id = $1', [targetId])
    if (priv.rows.length === 0) return res.status(404).json({ ok: false, msg: '用户不存在' })
    if (priv.rows[0].follow_list_private && req.userId !== targetId) {
      return res.status(403).json({ ok: false, msg: '对方已设私密' })
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.avatar_index, u.avatar_url, u.city, u.instrument_category, u.bio,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following
       FROM follows f JOIN users u ON u.id = f.followee_id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC
       LIMIT $3 OFFSET $4`,
      [targetId, req.userId, limit, offset]
    )
    const totalRow = await pool.query('SELECT COUNT(*)::int AS c FROM follows WHERE follower_id = $1', [targetId])
    res.json({ ok: true, users: result.rows.map(r => { if (r.avatar_url) r.avatar_url = r.avatar_url.replace('/var/jamony/avatars', '/avatars'); return r }), total: totalRow.rows[0].c })
  } catch (err) { console.error('Following list error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 某用户的粉丝列表（带用户详情；受 follow_list_private 隐私控制）
app.get('/api/users/:id/followers', optionalAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id)
    if (!targetId) return res.status(404).json({ ok: false, msg: '用户不存在' })
    const priv = await pool.query('SELECT follow_list_private FROM users WHERE id = $1', [targetId])
    if (priv.rows.length === 0) return res.status(404).json({ ok: false, msg: '用户不存在' })
    if (priv.rows[0].follow_list_private && req.userId !== targetId) {
      return res.status(403).json({ ok: false, msg: '对方已设私密' })
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100)
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)
    const result = await pool.query(
      `SELECT u.id, u.nickname, u.avatar_index, u.avatar_url, u.city, u.instrument_category, u.bio,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following
       FROM follows f JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = $1
       ORDER BY f.created_at DESC
       LIMIT $3 OFFSET $4`,
      [targetId, req.userId, limit, offset]
    )
    const totalRow = await pool.query('SELECT COUNT(*)::int AS c FROM follows WHERE followee_id = $1', [targetId])
    res.json({ ok: true, users: result.rows.map(r => { if (r.avatar_url) r.avatar_url = r.avatar_url.replace('/var/jamony/avatars', '/avatars'); return r }), total: totalRow.rows[0].c })
  } catch (err) { console.error('Followers list error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// ========== 头像上传 ==========
app.post('/api/users/:id/avatar', requireAuth, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (parseInt(req.params.id) !== req.userId) {
      return res.status(403).json({ ok: false, msg: '只能修改自己的头像' })
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, msg: '未收到头像文件' })
    }
    const ext = path.extname(req.file.originalname) || '.jpg'
    const newPath = path.join(avatarsDir, `user${req.userId}${ext}`)
    fs.renameSync(req.file.path, newPath)
    // 1024 图片线: 头像双管审核(OCR文字+图像本体)——拒传删文件保留旧头像
    if (!(await moderateImage('avatar', newPath, req.userId, req.nickname))) {
      try { fs.unlinkSync(newPath) } catch (e) {}
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [newPath, req.userId])
    res.json({ ok: true, avatarUrl: newPath.replace('/var/jamony/avatars', '/avatars') })
  } catch (err) {
    console.error('Avatar upload error:', err)
    res.status(500).json({ ok: false, msg: '头像上传失败' })
  }
})

// 公告牌图片上传（requireAuth；不写 DB，返回 URL 由前端填入 POST /api/notices 的 image_url）
app.post('/api/notices/upload-image', requireAuth, noticeImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, msg: '未收到图片' })
    const ext = path.extname(req.file.originalname) || '.jpg'
    const newPath = path.join(noticesDir, `notice_${req.userId}_${Date.now()}${ext}`)
    fs.renameSync(req.file.path, newPath)
    // 1024 图片线: 公告图双管审核(OCR文字+图像本体)——拒传删文件
    if (!(await moderateImage('notice_image', newPath, req.userId, req.nickname))) {
      try { fs.unlinkSync(newPath) } catch (e) {}
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    res.json({ ok: true, imageUrl: newPath.replace('/var/jamony/notices', '/notices') })
  } catch (err) {
    console.error('Notice image upload error:', err)
    res.status(500).json({ ok: false, msg: '图片上传失败' })
  }
})

// 投谱上传（requireAuth；仅合奏者。返回文件 URL 列表，推送动作走 socket push-score）
app.post('/api/rooms/:code/score/upload', requireAuth, scoreUpload.array('files', 30), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, msg: '未收到文件' })
    if (!(await isRoomMusician(req.userId, req.params.code))) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path) } catch (e) {} })
      return res.status(403).json({ ok: false, msg: '仅合奏者可投谱' })
    }
    // 1024 欢哥定稿: 投谱图片=门面(publish, 与房间名/大屏主题同级)——投上大屏前双管审核(OCR+图像)
    // 只审图片文件(PDF/GP=文档型乐谱跳过); 多文件并行审, 任一拒绝=整批拒全删
    const SCORE_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
    const imgFiles = (req.files).filter(f => SCORE_IMAGE_EXTS.includes(path.extname(f.originalname || '').toLowerCase()))
    if (imgFiles.length > 0) {
      const verdicts = await Promise.all(imgFiles.map(f => moderateImage('score_image', f.path, req.userId, req.nickname)))
      if (verdicts.includes(false)) {
        req.files.forEach(f => { try { fs.unlinkSync(f.path) } catch (e) {} })
        return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
      }
    }
    // 1013 修：multer/busboy 把 originalname 按 latin1 解码 UTF-8 字节=中文名全乱码（æˆéƒ½=成都实测定罪）
    // ——标准修法 Buffer latin1→utf8（纯英文名原样不变，业界 multer #775 同款）
    const files = (req.files).map(f => ({ url: `/api/rooms/${req.params.code}/score/files/${path.basename(f.path)}`, name: Buffer.from(f.originalname, 'latin1').toString('utf8') }))
    // 谱子（GP/MusicXML/Capella）：当场转 MIDI（给幽灵乐手/fluidsynth 用）+ 提取分轨表（给前端分轨条）
    let gp = null
    const gpFile = req.files.find(f => CONVERT_EXTS.includes(path.extname(f.originalname || '').toLowerCase()))
    if (gpFile) {
      if (req.files.length > 1) return res.status(400).json({ ok: false, msg: '谱子文件请单独上传一份' })
      try {
        const midBasename = path.basename(gpFile.path).replace(/\.[^.]+$/, '') + '.mid'
        const conv = await gpToMidiAsync(gpFile.path, path.join(path.dirname(gpFile.path), midBasename))
        gp = { midUrl: `/api/rooms/${req.params.code}/score/files/${midBasename}`, tracks: conv.tracks }
      } catch (err) {
        console.error('GP convert error:', err.message)
        try { fs.unlinkSync(gpFile.path) } catch (e) {}
        return res.status(400).json({ ok: false, msg: '谱子解析失败（格式不支持或文件损坏）' })
      }
    }
    // ⑥-3 谱架（1013 欢哥11条）：一文件一行（显示名=文件名+上传者昵称，前端拼）；类型四档——
    // gp=可渲染制谱(GP族/musicxml/capx)、notation=专有制谱(.sib/.mscz/.mscx 只存取不投屏)、pdf、images；
    // GP 的伴生 .mid/tracks 记在源文件行（投屏 alphatab 用）
    try {
      const nick = (await pool.query('SELECT nickname FROM users WHERE id=$1', [req.userId])).rows[0]?.nickname || ''
      for (const f of files) {
        const ext = path.extname(f.name || '').toLowerCase().slice(1)
        const isGpSource = !!gp && files.length === 1
        const type = isGpSource || ['gp', 'gpx', 'gp3', 'gp4', 'gp5', 'musicxml', 'mxl', 'capx'].includes(ext) ? 'gp'
          : ['sib', 'mscz', 'mscx'].includes(ext) ? 'notation'
          : ext === 'pdf' ? 'pdf' : 'images'
        let name = (String(f.name || '').replace(/\.[^.]+$/, '').slice(0, 100)) || '未命名'
        // 1013 欢哥定稿：重名自动序号后缀（房间内查重，无论谁传的）——sexy-V8 已存在→本次记 sexy-V8 2、3…
        // （磁盘文件名本就随机不冲突，这是显示名去重；LIKE 里的 % 转义，谱名含 % 的极端场景也稳）
        try {
          const ex = await pool.query(
            `SELECT name FROM room_scores WHERE room_code = $1 AND (name = $2 OR name LIKE ($2 || ' %'))`,
            [req.params.code.toUpperCase(), name.replace(/[%_]/g, m => '\\' + m)]
          )
          if (ex.rows.some(r => r.name === name)) {
            let max = 1
            for (const r of ex.rows) {
              const m = /^ (\d+)$/.exec(String(r.name).slice(name.length))
              if (m) max = Math.max(max, parseInt(m[1], 10))
            }
            name = `${name} ${max + 1}`
          }
        } catch (e) { /* 查重失败退原名，不阻塞 */ }
        await pool.query(
          `INSERT INTO room_scores (room_code, name, type, files, mid_url, tracks, uploaded_by, uploaded_by_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [req.params.code.toUpperCase(), name, type, JSON.stringify([f.url]),
           isGpSource ? gp.midUrl : null, isGpSource ? JSON.stringify(gp.tracks) : null,
           req.userId, nick]
        )
      }
    } catch (e) { console.error('Score shelf insert error:', e.message) /* 入册失败不阻塞上传 */ }
    res.json({ ok: true, files, gp })
  } catch (err) {
    console.error('Score upload error:', err)
    res.status(500).json({ ok: false, msg: '投谱上传失败' })
  }
})

// ⑥-3 谱架列表（1013 欢哥11条）：格式分组排序——GP/制谱类→PDF→图片，同类新→旧；全员可见（听众也翻谱看）
app.get('/api/rooms/:code/scores', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, type, files, mid_url, tracks, uploaded_by_name, created_at
       FROM room_scores WHERE room_code = $1
       ORDER BY CASE type WHEN 'gp' THEN 0 WHEN 'notation' THEN 1 WHEN 'pdf' THEN 2 ELSE 3 END, created_at DESC, id DESC
       LIMIT 200`,
      [String(req.params.code || '').toUpperCase()]
    )
    res.json({ ok: true, scores: r.rows.map(row => ({
      id: row.id, name: row.name, type: row.type, files: row.files, midUrl: row.mid_url || undefined,
      tracks: row.tracks || undefined, by: row.uploaded_by_name, at: row.created_at,
    })) })
  } catch (err) {
    console.error('Score list error:', err.message)
    res.status(500).json({ ok: false, msg: '谱架读取失败' })
  }
})

// ⑥-3 谱子下载（1013 欢哥拍板：下服务器原始文件，砍 Gp7Exporter）：按条目 id 取原文件流（全类型可下）
app.get('/api/rooms/:code/score/download/:id', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT name, type, files FROM room_scores WHERE id=$1 AND room_code=$2',
      [Number(req.params.id) || 0, String(req.params.code || '').toUpperCase()])
    const row = r.rows[0]
    if (!row || !Array.isArray(row.files) || row.files.length === 0) return res.status(404).json({ ok: false, msg: '谱子不存在' })
    const fname = path.basename(String(row.files[0]))
    const fpath = path.join(scoresDir, req.params.code, fname)
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, msg: '文件已失效' })
    const ext = path.extname(fname) || (row.type === 'gp' ? '.gp' : row.type === 'notation' ? '.mscz' : '.pdf')
    res.download(fpath, `${row.name || 'score'}${ext}`)
  } catch (err) {
    console.error('Score download error:', err.message)
    res.status(500).json({ ok: false, msg: '下载失败' })
  }
})

// ⑥-3 删除谱架条目（1013 欢哥拍板：直接删服务器文件）：仅合奏者（与上传对齐）；
// 若删的正是大屏正显内容 → 连带收回大屏（停走带+清状态+广播），防死引用
app.delete('/api/rooms/:code/score/shelf/:id', requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    if (!(await isRoomMusician(req.userId, code))) return res.status(403).json({ ok: false, msg: '仅合奏者可删除' })
    const r = await pool.query('SELECT id, files, mid_url FROM room_scores WHERE id=$1 AND room_code=$2', [Number(req.params.id) || 0, code])
    const row = r.rows[0]
    if (!row) return res.status(404).json({ ok: false, msg: '条目不存在' })
    const rowFiles = Array.isArray(row.files) ? row.files.map(String) : []
    for (const u of rowFiles) {
      try { fs.unlinkSync(path.join(scoresDir, code, path.basename(u))) } catch (e) {}
    }
    if (row.mid_url) { try { fs.unlinkSync(path.join(scoresDir, code, path.basename(String(row.mid_url)))) } catch (e) {} }
    await pool.query('DELETE FROM room_scores WHERE id=$1', [row.id])
    // 大屏正显的正是被删内容 → 收回（GP 走带随停，全房广播还原空屏）
    const cur = await pool.query('SELECT current_score FROM rooms WHERE room_code=$1', [code])
    let curScore = null
    try { curScore = cur.rows[0]?.current_score ? JSON.parse(cur.rows[0].current_score) : null } catch (e) {}
    if (curScore && Array.isArray(curScore.files) && rowFiles.some(u => curScore.files.includes(u))) {
      await pool.query('UPDATE rooms SET current_score = NULL WHERE room_code = $1', [code])
      await stopGpByCode(code, true)
      io.to(code).emit('score-update', { score: null })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Score shelf delete error:', err.message)
    res.status(500).json({ ok: false, msg: '删除失败' })
  }
})

// 清空整个谱架（1016 欢哥：乐谱共享加"清空"按钮——批量删全部谱子+伴生 mid；正投屏内容随删收回，GP 走带随停）
app.delete('/api/rooms/:code/score/shelf', requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    if (!(await isRoomMusician(req.userId, code))) return res.status(403).json({ ok: false, msg: '仅合奏者可清空' })
    const r = await pool.query('SELECT id, files, mid_url FROM room_scores WHERE room_code=$1', [code])
    const allFiles = []
    for (const row of r.rows) {
      const rowFiles = Array.isArray(row.files) ? row.files.map(String) : []
      for (const u of rowFiles) {
        try { fs.unlinkSync(path.join(scoresDir, code, path.basename(u))) } catch (e) {}
        allFiles.push(u)
      }
      if (row.mid_url) { try { fs.unlinkSync(path.join(scoresDir, code, path.basename(String(row.mid_url)))) } catch (e) {} }
    }
    await pool.query('DELETE FROM room_scores WHERE room_code=$1', [code])
    // 投屏中必然是被删内容之一（谱架已空）→ 收回+停走带+广播空屏
    if (allFiles.length > 0) {
      await pool.query('UPDATE rooms SET current_score = NULL WHERE room_code = $1', [code])
      await stopGpByCode(code, true)
      io.to(code).emit('score-update', { score: null })
    }
    res.json({ ok: true, removed: r.rows.length })
  } catch (err) {
    console.error('Score shelf clear error:', err.message)
    res.status(500).json({ ok: false, msg: '清空失败' })
  }
})

// 投谱文件读取（随机文件名不可枚举即房间内可见性边界；房间解散即删）
app.get('/api/rooms/:code/score/files/:fname', (req, res) => {
  const code = String(req.params.code || '').replace(/[^a-zA-Z0-9_-]/g, '')
  const fname = String(req.params.fname || '').replace(/[^a-zA-Z0-9_.-]/g, '')
  if (!code || !fname.includes('.') || fname.startsWith('.')) return res.status(400).json({ ok: false, msg: '参数错误' })
  const fpath = path.join(scoresDir, code, fname)
  if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, msg: '文件不存在' })
  res.sendFile(fpath)
})

/* ========== program 背景轨物料 API（1015，1014 方案定稿） ==========
   current_program JSONB = { tracks:[{id,name,file,size,uploadedBy,uploadedByName}], mix:{vols,mutes} }
   物料语义同投谱：房内合奏者操作、随机文件名、房间解散随目录清；轨 id 用随机串（非自增——
   轨列表可增删，索引会漂移；GP 的 mix 用轨索引是 GP 轨序固定，两者语境不同）
   物料变更（上传/删轨/清空）时若正在播 → 停播（快照与轨集不一致会造成混乱；删谱停 GP 同款先例） */

function progRead(row) {
  try { return row && row.current_program ? JSON.parse(row.current_program) : null } catch (e) { return null }
}
function progSanitize(p) {
  if (!p || !Array.isArray(p.tracks)) return { tracks: [], mix: { vols: {}, mutes: [], solos: [], pans: {}, master: 100 } }
  const ids = new Set(p.tracks.map(t => t.id))
  // vols 上限 200=+6dB 头空间（1016 欢哥拍板对齐录音混音器 DAW 级；amix normalize=0 叠加超 0dB 用户自负，无 limiter）
  const vols = {}
  for (const t of p.tracks) {
    const v = Number(p.mix && p.mix.vols ? p.mix.vols[t.id] : 100)
    vols[t.id] = Number.isFinite(v) ? Math.max(0, Math.min(200, Math.round(v))) : 100
  }
  const mutes = Array.isArray(p.mix && p.mix.mutes) ? [...new Set(p.mix.mutes.filter(m => ids.has(m)))] : []
  // solo/pan/master（1016 四功能，对齐录音 useMixerEngine 的 effectiveGain/StereoPanner/masterGain 语义）
  const solos = Array.isArray(p.mix && p.mix.solos) ? [...new Set(p.mix.solos.filter(m => ids.has(m)))] : []
  const pans = {}
  for (const t of p.tracks) {
    const pv = Number(p.mix && p.mix.pans ? p.mix.pans[t.id] : 0)
    pans[t.id] = Number.isFinite(pv) ? Math.max(-1, Math.min(1, pv)) : 0
  }
  const mRaw = p.mix ? Number(p.mix.master) : NaN
  const master = Number.isFinite(mRaw) ? Math.max(0, Math.min(200, Math.round(mRaw))) : 100
  // totalMs=最长轨毫秒（1016 欢哥：走带条常驻可点——上传即随物料下发，时间/进度条不待播放即可用）
  const tm = Number(p.totalMs)
  return { tracks: p.tracks, mix: { vols, mutes, solos, pans, master }, ...(tm > 0 ? { totalMs: Math.round(tm) } : {}) }
}
// 算最长轨毫秒（上传/删轨时写进 current_program；探测失败返 0 由 play 兜底现测）——1029 异步化（ffprobe 链）
async function progCalcTotalMs(code, tracks) {
  let totalMs = 0
  for (const t of tracks) {
    const dur = await progProbeDurationSec(path.join(programsDir, code, t.file))
    if (dur != null) totalMs = Math.max(totalMs, Math.round(dur * 1000))
  }
  return totalMs
}
async function progSaveAndBroadcast(code, prog) {
  await pool.query('UPDATE rooms SET current_program = $1 WHERE room_code = $2', [JSON.stringify(prog), code])
  io.to(code).emit('program-update', { program: prog })
}

// 读当前 program（进面板拉一次；走带态另走 program-state）
app.get('/api/rooms/:code/program', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT current_program FROM rooms WHERE room_code = $1', [String(req.params.code || '').toUpperCase()])
    res.json({ ok: true, program: progSanitize(progRead(r.rows[0])) })
  } catch (err) {
    console.error('Program get error:', err.message)
    res.status(500).json({ ok: false, msg: '读取失败' })
  }
})

// 上传轨（追加进当前伴奏包；8 轨上限，10M/轨 multer 层拦）
app.post('/api/rooms/:code/program/tracks', requireAuth, programUpload.array('files', 8), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ ok: false, msg: '未收到文件' })
    const code = String(req.params.code || '').toUpperCase()
    if (!(await isRoomMusician(req.userId, code))) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path) } catch (e) {} })
      return res.status(403).json({ ok: false, msg: '仅合奏者可上传伴奏轨' })
    }
    const r = await pool.query('SELECT current_program FROM rooms WHERE room_code = $1', [code])
    const prog = progSanitize(progRead(r.rows[0]))
    if (prog.tracks.length + req.files.length > PROGRAM_MAX_TRACKS) {
      req.files.forEach(f => { try { fs.unlinkSync(f.path) } catch (e) {} })
      return res.status(400).json({ ok: false, msg: `最多 ${PROGRAM_MAX_TRACKS} 轨（当前 ${prog.tracks.length} 轨）` })
    }
    const nick = (await pool.query('SELECT nickname FROM users WHERE id=$1', [req.userId])).rows[0]?.nickname || ''
    for (const f of req.files) {
      prog.tracks.push({
        id: Math.random().toString(36).slice(2, 10),
        name: (Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 100)) || '未命名轨',
        file: path.basename(f.path), size: f.size,
        uploadedBy: req.userId, uploadedByName: nick,
      })
    }
    prog.totalMs = await progCalcTotalMs(code, prog.tracks)  // 1016：上传即下发总长（走带条不待播放即可用）
    await stopProgramByCode(code, true)  // 物料变更停播（快照一致性）
    await progSaveAndBroadcast(code, prog)
    res.json({ ok: true, program: prog })
  } catch (err) {
    console.error('Program upload error:', err.message)
    res.status(500).json({ ok: false, msg: '上传失败' })
  }
})

// 删单轨（删文件+记录；正在播 → 停播）
app.delete('/api/rooms/:code/program/tracks/:tid', requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    if (!(await isRoomMusician(req.userId, code))) return res.status(403).json({ ok: false, msg: '仅合奏者可删除' })
    const r = await pool.query('SELECT current_program FROM rooms WHERE room_code = $1', [code])
    const prog = progSanitize(progRead(r.rows[0]))
    const t = prog.tracks.find(t => t.id === req.params.tid)
    if (!t) return res.status(404).json({ ok: false, msg: '轨不存在' })
    try { fs.unlinkSync(path.join(programsDir, code, t.file)) } catch (e) {}
    prog.tracks = prog.tracks.filter(x => x.id !== req.params.tid)
    delete prog.mix.vols[t.id]
    prog.mix.mutes = prog.mix.mutes.filter(m => m !== t.id)
    prog.totalMs = await progCalcTotalMs(code, prog.tracks)
    await stopProgramByCode(code, true)
    await progSaveAndBroadcast(code, prog)
    res.json({ ok: true, program: prog })
  } catch (err) {
    console.error('Program track delete error:', err.message)
    res.status(500).json({ ok: false, msg: '删除失败' })
  }
})

// 清空整个伴奏包（换歌场景；正在播 → 停播）
app.delete('/api/rooms/:code/program', requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    if (!(await isRoomMusician(req.userId, code))) return res.status(403).json({ ok: false, msg: '仅合奏者可清空' })
    const r = await pool.query('SELECT current_program FROM rooms WHERE room_code = $1', [code])
    const prog = progSanitize(progRead(r.rows[0]))
    for (const t of prog.tracks) { try { fs.unlinkSync(path.join(programsDir, code, t.file)) } catch (e) {} }
    await stopProgramByCode(code, true)
    await pool.query('UPDATE rooms SET current_program = NULL, program_state = NULL WHERE room_code = $1', [code])
    io.to(code).emit('program-update', { program: null })
    res.json({ ok: true })
  } catch (err) {
    console.error('Program clear error:', err.message)
    res.status(500).json({ ok: false, msg: '清空失败' })
  }
})

// 下载伴奏轨（1016 欢哥：行内按钮组对齐乐谱共享——res.download 强制附件+原始文件名，sendFile 会让浏览器直接播 mp3）
app.get('/api/rooms/:code/program/download/:tid', requireAuth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase()
    const r = await pool.query('SELECT current_program FROM rooms WHERE room_code = $1', [code])
    const prog = progSanitize(progRead(r.rows[0]))
    const t = prog.tracks.find(t => t.id === req.params.tid)
    if (!t) return res.status(404).json({ ok: false, msg: '轨不存在' })
    const fpath = path.join(programsDir, code, t.file)
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, msg: '文件不存在' })
    res.download(fpath, t.name)
  } catch (err) {
    console.error('Program track download error:', err.message)
    res.status(500).json({ ok: false, msg: '下载失败' })
  }
})

// 伴奏轨文件读取（波形 decode 用；随机文件名即边界，同 score/files 语义）
app.get('/api/rooms/:code/program/files/:fname', (req, res) => {
  const code = String(req.params.code || '').replace(/[^a-zA-Z0-9_-]/g, '')
  const fname = String(req.params.fname || '').replace(/[^a-zA-Z0-9_.-]/g, '')
  if (!code || !fname.includes('.') || fname.startsWith('.')) return res.status(400).json({ ok: false, msg: '参数错误' })
  const fpath = path.join(programsDir, code, fname)
  if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, msg: '文件不存在' })
  res.sendFile(fpath)
})

// ========== 房间相关 API ==========

// 获取可用端口（从 22124 开始，找第一个未被使用的）
async function getAvailablePort() {
  const used = await pool.query('SELECT server_port FROM rooms WHERE status != $1', ['closed'])
  const usedPorts = new Set(used.rows.map(r => r.server_port))
  let port = 22124
  while (usedPorts.has(port)) port++
  return port
}
// 1026 孤儿巡检说明：存量机制 cleanupOrphanProcesses（下方 ~:5960，进程名枚举+drums-stop/stop/stop-ghost
// 全套拆卸，启动+每10分钟）已完整覆盖——勿再造轮子（今晚重复造了一个又撤掉，判例：动手前先 grep 存量）。

// 创建房间
app.post('/api/rooms', requireAuth, async (req, res) => {
  try {
    const { name, description, style, maxMusicians, is_private, password, proficiency } = req.body
    const hostId = req.userId
    if (!name) {
      return res.status(400).json({ ok: false, msg: '请填写房间名' })
    }
    if (!(await guardCanPublish(req.userId, res))) return
    // 1024 B闸(运营闸门, 配置中心可调): 并发活跃房上限——收割者搭档, 防资源耗尽; 满员时引导加入现有房
    const cfg0 = await getModerationConfig()
    const activeRooms = await pool.query("SELECT COUNT(*)::int AS c FROM rooms WHERE status NOT IN ('closed','archived')")
    if (activeRooms.rows[0].c >= cfg0.maxActiveRooms) {
      return res.status(400).json({ ok: false, msg: '当前在线房间较多，请稍后再试，或去大厅加入现有房间一起玩' })
    }
    // 1026 建房频率闸(欢哥拍板, 配置中心可调, 默认5/小时): B闸限并发不限频率——防「建-散-建」churn 循环打 jamsoul spawn(2C4G 实打实的CPU/端口消耗)
    // 1030 欢哥两项优化: ①白名单(运维/测试账号不受控——被自家闸门锁了一晚的教训) ②拦截文案带精确等待分钟
    //    (锚点=窗口内最早一次建房: 它最先满 1 小时腾出名额; 按较晚次算会多报等待)
    const ROOM_CREATE_WHITELIST = [1]  // 1=欢哥(rainbowtube)。真用户永不加; 加人=运维决策留痕 git
    if (!ROOM_CREATE_WHITELIST.includes(parseInt(hostId))) {
      const hourRooms = await pool.query("SELECT COUNT(*)::int AS c, MIN(created_at) AS earliest FROM rooms WHERE host_id=$1 AND created_at > NOW() - interval '1 hour'", [hostId])
      if (hourRooms.rows[0].c >= cfg0.roomCreateHourlyLimit) {
        const retryAtMs = new Date(hourRooms.rows[0].earliest).getTime() + 3600 * 1000
        const waitMin = Math.max(1, Math.ceil((retryAtMs - Date.now()) / 60000))
        return res.status(400).json({ ok: false, msg: `创建房间过于频繁，请于 ${waitMin} 分钟后再试。` })
      }
    }
    const roomText = [name, description, style].filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (!(await moderatePublishText('room', null, hostId, req.nickname, roomText))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }

    // 查用户
    const userResult = await pool.query('SELECT nickname FROM users WHERE id = $1', [hostId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    // jamony 10-01: 一人一房（完全体）——已是任何活跃房间成员（任何身份/任何设备）
    // 即拒绝建房。涵盖自己 hosting 的房间（建房即首位合奏成员，host 恒为成员）；
    // 房间解散/关闭自动解锁；房主转移后原房主解锁。欢哥原则：多端登录自由，在场唯一。
    const inRoom = await pool.query(
      `SELECT r.room_code, r.name, r.host_id FROM room_members rm
       JOIN rooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND r.status NOT IN ('closed', 'archived') LIMIT 1`,
      [hostId]
    )
    if (inRoom.rows.length > 0) {
      const r0 = inRoom.rows[0]
      const isHost = r0.host_id === hostId
      return res.status(400).json({ ok: false, msg: `你已在房间「${r0.name}」中（门牌码 ${r0.room_code}${isHost ? '，你是房主' : ''}），请先${isHost ? '解散该房间' : '离开该房间'}再建新房` })
    }

    const port = await getAvailablePort()
    const musicianLimit = Math.min(maxMusicians || 6, 8)

    // 加密房间：6位数字密码，明文存储（密码本就要分享给被邀请者，防陌生人即可，参考 Zoom）
    let isPrivate = false
    let passwordPlain = null
    if (is_private) {
      if (!/^\d{6}$/.test(password || '')) {
        return res.status(400).json({ ok: false, msg: '加密房间密码须为6位数字' })
      }
      isPrivate = true
      passwordPlain = password
    }

    // 演奏水平：乐谱力度记号 p/mf/f/ff/fff（必填）
    const VALID_PROF = ['p', 'mf', 'f', 'ff', 'fff']
    if (!proficiency) {
      return res.status(400).json({ ok: false, msg: '请选择演奏水平' })
    }
    if (!VALID_PROF.includes(proficiency)) {
      return res.status(400).json({ ok: false, msg: '演奏水平须为 p/mf/f/ff/fff' })
    }

    // 生成 room_code（8位去易混淆码，unique 冲突重试）
    const newRoomId = nextId() // 1025 雪花: 循环外发号(重试共用)
    let room = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomCode = generateRoomCode()
      try {
        const result = await pool.query(
          `INSERT INTO rooms (id, name, description, style, host_id, max_musicians, server_port, is_private, password, room_code, proficiency, status)
           VALUES ($11, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
           RETURNING *`,
          [name, description || '', style || '', hostId, musicianLimit, port, isPrivate, passwordPlain, roomCode, proficiency || null, newRoomId]
        )
        room = result.rows[0]
        break
      } catch (e) {
        if (e.code === '23505' && attempt < 4) continue  // room_code unique 冲突，重试
        throw e
      }
    }
    if (!room) { return res.status(500).json({ ok: false, msg: '房间创建失败' }) }

    delete room.password  // 建房响应不带回密码（playing-page fetch 详情时按成员身份获取）

    // 房主自动成为第一个成员（合奏者）
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, nickname, role)
       VALUES ($1, $2, $3, 'musician')`,
      [room.id, hostId, userResult.rows[0].nickname]
    )
    await openRoomVisit(room.id, hostId, userResult.rows[0].nickname, 'musician') // 1025 访问档案
    await touchRoomPeak(room.id)

    try {
      // 1029 异步化：原 execSync 同步拉 jamsoul=每次建房全站冻结最长 5s；child 内部仍可同步（进程边界）
      await execFileAsync('node', ['/var/www/jamony/api/manage-jamsoul.js', 'start', String(port), String(musicianLimit + 1)], { timeout: 5000 }); try { spawn('node', ['/var/www/jamony/api/manage-jamsoul.js', 'start-ghost', String(port), String(port)], { stdio: 'ignore', detached: true }).unref() } catch(e) { console.error('Ghost start failed:', e.message) }
    } catch (e) {
      console.error('Failed to start jamsoul:', e.stderr?.toString() || e.message)
    }

    emitRoomsChanged('create:' + room.room_code)  // 1030 大厅实时化：新房秒上大厅
    res.json({ ok: true, room })
  } catch (err) {
    console.error('Room create error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 房间列表
app.get('/api/rooms', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.nickname AS host_name, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS host_avatar_url,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'musician') AS musician_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'listener') AS listener_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS total_members
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE r.status NOT IN ('closed', 'archived')
       ORDER BY r.created_at DESC`
    )
    // 列表不返回 server_port（防泄露）和 password（明文密码只对成员可见）；保留 is_private 供前端锁 badge
    const rooms = result.rows.map(r => {
      delete r.password
      delete r.server_port
      return r
    })
    res.json({ ok: true, rooms })
  } catch (err) {
    console.error('Rooms list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 房间详情
app.get('/api/rooms/:code', optionalAuth, async (req, res) => {
  try {
    const { code } = req.params
    const roomResult = await pool.query(
      `SELECT r.*, u.nickname AS host_name, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS host_avatar_url,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'musician') AS musician_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'listener') AS listener_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS total_members
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE UPPER(r.room_code) = UPPER($1) AND r.status NOT IN ('closed', 'archived')`,
      [code]
    )
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '房间不存在' })
    }

    const room = roomResult.rows[0]
    const id = room.id  // members 查询用数字 FK

    const members = await pool.query(
      `SELECT rm.*, u.primary_instrument, u.instrument_category, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 ORDER BY rm.joined_at`,
      [id]
    )

    // 加密房：非成员隐藏 server_port（防直连 jamsoul）+ password（防窃取密码）；
    // 成员/房主保留明文 password 供「分享房间」复制。公开房 password 本就 null。
    if (room.is_private) {
      const isMember = members.rows.some(m => m.user_id === req.userId)
      if (!isMember) {
        room.server_port = null
        delete room.password
      }
    } else {
      delete room.password
    }
    res.json({ ok: true, room, members: members.rows })
  } catch (err) {
    console.error('Room detail error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 广播房间成员列表（身份/音频状态变化时调用，让房间内所有人实时同步右栏成员显示）
// payload 带 hostId：房主转移后前端实时感知新房主（皇冠/管理权/房主行显示）
// targetSocket 传入=单发该 socket（join-room 进房快照），不传=全房广播（默认，既有调用不变）
// ⭐ 1030 大厅实时化（欢哥定稿「3.大厅实时更新」）：房间可见性/人数变化 → 全局广播，
//    大厅/首页房间卡挂监听即时重拉。发射点=建房/解散(3路径)/成员变化(broadcastMembers)/踢人。
//    注意：socket 鉴权要登录态——未登录访客收不到，回落 15s 轮询（公测强制登录前无实义）。
function emitRoomsChanged(why) {
  io.emit('rooms-changed', { why: why || '', at: Date.now() })
}

async function broadcastMembers(roomCode, targetSocket = null) {
  try {
    const result = await pool.query(
      `SELECT rm.*, u.primary_instrument, u.instrument_category, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url, r.host_id
       FROM room_members rm JOIN users u ON u.id = rm.user_id
       JOIN rooms r ON r.id = rm.room_id
       WHERE r.room_code = $1 ORDER BY rm.joined_at`,
      [roomCode]
    )
    const payload = {
      members: result.rows,
      hostId: result.rows.length > 0 ? result.rows[0].host_id : null
    }
    if (targetSocket) targetSocket.emit('members-update', payload)
    else {
      io.to(roomCode).emit('members-update', payload)
      emitRoomsChanged('members:' + roomCode)  // 1030: 真实成员变化（非补发快照）才通知大厅
    }
  } catch (e) {
    console.error('Broadcast members error:', e)
  }
}


// JSON-RPC 调用 jamsoul headless（原始 TCP，一发一收）
function jsonRpcCall(roomPort, method, params = {}) {
  return new Promise((resolve, reject) => {
    const rpcPort = roomPort + 10000;
    const secretFile = '/var/jamony/rpc-secrets/room-' + roomPort + '.txt';
    let secret;
    try { secret = fs.readFileSync(secretFile, 'utf8').trim(); } catch (e) {
      return reject(new Error('RPC secret not found for port ' + roomPort));
    }
    const client = new net.Socket();
    let buf = '';
    let authed = false;
    const t = setTimeout(() => { client.destroy(); reject(new Error('RPC timeout')); }, 5000);
    client.connect(rpcPort, '127.0.0.1', () => {
      client.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'jamsoul/apiAuth', params: { secret } }) + '\n');
    });
    client.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.error) { clearTimeout(t); client.destroy(); reject(new Error(r.error.message)); return; }
          if (!authed) {
            authed = true;
            client.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method, params }) + '\n');
          } else {
            clearTimeout(t); client.destroy(); resolve(r.result);
          }
        } catch(e) {}
      }
    });
    client.on('error', err => { clearTimeout(t); reject(err); });
  });
}

// 检测房间鼓机（FluidSynth）进程是否在运行 —— 录音停止时判定 jamony-looper 分轨是否显示
// 1029：优先查内存引擎表（微秒）；pid 文件仅兜底（野生残留），读改异步（房间隔离宪法：状态轮询零子进程）
async function isDrumsRunning(roomPort) {
  const e = roomPort != null ? drumsEngines.get(roomPort) : null
  if (e && e.child && e.child.exitCode == null && !e.child.killed) return true
  try {
    const pidStr = (await fs.promises.readFile('/tmp/jamony-drums-' + roomPort + '.pid', 'utf8')).trim()
    if (pidStr) {
      const pid = parseInt(pidStr)
      try { process.kill(pid, 0); return true } catch { return false }
    }
  } catch { /* 无 pid 文件=没跑 */ }
  return false
}

// 计算单个 session 的汇总状态：全员 ①② 是否锁定、授权人数、发表人
async function summarizeSession(session, tracks) {
  const realTracks = tracks.filter(t => !t.is_system)
  // 1028 死角第二层: ①=禁用的轨②署名下拉灰死永远无法表态→all_locked 死锁(状态卡不出现)——
  // 禁用=整轨退出作品,署名无意义,①已决即视为整体落定
  const allLocked = realTracks.length > 0 && realTracks.every(t => t.use_locked && (t.attribution_locked || t.allow_use === false))
  const agreedCount = realTracks.filter(t => t.allow_use === true).length

  // 自动释放超过15分钟的发表锁（1026：5→15分钟——混音调参进入锁窗后5分钟不够用，欢哥拍板）
  if (session.publisher_user_id && session.claimed_at && session.status !== 'published') {
    const claimedAt = new Date(session.claimed_at)
    const staleAgo = new Date(Date.now() - PUBLISH_LOCK_MS)
    if (claimedAt < staleAgo) {
      await pool.query(
        'UPDATE recording_sessions SET publisher_user_id=NULL, claimed_at=NULL WHERE id=$1',
        [session.id]
      )
      session.publisher_user_id = null
      session.claimed_at = null
    }
  }

  // 发表人昵称懒查询
  let publisherNickname = null
  if (session.publisher_user_id) {
    try {
      const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [session.publisher_user_id])
      if (u.rows.length > 0) publisherNickname = u.rows[0].nickname
    } catch (e) {}
  }
  return { ...session, tracks, all_locked: allLocked, agreed_count: agreedCount, publisher_nickname: publisherNickname }
}

// 懒处理：倒计时已到且仍授权中 → 未决定的 ① 默认授权、② 默认署名（仅当①=true），并写死锁定
// 返回是否有改动
async function applyExpiry(roomId) {
  const sessions = await pool.query(
    "SELECT id, expires_at FROM recording_sessions WHERE room_id=$1 AND status='authorizing'", [roomId]
  )
  let changed = false
  for (const s of sessions.rows) {
    if (!s.expires_at || new Date() <= new Date(s.expires_at)) continue
    const tr = await pool.query('SELECT * FROM session_tracks WHERE session_id=$1 AND is_system=FALSE', [s.id])
    for (const t of tr.rows) {
      if (!t.use_locked) {
        const useVal = t.allow_use === null ? true : t.allow_use
        let attr = t.allow_attribution
        let attrLocked = t.attribution_locked
        if (useVal === true && !attrLocked) { attr = attr === null ? true : attr; attrLocked = true }
        await pool.query(
          'UPDATE session_tracks SET allow_use=$1, allow_attribution=$2, use_locked=TRUE, attribution_locked=$3 WHERE id=$4',
          [useVal, attr, attrLocked, t.id]
        )
        changed = true
      } else if (t.allow_use === true && !t.attribution_locked) {
        const attr = t.allow_attribution === null ? true : t.allow_attribution
        await pool.query('UPDATE session_tracks SET allow_attribution=$1, attribution_locked=TRUE WHERE id=$2', [attr, t.id])
        changed = true
      }
    }
  }
  return changed
}

// 读取房间所有 session（已过 applyExpiry），返回带汇总的列表
async function getRoomSessions(roomId) {
  // 1025: hidden=软隐藏(已发表段用户删列表)——行保留溯源(works.session_id),列表不可见
  // 1025 欢哥定稿: 最新段落置顶(index DESC)——录完立刻在最上方
  const sessions = await pool.query('SELECT * FROM recording_sessions WHERE room_id=$1 AND hidden=FALSE ORDER BY index DESC', [roomId])
  const result = []
  for (const s of sessions.rows) {
    const tr = await pool.query('SELECT * FROM session_tracks WHERE session_id=$1 ORDER BY is_system, created_at', [s.id])
    result.push(await summarizeSession(s, tr.rows))
  }
  return result
}

// 广播房间录音 session 列表（创建/授权变化/超时默认时调用，全员实时同步）
async function broadcastSessions(roomCode) {
  try {
    const id = await getRoomIdByCode(roomCode)
    io.to(roomCode).emit('sessions-update', { sessions: await getRoomSessions(id) })
  } catch (e) {
    console.error('Broadcast sessions error:', e)
  }
}

// 加入房间
app.post('/api/rooms/:code/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const { role } = req.body
    const userId = req.userId

    let acceptedRole = role === 'musician' ? 'musician' : 'listener'

    // 1024 欢哥验收抓漏补齐: ③降级(降为听众)的房间层执行——demoted 不可再以乐手身份进房/切房内身份
    // (定稿: ②拿发言权/③拿演奏权/④拿账号; 进房+身份切换全走本端点, 一处卡点全拦; 已在房中让其演完本场)
    if (acceptedRole === 'musician' && (await getUserRestriction(userId)) === 'demoted') {
      const mcfg = await getModerationConfig()
      return res.status(403).json({ ok: false, code: 'DEMOTE_LISTENER', msg: `因为违规，您已被降级为听众，只能以听众身份进入房间。您可以到个人主页-申诉进行申诉（处罚生效后${mcfg.appealDays}天内有效）。` })
    }

    // 按 room_code 查房间
    const roomResult = await pool.query("SELECT * FROM rooms WHERE UPPER(room_code) = UPPER($1) AND status NOT IN ('closed', 'archived')", [code])
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '房间不存在' })
    }
    const room = roomResult.rows[0]
    const id = room.id  // 后续 FK 用数字 id

    // 查用户
    const userResult = await pool.query('SELECT nickname FROM users WHERE id = $1', [userId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    // jamony 10-01: 一人一房（完全体）——已是其他活跃房间成员（任何身份/任何设备）
    // 则拒绝进入本房间。同房间的操作不受影响（room_id <> 本房放行强刷保房/房内身份切换）；
    // L2 断线清理 60s 后自动解锁。
    const otherRoom = await pool.query(
      `SELECT r.room_code, r.name, r.host_id FROM room_members rm
       JOIN rooms r ON r.id = rm.room_id
       WHERE rm.user_id = $1 AND rm.room_id <> $2 AND r.status NOT IN ('closed', 'archived') LIMIT 1`,
      [userId, id]
    )
    if (otherRoom.rows.length > 0) {
      const or0 = otherRoom.rows[0]
      const isHostThere = or0.host_id === userId
      return res.status(400).json({ ok: false, code: 'ALREADY_IN_OTHER_ROOM', msg: `你已在房间「${or0.name}」中（门牌码 ${or0.room_code}${isHostThere ? '，你是房主' : ''}），请先${isHostThere ? '解散' : '离开'}该房间再进入其他房间` })
    }

    // 检查是否已在房间
    const existing = await pool.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])
    if (existing.rows.length > 0) {
      // 更新角色
      if (acceptedRole === 'musician') {
        // 检查合奏名额
        const count = await pool.query(
          "SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [id]
        )
        if (parseInt(count.rows[0].count) >= room.max_musicians) {
          return res.status(400).json({ ok: false, msg: '合奏名额已满' })
        }
      }
      const prevMember = await pool.query('SELECT role, nickname FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])
      await pool.query(
        'UPDATE room_members SET role = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
        [acceptedRole, id, userId]
      )
      // 1025 访问档案: 切角色=闭旧段开新段(先听后奏各归各位)
      if (prevMember.rows[0] && prevMember.rows[0].role !== acceptedRole) {
        await closeRoomVisit(id, userId)
        await openRoomVisit(id, userId, prevMember.rows[0].nickname, acceptedRole)
      }
      if (acceptedRole === 'listener') await closeMusicianSession(userId, id)  // 翻回听众即闭会话
      await broadcastMembers(code)
      return res.json({ ok: true, msg: '已更新身份', role: acceptedRole })
    }

    // 黑名单校验：被房主踢出的用户禁止再次加入本房（优先于密码校验）
    const kicked = await pool.query('SELECT 1 FROM room_kicked WHERE room_id = $1 AND user_id = $2', [id, userId])
    if (kicked.rows.length > 0) {
      return res.status(403).json({ ok: false, code: 'KICKED', msg: '你已被房主移出本房间' })
    }

    // 新加入：加密房校验密码（已成员上面已 return，免密）
    if (room.is_private) {
      // 限频：每次尝试计数，10次/10分钟
      if (!rateCheck('roomjoin:' + id + ':' + req.ip, 10, 600000)) {
        return res.status(429).json({ ok: false, msg: '尝试过多，请10分钟后再试' })
      }
      const { password } = req.body
      if (!password || password !== room.password) {
        return res.status(401).json({ ok: false, msg: '密码错误' })
      }
    }

    // 新加入
    if (acceptedRole === 'musician') {
      const count = await pool.query(
        "SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [id]
      )
      if (parseInt(count.rows[0].count) >= room.max_musicians) {
        return res.status(400).json({ ok: false, msg: '合奏名额已满，请以听众身份加入' })
      }
    }

    await pool.query(
      `INSERT INTO room_members (room_id, user_id, nickname, role)
       VALUES ($1, $2, $3, $4)`,
      [id, userId, userResult.rows[0].nickname, acceptedRole]
    )
    // 1025 状态机: 首位合奏者进场即活跃(建房即active已覆盖房主; 此处兜听众先进、合奏者后到的场景)
    if (acceptedRole === 'musician') await pool.query("UPDATE rooms SET status='active' WHERE id = $1 AND status = 'waiting'", [id])
    await openRoomVisit(id, userId, userResult.rows[0].nickname, acceptedRole) // 1025 访问档案
    await touchRoomPeak(id)

    await broadcastMembers(code)
    res.json({ ok: true, msg: '已加入房间', role: acceptedRole })
  } catch (err) {
    console.error('Room join error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

/* ========== 1025 房间访问档案(room_visits): 三维度UV/PV+双轨停留时长唯一数据源(欢哥口径)
   段落制: 进房开段; 切角色闭旧段开新段(先听后奏=两段,时长各自归位); 离房/踢人闭段; 解散统一闭账——结束时刻不留人数只结时长账
   全部 try-catch 不阻塞业务(档案弱依赖) ========== */
async function openRoomVisit(roomId, userId, nickname, role) {
  try { await pool.query('INSERT INTO room_visits (room_id, user_id, nickname, role) VALUES ($1,$2,$3,$4)', [roomId, userId, nickname || '', role || 'listener']) }
  catch (e) { console.error('[visit] 开段失败:', e.message) }
}
async function closeRoomVisit(roomId, userId) {
  try { await pool.query('UPDATE room_visits SET left_at = NOW() WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL', [roomId, userId]) }
  catch (e) { console.error('[visit] 闭段失败:', e.message) }
}
async function closeAllRoomVisits(roomId) {
  try { await pool.query('UPDATE room_visits SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL', [roomId]) }
  catch (e) { console.error('[visit] 闭账失败:', e.message) }
}
async function touchRoomPeak(roomId) {
  try { await pool.query('UPDATE rooms SET peak_members = GREATEST(peak_members, (SELECT COUNT(*) FROM room_members WHERE room_id = $1)) WHERE id = $1', [roomId]) }
  catch (e) { /* PCU失败无伤 */ }
}

// 离开房间
// 移除成员并检查房间是否解散（/leave 和 socket disconnect 共用，L2 兜底也走这个）
// 返回 true=房间已解散（杀进程+删房间），false=房间还在（房主可能已转移给最久的合奏者）
// ⭐ 1029 房间隔离宪法：解散级联资源清理统一体。dissolveRoom / leave-all-rooms / forceDissolveRoom
// 三处原为同款复制粘贴的 execSync 串——同步逐个跑=解散一次全站冻结数秒（理论最坏 40s）。
// 统一抽出+全异步化；杀序/清理范围与原版逐一相同（鼓机改走原生引擎表+野生残留清扫）。
// ⭐ 1030 欢哥定稿「同步，不串行」：各腿彼此独立（杀 jamsoul/幽灵/鼓机/GP/program/清目录互不依赖），
//    Promise.all 同时动手——响应返回时仍全部完成（事务不拆不赛跑），串行实测 2.3s → 并行≈最长一腿。
async function cleanupRoomResources(closePort, roomCode) {
  const leg = (p, tag, silent) => p.catch(e => { if (!silent) console.error(`dissolve ${tag} ${closePort}:`, e.message) })
  await Promise.all([
    leg(killDrumsEngine(closePort), 'drums-stop'),
    leg(execFileAsync('node', ['/var/www/jamony/api/manage-jamsoul.js', 'stop', String(closePort)], { timeout: 10000 }), 'stop'),
    leg(execFileAsync('node', ['/var/www/jamony/api/manage-jamsoul.js', 'stop-ghost', String(closePort)], { timeout: 5000 }), 'stop-ghost'),
    // 兜底：杀 watchdog 竞态拉起的孤儿 ffmpeg（leave 杀的是 ghost.json 记录的 pid，watchdog 新拉的会漏杀；无进程=正常）
    leg(execFileAsync('pkill', ['-f', `jm-stream-${closePort}`]), 'pkill-stream', true),
    leg(execFileAsync('rm', ['-rf', `/var/jamony/recordings/room-${closePort}-records/`]), 'rm recordings'),
    // 谱子目录+谱架册同域成组（文件与行一起清）
    leg((async () => {
      await execFileAsync('rm', ['-rf', `/var/jamony/scores/${roomCode}`])
      await pool.query('DELETE FROM room_scores WHERE room_code = $1', [roomCode])
    })(), 'rm scores'),  // 10-07 投谱=房间物料，随房清；⑥-3 谱架册随房清
    leg(execFileAsync('rm', ['-rf', `/var/jamony/programs/${roomCode}`]), 'rm programs'),  // 1015 program 轨=房间物料，随房清
    leg(stopGpByCode(roomCode), 'stop-gp'),        // 10-07 GP走带随房停
    leg(stopProgramByCode(roomCode, false), 'stop-program'),  // 1015 program 走带随房停
  ])
  // ghost.json 清账（纯状态文件，收尾小步保留串行；杀残留 ffmpeg + 清条目，防 state 漏记）
  try {
    const ghostState = JSON.parse((await fs.promises.readFile('/var/lib/jamony/ghost.json', 'utf8')).toString() || '{}')
    const entry = ghostState[String(closePort)]
    if (entry && entry.ffmpegPid) { try { process.kill(entry.ffmpegPid) } catch (e) { console.error('dissolve kill ffmpeg ' + entry.ffmpegPid + ':', e.message) } }
    delete ghostState[String(closePort)]
    fs.writeFileSync('/var/lib/jamony/ghost.json', JSON.stringify(ghostState, null, 2))
  } catch (e) { console.error('dissolve ghost cleanup ' + closePort + ':', e.message) }
}

// 标准解散执行体（杀进程/清物料/广播/闭账/归档）。1028 从 removeMemberAndCheckDissolve 原样抽出——
// 收割者光杆房（零成员）无成员可踢也须直达解散，与"末位合奏者离开"同一条路。
async function dissolveRoom(roomId, roomCode) {
    const roomInfo = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [roomId])
    const closePort = roomInfo.rows[0]?.server_port
    if (closePort) await cleanupRoomResources(closePort, roomCode)  // 1029：级联抽公共异步体（三处原复制粘贴）
    // 广播房间解散，让听众客户端弹窗"房间已解散"+跳大厅（在踢出 DB 成员前发，确保听众 socket 仍在线收到）
    io.to(roomCode).emit('room-dissolved', { roomCode })
    await closeRoomMusicianSessions(roomId)  // 解散全员闭会话（删房后 room_id 无 FK 但会话须先结算）
    await closeAllRoomVisits(roomId) // 1025: 解散统一闭访问账(结束时刻不留人数,只结时长账——欢哥口径)
    // 1025 欢哥定稿: 无作品房也归档不硬删+终局成员快照(归档必须在删成员前——快照才能抓到终局在场; 合奏者全程来自musician_sessions档案)
    await pool.query(`UPDATE rooms SET status='archived', closed_at=NOW(),
      members_snapshot = (SELECT jsonb_build_object(
        'final', (SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', user_id, 'nick', nickname, 'role', role)), '[]'::jsonb) FROM room_members WHERE room_id = $1),
        'musicians', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('uid', u.id, 'nick', u.nickname)), '[]'::jsonb) FROM musician_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.room_id = $1)
      )) WHERE id=$1`, [roomId])
    await pool.query('DELETE FROM room_members WHERE room_id = $1', [roomId])
    // 1029 欢哥根治: 房间解散=录音终局（标题栏「录音将在房间解散后清除」承诺全兑现）——删未发表 session 行
    // (文件已随目录清理; 已发表的留——works.session_id FK NOT NULL 无 ON DELETE 且为快照溯源数据源,不可删)
    try {
      await pool.query("DELETE FROM session_tracks WHERE session_id IN (SELECT id FROM recording_sessions WHERE room_id=$1 AND status != 'published')", [roomId])
      await pool.query("DELETE FROM recording_sessions WHERE room_id=$1 AND status != 'published'", [roomId])
    } catch (e) { console.error('dissolve rm sessions ' + roomId + ':', e.message) }
    emitRoomsChanged('dissolve:' + roomCode)  // 1030 大厅实时化：卡片即时消失
    return true
}

// 末位合奏者离开 → 解散检查（解散体已抽 dissolveRoom，行为不变）
async function removeMemberAndCheckDissolve(userId, roomId, roomCode) {
  await closeMusicianSession(userId, roomId)  // 闭会话须在删房前（会话无 FK 依赖房，但逻辑上先结算）
  await closeRoomVisit(roomId, userId) // 1025: 离房闭访问段(时长结算)
  await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId])

  // 没有合奏者则解散房间（听众不参与房间存亡；jamony 定位是服务合奏者，没合奏者的房间无意义）
  const musicianCount = await pool.query(
    "SELECT COUNT(*) AS c FROM room_members WHERE room_id = $1 AND role = 'musician'", [roomId]
  )
  if (parseInt(musicianCount.rows[0].c) === 0) return dissolveRoom(roomId, roomCode)

  // 房间还在：房主离开则转移给在房间最久的合奏者（调起 jamsoul 时间最长，用 joined_at 近似）
  const roomResult = await pool.query('SELECT host_id FROM rooms WHERE id = $1', [roomId])
  if (roomResult.rows.length > 0 && roomResult.rows[0].host_id === parseInt(userId)) {
    const newHost = await pool.query(
      "SELECT user_id FROM room_members WHERE room_id = $1 AND role = 'musician' ORDER BY joined_at LIMIT 1",
      [roomId]
    )
    if (newHost.rows.length > 0) {
      await pool.query('UPDATE rooms SET host_id = $1 WHERE id = $2', [newHost.rows[0].user_id, roomId])
    }
  }
  await broadcastMembers(roomCode)
  return false
}

app.post('/api/rooms/:code/leave', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const userId = req.userId
    const id = await getRoomIdByCode(code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const memberResult = await pool.query('SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])
    if (memberResult.rows.length === 0) return res.status(404).json({ ok: false, msg: '你不在这个房间' })
    await removeMemberAndCheckDissolve(userId, id, code)
    res.json({ ok: true, msg: '已退出房间' })
  } catch (err) {
    console.error('Room leave error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 房主踢人（合奏者+听众均可踢，不能踢自己；被踢者拉入本房黑名单）
app.post('/api/rooms/:code/kick', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const userId = req.userId
    const { targetUserId } = req.body
    const id = await getRoomIdByCode(code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })

    // 仅房主可踢
    if (!(await isRoomHost(userId, code))) {
      return res.status(403).json({ ok: false, msg: '只有房主可以踢人' })
    }
    if (!targetUserId || Number(targetUserId) === Number(userId)) {
      return res.status(400).json({ ok: false, msg: '不能踢自己' })
    }

    // 确认目标在房
    const memberResult = await pool.query(
      'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [id, targetUserId]
    )
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '该用户不在房间' })
    }

    // 删 member + 写黑名单（复合主键去重）
    await closeMusicianSession(targetUserId, id)  // 被踢者闭会话
    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [id, targetUserId])
    await closeRoomVisit(id, targetUserId) // 1025: 被踢也闭段(停留是事实,照算)
    await pool.query(
      `INSERT INTO room_kicked (room_id, user_id, kicked_by) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [id, targetUserId, userId]
    )

    // 其他成员列表实时刷新（target 消失）；通知被踢者自行断开跳转
    await broadcastMembers(code)
    io.to(code).emit('member-kicked', { userId: Number(targetUserId), roomCode: code })

    res.json({ ok: true, msg: '已移出房间' })
  } catch (err) {
    console.error('Room kick error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 切换角色（合奏者 ↔ 听众）
app.post('/api/rooms/:code/switch-role', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const id = await getRoomIdByCode(code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const { newRole } = req.body
    const userId = req.userId

    // newRole 校验（原版未验证，任意值可入库；join 端点有同款归一化）
    if (newRole !== 'musician' && newRole !== 'listener') {
      return res.status(400).json({ ok: false, msg: '无效身份' })
    }

    if (newRole === 'musician') {
      const roomResult = await pool.query('SELECT max_musicians FROM rooms WHERE id = $1', [id])
      const count = await pool.query(
        "SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [id]
      )
      if (parseInt(count.rows[0].count) >= roomResult.rows[0].max_musicians) {
        return res.status(400).json({ ok: false, msg: '合奏名额已满' })
      }
    }

    const prevMember2 = await pool.query('SELECT role, nickname FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])
    await pool.query(
      'UPDATE room_members SET role = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
      [newRole, id, userId]
    )
    // 1025 访问档案: 切角色=闭旧段开新段
    if (prevMember2.rows[0] && prevMember2.rows[0].role !== newRole) {
      await closeRoomVisit(id, userId)
      await openRoomVisit(id, userId, prevMember2.rows[0].nickname, newRole)
    }
    if (newRole === 'listener') await closeMusicianSession(userId, id)  // 翻回听众即闭会话

    await broadcastMembers(code)
    res.json({ ok: true, msg: '身份已切换' })
  } catch (err) {
    console.error('Role switch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 更新房间成员音频状态 ==========
app.post('/api/rooms/:code/members/:userId/audio-status', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const userId = req.userId
    const { audioStatus } = req.body
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    await pool.query(
      'UPDATE room_members SET audio_status = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
      [audioStatus || 'connected', roomId, userId]
    )
    await broadcastMembers(code)
    res.json({ ok: true })
  } catch (err) {
    console.error('Audio status error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 房间心跳（10-06 漫游改造：从 playing 页提升到客户端全局层） ==========
// musician：照旧写 musician_sessions（乐手时长榜口径不变）；listener：只刷在场时间戳。
// 两种身份都刷 last_active_at —— L2 兜底交叉验证用（socket 断 + 心跳活 = 漫游保房）
app.post('/api/rooms/:code/heartbeat', requireAuth, async (req, res) => {
  try {
    if (req.userId === 0) return res.json({ ok: true })  // jamony-looper 不计时
    const { code } = req.params
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    // 服务端验在场身份：离房/被清后的迟到心跳 403，天然防幻影会话
    const memberRow = await pool.query(
      "SELECT rm.role FROM room_members rm WHERE rm.room_id = $1 AND rm.user_id = $2", [roomId, req.userId]
    )
    if (memberRow.rows.length === 0) return res.status(403).json({ ok: false, msg: '已不在房间' })
    if (!rateCheck(`hb:${roomId}:${req.userId}`, 10, 60000)) return res.status(429).json({ ok: false })
    if (memberRow.rows[0].role === 'musician') {
      // 先闭超过5分钟无心跳的陈旧开启会话（防同房重进把两次到访粘成一条）
      await pool.query(
        "UPDATE musician_sessions SET ended_at = last_seen WHERE user_id = $1 AND room_id = $2 AND ended_at IS NULL AND last_seen < NOW() - INTERVAL '5 minutes'",
        [req.userId, roomId]
      )
      await pool.query(
        `INSERT INTO musician_sessions (user_id, room_id, started_at, last_seen) VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (user_id, room_id) WHERE ended_at IS NULL DO UPDATE SET last_seen = NOW()`,
        [req.userId, roomId]
      )
    }
    await pool.query('UPDATE room_members SET last_active_at = NOW() WHERE room_id = $1 AND user_id = $2', [roomId, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('Heartbeat error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 录音 session（录音 → 授权 → 发表 全链路） ==========
const RECORDING_COUNTDOWN_SECONDS = 60  // 倒计时秒数（测试用 60，后期改 600）
const PUBLISH_LOCK_MS = 15 * 60 * 1000  // 1026 发表锁窗（欢哥拍板 5→15 分钟：调参进锁窗）——summarizeSession 懒释放与删除使用判定共用
const RECORDING_MAX_SECONDS = 5 * 60    // 单段录音上限（欢哥 0923：防滥用承压+引导少量多次+控制作品时长；5min 足够支撑排练/jam）
const recordingTimers = new Map()       // room_code → 5min 到点自动停定时器

// 开始录音（合奏者触发，一房一录）
app.post('/api/rooms/:code/recording/start', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const userId = req.userId
    const id = await getRoomIdByCode(code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const member = await pool.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [id, userId])
    if (member.rows.length === 0 || member.rows[0].role !== 'musician') {
      return res.status(403).json({ ok: false, msg: '仅合奏者可录音' })
    }
    const room = await pool.query('SELECT server_port, recording_active FROM rooms WHERE id=$1', [id])
    if (room.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (room.rows[0].recording_active) return res.json({ ok: false, msg: '已在录音中' })
    // 1025 存储阀(欢哥四点定稿): 每房未发表(authorizing)录音≤5段——advisory lock 事务串行同房并发,判定原子
    {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock($1)', [id])
        const cnt = await client.query("SELECT COUNT(*)::int AS c FROM recording_sessions WHERE room_id=$1 AND status='authorizing' AND hidden=FALSE", [id])
        const full = cnt.rows[0].c >= 5
        await client.query('COMMIT')
        if (full) return res.status(400).json({ ok: false, msg: '未发表录音已达上限（5段）。请删除不需要的段落，或将现有段落发表后再试。' })
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally { client.release() }
    }
    // JSON-RPC 通知 headless 开始录音
    try {
      await jsonRpcCall(room.rows[0].server_port, 'jamsoulserver/startRecording')
    } catch (e) {
      return res.status(500).json({ ok: false, msg: 'headless 未就绪，无法录音' })
    }
    // 录音开始时捕获鼓机是否已在运行（覆盖录音前就开鼓机的场景）；
    // 录音中才开鼓机由 drums/start API 把标志置 true
    const drumsAlreadyRunning = await isDrumsRunning(room.rows[0].server_port)
    const startedAt = new Date()  // 服务端权威起始时刻（stop 算真实时长 + 刷新回来校准客户端秒表）
    await pool.query('UPDATE rooms SET recording_active=TRUE, recording_started_at=$2, drums_used_this_recording=$3 WHERE id=$1', [id, startedAt, drumsAlreadyRunning])
    recordingStarters.set(String(code), userId)  // 记发起者（join-room 补发用，强刷回来还能显示"停止"）
    io.to(code).emit('recording-state', { roomId: code, active: true, userId, startedAt: startedAt.toISOString(), maxSeconds: RECORDING_MAX_SECONDS })
    // 5min 到点自动停（与手动停同一核心流程；pm2 重启丢定时器由 5min 清扫任务兜底）
    const maxTimer = setTimeout(async () => {
      recordingTimers.delete(String(code))
      try {
        const rid = await getRoomIdByCode(code)
        if (!rid) return
        console.log(`Recording max ${RECORDING_MAX_SECONDS}s reached, auto-stop room ${code}`)
        await stopRoomRecording(code, rid, undefined)
      } catch (e) { console.error('recording auto-stop error:', e) }
    }, RECORDING_MAX_SECONDS * 1000)
    recordingTimers.set(String(code), maxTimer)
    res.json({ ok: true })
  } catch (err) {
    console.error('Recording start error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 停止录音 → 创建 session + 分轨快照 + jamony-looper 检测 + 启动倒计时
// 停止录音核心流程（手动停 / 5min 到点自动停 共用）：鉴权由调用方负责，
// 这里走"快停快应（状态翻转+广播）+ 后台落档（等WAV→建session/分轨→标准化）"
async function stopRoomRecording(code, id, duration) {
  try {
    const room = await pool.query('SELECT server_port, recording_active, drums_used_this_recording, recording_started_at FROM rooms WHERE id=$1', [id])
    if (room.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const roomPort = room.rows[0].server_port
    // 幂等防重：已在非录音态（另一 tab 已停过/自动停已触发）直接成功返回，不再重复建 session
    if (!room.rows[0].recording_active) return { ok: true }

    // 服务端权威时长：客户端秒表跨强刷会重置少算（音频无损仅标签偏短）；无起始时刻（异常）回退客户端上报值
    let dur = duration || '0:00'
    if (room.rows[0].recording_started_at) {
      const secs = Math.max(1, Math.round((Date.now() - new Date(room.rows[0].recording_started_at).getTime()) / 1000))
      dur = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`
      console.log(`Recording duration (server): ${dur}, client reported: ${duration || 'none'}`)
    }

    // JSON-RPC 获取录音目录并停止录音
    let recDir = ''
    try {
      const status = await jsonRpcCall(roomPort, 'jamsoulserver/getRecorderStatus')
      recDir = (status && status.recordingDirectory) || ''
    } catch (e) {
      console.error('getRecorderStatus error:', e.message)
    }
    try {
      await jsonRpcCall(roomPort, 'jamsoulserver/stopRecording')
    } catch (e) {
      console.error('stopRecording error:', e.message)
    }
    // ★ 响应前钉死本次录音子目录：快停放开状态后若立刻开新段会新建 Jam-* 目录，
    //   后台落档只处理这份钉死目录，防扫描"最新目录"抓到新段（欢哥的时序预案）
    let pinnedDir = ''
    if (recDir && fs.existsSync(recDir)) {
      const subdirs = fs.readdirSync(recDir).filter(d => d.startsWith('Jam-')).sort()
      if (subdirs.length > 0) pinnedDir = path.join(recDir, subdirs[subdirs.length - 1])
    }

    // ★ 快停快应（2026-09-23）：原先"2s 等 WAV 落盘 + 扫文件 + 建 session"全部串行挡在响应里，
    //   按钮僵 ~5s（录音越长 RPC 越慢还会更长）→ 用户连点 → 翻面后误开新段。
    //   现在响应路径只留必要三件事：状态翻 FALSE + 广播已停 + 回包，按钮延迟降到 RPC 的 ~1s。
    // 原子翻转：手动停与 5min 到点自动停并发时，只有一方能翻转成功（另一方 0 行直接返回，不重复落档）
    const flipped = await pool.query("UPDATE rooms SET recording_active=FALSE, recording_started_at=NULL, drums_used_this_recording=FALSE WHERE id=$1 AND recording_active=TRUE RETURNING id", [id])
    if (flipped.rows.length === 0) return { ok: true }
    const rt = recordingTimers.get(String(code))
    if (rt) { clearTimeout(rt); recordingTimers.delete(String(code)) }  // 手动停到点前，撤自动停定时器
    recordingStarters.delete(String(code))
    io.to(code).emit('recording-state', { roomId: code, active: false, finalizing: true }) // 1025: 停止广播带归档中标记——全房按钮三态同步(欢哥: 归档是房间级事件)

    // ★ 后台落档：等 headless 写完 WAV → 只扫钉死目录 → 建 session/分轨 → 广播 + 标准化
    setTimeout(() => {
      (async () => {
        try {
          await new Promise(r => setTimeout(r, 2000))
          const wavFiles = []
          const recSessDir = pinnedDir
          if (recSessDir && fs.existsSync(recSessDir)) {
            const files = fs.readdirSync(recSessDir).filter(f => f.endsWith('.wav')).sort()
            for (const f of files) {
              wavFiles.push({ filename: f, fullPath: path.join(recSessDir, f) })
            }
            console.log('WAV files found:', wavFiles.length, 'in', recSessDir)
          }

    // 段落序号 = MAX(index)+1 持续递增(1025 欢哥定稿:删除不回收序号——COUNT会重用致撞号乱序;hidden行天然参与,永不重名)
    const mx = await pool.query('SELECT COALESCE(MAX(index),0) AS m FROM recording_sessions WHERE room_id=$1', [id])
    const index = parseInt(mx.rows[0].m) + 1

    // 快照当前合奏者 → 分轨，按顺序匹配 WAV 文件
    const musicians = await pool.query(
      `SELECT rm.user_id, rm.nickname, u.instrument_category FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1 AND rm.role = 'musician' ORDER BY rm.joined_at`,
      [id]
    )
    // 重命名 WAV：统一为 {昵称}_record_{段号}.wav
    const padIdx = String(index).padStart(3, '0')
    // 先算好幽灵数量（循环内会改文件名，必须在循环前算）
    const ghostCount = wavFiles.filter(w => w.filename.includes('127_0_0_1')).length
    let humanIdx = 0
    for (const w of wavFiles) {
      const isGhost = w.filename.includes('127_0_0_1')
      let nick = ''
      if (isGhost) {
        nick = 'jamony-looper'
      } else {
        nick = (musicians.rows[humanIdx]?.nickname || 'unknown').replace(/[\\/\0]/g, '_')
        humanIdx++
      }
      const ext = path.extname(w.filename)
      const newName = nick + '_record_' + padIdx + ext
      const newPath = path.join(recSessDir, newName)
      try { fs.renameSync(w.fullPath, newPath); console.log('  rename:', w.filename, '->', newName) } catch (e) {}
      w.filename = newName
      w.fullPath = newPath
    }
    // ⭐ 闸1·全量能量检测（1026 欢哥定案：「署名跟声音事实走」——昨天只测 looper，今天全部轨）
    // 并行探测所有 WAV（人+looper）；probe 失败=null=保守按有声（宁放过不误丢，looper 回退哲学同源）。
    // 静音轨（用户或 looper）一律不进 session——无声者不参与授权/署名/混音，从根上杜绝
    // 「带着无声轨进 session→署名却无实质声音」的移花接木温床。
    const audibleMap = new Map() // fullPath -> boolean
    await Promise.all(wavFiles.map(w =>
      probeMaxVolumeDb(w.fullPath).then(db => {
        const audible = db === null ? true : db > -60
        audibleMap.set(w.fullPath, audible)
        if (!audible) console.log(`[recording] 分轨静默不拉入: ${w.filename} (max_volume=${db}dB)`)
      })
    ))
    const looperWav = wavFiles.find(w => w.filename.startsWith('jamony-looper'))
    const looperAudible = looperWav ? audibleMap.get(looperWav.fullPath) !== false : false
    const userWavs = wavFiles.filter(w => !w.filename.startsWith('jamony-looper'))

    // ⭐ 无人类有效轨（全员静音或仅 looper 发声）→ 不建 session（欢哥拍板：不落列表+提示，技术最干净）
    // 段号/存储阀天然不消耗；Jam-* 目录清理杜绝孤儿；socket 通知全房（前端清「归档中」态+品牌弹窗）。
    const audibleHumans = userWavs.filter(w => audibleMap.get(w.fullPath) !== false)
    if (audibleHumans.length === 0) {
      // ⭐ 1026 护栏（/tmp 事故判例同款）：目录清理白名单——只清录音仓内段目录，jamsoul 返回异常路径时宁留勿删
      if (recSessDir && /^\/var\/jamony\/recordings\/room-\d+-records\/[^/]+$/.test(recSessDir)) {
        try {
          if (fs.existsSync(recSessDir)) fs.rmSync(recSessDir, { recursive: true, force: true })
        } catch (e) { console.error('[recording] 空段目录清理失败:', e.message) }
      } else if (recSessDir) {
        console.error('[recording] 空段清理: 拒绝非录音仓目录(白名单外):', recSessDir)
      }
      console.log(`[recording] 本次录音无有效用户内容，不生成段落 (人轨可听=0, looper=${looperAudible}): ${recSessDir}`)
      io.to(code).emit('session-discarded', { roomId: code, reason: 'no_user_audio', dirName: path.basename(recSessDir || ''), ts: new Date().toISOString() })
      return
    }

    // 创建 session（移到能量判定之后——无有效人轨不建行；dir_name 记录本段目录名，1025 删除定位根治沿用）
    const sess = await pool.query(
      `INSERT INTO recording_sessions (room_id, index, duration, countdown_seconds, expires_at, dir_name)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * interval '1 second'), $6) RETURNING *`,
      [id, index, dur || '0:00', RECORDING_COUNTDOWN_SECONDS, RECORDING_COUNTDOWN_SECONDS, path.basename(pinnedDir || '')]
    )
    const sessionId = sess.rows[0].id

    // 人轨插行：joined_at 顺序位置配对（配对先于过滤，保对位不漂移），无 WAV / 静默者不插行
    // （1026 欢哥定案：取消「缺失补空行」——无声者不该出现在授权列表；空行还会让混音器 every(normalized) 永假打不开）
    let wavIdx = 0
    for (const m of musicians.rows) {
      const matched = wavIdx < userWavs.length ? userWavs[wavIdx] : null
      wavIdx++
      if (!matched) continue                                    // 无 WAV（未开麦等）→ 无行
      if (audibleMap.get(matched.fullPath) === false) continue  // 静默 → 无行
      await pool.query(
        'INSERT INTO session_tracks (session_id, user_id, nickname, instrument_category, file_path) VALUES ($1, $2, $3, $4, $5)',
        [sessionId, m.user_id, m.nickname, m.instrument_category || '', matched.fullPath]
      )
    }

    if (!looperAudible) console.log(`[recording] session#${sessionId} looper分轨静默(-60dB阈值内),不拉入`)
    if (looperAudible) {
      await pool.query(
        `INSERT INTO session_tracks
         (session_id, user_id, is_system, nickname, instrument_category, allow_use, allow_attribution, allow_download, use_locked, attribution_locked, file_path)
         VALUES ($1, 0, TRUE, 'jamony-looper', '打击乐器', TRUE, TRUE, TRUE, TRUE, TRUE, $2)`,
        [sessionId, looperWav ? looperWav.fullPath : '']
      )
    }

          await broadcastSessions(code)
          // 异步音量标准化（完成后 socket 通知前端）
          setTimeout(() => {
      (async () => {
        try {
          const tracks = await pool.query(
            "SELECT id, file_path FROM session_tracks WHERE session_id=$1 AND file_path != ''",
            [sess.rows[0].id]
          );
          for (const tr of tracks.rows) {
            if (!tr.file_path || !require('fs').existsSync(tr.file_path)) continue;
            const f = tr.file_path;
            require('child_process').exec(
              'node ' + __dirname + '/normalize-wav.js -14 -1 ' + JSON.stringify(f),
              { timeout: 120000 },
              async () => {
                try {
                  await pool.query('UPDATE session_tracks SET normalized=TRUE WHERE id=$1', [tr.id]);
                  io.to(code).emit('normalize-done', { sessionId: sess.rows[0].id, trackId: tr.id });
                } catch (e) {}
              }
            );
          }
        } catch (e) {
          console.error('Normalize error:', e.message);
        }
      })();
    }, 0);
        } catch (e) {
          console.error('Recording stop background error:', e)
        }
      })()
    }, 0)
    return { ok: true }
  } catch (err) {
    console.error('Recording stop error:', err)
    return { ok: false, msg: '服务器错误' }
  }
}

// 手动停止录音（合奏者）：鉴权后走核心流程
app.post('/api/rooms/:code/recording/stop', requireAuth, async (req, res) => {
  const { code } = req.params
  const { duration } = req.body
  const id = await getRoomIdByCode(code)
  if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
  const member = await pool.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [id, req.userId])
  if (member.rows.length === 0 || member.rows[0].role !== 'musician') {
    return res.status(403).json({ ok: false, msg: '仅合奏者可录音' })
  }
  res.json(await stopRoomRecording(code, id, duration))
})

// 删除录音 session（1025 欢哥四点定稿）
// 权限: 合奏者 + 本人在该段有"授权使用"的轨（未授权=自动放弃该段,无处置权——授权即所有权）
// 未发表=物理删（分轨目录+行,真释放存储）；已发表=软隐藏（作品已入库,行保留溯源 works.session_id）
app.delete('/api/rooms/:code/sessions/:sid', requireAuth, async (req, res) => {
  try {
    const { code, sid } = req.params
    const id = await getRoomIdByCode(code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const sessionId = parseInt(sid)
    const member = await pool.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [id, req.userId])
    if (member.rows.length === 0 || member.rows[0].role !== 'musician') {
      return res.status(403).json({ ok: false, msg: '仅合奏者可操作' })
    }
    const session = await pool.query('SELECT * FROM recording_sessions WHERE id=$1 AND room_id=$2 AND hidden=FALSE', [sessionId, id])
    if (!session.rows[0]) return res.status(404).json({ ok: false, msg: '录音不存在' })
    const own = await pool.query('SELECT 1 FROM session_tracks WHERE session_id=$1 AND user_id=$2 AND allow_use=TRUE', [sessionId, req.userId])
    if (own.rows.length === 0) {
      // 1028 欢哥实测死角根治: 素材无主=全部人类轨已表态且全禁用 → 任一人类轨主可删(单人禁用/多人全禁用
      // 均不再悬死; 未决⏳不算无主——有人可能即将授权,不能抢跑; looper 系统轨不参与判定)
      const human = await pool.query('SELECT user_id, allow_use FROM session_tracks WHERE session_id=$1 AND is_system=FALSE', [sessionId])
      const ownerless = human.rows.length > 0 && human.rows.every(t => t.allow_use === false) && human.rows.some(t => t.user_id === req.userId)
      if (!ownerless) {
        return res.status(403).json({ ok: false, msg: '仅授权使用该录音的合奏者可删除——未授权即视为放弃该段' })
      }
    }

    // ⭐ 1026 使用中判定（欢哥定稿：正在使用的文件不可删除——一视同仁含本人）
    // ①混音器开着（socket presence：试听/发表不分模式，全量可点击者=房间全员角色无关）
    // ②发表锁未过期（限定 status=authorizing 且 claimed_at 在锁窗内——懒释放未触发也不误挡，已发表不算发表中）
    const usingCount = (mixerUsage.get(sessionId) || new Set()).size
    const claimedMs = session.rows[0].claimed_at ? new Date(session.rows[0].claimed_at).getTime() : 0
    const lockActive = session.rows[0].status === 'authorizing' && !!session.rows[0].publisher_user_id && claimedMs > 0 && (Date.now() - claimedMs < PUBLISH_LOCK_MS)
    if (usingCount > 0 || lockActive) {
      return res.status(409).json({ ok: false, msg: '当前段落正在使用中，请稍后再试，或检查自己是否已退出当前段落的试听。' })
    }
    if (session.rows[0].status === 'published') {
      await pool.query('UPDATE recording_sessions SET hidden=TRUE WHERE id=$1', [sessionId])
    } else {
      // 目录定位双源: ①session.dir_name(根治——空段也有目录) ②分轨 file_path dirname(兜底——历史段无 dir_name)
      const tracks = await pool.query("SELECT file_path FROM session_tracks WHERE session_id=$1 AND file_path IS NOT NULL AND file_path != ''", [sessionId])
      let dir = null
      if (session.rows[0].dir_name) {
        const roomPort = await pool.query('SELECT server_port FROM rooms WHERE id=$1', [id])
        const byName = `/var/jamony/recordings/room-${roomPort.rows[0].server_port}-records/${session.rows[0].dir_name}`
        if (fs.existsSync(byName)) dir = byName
      }
      if (!dir) for (const t of tracks.rows) { const d = require('path').dirname(t.file_path); if (fs.existsSync(d)) { dir = d; break } }
      // ⭐ 1026 护栏（/tmp 事故判例）：目录删除白名单——只允许录音仓内的段目录。
      //    file_path 若被污染/错配（如 E2E 指向 /tmp），绝不能 rm -rf 其任意父目录——今晚生产 /tmp 即被此路径误删后重建。
      if (dir && !/^\/var\/jamony\/recordings\/room-\d+-records\/[^/]+$/.test(dir)) {
        console.error('[recording] delete: 拒绝非录音仓目录删除(白名单外):', dir)
        dir = null
      }
      if (dir) { try { await execFileAsync('rm', ['-rf', dir], { timeout: 5000 }) } catch (e) { console.error('[recording] 删除分轨目录失败:', e.message) } }  // 1029 异步化
      await pool.query('DELETE FROM session_tracks WHERE session_id=$1', [sessionId])
      await pool.query('DELETE FROM recording_sessions WHERE id=$1', [sessionId])
    }
    io.to(code).emit('sessions-update', { sessions: await getRoomSessions(id) })
    res.json({ ok: true })
  } catch (e) {
    console.error('[recording] delete session error:', e.message)
    res.status(500).json({ ok: false, msg: '删除失败' })
  }
})
// 试听拉流（混音器/发表 fetch 用；他人需 allow_use）——文件下载走下方 /download-file（1014 起两窗各司其职）
app.get('/api/rooms/:code/sessions/:sid/tracks/:tid/download', requireAuth, async (req, res) => {
  try {
    const { code, sid: sessionId, tid: trackId } = req.params
    const userId = req.userId
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })

    const tr = await pool.query(
      'SELECT * FROM session_tracks WHERE id=$1 AND session_id=$2',
      [trackId, sessionId]
    )
    if (tr.rows.length === 0) return res.status(404).json({ ok: false, msg: '分轨不存在' })
    const track = tr.rows[0]

    // 验证用户是房间成员
    const member = await pool.query(
      'SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2',
      [roomId, userId]
    )
    if (member.rows.length === 0) return res.status(403).json({ ok: false, msg: '你不是该房间成员' })

    // 1026 排练室回放哲学（欢哥定案）：房间内试听流=大家一起回放录音，房间成员全可听
    // （线下录完一起听回放天经地义；授权管的是「带出房间」——/download-file 的授权规则零改动）。
    // 旧规则（他人轨须 allow_use）曾致：授权未齐时一轨 403 → 整个试听混音器打不开，拒绝者一人扣全房人质。

    // 文件存在性检查
    if (!track.file_path || !fs.existsSync(track.file_path)) {
      return res.status(404).json({ ok: false, msg: 'WAV 文件不存在' })
    }

    // 流式发送 WAV
    res.setHeader('Content-Type', 'audio/wav')
    const stream = fs.createReadStream(track.file_path)
    stream.pipe(res)
    stream.on('error', () => { if (!res.headersSent) res.status(500).end() })
  } catch (err) {
    console.error('Track download error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 下载分轨文件（1014 修复：下载授权独立于使用授权——自己始终可下，他人需轨主 allow_download=true）。
// 历史病根：曾有同路径双注册（/download 上先注册本试听版、后注册下载版），Express 先到先得致下载版永久死代码——
// 下载请求全涌到试听版被 allow_use 的尺子错量（病A：可下载但未授权使用→403 假按钮；病B：授权使用+禁下载→直连URL可拿文件）。
// 现下载独立开窗（本路由），试听拉流归上方 /download（查 allow_use，混音器 fetch 用），各司其职。
app.get('/api/rooms/:code/sessions/:sid/tracks/:tid/download-file', requireAuth, async (req, res) => {
  try {
    const { code, sid: sessionId, tid: trackId } = req.params
    const userId = req.userId
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })

    const tr = await pool.query('SELECT * FROM session_tracks WHERE id=$1 AND session_id=$2', [trackId, sessionId])
    if (tr.rows.length === 0) return res.status(404).json({ ok: false, msg: '分轨不存在' })
    const track = tr.rows[0]

    const member = await pool.query('SELECT id FROM room_members WHERE room_id=$1 AND user_id=$2', [roomId, userId])
    if (member.rows.length === 0) return res.status(403).json({ ok: false, msg: '你不是该房间成员' })

    // 下载授权独立判定：自己 或 轨主开放下载（不查 allow_use——产品逻辑：下载不制于使用授权）
    const isSelf = track.user_id === userId
    if (!isSelf && track.allow_download !== true) {
      return res.status(403).json({ ok: false, msg: '未开放下载' })
    }

    if (!track.normalized) return res.status(403).json({ ok: false, msg: '音轨准备中' })
    if (!track.file_path || !fs.existsSync(track.file_path)) {
      return res.status(404).json({ ok: false, msg: 'WAV 文件不存在' })
    }

    const fileName = path.basename(track.file_path)
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Type', 'audio/wav')
    const stream = fs.createReadStream(track.file_path)
    stream.pipe(res)
    stream.on('error', () => { if (!res.headersSent) res.status(500).end() })
  } catch (err) {
    console.error('Track download-file error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 抢发表锁（先到先得）
app.post('/api/rooms/:code/sessions/:sid/claim-publish', requireAuth, async (req, res) => {
  try {
    const { code, sid: sessionId } = req.params
    const userId = req.userId
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })

    // ⭐ 1026 竞态资格：本 session 的分轨主人（有能量入轨的合奏者）才可抢发表权
    //   （闸1 后无声者无行=天然无资格；听众/无轨房成员不可竞态）
    const ownTrack = await pool.query(
      'SELECT 1 FROM session_tracks WHERE session_id=$1 AND user_id=$2 AND is_system=FALSE LIMIT 1',
      [sessionId, userId]
    )
    if (ownTrack.rows.length === 0) return res.status(403).json({ ok: false, msg: '只有本段落的乐手可以发表' })

    // 原子化更新：只有 publisher_user_id 为 NULL 时才能写入
    const result = await pool.query(
      "UPDATE recording_sessions SET publisher_user_id=$1, claimed_at=NOW() WHERE id=$2 AND publisher_user_id IS NULL AND status='authorizing' RETURNING *",
      [userId, sessionId]
    )

    if (result.rows.length === 0) {
      // 已经被别人抢了或 session 已发表 — 查是谁
      const sess = await pool.query('SELECT publisher_user_id FROM recording_sessions WHERE id=$1', [sessionId])
      if (sess.rows.length === 0) return res.status(404).json({ ok: false, msg: 'Session 不存在' })
      if (sess.rows[0].publisher_user_id === null) {
        return res.status(409).json({ ok: false, msg: '抢锁失败' })
      }
      const pid = sess.rows[0].publisher_user_id
      const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [pid])
      const nick = u.rows.length > 0 ? u.rows[0].nickname : '未知用户'
      return res.json({ ok: true, claimed: false, publisher_user_id: pid, publisher_nickname: nick })
    }

    // 抢锁成功，广播 sessions 更新
    await broadcastSessions(code)
    const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [userId])
    const nick = u.rows.length > 0 ? u.rows[0].nickname : '未知用户'
    res.json({ ok: true, claimed: true, publisher_user_id: userId, publisher_nickname: nick })
  } catch (err) {
    console.error('Claim publish error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 释放发表锁（关闭发表卡片但未发表时调用）
app.post('/api/rooms/:code/sessions/:sid/release-claim', requireAuth, async (req, res) => {
  try {
    const { code, sid: sessionId } = req.params
    const userId = req.userId
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })

    await pool.query(
      'UPDATE recording_sessions SET publisher_user_id=NULL WHERE id=$1 AND publisher_user_id=$2',
      [sessionId, userId]
    )

    // 广播 sessions 更新
    await broadcastSessions(code)
    res.json({ ok: true })
  } catch (err) {
    console.error('Release claim error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 发表作品
app.post('/api/rooms/:code/sessions/:sid/publish', requireAuth, upload.fields([{ name: 'mp3', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), async (req, res) => {
  try {
    const { code, sid: sessionId } = req.params
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })

    // 验证 session 存在
    const sess = await pool.query('SELECT * FROM recording_sessions WHERE id=$1 AND room_id=$2', [sessionId, roomId])
    if (sess.rows.length === 0) return res.status(404).json({ ok: false, msg: 'Session 不存在' })
    if (sess.rows[0].status === 'published') return res.status(400).json({ ok: false, msg: '该段落已发表' })

    // ⭐ 1026 补洞：锁的强制性此前只在前端——服务端校验提交人=持锁人+分轨主人
    //   （NULL=懒超时已释放；非持锁人直打 API 一律 403）
    if (!sess.rows[0].publisher_user_id || sess.rows[0].publisher_user_id !== req.userId) {
      return res.status(403).json({ ok: false, msg: '发表权已被他人持有或已释放，请重新获取' })
    }
    const ownTrackPub = await pool.query(
      'SELECT 1 FROM session_tracks WHERE session_id=$1 AND user_id=$2 AND is_system=FALSE LIMIT 1',
      [sessionId, req.userId]
    )
    if (ownTrackPub.rows.length === 0) return res.status(403).json({ ok: false, msg: '只有本段落的乐手可以发表' })

    // ⭐ 1029 硬闸(欢哥铁律): 作品不能是纯伴奏/纯looper——无真人乐手授权使用时拒绝发表
    //    (前端 canPublish 同口径; 此处防 curl 直打绕过前端灰)
    const humanAgreed = await pool.query(
      'SELECT 1 FROM session_tracks WHERE session_id=$1 AND is_system=FALSE AND allow_use=TRUE LIMIT 1',
      [sessionId]
    )
    if (humanAgreed.rows.length === 0) {
      return res.status(400).json({ ok: false, msg: '作品必须有真人乐手授权参与——无人授权使用时无法发表' })
    }

    const { title, style, copyright, cover_song, cover_author, source, description, duration, cover_gradient, has_drum_track, agreed, authors_json } = req.body
    const publisher_user_id = req.userId

    if (!title || !style || !copyright) {
      return res.status(400).json({ ok: false, msg: '缺少必填字段' })
    }
    if (!(await guardCanPublish(publisher_user_id, res))) return
    const publishText = [title, description, cover_song, cover_author, source].filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (!(await moderatePublishText('work', null, publisher_user_id, req.nickname, publishText))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }

    // ⭐ 闸4·混音快照（1026 定案：所发即所听）：mix_params 必到必验，成品=用户混音参数渲染
    //   旧客户端缺失 → 400 请升级（与 web 同窗部署）
    let mixParams = null
    try { mixParams = req.body.mix_params ? JSON.parse(req.body.mix_params) : null } catch (e) { mixParams = null }
    if (!mixParams || !Array.isArray(mixParams.tracks) || mixParams.tracks.length === 0) {
      return res.status(400).json({ ok: false, msg: '缺少混音参数，请升级客户端后重试' })
    }
    // 形状钳制：master 0~2；每轨 gain 0~2 / pan -1~1；range 0≤a<b（缺省=全曲）
    const mpMaster = Math.min(2, Math.max(0, Number(mixParams.master) || 0))
    const mpTracks = mixParams.tracks
      .map(t => ({ track_id: Number(t.track_id), gain: Math.min(2, Math.max(0, Number(t.gain) || 0)), pan: Math.min(1, Math.max(-1, Number(t.pan) || 0)) }))
      .filter(t => Number.isFinite(t.track_id))
    let mpA = 0, mpB = Infinity
    if (mixParams.range && Number.isFinite(Number(mixParams.range.a)) && Number.isFinite(Number(mixParams.range.b))) {
      mpA = Math.max(0, Number(mixParams.range.a))
      mpB = Math.max(mpA + 1, Number(mixParams.range.b)) // 最小区间 1s，防极短探测窗口
    }
    // 护栏：总线静音或全轨静音 → 拒
    if (mpMaster <= 0) return res.status(400).json({ ok: false, msg: '总线音量为静音，无法发表' })
    if (mpTracks.every(t => t.gain <= 0)) return res.status(400).json({ ok: false, msg: '所有分轨均为静音，无法发表' })

    // ⭐ 权威集合对齐：mix_params 必须恰好覆盖全部「授权使用的人类轨」
    //   （防客户端剔除有声轨绕闸）；looper（is_system）跟随客户端、豁免终审——
    //    系统轨非人类参与，豁免与其授权状态无关（1026 欢哥修正判例：looper 默认全授权）
    const authRowsAll = await pool.query(
      'SELECT id, nickname, user_id, is_system, instrument_category, file_path FROM session_tracks WHERE session_id=$1 AND allow_use=TRUE',
      [sessionId]
    )
    const humanRows = authRowsAll.rows.filter(t => !t.is_system)
    const authIds = new Set(humanRows.map(t => String(t.id)))
    const looperIds = new Set(authRowsAll.rows.filter(t => t.is_system).map(t => String(t.id)))
    const sentIds = new Set(mpTracks.map(t => String(t.track_id)))
    // 对齐只比人类轨（looper 跟随客户端、豁免——与终审豁免同口径）；未知轨 id 一律拒
    const missingIds = [...authIds].filter(id => !sentIds.has(id))
    const unknownIds = [...sentIds].filter(id => !authIds.has(id) && !looperIds.has(id))
    if (missingIds.length > 0 || unknownIds.length > 0) {
      return res.status(400).json({ ok: false, msg: '混音分轨与已授权分轨不一致，请重新打开发表混音器' })
    }

    // ⭐ 闸3·区间能量终审：人类轨在发表区间 [a,b) 内峰值须 >-60dB
    //   防「区间外出声掩人耳目」移花接木变体（欢哥红队推演）；全曲缺省跳过=落版闸1已测；
    //   探测失败=保守放行（宁放过不误拦，probe 哲学同源）
    if (mpB !== Infinity) {
      const silentNames = []
      await Promise.all(humanRows.map(async t => {
        if (!t.file_path) return
        const db = await probeMaxVolumeDb(t.file_path, mpA, Math.max(mpB - mpA, 1))
        if (db !== null && db <= -60) silentNames.push(t.nickname)
      }))
      if (silentNames.length > 0) {
        return res.status(400).json({ ok: false, code: 'SILENT_RANGE', msg: `以下分轨在所选区间内无声：${silentNames.join('、')}。请调整发表区间，或由该乐手拒绝使用授权` })
      }
    }

    // 规范化快照（权威字段以服务端钳制值为准，展示字段 DB 行补全，客户端预检证据原样留档）
    const rowById = new Map(authRowsAll.rows.map(r => [String(r.id), r]))
    const mixSnapshot = {
      version: 1,
      limiter: 'fixed-v1',
      engine: 'webaudio-v1',
      rendered_at: typeof mixParams.rendered_at === 'string' ? mixParams.rendered_at : new Date().toISOString(),
      master: mpMaster,
      range: { a: mpA, b: mpB === Infinity ? null : mpB },
      tracks: mpTracks.map(t => {
        const row = rowById.get(String(t.track_id))
        const client = (mixParams.tracks.find(ct => String(ct.track_id) === String(t.track_id)) || {})
        return {
          track_id: t.track_id,
          user_id: row ? row.user_id : null,
          nickname: row ? row.nickname : (client.nickname || ''),
          is_system: row ? row.is_system : false,
          instrument_category: row ? row.instrument_category : (client.instrument_category || ''),
          gain: t.gain,
          gain_db: Math.round(20 * Math.log10(Math.max(t.gain, 1e-4)) * 100) / 100,
          pan: t.pan,
          in_range: client.in_range !== false,
        }
      }),
      client_audit: mixParams.client_audit || null,
    }

    // 先插入 works 获取 workId(1024 音频线: audio_review='pending'——公域不可见, 本人可见挂审核中角标, 审毕解锁)
    const workId = nextId() // 1025 雪花: 显式发号
    const work = await pool.query(
      `INSERT INTO works (id, room_id, session_id, publisher_user_id, title, style, copyright_type, cover_song, cover_author, source, description, duration, cover_gradient, has_drum_track, agreed, status, audio_review, mix_params)
       VALUES ($15, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'published', 'pending', $16)`,
      [roomId, sessionId, publisher_user_id, title, style, copyright, cover_song || '', cover_author || '', source || '', description || '', duration || '', cover_gradient || '', has_drum_track === 'true', agreed === 'true', workId, JSON.stringify(mixSnapshot)]
    )

    // 创建作品专属文件夹 /var/jamony/works/YYYYMMDDHHmm_userId_作品名称_sessionId/
    const now = new Date()
    const ts = String(now.getFullYear()) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0')
    const safeTitle = title.replace(/[\\/:*?"<>|\[\]()\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 20)
    const folderName = `${ts}_user${publisher_user_id}_${safeTitle}_${sessionId}`
    const workDir = path.join(worksDir, folderName)
    try { fs.mkdirSync(workDir, { recursive: true }) } catch (e) {}

    // 保存 MP3
    let mp3Path = ''
    const mp3File = (req.files?.mp3)?.[0]
    if (mp3File) {
      mp3Path = path.join(workDir, 'mix.mp3')
      fs.renameSync(mp3File.path, mp3Path)
    }

    // 保存封面(1024 图片线: 双管审核——拒传删封面文件, 作品文本部分已过审不受影响, 发布中止)
    let coverImagePath = ''
    const coverFile = req.files?.cover_image?.[0]
    if (coverFile) {
      const ext = path.extname(coverFile.originalname) || '.jpg'
      coverImagePath = path.join(workDir, 'cover' + ext)
      fs.renameSync(coverFile.path, coverImagePath)
      if (!(await moderateImage('work_cover', coverImagePath, req.userId, req.nickname))) {
        try { fs.unlinkSync(coverImagePath) } catch (e) {}
        return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
      }
    }

    // 回填文件路径
    await pool.query('UPDATE works SET mp3_path=$1, cover_image_path=$2 WHERE id=$3', [mp3Path, coverImagePath, workId])

    // 入库 work_authors
    if (authors_json) {
      const authors = JSON.parse(authors_json)
      for (const a of authors) {
        await pool.query(
          'INSERT INTO work_authors (work_id, user_id, nickname, instrument_category, is_anonymous) VALUES ($1, $2, $3, $4, $5)',
          [workId, a.userId ?? null, a.nickname || '', a.instrumentCategory || '', a.isAnonymous || false]
        )
      }
    }

    // 标记 session status = 'published'
    await pool.query("UPDATE recording_sessions SET status='published' WHERE id=$1", [sessionId])

    // socket 广播 sessions 刷新
    await broadcastSessions(code)

    // 1024 音频线: 发布成功即起异步审核(fail-hold——ASR故障作品保持审核中, 兜底扫描自愈)
    submitWorkAudioReview(workId).catch(() => {})

    res.json({ ok: true, workId })
  } catch (err) {
    console.error('Publish error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 作品列表（works 表，含作者聚合）==========
app.get('/api/works', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit
    const sort = req.query.sort || 'newest'

    let order = 'ORDER BY w.created_at DESC, w.id DESC'
    if (sort === 'plays') order = 'ORDER BY w.plays DESC, w.id DESC'
    // 欢哥 08-31 定稿: likes 排序三级权重——点赞>播放>发布时间(新在前)
    if (sort === 'likes') order = 'ORDER BY w.likes DESC, w.plays DESC, w.created_at DESC, w.id DESC'

    const countResult = await pool.query("SELECT COUNT(*) FROM works WHERE status = 'published' AND (audio_review = 'passed' OR audio_review IS NULL)")
    const total = parseInt(countResult.rows[0].count)

    const currentUserId = req.query.userId ? parseInt(req.query.userId) : null
    const result = await pool.query(`
      SELECT w.*, (
        SELECT COALESCE(json_agg(row_to_json(wa_sub) ORDER BY wa_sub.id), '[]'::json)
        FROM (
          SELECT wa.id, wa.user_id, COALESCE(u.nickname, wa.nickname) AS nickname, wa.instrument_category, wa.is_anonymous, COALESCE(u.is_system, FALSE) AS is_system, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url
          FROM work_authors wa LEFT JOIN users u ON u.id = wa.user_id WHERE wa.work_id = w.id
        ) wa_sub
      ) AS authors,
      EXISTS(SELECT 1 FROM works_likes WHERE work_id = w.id AND user_id = $3) AS is_liked
      FROM works w
      WHERE w.status = 'published'
      AND (w.audio_review = 'passed' OR w.audio_review IS NULL)
      ${order}
      LIMIT $1 OFFSET $2
    `, [limit, offset, currentUserId])

    const works = result.rows.map(row => {
      const authors = row.authors || []
      const realAuthors = authors.filter(a => !a.is_system)
      const namedAuthors = realAuthors.filter(a => !a.is_anonymous)
      const anonymousCount = realAuthors.filter(a => a.is_anonymous).length

      // 聚合字段
      const members = namedAuthors.map(a => a.nickname)
      const instruments = [...new Set(authors.map(a => a.instrument_category).filter(Boolean))]

      const nature = row.copyright_type === '原创' ? 'original' : row.copyright_type === '翻唱' ? 'cover' : 'remix'

      // 文件路径 → URL
      const mp3Url = row.mp3_path ? row.mp3_path.replace('/var/jamony/works', '/works') : ''
      const coverUrl = row.cover_image_path ? row.cover_image_path.replace('/var/jamony/works', '/works') : ''

      const gradient = row.cover_gradient || 'linear-gradient(135deg, #00AAFF, #9933FF)'

      // author 显示名
      let author = ''
      if (namedAuthors.length === 0) {
        author = `${realAuthors.length}位匿名乐手`
      } else if (namedAuthors.length === 1 && realAuthors.length === 1) {
        author = namedAuthors[0].nickname
      } else {
        author = `${realAuthors.length}位乐手`
      }

      return {
        id: row.id,
        title: row.title,
        author,
        type: 'jam',
        nature,
        styles: row.style ? [row.style] : [],
        instruments,
        plays: row.plays || 0,
        likes: row.likes || 0,
        comments: row.comments || 0,
        duration: row.duration || '',
        gradient,
        date: row.created_at ? row.created_at.toISOString().slice(0, 10) : '',
        members,
        coverImage: coverUrl,
        // works 专有字段
        mp3Url,
        anonymousCount,
        style: row.style || '',
        copyrightType: row.copyright_type || '',
        coverGradient: gradient,
        hasDrumTrack: row.has_drum_track || false,
        authors,
        isLiked: row.is_liked || false,
      }
    })

    res.json({
      ok: true,
      works,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error('Works list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 单个作品详情 ==========
app.get('/api/works/:id', async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.query.userId ? parseInt(req.query.userId) : null
    const result = await pool.query(`
      SELECT w.*, (
        SELECT COALESCE(json_agg(row_to_json(wa_sub) ORDER BY wa_sub.id), '[]'::json)
        FROM (
          SELECT wa.id, wa.user_id, COALESCE(u.nickname, wa.nickname) AS nickname, wa.instrument_category, wa.is_anonymous, COALESCE(u.is_system, FALSE) AS is_system, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url
          FROM work_authors wa LEFT JOIN users u ON u.id = wa.user_id WHERE wa.work_id = w.id
        ) wa_sub
      ) AS authors,
      EXISTS(SELECT 1 FROM works_likes WHERE work_id = w.id AND user_id = $2) AS is_liked
      FROM works w
      WHERE w.id = $1 AND w.status = 'published'
    `, [id, currentUserId])

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '作品不存在' })
    }

    const row = result.rows[0]
    const authors = row.authors || []
    const realAuthors = authors.filter(a => !a.is_system)
    const namedAuthors = realAuthors.filter(a => !a.is_anonymous)
    const anonymousCount = realAuthors.filter(a => a.is_anonymous).length

    const members = namedAuthors.map(a => a.nickname)
    const instruments = [...new Set(authors.map(a => a.instrument_category).filter(Boolean))]

    const nature = row.copyright_type === '原创' ? 'original' : row.copyright_type === '翻唱' ? 'cover' : 'remix'
    const mp3Url = row.mp3_path ? row.mp3_path.replace('/var/jamony/works', '/works') : ''
    const coverUrl = row.cover_image_path ? row.cover_image_path.replace('/var/jamony/works', '/works') : ''
    const gradient = row.cover_gradient || 'linear-gradient(135deg, #00AAFF, #9933FF)'

    let author = ''
    if (namedAuthors.length === 0) {
      author = `${realAuthors.length}位匿名乐手`
    } else if (namedAuthors.length === 1 && realAuthors.length === 1) {
      author = namedAuthors[0].nickname
    } else {
      author = `${realAuthors.length}位乐手`
    }

    const work = {
      id: row.id,
      title: row.title,
      author,
      type: 'jam',
      nature,
      styles: row.style ? [row.style] : [],
      instruments,
      plays: row.plays || 0,
      likes: row.likes || 0,
      comments: row.comments || 0,
      duration: row.duration || '',
      gradient,
      date: row.created_at ? row.created_at.toISOString().slice(0, 10) : '',
      members,
      coverImage: coverUrl,
      mp3Url,
      anonymousCount,
      style: row.style || '',
      copyrightType: row.copyright_type || '',
      description: row.description || '',
      coverSong: row.cover_song || '',
      coverAuthor: row.cover_author || '',
      source: row.source || '',
      coverGradient: gradient,
      hasDrumTrack: row.has_drum_track || false,
      authors,
      isLiked: row.is_liked || false,
    }

    res.json({ ok: true, work })
  } catch (err) {
    console.error('Work detail error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 播放计数 ==========
app.post('/api/works/:id/play', async (req, res) => {
  try {
    const { id } = req.params
    // 1024 音频线: 审核中锁定试听(后端兜底; 前端角标已禁用播放)
    const w = await pool.query('SELECT audio_review FROM works WHERE id = $1', [id])
    if (w.rows[0] && w.rows[0].audio_review === 'pending') {
      return res.status(403).json({ ok: false, code: 'AUDIO_REVIEWING', msg: '该作品音频审核中，通常几分钟内完成' })
    }
    await pool.query('UPDATE works SET plays = COALESCE(plays, 0) + 1 WHERE id = $1', [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('Work play error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 点赞/取消点赞 ==========
app.post('/api/works/:id/like', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { action } = req.body
    const userId = req.userId

    if (!userId || !action) {
      return res.status(400).json({ ok: false, msg: '缺少 userId 或 action' })
    }

    if (action === 'like') {
      const inserted = await pool.query(
        'INSERT INTO works_likes (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1',
        [id, userId]
      )
      await pool.query('UPDATE works SET likes = (SELECT COUNT(*) FROM works_likes WHERE work_id = $1) WHERE id = $1', [id])
      if (inserted.rows.length > 0) {
        const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [userId])
        const authors = await pool.query('SELECT user_id FROM work_authors WHERE work_id=$1', [id])
        for (const a of authors.rows) {
          await createNotification({ recipientId: a.user_id, type: 'like', workId: parseInt(id), actorId: userId, actorNickname: u.rows[0]?.nickname })
        }
      }
    } else if (action === 'unlike') {
      await pool.query('DELETE FROM works_likes WHERE work_id = $1 AND user_id = $2', [id, userId])
      await pool.query('UPDATE works SET likes = (SELECT COUNT(*) FROM works_likes WHERE work_id = $1) WHERE id = $1', [id])
    } else {
      return res.status(400).json({ ok: false, msg: 'action 必须是 like 或 unlike' })
    }

    const result = await pool.query('SELECT likes FROM works WHERE id = $1', [id])
    res.json({ ok: true, likes: result.rows[0]?.likes || 0 })
  } catch (err) {
    console.error('Work like error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 作品评论 ==========
// 列表（一级评论 + 回复分组，时间倒序）
app.get('/api/works/:id/comments', async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.query.userId ? parseInt(req.query.userId) : null
    const topResult = await pool.query(`
      SELECT c.id, c.user_id, c.nickname, c.content, c.parent_id, c.reply_to_nickname, c.created_at,
        REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS likes,
        EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $2) AS is_liked
      FROM work_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.work_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
    `, [id, currentUserId])
    const replyResult = await pool.query(`
      SELECT c.id, c.user_id, c.nickname, c.content, c.parent_id, c.reply_to_nickname, c.created_at,
        REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id = c.id) AS likes,
        EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $2) AS is_liked
      FROM work_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.work_id = $1 AND c.parent_id IS NOT NULL
      ORDER BY c.created_at ASC
    `, [id, currentUserId])
    const repliesByParent = {}
    replyResult.rows.forEach(r => {
      ;(repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push(r)
    })
    const comments = topResult.rows.map(r => ({ ...r, replies: repliesByParent[r.id] || [] }))
    res.json({ ok: true, comments })
  } catch (err) {
    console.error('Comments list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 发表评论（parentId 有值=回复，NULL=一级；replyToNickname 回复某用户时的昵称）
app.post('/api/works/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { content, parentId, replyToNickname } = req.body
    const userId = req.userId
    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, msg: '缺少 userId 或 content' })
    }
    if (content.length > 200) {
      return res.status(400).json({ ok: false, msg: '评论不超过200字' })
    }
    const userRow = await pool.query('SELECT nickname, avatar_url FROM users WHERE id=$1', [userId])
    if (userRow.rows.length === 0) return res.status(400).json({ ok: false, msg: '用户不存在' })
    const nickname = userRow.rows[0].nickname
    const avatarUrl = userRow.rows[0].avatar_url
      ? userRow.rows[0].avatar_url.replace('/var/jamony/avatars', '/avatars')
      : ''
    if (!(await guardCanPublish(userId, res))) return
    if (!(await moderatePublishText('work_comment', id, userId, nickname, content.trim()))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    const newCommentIdWc = nextId()
    const ins = await pool.query(
      `INSERT INTO work_comments (id, work_id, user_id, nickname, content, parent_id, reply_to_nickname)
       VALUES ($7, $1, $2, $3, $4, $5, $6) RETURNING created_at`,
      [id, userId, nickname, content.trim(), parentId || null, replyToNickname || null, newCommentIdWc]
    )
    // 一级评论才 +1 works.comments（回复不计入主评论数）
    if (!parentId) {
      await pool.query('UPDATE works SET comments = COALESCE(comments, 0) + 1 WHERE id = $1', [id])
    }
    // 通知：一级评论→作品所有作者；回复→被回复者
    const newCommentId = newCommentIdWc
    if (!parentId) {
      const authors = await pool.query('SELECT user_id FROM work_authors WHERE work_id=$1', [id])
      for (const a of authors.rows) {
        await createNotification({ recipientId: a.user_id, type: 'work_comment', workId: parseInt(id), workCommentId: newCommentId, actorId: userId, actorNickname: nickname })
      }
    } else {
      const parent = await pool.query('SELECT user_id FROM work_comments WHERE id=$1', [parentId])
      if (parent.rows.length > 0) {
        await createNotification({ recipientId: parent.rows[0].user_id, type: 'work_comment_reply', workId: parseInt(id), workCommentId: newCommentId, actorId: userId, actorNickname: nickname })
      }
    }
    res.json({
      ok: true,
      comment: {
        id: ins.rows[0].id,
        user_id: userId,
        nickname,
        avatar_url: avatarUrl,
        content: content.trim(),
        parent_id: parentId || null,
        reply_to_nickname: replyToNickname || null,
        created_at: ins.rows[0].created_at,
        replies: [],
        likes: 0,
        is_liked: false,
      },
    })
  } catch (err) {
    console.error('Comment create error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 删除评论（仅作者删自己的；一级评论删除会 CASCADE 删回复，并 -1 works.comments）
app.delete('/api/works/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params
    const userId = req.userId
    const row = await pool.query('SELECT user_id, parent_id FROM work_comments WHERE id=$1 AND work_id=$2', [commentId, id])
    if (row.rows.length === 0) return res.status(404).json({ ok: false, msg: '评论不存在' })
    if (row.rows[0].user_id !== parseInt(userId)) return res.status(403).json({ ok: false, msg: '只能删除自己的评论' })
    const isTop = !row.rows[0].parent_id
    await pool.query('DELETE FROM work_comments WHERE id=$1', [commentId])
    if (isTop) {
      await pool.query('UPDATE works SET comments = GREATEST(COALESCE(comments, 0) - 1, 0) WHERE id = $1', [id])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Comment delete error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 评论点赞/取消点赞（一级评论与回复通用，按 comment_id）
app.post('/api/works/:id/comments/:commentId/like', requireAuth, async (req, res) => {
  try {
    const { commentId } = req.params
    const { action } = req.body
    const userId = req.userId
    if (!action) return res.status(400).json({ ok: false, msg: '缺少 action' })
    if (action === 'like') {
      await pool.query('INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, userId])
    } else if (action === 'unlike') {
      await pool.query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId])
    } else {
      return res.status(400).json({ ok: false, msg: 'action 必须是 like 或 unlike' })
    }
    const result = await pool.query('SELECT COUNT(*) AS likes FROM comment_likes WHERE comment_id = $1', [commentId])
    res.json({ ok: true, likes: parseInt(result.rows[0].likes) })
  } catch (err) {
    console.error('Comment like error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 举报评论（记录到 comment_reports，后台审核）
app.post('/api/works/:id/comments/:commentId/report', requireAuth, async (req, res) => {
  try {
    const { commentId } = req.params
    const { reason } = req.body
    const userId = req.userId
    await pool.query(
      'INSERT INTO comment_reports (comment_id, reporter_user_id, reason) VALUES ($1, $2, $3)',
      [commentId, userId, (reason || '').slice(0, 100)]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Comment report error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 公告牌 ==========
// GET /api/notices 列表（过滤过期 + JOIN 发布者；支持 type/category/city/style/search/sort/page/limit）
app.get('/api/notices', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20))
    const offset = (page - 1) * limit
    const sort = req.query.sort === 'hot' ? 'hot' : 'latest'
    const { type, category, city, style, search } = req.query

    const where = ["n.status='active'", 'n.expire_at > NOW()']
    const params = []
    const push = (v) => { params.push(v); return `$${params.length}` }
    if (type) where.push(`n.type = ${push(type)}`)
    if (category) where.push(`n.category = ${push(category)}`)
    if (city && city !== 'all') where.push(`n.city = ${push(city)}`)
    if (style && style !== 'all') where.push(`n.style = ${push(style)}`)
    if (search && String(search).trim()) where.push(`(LOWER(n.title) LIKE ${push('%' + String(search).trim().toLowerCase() + '%')} OR LOWER(n.nickname) LIKE ${push('%' + String(search).trim().toLowerCase() + '%')})`)

    const order = sort === 'hot'
      ? 'ORDER BY n.comments DESC, n.likes DESC, n.created_at DESC, n.id DESC'
      : 'ORDER BY n.created_at DESC, n.id DESC'

    const whereSql = where.join(' AND ')
    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM notices n WHERE ${whereSql}`, params)).rows[0].count)

    const listParams = [...params, req.userId, limit, offset]
    const result = await pool.query(
      `SELECT n.*, u.nickname AS author_name, u.id AS author_id,
              REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS author_avatar,
              EXISTS(SELECT 1 FROM favorites WHERE user_id=$${params.length + 1} AND subject_type='notice' AND subject_id=n.id) AS is_favorited
       FROM notices n JOIN users u ON u.id = n.user_id
       WHERE ${whereSql}
       ${order}
       LIMIT $${params.length + 2} OFFSET $${params.length + 3}`,
      listParams
    )
    res.json({ ok: true, notices: result.rows, total, page, totalPages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('Notices list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// POST /api/notices 发布（requireAuth；限频：线上每天1条/线下最多3条active；自动时效：线上24h/线下15天）
app.post('/api/notices', requireAuth, async (req, res) => {
  try {
    const { type, category, title, body, city, style, jam_time, level, needed_count, bg_index, image_url } = req.body
    if (!['offline', 'online'].includes(type)) return res.status(400).json({ ok: false, msg: '公告类型无效' })
    if (!title || !String(title).trim()) return res.status(400).json({ ok: false, msg: '请填写标题' })
    if (!body || !String(body).trim()) return res.status(400).json({ ok: false, msg: '请填写正文' })
    if (!(await guardCanPublish(req.userId, res))) return
    const noticeText = [String(title).trim(), String(body).trim(), city, style].filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (!(await moderatePublishText('notice', null, req.userId, req.nickname, noticeText))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }

    // 限频：线上 active 未过期 ≤1（每天1条）；线下 active 未过期 ≤3
    if (type === 'online') {
      const ex = await pool.query("SELECT id FROM notices WHERE user_id=$1 AND type='online' AND status='active' AND expire_at > NOW() LIMIT 1", [req.userId])
      if (ex.rows.length > 0) return res.status(400).json({ ok: false, msg: '你已有1条活跃线上公告，可以前去修改或删除后发布新的线上公告。或等待已发布的线上公告24小时后自动过期。' })
    } else {
      const cnt = await pool.query("SELECT COUNT(*) AS c FROM notices WHERE user_id=$1 AND type='offline' AND status='active' AND expire_at > NOW()", [req.userId])
      if (parseInt(cnt.rows[0].c) >= 3) return res.status(400).json({ ok: false, msg: '你已有3条活跃线下公告，可以前去修改或删除后发布新的线下公告。或等待已发布的线下公告15日后自动过期。' })
    }

    const bg = (Number.isInteger(bg_index) && bg_index >= 1 && bg_index <= 17) ? bg_index : Math.floor(Math.random() * 17) + 1
    // 自动时效：线上24h，线下15天
    const expireAt = new Date(Date.now() + (type === 'online' ? 24 : 15 * 24) * 3600000).toISOString()

    const result = await pool.query(
      `INSERT INTO notices (id, user_id, nickname, type, category, title, body, city, style, jam_time, level, needed_count, bg_index, image_url, expire_at)
       VALUES ($15,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [req.userId, req.nickname, type, category || null, String(title).trim(), String(body).trim(),
       (city || '').trim() || '其他', (style || '').trim() || '未分类', jam_time || null, level || null,
       needed_count || null, bg, image_url || null, expireAt, nextId()]
    )
    const notice = result.rows[0]
    notice.author_id = req.userId
    notice.author_name = req.nickname
    res.json({ ok: true, notice })
  } catch (err) {
    console.error('Create notice error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// GET /api/notices/:id 详情（仅未过期 active；浏览 +1）
app.get('/api/notices/:id', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return res.status(404).json({ ok: false, msg: '公告不存在' })
    const result = await pool.query(
      `SELECT n.*, u.nickname AS author_name, u.id AS author_id,
              REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS author_avatar,
              EXISTS(SELECT 1 FROM favorites WHERE user_id=$2 AND subject_type='notice' AND subject_id=n.id) AS is_favorited
       FROM notices n JOIN users u ON u.id = n.user_id
       WHERE n.id = $1 AND n.status='active' AND (n.expire_at > NOW() OR n.user_id = $2)`,
      [id, req.userId]
    )
    if (result.rows.length === 0) return res.status(404).json({ ok: false, msg: '公告不存在或已过期' })
    pool.query('UPDATE notices SET views = views + 1 WHERE id = $1', [id]).catch(() => {})
    res.json({ ok: true, notice: result.rows[0] })
  } catch (err) {
    console.error('Notice detail error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// GET /api/users/:id/notices 某用户发布的公告（自己看含过期，别人只看未过期 active）
app.get('/api/users/:id/notices', optionalAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return res.status(404).json({ ok: false, msg: '用户不存在' })
    const isSelf = req.userId === id
    const expireFilter = isSelf ? '' : 'AND n.expire_at > NOW()'
    const result = await pool.query(
      `SELECT n.*, u.nickname AS author_name, u.id AS author_id,
              REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS author_avatar,
              EXISTS(SELECT 1 FROM favorites WHERE user_id=$2 AND subject_type='notice' AND subject_id=n.id) AS is_favorited
       FROM notices n JOIN users u ON u.id = n.user_id
       WHERE n.user_id = $1 AND n.status = 'active' ${expireFilter}
       ORDER BY n.created_at DESC LIMIT 100`,
      [id, req.userId]
    )
    res.json({ ok: true, notices: result.rows })
  } catch (err) {
    console.error('User notices error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// PATCH /api/notices/:id 编辑（仅发布者；仅 active 未过期可改，过期不可改只能删）
app.patch('/api/notices/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return res.status(404).json({ ok: false, msg: '公告不存在' })
    const { title, body, city, style, category, jam_time, level, needed_count, image_url } = req.body
    const row = await pool.query("SELECT user_id, expire_at FROM notices WHERE id=$1 AND status='active'", [id])
    if (row.rows.length === 0) return res.status(404).json({ ok: false, msg: '公告不存在' })
    if (row.rows[0].user_id !== req.userId) return res.status(403).json({ ok: false, msg: '只能编辑自己的公告' })
    if (new Date(row.rows[0].expire_at).getTime() <= Date.now()) return res.status(400).json({ ok: false, msg: '已过期不可编辑，可删除' })

    const sets = [], params = []
    const add = (col, val) => { if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`) } }
    add('title', typeof title === 'string' && title.trim() ? title.trim() : undefined)
    add('body', typeof body === 'string' && body.trim() ? body.trim() : undefined)
    add('city', typeof city === 'string' ? (city.trim() || '其他') : undefined)
    add('style', typeof style === 'string' ? (style.trim() || '未分类') : undefined)
    add('category', category === undefined ? undefined : (category || null))
    add('jam_time', jam_time === undefined ? undefined : (jam_time || null))
    add('level', level === undefined ? undefined : (level || null))
    add('needed_count', needed_count === undefined ? undefined : (parseInt(needed_count) || null))
    add('image_url', image_url === undefined ? undefined : (image_url || null))
    if (sets.length === 0) return res.status(400).json({ ok: false, msg: '没有要更新的字段' })
    // 机审：编辑同样过闸（堵"发正常帖再编辑塞违规词"的口子），只审用户提交的文本字段
    if (!(await guardCanPublish(req.userId, res))) return
    const patchText = [title, body, city, style].filter(v => typeof v === 'string' && v.trim()).join('\n')
    if (patchText && !(await moderatePublishText('notice', id, req.userId, req.nickname, patchText))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }

    params.push(id)
    const result = await pool.query(`UPDATE notices SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`, params)
    const notice = result.rows[0]
    const u = await pool.query('SELECT nickname, avatar_url FROM users WHERE id=$1', [notice.user_id])
    notice.author_id = notice.user_id
    notice.author_name = u.rows[0]?.nickname || notice.nickname
    notice.author_avatar = u.rows[0]?.avatar_url ? u.rows[0].avatar_url.replace('/var/jamony/avatars', '/avatars') : null
    res.json({ ok: true, notice })
  } catch (err) {
    console.error('Notice update error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// DELETE /api/notices/:id 软删（仅发布者；status='deleted' 后列表/详情天然查不到）
app.delete('/api/notices/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return res.status(404).json({ ok: false, msg: '公告不存在' })
    const row = await pool.query("SELECT user_id FROM notices WHERE id=$1 AND status='active'", [id])
    if (row.rows.length === 0) return res.status(404).json({ ok: false, msg: '公告不存在' })
    if (row.rows[0].user_id !== req.userId) return res.status(403).json({ ok: false, msg: '只能删除自己的公告' })
    await pool.query("UPDATE notices SET status='deleted' WHERE id=$1", [id])
    res.json({ ok: true })
  } catch (err) {
    console.error('Notice delete error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 通知生成（写时聚合：同 recipient+type+entity+未读+1h内 → count+1 合并，否则新建；不通知自己）
// 例外(1023 七件套①⑤): restriction(处罚)/appeal_result(申诉回执)不聚合——每次都是独立事件且文案各异,
// 合并会保留旧文案吞掉新事件(watch→restricted 连续升级时解封日期文案曾因此丢失, 实测抓到)
const NO_AGGREGATE_TYPES = new Set(['restriction', 'appeal_result'])
async function createNotification({ recipientId, type, noticeId, commentId, workId, workCommentId, actorId, actorNickname, message }) {
  if (!recipientId || recipientId === actorId) return
  try {
    if (!NO_AGGREGATE_TYPES.has(type)) {
      const existing = await pool.query(
        "SELECT id FROM notifications WHERE recipient_user_id=$1 AND type=$2 AND notice_id IS NOT DISTINCT FROM $3 AND work_id IS NOT DISTINCT FROM $4 AND work_comment_id IS NOT DISTINCT FROM $5 AND read_at IS NULL AND updated_at > NOW() - INTERVAL '1 hour'",
        [recipientId, type, noticeId || null, workId || null, workCommentId || null]
      )
      if (existing.rows.length > 0) {
        await pool.query(
          "UPDATE notifications SET count = count + 1, actor_user_id = $1, actor_nickname = $2, comment_id = $3, work_comment_id = $4, updated_at = NOW() WHERE id = $5",
          [actorId, actorNickname, commentId || null, workCommentId || null, existing.rows[0].id]
        )
        return
      }
    }
    await pool.query(
      "INSERT INTO notifications (recipient_user_id, type, notice_id, comment_id, work_id, work_comment_id, actor_user_id, actor_nickname, message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [recipientId, type, noticeId || null, commentId || null, workId || null, workCommentId || null, actorId, actorNickname, message || null]
    )
  } catch (e) { console.error('createNotification error:', e) }
}

// ========== 公告牌评论（克隆 work_comments，work_id→notice_id）==========
// 列表（一级评论 + 回复分组，时间倒序）
app.get('/api/notices/:id/comments', async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.query.userId ? parseInt(req.query.userId) : null
    const topResult = await pool.query(`
      SELECT c.id, c.user_id, c.nickname, c.content, c.parent_id, c.reply_to_nickname, c.created_at,
        REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url,
        (SELECT COUNT(*) FROM notice_comment_likes WHERE comment_id = c.id) AS likes,
        EXISTS(SELECT 1 FROM notice_comment_likes WHERE comment_id = c.id AND user_id = $2) AS is_liked
      FROM notice_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.notice_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
    `, [id, currentUserId])
    const replyResult = await pool.query(`
      SELECT c.id, c.user_id, c.nickname, c.content, c.parent_id, c.reply_to_nickname, c.created_at,
        REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url,
        (SELECT COUNT(*) FROM notice_comment_likes WHERE comment_id = c.id) AS likes,
        EXISTS(SELECT 1 FROM notice_comment_likes WHERE comment_id = c.id AND user_id = $2) AS is_liked
      FROM notice_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.notice_id = $1 AND c.parent_id IS NOT NULL
      ORDER BY c.created_at ASC
    `, [id, currentUserId])
    const repliesByParent = {}
    replyResult.rows.forEach(r => {
      ;(repliesByParent[r.parent_id] = repliesByParent[r.parent_id] || []).push(r)
    })
    const comments = topResult.rows.map(r => ({ ...r, replies: repliesByParent[r.id] || [] }))
    res.json({ ok: true, comments })
  } catch (err) {
    console.error('Notice comments list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 发表评论（parentId 有值=回复，NULL=一级；replyToNickname 回复某用户时的昵称）
app.post('/api/notices/:id/comments', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { content, parentId, replyToNickname } = req.body
    const userId = req.userId
    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, msg: '缺少 content' })
    }
    if (content.length > 200) {
      return res.status(400).json({ ok: false, msg: '评论不超过200字' })
    }
    const userRow = await pool.query('SELECT nickname, avatar_url FROM users WHERE id=$1', [userId])
    if (userRow.rows.length === 0) return res.status(400).json({ ok: false, msg: '用户不存在' })
    const nickname = userRow.rows[0].nickname
    const avatarUrl = userRow.rows[0].avatar_url
      ? userRow.rows[0].avatar_url.replace('/var/jamony/avatars', '/avatars')
      : ''
    if (!(await guardCanPublish(userId, res))) return
    if (!(await moderatePublishText('notice_comment', id, userId, nickname, content.trim()))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    const newCommentIdNc = nextId()
    const ins = await pool.query(
      `INSERT INTO notice_comments (id, notice_id, user_id, nickname, content, parent_id, reply_to_nickname)
       VALUES ($7, $1, $2, $3, $4, $5, $6) RETURNING created_at`,
      [id, userId, nickname, content.trim(), parentId || null, replyToNickname || null, newCommentIdNc]
    )
    // 一级评论才 +1 notices.comments（回复不计入）
    if (!parentId) {
      await pool.query('UPDATE notices SET comments = COALESCE(comments, 0) + 1 WHERE id = $1', [id])
    }
    // 生成通知（一级评论→通知公告发布者；回复→通知被回复者；不通知自己，写时聚合）
    const newCommentId = newCommentIdNc
    if (parentId) {
      const pr = await pool.query('SELECT user_id FROM notice_comments WHERE id=$1', [parentId])
      if (pr.rows.length > 0) {
        await createNotification({ recipientId: pr.rows[0].user_id, type: 'comment_reply', noticeId: id, commentId: newCommentId, actorId: userId, actorNickname: nickname })
      }
    } else {
      const nr = await pool.query('SELECT user_id FROM notices WHERE id=$1', [id])
      if (nr.rows.length > 0) {
        await createNotification({ recipientId: nr.rows[0].user_id, type: 'comment_reply', noticeId: id, commentId: newCommentId, actorId: userId, actorNickname: nickname })
      }
    }
    res.json({
      ok: true,
      comment: {
        id: ins.rows[0].id,
        user_id: userId,
        nickname,
        avatar_url: avatarUrl,
        content: content.trim(),
        parent_id: parentId || null,
        reply_to_nickname: replyToNickname || null,
        created_at: ins.rows[0].created_at,
        replies: [],
        likes: 0,
        is_liked: false,
      },
    })
  } catch (err) {
    console.error('Notice comment create error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 删除评论（仅作者；一级评论删除 CASCADE 删回复，并 -1 notices.comments）
app.delete('/api/notices/:id/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const { id, commentId } = req.params
    const userId = req.userId
    const row = await pool.query('SELECT user_id, parent_id FROM notice_comments WHERE id=$1 AND notice_id=$2', [commentId, id])
    if (row.rows.length === 0) return res.status(404).json({ ok: false, msg: '评论不存在' })
    if (row.rows[0].user_id !== parseInt(userId)) return res.status(403).json({ ok: false, msg: '只能删除自己的评论' })
    const isTop = !row.rows[0].parent_id
    await pool.query('DELETE FROM notice_comments WHERE id=$1', [commentId])
    if (isTop) {
      await pool.query('UPDATE notices SET comments = GREATEST(COALESCE(comments, 0) - 1, 0) WHERE id = $1', [id])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Notice comment delete error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 评论点赞/取消点赞
app.post('/api/notices/:id/comments/:commentId/like', requireAuth, async (req, res) => {
  try {
    const { commentId } = req.params
    const { action } = req.body
    const userId = req.userId
    if (!action) return res.status(400).json({ ok: false, msg: '缺少 action' })
    if (action === 'like') {
      await pool.query('INSERT INTO notice_comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [commentId, userId])
    } else if (action === 'unlike') {
      await pool.query('DELETE FROM notice_comment_likes WHERE comment_id = $1 AND user_id = $2', [commentId, userId])
    } else {
      return res.status(400).json({ ok: false, msg: 'action 必须是 like 或 unlike' })
    }
    const result = await pool.query('SELECT COUNT(*) AS likes FROM notice_comment_likes WHERE comment_id = $1', [commentId])
    res.json({ ok: true, likes: parseInt(result.rows[0].likes) })
  } catch (err) {
    console.error('Notice comment like error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 举报评论
app.post('/api/notices/:id/comments/:commentId/report', requireAuth, async (req, res) => {
  try {
    const { commentId } = req.params
    const { reason } = req.body
    const userId = req.userId
    await pool.query(
      'INSERT INTO notice_comment_reports (comment_id, reporter_user_id, reason) VALUES ($1, $2, $3)',
      [commentId, userId, (reason || '').slice(0, 100)]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Notice comment report error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 举报公告（违规内容举报，后台审核）
app.post('/api/notices/:id/report', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const userId = req.userId
    await pool.query(
      'INSERT INTO notice_reports (notice_id, reporter_user_id, reason) VALUES ($1, $2, $3)',
      [id, userId, (reason || '').slice(0, 100)]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Notice report error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 举报作品(1024 举报系统: 作品本体此前零举报通道——评论能举报而作品不能)
app.post('/api/works/:id/report', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    await pool.query(
      'INSERT INTO work_reports (work_id, reporter_user_id, reason) VALUES ($1, $2, $3)',
      [id, req.userId, (reason || '').slice(0, 100)]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Work report error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 收藏公告
app.post('/api/notices/:id/favorite', requireAuth, async (req, res) => {
  try {
    await pool.query("INSERT INTO favorites (user_id, subject_type, subject_id) VALUES ($1,'notice',$2) ON CONFLICT DO NOTHING", [req.userId, req.params.id])
    res.json({ ok: true })
  } catch (err) { console.error('Favorite error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})
// 取消收藏
app.delete('/api/notices/:id/favorite', requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM favorites WHERE user_id=$1 AND subject_type='notice' AND subject_id=$2", [req.userId, req.params.id])
    res.json({ ok: true })
  } catch (err) { console.error('Unfavorite error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})
// 用户收藏列表（私密：仅自己可查；返回公告+作品）
app.get('/api/users/:id/favorites', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id)
    if (!id) return res.status(404).json({ ok: false, msg: '用户不存在' })
    if (req.userId !== id) return res.status(403).json({ ok: false, msg: '收藏仅自己可见' })
    // 收藏的公告
    const noticeResult = await pool.query(
      `SELECT n.*, u.nickname AS author_name, u.id AS author_id,
              REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS author_avatar,
              EXISTS(SELECT 1 FROM favorites WHERE user_id=$2 AND subject_type='notice' AND subject_id=n.id) AS is_favorited
       FROM favorites f
       JOIN notices n ON n.id = f.subject_id AND f.subject_type='notice'
       JOIN users u ON u.id = n.user_id
       WHERE f.user_id=$1 AND n.status='active'
       ORDER BY f.created_at DESC LIMIT 100`,
      [id, req.userId]
    )
    // 收藏的作品 = 点过赞的作品（点赞即收藏，Spotify 式）
    const workResult = await pool.query(
      `SELECT w.*, wa.author_id, wa.author_anonymous, wa.author_name, wa.author_avatar_url
       FROM works_likes wl
       JOIN works w ON w.id = wl.work_id
       LEFT JOIN LATERAL (
         SELECT wa.user_id AS author_id, wa.is_anonymous AS author_anonymous,
                u.nickname AS author_name, u.avatar_url AS author_avatar_url
         FROM work_authors wa JOIN users u ON u.id = wa.user_id
         WHERE wa.work_id = w.id ORDER BY wa.is_anonymous ASC LIMIT 1
       ) wa ON true
       WHERE wl.user_id=$1 AND w.status='published'
       ORDER BY wl.created_at DESC LIMIT 100`,
      [id]
    )
    res.json({ ok: true, notices: noticeResult.rows, works: workResult.rows })
  } catch (err) { console.error('User favorites error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 收藏作品 = 点赞（点赞即收藏，无独立收藏 API；收藏列表查 works_likes）

// ========== 通知 ==========
// 列表（JOIN notices 拿标题，未读在前）+ 未读数
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, notice.title AS notice_title, nc.content AS comment_content,
              w.title AS work_title, wc.content AS work_comment_content,
              au.avatar_index AS actor_avatar_index,
              REPLACE(au.avatar_url, '/var/jamony/avatars', '/avatars') AS actor_avatar_url
       FROM notifications n
       LEFT JOIN notices notice ON notice.id = n.notice_id
       LEFT JOIN notice_comments nc ON nc.id = n.comment_id
       LEFT JOIN works w ON w.id = n.work_id
       LEFT JOIN work_comments wc ON wc.id = n.work_comment_id
       LEFT JOIN users au ON au.id = n.actor_user_id
       WHERE n.recipient_user_id = $1
       ORDER BY n.read_at IS NULL DESC, n.updated_at DESC
       LIMIT 50`,
      [req.userId]
    )
    const unread = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL', [req.userId])
    res.json({ ok: true, notifications: result.rows, unreadCount: parseInt(unread.rows[0].c) })
  } catch (err) {
    console.error('Notifications list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 未读数（红点轮询用，轻量）
app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE recipient_user_id=$1 AND read_at IS NULL', [req.userId])
    res.json({ ok: true, count: parseInt(r.rows[0].c) })
  } catch (err) {
    console.error('Unread count error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 标记单条已读
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE id=$1 AND recipient_user_id=$2 AND read_at IS NULL', [req.params.id, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('Mark read error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 全部已读（可按 type，一键全读当前 tab）
app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const { type, types } = req.body || {}
    const typeList = types || (type ? [type] : null)
    if (typeList && typeList.length > 0) {
      await pool.query('UPDATE notifications SET read_at = NOW() WHERE recipient_user_id=$1 AND read_at IS NULL AND type = ANY($2)', [req.userId, typeList])
    } else {
      await pool.query('UPDATE notifications SET read_at = NOW() WHERE recipient_user_id=$1 AND read_at IS NULL', [req.userId])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Read all error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 删除单条
app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id=$1 AND recipient_user_id=$2', [req.params.id, req.userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('Delete notification error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 私信（二人会话，未读合并进信封红点 type=message）==========
// 创建/获取二人会话（user_a=LEAST, user_b=GREATEST 保证唯一）
app.post('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    const targetUserId = parseInt(req.body.targetUserId)
    if (!targetUserId || targetUserId === req.userId) {
      return res.status(400).json({ ok: false, msg: '无效的私信对象' })
    }
    const a = Math.min(req.userId, targetUserId)
    const b = Math.max(req.userId, targetUserId)
    const r = await pool.query(
      `INSERT INTO conversations (id, user_a_id, user_b_id) VALUES ($3, $1, $2)
       ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET user_a_id = EXCLUDED.user_a_id
       RETURNING id`,
      [a, b, nextId()]
    )
    res.json({ ok: true, conversationId: r.rows[0].id })
  } catch (err) { console.error('Create conversation error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 会话列表（对方信息 + 最后消息 + 未读数）
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.last_message_at,
              CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS other_id,
              u.nickname AS other_nickname,
              REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS other_avatar,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id <> $1 AND read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN users u ON u.id = (CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END)
       WHERE c.user_a_id = $1 OR c.user_b_id = $1
       ORDER BY c.last_message_at DESC NULLS LAST`,
      [req.userId]
    )
    res.json({ ok: true, conversations: result.rows })
  } catch (err) { console.error('Conversations list error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 消息历史（分页，before cursor）
app.get('/api/messages/conversations/:id', requireAuth, async (req, res) => {
  try {
    const cid = parseInt(req.params.id)
    const c = await pool.query('SELECT * FROM conversations WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)', [cid, req.userId])
    if (c.rows.length === 0) return res.status(403).json({ ok: false, msg: '无权访问' })
    const before = req.query.before ? parseInt(req.query.before) : null
    const params = [cid]
    let cursor = ''
    if (before) { params.push(before); cursor = ' AND m.id < $2' }
    const result = await pool.query(
      `SELECT m.*, u.nickname AS sender_nickname FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1${cursor} ORDER BY m.created_at DESC LIMIT 30`,
      params
    )
    res.json({ ok: true, messages: result.rows })
  } catch (err) { console.error('Messages history error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 发消息 + 通知对方（type=message，合并信封红点）
app.post('/api/messages/conversations/:id', requireAuth, async (req, res) => {
  try {
    const cid = parseInt(req.params.id)
    const { content } = req.body
    if (!content || !content.trim()) return res.status(400).json({ ok: false, msg: '内容不能为空' })
    const c = await pool.query('SELECT * FROM conversations WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)', [cid, req.userId])
    if (c.rows.length === 0) return res.status(403).json({ ok: false, msg: '无权访问' })
    const otherId = c.rows[0].user_a_id === req.userId ? c.rows[0].user_b_id : c.rows[0].user_a_id
    // 1024 收尾: 私信事前审(欢哥定稿: 私信更不能是法外之地, 违规骚扰重灾区)——
    // 拒级发不出发件人收提示, 疑似放行+interact渠道计数(channel=message 预留转正)
    if (!(await moderatePublishText('message', null, req.userId, req.nickname, content.trim().slice(0, 1000)))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    const newMsgId = nextId()
    const ins = await pool.query(
      'INSERT INTO messages (id, conversation_id, sender_id, content) VALUES ($4, $1, $2, $3) RETURNING created_at',
      [cid, req.userId, content.trim().slice(0, 1000), newMsgId]
    )
    ins.rows[0].id = newMsgId
    await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = $1', [cid])
    const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [req.userId])
    await createNotification({
      recipientId: otherId, type: 'message', actorId: req.userId, actorNickname: u.rows[0]?.nickname,
      message: content.trim().slice(0, 50)
    })
    res.json({ ok: true, message: ins.rows[0] })
  } catch (err) { console.error('Send message error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 标记会话已读 + 对应 message 通知已读
app.patch('/api/messages/conversations/:id/read', requireAuth, async (req, res) => {
  try {
    const cid = parseInt(req.params.id)
    const c = await pool.query('SELECT * FROM conversations WHERE id=$1 AND (user_a_id=$2 OR user_b_id=$2)', [cid, req.userId])
    if (c.rows.length === 0) return res.status(403).json({ ok: false, msg: '无权访问' })
    const otherId = c.rows[0].user_a_id === req.userId ? c.rows[0].user_b_id : c.rows[0].user_a_id
    await pool.query('UPDATE messages SET read_at = NOW() WHERE conversation_id=$1 AND sender_id <> $2 AND read_at IS NULL', [cid, req.userId])
    await pool.query("UPDATE notifications SET read_at = NOW() WHERE recipient_user_id=$1 AND type='message' AND actor_user_id=$2 AND read_at IS NULL", [req.userId, otherId])
    res.json({ ok: true })
  } catch (err) { console.error('Mark read error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// 一键已读所有私信会话（清 messages 表 + message 通知）
app.post('/api/messages/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE messages SET read_at = NOW() WHERE sender_id <> $1 AND read_at IS NULL AND conversation_id IN (SELECT id FROM conversations WHERE user_a_id=$1 OR user_b_id=$1)', [req.userId])
    await pool.query("UPDATE notifications SET read_at = NOW() WHERE recipient_user_id=$1 AND type='message' AND read_at IS NULL", [req.userId])
    res.json({ ok: true })
  } catch (err) { console.error('Messages read-all error:', err); res.status(500).json({ ok: false, msg: '服务器错误' }) }
})

// ========== 取消署名（不可恢复）==========
app.patch('/api/works/:id/anonymize', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId

    const result = await pool.query(
      'UPDATE work_authors SET is_anonymous = TRUE WHERE work_id = $1 AND user_id = $2 AND is_anonymous = FALSE RETURNING id',
      [id, userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '未找到该作者的记录或已是匿名' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Anonymize error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 读取房间所有 session（含超时懒处理）
app.get('/api/rooms/:code/sessions', async (req, res) => {
  try {
    const id = await getRoomIdByCode(req.params.code)
    if (!id) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const changed = await applyExpiry(id)
    if (changed) broadcastSessions(req.params.code)
    const sessions = await getRoomSessions(id)
    res.json({ ok: true, sessions })
  } catch (err) {
    console.error('Sessions list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 修改某条分轨的授权（①② 写死锁定，② 依赖 ①，③ 自由不锁）
app.patch('/api/rooms/:code/sessions/:sid/tracks/:tid', requireAuth, async (req, res) => {
  try {
    const { code, sid, tid } = req.params
    const { field, value } = req.body  // field: allow_use | allow_attribution | allow_download
    const userId = req.userId
    const tr = await pool.query('SELECT * FROM session_tracks WHERE id=$1 AND session_id=$2', [tid, sid])
    if (tr.rows.length === 0) return res.status(404).json({ ok: false, msg: '分轨不存在' })
    const t = tr.rows[0]
    if (t.is_system) return res.status(400).json({ ok: false, msg: '系统轨不可修改' })
    if (t.user_id !== parseInt(userId)) return res.status(403).json({ ok: false, msg: '只能修改自己的分轨' })

    if (field === 'allow_use') {
      if (t.use_locked) return res.status(400).json({ ok: false, msg: '已锁定，不可修改' })
      if (value === false) {
        // 拒绝使用 → 同时清空并锁定署名（轨不参与混音，署名无意义）
        await pool.query('UPDATE session_tracks SET allow_use=FALSE, use_locked=TRUE, allow_attribution=NULL, attribution_locked=TRUE WHERE id=$1', [tid])
      } else {
        await pool.query('UPDATE session_tracks SET allow_use=TRUE, use_locked=TRUE WHERE id=$1', [tid])
      }
    } else if (field === 'allow_attribution') {
      if (t.attribution_locked) return res.status(400).json({ ok: false, msg: '已锁定，不可修改' })
      if (t.allow_use !== true) return res.status(400).json({ ok: false, msg: '请先授权使用' })
      await pool.query('UPDATE session_tracks SET allow_attribution=$1, attribution_locked=TRUE WHERE id=$2', [!!value, tid])
    } else if (field === 'allow_download') {
      // ③ 自由修改，永不锁定
      await pool.query('UPDATE session_tracks SET allow_download=$1 WHERE id=$2', [!!value, tid])
    } else {
      return res.status(400).json({ ok: false, msg: '未知字段' })
    }
    await broadcastSessions(code)
    res.json({ ok: true })
  } catch (err) {
    console.error('Track auth error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})


// （1014 清理）曾有同路径双注册的"对外下载分轨"死代码（allow_download 语义，被上方 2219 requireAuth 版全拦、从未生效；
//  系"允许下载"授权开关的未接线雏形——将来做对外下载时从 git 历史取回并改 cookie 鉴权重写）

// ========== 鼓机控制 ==========
const DRUM_STYLES = ['basic', 'rock', 'funk', 'jazz', 'rnb', 'folk', 'metal', 'reggae', 'pop', 'punk', 'soul']
const DRUM_BASE_DIR = '/var/www/jamony/drum-loops'

/* ⭐ 1029 房间隔离宪法·鼓机原生引擎重构
   旧链 = execSync 直等 manage-jamsoul → start-drums.sh（sleep 2+3 盲等）——事件循环冻结实测 5.394s
   = 全站所有房间一起卡；且接线 2>/dev/null 吞错（3s 没等够=静默哑火）、头 3 秒鼓点播向
   system:playback = 首拍一直在丢（被盲睡掩盖）。
   新链 = 照搬 GP startGpPlayback 成熟模式：spawn fluidsynth（增益 0 静默起播）→ 100ms 轮询
   JACK 端口出现 → 接线（带重试验证）→ stdin 下 player_start+gain 真起播（首拍零白丢）。
   全程异步零冻结；等待窗=音色库加载物理时长（FluidR3_GM 1~2.5s，无法再省）。
   start-drums.sh / manage-jamsoul drums-* 退役为运维手工工具，API 不再经过。 */
const drumsEngines = new Map()    // port → { child, wired, spawnedAt, portAt, bpm }（隔离域=端口，与 JACK 命名同构）
const drumsInflight = new Set()   // 启动中防抖（gpInflight/programInflight 同款；原"串行"靠冻结意外获得，显式化）
const DRUM_SOUNDFONT = '/usr/share/sounds/sf2/FluidR3_GM.sf2'

async function killDrumsEngine(port) {
  const e = port != null ? drumsEngines.get(port) : null
  if (e) {
    drumsEngines.delete(port)
    if (e.child && e.child.exitCode == null) {
      try { e.child.kill('SIGTERM') } catch (err) {}
      // 等 exit（JACK 客户端名独占，重启须先释放）；300ms 兜底防挂
      await new Promise(r => { const t = setTimeout(r, 300); e.child.once('exit', () => { clearTimeout(t); r() }) })
    }
  }
  // 野生残留（旧脚本时代的/崩溃重启后失联的）按名清扫；5 位端口等长无子串误杀（1026 判例）
  if (port != null) {
    try { await execFileAsync('pkill', ['-f', `fluidsynth.*FluidSynth-Drums-${port}`]) } catch (err) {}
    try { fs.unlinkSync(`/tmp/jamony-drums-${port}.pid`) } catch (err) {}
    try { fs.unlinkSync(`/tmp/jamony-drum-cmd-${port}.txt`) } catch (err) {}
  }
}

// 选谱：指定文件优先（须在白名单目录内防穿越），否则该风格随机一首（原 shell 脚本逻辑内迁）
async function pickDrumMidi(style, file) {
  const dir = path.join(DRUM_BASE_DIR, style)
  let names
  try { names = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.mid')).sort() } catch (e) { return null }
  if (!names.length) return null
  if (file) { const hit = names.find(n => n === file); if (hit) return path.join(dir, hit) }
  return path.join(dir, names[Math.floor(Math.random() * names.length)])
}

async function startDrumsPlayback(port, midiFile, bpm) {
  await killDrumsEngine(port)  // 同房旧鼓机先死透（JACK 客户端名独占）
  const drumName = `FluidSynth-Drums-${port}`  // JACK 命名契约（reference-jack-naming-formula 同族）
  const ghostL = `jamsoul-${port} jamony-looper:input left`
  const ghostR = `jamsoul-${port} jamony-looper:input right`
  const child = spawn('fluidsynth', [
    '-a', 'jack', '-j', '-n',   // 参数组合照抄 GP（无 -i：stdin 是命令通道，-i 会关掉它=永远静音）
    '-p', drumName,
    '-o', `audio.jack.id=${drumName}`,
    '-o', 'synth.sample-rate=48000',
    '-g', '0.0',                      // B' 方案（GP 同款）：静默起播，接线完成后才真出声——首拍零白丢
    '-o', 'synth.polyphony=64',
    DRUM_SOUNDFONT, midiFile,
  ], { stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.on('error', () => {})  // EPIPE 静默（进程退出后写，GP 同款教训）
  const engine = { child, wired: false, spawnedAt: Date.now(), portAt: null, bpm }
  drumsEngines.set(port, engine)
  try { fs.writeFileSync(`/tmp/jamony-drums-${port}.pid`, String(child.pid)) } catch (e) {}  // 运维可见性（status 兜底也读它）
  child.on('exit', () => { const e = drumsEngines.get(port); if (e && e.child === child) drumsEngines.delete(port) })
  // 循环+tempo 先武装（增益 0 下静默干跑；接线后 player_start 单发即"从头"——GP 判例：不能带 player_stop）
  child.stdin.write(`player_loop -1\nplayer_tempo_bpm ${Math.round(bpm)}\n`)
  // 端口轮询（GP 同款 100ms×50）：等待窗=音色库加载物理时长
  let visible = false
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 100))
    const e = drumsEngines.get(port)
    if (!e || e.child !== child) throw new Error('鼓机引擎已被替换')
    try { const { stdout } = await execFileAsync('jack_lsp'); if (stdout.includes(drumName + ':')) { visible = true; break } } catch (err) {}
  }
  if (!visible) { await killDrumsEngine(port); throw new Error('JACK 端口未出现（音色库加载失败？）') }
  engine.portAt = Date.now()
  // 接线：带重试验证（旧脚本吞错静默哑火，废除）；先断 system 直连防串到服务器声卡；左右双声道须全通（防单声道鼓）
  let wired = false
  for (let t = 0; t < 5 && !wired; t++) {
    try { await execFileAsync('jack_disconnect', [`${drumName}:left`, 'system:playback_1']) } catch (err) {}
    try { await execFileAsync('jack_disconnect', [`${drumName}:right`, 'system:playback_2']) } catch (err) {}
    let okL = false, okR = false
    try { await execFileAsync('jack_connect', [`${drumName}:left`, ghostL]); okL = true } catch (err) {}
    try { await execFileAsync('jack_connect', [`${drumName}:right`, ghostR]); okR = true } catch (err) {}
    wired = okL && okR
    if (!wired) await new Promise(r => setTimeout(r, 200))
  }
  const e2 = drumsEngines.get(port)
  if (!wired || !e2 || e2.child !== child) { await killDrumsEngine(port); throw new Error('JACK 接线失败') }
  e2.wired = true
  e2.wiredAt = Date.now()
  // B' 真起播：单发 player_start（从头）+ 增益（GP 判例：player_stop 后 start 会进静音坏状态，禁用）
  child.stdin.write('player_start\ngain 3.0\n')
  return e2
}

// 鼓机风格/节奏型列表（魔盒下拉数据源）；find 异步化（原同步 find=打开魔盒全站抖）
app.get('/api/drums/styles', async (req, res) => {
  const styles = {}
  for (const style of DRUM_STYLES) {
    try {
      const { stdout } = await execFileAsync('find', [`${DRUM_BASE_DIR}/${style}`, '-name', '*.mid'], { encoding: 'utf8' })
      const list = String(stdout).trim()
      styles[style] = list ? list.split('\n').map(f => f.replace(`${DRUM_BASE_DIR}/${style}/`, '')).sort() : []
    } catch { styles[style] = [] }
  }
  res.json({ ok: true, styles })
})

app.post('/api/rooms/:code/drums/start', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, code))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可操作鼓机' })
    }
    if (drumsInflight.has(code)) return res.status(409).json({ ok: false, msg: '鼓机正在启动中，请稍候' })
    const { style, bpm, file } = req.body
    const validStyle = DRUM_STYLES.includes(style) ? style : 'rock'
    const validBpm = Math.min(200, Math.max(40, parseInt(bpm) || 120))
    const midiFile = await pickDrumMidi(validStyle, file || '')
    if (!midiFile) return res.status(404).json({ ok: false, msg: '该风格暂无鼓谱文件，请先上传' })
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [roomId])
    const roomPort = portRow.rows[0]?.server_port
    if (!roomPort) return res.status(404).json({ ok: false, msg: '房间不存在' })
    drumsInflight.add(code)
    try {
      const t0 = Date.now()
      await startDrumsPlayback(roomPort, midiFile, validBpm)
      console.log(`Drums start ${code} port ${roomPort} wired ${Date.now() - t0}ms（事件驱动；旧链 execSync 盲睡冻结全站 5.4s）`)
      await pool.query('UPDATE rooms SET current_bpm = $1, drums_used_this_recording = TRUE WHERE id = $2', [validBpm, roomId])
      io.to(code).emit('bpm-update', { bpm: validBpm })
      res.json({ ok: true, msg: '鼓机已启动', style: validStyle, bpm: validBpm })
    } finally { drumsInflight.delete(code) }
  } catch (err) {
    console.error('Drums start error:', err.message)
    res.status(500).json({ ok: false, msg: '鼓机启动失败' })
  }
})

app.get('/api/rooms/:code/drums/status', async (req, res) => {
  try {
    const roomId = await getRoomIdByCode(req.params.code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [roomId])
    const roomPort = portRow.rows[0]?.server_port
    // 优先查内存引擎表（微秒，客户端每 5s 轮询不再 spawn 子进程）；pid 文件仅兜底野生残留
    const e = roomPort != null ? drumsEngines.get(roomPort) : null
    if (e && e.child && e.child.exitCode == null && !e.child.killed) return res.json({ ok: true, running: true, pid: e.child.pid })
    try {
      const pidStr = (await fs.promises.readFile(`/tmp/jamony-drums-${roomPort}.pid`, 'utf8')).trim()
      if (pidStr) {
        const pid = parseInt(pidStr)
        try { process.kill(pid, 0); return res.json({ ok: true, running: true, pid }) } catch (err) {}
      }
    } catch (err) {}
    res.json({ ok: true, running: false })
  } catch (err) {
    res.json({ ok: true, running: false })
  }
})

app.post('/api/rooms/:code/drums/stop', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [roomId])
    if (portRow.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, code))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可操作鼓机' })
    }
    const roomPort = portRow.rows[0]?.server_port || roomId
    await killDrumsEngine(roomPort)
    await pool.query('UPDATE rooms SET current_bpm = 0 WHERE id = $1', [roomId])
    io.to(code).emit('bpm-update', { bpm: 0 })
    res.json({ ok: true, msg: '鼓机已停止' })
  } catch (err) {
    console.error('Drums stop error:', err)
    res.status(500).json({ ok: false, msg: '鼓机停止失败' })
  }
})

// ========== 每日主题（daily_themes 日程表，后台排期；一天一行 0 点自然换主题，查无/异常兜底） ==========
// 轻量 ping：测纯网络延迟（不查 DB），前端房间卡片延迟用它而非 /api/rooms（后者含 DB 查询会虚高）
app.get('/api/ping', (req, res) => { res.json({ ok: true }) })

app.get('/api/daily-theme', async (req, res) => {
  try {
    // 按北京 0 点换天，不依赖服务器时区设置
    const r = await pool.query("SELECT title, emoji FROM daily_themes WHERE date = (now() AT TIME ZONE 'Asia/Shanghai')::date")
    if (r.rows[0]) return res.json({ ok: true, theme: { title: r.rows[0].title, emoji: r.rows[0].emoji } })
  } catch (e) {
    console.error('daily-theme error:', e.message)
  }
  res.json({ ok: true, theme: { title: '自由即兴', emoji: '🎶' } })
})

// 官方动态（后台配置中心写 site_config；此处公开读，空/失败由前端兜底旧文案）
app.get('/api/official-update', async (req, res) => {
  try {
    const r = await pool.query(`SELECT value FROM site_config WHERE key = 'official_update'`)
    const v = r.rows[0]?.value
    if (!v || !v.content) {
      return res.json({ ok: true, content: '', signature: '' })
    }
    res.json({ ok: true, content: v.content, signature: v.signature || '——jamony' })
  } catch (e) {
    console.error('official-update error:', e.message)
    res.status(500).json({ ok: false })
  }
})

// 用户反馈（配置中心三单之二：公开提交，匿名可发；同 IP 60s 限 1 条；jamony_api 仅 INSERT 无读权限）
const feedbackRate = new Map() // ip → 上次提交时间戳
app.post('/api/feedback', optionalAuth, async (req, res) => {
  const content = String(req.body?.content ?? '').trim()
  const clientVersion = String(req.body?.client_version ?? '').slice(0, 20)
  if (content.length < 5) return res.status(400).json({ ok: false, msg: '写点具体内容吧（至少 5 个字）' })
  if (content.length > 1000) return res.status(400).json({ ok: false, msg: '内容过长（≤1000 字）' })
  const ip = req.ip || ''
  if (Date.now() - (feedbackRate.get(ip) || 0) < 60000) {
    return res.status(429).json({ ok: false, msg: '操作太频繁，请稍后再试' })
  }
  try {
    await pool.query(
      'INSERT INTO feedbacks (user_id, nickname, content, client_version, ip) VALUES ($1,$2,$3,$4,$5)',
      [req.userId ?? null, req.nickname ?? null, content, clientVersion, ip || null]
    )
    feedbackRate.set(ip, Date.now())
    if (feedbackRate.size > 5000) feedbackRate.clear() // 防 Map 膨胀（1003 OOM 教训）
    res.json({ ok: true })
  } catch (e) {
    console.error('feedback error:', e.message)
    res.status(500).json({ ok: false, msg: '提交失败，稍后再试' })
  }
})

// 校验用户是否某房间的合奏者（room_members.role === 'musician'），按 room_code 查
async function isRoomMusician(userId, roomCode) {
  const r = await pool.query("SELECT rm.role FROM room_members rm JOIN rooms r ON r.id=rm.room_id WHERE r.room_code=$1 AND rm.user_id=$2", [roomCode, userId])
  return r.rows.length > 0 && r.rows[0].role === 'musician'
}

const gpInflight = new Map()  // 走带切换 in-flight 防抖（防连点振荡）

/* ========== GP 走带（10-07 P2 步骤②重做版） ==========
   点播放=现场起全新 fluidsynth 从头播,JACK 重试接线(~1s),延迟~1.5s(欢哥接受);
   gain 1.0(触顶仅255采样,甜点);音质走 Opus HIGH 档(编码伪影已单变量实验定罪);
   教训:不预热(自动播放压不住)/不 stdin 指令(状态机自噬)/child.killed≠存活(exitCode 才是) */
const GP_SOUNDFONT = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
const gpEngines = new Map()  // roomCode → { child, port, wired }

function killGpEngine(roomCode) {
  const e = gpEngines.get(roomCode)
  if (e) {
    if (e.boundaryTimer) { clearTimeout(e.boundaryTimer); e.boundaryTimer = null }
    try { e.child.kill('SIGTERM') } catch (err) {}
    gpEngines.delete(roomCode)
  }
}

// opts（1012 ⑥-2c 原生循环 + 1013 全曲循环 seek 跳入）：{ loop, stateTemplate, expectedEndTick, seekTick, seekTickMs }
//   loop=spawn 即武装 player_loop -1（引擎在 B 无缝回头，服务器零 respawn 零每周期命令，只按周期广播 gp-state 锚指针）；
//   stateTemplate=周期广播的 gp-state 模板（startMs/speed/countInMs/endMs，startedAt 每遍现填）；
//   expectedEndTick=烤制周期（player_start 回显 end:N 的校验基准，偏差>2tick 报警）；
//   seekTick/seekTickMs=首遍跳入（全曲循环从指针进入）：文件为全谱+原生头尾循环，起播后增益0静默定位
//   （no-op seek 读位→相对位移跳到目标前1拍→开声），playAt=开声时刻-seekTickMs（tick0↔playAt 精确锚）
function startGpPlayback(roomCode, port, midPath, totalMs, opts) {
  killGpEngine(roomCode)
  const gpName = `FluidSynth-GP-${port}`
  // B' 方案（1011 ⑥-1"第一声嘀被吃"根治）：MIDI 随 spawn 载入自动播但初始增益 0（白丢窗口吃静音，无感）
  // → 端口出现即接线 → 接线完成后 stdin 命令链 player_stop+player_start（从头!）+gain 1.0 →
  // 第一声从接线完成后才真实出声，零白丢零常数；零点=命令下发时刻（比 portAt 更准）。
  // fluidsynth 2.3.4 shell 无加载 MIDI 命令（load=SoundFont），player_start 语义=from the beginning（干跑验证 pos:0）
  const child = spawn('fluidsynth', [
    '-a', 'jack', '-j', '-n', '-p', gpName,
    '-o', `audio.jack.id=${gpName}`,
    '-o', 'synth.sample-rate=48000',
    '-g', '0.0',
    '-o', 'synth.polyphony=128',
    GP_SOUNDFONT, midPath,
  ], { stdio: ['pipe', 'pipe', 'ignore'] })
  child.stdin.on('error', () => {})  // EPIPE 静默（进程退出后写，main.js 同款教训）
  // stdout 解析（1012 ⑥-2c）：player_start/seek 回显 "player current pos:N, end:E, bpm:B"——end=引擎真周期，
  // 校验烤制值（fluidsynth 的 end 取事件尾+拍位填充，实测有 quirky 案例，靠回显对账不靠猜）
  let gpOutBuf = ''
  child.stdout.on('data', (d) => {
    gpOutBuf += String(d)
    const lines = gpOutBuf.split('\n')
    gpOutBuf = lines.pop()
    for (const ln of lines) {
      const m = ln.match(/pos:\s*(\d+),\s*end:\s*(\d+)/)
      if (!m) continue
      const e0 = gpEngines.get(roomCode)
      if (e0 && e0.child === child) {
        e0.endTickEcho = Number(m[2])
        e0.posEcho = Number(m[1])  // 1013 全曲循环：no-op seek 查当前位（seek 链算相对位移用）
        e0.posEchoAt = Date.now()
        if (!e0.endLogged) {
          e0.endLogged = true
          if (e0.expectedEndTick != null && Math.abs(Number(m[2]) - e0.expectedEndTick) > 2) {
            console.error(`GP ${roomCode} 引擎end=${m[2]} ≠ 烤制end=${e0.expectedEndTick}（周期按烤制值走，留意循环长度偏差）`)
          }
        }
      }
    }
  })
  child.on('exit', () => {
    const e = gpEngines.get(roomCode)
    if (e && e.child === child) {
      if (e.boundaryTimer) { clearTimeout(e.boundaryTimer); e.boundaryTimer = null }
      gpEngines.delete(roomCode)
      // 到达边界被 kill（loop 已关=原自然结束路径：gpLoopRestart 清状态广播停）或引擎崩溃（loop 仍开=重烤 respawn 自愈，1012 起 respawn 也武装原生循环）
      gpLoopRestart(roomCode, e).catch(() => {})
    }
  })
  gpEngines.set(roomCode, {
    child, port, wired: false, spawnedAt: Date.now(),
    loop: !!(opts && opts.loop), nativeLoop: !!(opts && opts.loop),
    stateTemplate: (opts && opts.stateTemplate) || null,
    expectedEndTick: opts ? opts.expectedEndTick : undefined,
    cycleMs: Number(totalMs) || 0,
    seekTick: (opts && opts.seekTick) || 0, seekTickMs: (opts && opts.seekTickMs) || 0,
  })
  const ghostL = `jamsoul-${port} jamony-looper:input left`
  const ghostR = `jamsoul-${port} jamony-looper:input right`
  // ⚠️时间线零点三段账（1010晚欢哥耳朵实测定案）：spawn → [init:端口出现=起播] → [wire:接线=进网络]。
  // 音频内容从 init 起算（端口出声就开始播，wire 晚到只是头部白丢）——零点=init（portAt）。
  // 旧记 spawn=指针快1拍(472ms)；中间版记 wire=慢半拍多(~300ms)；portAt=物理真零点。
  // 顺带：端口出现立即连线（100ms 粒度轮询，白丢窗口从 400ms 粒度压到最小）
  let polls = 0
  const pollPort = async () => {   // 1029 异步化：轮询/接线里的 jack_lsp·jack_connect 原为 execSync=GP 启动窗内全站每 100ms 抖 10-30ms
    polls++
    const e = gpEngines.get(roomCode)
    if (!e || e.child !== child) return
    let visible = false
    try { const { stdout } = await execFileAsync('jack_lsp'); if (stdout.includes(gpName + ':')) visible = true } catch (err) {}
    if (!visible) {
      if (polls < 50) setTimeout(pollPort, 100)  // 5s 内等 init（音源加载+JACK 注册）
      else console.error(`GP start ${roomCode} JACK 端口未出现`)
      return
    }
    e.portAt = Date.now()  // 起播时刻=时间线零点
    let tries = 0
    const wire = async () => {
      tries++
      try { await execFileAsync('jack_disconnect', [`${gpName}:left`, 'system:playback_1']) } catch (err) {}
      try { await execFileAsync('jack_disconnect', [`${gpName}:right`, 'system:playback_2']) } catch (err) {}
      let ok = false
      try { await execFileAsync('jack_connect', [`${gpName}:left`, ghostL]); ok = true } catch (err) {}
      try { await execFileAsync('jack_connect', [`${gpName}:right`, ghostR]) } catch (err) {}
      const e2 = gpEngines.get(roomCode)
      if (ok && e2 && e2.child === child) {
        // B' 起播：先写命令链+记 playAt（零点=第一声真实起点），再置 wired（waitGpWired 返回时 playAt 必就绪）
        // ⚠️不能带 player_stop——stdin(user command file)上下文里 stop 后 start 进坏状态=静音(-91dB，ABCD四组
        // 对照+端口服刑定罪)；player_start 单发即"从头"（回显 pos:0 + 端口有声实测）
        // 1012 ⑥-2c：loop 时先武装 player_loop -1（引擎原生无缝循环，实测 stdin 可用、回跳自动切正在响的音=无卡音）
        // 1013 全曲循环 seek：start 后仍增益0 → no-op seek 读当前位 → 相对位移跳到目标（烤制时已留1拍余量防跳过落点音符）
        //   → 开声；playAt=开声时刻-seekTickMs（tick0↔playAt 精确锚，边界链与指针全程同锚）
        const armBoundary = () => {
          if (e2.cycleMs <= 0) { e2.boundaryTimer = setTimeout(() => { try { child.kill('SIGTERM') } catch (err) {} }, 500); return }
          e2.boundaryTimer = setTimeout(() => fire(1), Math.max(0, (e2.playAt || Date.now()) + e2.cycleMs + (e2.loop ? 0 : 500) - Date.now()))
        }
        const fire = (k) => {
          const e3 = gpEngines.get(roomCode)
          if (!e3 || e3.child !== child) return
          if (e3.loop && e3.nativeLoop && e3.cycleMs > 0) {
            const seam = new Date()
            const st = { playing: true, startedAt: seam.toISOString(), ...(e3.stateTemplate || {}) }
            pool.query('UPDATE rooms SET gp_state = $1 WHERE room_code = $2', [JSON.stringify(st), roomCode]).catch(() => {})
            io.to(roomCode).emit('gp-state', st)
            console.log(`GP loop seam ${roomCode} #${k} ${seam.toISOString().slice(11, 23)} end=${e3.endTickEcho ?? '?'}/${e3.expectedEndTick ?? '?'} 周期${e3.cycleMs}ms`)
            e3.boundaryTimer = setTimeout(() => fire(k + 1), Math.max(0, (e3.playAt || 0) + (k + 1) * e3.cycleMs - Date.now()))
          } else {
            try { child.kill('SIGTERM') } catch (err) {}
          }
        }
        try {
          if (e2.seekTick > 0) {
            e2.child.stdin.write((e2.loop ? 'player_loop -1\n' : '') + 'player_start\n')
            e2.playAt = Date.now()  // 兜底锚（seek 未完成即被查走时用；seekDone 后覆盖为精确锚）
            setTimeout(() => {
              const e3 = gpEngines.get(roomCode)
              if (!e3 || e3.child !== child) return
              try { e3.child.stdin.write('player_seek 0\n') } catch (err) { return }  // 查当前位（回显 pos:N）
              setTimeout(() => {
                const e4 = gpEngines.get(roomCode)
                if (!e4 || e4.child !== child) return
                const p0 = e4.posEcho || 0
                try { e4.child.stdin.write(`player_seek ${e4.seekTick - p0}\n`) } catch (err) { return }  // 相对位移跳入
                setTimeout(() => {
                  const e5 = gpEngines.get(roomCode)
                  if (!e5 || e5.child !== child || e5.seekDone) return
                  try { e5.child.stdin.write('gain 1.0\n') } catch (err) {}
                  e5.playAt = Date.now() - e5.seekTickMs  // 精确锚：tick0 ↔ playAt
                  e5.seekDone = true
                  if (e5.boundaryTimer) clearTimeout(e5.boundaryTimer)
                  armBoundary()  // 用精确锚重挂周期边界链
                  console.log(`GP seek ${roomCode} 跳入 ${e5.seekTick}tick(${e5.seekTickMs}ms) 前一拍就位`)
                }, 150)
              }, 150)
            }, 150)
          } else {
            e2.child.stdin.write((e2.loop ? 'player_loop -1\n' : '') + 'player_start\ngain 1.0\n')
            e2.playAt = Date.now()
          }
        } catch (err) { console.error(`GP start ${roomCode} 起播命令失败:`, err.message) }
        e2.wired = true
        e2.wiredAt = Date.now()
        // 周期边界链（1012 ⑥-2c，替代 naturalEndTimer 收摊）：绝对时刻 playAt+k×周期（零累计误差），边界上——
        //   loop 开（spawn 即武装）→ 引擎自己在 B 无缝回头，这里只广播 gp-state 重锚全员指针（指针回 A、强刷者拿到新鲜状态）；
        //   loop 关 → kill → exit 走 gpLoopRestart 原自然结束路径（清状态广播停；播放中关 loop=本遍播完即止，语义不变）；
        //   中途开的 loop（spawn 时没武装）→ kill → gpLoopRestart 重烤 respawn 成原生循环引擎（一次性换代尾巴，之后每遍无缝）；
        //   非 loop 播一遍 → B+500ms 宽限 kill（保留 1011 掐尾宽限语义）
        armBoundary()
        console.log(`GP start ${roomCode} wired+play (${tries} 次)${e2.loop ? ' loop=原生' : ''}${e2.seekTick > 0 ? ' seek=全曲跳入' : ''}`)
      }
      else if (tries < 15 && e2 && e2.child === child && !e2.wired) setTimeout(wire, 400)
      else if (!ok) console.error(`GP start ${roomCode} JACK 接线失败`)
    }
    wire()
  }
  setTimeout(pollPort, 100)
}

// ⑥-2a 循环重启（1011）→ 1012 ⑥-2c 角色收窄：引擎 exit 后到这里——loop 已关=原自然结束（清状态广播停）；
// loop 仍开=中途开的 loop 换代 或 崩溃自愈 → 重烤 respawn（respawn 即武装原生循环，之后每遍引擎无缝回头零 respawn）。
// startMs 归 0（全曲循环=回曲目头）；countInMs 沿用烤进文件的值（循环也数拍——排练场景数拍当间隔）
async function gpLoopRestart(roomCode, prev) {
  const r = await pool.query('SELECT server_port, current_score FROM rooms WHERE room_code = $1', [roomCode])
  const row = r.rows[0]
  let score = null
  try { score = row && row.current_score ? JSON.parse(row.current_score) : null } catch (e) {}
  if (!score || !score.loop || score.type !== 'gp' || !score.midUrl) {
    // 循环已关：走原自然结束（清状态+广播停）
    await pool.query('UPDATE rooms SET gp_state = NULL WHERE room_code = $1', [roomCode]).catch(() => {})
    io.to(roomCode).emit('gp-state', { playing: false })
    console.log(`GP natural end ${roomCode}`)
    return
  }
  // ⚠️1011欢哥实测定罪：不能重播 prev.liveMidPath——它是从起播点裁剪过的（从最后小节播→文件只剩
  // 一小节,循环每遍都只有尾段）。循环=按当前谱面状态**完整重播**：从原 GP 重新生成（startMs=0，
  // mix/speed/countin 按 score 现值重烤）
  const gpPath = path.join(scoresDir, roomCode, path.basename(score.files[0]))
  if (!fs.existsSync(gpPath)) {
    await pool.query('UPDATE rooms SET gp_state = NULL WHERE room_code = $1', [roomCode]).catch(() => {})
    io.to(roomCode).emit('gp-state', { playing: false })
    console.log(`GP natural end ${roomCode} (源文件没了)`)
    return
  }
  const dir = path.join(scoresDir, roomCode)
  try { for (const f of fs.readdirSync(dir)) if (f.startsWith('live_') && f.endsWith('.mid')) { try { fs.unlinkSync(path.join(dir, f)) } catch (e) {} } } catch (e) {}
  const midPath = path.join(dir, `live_${Date.now()}.mid`)
  // 选段循环（⑥-2b）：A 存在时起播=A、掐到 B；否则全曲
  const spd = sanitizeGpSpeed(score.speed)
  const startMs = score.range ? Math.round(score.range.a) : 0
  let gpGen
  try { gpGen = await gpToMidiAsync(gpPath, midPath, score.mix, startMs, spd, !!score.countin, score.range ? Math.round(score.range.b) : undefined) }
  catch (err) {
    console.error('gp loop remix error:', err.message)
    await pool.query('UPDATE rooms SET gp_state = NULL WHERE room_code = $1', [roomCode]).catch(() => {})
    io.to(roomCode).emit('gp-state', { playing: false })
    return
  }
  const playTotalMs = score.range ? Math.round((score.range.b - score.range.a) / spd) + Math.round(gpGen.countInMs || 0) : gpGen.totalMs
  startGpPlayback(roomCode, row.server_port, midPath, playTotalMs, {
    loop: !!score.loop,
    stateTemplate: { startMs, speed: spd, countInMs: Math.round(gpGen.countInMs || 0), endMs: score.range ? Math.round(score.range.b) : undefined },
    expectedEndTick: gpGen.endTick,
  })
  const engine = gpEngines.get(roomCode)
  if (engine) { engine.liveMidPath = midPath; engine.totalMs = playTotalMs; engine.countInMs = gpGen.countInMs }
  const wired = await waitGpWired(roomCode, 8000)
  if (!wired) { console.error(`GP loop restart ${roomCode}: not wired`); return }
  const e2 = gpEngines.get(roomCode)
  const t0 = e2 && e2.playAt ? e2.playAt : Date.now()
  const gpState = { playing: true, startedAt: new Date(t0).toISOString(), startMs, speed: spd, countInMs: Math.round(gpGen.countInMs || 0), endMs: score.range ? Math.round(score.range.b) : undefined }
  try { await pool.query('UPDATE rooms SET gp_state = $1 WHERE room_code = $2', [JSON.stringify(gpState), roomCode]) } catch (e) {}
  io.to(roomCode).emit('gp-state', gpState)
  console.log(`GP loop restart ${roomCode} ${score.range ? `选段${score.range.a}-${score.range.b}ms` : "完整重播"} (countIn=${Math.round(gpGen.countInMs || 0)}ms speed=${spd})`)
}

async function waitGpWired(roomCode, maxMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 250))
    const e = gpEngines.get(roomCode)
    if (e && e.wired) return true
  }
  const e = gpEngines.get(roomCode)
  return !!(e && e.wired)
}

async function stopGpByCode(roomCode, broadcast) {
  try {
    const r = await pool.query('SELECT server_port FROM rooms WHERE room_code = $1', [roomCode])
    const port = r.rows[0]?.server_port
    killGpEngine(roomCode)
    if (port) { try { await execFileAsync('pkill', ['-f', `fluidsynth.*FluidSynth-GP-${port}`]) } catch (e) { /* 无进程正常 */ } }  // 1029 异步化
    await pool.query('UPDATE rooms SET gp_state = NULL WHERE room_code = $1', [roomCode])
    if (broadcast) io.to(roomCode).emit("gp-state", { playing: false })
  } catch (e) { console.error('stopGp error:', e.message) }
}

/* ========== program 背景轨渲染走带（1015 开工，1014 方案定稿 + 1015 干跑实测定版） ==========
   渲染链：ffmpeg（每轨 volume 快照 + amix normalize=0 + 48k s16le stereo）→ pipe →
   jack-stdin -n jamony-program-<port>（自动连接幽灵乐手 jamsoul-<port> jamony-looper:input）→ 房间混音。
   前端本地不出声（防双声打架），走带=socket 遥控，时间线对照 GP 三段账：零点=portAt（JACK 端口出现时刻）。
   教训沿用：分别 spawn ffmpeg/jack-stdin 两进程（不 sh -c 管道，防 kill 孤儿 0728 教训）；
   ffmpeg 先死→jstdin stdin EOF 自退；jstdin 先死→ffmpeg EPIPE 自退，天然互清。
   mix 播放中改=kill 重 spawn 带 -ss 续播（接缝~1s，GP 重烤 respawn 同款接受） */
const programInflight = new Map()  // 走带 in-flight 防抖（防连点振荡，GP 同款）
const programEngines = new Map()   // roomCode → { ffmpeg, jstdin, port, prog, spawnedAt, portAt, totalMs, startMs }

function killProgramEngine(roomCode) {
  const e = programEngines.get(roomCode)
  if (!e) return
  programEngines.delete(roomCode)  // 先删再杀：exit handler 见 map 无此引擎=被 kill，不触发自然结束链
  for (const c of [e.jstdin, e.ffmpeg]) { try { c.kill('SIGTERM') } catch (err) {} }
  // killProgramEngine 保持同步签名（同步调用方多）——子进程杀句柄本就不阻塞，兜底 pkill 改 fire-and-forget 异步（1029）
  if (e.port) { try { execFileAsync('pkill', ['-f', `jamony-program-${e.port}`]).catch(() => {}) } catch (err) { /* 无进程正常 */ } }
}

async function stopProgramByCode(roomCode, broadcast) {
  try {
    killProgramEngine(roomCode)
    await pool.query('UPDATE rooms SET program_state = NULL WHERE room_code = $1', [roomCode])
    if (broadcast) io.to(roomCode).emit('program-state', { playing: false })
  } catch (e) { console.error('stopProgram error:', e.message) }
}

// ffprobe 轨时长（秒，float）；读文件头快；失败返 null 由调用方跳过该轨（1029 异步化，数组参数零注入）
async function progProbeDurationSec(fpath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', fpath], { timeout: 5000 })
    const d = parseFloat(String(stdout).trim())
    return Number.isFinite(d) && d > 0 ? d : null
  } catch (e) { return null }
}

// 起播：混音快照烤进 ffmpeg 命令（volume 0-100→0-1，mute=0；normalize=0 不自动衰减）
function startProgramPlayback(roomCode, port, prog, startMs, totalMs) {
  killProgramEngine(roomCode)
  const progName = `jamony-program-${port}`  // JACK 命名契约（reference-jack-naming-formula 新成员）
  const ghostL = `jamsoul-${port} jamony-looper:input left`
  const ghostR = `jamsoul-${port} jamony-looper:input right`
  const parts = ['ffmpeg', '-v', 'error', '-nostdin']
  if (startMs > 0) parts.push('-ss', (startMs / 1000).toFixed(3))
  for (const t of prog.tracks) parts.push('-i', path.join(programsDir, roomCode, t.file))
  // 每轨链（1016 四功能，对齐录音混音器 DAW 语义）：
  //   effectiveGain=有 solo 只放 solo 轨、否则看 mute（useMixerEngine 同款规则）；
  //   pan=linear balance（pan=0 完全直通无衰减无串音；p>0 衰左/p<0 衰右；mono 先立体声化）；
  //   master=amix 后总 gain（0-200/100，同推子口径）
  const hasSolo = prog.mix.solos.length > 0
  const fc = prog.tracks.map((t, i) => {
    const soloed = prog.mix.solos.includes(t.id)
    const muted = prog.mix.mutes.includes(t.id)
    const audible = hasSolo ? soloed : !muted
    const vol = audible ? (Number(prog.mix.vols[t.id]) || 0) / 100 : 0
    const p = Number.isFinite(prog.mix.pans[t.id]) ? prog.mix.pans[t.id] : 0
    const lc = 1 - Math.max(0, p)
    const rc = 1 - Math.max(0, -p)
    const panPart = Math.abs(p) < 0.001
      ? '' : `,pan=stereo|c0<${lc.toFixed(3)}*c0|c1<${rc.toFixed(3)}*c1`  // ⚠️pan 滤镜系数必须在通道名前（0.7*c0 合法、c0*0.7 语法错——1016 干跑定罪）
    return `[${i}:a]aformat=channel_layouts=stereo,volume=${vol.toFixed(3)}${panPart}[a${i}]`
  })
  const mGain = (Number(prog.mix.master) || 100) / 100
  const masterPart = Math.abs(mGain - 1) < 0.001 ? '' : `,volume=${mGain.toFixed(3)}`
  fc.push(`${prog.tracks.map((_, i) => `[a${i}]`).join('')}amix=inputs=${prog.tracks.length}:duration=longest:normalize=0${masterPart},` +
    `aformat=sample_fmts=fltp,aresample=48000:first_pts=0,aformat=sample_fmts=s16:channel_layouts=stereo[out]`)
  parts.push('-filter_complex', fc.join(';'), '-map', '[out]', '-f', 's16le', '-c:a', 'pcm_s16le', '-')
  const ffmpeg = spawn(parts[0], parts.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
  let errTail = ''
  ffmpeg.stderr.on('data', d => { if (errTail.length < 500) errTail += String(d) })
  ffmpeg.on('exit', (code) => {
    const e = programEngines.get(roomCode)
    if (e && e.ffmpeg === ffmpeg && code !== 0 && code !== null) {
      console.error(`Program ffmpeg ${roomCode} exit=${code}: ${errTail.trim().slice(-200)}`)
    }
  })
  const jstdin = spawn('jack-stdin', ['-q', '-n', progName, '-b', '16', ghostL, ghostR], { stdio: ['pipe', 'ignore', 'ignore'] })
  ffmpeg.stdout.pipe(jstdin.stdin)
  jstdin.stdin.on('error', () => {})  // EPIPE 静默（对端先退，main.js 同款教训）
  const engine = { ffmpeg, jstdin, port, prog, spawnedAt: Date.now(), portAt: null, totalMs, startMs }
  programEngines.set(roomCode, engine)
  // 端口轮询（GP 同款 100ms×50）：见端口=记 portAt（时间线零点）；5s 未现=起播失败清理
  let polls = 0
  const pollPort = async () => {   // 1029 异步化：jack_lsp 轮询原为 execSync=启动窗内全站抖，房间隔离宪法清零
    polls++
    const e = programEngines.get(roomCode)
    if (!e || e.jstdin !== jstdin) return
    let visible = false
    try { const { stdout } = await execFileAsync('jack_lsp'); if (stdout.includes(progName + ':')) visible = true } catch (err) {}
    if (visible) { e.portAt = Date.now(); return }
    if (polls < 50) setTimeout(pollPort, 100)
    else {
      console.error(`Program start ${roomCode} JACK 端口未出现（ghost 未起或 jack-stdin 退出）`)
      stopProgramByCode(roomCode, true).catch(() => {})
    }
  }
  setTimeout(pollPort, 100)
  // 自然结束：jstdin 退出且引擎仍在 map（非 kill）= 播完到尾 → 清状态广播停
  jstdin.on('exit', () => {
    const e = programEngines.get(roomCode)
    if (e && e.jstdin === jstdin) stopProgramByCode(roomCode, true).catch(() => {})
  })
  return engine
}

async function waitProgramPort(roomCode, maxMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 250))
    const e = programEngines.get(roomCode)
    if (e && e.portAt) return true
  }
  const e = programEngines.get(roomCode)
  return !!(e && e.portAt)
}

// 校验用户是否某房间房主（rooms.host_id === userId），按 room_code 查
async function isRoomHost(userId, roomCode) {
  const r = await pool.query("SELECT host_id FROM rooms WHERE UPPER(room_code)=UPPER($1)", [roomCode])
  return r.rows.length > 0 && r.rows[0].host_id === parseInt(userId)
}

// ========== 乐手会话（活跃乐手榜计时） ==========
// 关闭会话：时长记到 last_seen 为止（宁可少算不错算）；0 行更新无害
async function closeMusicianSession(userId, roomId) {
  await pool.query('UPDATE musician_sessions SET ended_at = last_seen WHERE user_id = $1 AND room_id = $2 AND ended_at IS NULL', [userId, roomId])
}
// 解散房间时全员闭
async function closeRoomMusicianSessions(roomId) {
  await pool.query('UPDATE musician_sessions SET ended_at = last_seen WHERE room_id = $1 AND ended_at IS NULL', [roomId])
}

// ========== WebSocket (Socket.IO) ==========
// 握手认证：验 httpOnly cookie JWT → socket.userId（同域 cookie 自动携带，前端零改动）
io.use(async (socket, next) => {
  const token = parseCookies(socket.request)[COOKIE_NAME]
  if (!token) return next(new Error('未登录'))
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    // 1024 Step6: 封号拦截对齐 HTTP 语义——被封前已挂在房内的 socket 也不得继续聊天
    const restriction = await getUserRestriction(decoded.id)
    if (restriction === 'banned') return next(new Error('该账号已被封禁'))
    socket.userId = decoded.id
    socket.nickname = decoded.nickname
    const u = await pool.query('SELECT avatar_url FROM users WHERE id=$1', [decoded.id])
    socket.avatarUrl = u.rows.length > 0 && u.rows[0].avatar_url ? u.rows[0].avatar_url.replace('/var/jamony/avatars', '/avatars') : ''
    next()
  } catch (e) {
    next(new Error('登录已过期'))
  }
})

// L2 延迟清理表（2026-09-16 强刷保房改造）：key=`userId:room_code` → timer。
// socket 断开不再立即清成员（强刷会被误杀），挂 60s 定时；期内同 userId 重连（join-room）即取消；
// 到点先复查成员行（HTTP leave 可能已正常清过）再走 removeMemberAndCheckDissolve。
// 明确退出（叉窗/dock/断开按钮）走 HTTP leave 不经过这里；内存态，pm2 重启丢（服务器重启本就全房报废，既有特性）。
const pendingL2Cleanup = new Map()
const L2_GRACE_MS = 60 * 1000

// 1026 混音器使用 presence（删除保护「正在使用的文件不可删除」）：
// sessionId → 占用中的 socket 集合（试听/发表混音器不分模式不分角色——混音器全员可开）。
// socket 生命周期=使用生命周期：开=mixer-open 上报，关/断线=清理，无需心跳。
const mixerUsage = new Map()      // sessionId(Number) → Set<socketId>
const socketMixers = new Map()    // socketId → Set<sessionId>（断线反查清理用）
// 录音发起者表（join-room 补发用）：room_code → 发起 userId。强刷回来后发起者才能显示"停止"按钮。
// 内存态：服务器重启丢 → 降级为只显示"录音中"（同改造前），可接受。
const recordingStarters = new Map()

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId)
    // jamony 1017: 进房即补发成员快照（单发本 socket）——封死三个丢事件窗口:
    // ①页面挂载 fetch 与 socket join 之间的缝隙 ②nickname 异步晚到导致连接晚于首个事件
    // ③断线重连期间错过的事件。成员/房主从此连上即对账, 右栏卡片不再需要硬刷新追平。
    broadcastMembers(roomId, socket)
    // 强刷/断网抖动重连回来：取消该用户的 L2 延迟清理（人回来了，房不散）
    if (socket.userId) {
      for (const key of pendingL2Cleanup.keys()) {
        if (key.startsWith(`${socket.userId}:`)) {
          clearTimeout(pendingL2Cleanup.get(key))
          pendingL2Cleanup.delete(key)
          console.log(`L2 cleanup cancelled (user rejoined): ${key}`)
        }
      }
    }
    // 补发房间当前录音状态（强刷/后进房者同步"录音中"指示+已录秒数校准；只在录音中发，空闲不发——前端默认就是不录）
    pool.query('SELECT recording_active, recording_started_at FROM rooms WHERE room_code = $1', [roomId])
      .then(r => {
        if (r.rows.length > 0 && r.rows[0].recording_active) {
          socket.emit('recording-state', {
            roomId, active: true,
            userId: recordingStarters.get(String(roomId)),
            startedAt: r.rows[0].recording_started_at ? new Date(r.rows[0].recording_started_at).toISOString() : undefined,
            maxSeconds: RECORDING_MAX_SECONDS,
          })
        }
      })
      .catch(() => {})
    console.log("Socket joined room:", roomId)
  })

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId)
    console.log("Socket left room:", roomId)
  })

  // 1026 混音器使用 presence 上报（删除保护）：开=占用 / 关=释放
  socket.on("mixer-open", (data) => {
    const sid = Number(data && data.sessionId)
    if (!Number.isFinite(sid)) return
    if (!mixerUsage.has(sid)) mixerUsage.set(sid, new Set())
    mixerUsage.get(sid).add(socket.id)
    if (!socketMixers.has(socket.id)) socketMixers.set(socket.id, new Set())
    socketMixers.get(socket.id).add(sid)
  })
  socket.on("mixer-close", (data) => {
    const sid = Number(data && data.sessionId)
    if (!Number.isFinite(sid)) return
    const users = mixerUsage.get(sid)
    if (users) { users.delete(socket.id); if (users.size === 0) mixerUsage.delete(sid) }
    const mine = socketMixers.get(socket.id)
    if (mine) { mine.delete(sid); if (mine.size === 0) socketMixers.delete(socket.id) }
  })

  socket.on("chat-message", async (data) => {
    const { roomId, message } = data
    // 1024 Step6 欢哥定稿: 聊天事前审(聊天建在jamony主窗口走api, 可实时监管非事后审)——
    // 拒绝级不广播不落库仅发送者收提示; 疑似放行+interact渠道计数, 违规同样进五级阶梯
    if (roomId && socket.userId && message) {
      const ok = await moderatePublishText('chat', null, socket.userId, socket.nickname, String(message))
      if (!ok) { socket.emit('chat-rejected', { msg: MODERATION_REJECT_MSG }); return }
    }
    io.to(roomId).emit("chat-message", {
      id: Date.now().toString(),
      author: socket.nickname,
      avatarUrl: socket.avatarUrl || '',
      content: message,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      isSelf: false,
    })
    // jamony: 异步存证(180天证据保全, 不阻塞实时转发)
    if (roomId && socket.userId && message) {
      pool.query(
        'INSERT INTO chat_messages (room_code, user_id, nickname, avatar_url, content) VALUES ($1, $2, $3, $4, $5)',
        [roomId, socket.userId, socket.nickname, socket.avatarUrl || '', message]
      ).catch(e => console.error('chat_messages insert error:', e.message))
    }
  })

  socket.on("push-chords", async (data) => {
    const { roomId, chords } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return  // 仅合奏者可推和弦
    if (chords) {
      // 1025: 补事前审——灵感进程是自由文本输入投送房间公共面(左栏全房可见),与主题同性质(欢哥盲区扫雷)
      if (!(await moderatePublishText('chords', null, socket.userId, socket.nickname, String(chords.join(' '))))) {
        socket.emit('chat-rejected', { msg: MODERATION_REJECT_MSG }); return
      }
      try { await pool.query('UPDATE rooms SET current_chords = $1 WHERE room_code = $2', [chords.join(' '), roomId]) }
      catch (e) { console.error('Chords persist error:', e) }
    }
    io.to(roomId).emit("chords-update", { chords })
  })

  socket.on("push-theme", async (data) => {
    const { roomId, theme } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return  // 仅合奏者可推主题
    if (theme) {
      // 1024 Step6: 推至大屏=房间门面(欢哥归组publish), 事前审同款——拒绝级不广播仅发送者提示
      const ok = await moderatePublishText('theme', null, socket.userId, socket.nickname, String(theme))
      if (!ok) { socket.emit('chat-rejected', { msg: MODERATION_REJECT_MSG }); return }
      try {
        await pool.query('UPDATE rooms SET current_theme = $1 WHERE room_code = $2', [theme, roomId])
      } catch (e) { console.error('Theme persist error:', e) }
    }
    io.to(roomId).emit("theme-update", { theme })
  })

  // 投谱（10-07 魔盒 P1）：谱子 JSON 存 rooms.current_score（强刷/后进来的人水合），全房广播
  socket.on("push-score", async (data) => {
    const { roomId, score } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return  // 仅合奏者可投谱
    // 文件 URL 只认本房间自己的谱子路径（防任意 src 注入）
    const validFiles = (score && Array.isArray(score.files) ? score.files : [])
      .filter(f => typeof f === 'string' && f.startsWith(`/api/rooms/${roomId}/score/files/`))
    if (validFiles.length === 0) return
    const validUrl = (u) => (typeof u === 'string' && u.startsWith(`/api/rooms/${roomId}/score/files/`)) ? u : undefined
    const safeScore = {
      type: ['pdf', 'images', 'gp'].includes(score.type) ? score.type : 'images',
      name: String(score.name || '').slice(0, 60),
      files: validFiles.slice(0, 30),
      pushedBy: socket.userId,
      // GP 附加物：MIDI 给幽灵乐手，tracks 给前端分轨条（10-07 P2）
      midUrl: score.type === 'gp' ? validUrl(score.midUrl) : undefined,
      tracks: score.type === 'gp' && Array.isArray(score.tracks)
        ? score.tracks.filter(t => t && typeof t.name === 'string').slice(0, 16).map(t => ({ name: String(t.name).slice(0, 40) }))
        : undefined,
    }
    // 1025: 补事前审——谱名(手打)+GP分轨名(文件元数据)都会上屏全房可见; 拒绝级不投谱仅发送者提示
    const scoreText = [safeScore.name, ...((safeScore.tracks || []).map((t) => t.name))].filter(Boolean).join(' ')
    if (scoreText && !(await moderatePublishText('score', null, socket.userId, socket.nickname, scoreText))) {
      socket.emit('chat-rejected', { msg: MODERATION_REJECT_MSG }); return
    }
    try { await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(safeScore), roomId]) }
    catch (e) { console.error('Score persist error:', e) }
    await stopGpByCode(roomId, true)  // 推新内容自动停走带（大屏独占定稿）
    io.to(roomId).emit("score-update", { score: safeScore })
  })

  // 收回谱子（大屏恢复默认）
  socket.on("clear-score", async (data) => {
    const { roomId } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    await stopGpByCode(roomId, true)  // 收回谱子走带随停
    try { await pool.query('UPDATE rooms SET current_score = NULL WHERE room_code = $1', [roomId]) }
    catch (e) { console.error('Score clear error:', e) }
    io.to(roomId).emit("score-update", { score: null })
  })

  // GP 走带：任何人可播/停（后动作胜出，鼓机同款语义）；startMs=点播者的指针位置（从该处开播，10-09 欢哥定稿）
  socket.on("gp-play", async (data) => {
    const { roomId } = data || {}
    let startMs = Math.max(0, Math.min(Number(data?.startMs) || 0, 3600 * 1000))
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT server_port, current_score FROM rooms WHERE room_code = $1', [roomId])
    const row = r.rows[0]
    let score = null
    try { score = row && row.current_score ? JSON.parse(row.current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp' || !score.midUrl) return
    if (gpInflight.has(roomId)) return
    gpInflight.set(roomId, setTimeout(() => gpInflight.delete(roomId), 15000))
    // 选段（1011 ⑥-2b）：A-B 存在时起播点=A（覆盖点播者 startMs，GP A-B 语义），totalMs 掐到 B（自然结束定时器硬切）
    const spd = sanitizeGpSpeed(score.speed)
    if (score.range && Number.isFinite(score.range.a) && score.range.b > score.range.a) startMs = Math.round(score.range.a)
    // 播放定版（10-09 步骤②）：按当前混音+起始位置从原文件现场重生成 MIDI（解析+生成=亚秒级）；live_*.mid 每次先清旧
    const gpPath = path.join(scoresDir, roomId, path.basename(score.files[0]))
    if (!fs.existsSync(gpPath)) { socket.emit('gp-state', { playing: false }); clearTimeout(gpInflight.get(roomId)); gpInflight.delete(roomId); return }
    const dir = path.join(scoresDir, roomId)
    try { for (const f of fs.readdirSync(dir)) if (f.startsWith('live_') && f.endsWith('.mid')) { try { fs.unlinkSync(path.join(dir, f)) } catch (e) {} } } catch (e) { /* 目录异常由 gpPath 检查兜底 */ }
    const midPath = path.join(dir, `live_${Date.now()}.mid`)
    let gpGen = null
    // 1013 全曲循环：loop 且无选段 → 全谱烤制（startMs=0）+seekTick 首遍从指针跳入——原生循环=头↔尾
    // （⑥-2a"全曲循环=回曲目头"语义；烤制窗口≠全谱的病根昨在重启路径、今在起播路径，根治=全谱进文件）
    let gpSeekMs
    if (!score.range && score.loop && startMs > 0) { gpSeekMs = startMs; startMs = 0 }
    try {
      gpGen = await gpToMidiAsync(gpPath, midPath, score.mix, startMs, sanitizeGpSpeed(score.speed), !!score.countin, score.range ? Math.round(score.range.b) : undefined, gpSeekMs)
    } catch (err) {
      console.error('gp play remix error:', err.message)
      clearTimeout(gpInflight.get(roomId)); gpInflight.delete(roomId)
      socket.emit('gp-state', { playing: false })
      return
    }
    // 选段掐尾：totalMs=选区时长(烤速域)+countIn；无选区=全曲积分（全曲循环=全谱积分）
    const playTotalMs = score.range ? Math.round((score.range.b - score.range.a) / spd) + Math.round(gpGen.countInMs || 0) : gpGen.totalMs
    // 1012 ⑥-2c：loop 随 spawn 武装原生循环；stateTemplate=周期广播模板（每遍重锚指针）；
    // 1013 全曲循环：周期模板 startMs=0（每遍回曲目头），首播单独广播 startMs=指针+startedAt=开声时刻
    startGpPlayback(roomId, row.server_port, midPath, playTotalMs, {
      loop: !!score.loop,
      stateTemplate: { startMs: Math.round(startMs), speed: spd, countInMs: Math.round(gpGen.countInMs || 0), endMs: score.range ? Math.round(score.range.b) : undefined },
      expectedEndTick: gpGen.endTick,
      seekTick: gpGen.seekTick, seekTickMs: gpGen.seekTickMs,
    })
    const wired = await waitGpWired(roomId, 8000)
    clearTimeout(gpInflight.get(roomId)); gpInflight.delete(roomId)
    if (!wired) { console.error('gp play: not wired', roomId); return }
    // seek 跳入（1013 全曲循环）：等定位完成（开声）再广播——首播 startedAt=开声时刻、startMs=指针原速域值
    // （指针线过(开声,指针)点斜率spd=与音频严格同步；周期边界链已用精确锚重挂）
    const engSeek = gpEngines.get(roomId)
    if (engSeek && engSeek.seekTick > 0) {
      for (let i = 0; i < 40 && !engSeek.seekDone && gpEngines.get(roomId) === engSeek; i++) await new Promise(r => setTimeout(r, 50))
    }
    // startedAt=spawn 时刻（10-09 滚动超前根治）：fluidsynth 从 spawn 就在播，接线耗时那段音乐已白丢。
    // 若记接线时刻，客户端时间线恒慢~0.5s → 2s对表反复前跳（seek风暴）→ 谱面滚动被拽超前、当前小节顶出视野
    const engine = gpEngines.get(roomId)
    if (engine) { engine.liveMidPath = midPath; engine.totalMs = playTotalMs; engine.countInMs = gpGen.countInMs }  // ⑥-2 循环重启档（totalMs=掐尾后时长）    // B' 终版零点=playAt（接线完成后 player_start 命令下发时刻=第一声真实起点，零白丢）；
    // 兜底链 wiredAt→portAt→now（play 命令失败时不至于没零点）
    const t0 = engine && engine.playAt ? engine.playAt : (engine && engine.wiredAt ? engine.wiredAt : (engine && engine.spawnedAt ? engine.spawnedAt : Date.now()))
    if (engine && engine.spawnedAt) {
      console.log(`GP play ${roomId} 时间线账目: spawn→port=${(engine.portAt || 0) - engine.spawnedAt}ms port→wire=${engine.wiredAt && engine.portAt ? engine.wiredAt - engine.portAt : "?"}ms wire→play=${engine.playAt && engine.wiredAt ? engine.playAt - engine.wiredAt : "?"}ms`)
    }
    // seek 跳入（1013 全曲循环）：首播锚=开声时刻（=playAt+seekTickMs），startMs=指针原速域值（指针线过该点斜率spd）
    const firstStartMs = gpSeekMs != null ? Math.round(gpSeekMs) : Math.round(startMs)
    const firstStartedAt = new Date(gpSeekMs != null && engine ? t0 + (engine.seekTickMs || 0) : t0).toISOString()
    // speed 随广播下发：客户端对表 target=base+墙钟elapsed×speed（谱面域换算）+本地playbackSpeed同设
    // countInMs（⑥-1 预备拍）：本地公式=内容x到耳墙钟 startedAt+countInMs+(x−base)+lag；count-in 期间指针钳在起点
    const gpState = { playing: true, startedAt: firstStartedAt, startMs: firstStartMs, speed: spd, countInMs: Math.round(gpGen.countInMs || 0), endMs: score.range ? Math.round(score.range.b) : undefined }
    try { await pool.query('UPDATE rooms SET gp_state = $1 WHERE room_code = $2', [JSON.stringify(gpState), roomId]) } catch (e) {}
    io.to(roomId).emit("gp-state", gpState)
    console.log(`GP play ${roomId} port ${row.server_port} from ${firstStartMs}ms${gpSeekMs != null ? ' 全曲循环首遍跳入' : ''}`)
  })

  socket.on("gp-pause", async (data) => {
    const { roomId } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    if (gpInflight.has(roomId)) return
    gpInflight.set(roomId, setTimeout(() => gpInflight.delete(roomId), 10000))
    await stopGpByCode(roomId, true)
    clearTimeout(gpInflight.get(roomId)); gpInflight.delete(roomId)
  })

  // GP 调音台（10-09 步骤②）：合奏者可调（听众只读），后动作胜出；存 current_score 随水合；播放时在 gp-play 里定版
  socket.on("gp-mix", async (data) => {
    const { roomId, mix } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_score FROM rooms WHERE room_code = $1', [roomId])
    let score = null
    try { score = r.rows[0] && r.rows[0].current_score ? JSON.parse(r.rows[0].current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp') return
    score.mix = sanitizeGpMix(mix)
    await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(score), roomId])
    io.to(roomId).emit("gp-mix", { mix: score.mix })
  })

  // GP 倍速（10-10 步骤⑤）：房级、合奏者可调、后动作胜出、播放瞬间定版（与混音同语义）；
  // 非播放中调=本地指针/节拍器即随（playbackSpeed 即时设），播放中前端锁 UI（音频既成流不可变）
  socket.on("gp-speed", async (data) => {
    const { roomId, speed } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_score FROM rooms WHERE room_code = $1', [roomId])
    let score = null
    try { score = r.rows[0] && r.rows[0].current_score ? JSON.parse(r.rows[0].current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp') return
    score.speed = sanitizeGpSpeed(speed)
    await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(score), roomId])
    io.to(roomId).emit("gp-speed", { speed: score.speed })
  })

  // GP 预备拍（1011 ⑥-1）：房级开关（合奏者可调，后动作胜出，播放瞬间定版——click 烤进流全员一起听）
  socket.on("gp-countin", async (data) => {
    const { roomId, countin } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_score FROM rooms WHERE room_code = $1', [roomId])
    let score = null
    try { score = r.rows[0] && r.rows[0].current_score ? JSON.parse(r.rows[0].current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp') return
    score.countin = !!countin
    await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(score), roomId])
    io.to(roomId).emit("gp-countin", { countin: score.countin })
  })

  // GP 循环（1011 ⑥-2a 全曲版）：房级开关——⚠️与M/S/倍速/countin不同类：它管"播完后要不要再来"
  // （未来行为），故播放中不锁UI（第N遍中途关=本遍播完即止）；自然结束读DB最新值决定respawn
  socket.on("gp-loop", async (data) => {
    const { roomId, loop } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_score FROM rooms WHERE room_code = $1', [roomId])
    let score = null
    try { score = r.rows[0] && r.rows[0].current_score ? JSON.parse(r.rows[0].current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp') return
    score.loop = !!loop
    await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(score), roomId])
    io.to(roomId).emit("gp-loop", { loop: score.loop })
    // 1012 ⑥-2c：同步引擎内存 flag——下个 B 点生效（开着=周期广播继续原生循环；关了=B 点干净停；中途开=换代 respawn）
    const gpEng = gpEngines.get(roomId)
    if (gpEng) gpEng.loop = score.loop
  })

  // GP 选段（1011 ⑥-2b）：房级 A-B（原速域 ms，倍速无关）；null=清选区回全曲；合奏者可调/后动作胜出
  socket.on("gp-range", async (data) => {
    const { roomId, range } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_score FROM rooms WHERE room_code = $1', [roomId])
    let score = null
    try { score = r.rows[0] && r.rows[0].current_score ? JSON.parse(r.rows[0].current_score) : null } catch (e) {}
    if (!score || score.type !== 'gp') return
    if (range && Number.isFinite(range.a) && Number.isFinite(range.b) && range.b > range.a && range.a >= 0) {
      score.range = { a: Math.round(range.a), b: Math.round(range.b) }
    } else {
      delete score.range
    }
    await pool.query('UPDATE rooms SET current_score = $1 WHERE room_code = $2', [JSON.stringify(score), roomId])
    io.to(roomId).emit("gp-range", { range: score.range ?? null })
  })

  /* ========== program 背景轨走带事件（1015）：play/pause/stop/mix，广播走 program-state/update ========== */
  socket.on("program-play", async (data) => {
    const { roomId } = data || {}
    const startMs = Math.max(0, Math.min(Number(data?.startMs) || 0, 3600 * 1000))
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    if (programInflight.has(roomId)) return
    programInflight.set(roomId, setTimeout(() => programInflight.delete(roomId), 15000))
    const fail = (msg) => { clearTimeout(programInflight.get(roomId)); programInflight.delete(roomId); socket.emit('program-error', { msg }); io.to(roomId).emit('program-state', { playing: false }) }
    const r = await pool.query('SELECT server_port, current_program FROM rooms WHERE room_code = $1', [roomId])
    const row = r.rows[0]
    const prog = progSanitize(progRead(row))
    if (!row || !row.server_port) { fail('房间服务未就绪'); return }
    if (!prog.tracks.length) { fail('还没有伴奏轨，先上传'); return }
    // ghost 前置检查（jack-stdin 连不上目标端口会直接退；fluidsynth 有接线重试，这里必须显式拦）
    const port = row.server_port
    // ghost 前置检查（jack-stdin 连不上目标端口会直接退；fluidsynth 有接线重试，这里必须显式拦）——1029 异步化
    let ghostReady = false
    try { const { stdout } = await execFileAsync('jack_lsp'); ghostReady = stdout.includes(`jamsoul-${port} jamony-looper:input left`) } catch (e) {}
    if (!ghostReady) { fail('合奏服务未就绪，稍等再试'); return }
    // 轨时长：上传时已算好（1016）；存量/异常缺失才现测兜底+回写（最长轨=时间轴总长）
    let totalMs = Number(prog.totalMs) || 0
    if (!(totalMs > 0)) {
      for (const t of prog.tracks) {
        const dur = await progProbeDurationSec(path.join(programsDir, roomId, t.file))
        if (dur == null) { fail(`轨「${t.name}」读取失败，请删除后重新上传`); return }
        totalMs = Math.max(totalMs, Math.round(dur * 1000))
      }
      prog.totalMs = totalMs
      await pool.query('UPDATE rooms SET current_program = $1 WHERE room_code = $2', [JSON.stringify(prog), roomId]).catch(() => {})
    }
    if (startMs >= totalMs) { clearTimeout(programInflight.get(roomId)); programInflight.delete(roomId); socket.emit('program-error', { msg: '已到曲尾' }); io.to(roomId).emit('program-state', { playing: false }); return }
    const engine = startProgramPlayback(roomId, port, prog, startMs, totalMs)
    const portUp = await waitProgramPort(roomId, 8000)
    clearTimeout(programInflight.get(roomId)); programInflight.delete(roomId)
    if (!portUp) { console.error('program play: port not up', roomId); return }  // pollPort 失败路径已清理+广播
    // 零点=portAt（JACK 端口出现=出声前一刻；prebuffer 常数残差走实测校准，GP 三段账同款哲学）
    const eng = programEngines.get(roomId)
    const t0 = eng && eng.portAt ? eng.portAt : Date.now()
    if (eng && eng.spawnedAt) console.log(`Program play ${roomId} port ${port} from ${startMs}ms total ${totalMs}ms 时间线: spawn→port=${t0 - eng.spawnedAt}ms`)
    const st = { playing: true, startedAt: new Date(t0).toISOString(), startMs: Math.round(startMs), totalMs }
    try { await pool.query('UPDATE rooms SET program_state = $1 WHERE room_code = $2', [JSON.stringify(st), roomId]) } catch (e) {}
    io.to(roomId).emit('program-state', st)
  })

  socket.on("program-pause", async (data) => {
    const { roomId } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    await stopProgramByCode(roomId, true)  // 位置由下次点播者定（GP pause 同语义；前端 mini 条本地记指针）
  })

  socket.on("program-stop", async (data) => {
    const { roomId } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    await stopProgramByCode(roomId, true)
  })

  // 混音实时同步（1014 拍板②：暂停态谁动全屋可见；播放中=重启渲染续播，GP 重烤 respawn 同款）
  socket.on("program-mix", async (data) => {
    const { roomId, mix } = data || {}
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return
    const r = await pool.query('SELECT current_program, program_state FROM rooms WHERE room_code = $1', [roomId])
    const row = r.rows[0]
    if (!row) return
    const prog = progSanitize(progRead(row))
    if (!prog.tracks.length) return
    // 合并清洗：形状约束同 sanitizeGpMix（后动作胜出）；1016 四功能加 solos/pans/master
    if (mix && typeof mix === 'object') {
      if (mix.vols && typeof mix.vols === 'object') {
        for (const t of prog.tracks) {
          const v = Number(mix.vols[t.id])
          if (Number.isFinite(v)) prog.mix.vols[t.id] = Math.max(0, Math.min(200, Math.round(v)))
        }
      }
      if (Array.isArray(mix.mutes)) {
        const ids = new Set(prog.tracks.map(t => t.id))
        prog.mix.mutes = [...new Set(mix.mutes.filter(m => ids.has(m)))]
      }
      if (Array.isArray(mix.solos)) {
        const ids2 = new Set(prog.tracks.map(t => t.id))
        prog.mix.solos = [...new Set(mix.solos.filter(m => ids2.has(m)))]
      }
      if (mix.pans && typeof mix.pans === 'object') {
        for (const t of prog.tracks) {
          const pv = Number(mix.pans[t.id])
          if (Number.isFinite(pv)) prog.mix.pans[t.id] = Math.max(-1, Math.min(1, pv))
        }
      }
      const mG = Number(mix.master)
      if (Number.isFinite(mG)) prog.mix.master = Math.max(0, Math.min(200, Math.round(mG)))
    }
    await pool.query('UPDATE rooms SET current_program = $1 WHERE room_code = $2', [JSON.stringify(prog), roomId])
    const eng = programEngines.get(roomId)
    let st = null
    try { st = row.program_state ? JSON.parse(row.program_state) : null } catch (e) {}
    if (eng && st && st.playing) {
      // 播放中：kill+带当前位置重 spawn（-ss 续播）；新零点=新 portAt
      const curMs = Math.round(st.startMs + (Date.now() - new Date(st.startedAt).getTime()))
      const resumeMs = Math.max(0, Math.min(curMs, eng.totalMs - 1))
      const engine2 = startProgramPlayback(roomId, eng.port, prog, resumeMs, eng.totalMs)
      const portUp = await waitProgramPort(roomId, 8000)
      if (portUp) {
        const t0 = engine2.portAt || Date.now()
        const st2 = { playing: true, startedAt: new Date(t0).toISOString(), startMs: resumeMs, totalMs: eng.totalMs }
        await pool.query('UPDATE rooms SET program_state = $1 WHERE room_code = $2', [JSON.stringify(st2), roomId]).catch(() => {})
        io.to(roomId).emit('program-state', st2)
      }
    }
    io.to(roomId).emit('program-update', { program: prog })  // 暂停态参数全屋可见（方案拍板②）
  })

  socket.on("disconnect", async () => {
    console.log("Socket disconnected, userId:", socket.userId)
    // 1026 混音器 presence 随连接蒸发（强刷/断网/杀进程——无需客户端 close 事件）
    const mine = socketMixers.get(socket.id)
    if (mine) {
      for (const sid of mine) {
        const users = mixerUsage.get(sid)
        if (users) { users.delete(socket.id); if (users.size === 0) mixerUsage.delete(sid) }
      }
      socketMixers.delete(socket.id)
    }
    if (!socket.userId) return
    // L2 兜底（延迟版）：崩溃/强杀/断网/强刷时客户端没机会发 leave，socket 断开（pingTimeout 后）这里挂 60s 定时再清成员+检查解散。
    // 强刷场景页面秒级重载重连（join-room 取消定时器），房间原地无伤；真崩溃/断电 60s 后照原逻辑清。
    try {
      const rooms = await pool.query(
        "SELECT rm.room_id, r.room_code FROM room_members rm JOIN rooms r ON r.id = rm.room_id WHERE rm.user_id = $1 AND r.status NOT IN ('closed','archived')",
        [socket.userId]
      )
      for (const row of rooms.rows) {
        const key = `${socket.userId}:${row.room_code}`
        if (pendingL2Cleanup.has(key)) clearTimeout(pendingL2Cleanup.get(key))  // 双 socket 实例同 key 幂等覆盖
        const l2Check = async () => {
          pendingL2Cleanup.delete(key)
          try {
            const still = await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [row.room_id, socket.userId])
            if (still.rows.length === 0) return  // 期间已被 HTTP leave 正常清掉，不空跑
            // 10-06 漫游改造：交叉验证心跳——socket 断但心跳新鲜（HTTP 心跳还在发）
            // = 客户端活着、人在房间外页面漫游 → 续期不清人；心跳也停 = 真失联（断电/断网/卡死/杀进程）才清
            const beat = await pool.query(
              "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 AND last_active_at > NOW() - INTERVAL '90 seconds'",
              [row.room_id, socket.userId]
            )
            if (beat.rows.length > 0) {
              console.log(`L2 renewed (roaming): user ${socket.userId} room ${row.room_code}`)
              pendingL2Cleanup.set(key, setTimeout(l2Check, L2_GRACE_MS))
              return
            }
            console.log(`L2 deferred cleanup: user ${socket.userId} room ${row.room_code}`)
            await removeMemberAndCheckDissolve(socket.userId, row.room_id, row.room_code)
          } catch (e) { console.error('L2 deferred cleanup error:', e) }
        }
        pendingL2Cleanup.set(key, setTimeout(l2Check, L2_GRACE_MS))
      }
    } catch (e) { console.error('disconnect cleanup error:', e) }
  })
})

// ========== 房间主题 ==========
app.post('/api/rooms/:code/theme', requireAuth, async (req, res) => {
  try {
    const { code } = req.params
    const roomId = await getRoomIdByCode(code)
    if (!roomId) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, code))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可设置主题' })
    }
    const { theme } = req.body
    if (!theme || !theme.trim()) {
      return res.status(400).json({ ok: false, msg: '主题不能为空' })
    }
    // 1025: 补审核旁路——socket push-theme 有事前审, 此REST孪生端点漏了(同功能双端点判例); 合法主题照常通过
    if (!(await moderatePublishText('theme', null, req.userId, req.nickname || '', theme.trim()))) {
      return res.status(400).json({ ok: false, msg: MODERATION_REJECT_MSG })
    }
    await pool.query('UPDATE rooms SET current_theme = $1 WHERE id = $2', [theme.trim(), roomId])
    res.json({ ok: true, msg: '主题已更新' })
  } catch (err) {
    console.error('Theme update error:', err)
    res.status(500).json({ ok: false, msg: '主题更新失败' })
  }
})

// ========== 退出所有房间（退出登录时调用） ==========
app.post('/api/users/:userId/leave-all-rooms', requireAuth, async (req, res) => {
  try {
    const userId = req.userId
    const rooms = await pool.query('SELECT room_id FROM room_members WHERE user_id = $1', [userId])
    for (const row of rooms.rows) {
      await closeMusicianSession(userId, row.room_id)  // 闭会话（此端点是 removeMember 的复制粘贴变体，钩子单独加）
      await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [row.room_id, userId])
      await closeRoomVisit(row.room_id, userId) // 1025: L2断线闭段
      const remaining = await pool.query("SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [row.room_id])
      if (parseInt(remaining.rows[0].count) === 0) {
        const portResult = await pool.query('SELECT server_port, room_code FROM rooms WHERE id = $1 AND status != $2', [row.room_id, 'closed'])
        const closePort2 = portResult.rows[0]?.server_port
        const dissolveCode = portResult.rows[0]?.room_code
        if (closePort2) {
          await cleanupRoomResources(closePort2, dissolveCode)  // 1029：级联抽公共异步体
        }
        // 广播房间解散，让听众客户端弹窗+跳大厅
        if (dissolveCode) io.to(String(dissolveCode).trim()).emit('room-dissolved', { roomCode: String(dissolveCode).trim() })
        await closeAllRoomVisits(row.room_id) // 1025: 此兜底归档路径也闭账
        // 1025 欢哥定稿: 无作品房也归档不硬删(与主解散管线同口径; 此路径成员已被逐个清空,final恒空,合奏者快照仍有值)
        await pool.query(`UPDATE rooms SET status='archived', closed_at=NOW(),
          members_snapshot = (SELECT jsonb_build_object(
            'final', (SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', user_id, 'nick', nickname, 'role', role)), '[]'::jsonb) FROM room_members WHERE room_id = $1),
            'musicians', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('uid', u.id, 'nick', u.nickname)), '[]'::jsonb) FROM musician_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.room_id = $1)
          )) WHERE id=$1`, [row.room_id])
        emitRoomsChanged('dissolve:' + dissolveCode)  // 1030 大厅实时化：L2 兜底归档也即时通知
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Leave all rooms error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 启动自检 JACK（1029 异步化：原同步 shell || 后台拉起；启动期一次性，语义不变）
;(async () => { try { await execFileAsync('jack_lsp') } catch (e) { try { spawn('jackd', ['-d', 'alsa', '-d', 'hw:Loopback', '-p', '1024', '-r', '48000'], { stdio: 'ignore', detached: true }).unref() } catch (e2) {} } })()

// 过期通知定时任务（每小时扫描；setInterval 无依赖，pm2 重启重置但 expire_notified/remind_notified 去重字段保护不重复发）
async function scanExpiredNotices() {
  try {
    // 线下提前1天提醒
    const remind = await pool.query("UPDATE notices SET remind_notified=TRUE WHERE type='offline' AND status='active' AND expire_at > NOW() AND expire_at < NOW() + INTERVAL '1 day' AND remind_notified=FALSE RETURNING *")
    for (const n of remind.rows) {
      await createNotification({ recipientId: n.user_id, type: 'system', noticeId: n.id, message: `你的线下公告「${n.title}」明天过期` })
    }
    // 过期通知（线上+线下）
    const expired = await pool.query("UPDATE notices SET expire_notified=TRUE WHERE status='active' AND expire_at < NOW() AND expire_notified=FALSE RETURNING *")
    for (const n of expired.rows) {
      await createNotification({ recipientId: n.user_id, type: 'system', noticeId: n.id, message: `你的公告「${n.title}」已过期` })
    }
  } catch (e) { console.error('Expire scan error:', e) }
}
scanExpiredNotices()  // 启动时立即跑一次（pm2 重启后立即扫描，不漏）
setInterval(scanExpiredNotices, 3600000)

// 启动自检孤儿进程：pm2 重启后清理上次崩溃/删除房间残留的 jamsoul headless/ghost/ffmpeg。
// 扫描所有 jamsoul-headless 监听的 UDP 端口，对比 rooms 表活跃房间，无对应房间的全部 kill。
async function cleanupOrphanProcesses() {
  try {
    // 1. 扫描所有 jamsoul-headless 监听的 UDP 端口（1029 异步化：原 ss/ps execSync=每 10 分钟定时全站抖；
    //    改 execFileAsync+JS 侧过滤，语义相同——房间隔离宪法：巡检也不许冻别人）
    let headlessPorts = []
    try {
      const { stdout: ssRaw } = await execFileAsync('ss', ['-ulnp'])
      const ssOut = String(ssRaw).split('\n').filter(l => l.includes('jamsoul-headles')).join('\n')
      headlessPorts = [...ssOut.matchAll(/(\d+\.\d+\.\d+\.\d+):(\d+)\s/g)].map(m => parseInt(m[2])).filter(p => p >= 1024)
    } catch (e) { /* 无 headless 进程，正常 */ }

    // 1b.（1026 补，欢哥问出的漏项）卫星进程枚举：GP 走带 fluidsynth（FluidSynth-GP-<端口>，壳模式可永生）、
    //     program 走带 jack-stdin（jamony-program-<端口>）、推流 ffmpeg（jm-stream-<端口>）——
    //     场景=崩溃重启后 headless 已死而卫星还活（不监听UDP，ss 锚点照不到；gpEngines/programEngines
    //     内存 Map 已随重启蒸发，无人持有句柄）。进程名即端口，5位端口等长无子串误杀。
    //     1029 顺带扩：鼓机（FluidSynth-Drums-<端口>）也入卫星枚举（drumsEngines 重启蒸发同款盲区）
    try {
      const { stdout: psRaw } = await execFileAsync('ps', ['-eo', 'args='])
      const psOut = String(psRaw).split('\n').filter(l => /FluidSynth-GP-|jamony-program-|jm-stream-|FluidSynth-Drums-/.test(l) && !l.includes('grep')).join('\n')
      for (const m of psOut.matchAll(/(?:FluidSynth-GP-|jamony-program-|jm-stream-|FluidSynth-Drums-)(\d{5})/g)) {
        const p = parseInt(m[1])
        if (p >= 22124 && !headlessPorts.includes(p)) headlessPorts.push(p)
      }
    } catch (e) { /* 无卫星进程，正常 */ }

    // 2. 查 rooms 表活跃房间的 server_port
    const active = await pool.query("SELECT server_port FROM rooms WHERE status NOT IN ('closed','archived')")
    const activePorts = new Set(active.rows.map(r => r.server_port))

    // 3. 孤儿 = headless 端口不在活跃房间
    const orphans = headlessPorts.filter(p => !activePorts.has(p))
    if (orphans.length === 0) { console.log('Orphan check: clean'); return }
    for (const port of orphans) {
      console.log('Orphan check: cleaning port ' + port)
      try { await killDrumsEngine(port) } catch (e) {}  // 鼓机走原生引擎表（含野生残留清扫）
      try { await execFileAsync('node', ['/var/www/jamony/api/manage-jamsoul.js', 'stop', String(port)], { timeout: 10000 }) } catch (e) { console.error('orphan stop ' + port + ':', e.message) }
      try { await execFileAsync('node', ['/var/www/jamony/api/manage-jamsoul.js', 'stop-ghost', String(port)], { timeout: 5000 }) } catch (e) { console.error('orphan stop-ghost ' + port + ':', e.message) }
      // 残留的 ffmpeg/looper（state 可能没记录），精确按端口匹配兜底 kill
      try { await execFileAsync('pkill', ['-f', `jm-stream-${port}`]) } catch {}
      try { await execFileAsync('pkill', ['-f', `127.0.0.1:${port}`]) } catch {}
      // 1026 补：GP 走带 fluidsynth + program 走带 jack-stdin（ffmpeg 随管道 EPIPE 自灭）——崩溃重启后 Map 蒸发的孤儿
      try { await execFileAsync('pkill', ['-f', `FluidSynth-GP-${port}`]) } catch {}
      try { await execFileAsync('pkill', ['-f', `jamony-program-${port}`]) } catch {}
    }
    console.log('Orphan check: cleaned ' + orphans.length + ' orphan port(s): ' + orphans.join(','))
  } catch (e) { console.error('Orphan cleanup error:', e) }
}
cleanupOrphanProcesses()  // 启动时立即跑一次（pm2 重启后清上次残留）
setInterval(cleanupOrphanProcesses, 600000)  // 每 10 分钟复核一次

// ========== jamony 1018: 幽灵房收割者（挂房威胁主刀，欢哥拍板） ==========
// 威胁: 正常注册 + POST /api/rooms 后直接走人(fire-and-forget)——房间无 TTL，L2 只认"连过又断"的人，
// 从未连过的脚本成员永不触发清理 → 房间永生(每房 jamsoul+幽灵+ffmpeg ≈150-300MB，3-5 空房即 OOM)。
// 刀法: 定时扫描——全员(任何身份,听众也算人) last_active_at 全部静止超 20 分钟 → 逐成员走标准
// removeMemberAndCheckDissolve(解散清理全复用:杀进程/清物料/广播/归档)。心跳是唯一判据，不查 jamsoul
// 通道(jamsoul 由 web 端调起驱动，无心跳即无人)；录音中房间跳过(录音 5min 上限自带终点，不可被"占房永生")。
// 1019 深夜调参(欢哥拍板): 阈值 60→20、巡扫 10→5 分钟——真人 App 开着必跳 60s 一拍(挂机也跳)、断线真人
// 由 L2 60s 级兜走，收割者只面对"从未连过"的 DB 幽灵；20min=容忍 18 拍丢失余量充足，僵尸房最坏 25min 见尸。
// 双闸(房龄/成员静止)共用一个常量参数化，永不漂移。
const ROOM_REAPER_STALE_MINUTES = 20
async function reapGhostRooms() {
  try {
    const stale = await pool.query(
      `SELECT r.id, r.room_code, r.name FROM rooms r
       WHERE r.status NOT IN ('closed','archived')
         AND r.recording_active = false
         AND r.created_at < NOW() - ($1 * INTERVAL '1 minute')
         AND NOT EXISTS (
           SELECT 1 FROM room_members rm
           WHERE rm.room_id = r.id AND rm.last_active_at > NOW() - ($1 * INTERVAL '1 minute')
         )`,
      [ROOM_REAPER_STALE_MINUTES]
    )
    for (const room of stale.rows) {
      const members = await pool.query('SELECT user_id FROM room_members WHERE room_id = $1', [room.id])
      const code = String(room.room_code).trim()  // char(8) 尾空格:防物料路径拼接错位(0717 leave-all-rooms 同判例)
      if (members.rows.length === 0) {
        // 1028 根治光杆房盲区(欢哥拍板): REST 建房后无人 join → room_members 零行, 逐成员刀法空转, 房间永生
        // (铁证: E2E频率闸被空喊"收割"577次/48h 从未落刀) → 直达标准解散执行体
        console.log(`[reaper] 收割光杆房「${room.name}」(${code})——零成员(建房后无人加入)，直接解散`)
        try { await dissolveRoom(room.id, code) } catch (e) { console.error('[reaper] 光杆解散错误:', e.message) }
        continue
      }
      console.log(`[reaper] 收割幽灵房「${room.name}」(${code})——全员${members.rows.length}人静止超${ROOM_REAPER_STALE_MINUTES}分钟`)
      for (const m of members.rows) {
        const still = await pool.query("SELECT id FROM rooms WHERE id=$1 AND status NOT IN ('closed','archived')", [room.id])
        if (still.rows.length === 0) break  // 已被首笔 leave 触发标准解散，余下成员行随房清
        try { await removeMemberAndCheckDissolve(m.user_id, room.id, code) } catch (e) { console.error('[reaper] leave错误:', e.message) }
      }
    }
  } catch (e) { console.error('[reaper] 扫描错误:', e) }
}
setInterval(reapGhostRooms, 5 * 60000)    // 常规巡扫: 每 5 分钟(1019 调参,原 10 分钟)
setTimeout(reapGhostRooms, 30 * 1000)     // 启动 30 秒首扫(重启后即清存量)

/* ========== 房间推流抽检(1024 定稿: 30min×60s / 核心词only / 房间熔断 / 在场并集统计) ==========
   密度: 少量多次(欢哥: 2小时活跃房生命周期, 30min×60s 覆盖率最优, 成本≈0.1元/房/2h闲时版)
   不过审定义: 仅核心词reject(欢哥拍板); suspect只进疑似流零打扰
   处罚对象=房间(混音不可归因): 第N次(默认3)采样命中→收割者式强行解散; 房间计数从建立起算无重置
   在场统计: musician_sessions与采样时间窗有交集的合奏者(一条SQL精确并集, 欢哥修正免轮询),
             终生计数纯档案不指引代码——长期统计自然稀释误伤、沉淀惯犯画像(系统号排除, looper恒在场) */
const streamSamplingNow = new Set()

async function streamTranscribe(fileUrl, keys) {
  const NLSClient = require('@alicloud/nls-filetrans-2018-08-17')
  const nls = new NLSClient({ accessKeyId: keys.id, accessKeySecret: keys.secret, endpoint: 'https://filetrans.cn-beijing.aliyuncs.com' })
  const sub = await nls.submitTask({ Task: JSON.stringify({ appkey: keys.nlsAppKey, file_link: fileUrl, version: '4.0' }) })
  if (sub.StatusText !== 'SUCCESS') throw new Error('ASR提交失败:' + sub.StatusText)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const q = await nls.getTaskResult({ TaskId: sub.TaskId })
    if (q.StatusText === 'SUCCESS') return ((q.Result && q.Result.sentences) || []).map((s) => s.text).join(' ').slice(0, 500)
    if (q.StatusText === 'SUCCESS_WITH_NO_VALID_FRAGMENT') return ''
    if (q.StatusText !== 'RUNNING' && q.StatusText !== 'QUEUED' && q.StatusText !== 'QUEUEING') throw new Error('ASR异常态:' + q.StatusText)
  }
  throw new Error('ASR轮询超时')
}

async function handleStreamViolation(room, sampleId, presentIds, text, hits) {
  const cfg = await getModerationConfig()
  try {
    await pool.query(`INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel) VALUES ('stream_audio',$1,NULL,'',$2,'reject',$3,'room')`,
      [String(sampleId), `[房间${room.name}]音频转写:${text.slice(0, 180)}`, JSON.stringify(hits)])
  } catch (e) { console.error('[stream-sample] 留痕失败:', e.message) }
  const upd = await pool.query(`UPDATE rooms SET stream_violation_count = stream_violation_count + 1 WHERE id=$1 RETURNING stream_violation_count, status`, [room.id])
  const count = (upd.rows[0] && upd.rows[0].stream_violation_count) || 1
  const dissolved = count >= cfg.streamDissolveThreshold
  // 在场合奏者终生+1(纯档案; presentIds已排除系统号)
  if (presentIds && presentIds.length > 0) {
    try { await pool.query('UPDATE users SET room_violation_present_count = room_violation_present_count + 1 WHERE id = ANY($1::bigint[])', [presentIds]) } catch (e) { console.error('[stream-sample] 在场统计失败:', e.message) }
  }
  // 用户视角全房弹窗(欢哥定稿: 告知是义务也是权利)——先弹窗后动作, 保送达
  const warnMsg = `该房间涉嫌触碰违规，请注意jamony行为规范，达到${cfg.streamDissolveThreshold}次违规将被强行解散，此行为将影响合奏用户系统评价。`
  const finalMsg = `该房间因累计违规次数达到${cfg.streamDissolveThreshold}次，被强行解散。请注意jamony行为规范。`
  io.to(room.room_code).emit('room-violation', { msg: dissolved ? finalMsg : warnMsg, count, final: dissolved })
  console.log(`[stream-sample] 房间${room.id}「${room.name}」命中核心词 第${count}/${cfg.streamDissolveThreshold}次`)
  // 后台视角: admin 站内信(rainbowtube)
  try {
    const admin = await pool.query("SELECT id FROM users WHERE nickname='rainbowtube' AND is_system = FALSE LIMIT 1")
    if (admin.rows[0]) await createNotification({ recipientId: admin.rows[0].id, type: 'restriction', message: `[房间违规预警]「${room.name}」(${room.room_code})抽检命中核心词 ${count}/${cfg.streamDissolveThreshold}${dissolved ? '——已触发强行解散' : ''}。转写:「${String(text).slice(0, 60)}」` })
  } catch (e) {}
  // 熔断: 等弹窗送达 → 收割者式逐成员标准解散(杀jamsoul/清物料/广播/归档全复用)
  if (dissolved && upd.rows[0] && upd.rows[0].status !== 'closed') {
    await new Promise((r) => setTimeout(r, 2500))
    const members = await pool.query('SELECT user_id FROM room_members WHERE room_id=$1', [room.id])
    console.log(`[stream-sample] 房间${room.id}达熔断阈值——强行解散, 成员${members.rows.length}人`)
    for (const m of members.rows) {
      const still = await pool.query("SELECT id FROM rooms WHERE id=$1 AND status NOT IN ('closed','archived')", [room.id])
      if (still.rows.length === 0) break
      try { await removeMemberAndCheckDissolve(m.user_id, room.id, room.room_code) } catch (e) { console.error('[stream-sample] 解散错误:', e.message) }
    }
  }
}

async function sampleRoomStream(room) {
  if (streamSamplingNow.has(room.id)) return
  streamSamplingNow.add(room.id)
  const startedAt = new Date()
  let sampleId = null, filePath = ''
  try {
    const cfg = await getModerationConfig()
    const keys = getAliyunKeys()
    if (!keys || !keys.nlsAppKey) { console.error('[stream-sample] NLS未配置, 跳过'); return }
    filePath = `/var/jamony/stream-samples/s-${require('crypto').randomBytes(10).toString('hex')}.mp3` // 随机不可猜名: ASR需公网URL, 取证内容靠不可枚举保护(知道URL才能取, URL只存DB)
    await new Promise((resolve, reject) => {
      require('child_process').exec(`ffmpeg -y -i http://127.0.0.1:8000/room-${room.server_port} -t ${cfg.streamSampleSeconds} -ar 16000 -ac 1 -b:a 48k "${filePath}" -loglevel error`, { timeout: (cfg.streamSampleSeconds + 30) * 1000 }, (e) => (e ? reject(e) : resolve()))
    })
    const endedAt = new Date()
    // 在场并集: 与采样时间窗有交集的合奏会话(精确数学并集, 一条SQL)
    const present = await pool.query(
      `SELECT DISTINCT ms.user_id FROM musician_sessions ms JOIN users u ON u.id = ms.user_id
       WHERE ms.room_id = $1 AND u.is_system = FALSE
         AND ms.started_at <= $2 AND (ms.ended_at IS NULL OR ms.ended_at >= $3)`,
      [room.id, endedAt, startedAt]
    )
    const presentIds = present.rows.map((x) => x.user_id)
    const ins = await pool.query(
      `INSERT INTO stream_samples (room_id, room_code, present_user_ids, file_path) VALUES ($1,$2,$3,$4) RETURNING id`,
      [room.id, room.room_code || '', JSON.stringify(presentIds), filePath]
    )
    sampleId = ins.rows[0].id
    const text = await streamTranscribe('http://123.57.33.130/stream-samples/' + filePath.split('/').pop(), keys)
    let verdict = 'pass', hits = []
    if (text) { const r = moderateText(text); verdict = r.verdict; hits = r.hits }
    await pool.query('UPDATE stream_samples SET verdict=$2, transcript=$3 WHERE id=$1', [sampleId, verdict, String(text).slice(0, 400)])
    if (verdict === 'reject') {
      await handleStreamViolation(room, sampleId, presentIds, text, hits)
    } else if (verdict === 'suspect') {
      try {
        await pool.query(`INSERT INTO moderation_logs (kind, target_id, user_id, nickname, content, verdict, hits, channel) VALUES ('stream_audio',$1,NULL,'',$2,'suspect',$3,'room')`,
          [String(sampleId), `[房间${room.name}]音频转写:${String(text).slice(0, 150)}`, JSON.stringify(hits)])
      } catch (e) {}
      console.log(`[stream-sample] 房间${room.id}「${room.name}」抽检疑似——留痕不弹窗`)
    } else {
      console.log(`[stream-sample] 房间${room.id}「${room.name}」抽检通过`)
    }
  } catch (e) {
    // 1025 欢哥定稿: 失败也留痕——既挡住调度对僵尸房的每分钟重试, 采样页也可见失败率(机制健康度)
    // ffmpeg败(404/超时)=删半件+插failed空行; ASR败=行已在, 改verdict(音频保留可试听)
    try {
      if (sampleId === null) {
        if (filePath) { try { fs.unlinkSync(filePath) } catch (e2) {} }
        await pool.query(`INSERT INTO stream_samples (room_id, room_code, present_user_ids, verdict) VALUES ($1,$2,'[]','failed')`, [room.id, room.room_code || ''])
      } else {
        await pool.query(`UPDATE stream_samples SET verdict='failed' WHERE id=$1`, [sampleId])
      }
    } catch (e2) {}
    console.error(`[stream-sample] 房间${room.id}采样失败(已留痕failed, 间隔后自动重试):`, e.message)
  } finally {
    streamSamplingNow.delete(room.id)
  }
}

// 调度: 每60s扫一次——活跃房(有在席乐手会话)距上次采样≥间隔即采; 每房独立错峰(自然由各自上次采样时刻决定)
async function streamSampleScheduler() {
  try {
    const cfg = await getModerationConfig()
    const r = await pool.query(
      `SELECT DISTINCT r.id, r.room_code, r.name, r.server_port FROM rooms r
       JOIN musician_sessions ms ON ms.room_id = r.id AND ms.ended_at IS NULL
       WHERE r.status NOT IN ('closed','archived')
         AND NOT EXISTS (SELECT 1 FROM stream_samples s WHERE s.room_id = r.id AND s.created_at > NOW() - ($1 * INTERVAL '1 minute'))`,
      [cfg.streamSampleIntervalMin]
    )
    for (const room of r.rows) sampleRoomStream(room).catch(() => {})
  } catch (e) { /* 下轮再试 */ }
}
setInterval(streamSampleScheduler, 60 * 1000).unref()
setTimeout(streamSampleScheduler, 90 * 1000) // 启动90s首扫(避开启动高峰)

// ===== 流量统计(1024 基建): 每小时重算当日并UPSERT(幂等——重复跑不重复计数) =====
// 口径: site_pv=官网日志当日非304 GET行数(请求量近似PV); download_hits=主站日志当日 /downloads/ 200请求
// 历史由轮转前的历次UPSERT固化入库, 当日数据以最后一次重算为准
async function recountTrafficStats() {
  try {
    // ⚠️日期须用服务器本地时区(Asia/Shanghai, 与nginx日志+0800一致); 日志行日期格式=25/Oct/2026
    const now = new Date()
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const logDate = `${String(now.getDate()).padStart(2, '0')}/${MON[now.getMonth()]}/${now.getFullYear()}`
    const dayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let sitePv = 0
    try {
      const log = await fs.promises.readFile('/var/log/nginx/site.log', 'utf8')  // 1029 异步化：日志天天变大,同步读=每小时定时抖
      for (const line of log.split('\n')) {
        if (line.includes(logDate) && /"GET /.test(line) && !/ 304 /.test(line)) sitePv++
      }
    } catch (e) { /* 文件不存在=0 */ }
    let dlHits = 0
    try {
      const log = await fs.promises.readFile('/var/log/nginx/app.log', 'utf8')  // 1029 异步化（同上）
      for (const line of log.split('\n')) {
        if (line.includes(logDate) && line.includes('/downloads/') && /"GET /.test(line) && / 200 /.test(line)) dlHits++
      }
    } catch (e) { /* 文件不存在=0 */ }
    await pool.query(
      `INSERT INTO site_stats (day, site_pv, download_hits, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (day) DO UPDATE SET site_pv=$2, download_hits=$3, updated_at=NOW()`,
      [dayIso, sitePv, dlHits]
    )
    console.log(`[stats] 当日重算(${dayIso}): 官网PV=${sitePv} 下载=${dlHits}`)
  } catch (e) { console.error('[stats] 统计失败:', e.message) }
}
setInterval(recountTrafficStats, 60 * 60 * 1000).unref()
setTimeout(recountTrafficStats, 3 * 60 * 1000) // 启动3分钟首算

// 手动触发统计(运维/E2E)
app.post('/api/admin-internal/stats/recount', requireAdminInternal, async (req, res) => {
  await recountTrafficStats()
  res.json({ ok: true })
})

// 手动触发采样(运维/E2E; 正常调度自动跑)
app.post('/api/admin-internal/rooms/:id/stream-sample', requireAdminInternal, async (req, res) => {
  const r = await pool.query("SELECT id, room_code, name, server_port FROM rooms WHERE id=$1 AND status NOT IN ('closed','archived')", [parseInt(req.params.id)])
  if (!r.rows[0]) return res.status(404).json({ ok: false, msg: '房间不存在' })
  sampleRoomStream(r.rows[0]).catch(() => {})
  res.json({ ok: true, msg: '采样任务已启动' })
})

// 模拟命中(运维演练/E2E——走完整命中链: 弹窗/计数/在场统计/熔断)
app.post('/api/admin-internal/rooms/:id/stream-violation-test', requireAdminInternal, async (req, res) => {
  const r = await pool.query("SELECT id, room_code, name FROM rooms WHERE id=$1 AND status NOT IN ('closed','archived')", [parseInt(req.params.id)])
  if (!r.rows[0]) return res.status(404).json({ ok: false, msg: '房间不存在' })
  const present = await pool.query(
    `SELECT DISTINCT ms.user_id FROM musician_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.room_id=$1 AND u.is_system=FALSE AND ms.ended_at IS NULL`, [r.rows[0].id])
  handleStreamViolation(r.rows[0], 0, present.rows.map((x) => x.user_id), '(运维演练模拟转写)', []).catch(() => {})
  res.json({ ok: true, msg: '模拟命中已触发' })
})

// jamony: 采样音频留存策略(1025 欢哥定稿) — pass/pending/failed 7天、违规180天(与聊天保全同法规基线), 行永存(转写+违房在场名单随时可回溯)
async function cleanupStreamSamples() {
  try {
    const r = await pool.query(
      `SELECT id, file_path FROM stream_samples
       WHERE file_path <> ''
         AND ( (verdict IN ('pass','pending','failed') AND created_at < NOW() - INTERVAL '7 days')
            OR (verdict IN ('reject','suspect') AND created_at < NOW() - INTERVAL '180 days') )`)
    for (const row of r.rows) {
      try { fs.unlinkSync(row.file_path) } catch (e) {}
      await pool.query("UPDATE stream_samples SET file_path='' WHERE id=$1", [row.id])
    }
    if (r.rowCount > 0) console.log(`[stream-sample] 留存清理: 删${r.rowCount}个过期音频文件(行保留)`)
  } catch (e) { console.error('[stream-sample] 留存清理失败:', e.message) }
}
setTimeout(cleanupStreamSamples, 90 * 1000).unref() // 启动90秒首清(冷启动不抢跑)
setInterval(cleanupStreamSamples, 6 * 3600 * 1000).unref()

// jamony: 聊天记录证据保全 — 每 6 小时清理 180 天前的记录
async function cleanupOldChatMessages() {
  try {
    const r = await pool.query("DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '180 days'")
    if (r.rowCount > 0) console.log(`Chat cleanup: deleted ${r.rowCount} messages older than 180 days`)
  } catch (e) { console.error('Chat cleanup error:', e.message) }
}
cleanupOldChatMessages()
setInterval(cleanupOldChatMessages, 6 * 3600 * 1000)

// 乐手会话僵尸清扫：5 分钟无心跳即闭（时长冻结在 last_seen；钩子漏网+崩溃进程的兜底）
async function closeZombieMusicianSessions() {
  try {
    const r = await pool.query("UPDATE musician_sessions SET ended_at = last_seen WHERE ended_at IS NULL AND last_seen < NOW() - INTERVAL '5 minutes'")
    if (r.rowCount > 0) console.log(`Zombie sessions: closed ${r.rowCount}`)
  } catch (e) { console.error('Zombie sessions error:', e.message) }
}
closeZombieMusicianSessions()  // 启动时立即跑一次（pm2 重启后清上次崩溃残留）
setInterval(closeZombieMusicianSessions, 5 * 60000)

// 录音超时兜底：pm2 重启会丢掉到点自动停的内存定时器，这里每 5 分钟扫一遍
// recording_active=TRUE 且 started_at 超 5min 的房间，补一刀自动停（与手动停同一流程）
async function enforceRecordingMaxDuration() {
  try {
    const stale = await pool.query(
      "SELECT id, room_code FROM rooms WHERE recording_active=TRUE AND recording_started_at < NOW() - ($1 * interval '1 second')",
      [RECORDING_MAX_SECONDS]
    )
    for (const r of stale.rows) {
      console.log(`Recording over max (sweeper fallback), auto-stop room ${r.room_code}`)
      await stopRoomRecording(String(r.room_code).trim(), r.id, undefined)
    }
  } catch (e) { console.error('enforceRecordingMaxDuration error:', e.message) }
}
setInterval(enforceRecordingMaxDuration, 5 * 60000)

// 乐手会话日清：7 天前明细聚合进 users.musician_seconds_archive 后删（单条 CTE 隐式事务，崩溃不会双计，幂等可重跑）
async function archiveOldMusicianSessions() {
  try {
    const r = await pool.query(
      `WITH del AS (
         DELETE FROM musician_sessions WHERE started_at < NOW() - INTERVAL '7 days'
         RETURNING user_id, EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen) - started_at))::bigint AS secs
       ), agg AS (SELECT user_id, SUM(secs) AS total FROM del GROUP BY user_id)
       UPDATE users u SET musician_seconds_archive = u.musician_seconds_archive + agg.total
       FROM agg WHERE u.id = agg.user_id`
    )
    if (r.rowCount > 0) console.log(`Sessions archive: updated ${r.rowCount} users`)
  } catch (e) { console.error('Sessions archive error:', e.message) }
}
archiveOldMusicianSessions()  // 启动时立即跑一次
setInterval(archiveOldMusicianSessions, 24 * 3600000)

// ========== 后台运营内部通道（1022）：jamony-admin 应急解散房间 ==========
// 鉴权三层：共享密钥恒时比较 + 请求方必须本机 + 拒绝经 nginx 穿透进来的外部请求
// （X-Real-IP 是 nginx 反代时才注入的头——admin 后端直连 3001 不带它）
function requireAdminInternal(req, res, next) {
  const key = process.env.ADMIN_INTERNAL_KEY
  if (!key) return res.status(503).json({ ok: false, msg: '内部通道未配置' })
  const rip = req.headers['x-real-ip']
  if (rip && rip !== '127.0.0.1') return res.status(403).json({ ok: false, msg: 'forbidden' })
  if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
    return res.status(403).json({ ok: false, msg: 'forbidden' })
  }
  const given = Buffer.from(String(req.headers['x-admin-key'] || ''))
  const expect = Buffer.from(key)
  if (given.length !== expect.length || !crypto.timingSafeEqual(given, expect)) {
    return res.status(403).json({ ok: false, msg: 'forbidden' })
  }
  next()
}

// 应急解散（与 removeMemberAndCheckDissolve 的清理链同款，逐字复用）
// 区别：不依赖"成员逐个离开才触发"——后台对整个房间直接执行杀进程+清物料+广播+清表
async function forceDissolveRoom(roomId, actor) {
  const roomInfo = await pool.query(
    'SELECT id, name, room_code, server_port, status FROM rooms WHERE id = $1', [roomId]
  )
  const room = roomInfo.rows[0]
  if (!room) return { ok: false, msg: '房间不存在' }
  if (room.status === 'closed' || room.status === 'archived') {
    return { ok: false, msg: '房间已是终态(' + room.status + ')，无需解散' }
  }
  const closePort = room.server_port
  const roomCode = String(room.room_code).trim()
  const members = await pool.query('SELECT user_id FROM room_members WHERE room_id = $1', [roomId])
  if (closePort) await cleanupRoomResources(closePort, roomCode)  // 1029：级联抽公共异步体
  io.to(roomCode).emit('room-dissolved', { roomCode })
  await closeRoomMusicianSessions(roomId)
  await closeAllRoomVisits(roomId) // 1025: 解散统一闭访问账(同主解散管线)
  // 1025 欢哥定稿: 归档+终局快照在删成员前(同主解散管线)
  await pool.query(`UPDATE rooms SET status='archived', closed_at=NOW(),
    members_snapshot = (SELECT jsonb_build_object(
      'final', (SELECT COALESCE(jsonb_agg(jsonb_build_object('uid', user_id, 'nick', nickname, 'role', role)), '[]'::jsonb) FROM room_members WHERE room_id = $1),
      'musicians', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('uid', u.id, 'nick', u.nickname)), '[]'::jsonb) FROM musician_sessions ms JOIN users u ON u.id = ms.user_id WHERE ms.room_id = $1)
    )) WHERE id=$1`, [roomId])
  await pool.query('DELETE FROM room_members WHERE room_id = $1', [roomId])
  const archived = true
  console.log(`[admin-internal] force dissolve 「${room.name}」(${roomCode}) by ${actor}: 清出${members.rows.length}人`)
  emitRoomsChanged('dissolve:' + roomCode)  // 1030 大厅实时化
  return { ok: true, removed: members.rows.length, archived }
}

app.post('/api/admin-internal/rooms/:id/dissolve', requireAdminInternal, async (req, res) => {
  try {
    const r = await forceDissolveRoom(parseInt(req.params.id), String(req.headers['x-admin-actor'] || 'admin-panel').slice(0, 40))
    res.status(r.ok ? 200 : 409).json(r)
  } catch (err) {
    console.error('admin-internal dissolve error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 内容下架/恢复（1022 后台运营通道）：works/notices 状态位翻转
// taken_down=运营下架（区别于用户自删 deleted）；产品端列表/详情全是白名单过滤
// （works=published / notices=active），taken_down 自动不可见——产品查询零改动
// 守卫：只在 published⇄taken_down 之间翻转，绝不复活用户自删的 deleted 内容
async function setTakedownStatus(kind, id, action) {
  const table = kind === 'works' ? 'works' : 'notices'
  const liveStatus = kind === 'works' ? 'published' : 'active'
  const noun = kind === 'works' ? '作品' : '公告'
  if (action === 'take_down') {
    const r = await pool.query(
      `UPDATE ${table} SET status='taken_down' WHERE id=$1 AND status='${liveStatus}' RETURNING id`,
      [id]
    )
    if (r.rows.length === 0) return { ok: false, msg: '内容不存在或当前状态不可下架' }
    // 1024 欢哥: 人工下架不再静默——用户必须知情+有救济通道(纯内容下架无处罚态, 申诉tab不开放, 指路意见反馈)
    notifyContentOwner(kind, id, `您的${noun}已被下架。如有异议，请通过左侧「意见反馈」联系我们，我们会尽快处理。`)
    return { ok: true }
  }
  if (action === 'restore') {
    const r = await pool.query(
      `UPDATE ${table} SET status='${liveStatus}' WHERE id=$1 AND status='taken_down' RETURNING id`,
      [id]
    )
    if (r.rows.length === 0) return { ok: false, msg: '内容不存在或未被下架' }
    notifyContentOwner(kind, id, `您的${noun}已恢复展示。`)
    return { ok: true }
  }
  return { ok: false, msg: '未知操作' }
}

async function notifyContentOwner(kind, id, message) {
  try {
    const q = kind === 'works'
      ? 'SELECT publisher_user_id AS uid FROM works WHERE id=$1'
      : 'SELECT user_id AS uid FROM notices WHERE id=$1'
    const r = await pool.query(q, [id])
    if (r.rows[0] && r.rows[0].uid) {
      await createNotification({ recipientId: r.rows[0].uid, type: 'restriction', message })
    }
  } catch (e) { console.error('[moderation] 下架通知发送失败:', e.message) }
}

app.post('/api/admin-internal/works/:id/status', requireAdminInternal, async (req, res) => {
  try {
    const r = await setTakedownStatus('works', parseInt(req.params.id), req.body?.action)
    res.status(r.ok ? 200 : 409).json(r)
  } catch (err) {
    console.error('admin-internal works status error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

app.post('/api/admin-internal/notices/:id/status', requireAdminInternal, async (req, res) => {
  try {
    const r = await setTakedownStatus('notices', parseInt(req.params.id), req.body?.action)
    res.status(r.ok ? 200 : 409).json(r)
  } catch (err) {
    console.error('admin-internal notices status error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 申诉处理 + 用户处置（1024 七件套⑤⑥ + 四档处置③④按钮） ==========
// 语义约定: 通过=解除"当前 restricted"(自动处罚); 若已升为 demoted/banned(人工更重处罚), 旧申诉通过不翻案人工决定

// 申诉处理: approve=解除限制+appeal_result回执 / reject=填理由+回执; 仅 pending 可处理(防二次)
app.post('/api/admin-internal/appeals/:id/resolve', requireAdminInternal, async (req, res) => {
  const appealId = parseInt(req.params.id)
  const action = req.body?.action
  const rejectReason = String(req.body?.reject_reason || '').trim().slice(0, 500)
  const actor = req.headers['x-admin-actor'] || 'admin'
  if (!Number.isInteger(appealId) || (action !== 'approve' && action !== 'reject')) {
    return res.status(400).json({ ok: false, msg: '参数不合法' })
  }
  if (action === 'reject' && !rejectReason) {
    return res.status(400).json({ ok: false, msg: '驳回必须填理由' })
  }
  try {
    const ap = await pool.query('SELECT id, user_id, status FROM appeals WHERE id=$1', [appealId])
    if (!ap.rows[0]) return res.status(404).json({ ok: false, msg: '申诉不存在' })
    if (ap.rows[0].status !== 'pending') return res.status(409).json({ ok: false, msg: '该申诉已处理过' })
    const userId = ap.rows[0].user_id
    if (action === 'approve') {
      await pool.query(`UPDATE appeals SET status='approved', handled_at=NOW() WHERE id=$1`, [appealId])
      // 只解除自动处罚态(restricted); demoted/banned 是人工更重决定, 不被旧申诉翻案
      const rel = await pool.query(
        `UPDATE users SET restriction='normal', restricted_until=NULL, restricted_at=NULL
         WHERE id=$1 AND restriction='restricted' RETURNING id`,
        [userId]
      )
      if (rel.rows[0]) restrictionCache.set(userId, { v: 'normal', at: Date.now() })
      await createNotification({ recipientId: userId, type: 'appeal_result', message: '您的申诉已通过，相关限制已解除，刷新页面即时生效。请您继续遵守jamony的行为规范。' })
    } else {
      await pool.query(`UPDATE appeals SET status='rejected', reject_reason=$2, handled_at=NOW() WHERE id=$1`, [appealId, rejectReason])
      await createNotification({ recipientId: userId, type: 'appeal_result', message: `您的申诉未通过。理由：${rejectReason}。请您注意在jamony的行为规范。` })
    }
    console.log(`[admin-internal] 申诉#${appealId} ${action === 'approve' ? '通过' : '驳回'} by ${actor}${action === 'reject' ? ` 理由:${rejectReason}` : ''}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('admin-internal appeal resolve error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 作品音频手动补审(1024 音频线): ASR故障滞留/运维排查用, 与发布链同函数幂等
app.post('/api/admin-internal/works/:id/review-audio', requireAdminInternal, async (req, res) => {
  const workId = parseInt(req.params.id)
  if (!Number.isInteger(workId)) return res.status(400).json({ ok: false, msg: '参数不合法' })
  const w = await pool.query('SELECT audio_review, mp3_path FROM works WHERE id=$1', [workId])
  if (!w.rows[0] || !w.rows[0].mp3_path) return res.status(404).json({ ok: false, msg: '作品不存在或无音频' })
  submitWorkAudioReview(workId).catch(() => {})
  res.json({ ok: true, msg: '补审任务已提交' })
})

// 封号即时生效的用户侧收口(1024 BANNED识别): 断该用户全部在线socket并通知——
// 壳内链: web收force-banned→杀jamsoul子进程(UDP直连不经api, 封号后必须由客户端侧断)+跳拦截页
function kickUserSockets(userId) {
  try {
    for (const [, s] of io.sockets.sockets) {
      if (s.userId === userId) {
        try { s.emit('force-banned', { msg: '该账号已被封禁' }) } catch (e) {}
        setTimeout(() => { try { s.disconnect(true) } catch (e) {} }, 300)
      }
    }
  } catch (e) { console.error('[moderation] 踢socket失败:', e.message) }
}

// 用户处置: demote(③降级)/ban(④封号)/release(解除, 从任何处罚态回 normal)
app.post('/api/admin-internal/users/:id/restriction', requireAdminInternal, async (req, res) => {
  const userId = parseInt(req.params.id)
  const action = req.body?.action
  const reason = String(req.body?.reason || '').trim().slice(0, 500)
  const actor = req.headers['x-admin-actor'] || 'admin'
  if (!Number.isInteger(userId) || !['demote', 'ban', 'release'].includes(action)) {
    return res.status(400).json({ ok: false, msg: '参数不合法' })
  }
  try {
    const u = await pool.query('SELECT id, nickname, restriction FROM users WHERE id=$1', [userId])
    if (!u.rows[0]) return res.status(404).json({ ok: false, msg: '用户不存在' })
    const cur = u.rows[0].restriction
    let resetRounds = false // release 分支内赋值(重置自动轮次); 提升作用域——尾部日志/响应要引用, 块内 const 会 ReferenceError(1024 E2E 抓获)
    const cfg = await getModerationConfig()
    if (action === 'demote') {
      if (cur === 'demoted') return res.status(409).json({ ok: false, msg: '该用户已是降级状态' })
      // 1024 欢哥定稿: 触发纪律默认7天自动解除(定时), 可选7/15/30/无期限——操作者不用记着回来解封(原默认15, 同日改7)
      let days = req.body?.days
      if (days === undefined) days = 7
      if (days !== null) {
        days = parseInt(days)
        if (!(days >= 1 && days <= 365)) return res.status(400).json({ ok: false, msg: '期限不合法' })
      }
      const r = await applyDemoteEscalation(userId, days, cfg, actor, false)
      if (r.autoBanned) return res.json({ ok: true, auto_banned: true, auto_ban_rounds: r.rounds, restricted_until: r.restrictedUntil })
      return res.json({ ok: true, demoted_count: r.demotedCount, restricted_until: r.restrictedUntil })
    } else if (action === 'ban') {
      if (cur === 'banned') return res.status(409).json({ ok: false, msg: '该用户已被封禁' })
      // 1024 欢哥定稿: 封号对齐降级全套机制——触发纪律默认7天定时自动解封, 无期限留给罪大恶极; banned_count 惯犯计数
      let days = req.body?.days
      if (days === undefined) days = 7
      if (days !== null) {
        days = parseInt(days)
        if (!(days >= 1 && days <= 365)) return res.status(400).json({ ok: false, msg: '期限不合法' })
      }
      const upd = await pool.query(
        `UPDATE users SET restriction='banned', restricted_until=${days ? `NOW() + ($2 || ' days')::interval` : 'NULL'}, restricted_at=NOW(), banned_count=banned_count+1
         WHERE id=$1 RETURNING restricted_until, banned_count`,
        days ? [userId, String(days)] : [userId]
      )
      restrictionCache.set(userId, { v: 'banned', at: Date.now() })
      kickUserSockets(userId) // 1024 BANNED识别: 断在线连接, 客户端杀jamsoul+跳拦截页
      const until = upd.rows[0].restricted_until ? new Date(upd.rows[0].restricted_until) : null
      const dateStr = until ? `${until.getMonth() + 1}月${until.getDate()}日` : ''
      // 封号用户进不了个人主页, 申诉只在 /banned 拦截页——文案指向"仍可提交申诉"而非"前往个人主页"
      const banTail = until
        ? `，将于${dateStr}自动解封。您仍可提交申诉（处罚生效后${cfg.appealDays}天内有效）`
        : `。此处罚不会自动解除，您仍可提交申诉（处罚生效后${cfg.appealDays}天内有效）`
      await createNotification({ recipientId: userId, type: 'restriction', message: `该账号已被封禁，合奏、发布与社交功能均已冻结${banTail}。${reason ? `原因：${reason}。` : ''}请您注意在jamony的行为规范。` })
      return res.json({ ok: true, banned_count: upd.rows[0].banned_count, restricted_until: upd.rows[0].restricted_until })
    } else { // release
      if (cur === 'normal') return res.status(409).json({ ok: false, msg: '该用户当前无处罚' })
      // 1024 欢哥: 重置自动处罚轮次——确认系统性误判循环(反复永封+翻案)时用, 词库质量信号; 常规解除不动轮次
      resetRounds = req.body?.reset_rounds === true
      await pool.query(
        `UPDATE users SET restriction='normal', restricted_until=NULL, restricted_at=NULL${resetRounds ? ', demote_cycle_count=0, auto_ban_rounds=0' : ''} WHERE id=$1`,
        [userId]
      )
      restrictionCache.set(userId, { v: 'normal', at: Date.now() })
      // 顺手清账(1024): 解除时在审申诉视为已通过(诉求已达成), 工作台不残留死单; 有清账时只发一条回执避免重复通知
      const stale = await pool.query(
        `UPDATE appeals SET status='approved', handled_at=NOW() WHERE user_id=$1 AND status='pending' RETURNING id`,
        [userId]
      )
      await createNotification({ recipientId: userId, type: 'appeal_result', message: stale.rows.length > 0
        ? '您的申诉已通过，相关限制已解除，刷新页面即时生效。请您继续遵守jamony的行为规范。'
        : '您的账号限制已被解除，刷新页面即时生效。请您继续遵守jamony的行为规范。' })
    }
    console.log(`[admin-internal] 用户${userId}(${u.rows[0].nickname}) ${action} by ${actor}${reason ? ` 理由:${reason}` : ''}${resetRounds ? ' [重置自动轮次]' : ''} (原状态:${cur})`)
    res.json({ ok: true, reset_rounds: resetRounds })
  } catch (err) {
    console.error('admin-internal user restriction error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('jamony API running on http://127.0.0.1:' + PORT)
  console.log('Socket.IO ready')
})
