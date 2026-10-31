/* ============ MP3 编码 Worker（1031 发表黑屏根治）============
 * 根因：lamejs 在主线程同步编码整首成品——分钟级混音=渲染进程长时间冻结+
 *   高内存压力，Electron 直接杀渲染进程（内置崩溃页 "This page couldn't load"）。
 *   欢哥实测：点「发表作品」→黑屏→reload 回合奏页。
 * 修法：编码整体搬进 Worker。主线程解放（按钮/倒计时/走带全程活着）；
 *   编码若再爆只死 worker，主线程 Promise reject → 弹 toast，页面存活。
 * lame.min.js 与 layout.tsx 注入的同源（public 根）；int16 转换公式与
 *   auto-mix.ts float32ToInt16 逐字节一致（Math.round(s*32768) 钳位）。
 */
importScripts('/lame.min.js')

self.onmessage = function (e) {
  var left = e.data.left
  var right = e.data.right
  var sampleRate = e.data.sampleRate
  try {
    var channels = right ? 2 : 1
    var encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128)
    var chunkSize = 1152 // MP3 标准帧大小
    var chunks = []

    var toInt16 = function (f32) {
      var i16 = new Int16Array(f32.length)
      for (var i = 0; i < f32.length; i++) {
        var s = f32[i]
        i16[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32768)))
      }
      return i16
    }

    for (var i = 0; i < left.length; i += chunkSize) {
      var l = toInt16(left.subarray(i, i + chunkSize))
      var buf
      if (right) {
        var r = toInt16(right.subarray(i, i + chunkSize))
        buf = encoder.encodeBuffer(l, r)
      } else {
        buf = encoder.encodeBuffer(l)
      }
      if (buf.length > 0) chunks.push(buf)
    }
    var last = encoder.flush()
    if (last.length > 0) chunks.push(last)

    var total = 0
    for (var c = 0; c < chunks.length; c++) total += chunks[c].length
    var out = new Int8Array(total)
    var off = 0
    for (var k = 0; k < chunks.length; k++) { out.set(chunks[k], off); off += chunks[k].length }
    self.postMessage({ ok: true, data: out }, [out.buffer])
  } catch (err) {
    self.postMessage({ ok: false, msg: String((err && err.message) || err) })
  }
}
