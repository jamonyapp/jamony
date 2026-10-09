#!/bin/bash
# 步骤②构建脚本（cwd护栏时代：高危命令进脚本，脚本内自带绝对路径锚点）
set -e
cd /Users/rainbowtube/Ventures/jamony/web
rm -rf .next
npm run build
[ -f .next/server/middleware-manifest.json ] && echo BUILD-OK
