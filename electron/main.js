const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

// 云端页面地址
const WEB_URL = process.env.JAMONY_WEB_URL || 'http://39.96.30.128'

// jamulus 可执行文件路径（打包后相对于 app.asar）
const JAMULUS_BIN = process.env.JAMULUS_BIN || path.join(__dirname, '..', 'jamulus')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'jamony',
    backgroundColor: '#000000',
    show: false,             // 等加载完再显示，避免白屏闪烁
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,        // preload 需要访问 Node.js API
    },
  })

  // 加载 loading 页先
  mainWindow.loadFile(path.join(__dirname, 'loading.html'))

  // 然后后台加载云端页面
  mainWindow.loadURL(WEB_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 打开 DevTools 快捷键（开发期方便调试，发布时注释掉）
  // mainWindow.webContents.openDevTools()
}

// 调起 jamulus 子进程
function launchJamulus(serverIp, port) {
  const args = ['--server', serverIp, '--port', String(port)]

  console.log(`[jamony] Launching jamulus: ${JAMULUS_BIN} ${args.join(' ')}`)

  try {
    const child = spawn(JAMULUS_BIN, args, {
      stdio: 'ignore',
      detached: true,
    })

    child.on('error', (err) => {
      console.error(`[jamony] Failed to launch jamulus: ${err.message}`)
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          console.error("⚠️ jamulus 未找到或启动失败，请确认已正确安装");
        `)
      }
    })

    child.on('exit', (code, signal) => {
      console.log(`[jamony] jamulus exited (code=${code}, signal=${signal})`)
    })

    // 不等待子进程
    child.unref()
    return child
  } catch (err) {
    console.error(`[jamony] Error launching jamulus: ${err.message}`)
    return null
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

  launchJamulus(payload.serverIp, payload.port)

  // 通知网页端 jamulus 已启动
  if (mainWindow) {
    mainWindow.webContents.send('jamulus-launched', { ok: true })
  }
})

// ══════════════════════════════════════
// 生命周期
// ══════════════════════════════════════
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
