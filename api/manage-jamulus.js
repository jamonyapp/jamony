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
    if (st[PORT].ffmpegPid) { try { process.kill(st[PORT].ffmpegPid) } catch {} }
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

  // 后台每秒检测 JACK，就绪后立即启动 ffmpeg（不阻塞 API）
  var st = getState()
  st[PORT] = { ghostPid: ghost.pid, ffmpegPid: 0, ghostName: "Jamulus", mountPath: mount, startedAt: new Date().toISOString() }
  saveState(st)
  console.log("GHOST " + PORT + " ghostPid=" + ghost.pid + " (JACK pending, watching)")

  var watchInterval = setInterval(function() {
    var curSt = getState()
    if (!curSt[PORT] || !pidAlive(curSt[PORT].ghostPid)) { clearInterval(watchInterval); return }
    if (pidAlive(curSt[PORT].ffmpegPid)) { clearInterval(watchInterval); return }
    try {
      var out = execSync('jack_lsp 2>/dev/null | grep -c ":output"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
      if (parseInt(out) < 2) return
    } catch(e) { return }
    clearInterval(watchInterval)
    console.log("JACK ready for " + PORT + ", starting ffmpeg")
    var iceClient = "jm-stream-" + PORT
    var mount = "/room-" + PORT
    var ffmpeg = spawn("ffmpeg", ["-f", "jack", "-i", iceClient, "-acodec", "libmp3lame", "-b:a", "48k", "-content_type", "audio/mpeg", "-f", "mp3", "icecast://source:jamony2026ice@localhost:8000" + mount], { stdio: "ignore", detached: true })
    ffmpeg.unref()
    curSt[PORT].ffmpegPid = ffmpeg.pid
    curSt[PORT].startedAt = new Date().toISOString()
    saveState(curSt)
    console.log("FFMPEG started for " + PORT + " pid=" + ffmpeg.pid)
    // 等待 ffmpeg JACK 端口出现，手动连接音频源
    var jcTimer = setInterval(function() {
      try {
        var found = execSync('jack_lsp 2>/dev/null | grep -c "' + iceClient + ':input_1"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
        if (parseInt(found) > 0) {
          execSync('jack_connect "' + iceClient + ':input_1" "Jamulus:output left"', { stdio: 'pipe' })
          execSync('jack_connect "' + iceClient + ':input_2" "Jamulus:output right"', { stdio: 'pipe' })
          clearInterval(jcTimer)
          console.log("JACK connections made for " + iceClient)
        }
      } catch(e) {}
    }, 500)
    setTimeout(function() { clearInterval(jcTimer) }, 15000)
  }, 1000)
  // 保持进程存活，直到 ffmpeg 启动或 30 秒超时
  var keepAliveTimer = setInterval(function() {
    var curSt = getState()
    if (curSt[PORT] && pidAlive(curSt[PORT].ffmpegPid)) {
      console.log("FFMPEG confirmed for " + PORT + ", start-ghost exiting")
      clearInterval(keepAliveTimer)
      process.exit(0)
    }
  }, 500)
  setTimeout(function() {
    console.log("start-ghost timeout for " + PORT + ", exiting")
    process.exit(0)
  }, 30000)
}



if (CMD === 'stop-ghost') {
  var st = getState()
  if (st[PORT]) {
    try { process.kill(st[PORT].ghostPid) } catch {}
    if (st[PORT].ffmpegPid) { try { process.kill(st[PORT].ffmpegPid) } catch {} }
    delete st[PORT]
    saveState(st)
    console.log('Stopped ghost for port ' + PORT)
  } else {
    console.log('No ghost found for port ' + PORT)
  }
}

if (CMD === 'drums-start') {
  execSync('/var/www/jamony/api/start-drums.sh ' + (process.argv[3] || 'rock') + ' ' + (process.argv[4] || '120') + ' "' + (process.argv[5] || '') + '" ' + (process.argv[6] || ''), { timeout: 10000, stdio: 'inherit' })
}

if (CMD === 'drums-stop') {
  var roomPort = process.argv[3] || 'global'
  execSync('/var/www/jamony/api/start-drums.sh stop ' + roomPort, { stdio: 'inherit' })
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

if (CMD === 'health-check') {
  var st = getState()
  var keys = Object.keys(st)
  var restarted = 0
  keys.sort().forEach(function(k) {
    var s = st[k]
    if (!pidAlive(s.ghostPid)) {
      console.log('GHOST DEAD: ' + k + ' - removing')
      delete st[k]
      return
    }
    if (!pidAlive(s.ffmpegPid)) {
      // 先确认 JACK 已就绪
      var jackReady = false
      try { var out = execSync('jack_lsp 2>/dev/null | grep -c ":output"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim(); if (parseInt(out) >= 2) jackReady = true } catch(e) {}
      if (!jackReady) { console.log('JACK not ready for ' + k + ', deferring ffmpeg'); return }
      console.log('FFMPEG DEAD: ' + k + ' - restarting')
      var iceClient = 'jm-stream-' + k
      var mount = s.mountPath
      var ffmpeg = spawn('ffmpeg', ['-f', 'jack', '-i', iceClient, '-acodec', 'libmp3lame', '-b:a', '48k', '-content_type', 'audio/mpeg', '-f', 'mp3', 'icecast://source:jamony2026ice@localhost:8000' + mount], { stdio: 'ignore', detached: true })
      ffmpeg.unref()
      st[k].ffmpegPid = ffmpeg.pid
      st[k].startedAt = new Date().toISOString()
      restarted++
      // 连接 ffmpeg JACK 端口
      try {
        var jcTimer2 = setInterval(function(k2, client) {
          try {
            var found = execSync('jack_lsp 2>/dev/null | grep -c "' + client + ':input_1"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim()
            if (parseInt(found) > 0) {
              execSync('jack_connect "' + client + ':input_1" "Jamulus:output left"', { stdio: 'pipe' })
              execSync('jack_connect "' + client + ':input_2" "Jamulus:output right"', { stdio: 'pipe' })
              clearInterval(jcTimer2)
            }
          } catch(e) {}
        }, 500, k, iceClient)
        setTimeout(function() { clearInterval(jcTimer2) }, 15000)
      } catch(e) {}
    }
  })
  saveState(st)
  if (restarted > 0) console.log('Restarted ' + restarted + ' ffmpeg processes')
  else console.log('All healthy')
}

