const { app, BrowserWindow, ipcMain, session, dialog, net, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn, execFile } = require('child_process') // 1112 P1: execSync 退役(从未用过且会卡UI),换 execFile 异步

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

// jamony 1112 P1/P1.1(VPN韧性): spawn 前识别物理网卡,让 jamsoul 绑定它(--bind-if)——
// 音频包永远从物理门出、源地址恒定,VPN 开关不再引发服务器侧"分轨闪换"(P0 已根除死症,此为残病根修)。
// 哲学=拿不准永远不绑:漏绑=回到 P0 行为(顶多闪换),错绑=大病死。一切识别/预检失败→null。
// 全异步(execFile),绝不阻塞主进程;每次 spawn 现识别不缓存(网络态会变,且低频低成本)。
// P1.1(1112夜·欢哥实测开VPN进房触发): 全局默认路由被隧道劫持成 utun 时第一候选失效——
// 兜底扫 en* 物理网卡问 scoped 路由(隧道劫持的是全局表,劫持不了每网卡自己的网关),候选必过预检才绑。

// (helper) 探针:curl 绑定该接口打 http://<serverIp>/api/ping(EIP:80 直连+Host 头,实测 15ms;
// 探针 IP 用 P0 下发的真实 IP,零硬编码)。200=物理路径真能到服务器;失败/超时=不通,不绑保命
function probeInterface(ifName, serverIp) {
  return new Promise((resolve) => {
    execFile('/usr/bin/curl', ['--interface', ifName, '--connect-timeout', '2', '-s', '-o', '/dev/null',
      '-w', '%{http_code}', '-H', 'Host: app.jamonyapp.com', `http://${serverIp}/api/ping`],
      { timeout: 4000 }, (err, out) => resolve(!err && !!out && out.trim() === '200'))
  })
}

// (helper) 该接口是否自有网关(macOS scoped 默认路由;⭐语法已实弹验证: en0=exit0有gateway / en99=bad interface name)
function hasScopedDefault(ifName) {
  return new Promise((resolve) => {
    execFile('/sbin/route', ['-n', 'get', '-ifscope', ifName, 'default'], { timeout: 3000 },
      (err, stdout) => resolve(!err && /interface:/.test(stdout || '')))
  })
}

async function identifyBindIf(serverIp) {
  if (process.platform !== 'darwin') return null // Win 随 Win 批(IP_UNICAST_IF+htonl 索引,已记账)
  const VIRTUAL_RE = /^(utun|lo\d|awdl|llw|bridge|anpi|ipsec|gif|stf|tap|tun|vlan)/
  const ifaces = os.networkInterfaces()

  // 第一候选:全局默认路由的接口(无 VPN 的常态;macOS 物理网卡恒为 en 系=WiFi/网线/USB网卡)
  const routeOut = await new Promise((resolve) => {
    execFile('/sbin/route', ['-n', 'get', 'default'], { timeout: 3000 }, (err, stdout) => resolve(err ? '' : stdout))
  })
  const m = routeOut.match(/interface:\s*(\S+)/)
  const defaultIf = m ? m[1] : ''
  const defVirtual = !defaultIf || VIRTUAL_RE.test(defaultIf)

  let candidate = null
  if (!defVirtual) {
    const ni = ifaces[defaultIf] || []
    if (ni.some(a => a && (a.family === 'IPv4' || a.family === 4) && !a.internal)) {
      candidate = defaultIf
    } else {
      console.log(`[jamony] bind-if: ${defaultIf} 无 IPv4,不绑`)
    }
  } else {
    // P1.1 兜底:默认路由已被隧道接管(开 VPN 进房)——扫 en* 找"自己有网关"的物理网卡
    const enIfs = Object.keys(ifaces).filter(n => /^en\d+$/.test(n) &&
      (ifaces[n] || []).some(a => a && (a.family === 'IPv4' || a.family === 4) && !a.internal))
    for (const n of enIfs) {
      if (await hasScopedDefault(n)) { candidate = n; break }
    }
    console.log(`[jamony] bind-if: 默认路由=${defaultIf || '无'}(被隧道接管),ifscope 扫描 en 系→候选=${candidate || '无'}`)
  }
  if (!candidate) { console.log('[jamony] bind-if: 无物理候选,不绑(P0 行为)'); return null }

  // 预检策略:默认路由=物理且无 utun 在场→显然该绑,零预检零加时;其余(有 VPN/来自兜底)→必检
  const vpnPresent = Object.keys(ifaces).some(n => /^utun/.test(n))
  if (!vpnPresent && !defVirtual) {
    console.log(`[jamony] bind-if: ${candidate}(默认路由,无 VPN,直接绑)`)
    return candidate
  }
  const ok = await probeInterface(candidate, serverIp)
  console.log(`[jamony] bind-if: ${candidate}(需预检:${ok ? '200 通过,绑' : '失败,不绑保命'})`)
  return ok ? candidate : null
}

// 云端页面地址
// 1102 域名时代：直接 https（一步到位，不吃未来 80 收口的 301）；老包 IP 直连由 nginx default_server 80 兜底
const WEB_URL = process.env.JAMONY_WEB_URL || 'https://app.jamonyapp.com'

// 1102: E2E 隔离用——指定独立 userData 目录，避免源码跑壳与已装客户端抢同一 profile
// （Chromium LevelDB 单写者；不设此项则默认 ~/Library/Application Support/jamony）
if (process.env.JAMONY_USER_DATA) app.setPath('userData', process.env.JAMONY_USER_DATA)

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

/* ============ 1112 P2/P2.1/1113 单测批: jamsoul 断线壳自愈（VPN 韧性全案） ============
 * 状态机纯逻辑核心已抽至 respawn-state.js（相位机/三道闸/世代号/饥荒兜底/退避——见该文件头注释,
 * 16 场景矩阵有 vitest 用例 respawn-state.test.js）。此处只保留副作用实现（杀/拉起/查房/网卡识别/
 * banner/遥测）并注入 core。行为与抽离前逐行等价——重构目的: 逻辑与壳副作用分家+可测。
 */
const { createRespawnCore } = require('./respawn-state')

/* ============ 1031 壳自动更新（欢哥裁定架构：版本探测→弹窗→签名URL下载；安装包走 OSS 不碰 EIP 合奏管道）============
 * 流程：启动+每4h → GET /api/version/latest（几百字节）→ 版本比对 → 房间礼仪闸 → 品牌弹窗
 *   → 立即更新：Mac=下载 dmg+打开拖装（半自动·欢哥裁定）/ Win=下载 exe+运行安装器
 *   → 稍后：本次运行静默+下次启动再问（永不加码，不跳过版本——工具诚实用户自主哲学）
 */
let updateDeferred = false      // 用户点了稍后 → 本次运行内不再弹（承诺①）
let updateWindow = null          // 更新弹窗引用（防重复开）
let infoWindow = null            // 「已是最新/检查失败」小信息窗引用（1102）
let updateTimer = null           // 4h 定时器

async function checkForUpdate(silent = false, force = false) {
  if (updateWindow || infoWindow) return  // 已在弹窗中
  if (!force && updateDeferred) return  // 用户已说稍后（手动触发时 force 绕过）
  try {
    const currentVersion = app.getVersion()
    const res = await net.fetch(`${WEB_URL}/api/version/latest`)
    if (!res.ok) {
      // 1102: 手动检查必须有回执（欢哥实测定罪：点了没反应=静默 return）；自动探测保持静默
      if (force) showUpdateInfoDialog('检查更新失败', `服务器无响应（HTTP ${res.status}），请稍后再试。`)
      return
    }
    const data = await res.json()
    if (!data.ok || !data.update || !data.version) {
      // 1102: update:false=无发布版本/版本对齐——手动点击弹「已是最新版本」，自动探测静默
      if (force) {
        if (data.ok) showUpdateInfoDialog('jamony', `当前已是最新版本。（v${currentVersion}）`)
        else showUpdateInfoDialog('检查更新失败', '版本服务异常，请稍后再试。')
      }
      return
    }
    // 版本比对（semver 简比：逐段数字）
    const cur = currentVersion.split('.').map(Number)
    const neu = data.version.split('.').map(Number)
    let hasNew = false
    for (let i = 0; i < Math.max(cur.length, neu.length); i++) {
      const a = cur[i] || 0, b = neu[i] || 0
      if (b > a) { hasNew = true; break }
      if (b < a) break
    }
    if (!hasNew) {
      if (force) showUpdateInfoDialog('jamony', `当前已是最新版本。（v${currentVersion}）`)
      return
    }
    // 房间礼仪闸：自动探测（非 force）在房间内=不打扰；用户主动点击（force）=绕过闸直接弹
    // （1031 欢哥实测定罪：手动点检查更新被礼仪闸吞=「点了没反应」——礼仪管自动，不管手动）
    if (!force && (jamsoulProcess || currentRoom)) {
      console.log('[jamony] 更新检测到新版本但用户在房间内，礼仪闸压下（自动探测）')
      return
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
  // IPC：稍后 / 立即更新（一次性注册·防重复；jamony-check-update 已移至 startUpdateChecker 顶层）
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

// 1102: 手动「检查更新」的回执小窗（无更新/失败）——与更新弹窗同一视觉语言（黑底/#9933FF/渐变按钮）
// 判例来源：版本对齐时 force 点击被静默 return =「点了没反应」，欢哥定稿文案「当前已是最新版本。」
function showUpdateInfoDialog(title, sub) {
  if (infoWindow) return
  infoWindow = new BrowserWindow({
    width: 340, height: 168, resizable: false, minimizable: false, maximizable: false,
    title: 'jamony', backgroundColor: '#000000', show: false,
    parent: mainWindow, modal: true,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  })
  infoWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html><head><meta charset="utf-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#000; color:#fff; font-family:-apple-system,'Segoe UI','Noto Sans SC',sans-serif; padding:22px 20px 18px; user-select:none; display:flex; flex-direction:column; height:100vh; }
      h2 { font-size:15px; margin-bottom:5px; }
      .sub { color:#888; font-size:12px; line-height:1.6; }
      .btns { display:flex; margin-top:auto; }
      .btn { flex:1; padding:9px 0; border:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; background:linear-gradient(135deg,#00AAFF,#9933FF); color:#fff; }
    </style></head><body>
      <h2>${title}</h2>
      <div class="sub">${sub}</div>
      <div class="btns"><button class="btn" onclick="require('electron').ipcRenderer.send('update-info-ok')">好</button></div>
    </body></html>
  `)}`)
  infoWindow.once('closed', () => { infoWindow = null })
  // IPC：好（一次性注册·防重复，同 update-later/update-go 模式）
  if (ipcMain.listeners('update-info-ok').length === 0) {
    ipcMain.on('update-info-ok', () => { if (infoWindow) infoWindow.close() })
  }
  infoWindow.once('ready-to-show', () => infoWindow.show())
}

// 启动 5s 后首次探测（等 web 页面加载完，不影响启动速度）；之后每 4h
// 房间礼仪闸隐含在 checkForUpdate 内部：在房间→静默跳过本轮（下轮 4h 再试）
function startUpdateChecker() {
  setTimeout(() => checkForUpdate(true), 5000)
  updateTimer = setInterval(() => checkForUpdate(true), 4 * 60 * 60 * 1000)
  // 1031 web 侧 IPC 入口（顶层注册；force=true 绕过稍后标记+房间礼仪闸——用户主动点击要的是弹窗，不是被吞）
  ipcMain.on('jamony-check-update', () => { updateDeferred = false; checkForUpdate(false, true) })
}

function createWindow() {
  // #3 安全白名单：只允许白名单域加载，防注入恶意页面（file: 本地页 + 内测IP + 公测域名）
  // 1031: aliyuncs.com = OSS 下载桶（安装包/更新包走签名 URL 下载，欢哥裁定走 OSS 不碰 EIP 合奏管道）
  const ALLOWED_HOSTS = ['39.96.30.128', '123.57.33.130', 'jamonyapp.com', 'localhost', '127.0.0.1', 'aliyuncs.com']
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
        { label: '检查更新…', click: () => { updateDeferred = false; checkForUpdate(false, true) } }, { type: 'separator' },
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
          respawn.suppress()  // 1112 P2 闸①: 确认退出绝不复活
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
  // 1109 强登录修正: ERR_ABORTED=导航被新导航中止(登出302链/SPA跳转常见), 不是断网——不过滤会误显「乐器没插线」
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDesc, validatedURL) => {
    if (errorDesc === 'ERR_ABORTED') return
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
function launchJamsoul(serverIp, port, nickname, bindIf) {
  // jamony: 排重——jamsoul 已启动则不重启（避免硬刷新重复启动多个 jamsoul）
  if (jamsoulProcess) {
    console.log('[jamony] jamsoul already running, skip launch')
    if (mainWindow) { mainWindow.webContents.send('jamsoul-launched', { ok: true, alreadyRunning: true }) }
    return jamsoulProcess
  }
  // 使用 jamulus 原生的 --connect 参数自动连接服务器；--clientname 传 jamony 昵称（调音台 fader tag 显示）
  const args = ['--connect', `${serverIp}:${port}`]
  if (nickname) args.push('--clientname', nickname)
  // 1112 P1: 绑物理网卡(壳决策见 identifyBindIf;C++ 一次 setsockopt 执行)。null=不绑=P0 行为
  if (bindIf) args.push('--bind-if', bindIf)

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
        if (m) {
          respawn.onHeartbeat()  // 活连接实证——零换防复活/换防成功收官/稳定锚点(逻辑在 respawn-state.js)
          if (mainWindow && !mainWindow.isDestroyed()) {
            const data = { ts: Date.now() }
            if (m[3] !== undefined) { data.gp = Number(m[1]); data.overall = Number(m[2]); data.ping = Number(m[3]) }
            else { data.overall = Number(m[1]); data.ping = m[2] !== undefined ? Number(m[2]) : 0 }
            mainWindow.webContents.send('jamsoul-delay', data)
          }
        }
        // 1112 P2: 断线事件（C++ 30s 无入包 emit Disconnected 上报，clientdlg.cpp）
        if (/^JAMONY_DISCONNECTED/.test(line)) respawn.onJamsoulDisconnected()
      }
    })

    // 启动存活确认（结果一次性，防 exit/timeout 双发）
    let launchSettled = false
    const sendLaunchResult = (data) => {
      if (launchSettled) return
      launchSettled = true
      console.log('[jamony] jamsoul-launched:', JSON.stringify(data))
      // 1112 P2/P2.1: 自愈期（任何非 idle 相位）回执不惊动 web（ok:false 的失败由看门狗退避接管，不弹窗）
      if (respawn.isHealing()) return
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
      // 1112 P2: 迟到 exit 守卫——SIGKILL 超时路径下壳已 spawn 新进程，旧进程 exit 事件迟到
      // 若无条件清 jamsoulProcess 会误杀新进程引用（孤儿/双 spawn），迟到的直接忽略
      if (jamsoulProcess !== child) {
        console.log('[jamony] P2: 旧进程迟到 exit，忽略（当前已换防）')
        return
      }
      jamsoulProcess = null
      // 10-07：进程已正常退出，撤销 kill 兜底定时器（防残留定时器误杀切换后新进程）
      if (killTimer) { clearTimeout(killTimer); killTimer = null }
      if (!launchSettled) {
        // 启动期秒退（缺 DLL/被拦截的典型症状）：只报启动失败，不发 exited
        sendLaunchResult({ ok: false, reason: 'early-exit', code, signal })
        // 1112 P2/P2.1: respawn 的子进程秒退 = 本次尝试直接失败，不等 10s 看门狗
        respawn.notifySpawnEarlyExit()  // 秒退=本次尝试直接失败,不等看门狗(逻辑在 core)
        return
      }
      // 1112 P2/P2.1: 自愈期（任何非 idle 相位）exit 不广播 web——两处消费者（playing 页/漫游
      // RoomSessionProvider）收到即切听众/解散房间，必须瞒住；放弃（giveUp）时 phase 已回 idle，
      // 广播自然放行。netdown 期间用户手动退 jamsoul 的极端场景：exit 同样被压住，网回后自愈
      // 换防会把它拉回来（音乐回来优先于"手动退出不复活"教条——后者只约束网正常的场景）
      if (respawn.isHealing()) {
        console.log('[jamony] P2.1: 自愈期 exit 不广播 web（透明）')
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

// ════════════════════════════════════════
// 1112 P2: jamsoul 断线壳自愈——副作用实现 + core 注入（逻辑见 respawn-state.js）
// ════════════════════════════════════════

// ---- banner 事件（P2.1 差距四）：中间态对用户可见，不再是纯透明 ----
// stage: 'netdown'=网络已断开等待恢复 | 'healing'=正在换防恢复；收官发 jamsoul-reconnected。
// 旧 web 不认识这些事件=无害降级；新 web 收不到（旧壳）也无害
function sendBanner(stage) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('jamsoul-reconnecting', { stage })
}
function sendRecovered(respawns) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('jamsoul-reconnected', { respawns })
}

// ---- 遥测队列（P2.1 小项三）：断线事件恰在断网时发生，不缓存则丢最关键数据 ----
// 入队即尽力 flush；失败留队，下次任意事件/online 事件再冲；cap 100 丢旧防膨胀
const telemetryQueue = []
let telemetryBusy = false
let telemetryRetryTimer = null  // 1113 P2.1.1: flush 失败定时重试——实测教训:网回瞬间的 flush 撞上
                               // "网未稳窗口"失败后,SPA 可能已死无心跳/无新事件,旧设计无钩子再触发=队列滞留丢数据
function telemetryEnqueue(type, payload) {
  if (telemetryQueue.length >= 100) telemetryQueue.shift()
  telemetryQueue.push({ type, payload: payload || {}, ts: Date.now() })
  telemetryFlush()
}
function scheduleTelemetryRetry() {
  if (telemetryRetryTimer || telemetryQueue.length === 0) return
  telemetryRetryTimer = setTimeout(() => {
    telemetryRetryTimer = null
    telemetryFlush()
  }, 30000)
}
function telemetryFlush() {
  if (telemetryRetryTimer) { clearTimeout(telemetryRetryTimer); telemetryRetryTimer = null }
  if (telemetryBusy || telemetryQueue.length === 0 || !respawn.isNetOnline()) return
  if (!mainWindow || mainWindow.isDestroyed()) return
  telemetryBusy = true
  const batch = telemetryQueue.splice(0, 20)
  const fail = () => { telemetryQueue.unshift(...batch); telemetryBusy = false; scheduleTelemetryRetry() }
  const finish = () => { telemetryBusy = false; if (telemetryQueue.length > 0) setImmediate(telemetryFlush) }
  session.defaultSession.cookies.get({ url: WEB_URL })
    .then((cks) => {
      const token = (cks || []).find((c) => c.name === 'jamony_token')
      const req = net.request({ url: `${WEB_URL}/api/telemetry/events`, method: 'POST', session: session.defaultSession })
      req.setHeader('Content-Type', 'application/json')
      if (token) req.setHeader('Cookie', `jamony_token=${token.value}`)
      req.on('response', (resp) => {
        resp.on('data', () => {})  // 必须消费 body 否则连接挂起
        resp.on('end', () => {
          if (resp.statusCode >= 200 && resp.statusCode < 300) finish()
          else fail()
        })
      })
      req.on('error', fail)
      req.end(JSON.stringify({ events: batch, v: app.getVersion(), platform: process.platform }))
    })
    .catch(fail)
}

// ---- 状态机 core 实例化（纯逻辑在 respawn-state.js；此处注入副作用实现） ----
const respawn = createRespawnCore({
  log: (...a) => console.log(...a),
  isArmed: () => !!(jamsoulProcess && currentRoom && !isQuitting && mainWindow && !mainWindow.isDestroyed()),
  hasProcess: () => !!jamsoulProcess,
  sendBanner,
  sendRecovered,
  telemetry: telemetryEnqueue,
  checkRoomAlive,   // 声明提升: 定义在下方,运行时引用
  killForRespawn,   // 同上
  identifyBindIf,
  launchJamsoul,
  onOnlineSideEffect: () => {
    telemetryFlush()  // 断网期间攒的遥测补报
    // 1113 P2.1.1: 网回自动回家——SPA 若在断网窗口被顶到 offline.html,这里把它带回云端
    //（页面层 offline.html 自带 3s 自动重试+online 监听,此处是壳侧双保险：页面 JS 万一死掉仍有出口）
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.getURL().includes('offline.html')) {
      console.log('[jamony] P2.1.1: 网络恢复且当前在断网页，自动回家')
      mainWindow.loadURL(WEB_URL)
    }
  },
  onGiveUp: () => {
    if (jamsoulProcess) {
      killJamsoul()  // exit handler 此时 phase=idle → jamsoul-exited 正常广播
    } else if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jamsoul-exited', { code: null, signal: null })
    }
  },
})

// 闸③: 重生前查房。返回 true=房在；false=明确没了（401 登出/封号、403 被清出、404 散房）；
// null=不可判定（网络错误/超时/5xx）——照试，失败自然进退避。
// （net.request + 显式读 cookie 塞请求头，照 sendLeaveRequest 模式——无 initiator 上下文，
//   SameSite=Lax 会扣下 jamony_token）
function checkRoomAlive() {
  return new Promise((resolve) => {
    if (!currentRoom) return resolve(false)
    const roomCode = currentRoom.roomCode
    let done = false
    let timer = null
    const finish = (v) => { if (!done) { done = true; if (timer) clearTimeout(timer); resolve(v) } }
    timer = setTimeout(() => finish(null), 5000)
    session.defaultSession.cookies.get({ url: WEB_URL })
      .then((cks) => {
        const token = (cks || []).find((c) => c.name === 'jamony_token')
        const req = net.request({ url: `${WEB_URL}/api/rooms/${encodeURIComponent(roomCode)}`, method: 'GET', session: session.defaultSession })
        if (token) req.setHeader('Cookie', `jamony_token=${token.value}`)
        req.on('response', (resp) => {
          let body = ''
          resp.on('data', (c) => { body += c })
          resp.on('end', () => {
            try {
              const d = JSON.parse(body)
              finish(resp.statusCode === 200 && d && d.ok && d.room ? true
                : [401, 403, 404].includes(resp.statusCode) ? false
                : null)
            } catch { finish(null) }
          })
        })
        req.on('error', () => finish(null))
        req.end()
      })
      .catch(() => finish(null))
  })
}

// 自愈换防的杀: SIGTERM 优雅 → 等 exit（≤2.5s）→ SIGKILL 兜底。
// （不动 killJamsoul/killTimer——那条路是用户主动杀，这条是机器换防，互不干扰）
function killForRespawn() {
  const dying = jamsoulProcess
  if (!dying) return Promise.resolve()
  return new Promise((resolve) => {
    dying.kill('SIGTERM')
    const t = setTimeout(() => {
      try { dying.kill('SIGKILL') } catch (_) {}
      if (jamsoulProcess === dying) jamsoulProcess = null
      resolve()
    }, 2500)
    dying.once('exit', () => { clearTimeout(t); resolve() })
  })
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
ipcMain.on('join-room', async (_event, payload) => {
  console.log(`[jamony] IPC join-room received:`, payload)

  if (!payload || !payload.serverIp || !payload.port) {
    console.error('[jamony] Invalid join-room payload:', payload)
    return
  }

  // 1112 P2/P2.1: 缓存 spawn 参数 + 自愈重武装（新的一次主动调起 = 新周期；顺带作废上一轮残留流程）
  respawn.rearm({ serverIp: payload.serverIp, port: payload.port, nickname: payload.nickname })  // 缓存+重武装(作废上一轮残留)

  // 1112 P1: spawn 前异步识别物理网卡(无 VPN≈几十 ms;有 VPN 多一次预检;绝不卡 UI)。
  // 结果走 jamsoul-launched 事件回传,handler 异步化不影响反馈链。
  const bindIf = await identifyBindIf(payload.serverIp)
  launchJamsoul(payload.serverIp, payload.port, payload.nickname, bindIf)
  // jamony 09-30: 不再无条件报成功——结果由 launchJamsoul 3 秒存活确认后发（真启动成功才 ok:true）
})

// 来自网页的 KILL_JAMSOUL 请求（断开合奏时）
ipcMain.on('kill-jamsoul', () => {
  console.log('[jamony] IPC kill-jamsoul received')
  respawn.suppress()  // 1112 P2 闸①: 主动杀绝不复活
  killJamsoul()
})

// 1112 P2.1: renderer 网络事件（preload 监听 window online/offline 原生事件转发——
// Chromium 内核网络监听零延迟,拔线/断WiFi/VPN 开关的瞬间即知,优于任何轮询）
ipcMain.on('net-online', () => { respawn.onNetOnline() })
ipcMain.on('net-offline', () => { respawn.onNetOffline() })

// 1110 分享外链: 渲染进程请求跳系统浏览器(微博分享页等)——壳内 webRequest 白名单会拦外域,
// openExternal 不经渲染进程加载;主进程侧协议+域白名单再验一次,防 IPC 被污染打开任意页
ipcMain.on('open-external', (_event, url) => {
  try {
    const u = new URL(url)
    const ok = u.protocol === 'https:' &&
      (u.hostname === 'jamonyapp.com' || u.hostname.endsWith('.jamonyapp.com') ||
       u.hostname === 'weibo.com' || u.hostname.endsWith('.weibo.com'))
    if (ok) shell.openExternal(u.toString())
    else console.log('[jamony] open-external 拒绝非白名单:', url)
  } catch { console.log('[jamony] open-external URL 解析失败:', url) }
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
  respawn.suppress()  // 1112 P2 闸①: 离房绝不复活
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
  respawn.suppress()  // 1112 P2 闸①: 退出意图即作废自愈（取消弹窗取消后 P2 由下次断线重新武装）
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
