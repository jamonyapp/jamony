#!/bin/bash
# jamony 鼓机控制脚本 v3
# 用法: bash start-drums.sh <style> <bpm> [filename] [room_port]
#        bash start-drums.sh stop

STATE_FILE="/tmp/jamony-drums.pid"
STYLE_DIR="/var/www/jamony/drum-loops"
CMD="${1:-status}"

if [ "$CMD" = "stop" ]; then
    if [ -f "$STATE_FILE" ]; then
        kill "$(cat "$STATE_FILE")" 2>/dev/null
        rm -f "$STATE_FILE"
    fi
    pkill -f aplaymidi 2>/dev/null
    echo "✅ 鼓机已停止"
    exit 0
fi

STYLE="$1"
BPM="${2:-120}"
SPECIFIC_FILE="$3"
ROOM_PORT="$4"

[ -z "$STYLE" ] && { echo "❌ 请指定风格"; exit 1; }

# 选择 MIDI 文件
if [ -n "$SPECIFIC_FILE" ]; then
    MIDI_FILE="$STYLE_DIR/$STYLE/$SPECIFIC_FILE"
    [ ! -f "$MIDI_FILE" ] && { echo "❌ 文件不存在: $MIDI_FILE"; exit 1; }
else
    FILES=($(ls "$STYLE_DIR/$STYLE"/*.mid 2>/dev/null))
    [ ${#FILES[@]} -eq 0 ] && { echo "❌ 无 MIDI 文件"; exit 1; }
    MIDI_FILE="${FILES[$RANDOM % ${#FILES[@]}]}"
fi

# 停旧鼓机
pkill -f aplaymidi 2>/dev/null
sleep 1

# 动态检测 ALSA MIDI 端口号（找到第一个 FluidSynth）
MIDI_PORT=""
for p in 128 129 130 131 132; do
    if aplaymidi -l 2>/dev/null | grep -q "${p}:.*FluidSynth"; then
        MIDI_PORT="${p}:0"
        break
    fi
done
if [ -z "$MIDI_PORT" ]; then
    # 启动一个
    fluidsynth -a jack -j -i -s -p FluidSynth-Drums \
      -o synth.sample-rate=48000 -o synth.gain=3.0 \
      -o synth.polyphony=64 \
      /usr/share/sounds/sf2/FluidR3_GM.sf2 &>/dev/null &
    sleep 4
    for p in 128 129 130 131 132; do
        if aplaymidi -l 2>/dev/null | grep -q "${p}:.*FluidSynth"; then
            MIDI_PORT="${p}:0"
            break
        fi
    done
fi
echo "MIDI 端口: $MIDI_PORT"

# 动态检测 JACK 端口名
JACK_NAME="fluidsynth"
jack_lsp 2>/dev/null | grep -q "${JACK_NAME}:left" || JACK_NAME="fluidsynth"
jack_lsp 2>/dev/null | grep -q "${JACK_NAME}:left" || JACK_NAME=""

# 找目标幽灵的输入端口
GHOST_L=""
GHOST_R=""
case "$ROOM_PORT" in
    22125) GHOST_L="Jamulus-02:input left";  GHOST_R="Jamulus-02:input right" ;;
    22126) GHOST_L="Jamulus-03:input left";  GHOST_R="Jamulus-03:input right" ;;
    *)     GHOST_L="Jamulus:input left";     GHOST_R="Jamulus:input right" ;;
esac

# 断开所有可能冲突的旧连接
jack_disconnect "$JACK_NAME:left" "system:playback_1" 2>/dev/null
jack_disconnect "$JACK_NAME:right" "system:playback_2" 2>/dev/null

# 连接到幽灵
jack_connect "$JACK_NAME:left" "$GHOST_L" 2>/dev/null
jack_connect "$JACK_NAME:right" "$GHOST_R" 2>/dev/null

echo "JACK: ${JACK_NAME}:left → $GHOST_L"

# 启动循环播放
setsid sh -c "
sleep 1
while true; do
  aplaymidi --port $MIDI_PORT \"$MIDI_FILE\"
  sleep 0.1
done
" > /dev/null 2>&1 &
PID=$!
echo "$PID" > "$STATE_FILE"

echo "✅ 鼓机启动: $STYLE @ ${BPM}BPM ($(basename "$MIDI_FILE")) PID=$PID"
echo "    MIDI端口=$MIDI_PORT JACK=${JACK_NAME} 幽灵=$GHOST_L"
