#!/bin/bash
# 1118 修复批部署脚本（照 deploy-mix.sh 结构）：
#   门票制(server) + 裁决收摊/403收摊/banner身份化/黑洞终局弹窗(web)
# web 源文件 → /root/jamony/web；.next 外科换（先rm再整体rsync，禁--delete）；api/server.js → /var/www/jamony/api；双 pm2 restart
# 全程绝对路径（cwd护栏时代）
set -e
W=/Users/rainbowtube/Ventures/jamony/web
SRV=root@123.57.33.130

rsync -a $W/lib/chat-socket.ts $W/lib/room-session.tsx $SRV:/root/jamony/web/lib/
rsync -a $W/components/playing/playing-page.tsx $W/components/playing/jamsoul-exited-dialog.tsx $SRV:/root/jamony/web/components/playing/
ssh $SRV 'rm -rf /root/jamony/web/.next'
rsync -a $W/.next/ $SRV:/root/jamony/web/.next/
rsync -a /Users/rainbowtube/Ventures/jamony/api/server.js $SRV:/var/www/jamony/api/server.js
ssh $SRV 'pm2 restart jamony-web jamony-api >/dev/null 2>&1; sleep 4; echo -n "home:"; curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3000/; echo -n "api(401预期):"; curl -s -o /dev/null -w "%{http_code} " http://127.0.0.1:3001/api/my-active-room; pm2 ls | grep -E "jamony-web|jamony-api" | head -2'
