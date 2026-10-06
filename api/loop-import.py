#!/usr/bin/env python3
"""鼓机 Loop 入库工具（2026-10-06，欢哥 rock 风格入库定稿流程）
用法: python3 loop-import.py <源风格文件夹> <风格名> [数量N]
流程: 递归拍平 → 按路径序(歌曲序→段落序→文件序)编 NNN → 去空格改名
      → 拷贝到 drum-loops/<风格>/ → SSD→GM 键位转换(复用 ssd2gm) → GM键位校验
源文件夹原件不动（桌面即原版存档）；数量N=只处理前N个（试跑用，序号与全量一致）
"""
import os, sys, shutil
import mido

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ssd2gm import convert  # 只改 note + 强制通道10，不动时间/力度/速度

REPO = os.path.dirname(os.path.abspath(__file__))
DEST_BASE = os.path.join(REPO, "..", "drum-loops")
GM_DRUM_KEYS = set(range(35, 82))  # GM 通道10打击乐标准键位


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, style = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    dest = os.path.join(DEST_BASE, style)
    os.makedirs(dest, exist_ok=True)

    # 递归收集，按完整路径排序 = 歌曲序(44 084→44 172)→段落序(02 Verse→06 Outro)→文件序
    files = []
    for root, dirs, fs in os.walk(src):
        for f in fs:
            if f.lower().endswith('.mid'):
                files.append(os.path.join(root, f))
    files.sort()
    total = len(files)
    if limit:
        files = files[:limit]
    print(f"收集 {total} 个 MIDI，本次处理 {len(files)} 个 → {dest}\n")

    bad = 0
    for i, p in enumerate(files, 1):
        orig = os.path.basename(p)[:-4]          # 去 .mid
        clean = orig.replace(' ', '')            # 去空格：Vrs 01 - X - 4 Bars → Vrs01-X-4Bars
        newname = f"{i:03d}-{clean}.mid"
        dst = os.path.join(dest, newname)
        shutil.copy2(p, dst)
        changes, chfix = convert(dst)            # SSD→GM（就地转换副本）
        notes = set()
        mid = mido.MidiFile(dst)
        for t in mid.tracks:
            for m in t:
                if m.type in ('note_on', 'note_off') and not m.is_meta:
                    notes.add(m.note)
        off = notes - GM_DRUM_KEYS
        mark = f"⚠️ GM表外{sorted(off)}" if off else "✅"
        if off:
            bad += 1
        rel = os.path.relpath(p, src)
        print(f"{newname}  ← {rel}  (映射{changes} 通道{chfix}) {mark}")

    print(f"\n完成 {len(files)} 个，GM 键位校验异常 {bad} 个")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
