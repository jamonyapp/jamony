/**
 * 分轨音量电平探测（1026「管子」哲学推广：昨天只测 looper，今天全量）
 *
 * 用 ffmpeg volumedetect 量一段音频的峰值电平（max_volume, dBFS）。
 * 用途两扇窗：
 *   1) 停录落档（闸1）——全轨窗口：无声轨（含用户轨）不进 session
 *   2) 发表终审（闸3）——区间窗口 [startSec, startSec+durSec)：人类轨必须在
 *      发表区间内有可感知声音（防「区间外掩人耳目」移花接木变体）
 *
 * 返回值约定（保守哲学，与 looper 回退判例同源）：
 *   number  —— 解析成功，max_volume（dB）
 *   null    —— ffmpeg 失败/超时/解析不出 → 调用方必须按「有声」处理：
 *              宁可放过，不可误丢真轨（探测基础设施故障不该改判产品结果）
 *
 * execFile 数组参数：文件名含昵称/引号等任意字符也不会注入。
 * -ss 放 -i 前 = 输入寻址：WAV 无损格式下快且采样级精确。
 */
const { execFile } = require('child_process')

function probeMaxVolumeDb(filePath, startSec, durSec) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-nostdin']
    if (Number.isFinite(startSec) && startSec > 0) args.push('-ss', String(startSec))
    if (Number.isFinite(durSec) && durSec > 0) args.push('-t', String(durSec))
    args.push('-i', filePath, '-af', 'volumedetect', '-f', 'null', '-')
    execFile('ffmpeg', args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      // volumedetect 的统计走 stderr；进程非零退出也可能带部分输出，一并不放过
      const out = `${stderr || ''}`
      const m = out.match(/max_volume:\s*(-?[\d.]+)\s*dB/)
      if (m) {
        const db = parseFloat(m[1])
        resolve(Number.isFinite(db) ? db : null)
      } else {
        if (err) console.error(`[probe-volume] ffmpeg 失败(按有声处理): ${filePath}: ${err.message}`)
        resolve(null)
      }
    })
  })
}

/**
 * ⭐ 1031 判据升级（欢哥四案实验定罪）：max/min 双值探测。
 * 归一化域（闸3终审）需要 mean_volume（RMS 判据）——峰值判据被归一化爆音(-1.4dBTP,
 * normalize-wav 增益放大 t=0 微不连续+真峰限幅钳制)与效果器底噪(归一化后≈-44dB)双穿。
 * 返回 { max, mean }；解析失败=null=保守按有声（哲学同源）。
 */
function probeVolumeDb(filePath, startSec, durSec) {
  return new Promise((resolve) => {
    const args = ['-hide_banner', '-nostdin']
    if (Number.isFinite(startSec) && startSec > 0) args.push('-ss', String(startSec))
    if (Number.isFinite(durSec) && durSec > 0) args.push('-t', String(durSec))
    args.push('-i', filePath, '-af', 'volumedetect', '-f', 'null', '-')
    execFile('ffmpeg', args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (err, _stdout, stderr) => {
      const out = `${stderr || ''}`
      const mm = out.match(/max_volume:\s*(-?[\d.]+)\s*dB/)
      const mn = out.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)
      if (mm && mn) {
        const max = parseFloat(mm[1])
        const mean = parseFloat(mn[1])
        resolve(Number.isFinite(max) && Number.isFinite(mean) ? { max, mean } : null)
      } else {
        if (err) console.error(`[probe-volume] ffmpeg 失败(按有声处理): ${filePath}: ${err.message}`)
        resolve(null)
      }
    })
  })
}

module.exports = { probeMaxVolumeDb, probeVolumeDb }
