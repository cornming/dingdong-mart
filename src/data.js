/* 叮咚！便利店 — 遊戲資料（純資料，不含邏輯） */
(function (root) {
  'use strict';

  // 客層：sens = 價格敏感度；wants = 一次想買幾樣（最小、最大）
  const SEGMENTS = {
    student:  { name: '學生',   sens: 0.9,  wants: [1, 2] },
    office:   { name: '上班族', sens: 0.4,  wants: [1, 3] },
    resident: { name: '住戶',   sens: 0.75, wants: [2, 4] },
    night:    { name: '夜貓族', sens: 0.5,  wants: [1, 3] },
    tourist:  { name: '觀光客', sens: 0.3,  wants: [1, 3] },
  };

  // 各客層在一天 24 小時（0~23 點）的來客分布，engine 會正規化
  const CURVES = {
    student:  [0, 0, 0, 0, 0, 0, 2, 8, 6, 1, 1, 2, 9, 5, 1, 2, 7, 9, 6, 3, 3, 4, 2, 1],
    office:   [0, 0, 0, 0, 0, 1, 3, 9, 10, 3, 2, 4, 10, 8, 2, 3, 3, 5, 8, 6, 3, 2, 1, 0],
    resident: [0, 0, 0, 0, 0, 1, 3, 4, 5, 6, 6, 5, 4, 3, 4, 5, 6, 7, 8, 7, 5, 3, 1, 0],
    night:    [6, 5, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 5, 7, 8, 7],
    tourist:  [0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 7, 7, 7, 7, 7, 7, 6, 6, 6, 5, 3, 1, 0],
  };

  // 設備：cap = 每台、每種商品可放的數量；power = 每日電費
  const FIXTURES = {
    shelf:   { name: '貨架',   cost: 12000, cap: 150, power: 0,   desc: '零食、泡麵、日用品' },
    fridge:  { name: '冷藏櫃', cost: 28000, cap: 150, power: 150, desc: '飲料、鮮乳、啤酒' },
    fresh:   { name: '鮮食櫃', cost: 26000, cap: 150, power: 150, desc: '飯糰、便當、三明治，當日報廢' },
    hot:     { name: '熱食台', cost: 16000, cap: 150, power: 100, desc: '茶葉蛋、關東煮、熱狗堡，當日報廢' },
    freezer: { name: '冰櫃',   cost: 22000, cap: 150, power: 150, desc: '冰棒、冷凍水餃' },
    rack:    { name: '書報架', cost: 7000,  cap: 150, power: 0,   desc: '報紙（當日報廢）、漫畫週刊' },
    coffee:  { name: '咖啡機', cost: 42000, cap: 300, power: 80,  desc: '現煮咖啡，利潤高' },
    slush:   { name: '冰沙機', cost: 30000, cap: 240, power: 100, desc: '冰沙，學生和熱天的最愛' },
  };
  const FIXTURE_ORDER = ['shelf', 'fridge', 'fresh', 'hot', 'freezer', 'rack', 'coffee', 'slush'];

  // 商品：time 為時段加權（m 早上 6-10、n 中午 11-13、a 下午 14-17、e 晚上 18-21、l 深夜 22-5）
  // wx 為天氣加權（sunny/cloudy/rainy/hot/cold/typhoon，另有 eve = 颱風前一天）
  const PRODUCTS = [
    { id: 'snack',    ch: '芋', color: '#f2b632', name: '洋芋片',   fx: 'shelf',   cost: 14, price: 25, seg: { student: 3, office: 1, resident: 2, night: 3, tourist: 2 }, time: { a: 1.3, l: 1.3 } },
    { id: 'noodle',   ch: '麵', color: '#e4572e', name: '泡麵',     fx: 'shelf',   cost: 15, price: 25, seg: { student: 2, office: 1, resident: 2, night: 4, tourist: 0.5 }, time: { e: 1.2, l: 2 }, wx: { rainy: 1.3, cold: 1.5, eve: 3 } },
    { id: 'daily',    ch: '紙', color: '#f4f1de', name: '衛生紙',   fx: 'shelf',   cost: 30, price: 49, seg: { student: 0.5, office: 0.7, resident: 3, night: 0.7, tourist: 0.8 }, wx: { eve: 2 } },
    { id: 'umbrella', ch: '傘', color: '#3d5a80', name: '雨傘',     fx: 'shelf',   cost: 45, price: 99, seg: { student: 0.12, office: 0.15, resident: 0.1, night: 0.1, tourist: 0.2 }, wx: { rainy: 12, eve: 3, typhoon: 5, hot: 0.5 } },
    { id: 'candy',    ch: '糖', color: '#ef6f9c', name: '口香糖',   fx: 'shelf',   cost: 6,  price: 12, seg: { student: 2, office: 2, resident: 1, night: 1, tourist: 1.5 } },
    { id: 'pen',      ch: '筆', color: '#577590', name: '文具',     fx: 'shelf',   cost: 10, price: 20, seg: { student: 2.5, office: 0.8, resident: 0.3, night: 0.1, tourist: 0.1 }, time: { m: 1.8 } },
    { id: 'tea',      ch: '茶', color: '#6a994e', name: '罐裝茶',   fx: 'fridge',  cost: 10, price: 18, seg: { student: 3, office: 3, resident: 2, night: 2, tourist: 3 }, wx: { hot: 1.6, cold: 0.7 } },
    { id: 'soda',     ch: '汽', color: '#e63946', name: '汽水',     fx: 'fridge',  cost: 11, price: 20, seg: { student: 3, office: 1.5, resident: 1.5, night: 2, tourist: 2.5 }, wx: { hot: 1.6, cold: 0.6 } },
    { id: 'milk',     ch: '乳', color: '#fdfcdc', name: '鮮乳',     fx: 'fridge',  cost: 18, price: 28, seg: { student: 1, office: 1.2, resident: 3, night: 0.5, tourist: 0.3 }, time: { m: 1.8 } },
    { id: 'beer',     ch: '酒', color: '#e9c46a', name: '啤酒',     fx: 'fridge',  cost: 20, price: 32, seg: { student: 0, office: 1.5, resident: 1, night: 4, tourist: 2 }, time: { m: 0.2, n: 0.3, e: 2, l: 2.5 }, wx: { hot: 1.4 } },
    { id: 'onigiri',  ch: '糰', color: '#33312e', name: '御飯糰',   fx: 'fresh',   cost: 11, price: 20, perish: true, seg: { student: 3, office: 3, resident: 1, night: 2, tourist: 1.5 }, time: { m: 2.2, n: 1.5 } },
    { id: 'bento',    ch: '飯', color: '#bc6c25', name: '便當',     fx: 'fresh',   cost: 32, price: 55, perish: true, seg: { student: 2, office: 4, resident: 1.5, night: 2, tourist: 0.8 }, time: { m: 0.3, n: 3.5, a: 0.4, e: 2.2 } },
    { id: 'sandwich', ch: '三', color: '#f1faee', name: '三明治',   fx: 'fresh',   cost: 14, price: 25, perish: true, seg: { student: 2, office: 3, resident: 1, night: 1, tourist: 1.5 }, time: { m: 3, a: 1.2 } },
    { id: 'egg',      ch: '蛋', color: '#7f5539', name: '茶葉蛋',   fx: 'hot',     cost: 3,  price: 7,  perish: true, seg: { student: 2, office: 2, resident: 2, night: 2, tourist: 2.5 }, time: { m: 1.5 } },
    { id: 'oden',     ch: '煮', color: '#f4a261', name: '關東煮',   fx: 'hot',     cost: 6,  price: 15, perish: true, seg: { student: 2.5, office: 1.5, resident: 1, night: 3, tourist: 1.5 }, time: { a: 1.2, e: 1.6, l: 2 }, wx: { cold: 2.5, rainy: 1.5, hot: 0.5 } },
    { id: 'hotdog',   ch: '堡', color: '#d62828', name: '熱狗堡',   fx: 'hot',     cost: 11, price: 25, perish: true, seg: { student: 3, office: 1.5, resident: 0.8, night: 2.5, tourist: 2 }, time: { a: 1.4, l: 1.5 } },
    { id: 'popsicle', ch: '冰', color: '#8ecae6', name: '冰棒',     fx: 'freezer', cost: 6,  price: 12, seg: { student: 3, office: 1, resident: 2, night: 1, tourist: 3 }, time: { n: 1.3, a: 1.8 }, wx: { hot: 3, sunny: 1.4, cold: 0.1, rainy: 0.4 } },
    { id: 'dumpling', ch: '餃', color: '#e0e1dd', name: '冷凍水餃', fx: 'freezer', cost: 40, price: 69, seg: { student: 0.2, office: 0.8, resident: 2.5, night: 0.6, tourist: 0 }, time: { e: 1.8 } },
    { id: 'paper',    ch: '報', color: '#c9c9c9', name: '報紙',     fx: 'rack',    cost: 6,  price: 10, perish: true, seg: { student: 0.2, office: 2.5, resident: 3, night: 0.2, tourist: 0.5 }, time: { m: 3.5, a: 0.4, e: 0.2, l: 0.1 } },
    { id: 'comic',    ch: '漫', color: '#9d4edd', name: '漫畫週刊', fx: 'rack',    cost: 30, price: 50, seg: { student: 2.5, office: 0.8, resident: 0.3, night: 1.5, tourist: 0.2 }, time: { a: 1.5, e: 1.3 } },
    { id: 'coffee',   ch: '啡', color: '#6f4e37', name: '現煮咖啡', fx: 'coffee',  cost: 8,  price: 25, seg: { student: 1, office: 5, resident: 1.2, night: 2, tourist: 2.5 }, time: { m: 2.5, n: 1.5, a: 1.5, e: 0.6 }, wx: { cold: 1.3 } },
    { id: 'slush',    ch: '沙', color: '#48cae4', name: '冰沙',     fx: 'slush',   cost: 5,  price: 20, seg: { student: 4, office: 0.8, resident: 1, night: 1, tourist: 3 }, time: { n: 1.3, a: 2 }, wx: { hot: 2.5, cold: 0.1, rainy: 0.5 } },
  ];

  const WEATHER = {
    sunny:   { name: '晴天', traffic: 1.0 },
    cloudy:  { name: '陰天', traffic: 1.0 },
    rainy:   { name: '雨天', traffic: 0.85 },
    hot:     { name: '酷暑', traffic: 1.0 },
    cold:    { name: '寒流', traffic: 0.92 },
    typhoon: { name: '颱風', traffic: 0.35 },
  };
  // 四季天氣機率（每 30 天換季，從夏天開始）
  const SEASONS = [
    { name: '夏', w: { sunny: 34, hot: 26, cloudy: 14, rainy: 20, typhoon: 5, cold: 1 } },
    { name: '秋', w: { sunny: 36, hot: 6, cloudy: 28, rainy: 22, typhoon: 4, cold: 4 } },
    { name: '冬', w: { sunny: 22, hot: 0, cloudy: 30, rainy: 24, typhoon: 0, cold: 24 } },
    { name: '春', w: { sunny: 34, hot: 4, cloudy: 26, rainy: 30, typhoon: 0, cold: 6 } },
  ];

  // goals = 第 30 天結束時的總資產目標（銅、銀、金），數值由 scripts/balance.js 校正
  const CITIES = {
    kaohsiung: { name: '高雄', level: '輕鬆', cash: 300000, days: 30, goals: [480000, 600000, 740000], rivalGrow: 0.25,
      blurb: '租金便宜、對手少，適合第一次當店長。' },
    taichung:  { name: '台中', level: '普通', cash: 300000, days: 30, goals: [440000, 540000, 660000], rivalGrow: 0.4,
      blurb: '商圈熱鬧，但已經有同業虎視眈眈。' },
    taipei:    { name: '台北', level: '困難', cash: 350000, days: 30, goals: [440000, 520000, 640000], rivalGrow: 0.55,
      blurb: '人潮滿滿、租金嚇人，強敵環伺的一級戰區。' },
  };
  const CITY_ORDER = ['kaohsiung', 'taichung', 'taipei'];

  // 地點：traffic = 商圈每日人潮；mix = 客層比例；weekend = 週末人潮倍率
  // rivals = 開局對手；newRival = 第幾天會有新對手（0 = 不會）；x,y = 地圖上的位置（百分比）
  const LOCATIONS = [
    { id: 'kh1', city: 'kaohsiung', name: '新堀江商圈', kind: '年輕人商圈', traffic: 2100, rent: 3200, weekend: 1.3,
      mix: { student: 0.45, office: 0.1, resident: 0.1, night: 0.15, tourist: 0.2 },
      rivals: [{ name: '好厝邊超商', str: 40 }], newRival: 0, x: 50, y: 54,
      tip: '學生和逛街人潮多，飲料、零食、冰品賣得動，但他們很在意價格。' },
    { id: 'kh2', city: 'kaohsiung', name: '鹽埕老街', kind: '老社區', traffic: 1350, rent: 1800, weekend: 1.05,
      mix: { student: 0.1, office: 0.1, resident: 0.6, night: 0.05, tourist: 0.15 },
      rivals: [], newRival: 12, x: 26, y: 68,
      tip: '附近都是老住戶，一次買很多樣。現在沒有對手，但聽說有人在看店面。' },
    { id: 'kh3', city: 'kaohsiung', name: '楠梓加工區', kind: '上班族區', traffic: 1900, rent: 2400, weekend: 0.5,
      mix: { student: 0.05, office: 0.65, resident: 0.15, night: 0.15, tourist: 0 },
      rivals: [{ name: '快買24', str: 36 }], newRival: 0, x: 62, y: 18,
      tip: '早上和中午像打仗，便當、咖啡、報紙是主力。週末幾乎沒人。' },
    { id: 'kh4', city: 'kaohsiung', name: '西子灣碼頭', kind: '觀光區', traffic: 1700, rent: 2800, weekend: 1.6,
      mix: { student: 0.2, office: 0, resident: 0.1, night: 0.1, tourist: 0.6 },
      rivals: [{ name: '好厝邊超商', str: 34 }], newRival: 0, x: 14, y: 42,
      tip: '觀光客不太看價錢，冰品飲料可以賣貴一點。平日冷清、假日爆滿。' },

    { id: 'tc1', city: 'taichung', name: '逢甲夜市旁', kind: '夜市商圈', traffic: 2600, rent: 4200, weekend: 1.35,
      mix: { student: 0.3, office: 0, resident: 0.1, night: 0.35, tourist: 0.25 },
      rivals: [{ name: '好厝邊超商', str: 44 }, { name: '阿霸便利', str: 38 }], newRival: 0, x: 26, y: 26,
      tip: '越夜越熱鬧，沒開大夜班等於白租。啤酒、泡麵、關東煮是夜貓族的最愛。' },
    { id: 'tc2', city: 'taichung', name: '一中街', kind: '學區', traffic: 2500, rent: 3500, weekend: 1.1,
      mix: { student: 0.65, office: 0.05, resident: 0.1, night: 0.1, tourist: 0.1 },
      rivals: [{ name: '快買24', str: 46 }], newRival: 14, x: 60, y: 42,
      tip: '滿街都是學生，上學前和放學後兩波人潮。賣貴了他們會直接走去對面。' },
    { id: 'tc3', city: 'taichung', name: '火車站前', kind: '交通樞紐', traffic: 2500, rent: 4000, weekend: 1.15,
      mix: { student: 0.15, office: 0.4, resident: 0.05, night: 0.1, tourist: 0.3 },
      rivals: [{ name: '阿霸便利', str: 48 }], newRival: 10, x: 70, y: 62,
      tip: '趕車的人要快，結帳一慢就走人。報紙、咖啡、御飯糰別斷貨。' },
    { id: 'tc4', city: 'taichung', name: '大里住宅區', kind: '住宅區', traffic: 1450, rent: 3000, weekend: 1.1,
      mix: { student: 0.15, office: 0.1, resident: 0.65, night: 0.1, tourist: 0 },
      rivals: [{ name: '好厝邊超商', str: 40 }], newRival: 16, x: 52, y: 84,
      tip: '婆婆媽媽的天下，鮮乳、衛生紙、冷凍水餃是基本盤，口碑傳得很快。' },

    { id: 'tp1', city: 'taipei', name: '西門町', kind: '鬧區', traffic: 3300, rent: 6000, weekend: 1.4,
      mix: { student: 0.35, office: 0.05, resident: 0.05, night: 0.2, tourist: 0.35 },
      rivals: [{ name: '全年無休屋', str: 52 }, { name: '快買24', str: 46 }], newRival: 0, x: 24, y: 44,
      tip: '人潮是全台之冠，租金也是。對手很強，沒有特色的店會被淹沒。' },
    { id: 'tp2', city: 'taipei', name: '公館學區', kind: '學區', traffic: 2800, rent: 5200, weekend: 1.0,
      mix: { student: 0.6, office: 0.1, resident: 0.15, night: 0.1, tourist: 0.05 },
      rivals: [{ name: '好厝邊超商', str: 50 }], newRival: 9, x: 50, y: 68,
      tip: '大學生是主力，漫畫週刊和冰沙很吃香，但價格戰打得兇。' },
    { id: 'tp3', city: 'taipei', name: '信義商辦區', kind: '商業區', traffic: 3000, rent: 6500, weekend: 0.5,
      mix: { student: 0, office: 0.75, resident: 0.05, night: 0.1, tourist: 0.1 },
      rivals: [{ name: '全年無休屋', str: 55 }], newRival: 15, x: 74, y: 46,
      tip: '白領願意為了方便多付錢，咖啡和便當是金雞母。週末是空城。' },
    { id: 'tp4', city: 'taipei', name: '永和巷弄', kind: '住宅區', traffic: 1950, rent: 4200, weekend: 1.1,
      mix: { student: 0.15, office: 0.15, resident: 0.6, night: 0.1, tourist: 0 },
      rivals: [{ name: '阿霸便利', str: 46 }, { name: '好厝邊超商', str: 42 }], newRival: 0, x: 40, y: 86,
      tip: '巷子裡三步一家店，鄰居認熟面孔。把口碑顧好，客人就不會跑。' },
  ];

  const RIVAL_NAMES = ['好厝邊超商', '快買24', '阿霸便利', '全年無休屋', '柑仔王', '鮮速達'];

  const UPGRADES = {
    pos:       { name: 'POS 系統',     cost: 30000, desc: '依銷量算出建議進貨量，可一鍵套用。' },
    sign:      { name: '霓虹招牌',     cost: 25000, desc: '遠遠就看得到，吸客力 +8，夜間人潮更多。' },
    register2: { name: '第二收銀台',   cost: 22000, desc: '結帳速度提升 35%。' },
    camera:    { name: '監視器',       cost: 15000, desc: '小偷少七成，搶匪也會怕。' },
    seats:     { name: '座位區',       cost: 18000, desc: '可以坐下來吃，吸客力 +5、口碑加分。' },
    service:   { name: '多功能事務機', cost: 35000, desc: '影印、傳真、繳費，吸客力 +6，還能收手續費。' },
    aircon:    { name: '強力冷氣',     cost: 20000, desc: '酷暑天客人特別滿意。' },
  };
  const UPGRADE_ORDER = ['pos', 'sign', 'register2', 'camera', 'seats', 'service', 'aircon'];

  // 擴建：slots = 可用設備格數
  const LEVELS = [
    { name: '小型店', slots: 6,  cost: 0 },
    { name: '中型店', slots: 9,  cost: 60000 },
    { name: '大型店', slots: 12, cost: 120000 },
  ];
  // 設備格解鎖順序（格子編號對應 ui 的店面配置）
  const SLOT_ORDER = [0, 1, 2, 3, 5, 6, 4, 7, 8, 9, 10, 11];

  const ADS = {
    flyer: { name: '發傳單',   cost: 2000,  days: 3, boost: 8,  rep: 0, desc: '請工讀生在路口發，便宜有效。' },
    radio: { name: '地方電台', cost: 8000,  days: 5, boost: 15, rep: 0, desc: '「叮咚～」的廣告歌洗腦整個商圈。' },
    star:  { name: '明星代言', cost: 40000, days: 7, boost: 30, rep: 5, desc: '請當紅偶像拍海報，轟動整條街。' },
  };
  const AD_ORDER = ['flyer', 'radio', 'star'];

  const SHIFTS = [
    { name: '早班', range: '06–14' },
    { name: '晚班', range: '14–22' },
    { name: '大夜', range: '22–06' },
  ];

  const STAFF_NAMES = ['阿明', '小美', '志豪', '淑芬', '阿土伯', '雅婷', '家豪', '怡君', '阿嬌姨', '小胖', '建宏', '佩珊', '阿福', '美玲', '國棟', '曉雯', '大頭', '阿蘭'];
  const STAFF_BIOS = ['前泡沫紅茶店店長', '大學重考生', '退休公務員', '地下樂團鼓手', '漫畫迷', '想存錢買機車', '隔壁麵攤老闆的女兒', '夜校生', '自稱收銀機達人', '愛看八點檔', '剛退伍', '媽媽叫他來的'];

  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  const DATA = { SEGMENTS, CURVES, FIXTURES, FIXTURE_ORDER, PRODUCTS, WEATHER, SEASONS, CITIES, CITY_ORDER, LOCATIONS, RIVAL_NAMES,
    UPGRADES, UPGRADE_ORDER, LEVELS, SLOT_ORDER, ADS, AD_ORDER, SHIFTS, STAFF_NAMES, STAFF_BIOS, WEEKDAYS };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DD_DATA = DATA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
