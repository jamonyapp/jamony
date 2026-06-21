const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const http = require("http")
const { Server } = require("socket.io")
const { execSync, spawn } = require('child_process')
const { Pool } = require('pg')

const app = express()
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

// ========== 登录 ==========
app.post('/api/login', async (req, res) => {
  try {
    const { nickname, password } = req.body
    if (!nickname || !password) {
      return res.status(400).json({ ok: false, msg: '请输入用户名和密码' })
    }

    const result = await pool.query('SELECT * FROM users WHERE nickname = $1', [nickname])
    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, msg: '用户名或密码错误' })
    }

    const user = result.rows[0]
    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ ok: false, msg: '用户名或密码错误' })
    }

    res.json({
      ok: true,
      user: {
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
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 注册 ==========
app.post('/api/register', async (req, res) => {
  try {
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
    res.json({
      ok: true,
      user: {
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
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 获取单个用户 ==========
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await pool.query(
      `SELECT id, nickname, bio, city, primary_instrument, instrument_category, secondary_instrument,
              styles, avatar_index, level, points, works_count, jam_count,
              total_likes, followers_count, created_at
       FROM users WHERE id = $1`, [id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    res.json({ ok: true, user: result.rows[0] })
  } catch (err) {
    console.error('User fetch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 按昵称获取用户 ==========
app.get('/api/users/by-nickname/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params
    const result = await pool.query(
      `SELECT id, nickname, bio, city, primary_instrument, instrument_category, secondary_instrument,
              styles, avatar_index, level, points, works_count, jam_count,
              total_likes, followers_count, created_at
       FROM users WHERE nickname = $1`, [nickname]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '用户不存在' })
    }
    res.json({ ok: true, user: result.rows[0] })
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
      `SELECT id, nickname, bio, city, primary_instrument, instrument_category, avatar_index,
              level, points, works_count, total_likes
       FROM users ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset]
    )
    const count = await pool.query('SELECT COUNT(*) FROM users')
    res.json({
      ok: true,
      users: result.rows,
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
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params
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
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, nickname, avatar_index, bio, signature, city, primary_instrument, instrument_category, secondary_instrument, level, points`,
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
app.post('/api/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params
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
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, description, style, hostId, maxMusicians } = req.body
    if (!name || !hostId) {
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
      `SELECT r.*, u.nickname AS host_name,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'musician') AS musician_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'listener') AS listener_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS total_members
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE r.status != 'closed'
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
      `SELECT r.*, u.nickname AS host_name,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'musician') AS musician_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id AND role = 'listener') AS listener_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS total_members
       FROM rooms r
       JOIN users u ON u.id = r.host_id
       WHERE r.id = $1 AND r.status != 'closed'`,
      [id]
    )
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '房间不存在' })
    }

    const members = await pool.query(
      `SELECT rm.*, u.primary_instrument, u.instrument_category FROM room_members rm JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1 ORDER BY rm.joined_at`,
      [id]
    )

    res.json({ ok: true, room: roomResult.rows[0], members: members.rows })
  } catch (err) {
    console.error('Room detail error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 加入房间
app.post('/api/rooms/:id/join', async (req, res) => {
  try {
    const { id } = req.params
    const { userId, role } = req.body

    if (!userId) {
      return res.status(400).json({ ok: false, msg: '请先登录' })
    }

    const acceptedRole = role === 'musician' ? 'musician' : 'listener'

    // 查房间
    const roomResult = await pool.query('SELECT * FROM rooms WHERE id = $1 AND status != $2', [id, 'closed'])
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

    res.json({ ok: true, msg: '已加入房间', role: acceptedRole })
  } catch (err) {
    console.error('Room join error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 离开房间
app.post('/api/rooms/:id/leave', async (req, res) => {
  try {
    const { id } = req.params
    const { userId } = req.body

    const memberResult = await pool.query(
      'SELECT * FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId]
    )
    if (memberResult.rows.length === 0) {
      return res.status(404).json({ ok: false, msg: '你不在这个房间' })
    }

    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [id, userId])

    // 检查是否是房主
    const roomResult = await pool.query('SELECT host_id, server_port FROM rooms WHERE id = $1', [id])
    if (roomResult.rows.length === 0) {
      return res.json({ ok: true, msg: '房间已不存在' })
    }

    if (roomResult.rows[0].host_id === parseInt(userId)) {
      // 房主离开，移交给在房间最久的合奏者
      const newHost = await pool.query(
        "SELECT user_id FROM room_members WHERE room_id = $1 AND role = 'musician' ORDER BY joined_at LIMIT 1",
        [id]
      )
      if (newHost.rows.length > 0) {
        await pool.query('UPDATE rooms SET host_id = $1 WHERE id = $2', [newHost.rows[0].user_id, id])
      } else {
        // 没有合奏者了，解散房间
        await pool.query("UPDATE rooms SET status = 'closed' WHERE id = $1", [id])
        if (roomResult.rows[0]?.server_port) {
          try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop ${roomResult.rows[0].server_port}`, { timeout: 5000, stdio: 'pipe' }); try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop-ghost ${roomResult.rows[0].server_port}`, { timeout: 5000, stdio: 'pipe' }) } catch {} } catch {}
        }
      }
    }

    res.json({ ok: true, msg: '已退出房间' })
  } catch (err) {
    console.error('Room leave error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// 切换角色（合奏者 ↔ 听众）
app.post('/api/rooms/:id/switch-role', async (req, res) => {
  try {
    const { id } = req.params
    const { userId, newRole } = req.body

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

    res.json({ ok: true, msg: '身份已切换' })
  } catch (err) {
    console.error('Role switch error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
  }
})

// ========== 更新房间成员音频状态 ==========
app.post('/api/rooms/:roomId/members/:userId/audio-status', async (req, res) => {
  try {
    const { roomId, userId } = req.params
    const { audioStatus } = req.body
    await pool.query(
      'UPDATE room_members SET audio_status = $1, last_active_at = NOW() WHERE room_id = $2 AND user_id = $3',
      [audioStatus || 'connected', roomId, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('Audio status error:', err)
    res.status(500).json({ ok: false, msg: '服务器错误' })
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

app.post('/api/rooms/:roomId/drums/start', async (req, res) => {
  try {
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
    await pool.query('UPDATE rooms SET current_bpm = $1 WHERE id = $2', [validBpm, req.params.roomId])
    io.to(req.params.roomId).emit('bpm-update', { bpm: validBpm })
    
    res.json({ ok: true, msg: '鼓机已启动', style: validStyle, bpm: validBpm })
  } catch (err) {
    console.error('Drums start error:', err)
    res.status(500).json({ ok: false, msg: '鼓机启动失败' })
  }
})

app.get('/api/rooms/:roomId/drums/status', async (req, res) => {
  try {
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

app.post('/api/rooms/:roomId/drums/stop', async (req, res) => {
  try {
    const portRow = await pool.query('SELECT server_port FROM rooms WHERE id = $1', [req.params.roomId]);
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

// ========== WebSocket (Socket.IO) ==========
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
    const { roomId, message, author } = data
    io.to(roomId).emit("chat-message", {
      id: Date.now().toString(),
      author,
      content: message,
      time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      isSelf: false,
    })
  })

  socket.on("push-chords", async (data) => {
    const { roomId, chords } = data
    if (roomId && chords) {
      try { await pool.query('UPDATE rooms SET current_chords = $1 WHERE id = $2', [chords.join(' '), roomId]) }
      catch (e) { console.error('Chords persist error:', e) }
    }
    io.to(roomId).emit("chords-update", { chords })
  })

  socket.on("push-theme", async (data) => {
    const { roomId, theme } = data
    if (roomId && theme) {
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
app.post('/api/rooms/:roomId/theme', async (req, res) => {
  try {
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
app.post('/api/users/:userId/leave-all-rooms', async (req, res) => {
  try {
    const { userId } = req.params
    const rooms = await pool.query('SELECT room_id FROM room_members WHERE user_id = $1', [userId])
    for (const row of rooms.rows) {
      await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [row.room_id, userId])
      const remaining = await pool.query("SELECT COUNT(*) FROM room_members WHERE room_id = $1 AND role = 'musician'", [row.room_id])
      if (parseInt(remaining.rows[0].count) === 0) {
        const portResult = await pool.query('SELECT server_port FROM rooms WHERE id = $1 AND status != $2', [row.room_id, 'closed'])
        await pool.query("UPDATE rooms SET status = 'closed' WHERE id = $1", [row.room_id])
        if (portResult.rows[0]?.server_port) {
          try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop ${portResult.rows[0].server_port}`, { timeout: 5000, stdio: 'pipe' }); try { execSync(`node /var/www/jamony/api/manage-jamulus.js stop-ghost ${portResult.rows[0].server_port}`, { timeout: 5000, stdio: 'pipe' }) } catch {} } catch {}
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
