#!/bin/bash
# jamony 鼓机控制脚本 v6（房间隔离版）
STYLE_DIR="/var/www/jamony/drum-loops"
SOUNDFONT="/usr/share/sounds/sf2/FluidR3_GM.sf2"

CMD="${1:-status}"
STYLE="$1"
BPM="${2:-120}"
SPECIFIC_FILE="$3"
ROOM_PORT="$4"

STATE_FILE="/tmp/jamony-drums-${ROOM_PORT:-global}.pid"
DRUM_NAME="FluidSynth-Drums-${ROOM_PORT:-global}"

if [ "$CMD" = "stop" ]; then
    ROOM_PORT="${2:-global}"
    STATE_FILE="/tmp/jamony-drums-${ROOM_PORT}.pid"
    DRUM_NAME="FluidSynth-Drums-${ROOM_PORT}"
    pkill -f "fluidsynth.*${DRUM_NAME}" 2>/dev/null
    rm -f "$STATE_FILE"
    rm -f "/tmp/jamony-drum-cmd-${ROOM_PORT}.txt"
    echo "✅ 房间鼓机已停止"
    exit 0
fi

[ -z "$STYLE" ] && { echo "❌ 请指定风格"; exit 1; }

if [ -n "$SPECIFIC_FILE" ]; then
    MIDI_FILE="$STYLE_DIR/$STYLE/$SPECIFIC_FILE"
    [ ! -f "$MIDI_FILE" ] && { echo "❌ 文件不存在"; exit 1; }
else
    FILES=($(ls "$STYLE_DIR/$STYLE"/*.mid 2>/dev/null))
    [ ${#FILES[@]} -eq 0 ] && { echo "❌ 无 MIDI 文件"; exit 1; }
    MIDI_FILE="${FILES[$RANDOM % ${#FILES[@]}]}"
fi

# 停止同房间旧鼓机（不影响其他房间）
pkill -f "fluidsynth.*${DRUM_NAME}" 2>/dev/null
sleep 2

# 找幽灵
# 找幽灵（按端口号动态匹配）
GHOST_L="Jamulus-${ROOM_PORT} jamony-looper:input left"
GHOST_R="Jamulus-${ROOM_PORT} jamony-looper:input right"

# 生成循环配置文件（房间隔离）
LOOP_CMD="/tmp/jamony-drum-cmd-${ROOM_PORT}.txt"
cat > "$LOOP_CMD" << EOF
player_loop -1
player_tempo_bpm $BPM
player_start
EOF

# 启动 FluidSynth（JACK 客户端名含房间号，确保进程可隔离）
nohup fluidsynth -f "$LOOP_CMD" \
    -a jack -j -i \
    -p "$DRUM_NAME" \
    -o audio.jack.id="${DRUM_NAME}" \
    -o synth.sample-rate=48000 \
    -o synth.gain=3.0 \
    -o synth.polyphony=64 \
    "$SOUNDFONT" "$MIDI_FILE" \
    > /dev/null 2>&1 &
PID=$!
echo "$PID" > "$STATE_FILE"

sleep 3

# 连接 JACK（房间隔离，直接按端口号匹配）
jack_disconnect "${DRUM_NAME}:left" "system:playback_1" 2>/dev/null
jack_disconnect "${DRUM_NAME}:right" "system:playback_2" 2>/dev/null
jack_connect "${DRUM_NAME}:left" "${GHOST_L}" 2>/dev/null
jack_connect "${DRUM_NAME}:right" "${GHOST_R}" 2>/dev/null

echo "✅ 鼓机启动 ($ROOM_PORT): $STYLE @ ${BPM}BPM ($(basename "$MIDI_FILE")) PID=$PID"
