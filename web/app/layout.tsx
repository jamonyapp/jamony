import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { LoginModal } from '@/components/jamony/login-modal'
import { PlayerProvider } from '@/components/jamony/player-context'
import { PlayerBar } from '@/components/jamony/player-bar'
import { LikesProvider } from '@/lib/likes-context'
import { CommentsProvider } from '@/lib/comments-context'
import { FollowProvider } from '@/lib/follow-context'
import { NotificationsProvider } from '@/lib/notifications-context'
import { DMProvider } from '@/lib/dm-context'
import { ElectronGate } from '@/components/jamony/electron-gate'

// 字体本地化：脱离 next/font/google 的 build 时联网依赖（国内服务器拉不到 Google Fonts）
// Geist Sans + Geist Mono 的 latin 子集 variable woff2，含 100-900 全权重
const geistSans = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
})
const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'jamony · 首页',
  description: '面向音乐人的远程合奏 —— 有人在里面玩音乐',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

const scrollbarStyle = [
  '::-webkit-scrollbar{width:8px;height:8px}',
  '::-webkit-scrollbar-track{background:#000}',
  '::-webkit-scrollbar-thumb{background:#1a1a1a;border-radius:4px}',
  '::-webkit-scrollbar-thumb:hover{background:#333}',
  '*{scrollbar-width:thin;scrollbar-color:#1a1a1a #000}',
].join('')

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`dark ${geistSans.variable} ${geistMono.variable}`} style={{ background: '#000000' }}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: scrollbarStyle }} />
        <script src="/lame.min.js" />
      </head>
      <body className="font-sans antialiased" style={{ background: '#000000' }}>
        <AuthProvider>
          <PlayerProvider>
            <LikesProvider>
              <CommentsProvider>
                <FollowProvider>
                  <NotificationsProvider>
                    <DMProvider>
                    <ElectronGate>
                      {children}
                      <PlayerBar />
                    </ElectronGate>
                    </DMProvider>
                  </NotificationsProvider>
                </FollowProvider>
              </CommentsProvider>
            </LikesProvider>
          </PlayerProvider>
          <LoginModal />
        </AuthProvider>
      </body>
    </html>
  )
}
