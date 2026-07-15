// 房间分享：文案构造 + 剪贴板复制（右栏分享按钮、建房引导弹窗共用）

export type ShareRoom = {
  is_private: boolean
  room_code: string
  password?: string
}

export function buildShareText(room: ShareRoom): string {
  return room.is_private
    ? `我在jamony等你！门牌码${room.room_code}，密码${room.password || ""}。`
    : `我在jamony等你！门牌码${room.room_code}。`
}

// 复制分享文案到系统剪贴板。三层兜底：Electron clipboard → execCommand → navigator.clipboard。
// Electron 非 secure context 下 navigator.clipboard 会失败，故优先用 Electron clipboard。
export async function copyShareText(room: ShareRoom): Promise<boolean> {
  const text = buildShareText(room)
  // 1) Electron clipboard（最可靠，非 secure context 也可用）
  const ja = (window as any).jamonyAPI
  if (ja?.writeClipboard) {
    try { if (ja.writeClipboard(text)) return true } catch {}
  }
  // 2) execCommand 兜底
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return true
  } catch {}
  // 3) navigator.clipboard 兜底（secure context）
  try { await navigator.clipboard.writeText(text); return true } catch {}
  return false
}
