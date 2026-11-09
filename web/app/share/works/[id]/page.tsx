import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SharePlayer } from "@/components/share/share-player"
import { WechatShare } from "@/components/share/wechat-share"

// 1110 作品分享落地页(公开免登录,微信/微博/桌面浏览器通吃): 三秒内看到封面听到歌。
// 不带: 评论/相关推荐/用户卡/登录墙/左栏/桌面壳;状态闸=只渲染 published(下架/删除=404,
// 防旧链接在微信里继续传播=审核旁门);数据边界=公开端点只回公开字段。
// 页面经 nginx 官网块以 https://jamonyapp.com/share/works/[id] 对外(JS安全域名=jamonyapp.com),
// 媒体文件在 app 子域,一律绝对地址(https页面+相对路径会被解析到官网域=404)。

const API_INTERNAL = process.env.API_INTERNAL || "http://127.0.0.1:3001"
const MEDIA_BASE = "https://app.jamonyapp.com"

type PublicWork = {
  id: string
  title: string
  author: string
  nature: string
  style: string
  description: string
  coverSong: string
  coverAuthor: string
  instruments: string[]
  plays: number
  likes: number
  duration: string
  date: string
  gradient: string
  coverUrl: string
  mp3Url: string
}

async function fetchWork(id: string): Promise<PublicWork | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/works/${id}/public`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const d = await res.json()
    return d && d.ok ? (d.work as PublicWork) : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const w = await fetchWork(id)
  if (!w) return { title: "作品不存在 - jamony 即鸣" }
  const coverSuffix = w.nature === "翻唱" && w.coverSong ? ` · 翻唱《${w.coverSong}》` : ""
  const desc = `${w.author} · jamony 即鸣 · 低延迟线上实时合奏${coverSuffix}`
  return {
    title: `${w.title} - jamony 即鸣`,
    description: desc,
    openGraph: {
      title: w.title,
      description: desc,
      ...(w.coverUrl ? { images: [`${MEDIA_BASE}${w.coverUrl}`] } : {}),
    },
  }
}

export default async function ShareWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const w = await fetchWork(id)
  if (!w) notFound()

  const cover = w.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- 外部媒体不走 next/image 优化,落地页轻为上
    <img src={`${MEDIA_BASE}${w.coverUrl}`} alt={w.title} className="h-full w-full object-cover" />
  ) : (
    <div className="h-full w-full" style={{ background: w.gradient }} />
  )

  return (
    <main className="flex min-h-screen flex-col items-center bg-black px-6 py-10 text-zinc-300">
      <WechatShare title={w.title} author={w.author} coverUrl={w.coverUrl ? `${MEDIA_BASE}${w.coverUrl}` : ""} />
      <div className="w-full max-w-md">
        <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-lg">
          {cover}
          {w.nature !== "原创" && (
            <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-zinc-200">{w.nature}</span>
          )}
        </div>
        <h1 className="mt-5 text-center text-xl font-semibold text-zinc-100">{w.title}</h1>
        <div className="mt-2 text-center text-sm text-zinc-400">
          {w.author}
          {w.instruments.length > 0 && <span className="text-zinc-500"> · {w.instruments.join("/")}</span>}
        </div>
        {w.nature === "翻唱" && w.coverSong && (
          <div className="mt-1 text-center text-xs text-zinc-500">
            原曲:{w.coverSong}
            {w.coverAuthor ? ` · ${w.coverAuthor}` : ""}
          </div>
        )}
        <SharePlayer src={w.mp3Url ? `${MEDIA_BASE}${w.mp3Url}` : ""} />
        <div className="mt-4 text-center text-xs text-zinc-500">
          {w.date}
          {w.style ? ` · ${w.style}` : ""} · {w.plays}次播放 · {w.likes}次喜欢
        </div>
        {w.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{w.description}</p>}
        <a
          className="mt-8 block rounded-lg bg-zinc-100 py-3 text-center text-sm font-medium text-black active:bg-zinc-300"
          href="https://jamonyapp.com"
          target="_blank"
          rel="noreferrer"
        >
          下载 jamony,和他们一起合奏
        </a>
        <div className="mt-6 text-center text-xs text-zinc-600">jamony · 即鸣 — 低延迟线上实时合奏</div>
      </div>
    </main>
  )
}
