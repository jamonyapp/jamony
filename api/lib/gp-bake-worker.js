'use strict'
// GP 烤制 worker（1029 P2）：烤制在独立线程跑，主事件循环零占用——房间隔离宪法。
// workerData.args = gpToMidi 的完整参数组；结果为纯对象（midPath/tracks/countInMs/totalMs/endTick/seekTick/seekTickMs）。
const { parentPort, workerData } = require('worker_threads')
const { gpToMidi } = require('./gp-bake')
try {
  parentPort.postMessage({ ok: true, result: gpToMidi(...workerData.args) })
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) })
}
