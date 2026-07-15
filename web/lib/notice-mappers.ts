// 公告牌：后端 snake_case 行 → 前端 camelCase Notice 映射
// 第2步发布后插入用；第3步 fetch 列表/详情复用

import type { Notice } from "@/lib/jamony-data"

function formatTime(ts: string | Date | null | undefined): string {
  if (!ts) return ""
  const d = typeof ts === "string" ? new Date(ts) : ts
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function mapNotice(row: any): Notice {
  return {
    id: String(row.id),
    title: row.title || "",
    body: row.body || "",
    author: row.author_name || row.nickname || "",
    time: formatTime(row.created_at) || row.time || "",
    type: row.type,
    city: row.city || "其他",
    style: row.style || "未分类",
    bgIndex: row.bg_index ?? 1,
    imageUrl: row.image_url || undefined,
    category: row.category || undefined,
    jamTime: row.jam_time || undefined,
    level: row.level || undefined,
    neededCount: row.needed_count ?? undefined,
    expireAt: row.expire_at ? new Date(row.expire_at).toISOString() : undefined,
    authorId: row.author_id ?? row.user_id,
    authorAvatar: row.author_avatar || undefined,
  }
}
