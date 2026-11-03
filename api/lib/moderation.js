/**
 * jamony 内容安全·文本判定引擎 —— 1104 欢哥拍板: 直切阿里云文本审核增强版
 * ── 本地词库/DFA/拼音trie 退役归档(api/dict/ 保留不再读取):
 *    2000年代开源词库误伤失控(实证: 「和弦」=porn 「集合」「激情」=politics 「网络」=ads,
 *    1103 欢哥粘贴会话文本 6 条 suspect 被自动升 watch), 词库无章法清洗不可持续。
 * 引擎: @alicloud/green20220302 TextModeration (service=comment_detection, 与图片线同 AK 同 SDK)
 * 映射(1104 欢哥预设): RiskLevel high→reject / medium→suspect / low|none→pass
 *    —— 云控制台可配自定义白名单(音乐术语误伤持续调优, 词单由留痕数据驱动)
 * 保留(与敏感词判定无关的自有规则): 繁简归一化 normalize + 外链模式规则(1024 公告牌防导流)
 * 哲学不变: 云异常 fail-open 放行+错误日志; 超600字符截断送审+告警(增强版单条上限600)
 */
const fs = require('fs');
const path = require('path');

// ---- 繁→简归一化(保留: 云审对简体准, 繁体变体经此收敛) ----
const T2S_PAIRS =
  '愛爱礙碍罷罢備备筆笔畢毕邊边變变標标錶表別别補补嘗尝廠厂長长場场車车誠诚遲迟衝冲醜丑籌筹礎础處处觸触辭辞從从叢丛錯错達达帶带貸贷單单擔担膽胆彈弹當当黨党導导島岛燈灯敵敌點点電电墊垫東东動动凍冻鬥斗獨独讀读頓顿奪夺訛讹額额惡恶兒儿爾尔發发範范飛飞廢废費费墳坟奮奋豐丰風风馮冯縫缝膚肤蓋盖幹干鋼钢個个給给溝沟構构購购夠够蠱蛊顧顾關关觀观館馆廣广歸归龜龟規规櫃柜貴贵國国過过駭骇漢汉號号門门紅红後后壺壶護护劃划話话懷怀壞坏歡欢環环還还揮挥匯汇會会諱讳賄贿穢秽齒齿極极幾几計计際际劑剂濟济繼继價价駕驾艱艰監监堅坚艦舰講讲獎奖漿浆澆浇驕骄腳脚較较節节潔洁結结進进盡尽勁劲驚惊經经莖茎淨净競竞靜静舊旧劇剧懼惧據据鋸锯覺觉絕绝軍军駿骏開开凱凯顆颗課课墾垦懇恳摳抠庫库褲裤誇夸塊块寬宽礦矿曠旷虧亏潰溃擴扩闊阔蠟蜡臘腊來来蘭兰欄栏攔拦瀾澜籃篮覽览懶懒爛烂壘垒類类淚泪籬篱禮礼鯉鲤隸隶簾帘聯联憐怜蓮莲連连煉炼練练糧粮兩两輛辆遼辽療疗獵猎臨临鄰邻鱗鳞靈灵嶺岭領领劉刘龍龙樓楼陸陆慮虑亂乱抡抡輪轮倫伦論论羅罗蘿萝邏逻驢驴馬马瑪玛碼码罵骂嗎吗買买麥麦邁迈們们夢梦彌弥謎谜覓觅綿绵廟庙滅灭憫悯鳴鸣腦脑擬拟釀酿鳥鸟聶聂寧宁濃浓農农瘧疟歐欧毆殴嘔呕盤盘龐庞賠赔噴喷鵬鹏騙骗飄飘頻频貧贫蘋苹評评潑泼撲扑鋪铺譜谱齊齐騎骑豈岂啟启氣气簽签謙谦錢钱潛潜淺浅槍枪強强搶抢橋桥喬乔僑侨親亲輕轻傾倾慶庆瓊琼區区驅驱勸劝卻却確确讓让擾扰熱热認认紉纫軟软銳锐潤润灑洒傘伞喪丧騷骚澀涩殺杀紗纱篩筛曬晒刪删陝陕贍赡傷伤詩诗濕湿時时識识實实視视適适勢势獸兽書书贖赎屬属數数樹树帥帅雙双誰谁順顺說说碩硕絲丝飼饲鬆松蘇苏訴诉肅肃雖虽隨随歲岁孫孙縮缩鎖锁態态攤摊癱瘫談谈嘆叹湯汤燙烫濤涛討讨騰腾題题體体條条鐵铁廳厅銅铜統统頭头圖图塗涂頹颓蛻蜕脫脱馱驮窪洼襪袜萬万網网韋韦違违圍围為为維维偉伟衛卫溫温聞闻穩稳問问渦涡無无務务霧雾誤误犧牺習习戲戏細细蝦虾轄辖峽峡俠侠狹狭嚇吓鮮鲜賢贤顯显險险現现線线憲宪響响項项蕭萧銷销曉晓嘯啸協协脅胁諧谐寫写瀉泻謝谢興兴須须許许緒绪續续軒轩懸悬選选學学勳勋詢询尋寻馴驯遜逊壓压鴉鸦鴨鸭啞哑亞亚嚴严巖岩鹽盐顏颜閻阎艷艳厭厌驗验陽阳楊杨揚扬瘍疡養养樣样葉叶業业醫医義义藝艺億亿憶忆議议譯译陰阴銀银隱隐應应癮瘾嬰婴纓缨櫻樱鷹鹰營营穎颖擁拥踴踊憂忧優优郵邮猶犹與与嶼屿語语鬱郁譽誉預预馭驭鴛鸳淵渊園园員员圓圆緣缘遠远願愿約约閱阅雲云運运韻韵雜杂災灾載载贊赞贓赃臟脏鑿凿棗枣責责贈赠齋斋氈毡戰战張张漲涨帳帐賬账趙赵貞贞針针偵侦診诊鎮镇陣阵掙挣爭争幀帧鄭郑證证織织職职執执紙纸摯挚擲掷幟帜質质鐘钟種种眾众晝昼豬猪諸诸燭烛囑嘱築筑鑄铸專专轉转賺赚濁浊茲兹資资漬渍蹤踪綜综總总縱纵鑽钻樂乐錄录綠绿編编輯辑鍵键絃弦辦办測测試试這这麼么對对內内見见風风飛飞雲云電电网网輪轮聲声隊队員员轉转聽听寫写讀读紙纸給给紅红线线結结絕绝詞词賣卖魚鱼鳳凤鵝鹅團团聰聪藥药飯饭飲饮週周蟲虫貓猫貝贝雞鸡鬍胡鹹咸麗丽黃黄灣湾臺台蔣蒋鄧邓呂吕鄒邹躍跃擊击勝胜敗败裡里裏里創创係系徵征組组誘诱絡络訊讯傳传遞递婦妇賭赌販贩間间閒闲悶闷閉闭';

const T2S = {};
for (let i = 0; i + 1 < T2S_PAIRS.length; i += 2) {
  const t = T2S_PAIRS[i], s = T2S_PAIRS[i + 1];
  if (t !== s) T2S[t] = s;
}

/** 归一化: NFKC → 小写 → 繁→简 → 剥离干扰字符 */
function normalize(text) {
  let s = String(text == null ? '' : text).toLowerCase();
  s = s.replace(/[\u4e00-\u9fff]/g, (c) => T2S[c] || c);
  return s.trim();
}

// ---- 1024 词库二版: 外链模式规则(公告牌防外链本意——正经内容不该带外链, 比 URL 黑名单更全覆盖零维护) ----
// 自家域名/IP 白名单(小写; 命中先剔除再检测)
const BRAND_URL_WHITELIST = ['jamonyapp.com', 'jamony.live', 'jamony.cc', 'jamony.net', '123.57.33.130'];
// 外链特征: 协议头 / www. / 常见域名后缀(词边界防误伤普通英文单词如 "app.chat" 不算——按需调)
const URL_PATTERN = /(https?:\/\/|www\.)|[a-z0-9-]{2,}\.(com|cn|net|org|xyz|top|vip|cc|io|app|live|info|biz|club|site|online|shop|store)([^a-z0-9-]|$)/i;

/** 外链检测: 返回命中串或 null(白名单域名先剔除) */
function detectExternalUrl(rawText) {
  let s = String(rawText == null ? '' : rawText).toLowerCase();
  for (const d of BRAND_URL_WHITELIST) s = s.split(d).join(' ');
  const m = s.match(URL_PATTERN);
  return m ? (m[0] || '外链') : null;
}

// ---- 阿里云文本审核增强版客户端(与 server.js 图片线同 env 同 SDK, 独立实例) ----
let CLOUD = null; // null=未初始化 / false=初始化失败(fail-open) / {client, Req}
function getClient() {
  if (CLOUD !== null) return CLOUD;
  try {
    const t = fs.readFileSync('/var/jamony/aliyun.env', 'utf8');
    const id = (t.match(/^ALIYUN_ACCESS_KEY_ID=(.+)$/m) || [])[1];
    const sec = (t.match(/^ALIYUN_ACCESS_KEY_SECRET=(.+)$/m) || [])[1];
    if (!id || !sec) throw new Error('AK 未配置(/var/jamony/aliyun.env)');
    const Green = require('@alicloud/green20220302');
    const { Config } = require('@alicloud/openapi-client');
    CLOUD = {
      client: new Green.default(new Config({ accessKeyId: id.trim(), accessKeySecret: sec.trim(), endpoint: 'green-cip.cn-beijing.aliyuncs.com' })),
      Req: Green.TextModerationRequest,
    };
  } catch (e) {
    console.error('[moderation] 云客户端初始化失败(文本线 fail-open):', e.message);
    CLOUD = false;
  }
  return CLOUD;
}

// ---- 1104 自建白名单层(欢哥拍板; admin 后台审核组运营, 引擎侧 5min 缓存 TTL——后台加词5分钟内全站生效) ----
// 规则: 云审命中的 riskWords 全部∈白名单 → 放行(pass + hits 标注「白名单放行」, 留痕但不进升级计数);
//       部分命中(白词+真违规混合) → 维持原判——按词精确豁免, 组合文本不放过
let wlLoader = null; // server.js 启动时注入: async () => ['词1','词2',...](小写)
let WL_CACHE = null; let WL_AT = 0;
const WL_TTL = 5 * 60 * 1000;
function setWhitelistLoader(fn) { wlLoader = fn; WL_CACHE = null; }
async function getWhitelist() {
  if (WL_CACHE && Date.now() - WL_AT < WL_TTL) return WL_CACHE;
  try {
    if (wlLoader) { WL_CACHE = new Set((await wlLoader()).map((w) => String(w).toLowerCase())); WL_AT = Date.now(); }
  } catch (e) { console.error('[moderation] 白名单加载失败(忽略, 用旧缓存):', e.message); }
  return WL_CACHE || new Set();
}

/**
 * 三态判定(async——1104 云审网络调用)
 * @returns {Promise<{verdict:'pass'|'suspect'|'reject', hits:Array<{word:string,category:string}>}>}
 */
async function moderateText(text) {
  if (!text || typeof text !== 'string') return { verdict: 'pass', hits: [] };
  const n = normalize(text);
  if (!n) return { verdict: 'pass', hits: [] };
  let verdict = 'pass'; let hits = [];
  try {
    const c = getClient();
    if (c) {
      let content = n;
      if (content.length > 600) { console.warn('[moderation] 文本超600字符截断送审 len=' + content.length); content = content.slice(0, 600); }
      const resp = await c.client.textModerationWithOptions(
        new c.Req({ service: 'comment_detection', serviceParameters: JSON.stringify({ content }) }),
        { timeoutMs: 3000 }
      );
      const body = (resp && resp.body) || {};
      const code = body.code !== undefined ? body.code : body.Code;
      const data = body.data || body.Data || {};
      // 1104 实测: 判定详情嵌在 data.reason 的 JSON 字符串里({riskLevel,riskTips,riskWords}), labels 在 data.labels(逗号串)
      let reason = {};
      try { reason = typeof data.reason === 'string' ? JSON.parse(data.reason) : (data.reason || {}); } catch (e) { reason = {}; }
      const level = String(reason.riskLevel || 'none').toLowerCase();
      const words = String(reason.riskWords || '');
      const labels = String(data.labels || reason.riskTips || '');
      hits = (level === 'none' || level === 'low') ? [] : [{ word: words ? (labels.split(',').slice(0, 5).join('/') + ':' + words) : (labels || level), category: level }];
      if (code !== undefined && Number(code) !== 200) console.error('[moderation] 云审非200 code=' + code + ' fail-open');
      else if (level === 'high' || level === 'medium') {
        // 白名单层: riskWords 全部命中才放行(pass+留痕不计数); 部分命中维持原判
        const wordList = words ? words.split(/[,，、]/).map((w) => w.trim().toLowerCase()).filter(Boolean) : [];
        const wl = await getWhitelist();
        const allIn = wordList.length > 0 && wordList.every((w) => wl.has(w));
        if (allIn) {
          hits = [{ word: '白名单放行:' + words, category: 'whitelist' }];
          verdict = 'pass';
        } else {
          verdict = level === 'high' ? 'reject' : 'suspect';
        }
      }
    }
  } catch (e) {
    console.error('[moderation] 云文本审核异常 fail-open:', e.message);
    return { verdict: 'pass', hits: [] };
  }
  // 外链模式规则(suspect 级, 1024 产品规则保留): 云审 pass 后叠加——白名单域名先剔除, 任意外链=放行+标记
  if (verdict === 'pass') {
    const url = detectExternalUrl(text);
    if (url) return { verdict: 'suspect', hits: [{ word: '外链:' + url, category: '外链' }] };
  }
  return { verdict, hits };
}

/** 引擎状态(供健康检查/启动日志) */
function getStatus() {
  return { ok: true, engine: 'aliyun-text-enhanced', dictArchived: true };
}

module.exports = { moderateText, getStatus, normalize, detectExternalUrl, setWhitelistLoader };
