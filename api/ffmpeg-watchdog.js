#!/usr/bin/env node
// jamony ffmpeg 守护进程（每 10 秒检查一次）
const { spawn } = require("child_process")
const execSync = require("child_process").execSync

const STATE_FILE = "/tmp/jamony-ghost.json"

function getState() {
  try { return JSON.parse(require("fs").readFileSync(STATE_FILE, "utf8")) }
  catch { return {} }
}

function saveState(st) {
  require("fs").writeFileSync(STATE_FILE, JSON.stringify(st, null, 2))
}

function pidAlive(pid) {
  if (!pid || pid === 0) return false
  try { process.kill(pid, 0); return true }
  catch { return false }
}

function checkJackPorts() {
  try {
    var out = execSync('jack_lsp 2>/dev/null | grep -c ":output"', { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).toString().trim()
    return parseInt(out) >= 2
  } catch { return false }
}

function ensureFfmpeg(port, s) {
  if (!s.ghostPid || !pidAlive(s.ghostPid)) {
    console.log("Ghost dead for " + port + ", cleaning up")
    return false
  }
  if (pidAlive(s.ffmpegPid)) return true
  if (!checkJackPorts()) return false

  console.log("Starting ffmpeg for room " + port)
  var iceClient = "jm-stream-" + port
  var mount = s.mountPath || "/room-" + port
  var ffmpeg = spawn("ffmpeg", ["-f", "jack", "-i", iceClient, "-acodec", "libmp3lame", "-b:a", "48k", "-content_type", "audio/mpeg", "-f", "mp3", "icecast://source:jamony2026ice@localhost:8000" + mount], { stdio: "ignore", detached: true })
  ffmpeg.unref()
  s.ffmpegPid = ffmpeg.pid
  s.startedAt = new Date().toISOString()
  // 连接 ffmpeg JACK 端口
  var jcTimer = setInterval(function() {
    try {
      var found = execSync('jack_lsp 2>/dev/null | grep -c "' + iceClient + ':input_1"', { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).toString().trim()
      if (parseInt(found) > 0) {
        execSync('jack_connect "' + iceClient + ':input_1" "Jamulus-" + port + " jamony-looper:output left"', { stdio: "pipe" })
        execSync('jack_connect "' + iceClient + ':input_2" "Jamulus-" + port + " jamony-looper:output right"', { stdio: "pipe" })
        clearInterval(jcTimer)
      }
    } catch(e) {}
  }, 500)
  setTimeout(function() { clearInterval(jcTimer) }, 15000)
  return true
}

function checkAll() {
  try {
  var st = getState()
  var keys = Object.keys(st)
  var changed = false
  keys.sort().forEach(function(k) {
    var s = st[k]
    if (!pidAlive(s.ghostPid)) {
      console.log("Removing dead ghost: " + k)
      delete st[k]
      changed = true
      return
    }
    if (ensureFfmpeg(k, s)) changed = true
  })
  if (changed) saveState(st)
  } catch(e) { console.log("watchdog error:", e.message) }
}

console.log("ffmpeg watchdog started (10s interval)")
setInterval(checkAll, 10000)
checkAll()
