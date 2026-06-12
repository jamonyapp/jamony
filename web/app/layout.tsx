import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'jamony — 远程合奏',
  description: 'jamony — 供音乐人远程合奏的桌面应用。',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh" className="bg-background">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
