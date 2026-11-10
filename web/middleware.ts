import { NextRequest, NextResponse } from 'next/server'

// 客户端 only 闸门（公测部署架构定稿，1022 落地）：
// 产品完整体验只给 jamony Electron 客户端；普通浏览器访问导向官网。
// 检测原理：壳的 UA 自带 Electron/x.y.z（electron/main.js 未改写 UA，1022 核实）。
const OFFICIAL_SITE = process.env.OFFICIAL_SITE_URL || 'https://jamonyapp.com'

// 1109 强登录: 登录闸豁免名单——未登录可达的页面
// /login=门本身 /banned=封号申诉落地页(1023,会话仅够申诉两端点) /terms|/privacy=协议对外锚点(1104)
// /share=站外分享落地页预留(公开免登录, 分享施工蓝图定稿; 落地页开工前先占位)
const AUTH_EXEMPT = (pathname: string) =>
  pathname === '/login' ||
  pathname === '/banned' ||
  pathname === '/terms' ||
  pathname === '/privacy' ||
  pathname.startsWith('/share')

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const host = req.headers.get('host') || ''

  const isElectron = ua.includes('Electron')
  // 本地/内网开发不拦（浏览器里跑 dev 是常态；服务器自探测 127.0.0.1 也走这）
  const isLocal =
    /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host)

  // 1104批次2: 协议/政策页对外豁免——浏览器可看(登录勾选链接的对外锚点)
  // 1110: /share=站外分享落地页——全 jamony 唯一「窗外」,普通浏览器(含微信内置)必须可看
  // (route group 终版: 落地页已独立极简根布局, 标记头方案退役, 此处只剩纯豁免)
  if (req.nextUrl.pathname === '/terms' || req.nextUrl.pathname === '/privacy' || req.nextUrl.pathname.startsWith('/share')) return NextResponse.next()

  if (isElectron || isLocal) {
    // 1109 强登录: UA 闸决定「能不能看 jamony」, 登录闸决定「能不能用」——两者正交; 本地/内网也过登录闸(内网验收即走此路)
    // edge 只查 cookie 存在性不验签(不引 jose); 假/过期 cookie 由页面加载后 /api/me 401 纠正跳 /login(双闸互补)
    if (!AUTH_EXEMPT(req.nextUrl.pathname) && !req.cookies.get('jamony_token')) {
      return NextResponse.redirect(new URL('/login', req.url), 302)
    }
    return NextResponse.next()
  }

  return NextResponse.redirect(OFFICIAL_SITE, 302)
}

// 只拦页面路由：api/socket.io/静态资源/媒体目录全部豁免
export const config = {
  matcher: ['/((?!api|socket.io|_next|works|avatars|stream|.*\\..*).*)'],
}
