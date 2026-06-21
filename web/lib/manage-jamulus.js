#!/usr/bin/env node
// jamony 进程管理器
// 用法:
//   start <port> [channels]          — 启动 headless
//   start-ghost <port> <roomId>      — 启动幽灵 + ffmpeg
//   stop <port>                      — 停止 headless + ghost
//   stop-ghost <port>                — 只停止幽灵
//   status                           — 查看所有

const { spawn, execSync } = require('child_process')
const fs = require('fs')

const GHOST_BIN = '/usr/local/bin/jamulus-ghost'
const HEADLESS_BIN = '/usr/bin/jamulus-headless'
const STATE_FILE = '/tmp/jamony-ghost.json'

const CMD = process.argv[2]
const PORT = parseInt(process.argv[3])

function getState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

if (!CMD) {
  console.log('用法: node manage-jamulus.js <start|stop|start-ghost|stop-ghost|status> [port] [params]')
  process.exit(1)
}

if (CMD === 'start') {
  const CHANNELS = parseInt(process.argv[4]) || 6
  try { execSync('ss -ulnp | grep ' + PORT, { stdio: 'pipe' }); console.log('Port ' + PORT + ' already in use'); process.exit(0) } catch {}
  const finalCh = Math.max(CHANNELS, 2)
  const p = spawn(HEADLESS_BIN, ['--port', String(PORT), '--server', '--nogui', '--numchannels', String(finalCh)], { stdio: 'ignore', detached: true })
  p.unref()
  console.log('HEADLESS ' + PORT + ' ch=' + finalCh + ' PID=' + p.pid)
}

if (CMD === 'stop') {
  try {
    const out = execSync('ss -ulnp | grep ' + PORT + ' | grep -oP \'pid=\\K\\d+\'', { encoding: 'utf8' }).trim()
    out.split('\\n').forEach(function(p) { if (p) { try { process.kill(parseInt(p)); console.log('Killed headless ' + p) } catch {} } })
  } catch {}
  // also kill ghost
  var st = getState()
  if (st[PORT]) {
    try { process.kill(st[PORT].ghostPid) } catch {}
    try { process.kill(st[PORT].ffmpegPid) } catch {}
    delete st[PORT]
    saveState(st)
    console.log('Ghost cleaned for port ' + PORT)
  }
}

if (CMD === 'start-ghost') {
  var roomId = process.argv[4] || String(PORT)
  var mount = '/room-' + roomId

  // List JACK output ports before
  var before = []
  try {
    var lines = execSync('jack_lsp 2>/dev/null', { encoding: 'utf8' }).toString().split('\\n')
    lines.forEach(function(l) { if (l.indexOf('output') >= 0) before.push(l.trim()) })
  } catch {}

  var ghost = spawn(GHOST_BIN, ['-n', '--connect', '127.0.0.1:' + PORT], { stdio: 'ignore', detached: true })
  ghost.unref()

  // Wait and detect JACK name
  var name = 'Jamulus'
  for (var i = 0; i < 12; i++) {
    execSync('sleep 1')
    try {
      var after = execSync('jack_lsp 2>/dev/null', { encoding: 'utf8' }).toString().split('\\n').filter(function(l) { return l.indexOf('output') >= 0 })
      var newPorts = after.filter(function(l) { return before.indexOf(l.trim()) < 0 })
      if (newPorts.length > 0) {
        var m = newPorts[0].match(/([\\w-]+):/)
        if (m && m[1] !== 'system') { name = m[1]; break }
      } else if (after.length > 0) {
        var m = after[after.length-1].match(/([\\w-]+):/)
        if (m && m[1] !== 'system') name = m[1]
      }
    } catch {}
  }

  var ffmpeg = spawn('ffmpeg', ['-f', 'jack', '-i', name, '-acodec', 'libmp3lame', '-b:a', '48k', '-content_type', 'audio/mpeg', '-f', 'mp3', 'icecast://source:jamony2026ice@localhost:8000' + mount], { stdio: 'ignore', detached: true })
  ffmpeg.unref()

  var st = getState()
  st[PORT] = { ghostPid: ghost.pid, ffmpegPid: ffmpeg.pid, ghostName: name, mountPath: mount, startedAt: new Date().toISOString() }
  saveState(st)
  console.log('GHOST ' + PORT + ' name=' + name + ' mount=' + mount + ' ghostPid=' + ghost.pid + ' ffmpegPid=' + ffmpeg.pid)
}

if (CMD === 'stop-ghost') {
  var st = getState()
  if (st[PORT]) {
    try { process.kill(st[PORT].ghostPid) } catch {}
    try { process.kill(st[PORT].ffmpegPid) } catch {}
    delete st[PORT]
    saveState(st)
    console.log('Stopped ghost for port ' + PORT)
  } else {
    console.log('No ghost found for port ' + PORT)
  }
}

if (CMD === 'drums-start') {
  execSync('/var/www/jamony/api/start-drums.sh ' + (process.argv[3] || 'rock') + ' ' + (process.argv[4] || '120') + ' ' + (process.argv[5] || '') + ' ' + (process.argv[6] || ''), { timeout: 10000, stdio: 'inherit' })
}

if (CMD === 'drums-stop') {
  execSync('/var/www/jamony/api/start-drums.sh stop', { stdio: 'inherit' })
}

if (CMD === 'status') {
  var st = getState()
  var keys = Object.keys(st)
  if (keys.length === 0) {
    console.log('No active ghosts')
  } else {
    keys.sort().forEach(function(k) {
      var s = st[k]
      var g = pidAlive(s.ghostPid) ? 'GREEN' : 'RED'
      var f = pidAlive(s.ffmpegPid) ? 'GREEN' : 'RED'
      console.log(k + ': ' + s.ghostName + ' ghost=' + g + ' ffmpeg=' + f + ' ' + s.mountPath)
    })
  }
}
