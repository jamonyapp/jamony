#!/usr/bin/env python3
"""SSD5 MIDI → GM 映射工具
用法: python3 ssd2gm.py <MIDI文件路径>
功能: 读取 MIDI 文件，将 SSD5 键位映射到 GM 标准，只改 note 数值，其余不动
"""
import mido, json, os, sys

MAPPING_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ssd2gm_mapping.json")

def load_mapping():
    with open(MAPPING_PATH, "r") as f:
        raw = json.load(f)
    return {int(k): v["to"] for k, v in raw.items()}

def convert(filepath):
    SSD_TO_GM = load_mapping()
    
    mid = mido.MidiFile(filepath)
    changes = 0
    channel_fixes = 0
    
    for track in mid.tracks:
        for msg in track:
            if msg.type in ("note_on", "note_off") and not msg.is_meta:
                # 确保通道 10
                if msg.channel != 9:
                    msg.channel = 9
                    channel_fixes += 1
                # SSD→GM 键位映射
                if msg.note in SSD_TO_GM:
                    new_note = SSD_TO_GM[msg.note]
                    if new_note != msg.note:
                        msg.note = new_note
                        changes += 1
    
    mid.save(filepath)
    return changes, channel_fixes

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 ssd2gm.py <MIDI文件路径>")
        sys.exit(1)
    
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"❌ 文件不存在: {path}")
        sys.exit(1)
    
    note_changes, ch_fixes = convert(path)
    print(f"✅ {os.path.basename(path)}")
    print(f"   键位映射: {note_changes} 处")
    print(f"   通道修正: {ch_fixes} 处")
