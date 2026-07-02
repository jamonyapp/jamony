import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { LoginModal } from '@/components/jamony/login-modal'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
          {children}
          <LoginModal />
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
