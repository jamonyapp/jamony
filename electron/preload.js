const { contextBridge, ipcRenderer, clipboard } = require('electron')

// 安全地暴露给渲染进程（网页）的 API
contextBridge.exposeInMainWorld('jamonyAPI', {
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
  // 监听来自主进程的事件（如 jamsoul 启动状态）
  onJamsoulLaunched: (callback) => {
    ipcRenderer.on('jamsoul-launched', (_event, data) => callback(data))
  },
})

// 拦截网页的 window.postMessage，如果内容是 JOIN_ROOM 则转发到主进程
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'JOIN_ROOM') {
    console.log('[preload] Intercepted JOIN_ROOM via postMessage:', event.data.payload)
    ipcRenderer.send('join-room', event.data.payload)
  }
})

console.log('[preload] jamony preload loaded')
