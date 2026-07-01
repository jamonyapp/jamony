/* ============ 自动混音引擎 ============
 *
 * 输入：N 条分轨 AudioBuffer（已 -14 LUFS 标准化）
 * 流程：FFT 频谱重心分析 → 声像分配 → OfflineAudioContext 渲染 → lamejs MP3 编码
 * 输出：MP3 Blob
 *
 * V1 哲学：不做分类 EQ、不做混响、不做频率避让。
 * 只做：响度保持、频谱铺开、总线粘合、原汁原味。
 */

import lamejs from "lamejs"
const { Mp3Encoder } = lamejs

/* ============ 类型 ============ */

export interface MixTrackInfo {
  /** 解码后的音频缓冲 */
  buffer: AudioBuffer
  /** 是否为鼓机轨（jamony-looper） */
  isDrum: boolean
}

export interface MixResult {
  /** MP3 Blob */
  mp3Blob: Blob
  /** 时长（秒） */
  duration: number
  /** 各轨的声像值（-1 ~ 1），用于调试 */
  pans: number[]
  /** 各轨的频谱重心（Hz），用于调试 */
  centroids: number[]
}

/* ============ 主入口 ============ */

export async function autoMix(
  tracks: MixTrackInfo[],
  onProgress?: (msg: string) => void,
): Promise<MixResult> {
  if (tracks.length === 0) throw new Error("没有可混音的分轨")
  if (tracks.length === 1) {
    // 单轨直接编码，跳过混音
    onProgress?.("编码 MP3…")
    const mp3Blob = encodeMp3(tracks[0].buffer)
    return { mp3Blob, duration: tracks[0].buffer.duration, pans: [0], centroids: [0] }
  }

  onProgress?.("分析分轨频谱…")

  // Step 1：计算每轨的频谱重心
  const centroids = tracks.map((t) => calcSpectralCentroid(t.buffer))

  // Step 2：按频谱重心分配声像
  const isDrums = tracks.map((t) => t.isDrum)
  const pans = assignPans(centroids, isDrums)

  onProgress?.("自动混音中…")

  // Step 3：OfflineAudioContext 渲染
  const sampleRate = tracks[0].buffer.sampleRate
  const maxLength = Math.max(...tracks.map((t) => t.buffer.length))
  const offlineCtx = new OfflineAudioContext(2, maxLength, sampleRate)

  // Master 总线压缩（轻压粘合）
  const masterComp = offlineCtx.createDynamicsCompressor()
  masterComp.threshold.value = -20
  masterComp.ratio.value = 2
  masterComp.attack.value = 0.003
  masterComp.release.value = 0.25
  masterComp.connect(offlineCtx.destination)

  // Master 总音量（N 条 -14 LUFS 轨叠加，需衰减防削波）
  const masterGain = offlineCtx.createGain()
  masterGain.gain.value = 1 / Math.sqrt(tracks.length)
  masterComp.connect(masterGain)
  masterGain.connect(offlineCtx.destination)

  // 逐轨接入
  tracks.forEach((track, i) => {
    const source = offlineCtx.createBufferSource()
    source.buffer = track.buffer

    const gain = offlineCtx.createGain()
    gain.gain.value = 1.0 // 每轨已 -14 LUFS，不动

    const panner = offlineCtx.createStereoPanner()
    panner.pan.value = pans[i]

    if (track.isDrum) {
      // 鼓机轨：额外轻压缩，让鼓更扎实
      const drumComp = offlineCtx.createDynamicsCompressor()
      drumComp.threshold.value = -24
      drumComp.ratio.value = 3
      drumComp.attack.value = 0.002
      drumComp.release.value = 0.1

      source.connect(gain)
      gain.connect(drumComp)
      drumComp.connect(panner)
      panner.connect(masterGain)
    } else {
      source.connect(gain)
      gain.connect(panner)
      panner.connect(masterGain)
    }

    source.start(0)
  })

  // 渲染
  const renderedBuffer = await offlineCtx.startRendering()

  onProgress?.("编码 MP3…")

  // Step 4：编码 MP3
  const mp3Blob = encodeMp3(renderedBuffer)

  return { mp3Blob, duration: renderedBuffer.duration, pans, centroids }
}

/* ============ FFT 频谱重心计算 ============ */

/**
 * 计算一轨音频的频谱重心（Spectral Centroid）
 * 返回以 Hz 为单位的重心频率。
 * 小 ≈ 低频乐器（贝斯/底鼓），大 ≈ 高频乐器（镲片/唢呐）
 */
function calcSpectralCentroid(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0) // 取第一声道
  const sampleRate = buffer.sampleRate
  const fftSize = 2048

  // 找响度最大的区域进行分析
  const hopSize = 512
  let maxRms = 0
  let bestOffset = 0

  for (let offset = 0; offset + fftSize <= data.length; offset += hopSize) {
    let sumSq = 0
    for (let i = 0; i < fftSize; i++) {
      const s = data[offset + i]
      sumSq += s * s
    }
    const rms = Math.sqrt(sumSq / fftSize)
    if (rms > maxRms) {
      maxRms = rms
      bestOffset = offset
    }
  }

  // 取该段做 FFT
  const real = new Float64Array(fftSize)
  const imag = new Float64Array(fftSize)

  for (let i = 0; i < fftSize; i++) {
    // Hann 窗
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)))
    const idx = Math.min(bestOffset + i, data.length - 1)
    real[i] = data[idx] * hann
    imag[i] = 0
  }

  fft(real, imag)

  // 计算频谱重心
  let numerator = 0
  let denominator = 0

  for (let i = 1; i < fftSize / 2; i++) {
    const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i])
    const frequency = (i * sampleRate) / fftSize
    numerator += frequency * magnitude
    denominator += magnitude
  }

  return denominator > 0 ? numerator / denominator : 0
}

/**
 * 基 2 快速傅里叶变换（Cooley-Tukey）
 * 修改 real/imag 数组（in-place）
 */
function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length

  // 位反转排序
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; (j & bit) !== 0; bit >>= 1) {
      j ^= bit
    }
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }

  // Cooley-Tukey 蝶形变换
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1
    const wReal = Math.cos((-2 * Math.PI) / len)
    const wImag = Math.sin((-2 * Math.PI) / len)

    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < halfLen; j++) {
        const ti = wr * real[i + j + halfLen] - wi * imag[i + j + halfLen]
        const tj = wr * imag[i + j + halfLen] + wi * real[i + j + halfLen]
        real[i + j + halfLen] = real[i + j] - ti
        imag[i + j + halfLen] = imag[i + j] - tj
        real[i + j] += ti
        imag[i + j] += tj
        const nwr = wr * wReal - wi * wImag
        wi = wr * wImag + wi * wReal
        wr = nwr
      }
    }
  }
}

/* ============ 声像分配 ============ */

/**
 * 按频谱重心分配立体声声像
 *
 * 规则：
 * - 鼓机轨 → 居中（pan = 0）
 * - 单轨 → 居中
 * - 多轨 → 按频谱重心排序，从 -0.4 到 0.4 对称分布
 *   （低频自然偏左/中，高频自然偏右）
 */
function assignPans(centroids: number[], isDrum: boolean[]): number[] {
  const n = centroids.length
  const pans = new Array(n).fill(0)

  // 非鼓机轨的索引
  const nonDrumIdx: number[] = []
  for (let i = 0; i < n; i++) {
    if (!isDrum[i]) nonDrumIdx.push(i)
  }

  const m = nonDrumIdx.length
  if (m <= 1) return pans // 单非鼓轨 → 居中

  // 按频谱重心排序（低频→高频）
  nonDrumIdx.sort((a, b) => centroids[a] - centroids[b])

  // 对称分配声像：从 -0.4 到 0.4（留一点余量，不做硬左右）
  for (let i = 0; i < m; i++) {
    const idx = nonDrumIdx[i]
    pans[idx] = (i / (m - 1)) * 0.8 - 0.4
  }

  return pans
}

/* ============ MP3 编码 ============ */

/**
 * 将 AudioBuffer 编码为 MP3 Blob（128kbps CBR）
 */
function encodeMp3(audioBuffer: AudioBuffer): Blob {
  const channels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitRate = 128

  const encoder = new Mp3Encoder(channels, sampleRate, bitRate)

  const left = audioBuffer.getChannelData(0)
  const right = channels > 1 ? audioBuffer.getChannelData(1) : null

  const mp3Chunks: Int8Array[] = []
  const chunkSize = 1152 // MP3 标准帧大小

  for (let i = 0; i < left.length; i += chunkSize) {
    const leftChunk = left.subarray(i, i + chunkSize)
    const leftInt16 = float32ToInt16(leftChunk)

    if (right) {
      const rightChunk = right.subarray(i, i + chunkSize)
      const rightInt16 = float32ToInt16(rightChunk)
      const mp3Buf = encoder.encodeBuffer(leftInt16, rightInt16)
      if (mp3Buf.length > 0) mp3Chunks.push(mp3Buf)
    } else {
      const mp3Buf = encoder.encodeBuffer(leftInt16)
      if (mp3Buf.length > 0) mp3Chunks.push(mp3Buf)
    }
  }

  const lastBuf = encoder.flush()
  if (lastBuf.length > 0) mp3Chunks.push(lastBuf)

  return new Blob(mp3Chunks, { type: "audio/mpeg" })
}

/** Float32Array（-1~1）→ Int16Array（-32768~32767） */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = float32[i]
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32768)))
  }
  return int16
}
