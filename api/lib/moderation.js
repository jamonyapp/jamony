/**
 * jamony 内容机审引擎（内容安全 A 阶段, 1023 定稿）
 *
 * 三态判定: pass(放行) / suspect(放行+标记) / reject(拒绝发布)
 * 词库: api/dict/reject.txt 与 suspect.txt, 每行「词\t分类」, 启动时一次性加载构建 DFA
 * 归一化: NFKC(全半角归一) → 小写 → 繁→简(常用一对一映射) → 剥离非字母数字汉字字符(抗插符号变形)
 * 安全策略: 词库加载失败时 fail-open(全部放行+错误日志), 绝不阻塞业务发布链路
 */
const fs = require('fs');
const path = require('path');

const DICT_DIR = path.join(__dirname, '..', 'dict');
const END_KEY = '$'; // 归一化后字符集为 [a-z0-9汉字], '$' 可安全作终止标记

// 繁→简 常用一对一映射(连续对串, 每两字一对; 保守收录, 只收高置信对)
const T2S_PAIRS =
  '愛爱礙碍罷罢備备筆笔畢毕邊边變变標标錶表別别補补嘗尝廠厂長长場场車车誠诚遲迟衝冲醜丑籌筹礎础處处觸触辭辞從从叢丛錯错達达帶带貸贷單单擔担膽胆彈弹當当黨党導导島岛燈灯敵敌點点電电墊垫東东動动凍冻鬥斗獨独讀读頓顿奪夺訛讹額额惡恶兒儿爾尔發发範范飛飞廢废費费墳坟奮奋豐丰風风馮冯縫缝膚肤蓋盖幹干鋼钢個个給给溝沟構构購购夠够蠱蛊顧顾關关觀观館馆廣广歸归龜龟規规櫃柜貴贵國国過过駭骇漢汉號号門门紅红後后壺壶護护劃划話话懷怀壞坏歡欢環环還还揮挥匯汇會会諱讳賄贿穢秽齒齿極极幾几計计際际劑剂濟济繼继價价駕驾艱艰監监堅坚艦舰講讲獎奖漿浆澆浇驕骄腳脚較较節节潔洁結结進进盡尽勁劲驚惊經经莖茎淨净競竞靜静舊旧劇剧懼惧據据鋸锯覺觉絕绝軍军駿骏開开凱凯顆颗課课墾垦懇恳摳抠庫库褲裤誇夸塊块寬宽礦矿曠旷虧亏潰溃擴扩闊阔蠟蜡臘腊來来蘭兰欄栏攔拦瀾澜籃篮覽览懶懒爛烂壘垒類类淚泪籬篱禮礼鯉鲤隸隶簾帘聯联憐怜蓮莲連连煉炼練练糧粮兩两輛辆遼辽療疗獵猎臨临鄰邻鱗鳞靈灵嶺岭領领劉刘龍龙樓楼陸陆慮虑亂乱抡抡輪轮倫伦論论羅罗蘿萝邏逻驢驴馬马瑪玛碼码罵骂嗎吗買买麥麦邁迈們们夢梦彌弥謎谜覓觅綿绵廟庙滅灭憫悯鳴鸣腦脑擬拟釀酿鳥鸟聶聂寧宁濃浓農农瘧疟歐欧毆殴嘔呕盤盘龐庞賠赔噴喷鵬鹏騙骗飄飘頻频貧贫蘋苹評评潑泼撲扑鋪铺譜谱齊齐騎骑豈岂啟启氣气簽签謙谦錢钱潛潜淺浅槍枪強强搶抢橋桥喬乔僑侨親亲輕轻傾倾慶庆瓊琼區区驅驱勸劝卻却確确讓让擾扰熱热認认紉纫軟软銳锐潤润灑洒傘伞喪丧騷骚澀涩殺杀紗纱篩筛曬晒刪删陝陕贍赡傷伤詩诗濕湿時时識识實实視视適适勢势獸兽書书贖赎屬属數数樹树帥帅雙双誰谁順顺說说碩硕絲丝飼饲鬆松蘇苏訴诉肅肃雖虽隨随歲岁孫孙縮缩鎖锁態态攤摊癱瘫談谈嘆叹湯汤燙烫濤涛討讨騰腾題题體体條条鐵铁廳厅銅铜統统頭头圖图塗涂頹颓蛻蜕脫脱馱驮窪洼襪袜萬万網网韋韦違违圍围為为維维偉伟衛卫溫温聞闻穩稳問问渦涡無无務务霧雾誤误犧牺習习戲戏細细蝦虾轄辖峽峡俠侠狹狭嚇吓鮮鲜賢贤顯显險险現现線线憲宪響响項项蕭萧銷销曉晓嘯啸協协脅胁諧谐寫写瀉泻謝谢興兴須须許许緒绪續续軒轩懸悬選选學学勳勋詢询尋寻馴驯遜逊壓压鴉鸦鴨鸭啞哑亞亚嚴严巖岩鹽盐顏颜閻阎艷艳厭厌驗验陽阳楊杨揚扬瘍疡養养樣样葉叶業业醫医義义藝艺億亿憶忆議议譯译陰阴銀银隱隐應应癮瘾嬰婴纓缨櫻樱鷹鹰營营穎颖擁拥踴踊憂忧優优郵邮猶犹與与嶼屿語语鬱郁譽誉預预馭驭鴛鸳淵渊園园員员圓圆緣缘遠远願愿約约閱阅雲云運运韻韵雜杂災灾載载贊赞贓赃臟脏鑿凿棗枣責责贈赠齋斋氈毡戰战張张漲涨帳帐賬账趙赵貞贞針针偵侦診诊鎮镇陣阵掙挣爭争幀帧鄭郑證证織织職职執执紙纸摯挚擲掷幟帜質质鐘钟種种眾众晝昼豬猪諸诸燭烛囑嘱築筑鑄铸專专轉转賺赚濁浊茲兹資资漬渍蹤踪綜综總总縱纵鑽钻樂乐錄录綠绿編编輯辑鍵键絃弦辦办測测試试這这麼么對对內内見见風风飛飞雲云電电网网輪轮聲声隊队員员轉转聽听寫写讀读紙纸給给紅红线线結结絕绝詞词賣卖魚鱼鳳凤鵝鹅團团聰聪藥药飯饭飲饮週周蟲虫貓猫貝贝雞鸡鬍胡鹹咸麗丽黃黄灣湾臺台蔣蒋鄧邓呂吕鄒邹躍跃擊击勝胜敗败裡里裏里創创係系徵征組组誘诱絡络訊讯傳传遞递婦妇賭赌販贩間间閒闲悶闷閉闭';

const T2S = {};
for (let i = 0; i + 1 < T2S_PAIRS.length; i += 2) {
  const t = T2S_PAIRS[i], s = T2S_PAIRS[i + 1];
  if (t !== s) T2S[t] = s;
}

/** 归一化: NFKC → 小写 → 繁→简 → 剥离干扰字符 */
function normalize(text) {
  let s = String(text == null ? '' : text).normalize('NFKC').toLowerCase();
  s = s.replace(/[㐀-䶿一-鿿]/g, (c) => T2S[c] || c);
  return s.replace(/[^a-z0-9一-鿿]/g, '');
}

/** entries: [{word, category}] → Map 嵌套 trie, 终止节点挂 '$' → {word, category, len} */
function buildTrie(entries) {
  const root = new Map();
  for (const e of entries) {
    const n = normalize(e.word);
    if (!n) continue;
    let node = root;
    for (const ch of n) {
      if (!node.has(ch)) node.set(ch, new Map());
      node = node.get(ch);
    }
    node.set(END_KEY, { word: e.word, category: e.category, len: n.length });
  }
  return root;
}

/** 贪心最长匹配扫描, 返回 [{word, category}] */
function scanTrie(text, root) {
  const hits = [];
  let i = 0;
  while (i < text.length) {
    let node = root;
    let j = i;
    let best = null;
    while (j < text.length) {
      const next = node.get(text[j]);
      if (!next) break;
      node = next;
      j++;
      const end = node.get(END_KEY);
      if (end) best = end;
    }
    if (best) {
      hits.push({ word: best.word, category: best.category });
      i += best.len;
    } else {
      i++;
    }
  }
  return hits;
}

/** 读取词库文件: 每行「词\t分类」 */
function loadDict(file) {
  const raw = fs.readFileSync(path.join(DICT_DIR, file), 'utf8');
  const entries = [];
  for (let line of raw.split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) entries.push({ word: line, category: 'unknown' });
    else entries.push({ word: line.slice(0, tab), category: line.slice(tab + 1) });
  }
  return entries;
}

// ---- 启动加载(fail-open) ----
let REJECT_TRIE = null;
let SUSPECT_TRIE = null;
let REJECT_PY_TRIE = null; // 1024 词库二版: 核心词拼音 trie(抗"wei xie"式变体, 仅 reject 类开——同音误伤只在最重档可接受)
let loadError = null;
let rejectCount = 0;
let suspectCount = 0;
let pinyinFn = null;

try {
  const rej = loadDict('reject.txt');
  const sus = loadDict('suspect.txt');
  REJECT_TRIE = buildTrie(rej);
  SUSPECT_TRIE = buildTrie(sus);
  rejectCount = rej.length;
  suspectCount = sus.length;
  // 1025 欢哥定稿: 拼音折叠整体关停——音乐语境"音/间/房/和"拼音连写碰撞面结构性高发
  // (1025 实测: 建房误伤率 40%,全部是正常中文撞敏感词拼音,如"新房间"xinfang撞"信访")
  // 反变体补偿: 若发现拼音攻击,将该词拼音串(如 yinhe)作字面词条加入 reject.txt——
  // 字面匹配只命中真打拼音的文本(文本层不做拼音转换),正常中文零误伤,精准反变体两全
  const PINYIN_FOLD_ENABLED = false
  if (!PINYIN_FOLD_ENABLED) { pinyinFn = null; } else
  // 拼音折叠: 拒绝级词预转无声调拼音串建 trie(纯 a-z; buildTrie 会再 normalize 但纯字母恒等, 手工内联清晰)
  try {
    pinyinFn = require('pinyin-pro').pinyin;
    // 1025 拼音豁免表: 撞日常词拼音连写的误伤词(如"新房间"xinfang撞"信访"——产品核心词优先)——豁免=只留汉字字面匹配,不做拼音追杀; 误伤举报即加一行,运营化消化
    const PINYIN_EXEMPT = new Set(loadDict('pinyin-exempt.txt').map((e) => e.word));
    REJECT_PY_TRIE = new Map();
    for (const e of rej) {
      if (PINYIN_EXEMPT.has(e.word)) continue;
      const py = pinyinFn(normalize(e.word), { toneType: 'none', type: 'array' }).join('');
      if (!py) continue;
      let node = REJECT_PY_TRIE;
      for (const ch of py) {
        if (!node.has(ch)) node.set(ch, new Map());
        node = node.get(ch);
      }
      node.set(END_KEY, { word: e.word + '(拼音变体)', category: e.category, len: py.length });
    }
  } catch (pe) {
    REJECT_PY_TRIE = null;
    console.error('[moderation] 拼音折叠不可用(不影响其余判定):', pe.message);
  }
} catch (e) {
  loadError = e;
  REJECT_TRIE = null;
  SUSPECT_TRIE = null;
  console.error('[moderation] 词库加载失败, fail-open 放行模式:', e.message);
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

/**
 * 三态判定(1024 二版: +拼音折叠抗变体 +外链模式规则防广告)
 * @returns {{verdict:'pass'|'suspect'|'reject', hits:Array<{word:string,category:string}>}}
 */
function moderateText(text) {
  if (loadError) return { verdict: 'pass', hits: [] };
  if (!text || typeof text !== 'string') return { verdict: 'pass', hits: [] };
  const n = normalize(text);
  if (!n) return { verdict: 'pass', hits: [] };
  const rejectHits = scanTrie(n, REJECT_TRIE);
  if (rejectHits.length > 0) return { verdict: 'reject', hits: rejectHits.slice(0, 20) };
  // 拼音折叠(仅 reject 类): 文本归一化串转拼音——汉字变拼音、字母原样, "wei xie"与原词殊途同归
  if (REJECT_PY_TRIE && pinyinFn) {
    const pyHits = scanTrie(pinyinFn(n, { toneType: 'none', type: 'array' }).join(''), REJECT_PY_TRIE);
    if (pyHits.length > 0) return { verdict: 'reject', hits: pyHits.slice(0, 20) };
  }
  const suspectHits = scanTrie(n, SUSPECT_TRIE);
  if (suspectHits.length > 0) return { verdict: 'suspect', hits: suspectHits.slice(0, 20) };
  // 外链模式规则(suspect 级): 白名单域名先剔除, 任意外链特征=放行+标记(累计照常升档)
  const url = detectExternalUrl(text);
  if (url) return { verdict: 'suspect', hits: [{ word: '外链:' + url, category: '外链' }] };
  return { verdict: 'pass', hits: [] };
}

/** 引擎状态(供健康检查/启动日志) */
function getStatus() {
  return {
    ok: !loadError,
    error: loadError ? String(loadError.message || loadError) : null,
    rejectWords: rejectCount,
    suspectWords: suspectCount,
  };
}

module.exports = { moderateText, getStatus, normalize, buildTrie, scanTrie };
