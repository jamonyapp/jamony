#!/bin/bash
# 步骤②部署脚本：web源码+.next → /root/jamony/web；api/server.js → /var/www/jamony/api；双 pm2 restart
# 全程绝对路径（cwd护栏时代）；.next 外科换（先rm再整体rsync，禁--delete）
set -e
W=/Users/rainbowtube/Ventures/jamony/web
SRV=root@39.96.30.128

rsync -a $W/lib/jam-data.ts $W/lib/chat-socket.ts $SRV:/root/jamony/web/lib/
rsync -a $W/components/playing/playing-page.tsx $W/components/playing/center-column.tsx $SRV:/root/jamony/web/components/playing/
rsync -a $W/scripts/copy-soundfont.mjs $SRV:/root/jamony/web/scripts/
rsync -a $W/public/soundfont/ $SRV:/root/jamony/web/public/soundfont/
rsync -a $W/public/alphatab/ $SRV:/root/jamony/web/public/alphatab/
# 服务器端目录治权：只留资产脚本声明的经典构建，清历史残留（.mjs 对等）
ssh $SRV 'cd /root/jamony/web/public/alphatab && for f in *; do [ "$f" = "alphaTab.js" ] || rm -f "$f"; done; ls'
ssh $SRV 'rm -rf /root/jamony/web/.next'
rsync -a $W/.next/ $SRV:/root/jamony/web/.next/
rsync -a /Users/rainbowtube/Ventures/jamony/api/server.js $SRV:/var/www/jamony/api/server.js
ssh $SRV 'pm2 restart jamony-web jamony-api >/dev/null 2>&1; sleep 3; curl -s -o /dev/null -w "home:%{http_code} " http://127.0.0.1:3000/; pm2 ls | grep -E "jamony-web|jamony-api" | head -2'
