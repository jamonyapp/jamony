import { NextRequest, NextResponse } from 'next/server'

// 客户端 only 闸门（公测部署架构定稿，1022 落地）：
// 产品完整体验只给 jamony Electron 客户端；普通浏览器访问导向官网。
// 检测原理：壳的 UA 自带 Electron/x.y.z（electron/main.js 未改写 UA，1022 核实）。
const OFFICIAL_SITE = process.env.OFFICIAL_SITE_URL || 'https://jamonyapp.com'

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const host = req.headers.get('host') || ''

  const isElectron = ua.includes('Electron')
  // 本地/内网开发不拦（浏览器里跑 dev 是常态；服务器自探测 127.0.0.1 也走这）
  const isLocal =
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host)

  if (isElectron || isLocal) return NextResponse.next()

  return NextResponse.redirect(OFFICIAL_SITE, 302)
}

// 只拦页面路由：api/socket.io/静态资源/媒体目录全部豁免
export const config = {
  matcher: ['/((?!api|socket.io|_next|works|avatars|stream|.*\\..*).*)'],
}
