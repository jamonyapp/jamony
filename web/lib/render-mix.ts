/* ============ 用户混音渲染引擎（1026 试听混音器×发表工程）============
 *
 * 哲学：所发即所听——离线渲染与实时试听跑同一套 Web Audio 节点构造
 * （GainNode + StereoPannerNode + 同参数 DynamicsCompressor 安全限幅器），
 * 参数相同则结果构造性一致，不存在 ffmpeg 参数转译的听感损耗。
 *
 * 与 autoMix（历史自动混音）的区别：参数来自用户快照，不做 1/√N 衰减、
 * 不做频谱自动声像、不做鼓压缩——每轨已 -14 LUFS，用户参数即最终意志。
 *
 * 闸3客户端预检（computeRangePeak）：点「发表作品」时扫内存 buffer 的
 * 区间峰值，无声人类轨当场指认（服务端另有权威终审，客户端只是体验层）。
 */
// MP3 编码已 Worker 化（1031 发表黑屏根治，见下方 encodeMp3InWorker 与
// public/mp3-encoder-worker.js）；auto-mix.ts 的 encodeMp3 仅供其遗留路径使用。

/* ============ 固定安全限幅器（两链同参，单点定义防漂移）============
 * 性质是安全带不是审美：阈值 -1dB、20:1 限幅语义，健康混音永不介入。
 * 实时链（useMixerEngine）与离线渲染链 import 同一常量——对齐是构造性的。
 */
export const FIXED_LIMITER_PARAMS = {
  threshold: -1,
  ratio: 20,
  knee: 0,
  attack: 0.003,
  release: 0.25,
} as const

export const LIMITER_ID = "fixed-v1"
export const ENGINE_ID = "webaudio-v1"

/** 闸3 静音判据（与停录落档/服务端终审同阈值） */
export const SILENCE_THRESHOLD_DB = -60

/* ============ 1031 判据升级（欢哥四案实验定罪）============
 * 旧峰值判据在归一化域被双穿：归一化爆音(-1.4dBTP，normalize-wav 增益放大 t=0 微不连续)
 * 与效果器底噪(归一化后 -44~-27.5dB 峰值，增益逐轨不同)。新判据（归一化域专用，
 * 闸1 原始域维持峰值-60dB 不变）：区间均值 RMS > -30dB + 跳过曲头 50ms（爆音免疫区）。
 * 阈值依据（1031 实测）：热底噪 RMS=-40.0（拦，裕量10dB）/ 冷底噪 -45~-48（拦）/
 * 真静默 -90（拦）/ 真演奏 -12~-19（放，裕量11~18dB）——底噪与演奏间隔 21dB，
 * -30 居中两向各 10dB。客户端预检与服务端终审同口径；审计留档供后续数据化调参。
 */
export const SILENCE_RMS_THRESHOLD_DB = -30
export const RANGE_HEAD_SKIP_SEC = 0.05

/** 区间均值 RMS（dBFS；空窗/纯零=-Infinity） */
export function computeRangeRmsDb(buffer: AudioBuffer, a: number, b: number): number {
  const sr = buffer.sampleRate
  const start = Math.max(0, Math.floor(a * sr))
  const end = Math.min(buffer.length, Math.ceil(b * sr))
  if (end <= start) return -Infinity
  let sumSq = 0
  let n = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = start; i < end; i++) {
      const s = data[i]
      sumSq += s * s
      n++
    }
  }
  if (n === 0) return -Infinity
  const rms = Math.sqrt(sumSq / n)
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity
}

/** 严格判据（1031）：头 50ms 豁免 + RMS 阈值；区间窄于豁免区=无有效内容=拦 */
export function rangeAudibleStrict(buffer: AudioBuffer, a: number, b: number): boolean {
  const a2 = Math.max(a, RANGE_HEAD_SKIP_SEC)
  if (b <= a2) return false
  const db = computeRangeRmsDb(buffer, a2, b)
  if (db === -Infinity) return false
  return db > SILENCE_RMS_THRESHOLD_DB
}

export function applyFixedLimiter(comp: DynamicsCompressorNode) {
  comp.threshold.value = FIXED_LIMITER_PARAMS.threshold
  comp.ratio.value = FIXED_LIMITER_PARAMS.ratio
  comp.knee.value = FIXED_LIMITER_PARAMS.knee
  comp.attack.value = FIXED_LIMITER_PARAMS.attack
  comp.release.value = FIXED_LIMITER_PARAMS.release
}

/* ============ 类型 ============ */

export interface RenderTrackSpec {
  /** mixer trackId（String(session_track.id)） */
  key: string
  /** 混音器已解码的 buffer（复用，不二次下载） */
  buffer: AudioBuffer
  /** effectiveGain 折叠后（0~2 线性；闸2 保证发表时无 M/S，折叠=原值） */
  gain: number
  /** -1~1 */
  pan: number
}

export interface RenderMixInput {
  tracks: RenderTrackSpec[]
  /** 总线 gain（0~2 线性） */
  master: number
  /** 定位器区间（秒）；null=全曲 */
  range: { a: number; b: number } | null
  onProgress?: (msg: string) => void
}

export interface RenderMixResult {
  mp3Blob: Blob
  /** 渲染时长（=区间时长，成品真实时长） */
  duration: number
}

/* ============ 主入口 ============ */

export async function renderMix(input: RenderMixInput): Promise<RenderMixResult> {
  const { tracks, master, range, onProgress } = input
  if (tracks.length === 0) throw new Error("没有可渲染的分轨")

  const sampleRate = tracks[0].buffer.sampleRate
  const fullDuration = Math.max(...tracks.map(t => t.buffer.duration))
  // 区间钳制到曲内；短轨自然收（b 超过某轨长度=该轨后段静默，amix 语义）
  const a = range ? Math.max(0, Math.min(range.a, Math.max(0, fullDuration - 0.1))) : 0
  const b = range ? Math.max(a + 0.1, Math.min(range.b, fullDuration)) : fullDuration
  const length = Math.max(1, Math.ceil((b - a) * sampleRate))
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate)

  // 总线：masterGain → limiter(fixed-v1，与实时链同参同位) → destination
  const limiter = offlineCtx.createDynamicsCompressor()
  applyFixedLimiter(limiter)
  limiter.connect(offlineCtx.destination)
  const masterGain = offlineCtx.createGain()
  masterGain.gain.value = master
  masterGain.connect(limiter)

  for (const t of tracks) {
    if (a >= t.buffer.duration) continue // 该轨在区间起点前已结束 → 不参与（同 playFromOffset 语义）
    const source = offlineCtx.createBufferSource()
    source.buffer = t.buffer
    const gain = offlineCtx.createGain()
    gain.gain.value = t.gain
    const panner = offlineCtx.createStereoPanner()
    panner.pan.value = t.pan
    source.connect(gain)
    gain.connect(panner)
    panner.connect(masterGain)
    source.start(0, a) // 区间裁剪：成品时间轴从 0 计，各轨跳到 a 起播
  }

  onProgress?.("渲染混音中…")
  const rendered = await offlineCtx.startRendering()
  // 1031 限幅器验收探针：成品峰值应被钳在阈值附近（-1dB/20:1 → 重限幅时约 -0.4~-0.65dB）；
  // ≥0dB=限幅器失效（1026 autoMix 孤儿压缩机前科故设此针）。97 步进采样=近似快扫。
  {
    let pk = 0
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const d = rendered.getChannelData(ch)
      for (let i = 0; i < d.length; i += 97) {
        const a = Math.abs(d[i])
        if (a > pk) pk = a
      }
    }
    const pkDb = pk > 0 ? `${(20 * Math.log10(pk)).toFixed(1)}dB` : "-∞"
    console.log(`[renderMix] 成品峰值 ${pkDb}（限幅工作中应落在 -1 ~ -0.4 区间；≥0=限幅器失效）`)
  }
  onProgress?.("编码 MP3…（工作线程）")
  const mp3Blob = await encodeMp3InWorker(rendered)
  return { mp3Blob, duration: rendered.duration }
}

/* ============ MP3 编码 Worker 化（1031 发表黑屏根治）============
 * 主线程同步 lamejs 编码分钟级成品=渲染进程冻结+内存压力→Electron 杀进程
 * （内置崩溃页）。搬进 Worker：主线程全程活着；编码爆炸只死 worker，
 * reject → 上层 toast。worker 体见 public/mp3-encoder-worker.js。
 */
function encodeMp3InWorker(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker("/mp3-encoder-worker.js")
    } catch {
      reject(new Error("MP3 编码 worker 启动失败"))
      return
    }
    worker.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { ok: boolean; data?: Int8Array; msg?: string }
      worker.terminate()
      if (d.ok && d.data) resolve(new Blob([d.data], { type: "audio/mpeg" }))
      else reject(new Error(d.msg || "MP3 编码失败"))
    }
    worker.onerror = (ev: ErrorEvent) => {
      worker.terminate()
      reject(new Error(`MP3 编码 worker 异常：${ev.message || "未知"}`))
    }
    // getChannelData 返回内部存储视图不可转移，structuredClone 复制一次性开销
    const left = buffer.getChannelData(0)
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null
    worker.postMessage({ left, right, sampleRate: buffer.sampleRate })
  })
}

/* ============ 闸3 客户端预检（纯函数）============ */

/** 区间峰值（线性幅度 0~1，扫全部声道） */
export function computeRangePeak(buffer: AudioBuffer, a: number, b: number): number {
  const sr = buffer.sampleRate
  const start = Math.max(0, Math.floor(a * sr))
  const end = Math.min(buffer.length, Math.ceil(b * sr))
  if (end <= start) return 0
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = start; i < end; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }
  return peak
}

export function peakToDbfs(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}

/** 区间内是否有可感知声音（与落版/服务端终审同 -60dB 阈值） */
export function rangeAudible(buffer: AudioBuffer, a: number, b: number): boolean {
  const db = peakToDbfs(computeRangePeak(buffer, a, b))
  if (db === -Infinity) return false
  return db > SILENCE_THRESHOLD_DB
}

/* ============ 快照组装（works.mix_params 契约）============ */

export interface MixParamTrack {
  track_id: number | string
  user_id?: number | null
  nickname: string
  is_system?: boolean
  instrument_category?: string
  gain: number
  pan: number
  in_range: boolean
}

export function buildMixParams(opts: {
  tracks: MixParamTrack[]
  master: number
  /** 定位器（秒）；b=null=未设（服务端按全曲处理） */
  range: { a: number; b: number | null }
  clientAudit?: unknown
}) {
  return {
    version: 1,
    limiter: LIMITER_ID,
    engine: ENGINE_ID,
    rendered_at: new Date().toISOString(),
    master: opts.master,
    range: { a: opts.range.a, b: opts.range.b },
    tracks: opts.tracks.map(t => ({
      track_id: t.track_id,
      user_id: t.user_id ?? null,
      nickname: t.nickname,
      is_system: !!t.is_system,
      instrument_category: t.instrument_category || "",
      gain: t.gain,
      pan: t.pan,
      in_range: t.in_range,
    })),
    client_audit: opts.clientAudit ?? null,
  }
}
