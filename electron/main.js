const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

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

  // 品牌开屏动画（4 秒）
  mainWindow.loadFile(path.join(__dirname, 'splash.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 5 秒后切换到云端页面（霓虹开屏动画需要更多时间展示）
  setTimeout(() => {
    mainWindow.loadURL(WEB_URL)
  }, 5000)
}

// 调起 jamsoul 子进程
function launchJamsoul(serverIp, port) {
  // 使用 jamulus 原生的 --connect 参数自动连接服务器
  const args = ['--connect', `${serverIp}:${port}`]

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
    })

    jamsoulProcess = child
    return child
  } catch (err) {
    console.error(`[jamony] Error launching jamsoul: ${err.message}`)
    return null
  }
}

// 清理 jamsoul 子进程
function killJamsoul() {
  if (jamsoulProcess) {
    console.log('[jamony] Killing jamsoul child process')
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

// ══════════════════════════════════════
// IPC 处理 — 来自网页的 JOIN_ROOM 请求
// ══════════════════════════════════════
ipcMain.on('join-room', (_event, payload) => {
  console.log(`[jamony] IPC join-room received:`, payload)

  if (!payload || !payload.serverIp || !payload.port) {
    console.error('[jamony] Invalid join-room payload:', payload)
    return
  }

  launchJamsoul(payload.serverIp, payload.port)

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

// 退出 jamony 时自动杀掉 jamsoul 子进程
app.on('before-quit', killJamsoul)

// 关闭窗口 → 退出整个应用（连带杀掉 jamsoul）
app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
