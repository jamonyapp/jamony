const { app, BrowserWindow, ipcMain, session, dialog, net, Menu, shell } = require('electron')
const path = require('path')
const { spawn, execSync } = require('child_process')

// 云端页面地址
const WEB_URL = process.env.JAMONY_WEB_URL || 'http://39.96.30.128'

// jamony 10-02: Mac 帮助菜单外链（欢哥后续做官网/FAQ页后改这里即可）
const HELP_SITE_URL = 'https://jamonyapp.com'
const HELP_FAQ_URL = `${WEB_URL}/faq`

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
// jamony 09-30: 启动存活确认的撤销句柄（killJamsoul 主动杀时用）
let pendingLaunchSettle = null
let currentRoom = null  // jamony: 当前所在房间 { roomCode, userId }，供退出时主进程可靠发 leave
let isLastMusician = false  // jamony: 当前用户是否房间唯一合奏者（叉 jamony/dock 退出弹窗文案用）

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

  // jamony 10-02: 干掉原生菜单栏（欢哥拍板：Win 整行移除）。
  // macOS: 系统菜单栏不可移（前台应用必有），瘦身+中文化：jamony+编辑+帮助
  // （编辑核心必须留——Mac 的 Cmd+C/V 等快捷键靠 Edit role 菜单存在，删了输入框没法复制粘贴；
  //   帮助菜单=官网/FAQ入口，欢哥后续做网页，外链用 openExternal 开浏览器不动壳内页面防进房状态被打断）
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'jamony', submenu: [
        { role: 'about', label: '关于 jamony' }, { type: 'separator' },
        { role: 'hide', label: '隐藏 jamony' },
        { role: 'hideOthers', label: '隐藏其他' }, { type: 'separator' },
        { role: 'quit', label: '退出 jamony' }
      ] },
      { label: '编辑', submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' }, { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
      ] },
      { label: '帮助', submenu: [
        { label: 'jamony 官网', click: () => shell.openExternal(HELP_SITE_URL) },
        { label: '常见问题', click: () => shell.openExternal(HELP_FAQ_URL) }
      ] }
    ]))
  } else {
    Menu.setApplicationMenu(null)
  }

  // jamony 10-02: 菜单没了，devtools 快捷键自注册（原靠默认 View 菜单打开）
  // F12 / Ctrl+Shift+I (Win) / Cmd+Opt+I (Mac) —— 调试命根子不能断
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const k = (input.key || '').toLowerCase()
    if (input.type === 'keyDown' &&
        (k === 'f12' ||
         (input.control && input.shift && k === 'i') ||
         (input.meta && input.alt && k === 'i'))) {
      mainWindow.webContents.toggleDevTools()
      e.preventDefault()
    }
  })

  // jamony: jamsoul 跟随前置 (点击 jamony → jamsoul 跟随到最前, 不抢焦点; 不跟随移动——跨进程跟随移动卡顿)
  mainWindow.on('focus', () => sendToJamsoul({ cmd: 'raise' }))

  // jamony: 叉掉窗口时（在房间=合奏者或听众）弹确认，取消则不关窗口
  mainWindow.on('close', (e) => {
    const isInRoom = mainWindow.webContents.getURL().includes('/room')
    if ((jamsoulProcess || isInRoom) && !isQuitting) {
      e.preventDefault()
      dialog.showMessageBox(mainWindow, {
        type: 'question', buttons: ['退出', '取消'], defaultId: 0, title: '退出 jamony',
        message: isLastMusician ? '你当前是唯一合奏者，退出 jamony 将关闭 jamsoul 并解散房间，确认退出？' : (jamsoulProcess ? '退出 jamony 将关闭 jamsoul 并离开房间，确认退出？' : '退出 jamony 将离开当前房间，确认退出？')
      }).then(async ({ response }) => {
        if (response === 0) {
          await sendLeaveRequest()  // jamony: 主进程先可靠发 leave（有界3s），再杀 jamsoul + 关窗
          isQuitting = true
          killJamsoul(true)
          mainWindow.close()  // isQuitting true 不再拦截 → app.quit
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

// jamony: 通过 stdin 给 jamsoul 发窗口跟随指令 (raise/move)
function sendToJamsoul(obj) {
  if (jamsoulProcess && jamsoulProcess.stdin && jamsoulProcess.stdin.writable) {
    jamsoulProcess.stdin.write(JSON.stringify(obj) + '\n')
  }
}

// 调起 jamsoul 子进程
// jamony 09-30 反馈链重做：spawn 成功≠进程活着（Win 缺 DLL/杀软拦截的秒退场景）。
// 3 秒存活确认后才向网页发 ok:true；启动期 exit/error 发 ok:false + 原因，
// 并跳过 jamsoul-exited 广播（避免前端同时收到失败回执又走"切听众"分流打架）
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
    // jamony: 传 jamony 窗口位置给 jamsoul（env），jamsoul 启动时自己设窗口贴附 jamony 右边框 + 等高
    const jamonyEnv = { ...process.env }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const b = mainWindow.getBounds()
      jamonyEnv.JAMONY_BOUNDS = `${b.x + b.width},${b.y},${b.height}`
    }
    const child = spawn(JAMSOUL_BIN, args, {
      stdio: ['pipe', 'ignore', 'ignore'], // jamony: 开 stdin pipe 给 jamsoul 发窗口跟随指令
      env: jamonyEnv,
    })

    // 启动存活确认（结果一次性，防 exit/timeout 双发）
    let launchSettled = false
    const sendLaunchResult = (data) => {
      if (launchSettled) return
      launchSettled = true
      console.log('[jamony] jamsoul-launched:', JSON.stringify(data))
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('jamsoul-launched', data)
      }
    }
    pendingLaunchSettle = sendLaunchResult

    child.on('error', (err) => {
      console.error(`[jamony] Failed to launch jamsoul: ${err.message}`)
      sendLaunchResult({ ok: false, reason: 'spawn-error', message: err.message })
    })

    child.on('exit', (code, signal) => {
      console.log(`[jamony] jamsoul exited (code=${code}, signal=${signal})`)
      jamsoulProcess = null
      if (!launchSettled) {
        // 启动期秒退（缺 DLL/被拦截的典型症状）：只报启动失败，不发 exited
        sendLaunchResult({ ok: false, reason: 'early-exit', code, signal })
        return
      }
      // jamony: jamsoul 退出通知网页（反向交互，让页面感知 jamsoul 关闭）
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('jamsoul-exited', { code, signal })
      }
    })

    // 3 秒仍存活 → 判定启动成功（jamsoulProcess 未被清且仍是本进程）
    setTimeout(() => {
      if (jamsoulProcess === child) sendLaunchResult({ ok: true })
    }, 3000)

    jamsoulProcess = child

    return child
  } catch (err) {
    console.error(`[jamony] Error launching jamsoul: ${err.message}`)
    return null
  }
}

// 清理 jamsoul 子进程
function killJamsoul(immediate = false) {
  // jamony 09-30: 用户主动杀时撤销启动期判定（避免 3 秒内断开被误报"启动失败"弹窗）
  if (pendingLaunchSettle) {
    pendingLaunchSettle({ ok: true, cancelled: true })
    pendingLaunchSettle = null
  }
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

// jamony: 退出前同步发 leave 给服务器（主进程发，不依赖 renderer beforeunload 的竞态）
// 用 net 模块 + 默认 session（自动携带 httpOnly cookie 鉴权）；有界 3s 超时，失败也不阻塞退出
function sendLeaveRequest() {
  return new Promise((resolve) => {
    if (!currentRoom) return resolve(false)
    const { roomCode, userId } = currentRoom
    console.log(`[jamony] Sending leave for room ${roomCode} (user ${userId})`)
    let done = false
    const finish = (ok) => { if (!done) { done = true; currentRoom = null; resolve(ok) } }
    const timer = setTimeout(() => { console.log('[jamony] leave request timeout (3s)'); finish(false) }, 3000)
    try {
      const req = net.request({ url: `${WEB_URL}/api/rooms/${roomCode}/leave`, method: 'POST', session: session.defaultSession })
      req.setHeader('Content-Type', 'application/json')
      req.on('response', () => { clearTimeout(timer); console.log('[jamony] leave request sent ok'); finish(true) })
      req.on('error', (e) => { clearTimeout(timer); console.log('[jamony] leave request error:', e.message); finish(false) })
      req.write(JSON.stringify({ userId }))
      req.end()
    } catch (e) {
      clearTimeout(timer)
      console.log('[jamony] leave request exception:', e.message)
      finish(false)
    }
  })
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
  // jamony 09-30: 不再无条件报成功——结果由 launchJamsoul 3 秒存活确认后发（真启动成功才 ok:true）
})

// 来自网页的 KILL_JAMSOUL 请求（断开合奏时）
ipcMain.on('kill-jamsoul', () => {
  console.log('[jamony] IPC kill-jamsoul received')
  killJamsoul()
})

// jamony 08-27 调试: 手动弹 jamsoul 反馈保护弹窗（验收用, testfeedback 指令走 stdin）
ipcMain.on('test-feedback', () => {
  console.log('[jamony] IPC test-feedback received')
  sendToJamsoul({ cmd: 'testfeedback' })
})

// jamony: 网页进入/离开房间 → 主进程缓存当前房间（退出时据此发 leave）
ipcMain.on('enter-room', (_event, payload) => {
  currentRoom = (payload && payload.roomCode && payload.userId) ? { roomCode: payload.roomCode, userId: payload.userId } : null
  isLastMusician = false  // 进新房间重置（防上个房间残留）
  console.log('[jamony] entered room:', currentRoom)
})
ipcMain.on('leave-room', () => {
  currentRoom = null
  isLastMusician = false
  console.log('[jamony] left room (main cache cleared)')
})
// jamony: 前端告知当前是否唯一合奏者 → 缓存（供叉 jamony/dock 退出弹窗选文案）
ipcMain.on('set-last-musician', (_event, payload) => {
  isLastMusician = !!(payload && payload.value)
  console.log('[jamony] isLastMusician:', isLastMusician)
})

// ══════════════════════════════════════
// 生命周期
// ══════════════════════════════════════
app.whenReady().then(createWindow)

// 退出 jamony 时：在房间（合奏者或听众）弹窗确认 + SIGKILL；不在房间直接退
let isQuitting = false
app.on('before-quit', (e) => {
  if (isQuitting) { killJamsoul(true); return }
  const isInRoom = mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.getURL().includes('/room')
  if (jamsoulProcess || isInRoom) {
    e.preventDefault()
    isQuitting = true
    dialog.showMessageBox(mainWindow, {
      type: 'question', buttons: ['退出', '取消'], defaultId: 0, title: '退出 jamony',
      message: isLastMusician ? '你当前是唯一合奏者，退出 jamony 将关闭 jamsoul 并解散房间，确认退出？' : (jamsoulProcess ? '退出 jamony 将关闭 jamsoul 并离开房间，确认退出？' : '退出 jamony 将离开当前房间，确认退出？')
    }).then(async ({ response }) => {
      if (response === 0) {
        await sendLeaveRequest()  // jamony: 主进程先可靠发 leave（有界3s），再退出
        killJamsoul(true)
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
