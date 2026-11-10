// 1110 落地页 404:作品不存在或已下架——旧链接不再传播(审核旁门封堵),给个软着陆。
export default function ShareNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center">
      <div className="text-xl font-semibold text-zinc-200">内容已下架或不存在</div>
      <div className="mt-2 text-sm text-zinc-500">这条分享链接可能已失效</div>
      <a
        className="mt-8 rounded-lg bg-zinc-100 px-6 py-3 text-sm font-medium text-black active:bg-zinc-300"
        href="https://jamonyapp.com"
        target="_blank"
        rel="noreferrer"
      >
        下载 jamony
      </a>
    </main>
  )
}
