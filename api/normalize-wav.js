#!/usr/bin/env node
// normalize-wav.js — 使用 bs1770gain 测量 LUFS，然后 Node.js 纯增益调整
// 零依赖，零音染，只做纯粹的信号放大/衰减

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const TARGET_LUFS = parseFloat(process.argv[2]) || -14
const TRUE_PEAK_LIMIT = parseFloat(process.argv[3]) || -1  // TP 天花板 dB
const inputFile = process.argv[4]

if (!inputFile) {
  console.error('用法: node normalize-wav.js [-14] [-1] input.wav')
  process.exit(1)
}

// 1. 测量原始文件响度
console.log(`测量 ${path.basename(inputFile)} ...`)
const result = execSync(`bs1770gain -i "${inputFile}" 2>/dev/null`, { timeout: 60000, encoding: 'utf8' })

// 解析 "integrated (momentary mean): -31.33 LUFS / 17.33 LU"
const match = result.match(/integrated.*?(-?\d+\.\d+)\s*LUFS\s*\/\s*(-?\d+\.\d+)\s*LU/)
if (!match) {
  console.error('无法解析 bs1770gain 输出:', result)
  process.exit(1)
}

const measuredLUFS = parseFloat(match[1])
const gainLU = parseFloat(match[2])  // Loudness Units difference
const gainDb = TARGET_LUFS - measuredLUFS

console.log(`  实测: ${measuredLUFS.toFixed(2)} LUFS`)
console.log(`  目标: ${TARGET_LUFS} LUFS`)
console.log(`  增益: ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB`)

if (Math.abs(gainDb) < 0.1) {
  console.log('  无需调整，跳过')
  process.exit(0)
}

// 2. 读取 WAV
const buf = fs.readFileSync(inputFile)
const headerLen = 44  // 标准 PCM WAV 头

// 验证 WAV 格式
const riff = buf.toString('ascii', 0, 4)
const wave = buf.toString('ascii', 8, 12)
const fmtTag = buf.readUInt16LE(20)

if (riff !== 'RIFF' || wave !== 'WAVE') {
  console.error('不是标准 WAV 文件')
  process.exit(1)
}
if (fmtTag !== 1) {
  console.error(`仅支持 PCM WAV (format tag=${fmtTag})`)
  process.exit(1)
}

const channels = buf.readUInt16LE(22)
const sampleRate = buf.readUInt32LE(24)
const bitsPerSample = buf.readUInt16LE(34)

console.log(`  格式: ${channels}ch ${sampleRate}Hz ${bitsPerSample}bit`)

if (bitsPerSample !== 16 && bitsPerSample !== 24 && bitsPerSample !== 32) {
  console.error(`不支持的位深: ${bitsPerSample}`)
  process.exit(1)
}

// 计算增益系数（振幅，不是 dB）
const gainFactor = Math.pow(10, gainDb / 20)

// 限制真峰值
const maxPeakAmp = Math.pow(10, TRUE_PEAK_LIMIT / 20)

const sampleData = buf.slice(headerLen)
let processed

if (bitsPerSample === 16) {
  const samples = new Int16Array(sampleData.buffer, sampleData.byteOffset, sampleData.byteLength / 2)
  const maxInt16 = 32767
  const limitAmp = maxPeakAmp * maxInt16

  for (let i = 0; i < samples.length; i++) {
    let val = samples[i] * gainFactor
    // 限制真峰值
    if (val > limitAmp) val = limitAmp
    if (val < -limitAmp) val = -limitAmp
    samples[i] = Math.round(val)
  }
  processed = Buffer.from(samples.buffer)
} else if (bitsPerSample === 24) {
  // 24-bit: 3 字节每样本
  const sampleCount = sampleData.length / 3
  processed = Buffer.alloc(sampleData.length)

  for (let i = 0; i < sampleCount; i++) {
    const off = i * 3
    // 读取 24-bit 有符号整数
    let val = sampleData.readIntLE(off, 3)
    val = Math.round(val * gainFactor)
    val = Math.min(Math.max(val, -8388608), 8388607)
    processed.writeIntLE(val, off, 3)
  }
} else if (bitsPerSample === 32) {
  // 32-bit: float 样本
  const samples = new Float32Array(sampleData.buffer, sampleData.byteOffset, sampleData.byteLength / 4)
  const limitAmp = maxPeakAmp

  for (let i = 0; i < samples.length; i++) {
    let val = samples[i] * gainFactor
    if (val > limitAmp) val = limitAmp
    if (val < -limitAmp) val = -limitAmp
    samples[i] = val
  }
  processed = Buffer.from(samples.buffer)
}

// 3. 更新文件大小
const newFileSize = headerLen + processed.length
buf.writeUInt32LE(newFileSize - 8, 4)  // RIFF chunk size

// 4. 写回原文件（原地替换）
const outBuf = Buffer.concat([buf.slice(0, headerLen), processed])
fs.writeFileSync(inputFile, outBuf)

console.log(`  完成: 已写入 ${(processed.length / 1024 / 1024).toFixed(1)} MB`)
console.log('')

// 5. 验证
const verify = execSync(`bs1770gain -i "${inputFile}" 2>/dev/null`, { timeout: 60000, encoding: 'utf8' })
const vMatch = verify.match(/integrated.*?(-?\d+\.\d+)\s*LUFS/)
if (vMatch) {
  console.log(`  验证: ${vMatch[1]} LUFS`)
}
