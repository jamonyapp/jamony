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
    fetchTicket: over.fetchTicket || (async () => 'TK'),  // 1119: 默认领票成功
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

// ═══ 1118 缝合怪回归: 查房角色三态 ═══
// 教训: 2.1.4 把武装从「进程活着」放宽到「有房在身」后, 听众也被武装; 闸③ 只问真假不问角色,
// 网回换防照拉 jamsoul → 听众=双路音频(直连+Icecast 延迟流)+身份撕裂(名单听众/音频在场合奏)。
// 契约: 查房返回 'listener' = 席位在、无需 jamsoul —— 静默收兵(不 spawn/不 healing banner/不 giveUp),
// 流由 web 侧 ~3s 自恢复; 若有残留进程(缺席期间被降级场景)先清掉(exit 抑制相位内)。
describe('1118 回归: 听众席不换防(缝合怪根治)', () => {
  it('听众网回查房 → 静默收兵: 不拉 jamsoul、无 healing banner、不 giveUp', async () => {
    const spawns = []
    const { core, calls, setHasProcess } = makeCore({
      checkRoomAlive: async () => 'listener',
      launchJamsoul: () => { spawns.push(1); return { pid: 1 } },
    })
    core.onNetOffline()
    core.onJamsoulDisconnected()      // 清壳(死透确认)
    setHasProcess(false)
    core.onNetOnline()                // 网回 → 直接查房
    await vi.advanceTimersByTimeAsync(0)
    expect(spawns.length).toBe(0)                    // ⭐ 不拉 jamsoul(缝合怪根除点)
    expect(calls.banners).toEqual(['netdown'])       // 只有断网 banner,绝无「正在自动恢复合奏」
    expect(calls.giveUps).toBe(0)                    // 不是让路,是收兵
    expect(core.st.phase).toBe('idle')
  })

  it('缺席期间被降级为听众(残进程在) → 清残后收兵,仍不 spawn', async () => {
    const spawns = []
    const { core, calls } = makeCore({
      checkRoomAlive: async () => 'listener',
      launchJamsoul: () => { spawns.push(1); return { pid: 1 } },
    })
    core.onNetOffline()               // netdown 旧进程原地保留
    core.onNetOnline()                // 网回(进程还在,但缺席期间房主把他降为听众)
    await vi.advanceTimersByTimeAsync(2000)  // 复活窗到期 → 查房='listener'
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.kills).toBe(1)       // 残留旧进程被清(netdown 期保留的那只)
    expect(spawns.length).toBe(0)     // 但绝不换防拉新的
    expect(core.st.phase).toBe('idle')
  })

  it("查房='musician' → 照常换防(三态不伤主路径)", async () => {
    const spawns = []
    const { core } = makeCore({
      checkRoomAlive: async () => 'musician',
      launchJamsoul: () => { spawns.push(1); return { pid: 1 } },
    })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')
    expect(spawns.length).toBe(1)
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

// ═══ 1116 矩阵⑤ 40s 轮卡死根因回归 ═══
// 教训: main.js 真 isArmed 曾把 jamsoulProcess(进程活着)当武装条件——P2.1.2 清壳置 null 后,
// 网回 attemptRespawn 门口 `if(!isArmed()) 静默return`,无日志无遥测无 banner 变化全死寂。
// 本组用例钉死状态机契约: **武装=「有房在身」(joinPayload/rearm),与进程活性无关**;
// main 侧对应修复=669 行去掉 jamsoulProcess(mock 无法覆盖 main 接线,故以契约用例+注释双保险)
describe('1116 回归: 武装与进程解耦(>35s 断网卡死根因)', () => {
  it('netdown 清壳后网回 → 必须直接查房换防拉起(进程没了不算解除武装)', async () => {
    const spawns = []
    const { core, calls, setHasProcess } = makeCore({ launchJamsoul: () => { spawns.push(1); return { pid: 1 } } })
    core.onNetOffline()               // 拔线 → netdown, banner「网络已断开」
    expect(calls.banners).toEqual(['netdown'])
    core.onJamsoulDisconnected()      // ~30s C++ 死透 → 清壳
    setHasProcess(false)              // 真实现: exit 处理器把 jamsoulProcess 置 null
    await vi.advanceTimersByTimeAsync(2000)
    expect(core.st.phase).toBe('netdown')   // 清壳不改相位(banner 持续等网)
    core.onNetOnline()                // 插线 —— 40s 轮卡死复现点
    await vi.advanceTimersByTimeAsync(1000) // 查房(mock 即回)+kill(no-op)+spawn
    expect(spawns.length).toBe(1)          // ⭐ 拉起必须发生: 旧 isArmed 语义下这里是 0=卡死
    expect(calls.banners).toEqual(['netdown', 'healing'])  // banner 必须翻「恢复中」
    core.onHeartbeat()                // 换防后首拍心跳 → 收官
    expect(core.st.phase).toBe('idle')
    expect(calls.telemetry.find((t) => t.type === 'selfheal_recover').payload.respawns).toBe(1)
  })

  it('对照: 进程在的短断走复活窗,不换防(既有行为不受本修复影响)', async () => {
    const spawns = []
    const { core, calls } = makeCore({ launchJamsoul: () => { spawns.push(1); return { pid: 1 } } })
    core.onNetOffline()
    core.onNetOnline()                // 进程还在 → reviving 2s 复活窗
    expect(core.st.phase).toBe('reviving')
    core.onHeartbeat()                // 心跳自然续上
    expect(spawns.length).toBe(0)     // 零换防
    expect(calls.kills).toBe(0)
  })
})

// ══════════════════════════════════════
// 1119 入场票: 换防复活必领新票(壳零缓存,票绝对一次性——欢哥决议)
// ══════════════════════════════════════
describe('1119 入场票: 换防前领新票', () => {
  it('领票成功 → launchJamsoul 第 5 参收到票', async () => {
    const spawns = []
    const { core } = makeCore({
      launchJamsoul: (ip, port, nick, bindIf, ticket) => { spawns.push({ ip, port, nick, bindIf, ticket }); return {} },
      fetchTicket: async () => 'TK-1',
    })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    expect(core.st.phase).toBe('respawning')
    expect(spawns.length).toBe(1)
    expect(spawns[0].ticket).toBe('TK-1')
    expect(spawns[0].ip).toBe('1.2.3.4')
    expect(spawns[0].port).toBe(22222)
  })

  it('首次领票败 → 500ms 快试第二次成功', async () => {
    const spawns = []
    let n = 0
    const { core } = makeCore({
      launchJamsoul: (ip, port, nick, bindIf, ticket) => { spawns.push({ ticket }); return {} },
      fetchTicket: async () => (++n === 1 ? null : 'TK-2'),
    })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)   // 第一次败,进 500ms 等待
    expect(spawns.length).toBe(0)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(0)   // 第二次成功,spawn 落地
    expect(n).toBe(2)
    expect(spawns.length).toBe(1)
    expect(spawns[0].ticket).toBe('TK-2')
  })

  it('两次快试全败 → 无票照发 null(服务端观察/强制档仲裁)', async () => {
    const spawns = []
    const { core } = makeCore({
      launchJamsoul: (ip, port, nick, bindIf, ticket) => { spawns.push({ ticket }); return {} },
      fetchTicket: async () => null,
    })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(0)
    expect(spawns.length).toBe(1)
    expect(spawns[0].ticket).toBe(null)
  })

  it('重试间隙被抑制(世代号作废) → 不再 spawn', async () => {
    const spawns = []
    const { core } = makeCore({
      launchJamsoul: (ip, port, nick, bindIf, ticket) => { spawns.push({ ticket }); return {} },
      fetchTicket: async () => null,
    })
    core.onJamsoulDisconnected()
    await vi.advanceTimersByTimeAsync(0)   // 第一次领票败
    core.suppress()                        // 重试间隙用户主动退出/切房 → 本轮作废
    await vi.advanceTimersByTimeAsync(500)
    await vi.advanceTimersByTimeAsync(0)
    expect(spawns.length).toBe(0)          // 新进程未起,无泄漏(与既有 kill 后作废同语义)
  })
})

// ══════════════════════════════════════════
// 1123 僵尸判活: isHeartbeatFresh —— join-room 排重只复用心跳新鲜的进程
// (断网窗口内硬刷新死锁修复的判活半部;杀+起半部在 main.js join-room,真机验)
// ══════════════════════════════════════════
describe('isHeartbeatFresh 僵尸判活', () => {
  it('从未心跳(connectedAt=0) → 不新鲜(jamsoul 卡重连循环地狱的典型态)', () => {
    const { core } = makeCore()
    expect(core.isHeartbeatFresh()).toBe(false)
  })

  it('心跳刚跳过 → 新鲜', () => {
    const { core } = makeCore()
    core.onHeartbeat()
    expect(core.isHeartbeatFresh()).toBe(true)
  })

  it('最后心跳距今超过 FAMINE_MS(10s) → 不新鲜', async () => {
    const { core } = makeCore()
    core.onHeartbeat()
    await vi.advanceTimersByTimeAsync(10001)
    expect(core.isHeartbeatFresh()).toBe(false)
  })

  it('边界: 最后心跳距今 9.9s → 仍新鲜', async () => {
    const { core } = makeCore()
    core.onHeartbeat()
    await vi.advanceTimersByTimeAsync(9900)
    expect(core.isHeartbeatFresh()).toBe(true)
  })

  it('rearm 清零 → 心跳史作废(新周期重新判活)', () => {
    const { core } = makeCore()
    core.onHeartbeat()
    core.rearm({ serverIp: '1.2.3.4', port: 22222, nickname: 't' })
    expect(core.isHeartbeatFresh()).toBe(false)
  })
})
