// ═══════════════════════════════════════════════════════════════
// 1113 P2.1 单测批: jamsoul 断线自愈状态机——纯逻辑核心
// ═══════════════════════════════════════════════════════════════
// 设计: 相位转移与判定逻辑全在此;副作用(杀进程/拉起/查房/网卡识别/banner/遥测/日志)
//   由构造方注入 deps。main.js 注入真实现(行为与重构前逐行等价);测试注入 mock+假时钟。
// 相位机: idle → netdown(系统断网,不杀,等网) → reviving(online 后 2s 复活窗)
//   → respawning(kill-then-spawn 换防) → waiting(退避,被 online 短路) → 3败 giveUp
// 信号: ①offline/online(renderer 原生事件转发,内核级零延迟) ②JAMONY_DISCONNECTED
//   (C++ 协议确认死) ③心跳饥荒 10s(壳侧兜底——系统假在线盲区的精确补充)
// 全部超时锚定物理值: 复活窗 2s=2 心跳周期;看门狗 10s=首心跳物理下限×2.5;退避防轰炸

const DEFAULTS = {
  REVIVE_MS: 2000,        // online 后复活窗＝2 个心跳周期
  FAMINE_MS: 10000,       // 心跳饥荒阈值＝10 拍（兜底信号,仅 idle+armed 态受理）
  WATCH_MS: 10000,        // respawn 后等首条心跳的看门狗（物理下限 4s ×2.5）
  BACKOFF_MS: [10000, 30000], // 连败退避（被 online 事件短路）
  MAX_ATTEMPTS: 4,        // 退避上限停手（含断线初始计数: 断线=1+三连败=4 ⇒ 三次尝试）
  STABLE_MS: 60000,       // 连接稳定超此时长，下次断线才清零连败计数
}

function createRespawnCore(deps, opts = {}) {
  const T = { ...DEFAULTS, ...opts }
  const st = {
    phase: 'idle',        // idle | netdown | reviving | respawning | waiting
    timer: null,          // 相位定时器（复活窗/看门狗/退避共用一个句柄）
    famineTimer: null,    // 饥荒定时器（心跳到达时重置;仅 idle+armed 态触发受理）
    attempts: 0,          // 连败计数（失败/连上又断<60s 计一败;稳定>60s 下次断线清零）
    connectedAt: 0,       // 最近一次心跳时刻（稳定锚点）
    downAt: 0,            // 断线开始时刻（算恢复耗时）
    trigger: '',          // 本次断线触发源 offline|disconnected|famine
    respawnCount: 0,      // 本轮换防次数（0=零换防复活,遥测区分用）
  }
  let gen = 0             // 世代号：每次 suppress/rearm/giveUp 递增，在飞 attemptRespawn 自行作废
  let netOnline = true    // 系统网络态（renderer offline/online 事件维护）
  let joinPayload = null  // { serverIp, port, nickname }——rearm 存，换防 spawn 用

  const clearTimer = () => { if (st.timer) { clearTimeout(st.timer); st.timer = null } }
  const clearFamine = () => { if (st.famineTimer) { clearTimeout(st.famineTimer); st.famineTimer = null } }

  // 闸①: 任何主动离开/杀 → 本轮自愈彻底作废（下次 rearm 重武装）。
  // 注意: 不动 attempts/connectedAt——那是事实锚点（连接稳定史），非流程状态
  function suppress() {
    gen++
    clearTimer()
    clearFamine()
    st.phase = 'idle'
  }

  // join-room 重武装（新的一次主动调起 = 新周期）
  function rearm(payload) {
    joinPayload = payload || null
    gen++
    clearTimer()
    clearFamine()
    st.phase = 'idle'
    st.attempts = 0
    st.connectedAt = 0
    st.downAt = 0
    st.trigger = ''
    st.respawnCount = 0
  }

  // 饥荒定时器：每拍心跳重置；10s 无心跳且 idle+武装 → 兜底断线
  function resetFamine() {
    clearFamine()
    if (st.phase !== 'idle' || !deps.isArmed()) return
    st.famineTimer = setTimeout(() => {
      if (st.phase !== 'idle' || !deps.isArmed()) return
      deps.log(`[jamony] P2.1: 心跳饥荒（${T.FAMINE_MS}ms 无 JAMONY_DELAY），兜底触发自愈`)
      beginDisconnect('famine')
    }, T.FAMINE_MS)
  }

  // ---- 断线统一入口（三信号汇聚点：offline 事件 / JAMONY_DISCONNECTED 行 / 饥荒） ----
  function beginDisconnect(trigger) {
    if (st.phase !== 'idle') return        // 已在自愈流程中,迟到的第二信号忽略（不计败不重复触发）
    if (!deps.isArmed()) return
    if (st.connectedAt && Date.now() - st.connectedAt > T.STABLE_MS) {
      st.attempts = 0
    } else {
      st.attempts++
    }
    st.downAt = Date.now()
    st.trigger = trigger
    const stableMs = st.connectedAt ? Date.now() - st.connectedAt : 0
    deps.telemetry('selfheal_disconnect', { trigger, stable_ms: stableMs, attempts: st.attempts })
    deps.log(`[jamony] P2.1: 断线触发源=${trigger}（连败计数=${st.attempts}，系统网络=${netOnline ? 'online' : 'offline'}）`)
    if (netOnline) { attemptRespawn() }    // 网正常=协议确认死/服务器挂,直接换防（无 grace,查房即天然防抖）
    else { enterNetDown() }                // 系统断网=旧进程原地留,等 online（netdown 相位零定时器纯事件）
  }

  function enterNetDown() {
    st.phase = 'netdown'
    deps.sendBanner('netdown')
    deps.log('[jamony] P2.1: 系统断网，进入等网态（旧进程原地保留，恢复后先试复活再换防）')
  }

  // ---- 网络事件 ----
  function onNetOffline() {
    netOnline = false
    deps.log('[jamony] P2.1: 系统网络 offline')
    if (st.phase === 'idle') beginDisconnect('offline')
  }
  function onNetOnline() {
    netOnline = true
    deps.log('[jamony] P2.1: 系统网络 online')
    deps.onOnlineSideEffect && deps.onOnlineSideEffect()  // 遥测补报/断网页回家（壳层事务,非状态机）
    if (st.phase === 'netdown') {
      if (deps.hasProcess()) {
        // 网回来了且进程还在：先给旧连接 2 个心跳周期的复活窗（物理值——A 场景零换防的关键）
        st.phase = 'reviving'
        st.timer = setTimeout(() => {
          if (st.phase === 'reviving') {
            deps.log('[jamony] P2.1: 复活窗内心跳未回，转查房换防')
            attemptRespawn()
          }
        }, T.REVIVE_MS)
      } else {
        // 空壳已清（死透确认时收掉了）——无可复活,跳过复活窗直接查房换防（省 2s）
        deps.log('[jamony] P2.1.2: 网回,旧进程已清,直接查房换防')
        attemptRespawn()
      }
    } else if (st.phase === 'waiting') {
      // 退避等待被 online 短路：网都回来了,退避的盲目等待已无意义
      deps.log('[jamony] P2.1: online 事件短路退避，立即重试')
      clearTimer()
      attemptRespawn()
    }
    // idle/reviving/respawning：无动作（判活永远以心跳为准，系统 online≠jamsoul 活）
  }

  // ---- stdout JAMONY_DISCONNECTED 行入口（信号②：C++ 协议确认死） ----
  function onJamsoulDisconnected() {
    if (st.phase === 'netdown') {
      // 死透确认: C++ 30s 超时已判死,连接无复活可能（网回后恢复必走换防）,空壳留着零收益
      // 只剩用户困惑（C区死灰一片）,立即清掉;exit 抑制（phase 非 idle）不惊动页面（欢哥实测 C 场景产品拍板）
      if (deps.hasProcess()) {
        deps.log('[jamony] P2.1.2: 断网期间连接死透（C++ 30s 超时），清空壳等网')
        deps.killForRespawn()
      }
      return
    }
    beginDisconnect('disconnected')
  }

  // ---- stdout JAMONY_DELAY 行 = 活连接实证（~1Hz；断线后零行） ----
  function onHeartbeat() {
    if (st.phase === 'netdown' || st.phase === 'reviving' || st.phase === 'respawning') {
      const wasNetDownRescue = st.phase !== 'respawning'
      const durMs = st.downAt ? Date.now() - st.downAt : 0
      const respawns = st.respawnCount
      deps.log(`[jamony] P2.1: ${wasNetDownRescue ? '零换防复活（连接自然续上）' : '自愈换防成功'}，合奏恢复（耗时 ${Math.round(durMs / 100) / 10}s）`)
      clearTimer()
      st.phase = 'idle'
      st.downAt = 0
      st.trigger = ''
      st.respawnCount = 0
      deps.telemetry('selfheal_recover', { duration_ms: durMs, respawns, zero_respawn: respawns === 0 })
      deps.sendRecovered(respawns)
    }
    st.connectedAt = Date.now()  // 稳定锚点（idle 正常运行也随每拍刷新）
    resetFamine()
  }

  // ---- 按连败次数安排下一次尝试；达上限 → 放弃移交 ----
  // attempts 含断线初始计数(抖动防护语义): 断线=1,此后每次尝试失败 +1。
  // 设计序列(欢哥定稿): 立即→10s→30s 三次尝试后停手 ⇒ 失败#1(attempts=2)退避 10s,
  // 失败#2(attempts=3)退避 30s,失败#3(attempts=4)达上限放弃。
  // (单测揪出的档位缺陷: 旧公式 attempts-1 把断线计数算进档位,序列错成 立即→30s→放弃)
  function scheduleRespawn(reason) {
    if (st.attempts >= T.MAX_ATTEMPTS) { giveUpRespawn(reason); return }
    const idx = Math.max(0, Math.min(st.attempts - 2, T.BACKOFF_MS.length - 1))
    const delay = T.BACKOFF_MS[idx]
    deps.log(`[jamony] P2.1: ${delay}ms 后自愈重试（第 ${st.attempts} 次尝试，${reason}）`)
    st.phase = 'waiting'
    st.timer = setTimeout(() => { attemptRespawn() }, delay)
  }

  async function attemptRespawn() {
    const myGen = gen  // 世代快照：suppress/rearm/giveUp 任一发生即作废本流程
    if (!deps.isArmed()) {
      st.phase = 'idle'
      clearTimer()
      return
    }
    // 相位占先(单测揪出的竞态): 查房窗口(几百 ms~5s)内 phase 必须已非 idle——
    // 否则 exit 抑制判据(isHealing)失效(查房中用户手动退 jamsoul 会误广播)+迟到的
    // 第二信号可在裸奔窗口重复触发。banner/respawnCount 计数仍在查房通过后(让路路径不虚计)
    st.phase = 'respawning'
    // 闸③: 查房（明确没了 = 让路解散弹窗，不复活）
    const alive = await deps.checkRoomAlive()
    if (myGen !== gen) return
    if (alive === false) { giveUpRespawn('房间已不在（散房/登出/被清出）'); return }

    // kill-then-spawn
    st.respawnCount++
    deps.sendBanner('healing')
    deps.log(`[jamony] P2.1: kill-then-spawn 换防（第 ${st.attempts + 1} 次尝试，累计换防 ${st.respawnCount} 次）`)
    await deps.killForRespawn()
    if (myGen !== gen) return  // 换防期间被抑制（用户切听众/换房/退出）——新进程未起，无泄漏
    // 重识别网卡：断的往往就是网卡本身（WiFi↔热点），不能沿用旧 bindIf
    const bindIf = await deps.identifyBindIf(joinPayload.serverIp)
    if (myGen !== gen) return
    const child = deps.launchJamsoul(joinPayload.serverIp, joinPayload.port, joinPayload.nickname, bindIf)
    if (!child) {
      deps.log('[jamony] P2.1: respawn spawn 失败，记败退避')
      st.attempts++
      scheduleRespawn('spawn 失败')
      return
    }
    // 看门狗: 10s 内无心跳 = 连接没建起来 → 记败 → 杀 → 退避
    st.timer = setTimeout(() => {
      deps.log('[jamony] P2.1: respawn 后 10s 无延迟心跳，记败退避')
      st.attempts++
      deps.killForRespawn().then(() => {
        if (st.phase === 'respawning') scheduleRespawn('连接未建立')
      })
    }, T.WATCH_MS)
  }

  // 放弃 = 诚实移交: 残余进程清掉，exit 广播放行（main 侧 exit handler 见 phase=idle 自然放行）。
  // 进程已死无 exit 可发时 main 侧兜底补发——防 web 冻在合奏视角（假死 UI）
  function giveUpRespawn(reason) {
    deps.log(`[jamony] P2.1: 自愈放弃（${reason}）—— 移交 web 切听众/解散流程`)
    deps.telemetry('selfheal_giveup', { reason, trigger: st.trigger, attempts: st.attempts })
    gen++
    clearTimer()
    st.phase = 'idle'
    st.attempts = 0
    st.connectedAt = 0
    st.downAt = 0
    st.trigger = ''
    st.respawnCount = 0
    deps.onGiveUp()  // main 侧：killJamsoul 或手动补发 jamsoul-exited
  }

  // main 侧 exit handler 调用: respawn 的子进程秒退 = 本次尝试直接失败,不等 10s 看门狗
  function notifySpawnEarlyExit() {
    if (st.phase !== 'respawning') return
    clearTimer()
    st.attempts++
    scheduleRespawn('respawn 子进程秒退')
  }

  return {
    st,
    suppress, rearm,
    onNetOffline, onNetOnline,
    onJamsoulDisconnected, onHeartbeat,
    attemptRespawn, notifySpawnEarlyExit,
    isNetOnline: () => netOnline,
    isHealing: () => st.phase !== 'idle',   // 换防期 exit/launched 抑制广播的判据
    resetFamine,
  }
}

module.exports = { createRespawnCore, DEFAULTS }
