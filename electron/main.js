const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

// 云端页面地址
const WEB_URL = process.env.JAMONY_WEB_URL || 'http://39.96.30.128'

// jamsoul 可执行文件路径
// 开发模式：../dist/jamsoul-bin/jamsoul
// 打包后：{resourcesPath}/jamsoul-bin/jamsoul (Mac) / jamsoul.exe (Win)
const isPackaged = app.isPackaged
const JAMSOUL_BIN = process.env.JAMSOUL_BIN || (
  isPackaged
    ? path.join(process.resourcesPath, 'jamsoul-bin', process.platform === 'win32' ? 'jamsoul.exe' : 'jamsoul')
    : path.join(__dirname, '..', 'dist', 'jamsoul-bin', process.platform === 'win32' ? 'jamsoul.exe' : 'jamsoul')
)

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

// 调起 jamsoul 子进程
function launchJamsoul(serverIp, port) {
  // 使用 jamulus 原生的 --connect 参数自动连接服务器
  const args = ['--connect', `${serverIp}:${port}`]

  console.log(`[jamony] Launching jamsoul: ${JAMSOUL_BIN} ${args.join(' ')}`)

  try {
    const child = spawn(JAMSOUL_BIN, args, {
      stdio: 'ignore',
      detached: true,
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
    })

    // 不等待子进程
    child.unref()
    return child
  } catch (err) {
    console.error(`[jamony] Error launching jamsoul: ${err.message}`)
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

  launchJamsoul(payload.serverIp, payload.port)

  // 通知网页端 jamsoul 已启动
  if (mainWindow) {
    mainWindow.webContents.send('jamsoul-launched', { ok: true })
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
