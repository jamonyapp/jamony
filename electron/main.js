const { app, BrowserWindow, ipcMain, session, dialog } = require('electron')
const path = require('path')
const { spawn, execSync } = require('child_process')

// 云端页面地址
const WEB_URL = process.env.JAMONY_WEB_URL || 'http://39.96.30.128'

// jamsoul 可执行文件路径
// 开发模式：../dist/jamsoul-bin/jamsoul (Mac) / jamsoul.exe (Win)
// 打包后：{resourcesPath}/jamsoul.app/Contents/MacOS/jamsoul (Mac) / jamsoul-bin/jamsoul.exe (Win)
const isPackaged = app.isPackaged
const JAMSOUL_BIN = process.env.JAMSOUL_BIN || (
  isPackaged
    ? (process.platform === 'darwin'
        ? path.join(process.resourcesPath, 'jamsoul.app', 'Contents', 'MacOS', 'jamsoul')
        : path.join(process.resourcesPath, 'jamsoul-bin', 'jamsoul.exe'))
    : path.join(__dirname, '..', 'dist', 'jamsoul-bin', process.platform === 'win32' ? 'jamsoul.exe' : 'jamsoul')
)

let mainWindow = null
let jamsoulProcess = null

function createWindow() {
  // #3 安全白名单：只允许白名单域加载，防注入恶意页面（file: 本地页 + 内测IP + 公测域名）
  const ALLOWED_HOSTS = ['39.96.30.128', 'jamonyapp.com', 'localhost', '127.0.0.1']
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const u = new URL(details.url)
      const allowed = u.protocol === 'file:' || u.protocol === 'chrome:' || u.protocol === 'devtools:'
        || ALLOWED_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h))
      if (!allowed) console.log('[jamony] 拦截非白名单请求:', details.url)
      callback({ cancel: !allowed })
    } catch { callback({ cancel: false }) }
  })

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'jamony',
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // jamony: 叉掉窗口时（jamsoul 在跑）弹确认，取消则不关窗口
  mainWindow.on('close', (e) => {
    if (jamsoulProcess && !isQuitting) {
      e.preventDefault()
      dialog.showMessageBox(mainWindow, {
        type: 'question', buttons: ['退出', '取消'], defaultId: 0, title: '退出 jamony',
        message: '退出 jamony 将关闭 jamsoul 并离开房间，确认退出？'
      }).then(({ response }) => {
        if (response === 0) {
          isQuitting = true
          killJamsoul(true)
          mainWindow.close()  // 确认后关（isQuitting true 不再拦截）→ beforeunload leave → app.quit
        }
      }).catch(() => {})
    }
  })

  // 品牌开屏动画（4 秒）
  mainWindow.loadFile(path.join(__dirname, 'splash.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 5 秒后切换到云端页面（霓虹开屏动画需要更多时间展示）
  setTimeout(() => {
    mainWindow.loadURL(WEB_URL)
  }, 5000)

  // #1 断网检测：云端页面加载失败 → 显示断网页
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDesc, validatedURL) => {
    if (validatedURL && validatedURL.startsWith(WEB_URL)) {
      console.log('[jamony] 云端加载失败，显示断网页:', errorDesc)
      mainWindow.loadFile(path.join(__dirname, 'offline.html'))
    }
  })
}

// 调起 jamsoul 子进程
function launchJamsoul(serverIp, port, nickname) {
  // jamony: 排重——jamsoul 已启动则不重启（避免硬刷新重复启动多个 jamsoul）
  if (jamsoulProcess) {
    console.log('[jamony] jamsoul already running, skip launch')
    if (mainWindow) { mainWindow.webContents.send('jamsoul-launched', { ok: true, alreadyRunning: true }) }
    return jamsoulProcess
  }
  // 使用 jamulus 原生的 --connect 参数自动连接服务器；--clientname 传 jamony 昵称（调音台 fader tag 显示）
  const args = ['--connect', `${serverIp}:${port}`]
  if (nickname) args.push('--clientname', nickname)

  console.log(`[jamony] Launching jamsoul: ${JAMSOUL_BIN} ${args.join(' ')}`)

  try {
    const child = spawn(JAMSOUL_BIN, args, {
      stdio: 'ignore',
    })

    child.on('error', (err) => {
      console.error(`[jamony] Failed to launch jamsoul: ${err.message}`)
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          console.error("⚠️ jamsoul 未找到或启动失败，请确认已正确安装");
        `)
      }
    })

    child.on('exit', (code, signal) => {
      console.log(`[jamony] jamsoul exited (code=${code}, signal=${signal})`)
      jamsoulProcess = null
      // jamony: jamsoul 退出通知网页（反向交互，让页面感知 jamsoul 关闭）
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('jamsoul-exited', { code, signal })
      }
    })

    jamsoulProcess = child

    // jamony: jamsoul 启动后用 AppleScript 调整窗口（贴 jamony 右边框 + 等高）
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds()
      const x = b.x + b.width
      const y = b.y
      const h = b.height
      setTimeout(() => {
        try {
          // 获取 jamsoul 窗口当前 width（原版默认，按 fader 数量自适应）+ 设 bounds（贴 jamony 右边框 + 等高，width 保持）
          const sizeOut = execSync(`osascript -e 'tell application "System Events" to get size of window 1 of process "jamsoul"'`).toString().trim()
          const match = sizeOut.match(/(\d+),\s*(\d+)/)
          const jw = match ? parseInt(match[1]) : 800
          execSync(`osascript -e 'tell application "System Events" to set bounds of window 1 of process "jamsoul" to {${x}, ${y}, ${x + jw}, ${y + h}}'`)
          console.log(`[jamony] jamsoul window adjusted: x=${x} y=${y} w=${jw} h=${h}`)
        } catch (e) { console.error('[jamony] AppleScript window adjust failed:', e.message) }
      }, 2500)
    }

    return child
  } catch (err) {
    console.error(`[jamony] Error launching jamsoul: ${err.message}`)
    return null
  }
}

// 清理 jamsoul 子进程
function killJamsoul(immediate = false) {
  if (jamsoulProcess) {
    console.log('[jamony] Killing jamsoul child process')
    if (immediate) {
      // 立即强制杀（退出 jamony 时，不等优雅退出，否则 Electron 退出 setTimeout 不跑 → 孤儿）
      try { jamsoulProcess.kill('SIGKILL') } catch (_) {}
      jamsoulProcess = null
    } else {
      jamsoulProcess.kill('SIGTERM')
      // 给 jamsoul 3 秒时间优雅退出，超时强制杀死
      setTimeout(() => {
        if (jamsoulProcess) {
          try { jamsoulProcess.kill('SIGKILL') } catch (_) {}
          jamsoulProcess = null
        }
      }, 3000)
    }
  }
}

// ══════════════════════════════════════
// IPC 处理 — 来自网页的 JOIN_ROOM 请求
// ══════════════════════════════════════
ipcMain.on('join-room', (_event, payload) => {
  console.log(`[jamony] IPC join-room received:`, payload)

  if (!payload || !payload.serverIp || !payload.port) {
    console.error('[jamony] Invalid join-room payload:', payload)
    return
  }

  launchJamsoul(payload.serverIp, payload.port, payload.nickname)

  // 通知网页端 jamsoul 已启动
  if (mainWindow) {
    mainWindow.webContents.send('jamsoul-launched', { ok: true })
  }
})

// 来自网页的 KILL_JAMSOUL 请求（断开合奏时）
ipcMain.on('kill-jamsoul', () => {
  console.log('[jamony] IPC kill-jamsoul received')
  killJamsoul()
})

// ══════════════════════════════════════
// 生命周期
// ══════════════════════════════════════
app.whenReady().then(createWindow)

// 退出 jamony 时：有 jamsoul 则弹窗确认 + 立即 SIGKILL；无 jamsoul 直接退
let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) { killJamsoul(true); return }
  if (jamsoulProcess) {
    e.preventDefault()
    isQuitting = true
    dialog.showMessageBox(mainWindow, {
      type: 'question', buttons: ['退出', '取消'], defaultId: 0, title: '退出 jamony',
      message: '退出 jamony 将关闭 jamsoul 并离开房间，确认退出？'
    }).then(({ response }) => {
      if (response === 0) {
        killJamsoul(true)
        // 不 app.exit()，改 mainWindow.close() → 触发 beforeunload leave 房间 → window-all-closed → app.quit
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
        else app.exit()
      } else {
        isQuitting = false
      }
    }).catch(() => { killJamsoul(true); app.exit() })
  } else {
    killJamsoul(true)
  }
})

// 关闭窗口 → 退出整个应用（连带杀掉 jamsoul）
app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
