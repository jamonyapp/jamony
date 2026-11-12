// 1113 P2.1 单测批: 自愈状态机 16+ 场景矩阵(行为=欢哥 1113 真机验收过的每一幕)
// 运行: npm test (vitest run) —— 纯逻辑零 DOM 默认 node 环境,假时钟模拟全部超时
// (vitest 4 须 ESM import 被测 CJS 模块,互操作由 vitest transform 处理)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRespawnCore } from './respawn-state.js'

// ---- 造一个 core: 全副作用 mock,行为全记录 ----
function makeCore(over = {}) {
  const calls = { banners: [], recovered: [], telemetry: [], kills: 0, spawns: [], giveUps: 0, logs: [] }
  let armed = true
  let hasProcess = true
  const core = createRespawnCore({
    log: (...a) => calls.logs.push(a.join(' ')),
    isArmed: () => armed,
    hasProcess: () => hasProcess,
    sendBanner: (stage) => calls.banners.push(stage),
    sendRecovered: (n) => calls.recovered.push(n),
    telemetry: (type, payload) => calls.telemetry.push({ type, payload }),
    checkRoomAlive: over.checkRoomAlive || (async () => true),
    killForRespawn: async () => { if (hasProcess) calls.kills++ },  // 语义对齐真实现:无进程=no-op
    identifyBindIf: over.identifyBindIf || (async () => null),
    launchJamsoul: over.launchJamsoul || (() => ({})),
    onOnlineSideEffect: () => {},
    onGiveUp: () => { calls.giveUps++ },
    ...(over.deps || {}),
  })
  core.rearm({ serverIp: '1.2.3.4', port: 22222, nickname: 't' })  // 武装
  return { core, calls, setArmed: (v) => (armed = v), setHasProcess: (v) => (hasProcess = v) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('A 场景: 短断零换防', () => {
  it('netdown 中心跳自然恢复 → 零换防收官', () => {
    const { core, calls } = makeCore()
    core.onNetOffline()
    expect(core.st.phase).toBe('netdown')
    expect(calls.banners).toEqual(['netdown'])
    core.onHeartbeat()  // 网没回但心跳自己续上了(短断,插回极快,online 事件还没到)
    expect(core.st.phase).toBe('idle')
    expect(calls.telemetry.find((t) => t.type === 'selfheal_recover').payload.zero_respawn).toBe(true)
    expect(calls.kills).toBe(0)  // 零换防!
    expect(calls.recovered.length).toBe(1)
  })

  it('online 后复活窗(2s)内心跳回 → 零换防', async () => {
    const { core, calls } = makeCore()
    core.onNetOffline()
    core.onNetOnline()             // 进 reviving
    expect(core.st.phase).toBe('reviving')
    await vi.advanceTimersByTimeAsync(1000)  // 1s: 还没到窗
    core.onHeartbeat()             // 第 2 拍心跳回
    expect(core.st.phase).toBe('idle')
    expect(calls.kills).toBe(0)
    expect(calls.telemetry.find((t) => t.type === 'selfheal_recover').payload.respawns).toBe(0)
  })

  it('online 后复活窗超时无心跳 → 查房换防;心跳到收官', async () => {
    const { core, calls } = makeCore()
    core.onNetOffline()
    core.onNetOnline()
    await vi.advanceTimersByTimeAsync(2000)   // 复活窗到期
    await vi.advanceTimersByTimeAsync(0)      // attemptRespawn 的 await 链走完
    expect(core.st.phase).toBe('respawning')
    expect(calls.kills).toBe(1)               // 换防的杀
    expect(calls.banners).toContain('healing')
    core.onHeartbeat()                        // 新进程心跳到
    expect(core.st.phase).toBe('idle')
    const rec = calls.telemetry.find((t) => t.type === 'selfheal_recover')
    expect(rec.payload.respawns).toBe(1)
    expect(rec.payload.zero_respawn).toBe(false)
  })
})

describe('死透与空壳(P2.1.2 欢哥产品拍板)', () => {
  it('netdown 中收到 C++ 死透确认 → 清空壳但不换防,继续等网', () => {
    const { core, calls } = makeCore()
    core.onNetOffline()
    core.onJamsoulDisconnected()   // 30s 死透确认
    expect(calls.kills).toBe(1)    // 空壳被收
    expect(core.st.phase).toBe('netdown')  // 不进换防
  })

  it('空壳已清后网回 → 跳过复活窗直接查房换防', async () => {
    const { core, calls, setHasProcess } = makeCore()
    core.onNetOffline()
    core.onJamsoulDisconnected()   // 清壳
    setHasProcess(false)           // 进程没了(exit 已清引用)
    core.onNetOnline()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')  // 没等 2s 复活窗
    expect(calls.kills).toBe(1)               // 只有清壳那一次杀,没有第二次
  })
})

describe('信号分流', () => {
  it('网正常时 JAMONY_DISCONNECTED → 直接换防(无 grace)', async () => {
    const { core } = makeCore()
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')
    expect(core.st.trigger).toBe('disconnected')
  })

  it('饥荒 10s(系统假在线盲区兜底) → 换防', async () => {
    const { core } = makeCore()
    core.onHeartbeat()                       // 挂饥荒定时器
    await vi.advanceTimersByTimeAsync(9999)  // 差 1ms 不触发
    expect(core.st.phase).toBe('idle')
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')
    expect(core.st.trigger).toBe('famine')
  })

  it('饥荒在非武装态(无进程/无房)不触发', async () => {
    const { core, setArmed } = makeCore()
    core.onHeartbeat()
    setArmed(false)
    await vi.advanceTimersByTimeAsync(20000)
    expect(core.st.phase).toBe('idle')
  })

  it('流程中的第二信号被忽略(不重复触发不计败)', async () => {
    const { core, calls, setHasProcess } = makeCore()
    core.onNetOffline()              // netdown
    core.onJamsoulDisconnected()     // 死透(清壳路径)
    setHasProcess(false)             // 清壳后 exit 已清引用(真实现里 killForRespawn 后 jamsoulProcess=null)
    core.onJamsoulDisconnected()     // 又一行(进程已清,不重复杀)
    expect(calls.kills).toBe(1)
  })
})

describe('退避与放弃(闸②)', () => {
  async function failOnce(core, calls) {
    // 处于 respawning,推看门狗 10s → 记败
    await vi.advanceTimersByTimeAsync(10000)
    await vi.advanceTimersByTimeAsync(0)
  }
  it('看门狗 10s 无心跳 → 记败进退避(10s 档);退避到点自动重试', async () => {
    const { core, calls } = makeCore()
    core.onJamsoulDisconnected()          // 直接换防(beginDisconnect 已计第 1 败)
    await vi.advanceTimersByTimeAsync(0)  // respawning, 看门狗挂上
    await failOnce(core, calls)
    expect(core.st.phase).toBe('waiting')
    expect(core.st.attempts).toBe(2)      // 初败(断线)+看门狗记败
    await vi.advanceTimersByTimeAsync(10000)  // 退避 10s(失败#1 档)到点
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')  // 第二次尝试
  })

  it('waiting 期间 online 事件短路退避立即重试', async () => {
    const { core } = makeCore()
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10000)  // 看门狗记败 → waiting
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('waiting')
    core.onNetOnline()                        // 网回(此前一直 offline?不——这条链是 netOnline=true 的换防路径,
    await vi.advanceTimersByTimeAsync(0)      // online 事件照发也该短路)
    expect(core.st.phase).toBe('respawning')
  })

  it('3 败 → giveUp 移交(遥测+onGiveUp),相位回 idle;退避序列=10s/30s/30s(设计定稿)', async () => {
    const { core, calls } = makeCore()
    core.onJamsoulDisconnected()                    // attempts=1
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(0)          // 尝试进入 respawning,看门狗挂上
      await vi.advanceTimersByTimeAsync(10000)      // 看门狗记败(attempts: 2/3/4)
      await vi.advanceTimersByTimeAsync(0)
      if (i < 2) {                                  // 失败#1 退避 10s、失败#2 退避 30s
        await vi.advanceTimersByTimeAsync(i === 0 ? 10000 : 30000)
        await vi.advanceTimersByTimeAsync(0)
      }
    }
    expect(calls.giveUps).toBe(1)                   // 失败#3(attempts=4≥MAX)→ giveUp
    expect(core.st.phase).toBe('idle')
    const g = calls.telemetry.find((t) => t.type === 'selfheal_giveup')
    expect(g.payload.reason).toContain('连接未建立')
  })

  it('spawn 返回 null → 记败退避', async () => {
    const { core } = makeCore({ launchJamsoul: () => null })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('waiting')
    expect(core.st.attempts).toBe(2)  // 初败(断线)+spawn 失败记败
  })

  it('秒退(early-exit)不等看门狗直接记败', async () => {
    const { core } = makeCore()
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    core.notifySpawnEarlyExit()
    expect(core.st.phase).toBe('waiting')
  })
})

describe('闸①与世代号(竞态)', () => {
  it('查房 await 期间 suppress → 流程作废,不 spawn', async () => {
    let releaseCheck
    const gate = new Promise((r) => (releaseCheck = r))
    const { core, calls } = makeCore({ checkRoomAlive: () => gate })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')  // 卡在查房 await
    core.suppress()                            // 用户切听众
    releaseCheck(true)                         // 查房回 true(房在)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.kills).toBe(0)               // 换防的杀没发生!
    expect(calls.spawns.length).toBe(0)
    expect(core.st.phase).toBe('idle')
  })

  it('suppress 不动事实锚点(attempts/connectedAt 保留)', () => {
    const { core } = makeCore()
    core.onHeartbeat()
    core.onJamsoulDisconnected()      // attempts: 0→? (connectedAt 刚刷,<60s → +1 =1)
    core.suppress()
    expect(core.st.attempts).toBe(1)  // 保留
  })

  it('rearm(join-room)全重置+作废在飞流程', async () => {
    const { core } = makeCore()
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    core.rearm({ serverIp: '1.1.1.1', port: 1, nickname: 'x' })
    expect(core.st.phase).toBe('idle')
    expect(core.st.attempts).toBe(0)
    expect(core.isHealing()).toBe(false)
  })
})

describe('查房三态(闸③)', () => {
  it('false(散房/登出/被清) → giveUp 让路', async () => {
    const { core, calls } = makeCore({ checkRoomAlive: async () => false })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.giveUps).toBe(1)
    expect(calls.kills).toBe(0)  // 没走到换防的杀(onGiveUp 负责清残余)
  })
  it('null(不可判定) → 照试换防', async () => {
    const { core } = makeCore({ checkRoomAlive: async () => null })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')
  })
})

describe('连败计数语义(抖动防护)', () => {
  it('连上又断(<60s) → 计一败', async () => {
    const { core } = makeCore()
    core.onHeartbeat()
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.attempts).toBe(1)
  })
  it('稳定 >60s 后断 → 清零重计', async () => {
    const { core } = makeCore()
    core.onHeartbeat()                       // connectedAt = now(假时钟 0)
    core.onJamsoulDisconnected()             // 第一次断: attempts=1
    await vi.advanceTimersByTimeAsync(0)
    core.st.phase = 'idle'                   // (模拟上一轮已收)
    core.st.attempts = 2                     // 人为累计过败绩
    core.onHeartbeat()                       // 恢复
    await vi.advanceTimersByTimeAsync(61000) // 稳定超 60s(connectedAt 刷新在 61000ms 处)
    core.onJamsoulDisconnected()             // 再断
    expect(core.st.attempts).toBe(1)         // 清零后重计(0+1)
  })
})

describe('网络态标志', () => {
  it('isNetOnline 跟随事件', () => {
    const { core } = makeCore()
    expect(core.isNetOnline()).toBe(true)
    core.onNetOffline()
    expect(core.isNetOnline()).toBe(false)
    core.onNetOnline()
    expect(core.isNetOnline()).toBe(true)
  })
})
