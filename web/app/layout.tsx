import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'jamony — 远程合奏',
  description: 'jamony — 供音乐人远程合奏的桌面应用。',
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
    <html lang="zh" className="bg-background">
      <head>
        <style dangerouslySetInnerHTML={{ __html: scrollbarStyle }} />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
