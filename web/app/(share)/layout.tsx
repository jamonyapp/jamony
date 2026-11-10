import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import '../globals.css'

// (share) 落地页根布局 —— 1110 route group 终版
// 极简为上(设计本意: 不带桌面壳): 零 Provider/零 lame/零全局播放条, 只留字体+全局样式+滚动条。
// 此前根布局 headers() 标记头临时方案退役——多根布局让落地页天然无全家桶, 主站恢复静态渲染。
const geistSans = localFont({
  src: '../fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
})
const geistMono = localFont({
  src: '../fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'jamony 即鸣',
  description: '更低延迟的线上合奏社区',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: 'black',
}

const scrollbarStyle = [
  '::-webkit-scrollbar{width:8px;height:8px}',
  '::-webkit-scrollbar-track{background:#000}',
  '::-webkit-scrollbar-thumb{background:#1a1a1a;border-radius:4px}',
  '::-webkit-scrollbar-thumb:hover{background:#333}',
  '*{scrollbar-width:thin;scrollbar-color:#1a1a1a #000}',
].join('')

export default function ShareRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`dark ${geistSans.variable} ${geistMono.variable}`} style={{ background: '#000000' }}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: scrollbarStyle }} />
      </head>
      <body className="font-sans antialiased" style={{ background: '#000000' }}>
        {children}
      </body>
    </html>
  )
}
