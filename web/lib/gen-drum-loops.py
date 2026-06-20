#!/usr/bin/env python3
"""生成多风格 MIDI 鼓循环文件"""
import struct, os, random, math

BASE = "/var/www/jamony/drum-loops"
TICKS = 480  # ticks per beat

def varlen(v):
    b = []
    b.append(v & 0x7F)
    v >>= 7
    while v > 0:
        b.append(v & 0x7F | 0x80)
        v >>= 7
    return bytes(reversed(b))

def make_midi(tracks_data, ticks_per_beat=480):
    """tracks_data: list of (delta_time list, event list)"""
    result = b'MThd' + struct.pack('>IHHH', 6, 1, len(tracks_data) + 1, ticks_per_beat)

    # Tempo track
    tt = b''
    for data in tracks_data:
        deltas, events = data
        dt = 0
        for d, e in zip(deltas, events):
            dt += d
            tt += varlen(dt) + e
            dt = 0
        tt += varlen(0) + b'\xff\x2f\x00'
    result += b'MTrk' + struct.pack('>I', len(tt)) + tt
    return result

def write_midi(filename, bpm, notes):
    """
    notes: list of (tick, note, vel, dur_in_ticks)
    bpm: beats per minute
    """
    tempo_us = 60000000 // bpm
    events = []
    for tick, note, vel, dur in notes:
        events.append((tick, 0x99, note, vel))
        events.append((tick + dur, 0x89, note, 0))
    events.sort()

    # Tempo track header
    tt = b''
    tt += varlen(0) + b'\xff\x51\x03' + struct.pack('>I', tempo_us)[1:]  # set tempo
    tt += varlen(0) + b'\xff\x58\x04\x04\x02\x18\x08'  # time sig 4/4
    tt += varlen(0) + b'\xff\x2f\x00'  # end

    # Drum track
    dt = b''
    prev = 0
    for tick, st, note, vel in events:
        d = tick - prev
        prev = tick
        dt += varlen(d) + struct.pack('BBB', st, note, vel)
    dt += varlen(0) + b'\xff\x2f\x00'

    with open(filename, 'wb') as f:
        f.write(b'MThd' + struct.pack('>IHHH', 6, 1, 2, TICKS))
        f.write(b'MTrk' + struct.pack('>I', len(tt)) + tt)
        f.write(b'MTrk' + struct.pack('>I', len(dt)) + dt)

# ========== 鼓谱生成函数 ==========
KICK, SNARE, HIHAT, RIDE, CRASH, TOM_H, TOM_M, TOM_L = 36, 38, 42, 51, 49, 50, 47, 43
OPEN_HH = 46
RIM = 37
CLAP = 39

def gen_rock(bars=4):
    """摇滚：底鼓1/3拍，军鼓2/4拍，八分踩镲"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            notes.append((t, KICK, random.randint(95, 110), TICKS // 4))
            notes.append((t, HIHAT, random.randint(70, 85), TICKS // 8))
            notes.append((t + TICKS // 2, HIHAT, random.randint(60, 75), TICKS // 8))
            if beat == 0:  # 1拍 底鼓
                notes.append((t, KICK, random.randint(100, 115), TICKS // 3))
            if beat == 2:  # 3拍 底鼓(轻)
                notes.append((t, KICK, random.randint(80, 95), TICKS // 3))
            if beat in (1, 3):  # 2/4拍 军鼓
                vel = random.randint(90, 105) if beat == 1 else random.randint(85, 100)
                notes.append((t, SNARE, vel, TICKS // 3))
            # 第4拍加 crash
            if beat == 3 and b % 2 == 0:
                notes.append((t, CRASH, random.randint(85, 100), TICKS))
    return notes

def gen_funk(bars=4):
    """放克：十六分切分，底鼓密集"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # 踩镲十六分
            for e in range(4):
                vt = t + e * TICKS // 4
                notes.append((vt, HIHAT, random.randint(55, 80), TICKS // 8))
            # 底鼓切分
            kick_patterns = [[0], [0, 2], [0.5, 2.5], [0, 1.5, 3], [0.5, 2, 3.5]]
            kp = random.choice(kick_patterns)
            for off in kp:
                kt = t + int(off * TICKS // 4)
                notes.append((kt, KICK, random.randint(85, 110), TICKS // 4))
            # 军鼓 2/4
            if beat in (1, 3):
                vel = random.randint(80, 100) if beat == 1 else random.randint(75, 95)
                notes.append((t, SNARE, vel, TICKS // 4))
            # ghost note 军鼓
            if beat in (0, 2) and random.random() < 0.5:
                gt = t + random.choice([TICKS//4, TICKS//2, TICKS*3//4])
                notes.append((gt, SNARE, random.randint(30, 50), TICKS // 8))
            # 部分拍加 rim
            if random.random() < 0.3:
                rt = t + TICKS * 3 // 4
                notes.append((rt, RIM, random.randint(50, 70), TICKS // 8))
    return notes

def gen_jazz(bars=4):
    """爵士：ride 镲为主，swing 感，轻军鼓"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # ride 镲 swing 八分
            notes.append((t, RIDE, random.randint(60, 80), TICKS // 6))
            swing_off = TICKS * 2 // 3  # swing: 第二下靠后
            notes.append((t + swing_off, RIDE, random.randint(50, 70), TICKS // 6))
            # 底鼓散步
            if random.random() < 0.4:
                kt = t + random.choice([0, TICKS//2, TICKS*3//4])
                notes.append((kt, KICK, random.randint(60, 85), TICKS // 4))
            # 军鼓轻打 2/4
            if beat in (1, 3):
                notes.append((t, SNARE, random.randint(50, 75), TICKS // 4))
            # 额外军鼓 ghost
            if random.random() < 0.3:
                notes.append((t + TICKS//2, SNARE, random.randint(25, 45), TICKS // 8))
            # 偶尔 crash
            if beat == 0 and b % 4 == 0:
                notes.append((t, CRASH, random.randint(60, 80), TICKS))
    return notes

def gen_blues(bars=4):
    """布鲁斯：shuffle 感，底鼓 1/3，军鼓 2/4"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # shuffle 踩镲
            notes.append((t, HIHAT, random.randint(65, 85), TICKS // 6))
            swing_off = TICKS * 2 // 3
            notes.append((t + swing_off, HIHAT, random.randint(55, 70), TICKS // 6))
            # 底鼓 1/3
            if beat == 0:
                notes.append((t, KICK, random.randint(95, 110), TICKS // 3))
            if beat == 2:
                notes.append((t, KICK, random.randint(80, 100), TICKS // 3))
            # 军鼓 2/4
            if beat in (1, 3):
                notes.append((t, SNARE, random.randint(85, 105), TICKS // 3))
            # 偶尔填充
            if random.random() < 0.2 and beat == 3:
                for i in range(3):
                    ft = t + i * TICKS // 3
                    notes.append((ft, TOM_M, random.randint(60, 80), TICKS // 6))
    return notes

def gen_metal(bars=4):
    """金属：双底鼓，重军鼓，密集踩镲"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # 踩镲十六分
            for e in range(4):
                vt = t + e * TICKS // 4
                notes.append((vt, HIHAT, random.randint(80, 100), TICKS // 8))
            # 双底鼓
            if beat in (0, 2):
                notes.append((t, KICK, random.randint(105, 120), TICKS // 4))
                notes.append((t + TICKS // 2, KICK, random.randint(90, 110), TICKS // 4))
            else:
                notes.append((t, KICK, random.randint(95, 115), TICKS // 4))
            # 军鼓 2/4
            if beat in (1, 3):
                notes.append((t, SNARE, random.randint(105, 120), TICKS // 4))
    return notes

def gen_folk(bars=4):
    """民谣：轻柔简约"""
    notes = []
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # 踩镲每拍一下（轻）
            notes.append((t, HIHAT, random.randint(40, 60), TICKS // 4))
            # 底鼓散步
            if beat in (0, 2):
                notes.append((t, KICK, random.randint(60, 80), TICKS // 3))
            # 军鼓 2/4（轻）
            if beat in (1, 3):
                notes.append((t, SNARE, random.randint(50, 70), TICKS // 4))
            # 偶尔 tambourine
            if beat == 2 and random.random() < 0.4:
                notes.append((t, RIM, random.randint(40, 60), TICKS // 4))
    return notes

def gen_latin(bars=4):
    """拉丁：clave 节奏感"""
    notes = []
    clave = [0, 1.5, 2.5, 3, 3.75]  # 标准 son clave
    for b in range(bars):
        for beat in range(4):
            t = (b * 4 + beat) * TICKS
            # 踩镲
            notes.append((t, HIHAT, random.randint(55, 70), TICKS // 8))
            notes.append((t + TICKS // 2, HIHAT, random.randint(50, 65), TICKS // 8))
            # 底鼓
            if beat in (0, 2):
                notes.append((t, KICK, random.randint(80, 100), TICKS // 4))
            # 军鼓 2/4
            if beat in (1, 3):
                notes.append((t, SNARE, random.randint(70, 90), TICKS // 4))
            # clave
            for off in clave:
                kt = (b * 4 + beat) * TICKS + int(off * TICKS // 4)
                if 0 <= beat + off < 4:
                    notes.append((kt, RIM, random.randint(60, 85), TICKS // 8))
    return notes

GENERATORS = {
    'rock': gen_rock, 'funk': gen_funk, 'jazz': gen_jazz,
    'blues': gen_blues, 'metal': gen_metal, 'folk': gen_folk, 'latin': gen_latin,
}

# 每个风格生成 20 个变体，不同的 BPM
BPM_RANGES = {
    'rock': range(70, 161, 5), 'funk': range(80, 131, 5),
    'jazz': range(100, 221, 5), 'blues': range(60, 141, 5),
    'metal': range(120, 221, 5), 'folk': range(60, 131, 5),
    'latin': range(80, 161, 5),
}

os.system(f'mkdir -p {BASE}')
for style, gen in GENERATORS.items():
    style_dir = f'{BASE}/{style}'
    os.system(f'mkdir -p {style_dir}')
    bpms = BPM_RANGES.get(style, range(80, 161, 5))
    count = 0
    for bpm in bpms:
        random.seed(bpm * 137 + hash(style) % 100000)  # deterministic per BPM
        for variant in range(3):  # 3 variants per BPM
            notes = gen(4)
            fname = f'{style_dir}/{style}_{bpm}bpm_v{variant+1}.mid'
            try:
                write_midi(fname, bpm, notes)
                count += 1
            except Exception as e:
                print(f'Error: {fname} - {e}')
    print(f'  {style}: {count} 个文件')

print(f'\n✅ 总计: {sum(len(os.listdir(f"{BASE}/{s}")) for s in GENERATORS)} 个 MIDI 鼓谱文件')
