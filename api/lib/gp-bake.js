'use strict'
// GP 烤制模块（1029 自 server.js 原样抽出，零逻辑改动）：alphatab 解析+混音烤制+MIDI 生成。
// 抽出唯一目的=让 worker 线程能独立 require（房间隔离宪法：纯 JS CPU 计算不再占主事件循环）。
const fs = require('fs')

const alphatab = require('@coderline/alphatab')

// MIDI 掐尾到 endTick（1012 ⑥-2c 原生循环）：>endTick 事件全弃；A..B 间开了没关的音补 note-off@endTick
// （不补=原生循环下尾音跨遍永鸣）；末尾钉 vel0 无声事件作 end 锚（引擎"end"取事件尾，纯休止结尾的选段会被引擎提前回头）
function gpTruncateMidi(midiFile, endTick) {
  const ET = alphatab.midi.MidiEventType
  const CT = alphatab.midi.ControllerType
  const tr0 = midiFile.tracks[0]
  const tr0track = tr0 && tr0.events.length ? tr0.events[0].track : 0
  for (const tr of midiFile.tracks) {
    const kept = []
    const open = new Map()  // `${ev.track}|${ev.channel}|${ev.noteKey}` → 未关 note-on 数
    const chans = new Set() // 有事件落地的通道（B 点收口要用）
    for (const ev of tr.events) {
      if (ev.tick > endTick) {
        if (ev.type === ET.NoteOn) continue
        if (ev.type === ET.NoteOff) continue
        continue
      }
      if (typeof ev.channel === 'number') chans.add(ev.channel)
      if (ev.type === ET.NoteOn) {
        const k = `${ev.track}|${ev.channel}|${ev.noteKey}`
        open.set(k, (open.get(k) || 0) + 1)
      } else if (ev.type === ET.NoteOff) {
        const k = `${ev.track}|${ev.channel}|${ev.noteKey}`
        if (open.get(k)) open.set(k, open.get(k) - 1)
      }
      kept.push(ev)
    }
    // B 点收口（1012 E2E 实测定罪：只补 note-off 不够——延音踏板 CC64-off 被截掉=踏板永按，
    // 每遍层积成音墙（cycle2/3 头不回落）。补音关 + 每通道[抬踏板→重置控制器→全切兜底]（同 tick 等效，连 A 前就按住跨整个选段的音也切）
    const ccs = []
    for (const ch of chans) {
      ccs.push(new alphatab.midi.ControlChangeEvent(tr0track, endTick, ch, CT.HoldPedal, 0))
      ccs.push(new alphatab.midi.ControlChangeEvent(tr0track, endTick, ch, CT.ResetControllers, 0))
      ccs.push(new alphatab.midi.ControlChangeEvent(tr0track, endTick, ch, CT.AllSoundOff, 0))
    }
    const offs = []
    for (const [k, n] of open) {
      if (n <= 0) continue
      const [t, ch, key] = k.split('|').map(Number)
      for (let i = 0; i < n; i++) offs.push(new alphatab.midi.NoteOffEvent(t, endTick, ch, key, 0))
    }
    tr.events = kept.concat(offs, ccs).sort((a, b) => a.tick - b.tick)
  }
  // end 锚钉在 tracks[0]（vel0 note-on=静默的 note-off 语义，任何通道都无害）
  if (tr0 && tr0.events.length) {
    tr0.events.push(new alphatab.midi.NoteOnEvent(tr0track, endTick, 0, 127, 0))
    tr0.events.sort((a, b) => a.tick - b.tick)
  }
}

// GP→MIDI：返回 { midPath, tracks } 或抛错（格式不支持/文件损坏）
// mix（10-09 步骤② 调音台，欢哥 A 方案：全员后动作胜出、播放瞬间定稿）：生效点=播放前改各轨
// playbackInfo.volume（0..16 域，有效静音=0；任一 S 亮=只放 S 且未 M 的轨），生成器自动烤成 CC7
// ——零事件手术，语义与 alphaTab 播放器一致；缺省无混音=原音量不变
// endMs（1012 ⑥-2c）：选段 B 点（原速域 ms）——存在则文件烤到 B 为止（引擎原生 player_loop 在 B 无缝回头）
// seekMs（1013 全曲循环）：全谱文件（startMs=0）首遍从此处（原速域 ms）跳入——首遍从指针播到尾、
// 之后引擎原生循环头↔尾（⑥-2a"全曲循环=回曲目头"语义在原生循环下的实现；昨天的病根=烤制窗口≠全谱，今天同病起播路径发作）
function gpToMidi(gpPath, midPath, mix, startMs, speedArg, countIn, endMs, seekMs) {
  const data = new Uint8Array(fs.readFileSync(gpPath))
  const score = alphatab.importer.ScoreLoader.loadScoreFromBytes(data, null)
  const mutes = Array.isArray(mix && mix.mutes) ? mix.mutes.map(Number) : []
  const solos = Array.isArray(mix && mix.solos) ? mix.solos.map(Number) : []
  const vols = (mix && typeof mix.vols === 'object' && mix.vols) || {}
  const anySolo = solos.length > 0
  for (const t of score.tracks) {
    const audible = anySolo ? (solos.includes(t.index) && !mutes.includes(t.index)) : !mutes.includes(t.index)
    const pct = Math.min(100, Math.max(0, Number(vols[t.index] ?? 100)))
    t.playbackInfo.volume = audible ? t.playbackInfo.volume * pct / 100 : 0
  }
  const midiFile = new alphatab.midi.MidiFile()
  const handler = new alphatab.midi.AlphaSynthMidiFileHandler(midiFile, true)
  const generator = new alphatab.midi.MidiFileGenerator(score, null, handler)
  generator.generate()
  // 从指针处开播（10-09 欢哥补充定稿）：startMs>0 → tick 平移裁剪，fluidsynth 拿到即"从该处开始"
  // ⚠️裁剪必须用原 tempo 积分（startMs 是原速域谱面位置）——倍速改写只能排在其后
  if (Number.isFinite(startMs) && startMs > 0) {
    gpShiftMidiStart(midiFile, Math.round(gpMsToTick(midiFile, startMs)))
  }
  // 选段掐尾（1012 ⑥-2c）：B 点截文件（tick 域倍速无关，与 startMs 同在原速积分、speed 烤写之前）
  // ⚠️gpMsToTick 在已平移的时间轴上查（shift 后 0=原 A 点），故查 (endMs - 实效startMs)——首版写绝对 endMs 多留一个 A（干跑45000≠15000定罪）
  const gpStartBase = Number.isFinite(startMs) && startMs > 0 ? startMs : 0
  if (Number.isFinite(endMs) && endMs > gpStartBase) {
    gpTruncateMidi(midiFile, Math.round(gpMsToTick(midiFile, endMs - gpStartBase)))
  }
  // 首遍跳入点（1013 全曲循环）：原速域 seekMs→tick（原 tempo 域积分，与 startMs 同理；tick 域倍速无关）
  const musicSeekTick = (Number.isFinite(seekMs) && seekMs > 0 && !(Number.isFinite(startMs) && startMs > 0))
    ? Math.round(gpMsToTick(midiFile, seekMs)) : 0
  // 倍速（10-10 步骤⑤）：tempo ×speed 烤进 live MIDI，fluidsynth 按文件 tempo 走 → 全员音频同倍速；
  // tick 域不动=谱面位置语义不变，客户端对表只需墙钟 elapsed ×speed
  const speed = Number(speedArg) || 1
  if (speed !== 1) {
    for (const tr of midiFile.tracks) for (const ev of tr.events) {
      if (typeof ev.beatsPerMinute === 'number' && ev.beatsPerMinute > 0) ev.beatsPerMinute = ev.beatsPerMinute * speed
    }
  }
  // 预备拍（1011 ⑥-1 欢哥定稿：服务器烤 click 进流，全员一起听哒哒哒→音乐进，零本地协调）：
  // 全事件右移 N 拍 + channel9 side stick 每拍一击置头；tick0 补烤后 tempo（平移后首个 tempo 在 N 拍处，
  // click 时长依赖它否则 fluidsynth 按默认120走）。N=第一拍号分子（默认4）；countInMs=烤速域时长随 gp-state 下发
  let countInMs = 0
  let countInShift = 0
  if (countIn) {
    const division = midiFile.division
    let numerator = 4, denIdx = 2
    outer: for (const tr of midiFile.tracks) for (const ev of tr.events) {
      if (typeof ev.numerator === 'number') { numerator = ev.numerator; denIdx = ev.denominatorIndex ?? 2; break outer }
    }
    const beatTicks = Math.round(division * 4 / Math.pow(2, denIdx))
    const shift = numerator * beatTicks
    countInShift = shift
    for (const tr of midiFile.tracks) for (const ev of tr.events) ev.tick += shift
    let bpm = 120, bestTick = Infinity
    for (const tr of midiFile.tracks) for (const ev of tr.events) {
      if (typeof ev.beatsPerMinute === 'number' && ev.beatsPerMinute > 0 && ev.tick < bestTick) { bestTick = ev.tick; bpm = ev.beatsPerMinute }
    }
    const t0 = new alphatab.midi.TempoChangeEvent(0, 0)  // ⚠️事件类在 midi 命名空间（model 下没有——1011实测翻车点）
    t0.beatsPerMinute = bpm
    midiFile.tracks[0].events.push(t0)
    for (let i = 0; i < numerator; i++) {
      midiFile.tracks[0].events.push(new alphatab.midi.NoteOnEvent(0, i * beatTicks, 9, 37, i === 0 ? 110 : 88))
      midiFile.tracks[0].events.push(new alphatab.midi.NoteOffEvent(0, i * beatTicks + Math.round(beatTicks / 2), 9, 37, 0))
    }
    midiFile.tracks[0].events.sort((a, b) => a.tick - b.tick)  // 稳定排序保同 tick 携带序，跨 tick 归位（fluidsynth 按 tick 域走）
    countInMs = numerator * (60000 / bpm)
  }
  // 全时长（烤速域，含 count-in）——B'方案自然结束定时器用
  let maxTick = 0
  for (const tr of midiFile.tracks) for (const ev of tr.events) if (ev.tick > maxTick) maxTick = ev.tick
  const totalMs = Math.ceil(gpTickToMs(midiFile, maxTick))
  fs.writeFileSync(midPath, Buffer.from(midiFile.toBinary()))
  // seek 定位（1013 全曲循环）：目标=跳入点前留一拍余量（seek 落点滞后几 tick 会跳过落点音符——1012 六连全静音判例）；
  // seekTickMs=落点的烤速域墙钟偏移（playAt 锚=开声时刻-此值 → tick0↔playAt 精确对齐）；≤1.5拍不跳（从头走）
  let seekTick = 0, seekTickMs = 0
  if (musicSeekTick > 1440) {
    seekTick = musicSeekTick + countInShift - 480
    seekTickMs = Math.round(gpTickToMs(midiFile, seekTick))
  }
  return {
    midPath,
    tracks: score.tracks.map(t => ({ name: String(t.name || '').slice(0, 40) })),
    countInMs,
    totalMs,
    endTick: maxTick,  // 1012 ⑥-2c：烤制周期（引擎回显 end 的校验基准）
    seekTick, seekTickMs,
  }
}

// tick→ms 正向积分（烤后 tempo 域，与前端 tickToMs 同构）——⑥-1 自然结束定时器用
function gpTickToMs(midiFile, tick) {
  const tempos = []
  for (const tr of midiFile.tracks) for (const ev of tr.events) if (typeof ev.beatsPerMinute === 'number' && ev.beatsPerMinute > 0) tempos.push({ tick: ev.tick, bpm: ev.beatsPerMinute })
  tempos.sort((a, b) => a.tick - b.tick)
  let ms = 0, t = 0, bpm = 120
  for (const p of tempos) {
    if (p.tick >= tick) break
    ms += ((p.tick - t) / midiFile.division) * (60000 / bpm)
    t = p.tick; bpm = p.bpm
  }
  return ms + ((tick - t) / midiFile.division) * (60000 / bpm)
}

// ms→tick：沿 tempo 事件积分反查（与前端总时长积分同一套事件流，正反互逆）
function gpMsToTick(midiFile, ms) {
  const tempos = []
  for (const tr of midiFile.tracks) for (const ev of tr.events) if (typeof ev.beatsPerMinute === 'number' && ev.beatsPerMinute > 0) tempos.push({ tick: ev.tick, bpm: ev.beatsPerMinute })
  tempos.sort((a, b) => a.tick - b.tick)
  let tick = 0, accMs = 0, bpm = 120
  for (const next of tempos) {
    const segMs = ((next.tick - tick) / midiFile.division) * (60000 / bpm)
    if (accMs + segMs >= ms) return tick + ((ms - accMs) / (60000 / bpm)) * midiFile.division
    accMs += segMs; tick = next.tick; bpm = next.bpm
  }
  return tick + ((ms - accMs) / (60000 / bpm)) * midiFile.division
}

// 从指定 tick 开始播放：裁掉更早的事件并整体平移。
// ⚠️携带修复（10-10 欢哥实测"过载吉他变钢琴"）：起点前的 ProgramChange(乐器)/BankSelect(音色库)/
// Volume/Expression 指令必须补到新文件 tick0——fluidsynth 没收到乐器指令就退默认钢琴；tempo 同理
function gpShiftMidiStart(midiFile, startTick) {
  if (!(startTick > 0)) return
  let lastTempoBefore = null
  // 每通道：起点前最后一次 乐器/音色库粗细/音量/表情 指令（携带集合）。
  // ⚠️按事件实际所在的 MidiTrack 对象归组（format 0 时所有事件并在 tracks[0]，ev.track 是原始轨号会对不上宿主）
  const carryByTrackObj = new Map()  // MidiTrack → Map(`${ev.track}|${ev.channel}` → { program, bankCoarse, bankFine, volume, expression })
  for (const tr of midiFile.tracks) for (const ev of tr.events) {
    if (ev.tick >= startTick) continue
    if (typeof ev.beatsPerMinute === 'number') lastTempoBefore = ev
    const key = `${ev.track}|${ev.channel}`
    let slot = null
    if (typeof ev.program === 'number') {
      const m = carryByTrackObj.get(tr) || new Map(); carryByTrackObj.set(tr, m)
      slot = m.get(key) || {}; slot.program = ev; m.set(key, slot)
    } else if (typeof ev.controller === 'number') {
      if (ev.controller !== 0 && ev.controller !== 32 && ev.controller !== 7 && ev.controller !== 11) continue
      const m = carryByTrackObj.get(tr) || new Map(); carryByTrackObj.set(tr, m)
      slot = m.get(key) || {}
      if (ev.controller === 0) slot.bankCoarse = ev
      else if (ev.controller === 32) slot.bankFine = ev
      else if (ev.controller === 7) slot.volume = ev
      else slot.expression = ev
      m.set(key, slot)
    }
  }
  for (const tr of midiFile.tracks) {
    const carried = []
    const carryMap = carryByTrackObj.get(tr)
    if (carryMap) for (const c of carryMap.values()) {
      for (const key of ['bankCoarse', 'bankFine', 'program', 'volume', 'expression']) {
        const e = c[key]
        if (e) { e.tick = 0; carried.push(e) }
      }
    }
    const kept = []
    for (const ev of tr.events) {
      if (ev.tick < startTick) { if (ev === lastTempoBefore) { ev.tick = 0; kept.push(ev) } continue }
      ev.tick -= startTick
      kept.push(ev)
    }
    // 携带指令排最前（同 tick0 时乐器指令先于音符），tempo 事件紧随
    tr.events = [...carried, ...kept]
  }
}

module.exports = { gpToMidi }
