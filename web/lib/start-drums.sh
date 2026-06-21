#!/bin/bash
# jamony 鼓机控制脚本 v4
# 用法: bash start-drums.sh <style> <bpm> [filename] [room_port]
STATE_FILE="/tmp/jamony-drums.pid"
STYLE_DIR="/var/www/jamony/drum-loops"
SOUNDFONT="/usr/share/sounds/sf2/FluidR3_GM.sf2"
CMD="${1:-status}"

if [ "$CMD" = "stop" ]; then
    if [ -f "$STATE_FILE" ]; then
        kill "$(cat "$STATE_FILE")" 2>/dev/null
        rm -f "$STATE_FILE"
    fi
    pkill -f "fluidsynth.*loop-cmd" 2>/dev/null
    sleep 1
    echo "✅ 鼓机已停止"
    exit 0
fi

STYLE="$1"
BPM="${2:-120}"
SPECIFIC_FILE="$3"
ROOM_PORT="$4"

[ -z "$STYLE" ] && { echo "❌ 请指定风格"; exit 1; }

if [ -n "$SPECIFIC_FILE" ]; then
    MIDI_FILE="$STYLE_DIR/$STYLE/$SPECIFIC_FILE"
    [ ! -f "$MIDI_FILE" ] && { echo "❌ 文件不存在"; exit 1; }
else
    FILES=($(ls "$STYLE_DIR/$STYLE"/*.mid 2>/dev/null))
    [ ${#FILES[@]} -eq 0 ] && { echo "❌ 无 MIDI 文件"; exit 1; }
    MIDI_FILE="${FILES[$RANDOM % ${#FILES[@]}]}"
fi

# 停旧的鼓机进程（只杀之前的 loop-cmd 进程，不杀基底）
pkill -f "fluidsynth.*loop-cmd" 2>/dev/null
sleep 2

# 检测或启动基底 FluidSynth
MIDI_PORT=""
for p in $(seq 128 135); do
    if aplaymidi -l 2>/dev/null | grep -q "${p}:.*FluidSynth"; then
        MIDI_PORT="${p}:0"
        break
    fi
done
JACK_NAME=""
for j in $(jack_lsp 2>/dev/null | grep ":left" | grep -v "system" | grep -v "Jamulus" | cut -d: -f1 | sort -u); do
    JACK_NAME="$j"
    break
done

# 找幽灵
case "$ROOM_PORT" in
    22125) GHOST_L="Jamulus-02:input left";  GHOST_R="Jamulus-02:input right" ;;
    22126) GHOST_L="Jamulus-03:input left";  GHOST_R="Jamulus-03:input right" ;;
    22124) GHOST_L="Jamulus:input left";     GHOST_R="Jamulus:input right" ;;
    *)
        # 自动找第一个可用的
        ALL=$(jack_lsp 2>/dev/null | grep ":input left" | grep -v "system")
        GHOST_L=$(echo "$ALL" | head -1)
        GHOST_R=$(echo "$GHOST_L" | sed "s/:input left/:input right/")
        ;;
esac

# 断开旧连接，重新连鼓机→幽灵
[ -n "$JACK_NAME" ] && jack_disconnect "${JACK_NAME}:left" "system:playback_1" 2>/dev/null
[ -n "$JACK_NAME" ] && jack_disconnect "${JACK_NAME}:right" "system:playback_2" 2>/dev/null
[ -n "$JACK_NAME" ] && jack_connect "${JACK_NAME}:left" "$GHOST_L" 2>/dev/null
[ -n "$JACK_NAME" ] && jack_connect "${JACK_NAME}:right" "$GHOST_R" 2>/dev/null

# 生成循环配置文件
LOOP_CMD="/tmp/loop-cmd-$$.txt"
echo "player_loop -1" > "$LOOP_CMD"
echo "player_tempo_bpm $BPM" >> "$LOOP_CMD"   # 设置用户指定的 BPM
echo "player_start" >> "$LOOP_CMD"

# 启动 FluidSynth 循环播放（自带无缝循环，无间隔！）
nohup fluidsynth -f "$LOOP_CMD" \
    -a jack -j -i \
    -p "FluidSynth-Drums" \
    -o synth.sample-rate=48000 \
    -o synth.gain=3.0 \
    -o synth.polyphony=64 \
    "$SOUNDFONT" "$MIDI_FILE" > /dev/null 2>&1 &
PID=$!
echo "$PID" > "$STATE_FILE"

echo "✅ 鼓机启动: $STYLE @ ${BPM}BPM ($(basename "$MIDI_FILE")) PID=$PID"
echo "   JACK=${JACK_NAME} 幽灵=$GHOST_L"
