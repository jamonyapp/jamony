/**
 * jamony 53 位迷你雪花发号器（1025 欢哥定稿：迷你=最优解）
 *
 * 结构: 41 位毫秒时间戳(纪元 2026-01-01, 够用 69 年) << 12 | 12 位毫秒内计数器(4096/ms)
 * 值域: < 2^53 —— 完整落在 JS Number 安全范围, JSON/JWT/parseInt 全链免字符串化, 前端零改动
 * 单进程单线程内存发号: 无锁无依赖; api 为 pm2 fork 单实例, 天然无并发竞争
 * 毫秒内超 4096 个(全站 409 万/秒)则自旋等下一毫秒 —— 现实不可达
 * 新旧共存: 与历史自增小 ID(如 1 号用户)在 BIGINT 列共存不撞, 趋势递增排序语义正确
 * 未来分布式: 若真到分库多写, 重新分配位结构(如 39+4+10 加机器位)即可, 一行改动
 */
const EPOCH = Date.UTC(2026, 0, 1) // 纪元 2026-01-01 UTC
let lastTs = 0
let seq = 0

function nextId() {
  let ts = Date.now() - EPOCH
  if (ts === lastTs) {
    seq = (seq + 1) & 0xfff
    if (seq === 0) {
      // 本毫秒 4096 个号用尽: 自旋到下一毫秒(理论不可达, 防御性兜底)
      while ((ts = Date.now() - EPOCH) === lastTs) { /* spin */ }
      lastTs = ts // 1025 修复: 跨毫秒自旋后必须同步 lastTs, 否则下一号与跨毫秒号重复
    }
  } else {
    seq = 0
    lastTs = ts
  }
  // ts < 2^41 且 seq < 2^12 → 乘 4096 + seq < 2^53, 安全
  return ts * 4096 + seq
}

module.exports = { nextId }
