const { contextBridge, ipcRenderer, clipboard } = require('electron')

// jamony 10-23: 客户端版本号（main 经 additionalArguments 注入）——反馈收集等场景随请求上报
const versionArg = process.argv.find((a) => a.startsWith('--jamony-version='))

// 安全地暴露给渲染进程（网页）的 API
contextBridge.exposeInMainWorld('jamonyAPI', {
  version: versionArg ? versionArg.split('=')[1] : '',
  // 写入系统剪贴板（Electron clipboard，比 navigator.clipboard 在非 secure context 更可靠）
  writeClipboard: (text) => {
    try { clipboard.writeText(text); return true } catch { return false }
  },
  // 网页调起 jamsoul（由页面 JS 调用）
  joinRoom: (payload) => {
    ipcRenderer.send('join-room', payload)
  },
  // 杀死 jamsoul 子进程
  killJamsoul: () => {
    ipcRenderer.send('kill-jamsoul')
  },
  // jamony 08-27 调试: 手动弹 jamsoul 反馈保护弹窗（验收用）
  testFeedback: () => {
    ipcRenderer.send('test-feedback')
  },
  // jamony: 通知主进程进入/离开房间（主进程据此在退出时可靠发送 leave，不依赖 renderer beforeunload 的竞态）
  enterRoom: (payload) => {
    ipcRenderer.send('enter-room', payload)
  },
  leaveRoom: () => {
    ipcRenderer.send('leave-room')
  },
  // jamony: 告知主进程当前是否唯一合奏者（主进程叉 jamony/dock 退出弹窗文案用）
  setLastMusician: (value) => {
    ipcRenderer.send('set-last-musician', { value })
  },
  // 监听来自主进程的事件（如 jamsoul 启动状态）；返回 cleanup 防 listener 累积
  // （09-30 反馈链重做：启动结果回执 ok:false=启动失败，前端需可见提示）
  onJamsoulLaunched: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('jamsoul-launched', handler)
    return () => ipcRenderer.removeListener('jamsoul-launched', handler)
  },
  // 监听 jamsoul 退出（反向交互，jamsoul 关闭时通知页面）；返回 cleanup 防 listener 累积
  onJamsoulExited: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('jamsoul-exited', handler)
    return () => ipcRenderer.removeListener('jamsoul-exited', handler)
  },
  // jamony 10-10: 订阅 jamsoul 延迟上报（约每秒一次 ping 结果）——GP 走带指针时延补偿用
  // （测量代替常数；overall=全缓冲+RTT，web 侧 lag=overall-ping/2 去网络返程重复计）
  onJamsoulDelay: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('jamsoul-delay', handler)
    return () => ipcRenderer.removeListener('jamsoul-delay', handler)
  },
  // 1112 P2.1（差距四）: 自愈中间态可见——断网等待(netdown)/换防恢复中(healing)；返回 cleanup
  onJamsoulReconnecting: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('jamsoul-reconnecting', handler)
    return () => ipcRenderer.removeListener('jamsoul-reconnecting', handler)
  },
  // 1112 P2.1: 自愈收官（连接恢复，banner 撤）；返回 cleanup
  onJamsoulReconnected: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('jamsoul-reconnected', handler)
    return () => ipcRenderer.removeListener('jamsoul-reconnected', handler)
  },
  // 1031 欢哥裁定：web 侧「检查更新」入口（头像下拉菜单/通知卡片 IPC → 壳弹更新窗）
  checkForUpdate: () => {
    ipcRenderer.send('jamony-check-update')
  },
  // 1110 作品分享: 外链跳系统浏览器（微博分享页等）——壳内 webRequest 白名单会拦外域,
  // shell.openExternal 不经渲染进程,主进程侧再验一次协议+域
  openExternal: (url) => {
    ipcRenderer.send('open-external', url)
  },
})

// 拦截网页的 window.postMessage，如果内容是 JOIN_ROOM 则转发到主进程
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'JOIN_ROOM') {
    console.log('[preload] Intercepted JOIN_ROOM via postMessage:', event.data.payload)
    ipcRenderer.send('join-room', event.data.payload)
  }
})

// 1112 P2.1（差距三）: 系统网络事件转发主进程——Chromium 原生监听（Mac 底层 NWPathMonitor），
// 拔线/断WiFi/VPN 开关零延迟即知。主进程据此驱动自愈状态机（offline=进等网态/online=复活窗+短路退避）
window.addEventListener('offline', () => ipcRenderer.send('net-offline'))
window.addEventListener('online', () => ipcRenderer.send('net-online'))

console.log('[preload] jamony preload loaded')
