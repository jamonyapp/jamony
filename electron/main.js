const { app, BrowserWindow, ipcMain, session, dialog, net, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn, execSync } = require('child_process')

// jamony 10-07: jamsoul 音质档自动迁移（NORMAL→HIGH）
// 旧版默认 NORMAL(1) 对密集素材出 Opus 编码伪影（欢哥单变量实验定罪）；INI 里写死的旧值会压过
// 新二进制的默认值 → 调起 jamsoul 前若读到 1（旧默认、用户从未主动改过的特征值）就改写为 2。
// 只在 spawn 前执行（此刻 jamsoul 必不在跑），天然避开 QSettings 退出回写的竞态；改完=2 后永不再碰。
function migrateJamsoulAudioQuality() {
  try {
    const iniPath = process.platform === 'win32'
      ? path.join(process.env.APPDATA || '', 'jamony', 'jamsoul.ini')
      : path.join(os.homedir(), '.config', 'jamony', 'jamsoul.ini')
    if (!fs.existsSync(iniPath)) return
    const raw = fs.readFileSync(iniPath, 'utf8')
    if (raw.includes('<audioquality>1</audioquality>')) {
      fs.writeFileSync(iniPath, raw.replace('<audioquality>1</audioquality>', '<audioquality>2</audioquality>'))
      console.log('[jamony] jamsoul 音质档已迁移 NORMAL→HIGH:', iniPath)
    }
  } catch (e) { console.log('[jamony] 音质迁移跳过:', e.message) }
}

// 云端页面地址
// 1021 起正式壳指向 ECS 新机（旧轻量已退居回退/staging；将来域名包日再切 app.jamonyapp.com）
const WEB_URL = process.env.JAMONY_WEB_URL || 'http://123.57.33.130'

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

/* ============ 1031 壳自动更新（欢哥裁定架构：版本探测→弹窗→签名URL下载；安装包走 OSS 不碰 EIP 合奏管道）============
 * 流程：启动+每4h → GET /api/version/latest（几百字节）→ 版本比对 → 房间礼仪闸 → 品牌弹窗
 *   → 立即更新：Mac=下载 dmg+打开拖装（半自动·欢哥裁定）/ Win=下载 exe+运行安装器
 *   → 稍后：本次运行静默+下次启动再问（永不加码，不跳过版本——工具诚实用户自主哲学）
 */
let updateDeferred = false      // 用户点了稍后 → 本次运行内不再弹（承诺①）
let updateWindow = null          // 更新弹窗引用（防重复开）
let updateTimer = null           // 4h 定时器

async function checkForUpdate(silent = false) {
  if (updateWindow || updateDeferred) return  // 已在弹窗中 / 用户已说稍后
  try {
    const currentVersion = app.getVersion()
    const res = await net.fetch(`${WEB_URL}/api/version/latest`)
    if (!res.ok) return
    const data = await res.json()
    if (!data.ok || !data.update || !data.version) return
    // 版本比对（semver 简比：逐段数字）
    const cur = currentVersion.split('.').map(Number)
    const neu = data.version.split('.').map(Number)
    let hasNew = false
    for (let i = 0; i < Math.max(cur.length, neu.length); i++) {
      const a = cur[i] || 0, b = neu[i] || 0
      if (b > a) { hasNew = true; break }
      if (b < a) break
    }
    if (!hasNew) return
    // 房间礼仪闸：正在房间内（jamsoul 在跑 / currentRoom 有值）=不打扰（宪法：合奏中神圣不可侵犯）
    if (jamsoulProcess || currentRoom) {
      console.log('[jamony] 更新检测到新版本但用户在房间内，礼仪闸压下')
      return  // 下次对账周期再试（不弹窗）
    }
    showUpdateDialog(data)
  } catch (e) {
    if (!silent) console.log('[jamony] 版本检测失败（静默）:', e.message)
  }
}

function showUpdateDialog(data) {
  if (updateWindow) return
  const plat = process.platform === 'darwin' ? 'mac' : 'win'
  const dl = data.downloads && data.downloads[plat]
  if (!dl || !dl.url) {
    console.log('[jamony] 版本端点无本平台下载地址')
    return
  }
  // ⚠️ contextIsolation 必须 false——更新弹窗是自生成 data: URL，按钮要 require('electron')
  // 发 IPC（contextIsolation: true 下 require 不可用=按钮点不动，1031 欢哥实测定罪）
  updateWindow = new BrowserWindow({
    width: 400, height: 340, resizable: false, minimizable: false, maximizable: false,
    title: 'jamony 更新', backgroundColor: '#000000', show: false,
    parent: mainWindow, modal: true,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  })
  // 更新日志（1031 欢哥定稿：用户视角不割裂 jamsoul/jamony——一律 jamony；编号列表制）
  const items = []
  for (const c of (data.changelog || [])) items.push(...(c.items || []))
  const changelogHtml = items.length > 0
    ? `<div style="color:#888;font-size:11px;margin-bottom:6px">更新内容：</div>` + items.map((i, n) => `<div style="color:#C8C8C8;font-size:12px;line-height:1.7">${n + 1}. ${i}</div>`).join('')
    : '<span style="color:#666;font-size:12px">优化与修复</span>'
  const sizeMb = dl.size > 1024 * 1024 ? `（约 ${Math.round(dl.size / 1024 / 1024)}MB）` : ''
  updateWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html><head><meta charset="utf-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#000; color:#fff; font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif; padding:20px; user-select:none; display:flex; flex-direction:column; height:100vh; }
      h2 { font-size:15px; margin-bottom:4px; flex-shrink:0; }
      .ver { color:#9933FF; font-weight:700; }
      .sub { color:#888; font-size:11px; margin-bottom:14px; flex-shrink:0; }
      .changelog { flex:1; overflow-y:auto; background:#0d0d0d; border:1px solid #1a1a1a; border-radius:8px; padding:12px; min-height:0; }
      .btns { display:flex; gap:8px; margin-top:14px; flex-shrink:0; }
      .btn { flex:1; padding:9px 0; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }
      .btn-update { background:linear-gradient(135deg,#00AAFF,#9933FF); color:#fff; }
      .btn-later { background:#1a1a1a; color:#888; border:1px solid #2a2a2a; }
      .dl-progress { display:none; margin-top:12px; flex-shrink:0; }
      .dl-bar { height:4px; background:#1a1a1a; border-radius:2px; overflow:hidden; }
      .dl-fill { height:100%; background:linear-gradient(90deg,#00AAFF,#9933FF); width:0%; transition:width .3s; }
      .dl-text { color:#888; font-size:11px; margin-top:5px; text-align:center; }
    </style></head><body>
      <h2>jamony <span class="ver">${data.version}</span> 可用</h2>
      <div class="sub">当前版本 ${app.getVersion()}${sizeMb}</div>
      <div class="changelog">${changelogHtml}</div>
      <div class="btns">
        <button class="btn btn-later" onclick="require('electron').ipcRenderer.send('update-later')">稍后</button>
        <button class="btn btn-update" id="btnGo" onclick="require('electron').ipcRenderer.send('update-go')">立即更新</button>
      </div>
      <div class="dl-progress" id="dlProg">
        <div class="dl-bar"><div class="dl-fill" id="dlFill"></div></div>
        <div class="dl-text" id="dlText">准备下载…</div>
      </div>
    </body></html>
  `)}`)
  updateWindow.once('closed', () => { updateWindow = null })
  // IPC：稍后 / 立即更新（一次性注册·防重复）
  if (ipcMain.listeners('update-later').length === 0) {
    ipcMain.on('update-later', () => { updateDeferred = true; if (updateWindow) updateWindow.close() })
    ipcMain.on('update-go', async () => {
      try {
        if (updateWindow) updateWindow.webContents.executeJavaScript("document.getElementById('btnGo').disabled=true;document.getElementById('dlProg').style.display='block'")
        const isMac = process.platform === 'darwin'
        const dlUrl = isMac ? data.downloads.mac.url : data.downloads.win.url
        const ext = isMac ? 'dmg' : 'exe'
        const dlPath = path.join(app.getPath('downloads'), `jamony-${data.version}.${ext}`)
        console.log('[jamony] 更新下载:', dlUrl.slice(0, 80), '→', dlPath)
        const resp = await net.fetch(dlUrl)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const buf = await resp.arrayBuffer()
        fs.writeFileSync(dlPath, Buffer.from(buf))
        if (updateWindow) {
          updateWindow.webContents.executeJavaScript(`document.getElementById('dlFill').style.width='100%';document.getElementById('dlText').textContent='下载完成，正在打开安装包…'`)
        }
        shell.openPath(dlPath)
        setTimeout(() => { if (updateWindow) updateWindow.close() }, 1500)
      } catch (e) {
        console.error('[jamony] 更新下载失败:', e.message)
        if (updateWindow) updateWindow.webContents.executeJavaScript(`document.getElementById('dlText').textContent='下载失败：${e.message}'`)
      }
    })
  }
  updateWindow.once('ready-to-show', () => updateWindow.show())
}

// 启动 5s 后首次探测（等 web 页面加载完，不影响启动速度）；之后每 4h
// 房间礼仪闸隐含在 checkForUpdate 内部：在房间→静默跳过本轮（下轮 4h 再试）
function startUpdateChecker() {
  setTimeout(() => checkForUpdate(true), 5000)
  updateTimer = setInterval(() => checkForUpdate(true), 4 * 60 * 60 * 1000)
}

function createWindow() {
  // #3 安全白名单：只允许白名单域加载，防注入恶意页面（file: 本地页 + 内测IP + 公测域名）
  const ALLOWED_HOSTS = ['39.96.30.128', '123.57.33.130', 'jamonyapp.com', 'localhost', '127.0.0.1']
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const u = new URL(details.url)
      const allowed = u.protocol === 'file:' || u.protocol === 'chrome:' || u.protocol === 'devtools:' || u.protocol === 'data:'  // 1031: data: for update dialog (self-generated only, not user input)
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
      // jamony 10-23: 版本号喂给 preload（反馈收集随请求上报——公测散版本排查的第一道过滤，欢哥拍板提前做）
      additionalArguments: [`--jamony-version=${app.getVersion()}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      plugins: true,  // jamony 10-07: 开启 Chromium 内置 PDF 查看器（乐谱共享投 PDF，不开则 iframe 灰屏）
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
        { label: '检查更新…', click: () => { updateDeferred = false; checkForUpdate(false) } }, { type: 'separator' },
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

  // jamony 10-02: 菜单没了，devtools/刷新快捷键自注册（原靠默认菜单 role，删菜单必补）
  // F12 / Ctrl+Shift+I (Win) / Cmd+Opt+I (Mac) = devtools；Cmd+Opt+J/Ctrl+Shift+J 也开
  // F5 / Ctrl+R / Cmd+R = 普通刷新；Ctrl+Shift+R / Ctrl+F5 / Cmd+Shift+R = 强刷绕缓存
  // （Electron 缓存顽固症对症药；强刷保房已工程化，刷新不断房）
  // ⚠️ Mac 的 Opt+I 是死键(ˆ)，input.key 不是 'i' —— I/J 判断必须用物理键码 input.code（10-09 欢哥实测 Cmd+Opt+I 失效根因）
  mainWindow.webContents.on('before-input-event', (e, input) => {
    const k = (input.key || '').toLowerCase()
    if (input.type !== 'keyDown') return
    const isI = k === 'i' || input.code === 'KeyI'
    const isJ = k === 'j' || input.code === 'KeyJ'
    if (k === 'f12' ||
        (input.control && input.shift && isI) ||
        (input.meta && input.alt && (isI || isJ))) {
      mainWindow.webContents.toggleDevTools()
      e.preventDefault()
    } else if (k === 'f5' ||
               ((input.control || input.meta) && !input.shift && k === 'r')) {
      mainWindow.webContents.reload()
      e.preventDefault()
    } else if ((input.control && (input.shift || k === 'f5') && (k === 'r' || k === 'f5')) ||
               (input.meta && input.shift && k === 'r')) {
      mainWindow.webContents.reloadIgnoringCache()
      e.preventDefault()
    }
  })

  // jamony: jamsoul 跟随前置 (点击 jamony → jamsoul 跟随到最前, 不抢焦点; 不跟随移动——跨进程跟随移动卡顿)
  mainWindow.on('focus', () => sendToJamsoul({ cmd: 'raise' }))

  // jamony: 叉掉窗口时（在房间=合奏者或听众）弹确认，取消则不关窗口
  // 10-07：条件补 currentRoom——漫游态（非房间页 URL）关窗也要可靠发 leave
  mainWindow.on('close', (e) => {
    const isInRoom = mainWindow.webContents.getURL().includes('/room')
    if ((jamsoulProcess || isInRoom || currentRoom) && !isQuitting) {
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
// 10-07: writable 检查有竞态(子进程刚死管道未感知),write 的 EPIPE 同步路径也要兜住
function sendToJamsoul(obj) {
  try {
    if (jamsoulProcess && jamsoulProcess.stdin && jamsoulProcess.stdin.writable) {
      jamsoulProcess.stdin.write(JSON.stringify(obj) + '\n')
    }
  } catch (e) { /* jamsoul 已死,跟随指令丢弃 */ }
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
    migrateJamsoulAudioQuality()  // 10-07: 旧默认 NORMAL 档自动升 HIGH（详见函数注释）
    const child = spawn(JAMSOUL_BIN, args, {
      // jamony 10-10: stdout 也开 pipe——JAMONY_DELAY 延迟上报 IPC（GP 走带指针时延补偿）；
      // 其余 stdout 行照读照扔（防 pipe 积压阻塞 jamsoul）
      stdio: ['pipe', 'pipe', 'ignore'],
      env: jamonyEnv,
    })
    // jamony 10-07: jamsoul 被杀后 stdin 管道写失败以异步 error 事件回来(EPIPE),
    // 不挂监听=uncaught 'error' event→Electron 报错弹窗(欢哥朋友 Win 机实测);静默吞掉
    child.stdin.on('error', (e) => { console.log('[jamony] jamsoul stdin 忽略写失败:', e.code) })
    // jamony 10-10: JAMONY_DELAY IPC——jamsoul 每次 ping 结果(约1s)上报
    // gp(单向输出估计,web直接用)+overall(双向合奏语义)+ping(RTT)。
    // ⚠️向后兼容（1010晚"差变大"事故）：新旧二进制混搭窗口(朋友旧jamsoul/未重启的壳)两值/三值都要能收，
    // 缺的字段不填，web 侧按 gp > overall-ping/2 > 兜底 降级——任何混搭不崩
    child.stdout.on('data', (buf) => {
      for (const line of buf.toString().split('\n')) {
        const m = line.match(/^JAMONY_DELAY (\d+)(?: (\d+))?(?: (\d+))?/)
        if (m && mainWindow && !mainWindow.isDestroyed()) {
          const data = { ts: Date.now() }
          if (m[3] !== undefined) { data.gp = Number(m[1]); data.overall = Number(m[2]); data.ping = Number(m[3]) }
          else { data.overall = Number(m[1]); data.ping = m[2] !== undefined ? Number(m[2]) : 0 }
          mainWindow.webContents.send('jamsoul-delay', data)
        }
      }
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
      // 10-07：进程已正常退出，撤销 kill 兜底定时器（防残留定时器误杀切换后新进程）
      if (killTimer) { clearTimeout(killTimer); killTimer = null }
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
let killTimer = null  // SIGTERM 3 秒兜底定时器（10-07 修：只准杀自己那个进程，防误杀切换后新起的 jamsoul）
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
      const dyingChild = jamsoulProcess
      dyingChild.kill('SIGTERM')
      // 给 jamsoul 3 秒时间优雅退出，超时强制杀死。
      // 10-07 修切换误杀 bug：兜底只对"自己那个进程"生效（比对引用）——
      // 旧 jamsoul 优雅退出后切换房间即刻 spawn 新 jamsoul，原写法只判 jamsoulProcess 非空，
      // 3 秒定时器到点把新进程 SIGKILL 了（症状=切房后 jamsoul"启动后立即退出"）
      if (killTimer) clearTimeout(killTimer)
      killTimer = setTimeout(() => {
        if (jamsoulProcess === dyingChild) {
          try { dyingChild.kill('SIGKILL') } catch (_) {}
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
    // 1012 修（叉窗确认后房间不散+重开变漫游态，nginx 实测 leave 401 定罪）：net.request 无 initiator 上下文，
    // Electron39/Chromium142 按 SameSite=Lax 扣下 jamony_token（老 Electron35 不执行=10-03 换代后悄悄断）。
    // 渲染进程同源 fetch 不受影响（心跳一路 200）。修=显式读 cookie 塞请求头，绕开 SameSite 语义一劳永逸。
    session.defaultSession.cookies.get({ url: WEB_URL })
      .then((cks) => {
        const token = (cks || []).find((c) => c.name === 'jamony_token')
        const req = net.request({ url: `${WEB_URL}/api/rooms/${roomCode}/leave`, method: 'POST', session: session.defaultSession })
        req.setHeader('Content-Type', 'application/json')
        if (token) req.setHeader('Cookie', `jamony_token=${token.value}`)
        req.on('response', (resp) => {
          clearTimeout(timer)
          console.log(`[jamony] leave request done status=${resp.statusCode}`)
          finish(resp.statusCode >= 200 && resp.statusCode < 300)
        })
        req.on('error', (e) => { clearTimeout(timer); console.log('[jamony] leave request error:', e.message); finish(false) })
        req.write(JSON.stringify({ userId }))
        req.end()
      })
      .catch((e) => { clearTimeout(timer); console.log('[jamony] cookie read fail:', e.message); finish(false) })
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
app.whenReady().then(() => {
  createWindow()
  startUpdateChecker()  // 1031 壳自动更新：启动 5s 后首查+每 4h 对账（欢哥裁定架构）
})

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
