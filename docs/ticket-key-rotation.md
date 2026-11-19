# 🔑 入场票密钥轮换手册(一页纸·深夜可执行版)

> 场景:`JAMONY_TICKET_SECRET` 疑似泄露(出现我们没铸过的"真票"/日志里 DOOR-ACCEPT 的
> uid·nick 查无对应登录会话/无票者持验签全过的票据反复进出)。
> 原则:**发现即换,不过夜**——泄露期间伪造者每分钟都可能进门。
> 难度:五分钟手工,零代码。双密钥自动轮换已评估并否决(1119 欢哥拍板:只写文档不写代码)。

## 密钥是什么·在哪

| 件 | 真身 |
|---|---|
| 密钥 | 64 位 hex 随机串,变量 `JAMONY_TICKET_SECRET` |
| 铸印方 | 生产 api:`/var/www/jamony/api/.env`(600 权限,不进 git) |
| 验印方 | 每个房间进程(出生时从 api 环境继承,`/proc/<pid>/environ` 可查) |
| 配套开关 | 同文件 `JAMONY_TICKET_ENFORCE`(0=观察档/1=强制档,**轮换时此行不动**) |
| 房间日志 | `/var/log/jamony-rooms/room-<端口>.log`(验票记录都在这,排障第一现场) |

⚠️ 本地开发不涉密:本地仓库无 .env;测试用环境变量临时注入。

## 轮换五步(在生产机 123.57.33.130 执行)

```bash
# ① 备份现行 .env(带时间戳,回滚用)
cp /var/www/jamony/api/.env /root/backups/api-env.bak-rotate-$(date +%m%d%H%M)

# ② 生成新密钥并原位替换 SECRET 行(ENFORCE 行保持原值)
cd /var/www/jamony/api
NEW=$(openssl rand -hex 32)
sed -i "s/^JAMONY_TICKET_SECRET=.*/JAMONY_TICKET_SECRET=${NEW}/" .env
chmod 600 .env
grep -c "^JAMONY_TICKET_SECRET=" .env   # 必须=1

# ③ 重启 api(server.js 启动时自读 .env)
pm2 restart jamony-api && sleep 3 && pm2 list | grep jamony-api   # 确认 online

# ④ 房间换代(关键步,别跳):存量房间进程还揣着旧印——新票在旧房验不过=谁都进不去
#    列出活跃房间(房间进程+端口):
ss -ulnp | grep jamsoul-headles
#    每个活跃房间走 admin 正规解散端点(与后台强制解散同链,席位/成员关系全清干净):
#    curl -X POST -H "x-admin-key: <ADMIN_INTERNAL_KEY取自同一.env>" \
#      https://admin.jamonyapp.com/admin-internal/rooms/<房间id>/dissolve
#    (房间id查 rooms 表;无人的死房进程直接 kill <pid>,收割者兜底)
#    用户侧感知=房间散了重建,重建即带新印,一次性票 60 秒时效,切换无痛

# ⑤ 验证闭环
#    建新房→乐手进房→ tail 房间日志见 [jamony-ticket] 行(DOOR-ACCEPT/ACCEPT)
#    若手上有泄露样本票:用它连新房=必须零回应(旧印已废)
```

## 为什么这样就够了

- 换印瞬间,**所有旧票自动作废**(新印验不过),泄露者的"库存"清零
- 一次性票 60 秒时效——伪造者没有"囤票"余地,损失上限=从泄露到轮换那几分钟
- ENFORCE 开关与密钥解耦,轮换不改变执法档位

## 回滚(仅当新密钥引发意外故障)

```bash
cp /root/backups/api-env.bak-rotate-<时间戳> /var/www/jamony/api/.env
pm2 restart jamony-api && # 再走一遍第④步房间换代 #
```

---
历史:1119 建制(欢哥令「先把这个手册写了」);触发器=疑似泄露/定期演练建议=公测前一次。
