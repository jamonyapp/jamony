'use strict'
// GP 烤制异步门面（1029 P2）：Worker 线程执行 gpToMidi，主进程 Promise 化调用。
// 签名/语义与原同步 gpToMidi 完全一致（数组传参，postMessage 结构化克隆纯对象返回值）。
const { Worker } = require('worker_threads')
const path = require('path')

function gpToMidiAsync(...args) {
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(__dirname, 'gp-bake-worker.js'), { workerData: { args } })
    w.on('message', m => { if (m && m.ok) resolve(m.result); else reject(new Error((m && m.error) || 'gp bake failed')) })
    w.on('error', reject)
    w.on('exit', c => { if (c !== 0) reject(new Error('gp bake worker exit ' + c)) })
    // 不 unref：worker 完成前保持事件循环存活（服务器本就常驻；裸脚本里 unref 会让进程提前退出=结果丢失）
  })
}

module.exports = { gpToMidiAsync }
