const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const http = require("http")
const { Server } = require("socket.io")
const { execSync, spawn } = require('child_process')
const { Pool } = require('pg')
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

function verifyPassword(password, hashStr) {
  const parts = hashStr.split(':')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false
  const digest = parts[1]
  const iterations = parseInt(parts[2])
  const salt = parts[3]
  const storedHash = Buffer.from(parts[4], 'base64')
  const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, storedHash.length, digest)
  return crypto.timingSafeEqual(derivedKey, storedHash)
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const iterations = 600000
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  return `pbkdf2:sha256:${iterations}:${salt}:${key.toString('base64')}`
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
function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) return res.status(401).json({ ok: false, msg: '未登录' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.id
    req.nickname = decoded.nickname
    const remaining = decoded.exp * 1000 - Date.now()
    if (remaining < 24 * 3600 * 1000) {
      const newToken = jwt.sign({ id: decoded.id, nickname: decoded.nickname }, JWT_SECRET, { expiresIn: '7d' })
      res.cookie(COOKIE_NAME, newToken, { httpOnly: true, maxAge: TOKEN_MAX_AGE, sameSite: 'lax' })
    }
    next()
  } catch (e) {
    return res.status(401).json({ ok: false, msg: '登录已过期' })
  }
}

// 可选鉴权：解析 cookie JWT → req.userId；未登录/失败不拦截（req.userId=null），保持端点公开
function optionalAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME]
  if (!token) { req.userId = null; req.nickname = null; return next() }
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.id
    req.nickname = decoded.nickname
  } catch (e) {
    req.userId = null
    req.nickname = null
  }
  next()
}

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
    if (!verifyPassword(password, user.password_hash)) {
      recordLoginFail(nickname)
      return res.status(401).json({ ok: false, msg: '用户名或密码错误' })
    }

    clearLoginFail(nickname)
    const userPayload = {
      id: user.id,
      nickname: user.nickname,
      avatarIndex: user.avatar_index,
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
    if (password.length < 6) {
      return res.status(400).json({ ok: false, msg: '密码至少 6 位' })
    }

    // 查重
    const exist = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname])
    if (exist.rows.length > 0) {
      return res.status(409).json({ ok: false, msg: '该昵称已被注册' })
    }

    const hash = hashPassword(password)
    const avatar = Math.floor(Math.random() * 30) + 1

    const cat = instrumentCategory || primaryInstrument
    const result = await pool.query(
      `INSERT INTO users (nickname, password_hash, primary_instrument, instrument_category, avatar_index, bio, city, level, points)
       VALUES ($1, $2, $3, $5, $4, '', '', 1, 0)
       RETURNING id, nickname, avatar_index, bio, city, primary_instrument, instrument_category, level, points`,
      [nickname, hash, primaryInstrument, avatar, cat]
    )

    const user = result.rows[0]
    const userPayload = {
      id: user.id,
      nickname: user.nickname,
      avatarIndex: user.avatar_index,
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

// ========== 当前登录态（前端刷新恢复用）==========
app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nickname, avatar_index, avatar_url, bio, signature, styles, city, primary_instrument, instrument_category, secondary_instrument, level, points FROM users WHERE id=$1',
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
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following
       FROM users u WHERE u.id = $1`, [id, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    const userRow = result.rows[0]
    if (userRow.avatar_url) userRow.avatar_url = userRow.avatar_url.replace('/var/jamony/avatars', '/avatars')
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
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND followee_id = u.id) AS is_following
       FROM users u WHERE u.nickname = $1`, [nickname, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    const userRow = result.rows[0]
    if (userRow.avatar_url) userRow.avatar_url = userRow.avatar_url.replace('/var/jamony/avatars', '/avatars')
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
    const result = await pool.query(
      `SELECT id, nickname, bio, city, primary_instrument, instrument_category, avatar_index, avatar_url,
              level, points, works_count, total_likes
       FROM users ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset]
    )
    const count = await pool.query('SELECT COUNT(*) FROM users')
    res.json({
      ok: true,
      users: result.rows.map(r => { if (r.avatar_url) r.avatar_url = r.avatar_url.replace('/var/jamony/avatars', '/avatars'); return r }),
      total: parseInt(count.rows[0].count),
      page,
      totalPages: Math.ceil(parseInt(count.rows[0].count) / limit),
    })
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
    const { nickname, bio, signature, city, primaryInstrument, instrumentCategory, styles, avatarIndex, email } = req.body

    const sets = []
    const params = []
    let idx = 1

    if (nickname !== undefined) { sets.push(`nickname = $${idx++}`); params.push(nickname) }
    if (bio !== undefined) { sets.push(`bio = $${idx++}`); params.push(bio) }
    if (signature !== undefined) { sets.push(`signature = $${idx++}`); params.push(signature) }
    if (city !== undefined) { sets.push(`city = $${idx++}`); params.push(city) }
    if (primaryInstrument !== undefined) { sets.push(`primary_instrument = $${idx++}`); params.push(primaryInstrument) }
    if (instrumentCategory !== undefined) { sets.push(`instrument_category = $${idx++}`); params.push(instrumentCategory) }
    if (avatarIndex !== undefined) { sets.push(`avatar_index = $${idx++}`); params.push(avatarIndex) }
    if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email) }
    if (styles !== undefined) {
      sets.push(`styles = $${idx++}`)
      params.push('{' + styles.join(',') + '}')
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, msg: '没有要更新的字段' })
    }

    sets.push(`updated_at = NOW()`)
    params.push(id)
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, nickname, avatar_index, avatar_url, bio, signature, city, primary_instrument, instrument_category, secondary_instrument, level, points`,
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
        city: u.city || '',
        primaryInstrument: u.primary_instrument,
        instrumentCategory: u.instrument_category || '',
        secondaryInstrument: u.secondary_instrument || '',
        level: u.level,
        points: u.points,
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
      return res.status(400).json({ ok: false, msg: '新密码至少 6 位' })
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    const user = result.rows[0]
    if (!verifyPassword(oldPassword, user.password_hash)) {
      return res.status(401).json({ ok: false, msg: '旧密码错误' })
    }

    const hash = hashPassword(newPassword)
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
    await pool.query(
      'INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.userId, targetId]
    )
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
    await pool.query('UPDATE users SET avatar_url=$1 WHERE id=$2', [newPath, req.userId])
    res.json({ ok: true, avatarUrl: newPath.replace('/var/jamony/avatars', '/avatars') })
  } catch (err) {
    console.error('Avatar upload error:', err)
    res.status(500).json({ ok: false, msg: '头像上传失败' })
  }
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

// 创建房间
app.post('/api/rooms', requireAuth, async (req, res) => {
  try {
    const { name, description, style, maxMusicians } = req.body
    const hostId = req.userId
    if (!name) {
      return res.status(400).json({ ok: false, msg: '请填写房间名' })
    }

    // 查用户
    const userResult = await pool.query('SELECT nickname FROM users WHERE id = $1', [hostId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }

    const port = await getAvailablePort()
    const musicianLimit = Math.min(maxMusicians || 6, 8)

    const result = await pool.query(
      `INSERT INTO rooms (name, description, style, host_id, max_musicians, server_port)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, description || '', style || '', hostId, musicianLimit, port]
    )

    const room = result.rows[0]

    // 房主自动成为第一个成员（合奏者）
    await pool.query(
      `INSERT INTO room_members (room_id, user_id, nickname, role)
       VALUES ($1, $2, $3, 'musician')`,
      [room.id, hostId, userResult.rows[0].nickname]
    )

    try {
      execSync(`node /var/www/jamony/api/manage-jamulus.js start ${port} ${musicianLimit + 1}`, { timeout: 5000, stdio: 'pipe' }); try { spawn('node', ['/var/www/jamony/api/manage-jamulus.js', 'start-ghost', String(port), String(port)], { stdio: 'ignore', detached: true }).unref() } catch(e) { console.error('Ghost start failed:', e.message) }
    } catch (e) {
      console.error('Failed to start jamulus:', e.stderr?.toString() || e.message)
    }

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
    res.json({ ok: true, rooms: result.rows })
  } catch (err) {
    console.error('Rooms list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 房间详情
app.get('/api/rooms/:id', async (req, res) => {
  try {
    const { id } = req.params
    const roomResult = await pool.query(
      `SELECT r.*, u.nickname AS host_name, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS host_avatar_url,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'musician') AS musician_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'listener') AS listener_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS total_members
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE r.id = $1 AND r.status NOT IN ('closed', 'archived')`,
      [id]
    )
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '房间不存在' })
    }

    const members = await pool.query(
      `SELECT rm.*, u.primary_instrument, u.instrument_category, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 ORDER BY rm.joined_at`,
      [id]
    )

    res.json({ ok: true, room: roomResult.rows[0], members: members.rows })
  } catch (err) {
    console.error('Room detail error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 广播房间成员列表（身份/音频状态变化时调用，让房间内所有人实时同步右栏成员显示）
async function broadcastMembers(roomId) {
  try {
    const result = await pool.query(
      `SELECT rm.*, u.primary_instrument, u.instrument_category, REPLACE(u.avatar_url, '/var/jamony/avatars', '/avatars') AS avatar_url
       FROM room_members rm JOIN users u ON u.id = rm.user_id
       WHERE rm.room_id = $1 ORDER BY rm.joined_at`,
      [roomId]
    )
    io.to(roomId).emit('members-update', { members: result.rows })
  } catch (e) {
    console.error('Broadcast members error:', e)
  }
}


// JSON-RPC 调用 jamulus headless（原始 TCP，一发一收）
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
      client.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'jamulus/apiAuth', params: { secret } }) + '\n');
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
function isDrumsRunning(roomPort) {
  try {
    const pidStr = execSync('cat /tmp/jamony-drums-' + roomPort + '.pid 2>/dev/null', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
    if (pidStr) {
      const pid = parseInt(pidStr)
      try { process.kill(pid, 0); return true } catch { return false }
    }
    return false
  } catch { return false }
}

// 计算单个 session 的汇总状态：全员 ①② 是否锁定、授权人数、发表人
async function summarizeSession(session, tracks) {
  const realTracks = tracks.filter(t => !t.is_system)
  const allLocked = realTracks.length > 0 && realTracks.every(t => t.use_locked && t.attribution_locked)
  const agreedCount = realTracks.filter(t => t.allow_use === true).length

  // 自动释放超过5分钟的发表锁
  if (session.publisher_user_id && session.claimed_at && session.status !== 'published') {
    const claimedAt = new Date(session.claimed_at)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    if (claimedAt < fiveMinAgo) {
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
  const sessions = await pool.query('SELECT * FROM recording_sessions WHERE room_id=$1 ORDER BY index', [roomId])
  const result = []
  for (const s of sessions.rows) {
    const tr = await pool.query('SELECT * FROM session_tracks WHERE session_id=$1 ORDER BY is_system, created_at', [s.id])
    result.push(await summarizeSession(s, tr.rows))
  }
  return result
}

// 广播房间录音 session 列表（创建/授权变化/超时默认时调用，全员实时同步）
async function broadcastSessions(roomId) {
  try {
    io.to(roomId).emit('sessions-update', { sessions: await getRoomSessions(roomId) })
  } catch (e) {
    console.error('Broadcast sessions error:', e)
  }
}

// 加入房间
app.post('/api/rooms/:id/join', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { role } = req.body
    const userId = req.userId

    const acceptedRole = role === 'musician' ? 'musician' : 'listener'

    // 查房间
    const roomResult = await pool.query("SELECT * FROM rooms WHERE id = $1 AND status NOT IN ('closed', 'archived')", [id])
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '房间不存在' })
    }
    const room = roomResult.rows[0]

    // 查用户
    const userResult = await pool.query('SELECT nickname FROM users WHERE id = $1', [userId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
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
      await pool.query(
        'UPDATE room_members SET role = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
        [acceptedRole, id, userId]
      )
      await broadcastMembers(id)
      return res.json({ ok: true, msg: '已更新身份', role: acceptedRole })
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

    await broadcastMembers(id)
    res.json({ ok: true, msg: '已加入房间', role: acceptedRole })
  } catch (err) {
    console.error('Room join error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 离开房间
app.post('/api/rooms/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId

    const memberResult = await pool.query(
      'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId]
    )
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '你不在这个房间' })
    }

    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])

    // 只看合奏者——没有合奏者则解散房间（听众自动踢出）
    const musicianCount = await pool.query(
      "SELECT COUNT(*) AS c FROM room_members WHERE room_id = $1 AND role = 'musician'", [id]
    )
    if (parseInt(musicianCount.rows[0].c) === 0) {
      const roomInfo = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [id])
      const closePort = roomInfo.rows[0]?.server_port
      if (closePort) {
        try { execSync(`node /var/www/jamony/api/manage-jamulus.js drums-stop ${closePort}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
        try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop ${closePort}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
        try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop-ghost ${closePort}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
        try { execSync(`rm -rf /var/jamony/recordings/room-${closePort}-records/`, { timeout: 5000, stdio: 'pipe' }) } catch {}
        // 杀掉 ffmpeg 推流进程
        try {
          const ghostState = JSON.parse(fs.readFileSync('/tmp/jamony-ghost.json', 'utf8').toString() || '{}')
          const entry = ghostState[String(closePort)]
          if (entry && entry.ffmpegPid) { try { process.kill(entry.ffmpegPid) } catch {} }
          delete ghostState[String(closePort)]
          fs.writeFileSync('/tmp/jamony-ghost.json', JSON.stringify(ghostState, null, 2))
        } catch (e) { /* ignore */ }
      }
      // 踢出所有剩余成员（听众）
      await pool.query('DELETE FROM room_members WHERE room_id = $1', [id])
      // 有作品 → archived，无作品 → 硬删
      const pubCount = await pool.query('SELECT COUNT(*) AS c FROM works WHERE room_id = $1', [id])
      if (parseInt(pubCount.rows[0].c) > 0) {
        await pool.query("UPDATE rooms SET status='archived' WHERE id=$1", [id])
      } else {
        await pool.query('DELETE FROM rooms WHERE id = $1', [id])
      }
      return res.json({ ok: true, msg: '已退出房间' })
    }

    // 房主离开，移交给在房间最久的合奏者
    const roomResult = await pool.query('SELECT host_id, server_port FROM rooms WHERE id = $1', [id])
    if (roomResult.rows.length === 0) {
      return res.json({ ok: true, msg: '房间已不存在' })
    }

    if (roomResult.rows[0].host_id === parseInt(userId)) {
      const newHost = await pool.query(
        "SELECT user_id FROM room_members WHERE room_id = $1 AND role = 'musician' ORDER BY joined_at LIMIT 1",
        [id]
      )
      if (newHost.rows.length > 0) {
        await pool.query('UPDATE rooms SET host_id = $1 WHERE id = $2', [newHost.rows[0].user_id, id])
      }
    }

    res.json({ ok: true, msg: '已退出房间' })
    await broadcastMembers(id)
  } catch (err) {
    console.error('Room leave error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 切换角色（合奏者 ↔ 听众）
app.post('/api/rooms/:id/switch-role', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { newRole } = req.body
    const userId = req.userId

    if (newRole === 'musician') {
      const roomResult = await pool.query('SELECT max_musicians FROM rooms WHERE id = $1', [id])
      const count = await pool.query(
        "SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [id]
      )
      if (parseInt(count.rows[0].count) >= roomResult.rows[0].max_musicians) {
        return res.status(400).json({ ok: false, msg: '合奏名额已满' })
      }
    }

    await pool.query(
      'UPDATE room_members SET role = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
      [newRole, id, userId]
    )

    await broadcastMembers(id)
    res.json({ ok: true, msg: '身份已切换' })
  } catch (err) {
    console.error('Role switch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 更新房间成员音频状态 ==========
app.post('/api/rooms/:roomId/members/:userId/audio-status', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.userId
    const { audioStatus } = req.body
    await pool.query(
      'UPDATE room_members SET audio_status = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
      [audioStatus || 'connected', roomId, userId]
    )
    await broadcastMembers(roomId)
    res.json({ ok: true })
  } catch (err) {
    console.error('Audio status error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 录音 session（录音 → 授权 → 发表 全链路） ==========
const RECORDING_COUNTDOWN_SECONDS = 60  // 倒计时秒数（测试用 60，后期改 600）

// 开始录音（合奏者触发，一房一录）
app.post('/api/rooms/:id/recording/start', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.userId
    const member = await pool.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [id, userId])
    if (member.rows.length === 0 || member.rows[0].role !== 'musician') {
      return res.status(403).json({ ok: false, msg: '仅合奏者可录音' })
    }
    const room = await pool.query('SELECT server_port, recording_active FROM rooms WHERE id=$1', [id])
    if (room.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (room.rows[0].recording_active) return res.json({ ok: false, msg: '已在录音中' })
    // JSON-RPC 通知 headless 开始录音
    try {
      await jsonRpcCall(room.rows[0].server_port, 'jamulusserver/startRecording')
    } catch (e) {
      return res.status(500).json({ ok: false, msg: 'headless 未就绪，无法录音' })
    }
    // 录音开始时捕获鼓机是否已在运行（覆盖录音前就开鼓机的场景）；
    // 录音中才开鼓机由 drums/start API 把标志置 true
    const drumsAlreadyRunning = isDrumsRunning(room.rows[0].server_port)
    await pool.query('UPDATE rooms SET recording_active=TRUE, drums_used_this_recording=$2 WHERE id=$1', [id, drumsAlreadyRunning])
    io.to(id).emit('recording-state', { roomId: id, active: true, userId })
    res.json({ ok: true })
  } catch (err) {
    console.error('Recording start error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 停止录音 → 创建 session + 分轨快照 + jamony-looper 检测 + 启动倒计时
app.post('/api/rooms/:id/recording/stop', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const { duration } = req.body
    const userId = req.userId
    const member = await pool.query('SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2', [id, userId])
    if (member.rows.length === 0 || member.rows[0].role !== 'musician') {
      return res.status(403).json({ ok: false, msg: '仅合奏者可录音' })
    }
    const room = await pool.query('SELECT server_port, recording_active, drums_used_this_recording FROM rooms WHERE id=$1', [id])
    if (room.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    const roomPort = room.rows[0].server_port

    // JSON-RPC 获取录音目录并停止录音
    let recDir = ''
    try {
      const status = await jsonRpcCall(roomPort, 'jamulusserver/getRecorderStatus')
      recDir = (status && status.recordingDirectory) || ''
    } catch (e) {
      console.error('getRecorderStatus error:', e.message)
    }
    try {
      await jsonRpcCall(roomPort, 'jamulusserver/stopRecording')
    } catch (e) {
      console.error('stopRecording error:', e.message)
    }
    // 等待 headless 写完 WAV 文件
    await new Promise(r => setTimeout(r, 2000))

    // 扫描 WAV 目录（找最新的 Jam-* 子目录）
    const wavFiles = []
    let recSessDir = ''
    if (recDir && fs.existsSync(recDir)) {
      const subdirs = fs.readdirSync(recDir).filter(d => d.startsWith('Jam-')).sort()
      if (subdirs.length > 0) {
        recSessDir = path.join(recDir, subdirs[subdirs.length - 1])
        const files = fs.readdirSync(recSessDir).filter(f => f.endsWith('.wav')).sort()
        for (const f of files) {
          wavFiles.push({ filename: f, fullPath: path.join(recSessDir, f) })
        }
        console.log('WAV files found:', wavFiles.length, 'in', recSessDir)
      }
    }

    // 段落序号 = 房间已有 session 数 + 1
    const cnt = await pool.query('SELECT COUNT(*) AS c FROM recording_sessions WHERE room_id=$1', [id])
    const index = parseInt(cnt.rows[0].c) + 1

    // 创建 session，启动倒计时
    const sess = await pool.query(
      `INSERT INTO recording_sessions (room_id, index, duration, countdown_seconds, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5::double precision)) RETURNING *`,
      [id, index, duration || '0:00', RECORDING_COUNTDOWN_SECONDS, RECORDING_COUNTDOWN_SECONDS]
    )
    const sessionId = sess.rows[0].id

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
    // 筛选 WAV：排除 looper 轨，按顺序匹配真人成员
    const userWavs = wavFiles.filter(w => !w.filename.startsWith('jamony-looper'))
    let wavIdx = 0
    for (const m of musicians.rows) {
      const filePath = wavIdx < userWavs.length ? userWavs[wavIdx].fullPath : ''
      await pool.query(
        'INSERT INTO session_tracks (session_id, user_id, nickname, instrument_category, file_path) VALUES ($1, $2, $3, $4, $5)',
        [sessionId, m.user_id, m.nickname, m.instrument_category || '', filePath]
      )
      wavIdx++
    }

    // jamony-looper：录音期间只要启动过鼓机，looper 分轨里就必然有鼓声，应展示
    const drumsUsedThisRecording = room.rows[0].drums_used_this_recording
    if (drumsUsedThisRecording) {
      const looperWav = wavFiles.find(w => w.filename.startsWith('jamony-looper'))
      await pool.query(
        `INSERT INTO session_tracks
         (session_id, user_id, is_system, nickname, instrument_category, allow_use, allow_attribution, allow_download, use_locked, attribution_locked, file_path)
         VALUES ($1, 0, TRUE, 'jamony-looper', '打击乐器', TRUE, TRUE, TRUE, TRUE, TRUE, $2)`,
        [sessionId, looperWav ? looperWav.fullPath : '']
      )
    }

    // 结束录音状态并广播
    await pool.query('UPDATE rooms SET recording_active=FALSE, drums_used_this_recording=FALSE WHERE id=$1', [id])
    io.to(id).emit('recording-state', { roomId: id, active: false })
    await broadcastSessions(id)
    res.json({ ok: true, session: sess.rows[0] });
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
                  io.to(id).emit('normalize-done', { sessionId: sess.rows[0].id, trackId: tr.id });
                } catch (e) {}
              }
            );
          }
        } catch (e) {
          console.error('Normalize error:', e.message);
        }
      })();
    }, 0);
  } catch (err) {
    console.error('Recording stop error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})
// 下载分轨 WAV（混音/发表试听用）
app.get('/api/rooms/:id/sessions/:sid/tracks/:tid/download', requireAuth, async (req, res) => {
  try {
    const { id: roomId, sid: sessionId, tid: trackId } = req.params
    const userId = req.userId

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

    // 验证已授权 allow_use=true，或是鼓机轨（is_system），或自己的轨
    if (!track.allow_use && !track.is_system && track.user_id !== userId) {
      return res.status(403).json({ ok: false, msg: '该分轨未授权使用' })
    }

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

// 抢发表锁（先到先得）
app.post('/api/rooms/:id/sessions/:sid/claim-publish', requireAuth, async (req, res) => {
  try {
    const { id: roomId, sid: sessionId } = req.params
    const userId = req.userId

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
    await broadcastSessions(roomId)
    const u = await pool.query('SELECT nickname FROM users WHERE id=$1', [userId])
    const nick = u.rows.length > 0 ? u.rows[0].nickname : '未知用户'
    res.json({ ok: true, claimed: true, publisher_user_id: userId, publisher_nickname: nick })
  } catch (err) {
    console.error('Claim publish error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 释放发表锁（关闭发表卡片但未发表时调用）
app.post('/api/rooms/:id/sessions/:sid/release-claim', requireAuth, async (req, res) => {
  try {
    const { id: roomId, sid: sessionId } = req.params
    const userId = req.userId

    await pool.query(
      'UPDATE recording_sessions SET publisher_user_id=NULL WHERE id=$1 AND publisher_user_id=$2',
      [sessionId, userId]
    )

    // 广播 sessions 更新
    await broadcastSessions(roomId)
    res.json({ ok: true })
  } catch (err) {
    console.error('Release claim error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 发表作品
app.post('/api/rooms/:id/sessions/:sid/publish', requireAuth, upload.fields([{ name: 'mp3', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), async (req, res) => {
  try {
    const { id: roomId, sid: sessionId } = req.params

    // 验证 session 存在
    const sess = await pool.query('SELECT * FROM recording_sessions WHERE id=$1 AND room_id=$2', [sessionId, roomId])
    if (sess.rows.length === 0) return res.status(404).json({ ok: false, msg: 'Session 不存在' })
    if (sess.rows[0].status === 'published') return res.status(400).json({ ok: false, msg: '该段落已发表' })

    const { title, style, copyright, cover_song, cover_author, source, description, duration, cover_gradient, has_drum_track, agreed, authors_json } = req.body
    const publisher_user_id = req.userId

    if (!title || !style || !copyright) {
      return res.status(400).json({ ok: false, msg: '缺少必填字段' })
    }

    // 先插入 works 获取 workId
    const work = await pool.query(
      `INSERT INTO works (room_id, session_id, publisher_user_id, title, style, copyright_type, cover_song, cover_author, source, description, duration, cover_gradient, has_drum_track, agreed, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'published') RETURNING id`,
      [roomId, sessionId, publisher_user_id, title, style, copyright, cover_song || '', cover_author || '', source || '', description || '', duration || '', cover_gradient || '', has_drum_track === 'true', agreed === 'true']
    )
    const workId = work.rows[0].id

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

    // 保存封面
    let coverImagePath = ''
    const coverFile = req.files?.cover_image?.[0]
    if (coverFile) {
      const ext = path.extname(coverFile.originalname) || '.jpg'
      coverImagePath = path.join(workDir, 'cover' + ext)
      fs.renameSync(coverFile.path, coverImagePath)
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
    await broadcastSessions(roomId)

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
    if (sort === 'likes') order = 'ORDER BY w.likes DESC, w.id DESC'

    const countResult = await pool.query("SELECT COUNT(*) FROM works WHERE status = 'published'")
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
      await pool.query(
        'INSERT INTO works_likes (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, userId]
      )
      await pool.query('UPDATE works SET likes = (SELECT COUNT(*) FROM works_likes WHERE work_id = $1) WHERE id = $1', [id])
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
    const userRow = await pool.query('SELECT nickname FROM users WHERE id=$1', [userId])
    if (userRow.rows.length === 0) return res.status(400).json({ ok: false, msg: '用户不存在' })
    const nickname = userRow.rows[0].nickname
    const ins = await pool.query(
      `INSERT INTO work_comments (work_id, user_id, nickname, content, parent_id, reply_to_nickname)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
      [id, userId, nickname, content.trim(), parentId || null, replyToNickname || null]
    )
    // 一级评论才 +1 works.comments（回复不计入主评论数）
    if (!parentId) {
      await pool.query('UPDATE works SET comments = COALESCE(comments, 0) + 1 WHERE id = $1', [id])
    }
    res.json({
      ok: true,
      comment: {
        id: ins.rows[0].id,
        user_id: userId,
        nickname,
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
app.get('/api/rooms/:id/sessions', async (req, res) => {
  try {
    const changed = await applyExpiry(req.params.id)
    if (changed) broadcastSessions(req.params.id)
    const sessions = await getRoomSessions(req.params.id)
    res.json({ ok: true, sessions })
  } catch (err) {
    console.error('Sessions list error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 修改某条分轨的授权（①② 写死锁定，② 依赖 ①，③ 自由不锁）
app.patch('/api/rooms/:id/sessions/:sid/tracks/:tid', requireAuth, async (req, res) => {
  try {
    const { id, sid, tid } = req.params
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
    await broadcastSessions(id)
    res.json({ ok: true })
  } catch (err) {
    console.error('Track auth error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})


// 下载分轨 WAV（自己始终可下载；他人需 allow_download=true）
app.get('/api/rooms/:id/sessions/:sid/tracks/:tid/download', async (req, res) => {
  try {
    const { id, sid, tid } = req.params
    const userId = parseInt(req.query.userId)
    if (!userId) return res.status(400).json({ ok: false, msg: '缺少 userId' })
    const tr = await pool.query('SELECT * FROM session_tracks WHERE id=$1 AND session_id=$2', [tid, sid])
    if (tr.rows.length === 0) return res.status(404).json({ ok: false, msg: '分轨不存在' })
    const t = tr.rows[0]
    if (!t.file_path) return res.status(404).json({ ok: false, msg: '分轨文件暂不可用' })
    // 权限：自己 或 对方允许下载
    const isSelf = t.user_id === userId
    if (!isSelf && t.allow_download !== true) {
      return res.status(403).json({ ok: false, msg: '未开放下载' })
    }
    // 音量标准化未完成则不可下载
    if (!t.normalized) {
      return res.status(403).json({ ok: false, msg: '音轨准备中' })
    }
    // 发送文件
    if (!fs.existsSync(t.file_path)) return res.status(404).json({ ok: false, msg: '文件不存在' })
    const fileName = path.basename(t.file_path)
    res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"')
    res.setHeader('Content-Type', 'audio/wav')
    const stream = fs.createReadStream(t.file_path)
    stream.pipe(res)
  } catch (err) {
    console.error('Download error:', err)
    res.status(500).json({ ok: false, msg: '下载失败' })
  }
})

// ========== 鼓机控制 ==========
const DRUM_STYLES = ['basic', 'rock', 'funk', 'jazz', 'blues', 'folk', 'metal', 'latin']
const DRUM_BASE_DIR = '/var/www/jamony/drum-loops'

app.get('/api/drums/styles', (req, res) => {
  const styles = {}
  DRUM_STYLES.forEach(style => {
    try {
      const result = execSync('find ' + DRUM_BASE_DIR + '/' + style + ' -name \"*.mid\" 2>/dev/null | sort', { encoding: 'utf8' }).toString().trim()
      styles[style] = result ? result.split('\n').map(f => f.replace(DRUM_BASE_DIR + '/' + style + '/', '')) : []
    } catch { styles[style] = [] }
  })
  res.json({ ok: true, styles })
})

app.post('/api/rooms/:roomId/drums/start', requireAuth, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId)
    if (!Number.isInteger(roomId) || roomId <= 0) return res.status(400).json({ ok: false, msg: '房间ID格式错误' })
    const roomRow = await pool.query('SELECT id FROM rooms WHERE id=$1', [req.params.roomId])
    if (roomRow.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, req.params.roomId))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可操作鼓机' })
    }
    const { style, bpm, file } = req.body
    const validStyle = DRUM_STYLES.includes(style) ? style : 'rock'
    const validBpm = Math.min(200, Math.max(40, parseInt(bpm) || 120))
    const validFile = file || ''

    // Check if any MIDI files exist for this style
    let hasFiles = false
    try {
      const out = execSync('find ' + DRUM_BASE_DIR + '/' + validStyle + ' -name \"*.mid\" 2>/dev/null', { encoding: 'utf8' }).toString().trim()
      hasFiles = out.length > 0
    } catch {}
    
    if (!hasFiles) {
      return res.status(404).json({ ok: false, msg: '该风格暂无鼓谱文件，请先上传' })
    }
    
        const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [req.params.roomId]);
    const roomPort = portRow.rows[0]?.server_port || req.params.roomId; execSync('node /var/www/jamony/api/manage-jamulus.js drums-start ' + validStyle + ' ' + validBpm + ' "' + validFile + '" ' + roomPort, { timeout: 15000, stdio: 'pipe' })
    await pool.query('UPDATE rooms SET current_bpm = $1, drums_used_this_recording = TRUE WHERE id = $2', [validBpm, req.params.roomId])
    io.to(req.params.roomId).emit('bpm-update', { bpm: validBpm })
    
    res.json({ ok: true, msg: '鼓机已启动', style: validStyle, bpm: validBpm })
  } catch (err) {
    console.error('Drums start error:', err)
    res.status(500).json({ ok: false, msg: '鼓机启动失败' })
  }
})

app.get('/api/rooms/:roomId/drums/status', async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId)
    if (!Number.isInteger(roomId) || roomId <= 0) return res.status(400).json({ ok: false, msg: '房间ID格式错误' })
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [req.params.roomId]);
    const roomPort = portRow.rows[0]?.server_port || req.params.roomId;
    const result = execSync('cat /tmp/jamony-drums-' + roomPort + '.pid 2>/dev/null', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    if (result) {
      const pid = parseInt(result);
      try { process.kill(pid, 0); res.json({ ok: true, running: true, pid: pid }); }
      catch { res.json({ ok: true, running: false }); }
    } else {
      res.json({ ok: true, running: false });
    }
  } catch (err) {
    res.json({ ok: true, running: false });
  }
});

app.post('/api/rooms/:roomId/drums/stop', requireAuth, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId)
    if (!Number.isInteger(roomId) || roomId <= 0) return res.status(400).json({ ok: false, msg: '房间ID格式错误' })
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [req.params.roomId])
    if (portRow.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, req.params.roomId))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可操作鼓机' })
    }
    const roomPort = portRow.rows[0]?.server_port || req.params.roomId;
    execSync('node /var/www/jamony/api/manage-jamulus.js drums-stop ' + roomPort, { timeout: 5000, stdio: 'pipe' })
    await pool.query('UPDATE rooms SET current_bpm = 0 WHERE id = $1', [req.params.roomId])
    io.to(req.params.roomId).emit('bpm-update', { bpm: 0 })
    res.json({ ok: true, msg: '鼓机已停止' })
  } catch (err) {
    console.error('Drums stop error:', err)
    res.status(500).json({ ok: false, msg: '鼓机停止失败' })
  }
})

// ========== 每日主题 ==========
const THEMES = [
  { title: "布鲁斯 · Key of E", emoji: "🎸" },
  { title: "即兴 Funk Groove", emoji: "🎹" },
  { title: "慢摇民谣弹唱", emoji: "🪕" },
  { title: "爵士标准曲即兴", emoji: "🎷" },
  { title: "电子氛围实验", emoji: "🎛️" },
  { title: "雷鬼阳光午后", emoji: "☀️" },
  { title: "午夜蓝调电台", emoji: "🎵" },
]
app.get('/api/daily-theme', (req, res) => {
  const today = new Date()
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 86400000)
  const theme = THEMES[dayOfYear % THEMES.length]
  res.json({ ok: true, theme })
})

// 校验用户是否某房间的合奏者（room_members.role === 'musician'）
async function isRoomMusician(userId, roomId) {
  const r = await pool.query("SELECT role FROM room_members WHERE room_id=$1 AND user_id=$2", [roomId, userId])
  return r.rows.length > 0 && r.rows[0].role === 'musician'
}

// ========== WebSocket (Socket.IO) ==========
// 握手认证：验 httpOnly cookie JWT → socket.userId（同域 cookie 自动携带，前端零改动）
io.use(async (socket, next) => {
  const token = parseCookies(socket.request)[COOKIE_NAME]
  if (!token) return next(new Error('未登录'))
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    socket.userId = decoded.id
    socket.nickname = decoded.nickname
    const u = await pool.query('SELECT avatar_url FROM users WHERE id=$1', [decoded.id])
    socket.avatarUrl = u.rows.length > 0 && u.rows[0].avatar_url ? u.rows[0].avatar_url.replace('/var/jamony/avatars', '/avatars') : ''
    next()
  } catch (e) {
    next(new Error('登录已过期'))
  }
})

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId)
    console.log("Socket joined room:", roomId)
  })

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId)
    console.log("Socket left room:", roomId)
  })

  socket.on("chat-message", (data) => {
    const { roomId, message } = data
    io.to(roomId).emit("chat-message", {
      id: Date.now().toString(),
      author: socket.nickname,
      avatarUrl: socket.avatarUrl || '',
      content: message,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      isSelf: false,
    })
  })

  socket.on("push-chords", async (data) => {
    const { roomId, chords } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return  // 仅合奏者可推和弦
    if (chords) {
      try { await pool.query('UPDATE rooms SET current_chords = $1 WHERE id = $2', [chords.join(' '), roomId]) }
      catch (e) { console.error('Chords persist error:', e) }
    }
    io.to(roomId).emit("chords-update", { chords })
  })

  socket.on("push-theme", async (data) => {
    const { roomId, theme } = data
    if (!roomId || !socket.userId) return
    if (!(await isRoomMusician(socket.userId, roomId))) return  // 仅合奏者可推主题
    if (theme) {
      try {
        await pool.query('UPDATE rooms SET current_theme = $1 WHERE id = $2', [theme, roomId])
      } catch (e) { console.error('Theme persist error:', e) }
    }
    io.to(roomId).emit("theme-update", { theme })
  })

  socket.on("disconnect", () => {
    console.log("Socket disconnected")
  })
})

// ========== 房间主题 ==========
app.post('/api/rooms/:roomId/theme', requireAuth, async (req, res) => {
  try {
    const roomRow = await pool.query('SELECT id FROM rooms WHERE id=$1', [req.params.roomId])
    if (roomRow.rows.length === 0) return res.status(404).json({ ok: false, msg: '房间不存在' })
    if (!(await isRoomMusician(req.userId, req.params.roomId))) {
      return res.status(403).json({ ok: false, msg: '仅合奏者可设置主题' })
    }
    const { theme } = req.body
    if (!theme || !theme.trim()) {
      return res.status(400).json({ ok: false, msg: '主题不能为空' })
    }
    await pool.query('UPDATE rooms SET current_theme = $1 WHERE id = $2', [theme.trim(), req.params.roomId])
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
      await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [row.room_id, userId])
      const remaining = await pool.query("SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [row.room_id])
      if (parseInt(remaining.rows[0].count) === 0) {
        const portResult = await pool.query('SELECT server_port FROM rooms WHERE id = $1 AND status != $2', [row.room_id, 'closed'])
        const closePort2 = portResult.rows[0]?.server_port
        if (closePort2) {
          try { execSync(`node /var/www/jamony/api/manage-jamulus.js drums-stop ${closePort2}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
          try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop ${closePort2}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
          try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop-ghost ${closePort2}`, { timeout: 5000, stdio: 'pipe' }) } catch {}
          try { execSync(`rm -rf /var/jamony/recordings/room-${closePort2}-records/`, { timeout: 5000, stdio: 'pipe' }) } catch {}
          try {
            const gs = JSON.parse(fs.readFileSync('/tmp/jamony-ghost.json', 'utf8').toString() || '{}')
            const ent = gs[String(closePort2)]
            if (ent && ent.ffmpegPid) { try { process.kill(ent.ffmpegPid) } catch {} }
            delete gs[String(closePort2)]
            fs.writeFileSync('/tmp/jamony-ghost.json', JSON.stringify(gs, null, 2))
          } catch (e) { /* ignore */ }
        }
        const pubCnt = await pool.query('SELECT COUNT(*) AS c FROM works WHERE room_id = $1', [row.room_id])
        if (parseInt(pubCnt.rows[0].c) > 0) {
          await pool.query("UPDATE rooms SET status='archived' WHERE id=$1", [row.room_id])
        } else {
          await pool.query('DELETE FROM rooms WHERE id = $1', [row.room_id])
        }
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('Leave all rooms error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

try { execSync('jack_lsp 2>/dev/null || (jackd -d alsa -d hw:Loopback -p 1024 -r 48000 &', { timeout: 5000, stdio: 'pipe' }) } catch(e) {}

server.listen(PORT, '127.0.0.1', () => {
  console.log('jamony API running on http://127.0.0.1:' + PORT)
  console.log('Socket.IO ready')
})
