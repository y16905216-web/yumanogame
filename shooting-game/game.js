const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 540;

// --- 1. 定数・初期設定 ---
const MAX_HP = 100;
const PLAYER_SPEED = 5;
const ENEMY_SPAWN_RATE = 0.06;
const HACK_DURATION = 5000;
const CLEAR_TIME = 180; // 3分でゴール到達

// --- 2. ゲーム状態 ---
let hp = MAX_HP;
let hackGauge = 0;
let score = 0;
let playerBits = parseInt(localStorage.getItem('hacker_shooter_bits')) || 0;
let startTime = 0;
let gameOver = false;
let gameActive = false;
let lastTime = performance.now();
let bulletHitRecently = 0;
let bitMultiplier = 1;
let screenShake = 0;
let playerPowerLevel = 0; // 敵難易度スケーリング用
let terminalLogs = ["SYSTEM_READY"];
let bossesDefeated = 0;
let nextBossScore = 60;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);

let player = {
    x: canvas.width / 2, y: canvas.height - 60, w: 30, h: 30,
    speed: PLAYER_SPEED, fireRate: 180, multiShot: 1, piercing: false, shield: 0,
    activeModules: [], // インストールされたモジュール {id, param}
    subShips: 0,
    // キャラクター固有ステータス (レガシー互換用・一部再利用)
    isHoming: false,
    isLaser: false,
    isBomb: false,
    isRearShot: false,
    bulletSpeedMult: 1.0,
    bulletSizeMult: 1.0,
    hitboxSizeMult: 1.0,
    isMagnet: false,
    autoHeal: 0,
    lives: 3,
    expBonus: 1.0,
    bulletToCoin: false,
    corpseExplosion: false,
    isSlowMotion: false,
    hasEndurance: false,
    autoFire: false,
    isInvincible: false,
    isTimeStopped: false,
    barrierTimer: 0,
    skillCooldowns: {}, // 追加: 自動発動の重複防止
    // --- 新規弾丸プロパティ ---
    isPiercing: false,
    isStationary: false,
    isSplitting: false,
    isBouncing: false,
    isRotating: false,
    isBoomerang: false,
    isStepAccel: false,
    isWave: false,
    isExplosion: false,
    isAttract: false,
    isChain: false,
    isFreeze: false,
    isPoison: false,
    // --- 新規ブロックプロパティ ---
    isChainAdv: false,
    isGravity: false,
    isReflecting: false,
    isShrink: false,
    isLightning: false,
    hasTurrets: false,
    hasDecoy: false,
    hasBlade: false,
    hasHacking: false,
    hasPortal: false,
    hasFireworks: false,
    isGrowing: false,
    isDrill: false,
    isBloodPact: false
};
let bullets = [];
let enemyBullets = [];
let enemies = [];
let bits = []; // 獲得アイテム
let particles = [];
let vortices = []; // Grabi用
let turrets = [];
let decoys = [];
let portals = [];
let lightningStrikes = [];
let unlockedItems = JSON.parse(localStorage.getItem('hacker_shooter_inventory_v2')) || {};

// 接触フラグ（条件ブロック用）
let contactFlags = {
    player: false,
    enemy: false,
    bit: false,
    bullet: false,
    blackhole: false
};

// スターターセットを強制的にアンロック (既存プレイヤー対応)
const starters = [
    'main-shot-count', 'passive-speed', 'num-1'
];
const starterCounts = {
    'main-shot-count': 3,
    'passive-speed': 3,
    'num-1': 10,
    'num-3': 10,
    'num-5': 10,
    'num-10': 5,
    'num-20': 5,
    'num-50': 2,
    'num-100': 1
};

// 初期化時にスターターの個数を設定
Object.keys(starterCounts).forEach(id => {
    if (unlockedItems[id] === undefined) {
        unlockedItems[id] = starterCounts[id];
    }
});

// 自由なブロック積み上げ状態
let hackingStack = [];
let activeLoadout = JSON.parse(localStorage.getItem('hacker_shooter_loadout')) || []; // 編成セット
const MAX_LOADOUT_SIZE = 20;
const MAX_STACK_ACTIONS = 5;
let MAX_HACK_MEMORY = 400; // MB
let currentHackMemory = 0;

// 編成の初期化 (空ならスターターを入れる)
if (activeLoadout.length === 0) {
    activeLoadout = starters.slice(0, MAX_LOADOUT_SIZE);
    localStorage.setItem('hacker_shooter_loadout', JSON.stringify(activeLoadout));
}
let logs = [];
let codeRain = [];
let isHacking = false;
let slowTimer = 0;

if (isMobile && document.getElementById('mobile-controls')) {
    document.getElementById('mobile-controls').classList.remove('hidden');
}

// 背景演出用：ランダムなコード断片
const CODE_FRAGMENTS = [
    "void main() {", "if(stat == ERR)", "MOV EAX, 1", "0x00FF41", "HACK_DETECTION",
    "while(true)", "sudo rm -rf", "ROOT_ACCESS", "PROPERTY_OVERRIDE", "speed = 0.5"
];

// 初期化
for (let i = 0; i < 30; i++) {
    codeRain.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        text: CODE_FRAGMENTS[Math.floor(Math.random() * CODE_FRAGMENTS.length)],
        speed: 1 + Math.random() * 2
    });
}

// --- 3. 入力操作 ---
const keys = {};
let isPaused = false;
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && gameActive && !gameOver && !isHacking) {
        isPaused = !isPaused;
    }
});
window.addEventListener('keyup', e => keys[e.key] = false);


// --- 4. クラス定義 ---

// --- 5. UI更新・ハッキング画面ロジック ---
const CATEGORIES = {
    MAIN: 'main',
    SKILL: 'skill',
    PASSIVE: 'passive',
    SYSTEM: 'system',
    LOGIC: 'logic',
    COND: 'cond',
    NUM: 'num',
    OBJECT: 'object',
    PARAM: 'data' // 当てはめる系 (数字・オブジェクト)
};

const BLOCKS = [
    // 1. ロジックブロック (制御構文)
    { id: 'logic-if', category: CATEGORIES.LOGIC, label: 'IF [ {c} ] THEN [ {a} ]', desc: '条件を満たす時のみ実行', hasCond: true, hasAction: true, icon: '⚙️' },
    { id: 'logic-while', category: CATEGORIES.LOGIC, label: 'WHILE [ {c} ] LOOP [ {a} ]', desc: '条件を満たす間、継続実行', hasCond: true, hasAction: true, icon: '🔄' },

    // 2. 条件ブロック
    { id: 'cond-hp-low', category: CATEGORIES.COND, label: 'HPが50%未満', desc: '体力が半分以下の時', icon: '📉' },
    { id: 'cond-gauge-max', category: CATEGORIES.COND, label: 'ハックゲージが100%', desc: 'ゲージが最大の時', icon: '⚡' },
    { id: 'cond-enemy-near', category: CATEGORIES.COND, label: '近くに敵がいる', desc: '200px以内に敵がいる時', icon: '🎯' },
    { id: 'cond-always', category: CATEGORIES.COND, label: '常時有効', desc: '無条件で有効', icon: '♾️' },
    { id: 'cond-on-touch', category: CATEGORIES.COND, label: '[ {o1} ] が [ {o2} ] に触れた時', desc: '指定のオブジェクト同士が触れた瞬間にトリガー', hasObject1: true, hasObject2: true, icon: '🛑' },

    // 0. パラメータ・オブジェクトブロック (新分類)
    { id: 'obj-player', category: CATEGORIES.PARAM, label: '自機', desc: 'プレイヤー自身', memory: 40, icon: '🚀' },
    { id: 'obj-enemy', category: CATEGORIES.PARAM, label: '敵機', desc: 'エネミーオブジェクト', memory: 40, icon: '👾' },
    { id: 'obj-bullet', category: CATEGORIES.PARAM, label: '弾', desc: '攻撃オブジェクト', memory: 40, icon: '🔫' },
    { id: 'obj-blackhole', category: CATEGORIES.PARAM, label: 'ブラックホール', desc: '重力オブジェクト', memory: 40, icon: '🌀' },
    { id: 'obj-bit', category: CATEGORIES.PARAM, label: 'ビット', desc: '通貨・アイテム', memory: 40, icon: '💎' },

    // 3. 攻撃の拡張（メインウェポン）
    { id: 'main-shot-count', category: CATEGORIES.MAIN, label: '弾の数を [ {p} ] 方向にする', desc: '扇状に広がるショットへの強化', hasParam: true, paramType: 'options', options: [1, 3, 5], defaultParam: 1, icon: '🔫' },
    { id: 'main-homing', category: CATEGORIES.MAIN, label: '弾を [ 追尾弾 ] に変える', desc: '敵を自動で追いかける弾', hasParam: false, icon: '🎯' },
    { id: 'main-laser', category: CATEGORIES.MAIN, label: '弾を [ レーザー ] に変える', desc: '一瞬で端まで届く貫通光線', hasParam: false, icon: '⚡' },
    { id: 'main-bomb', category: CATEGORIES.MAIN, label: '弾を [ ボム ] に変える', desc: '着弾時に爆発して周囲を巻き込む', hasParam: false, icon: '💣' },
    { id: 'main-rear', category: CATEGORIES.MAIN, label: '弾を [ 後ろ ] にも撃つ', desc: '背後の敵への対策', hasParam: false, icon: '↩️' },
    { id: 'main-speed', category: CATEGORIES.MAIN, label: '弾の [ 速さ ] を [ {p} ] ％上げる', desc: '弾速アップ', hasParam: true, paramType: 'number', defaultParam: 10, maxParam: 100, icon: '🏃' },
    { id: 'main-size', category: CATEGORIES.MAIN, label: '弾の [ 大きさ ] を [ {p} ] ％上げる', desc: '当たり判定の拡大', hasParam: true, paramType: 'number', defaultParam: 20, maxParam: 200, icon: '💠' },

    // 4. 特殊スキル（サブウェポン・必殺技）
    { id: 'skill-barrier', category: CATEGORIES.SKILL, label: '[ バリア ] を展開する', desc: '敵の弾を一定時間防ぐ', hasParam: false, icon: '🛡️' },
    { id: 'skill-option', category: CATEGORIES.SKILL, label: '[ オプション ] を [ {p} ] 個つける', desc: '自機の横で一緒に撃ってくれるミニ機体', hasParam: true, paramType: 'number', defaultParam: 1, maxParam: 5, icon: '🛰️' },
    { id: 'skill-all-bomb', category: CATEGORIES.SKILL, label: '[ 画面全体ボム ] を使う', desc: '画面上の敵弾をすべて消去', hasParam: false, icon: '💥' },
    { id: 'skill-damage-enemy', category: CATEGORIES.SKILL, label: '敵機に [ 全体ダメージ ] を与える', desc: '画面上の敵すべてにダメージ', hasParam: false, icon: '💣' },
    { id: 'skill-time-stop', category: CATEGORIES.SKILL, label: '[ 時間を止める ]', desc: '数秒間、自分以外の動きを停止させる', hasParam: false, icon: '⏳' },
    { id: 'skill-warp', category: CATEGORIES.SKILL, label: '[ ワープ ] する', desc: '指定した方向に瞬間移動して回避', hasParam: false, icon: '🌌' },
    { id: 'skill-invincible', category: CATEGORIES.SKILL, label: '[ 無敵状態 ] になる', desc: '一定時間、体当たりで敵を破壊可能', hasParam: false, icon: '👻' },

    // ... (Passive and System remain mapped by their IDs later)

    // 3. 機体性能（パッシブ・常時発動）
    { id: 'passive-speed', category: CATEGORIES.PASSIVE, label: '[ 移動速度 ] を [ {p} ] ％上げる', desc: '操作レスポンスの向上', hasParam: true, paramType: 'number', defaultParam: 20, maxParam: 100, icon: '👟' },
    { id: 'passive-hitbox', category: CATEGORIES.PASSIVE, label: '[ 当たり判定 ] を小さくする', desc: '敵の弾を避けやすくする', hasParam: false, icon: '💠' },
    { id: 'passive-magnet', category: CATEGORIES.PASSIVE, label: '[ マグネット ] 機能をオンにする', desc: '落ちているアイテムを自動回収', hasParam: false, icon: '🧲' },
    { id: 'passive-auto-heal', category: CATEGORIES.PASSIVE, label: '[ 自動回復 ] 機能をオンにする', desc: '時間経過で体力が回復', hasParam: false, icon: '💊' },
    { id: 'passive-lives', category: CATEGORIES.PASSIVE, label: '[ 残機 ] を [ {p} ] 増やす', desc: 'コンティニュー回数の増加', hasParam: true, paramType: 'number', defaultParam: 1, maxParam: 5, icon: '➕' },
    { id: 'passive-exp', category: CATEGORIES.PASSIVE, label: '[ 経験値ボーナス ] を [ {p} ] 倍にする', desc: 'レベルアップ速度の向上', hasParam: true, paramType: 'number', defaultParam: 2, maxParam: 10, icon: '💎' },

    // 4. システム改造（特殊ルール）
    { id: 'system-coin', category: CATEGORIES.SYSTEM, label: '敵の弾を [ コイン ] に変える', desc: 'ピンチをチャンスに変える変換機能', hasParam: false, icon: '💰' },
    { id: 'system-explode', category: CATEGORIES.SYSTEM, label: '敵が倒れたときに [ 爆発 ] させる', desc: '連鎖爆破で敵を一掃', hasParam: false, icon: '🧨' },
    { id: 'system-slow', category: CATEGORIES.SYSTEM, label: '[ スローモーション ] モードにする', desc: '弾幕を避けやすくする', hasParam: false, icon: '⏬' },
    { id: 'system-endure', category: CATEGORIES.SYSTEM, label: '[ くいしばり ] を発動する', desc: '一度だけHP1で耐える', hasParam: false, icon: '✊' },
    { id: 'system-auto-fire', category: CATEGORIES.SYSTEM, label: '[ オート連射 ] をオンにする', desc: 'ボタン連打の手間を省く', hasParam: false, icon: '🤖' },

    // 5. 数字ブロック (新分類)
    { id: 'num-1', category: CATEGORIES.PARAM, label: '1', value: 1, maxUsage: 10, icon: '1️⃣' },
    { id: 'num-3', category: CATEGORIES.PARAM, label: '3', value: 3, maxUsage: 10, icon: '3️⃣' },
    { id: 'num-5', category: CATEGORIES.PARAM, label: '5', value: 5, maxUsage: 10, icon: '5️⃣' },
    { id: 'num-10', category: CATEGORIES.PARAM, label: '10', value: 10, maxUsage: 10, icon: '🔟' },
    { id: 'num-20', category: CATEGORIES.PARAM, label: '20', value: 20, maxUsage: 10, icon: '📈' },
    { id: 'num-50', category: CATEGORIES.PARAM, label: '50', value: 50, maxUsage: 10, icon: '⏫' },
    { id: 'num-100', category: CATEGORIES.PARAM, label: '100', value: 100, maxUsage: 10, icon: '💯' },

    // --- 追加ブロック ---
    { id: 'cond-on-hit', category: CATEGORIES.COND, label: '弾が敵にあたったとき', desc: '命中時に一時的に有効化', icon: '🎯' },
    { id: 'passive-blackhole', category: CATEGORIES.PASSIVE, label: 'ブラックホールを設置する', desc: '敵を吸い寄せ、弾を消去する', icon: '🌀' },
    { id: 'skill-subship-adv', category: CATEGORIES.SKILL, label: '高度サブ機を追加する', desc: '自律的に敵を狙う強化型ミニ機体', icon: '🛸' },
    { id: 'system-bit-double', category: CATEGORIES.SYSTEM, label: 'ビットを倍にする', desc: '敵が落とすビットの量が2倍になる', icon: '📈' },

    // --- 1. 弾の性質を変える (BASE) ---
    { id: 'base-piercing', category: CATEGORIES.MAIN, label: '弾を [ 貫通 ] にする', desc: '敵を一通りの敵にも当たるようにする', icon: '🏹' },
    { id: 'base-stationary', category: CATEGORIES.MAIN, label: '弾を [ 設置 ] にする', desc: '撃った場所にしばらく留まる', icon: '📍' },
    { id: 'base-splitting', category: CATEGORIES.MAIN, label: '弾を [ 分裂 ] させる', desc: '敵にあたると分裂して飛ぶ', icon: '🌿' },
    { id: 'base-bouncing', category: CATEGORIES.MAIN, label: '弾を [ バウンド ] させる', desc: '画面端で跳ね返る', icon: '🏀' },

    // --- 2. 弾の動き・形を変える (FORM) ---
    { id: 'form-rotating', category: CATEGORIES.MAIN, label: '弾を [ 回転 ] させる', desc: '自機の周りを旋回する', icon: '🔄' },
    { id: 'form-growing', category: CATEGORIES.MAIN, label: '弾を [ 巨大化 ] させる', desc: '弾のサイズが大きくなる', icon: '📈' },
    { id: 'form-boomerang', category: CATEGORIES.MAIN, label: '弾を [ 往復 ] させる', desc: '一定距離で戻ってくる', icon: '🪃' },
    { id: 'form-accel', category: CATEGORIES.MAIN, label: '弾を [ 時間差加速 ] させる', desc: '途中でスピードが上がる', icon: '⏩' },
    { id: 'form-wave', category: CATEGORIES.MAIN, label: '弾を [ 波形 ] にする', desc: '上下に揺れながら進む', icon: '〰️' },

    // --- 3. 特殊な付加価値 (EFFECT) ---
    { id: 'effect-explosion', category: CATEGORIES.SKILL, label: '[ 爆発 ] を起こす', desc: '着弾時に爆発する', icon: '💥' },
    { id: 'effect-attract', category: CATEGORIES.SKILL, label: '[ 吸い寄せ ]', desc: '近くの敵やアイテムを吸い寄せる', icon: '🧲' },
    { id: 'effect-chain', category: CATEGORIES.SKILL, label: '[ 電撃 ]', desc: '隣の敵にもダメージが広がる', icon: '⚡' },
    { id: 'effect-freeze', category: CATEGORIES.SKILL, label: '[ 凍結 ]', desc: '敵の動きを数秒止める', icon: '❄️' },
    { id: 'effect-poison', category: CATEGORIES.SKILL, label: '[ 毒 ]', desc: 'じわじわ体力を削る', icon: '☠️' },

    // --- 新規追加ブロック (Request) ---
    { id: 'effect-chain-adv', category: CATEGORIES.SKILL, label: '[ 連鎖 ]', desc: '敵から敵へ攻撃が飛び移る', icon: '⚡⚡' },
    { id: 'main-gravity', category: CATEGORIES.MAIN, label: '[ 重力弾 ]', desc: '敵を吸い寄せながら進む', icon: '🕳️' },
    { id: 'main-reflect', category: CATEGORIES.MAIN, label: '[ 反射レーザー ]', desc: '画面端で5回まで跳ね返る', icon: '💎' },
    { id: 'skill-turret', category: CATEGORIES.SKILL, label: '[ 設置タレット ]', desc: 'その場に留まり弾を連射する', icon: '🗼' },
    { id: 'skill-decoy', category: CATEGORIES.SKILL, label: '[ デコイ ]', desc: '敵の狙いをそらす分身を出す', icon: '🤡' },
    { id: 'skill-blade', category: CATEGORIES.SKILL, label: '[ 近接ブレード ]', desc: '目の前の弾を消しながら斬る', icon: '🗡️' },
    { id: 'system-hacking', category: CATEGORIES.SYSTEM, label: '[ ハッキング ]', desc: '敵の弾を自分の弾に変える', icon: '📥' },
    { id: 'effect-shrink', category: CATEGORIES.SKILL, label: '[ 縮小化 ]', desc: '当たった敵を小さく弱くする', icon: '🤏' },
    { id: 'skill-portal', category: CATEGORIES.SKILL, label: '[ ポータル ]', desc: '入り口から入った弾が出口から出る', icon: '🚪' },
    { id: 'system-fireworks', category: CATEGORIES.SYSTEM, label: '[ 花火 ]', desc: '敵を倒した時に爆発四散させる', icon: '🎆' },
    { id: 'effect-lightning', category: CATEGORIES.SKILL, label: '[ 雷撃 ]', desc: '着弾地点に雷を落とす', icon: '⚡🌋' },
    // --- 新規追加アドバンスド・コンボ用 ---
    { id: 'main-drill', category: CATEGORIES.MAIN, label: '[ ドリル ]', desc: '多段ヒットする重い弾', icon: '🔩' },
    { id: 'passive-blood-pact', category: CATEGORIES.PASSIVE, label: '[ 決死の覚悟 ]', desc: 'HPを常時消費し、弾の威力とサイズを3倍にする', icon: '🩸' },

    // --- Phase 2: NEW BLOCKS ---
    { id: 'effect-echo', category: CATEGORIES.SKILL, label: '[ 残響 ]', desc: '敵を倒すと衝撃波が発生し、周囲の敵を被ダメージ1.5倍にする', icon: '📡' },
    { id: 'system-binary-trade', category: CATEGORIES.SYSTEM, label: '[ 等価交換 ]', desc: '射撃時にビットを消費。ビットが偶数なら威力UP、奇数なら弾数UP', icon: '⚖️' },
    { id: 'passive-inertia', category: CATEGORIES.PASSIVE, label: '[ 慣性 ]', desc: '自機の移動速度を弾の威力に加算する', icon: '🏎️' },
    { id: 'main-compress', category: CATEGORIES.MAIN, label: '[ 圧縮 ]', desc: '長押しでチャージし、超高密度弾を放つ', icon: '💎' },
    { id: 'main-latency', category: CATEGORIES.MAIN, label: '[ 遅延 ]', desc: '貫通弾の軌跡が数秒後に爆発する', icon: '⏱️' },
    { id: 'skill-synchro', category: CATEGORIES.SKILL, label: '[ 同期 ]', desc: '画面内に弾が5発以上あるとき、全弾が敵をホーミングする', icon: '🔗' },
    { id: 'effect-malware', category: CATEGORIES.SKILL, label: '[ 浸食 ]', desc: '敵にノイズを蓄積させ、一定量で敵の攻撃を自爆に変える', icon: '🦠' },
    { id: 'effect-repel', category: CATEGORIES.SKILL, label: '[ 反発 ]', desc: '自分の弾が敵の弾を弾き飛ばす', icon: '🧲', maxUsage: 2 },
    { id: 'system-reboot', category: CATEGORIES.SYSTEM, label: '[ 再起動 ]', desc: '敵撃破で1秒無敵になるが、その間攻撃不能', icon: '♻️', maxUsage: 1 },
    { id: 'system-random', category: CATEGORIES.SYSTEM, label: '[ 乱数 ]', desc: '弾の威力・速度・サイズがランダムに変動する', icon: '🎲', maxUsage: 1 }
];

// Phase 3: Initialize usage counts and memory costs
BLOCKS.forEach(b => {
    // Memory Cost Assignment (Extreme Scarcity)
    if (b.category === CATEGORIES.LOGIC) b.memory = 80;
    else if (b.category === CATEGORIES.COND) b.memory = 30;
    else if (b.category === CATEGORIES.MAIN || b.category === CATEGORIES.SKILL) b.memory = 150;
    else if (b.category === CATEGORIES.PASSIVE) b.memory = 60;
    else if (b.category === CATEGORIES.SYSTEM) b.memory = 200;
    else if (b.category === CATEGORIES.NUM) b.memory = 12;
    else b.memory = 40;

    // Usage Limits (Refined for scarcity)
    if (!b.maxUsage) {
        if (b.category === CATEGORIES.SYSTEM || b.category === CATEGORIES.PASSIVE) b.maxUsage = 1;
        else if (b.category === CATEGORIES.MAIN || b.category === CATEGORIES.SKILL) b.maxUsage = 2;
        else if (b.category === CATEGORIES.LOGIC || b.category === CATEGORIES.COND) b.maxUsage = 2;
        else if (b.category === CATEGORIES.NUM) b.maxUsage = 5;
        else b.maxUsage = 1;
    }

    b.remainingUsage = b.maxUsage;
});

const AVAILABLE_CONDITIONS = [];
const AVAILABLE_ACTIONS = [];
const AVAILABLE_CHARACTERS = [];
const ALL_ITEMS = BLOCKS;

let currentHackTab = 'main';

// タブ切り替え
function switchTab(tabName) {
    currentHackTab = tabName;
    document.querySelectorAll('.hack-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Moderate glitch effect on tab switch
    const consoleContainer = document.getElementById('hacking-console');
    if (consoleContainer) {
        consoleContainer.style.opacity = '0.7';
        setTimeout(() => { consoleContainer.style.opacity = '1'; }, 40);
    }
    renderHackConsole();
}

function calculateTotalMemory() {
    let total = 0;
    hackingStack.forEach(entry => {
        const bMain = BLOCKS.find(b => b.id === entry.id);
        if (bMain) total += bMain.memory;

        if (entry.condId) {
            const bCond = BLOCKS.find(b => b.id === entry.condId);
            if (bCond) total += bCond.memory;
        }
        if (entry.actionId) {
            const bAct = BLOCKS.find(b => b.id === entry.actionId);
            if (bAct) total += bAct.memory;
        }
        if (entry.param !== null) {
            const bNum = BLOCKS.find(b => b.category === CATEGORIES.NUM && b.value === entry.param);
            if (bNum) total += bNum.memory;
        }
    });
    return total;
}


let selectedSlot = null; // 'param', 'cond', 'action'
let selectedBlockIndex = -1;

function renderHackConsole() {
    const palette = document.getElementById('palette-content');
    const workspace = document.getElementById('hacking-workspace');
    const errorConsole = document.getElementById('hacking-error-console');
    if (errorConsole) errorConsole.textContent = '';
    if (!palette) return;

    palette.innerHTML = '';

    // カテゴリフィルタ (新基準)
    let filtered = [];
    if (currentHackTab === 'attack') {
        filtered = BLOCKS.filter(b => b.category === CATEGORIES.MAIN || b.category === CATEGORIES.SKILL);
    } else if (currentHackTab === 'buff') {
        filtered = BLOCKS.filter(b => b.category === CATEGORIES.PASSIVE);
    } else if (currentHackTab === 'system') {
        filtered = BLOCKS.filter(b => b.category === CATEGORIES.SYSTEM);
    } else if (currentHackTab === 'logic') {
        filtered = BLOCKS.filter(b => b.category === CATEGORIES.LOGIC || b.category === CATEGORIES.COND || b.category === CATEGORIES.NUM);
    } else if (currentHackTab === 'data') {
        filtered = BLOCKS.filter(b => b.category === CATEGORIES.PARAM);
    }

    filtered.forEach(block => {
        const isOutOfStock = block.remainingUsage <= 0;
        const div = document.createElement('div');
        div.className = `hack-item type-${block.category} ${isOutOfStock ? 'out-of-stock' : ''}`;

        let label = block.label.replace(' [ {p} ] ', ' [...] ').replace(' [ {c} ] ', ' [?] ').replace(' [ {a} ] ', ' [!] ');
        if (block.hasObject) label = label.replace('[ {o} ]', ' [?] ');
        div.innerHTML = `
            <span class="hack-icon">${block.icon || ''}</span> 
            <span style="margin-left:5px;">${label}</span>
            <div class="item-count">${block.memory}MB | LIFE: ${block.remainingUsage}</div>
        `;

        if (!isOutOfStock) {
            div.onclick = () => { handleBlockClick(block); };
            div.ondblclick = () => {
                if (block.category === CATEGORIES.LOGIC) addToStack(block);
                else handleBlockClick(block);
            };
        }
        palette.appendChild(div);
    });

    // メモリ使用量の更新
    currentHackMemory = calculateTotalMemory();
    const memoryBar = document.getElementById('memory-bar-fill');
    const memoryText = document.getElementById('memory-text');
    if (memoryBar) {
        const pct = (currentHackMemory / MAX_HACK_MEMORY) * 100;
        memoryBar.style.width = `${Math.min(100, pct)}%`;
        memoryBar.style.backgroundColor = currentHackMemory > MAX_HACK_MEMORY ? '#f00' : '#0f0';
    }
    if (memoryText) {
        memoryText.textContent = `MEMORY: ${currentHackMemory} / ${MAX_HACK_MEMORY} MB`;
        memoryText.style.color = currentHackMemory > MAX_HACK_MEMORY ? '#f00' : '#00ff41';
    }

    // ワークスペース描画
    if (workspace) {
        workspace.innerHTML = '';
        hackingStack.forEach((entry, index) => {
            const blockDef = BLOCKS.find(b => b.id === entry.id);
            const div = document.createElement('div');
            div.className = `hack-item in-slot type-${blockDef.category}`;

            let html = blockDef.label;

            if (blockDef.hasParam) {
                const pVal = entry.param !== null ? entry.param : '__';
                const activeClass = (selectedBlockIndex === index && selectedSlot === 'param') ? 'selected' : '';
                html = html.replace('[ {p} ]', `<span class="param-slot ${activeClass}" onclick="selectSlot(${index}, 'param')">${pVal}</span>`);
            }
            if (blockDef.hasCond) {
                const cDef = entry.condId ? BLOCKS.find(b => b.id === entry.condId) : null;
                let cLabel = cDef ? cDef.label : '??';

                if (cDef && cDef.hasObject1) {
                    const oLabel = entry.objectId ? entry.objectId.replace('obj-', '') : '??';
                    const oActiveClass = (selectedBlockIndex === index && selectedSlot === 'object1') ? 'selected' : '';
                    cLabel = cLabel.replace('[ {o1} ]', `<span class="param-slot object-slot ${oActiveClass}" onclick="event.stopPropagation(); selectSlot(${index}, 'object1')">${oLabel}</span>`);
                }
                if (cDef && cDef.hasObject2) {
                    const o2Label = entry.objectId2 ? entry.objectId2.replace('obj-', '') : '??';
                    const o2ActiveClass = (selectedBlockIndex === index && selectedSlot === 'object2') ? 'selected' : '';
                    cLabel = cLabel.replace('[ {o2} ]', `<span class="param-slot object-slot ${o2ActiveClass}" onclick="event.stopPropagation(); selectSlot(${index}, 'object2')">${o2Label}</span>`);
                }

                const activeClass = (selectedBlockIndex === index && selectedSlot === 'cond') ? 'selected' : '';
                html = html.replace('[ {c} ]', `<span class="param-slot cond-slot ${activeClass}" onclick="selectSlot(${index}, 'cond')">${cLabel}</span>`);
            }
            if (blockDef.hasAction) {
                const aDef = entry.actionId ? BLOCKS.find(b => b.id === entry.actionId) : null;
                const aLabel = aDef ? aDef.label.replace(' [ {p} ] ', ' [...] ').replace(' [ {a} ] ', ' [!] ') : '!!';
                const activeClass = (selectedBlockIndex === index && selectedSlot === 'action') ? 'selected' : '';
                html = html.replace('[ {a} ]', `<span class="param-slot action-slot ${activeClass}" onclick="selectSlot(${index}, 'action')">${aLabel}</span>`);
            }

            div.innerHTML = `<div style="flex:1">${html}</div>`;
            div.onclick = (e) => {
                if (!e.target.classList.contains('param-slot')) removeFromStack(index);
            };
            workspace.appendChild(div);
        });

        if (hackingStack.length === 0) {
            workspace.innerHTML = '<div style="color:#005500; font-size:0.6rem; text-align:center; padding-top:20px;">モジュールをロードしてください</div>';
        }
    }
}

function selectSlot(index, slotType) {
    selectedBlockIndex = index;
    selectedSlot = slotType;
    renderHackConsole();
}

function addToStack(block) {
    if (hackingStack.length >= MAX_STACK_ACTIONS) {
        if (document.getElementById('hacking-error-console')) {
            document.getElementById('hacking-error-console').textContent = "Error: 最大スロット数を超過しています";
        }
        return;
    }

    if (block.remainingUsage <= 0) {
        addLog(`リソース不足: ${block.label}`, 'error');
        return;
    }

    // メモリチェック
    if (calculateTotalMemory() + block.memory > MAX_HACK_MEMORY) {
        if (document.getElementById('hacking-error-console')) {
            document.getElementById('hacking-error-console').textContent = "Error: メモリ容量不足です";
        }
        return;
    }

    block.remainingUsage--;
    hackingStack.push({ id: block.id, condId: null, actionId: null, param: null, objectId: null, objectId2: null });
    renderHackConsole();
}

function handleBlockClick(block) {
    // 選択中のスロットがあれば埋める
    if (selectedBlockIndex !== -1 && selectedSlot) {
        fillSlot(block.id);
        return;
    }

    // 選択中でない場合: 自動的に空きスロットを探す
    for (let i = 0; i < hackingStack.length; i++) {
        const entry = hackingStack[i];
        const def = BLOCKS.find(b => b.id === entry.id);

        const cDef = entry.condId ? BLOCKS.find(b => b.id === entry.condId) : null;
        if (block.category === CATEGORIES.PARAM && block.id.startsWith('obj-') && cDef) {
            if (cDef.hasObject1 && entry.objectId === null) {
                selectSlot(i, 'object1'); fillSlot(block.id); return;
            }
            if (cDef.hasObject2 && entry.objectId2 === null) {
                selectSlot(i, 'object2'); fillSlot(block.id); return;
            }
        }
        if (block.category === CATEGORIES.COND && def.hasCond && entry.condId === null) {
            selectSlot(i, 'cond'); fillSlot(block.id); return;
        }
        if ([CATEGORIES.MAIN, CATEGORIES.SKILL, CATEGORIES.PASSIVE, CATEGORIES.SYSTEM].includes(block.category) && def.hasAction && entry.actionId === null) {
            selectSlot(i, 'action'); fillSlot(block.id); return;
        }
        // オブジェクトスロットの自動埋め
        if (block.category === CATEGORIES.COND && def.hasObject && entry.objectId === null) {
            // cond-on-touch の場合のみオブジェクトスロットを埋める
            if (def.id === 'cond-on-touch') {
                // ここでは仮のオブジェクトIDを設定。実際には専用のオブジェクトブロックが必要
                // または、cond-on-touch を選択した後に、オブジェクトを選択させるUIフローが必要
                // 今回は簡易的に、cond-on-touch を選択したときに、オブジェクトスロットが選択状態になるようにする
                selectSlot(i, 'object');
                addLog("オブジェクトを選択してください: obj-enemy, obj-bit, obj-bullet", "hack");
                return;
            }
        }
    }

    // 空きスロットがない or 該当なしの場合: スタックに追加
    if (block.category !== CATEGORIES.NUM && block.category !== CATEGORIES.COND) {
        addToStack(block);
    } else {
        addLog("配置可能なスロットが見つかりません", "hack");
    }
}

function fillSlot(blockId) {
    if (selectedBlockIndex === -1 || !selectedSlot) return;
    const block = BLOCKS.find(b => b.id === blockId);
    const entry = hackingStack[selectedBlockIndex];

    // ストックチェック (既に使われているものを除く) // Removed count logic
    // const totalOwned = unlockedItems[block.id] || 0;
    // let usedCount = 0;
    // hackingStack.forEach(e => {
    //     if (e.id === block.id) usedCount++;
    //     if (e.condId === block.id) usedCount++;
    //     if (e.actionId === block.id) usedCount++;
    // });
    // if (usedCount >= totalOwned) {
    //     addLog(`所持数が不足しています: ${block.id}`, 'error');
    //     return;
    // }

    if (selectedSlot === 'cond') {
        if (block.category !== CATEGORIES.COND) {
            addLog("Error: 条件スロットには条件ブロックのみ配置可能です", 'hack');
            return;
        }
        if (block.remainingUsage <= 0) { addLog("リソース不足", "error"); return; }

        // メモリチェック
        const currentTotal = calculateTotalMemory();
        const prevMem = entry.condId ? (BLOCKS.find(b => b.id === entry.condId)?.memory || 0) : 0;
        if (currentTotal - prevMem + block.memory > MAX_HACK_MEMORY) {
            addLog("メモリ不足", "error");
            return;
        }

        // 以前のブロックがあれば戻す
        if (entry.condId) {
            const prev = BLOCKS.find(b => b.id === entry.condId);
            if (prev) prev.remainingUsage++;
        }
        block.remainingUsage--;
        entry.condId = block.id;
        // cond-on-touch の場合、オブジェクトスロットも選択状態にする
        if (block.id === 'cond-on-touch') {
            selectedSlot = 'object1';
            addLog("1つ目のオブジェクトを選択してください", "hack");
        }
    } else if (selectedSlot === 'action') {
        const validActions = [CATEGORIES.MAIN, CATEGORIES.SKILL, CATEGORIES.PASSIVE, CATEGORIES.SYSTEM];
        if (!validActions.includes(block.category)) {
            addLog("Error: アクションスロットには実行ブロックのみ配置可能です", 'hack');
            return;
        }
        if (block.remainingUsage <= 0) { addLog("リソース不足", "error"); return; }

        // メモリチェック
        const currentTotal = calculateTotalMemory();
        const prevMem = entry.actionId ? (BLOCKS.find(b => b.id === entry.actionId)?.memory || 0) : 0;
        if (currentTotal - prevMem + block.memory > MAX_HACK_MEMORY) {
            addLog("メモリ不足", "error");
            return;
        }

        // 以前のブロックがあれば戻す
        if (entry.actionId) {
            const prev = BLOCKS.find(b => b.id === entry.actionId);
            if (prev) prev.remainingUsage++;
        }
        block.remainingUsage--;
        entry.actionId = block.id;
    } else if (selectedSlot === 'param') {
        if (block.category !== CATEGORIES.PARAM || !block.id.startsWith('num-')) {
            addLog("Error: パラメータには数字ブロックのみ配置可能です", 'hack');
            return;
        }
        if (block.remainingUsage <= 0) { addLog("リソース不足", "error"); return; }

        // メモリチェック
        const currentTotal = calculateTotalMemory();
        const prevMem = entry.param !== null ? (BLOCKS.find(b => b.category === CATEGORIES.NUM && b.value === entry.param)?.memory || 0) : 0;
        if (currentTotal - prevMem + block.memory > MAX_HACK_MEMORY) {
            addLog("メモリ不足", "error");
            return;
        }

        // 以前のブロックがあれば戻す
        if (entry.param !== null) {
            const prev = BLOCKS.find(b => b.category === CATEGORIES.NUM && b.value === entry.param);
            if (prev) prev.remainingUsage++;
        }
        block.remainingUsage--;
        const targetDef = BLOCKS.find(b => b.id === hackingStack[selectedBlockIndex].id);
        const rawVal = block.value;
        const maxP = targetDef && targetDef.maxParam != null ? targetDef.maxParam : Infinity;
        entry.param = Math.min(rawVal, maxP);
        if (rawVal > maxP) addLog(`▲ 数値届返！上限 ${maxP} に制限されました`, 'error');
    } else if (selectedSlot === 'object1' || selectedSlot === 'object2') {
        if (block.category !== CATEGORIES.PARAM || !block.id.startsWith('obj-')) {
            addLog("Error: このスロットにはオブジェクトブロックのみ配置可能です", 'hack');
            return;
        }
        if (block.remainingUsage <= 0) { addLog("リソース不足", "error"); return; }

        const isObj2 = (selectedSlot === 'object2');
        const currentObjectId = isObj2 ? entry.objectId2 : entry.objectId;

        const currentTotal = calculateTotalMemory();
        const prevMem = currentObjectId ? (BLOCKS.find(b => b.id === currentObjectId)?.memory || 0) : 0;
        if (currentTotal - prevMem + block.memory > MAX_HACK_MEMORY) {
            addLog("メモリ不足", "error");
            return;
        }

        if (currentObjectId) {
            const prev = BLOCKS.find(b => b.id === currentObjectId);
            if (prev) prev.remainingUsage++;
        }
        block.remainingUsage--;

        if (isObj2) entry.objectId2 = block.id;
        else entry.objectId = block.id;

        // オブジェクト1を埋めた直後、オブジェクト2が空なら自動移行
        if (!isObj2 && entry.objectId2 === null) {
            selectedSlot = 'object2';
            addLog("2つ目のオブジェクトを選択してください", "hack");
            return; // 続けて入力を待つ
        }
    }

    selectedBlockIndex = -1;
    selectedSlot = null;
    renderHackConsole();
}

function removeFromStack(index) {
    const entry = hackingStack[index];
    // Return usages
    const bMain = BLOCKS.find(b => b.id === entry.id);
    if (bMain) bMain.remainingUsage++;
    if (entry.condId) {
        const bCond = BLOCKS.find(b => b.id === entry.condId);
        if (bCond) bCond.remainingUsage++;
    }
    if (entry.actionId) {
        const bAct = BLOCKS.find(b => b.id === entry.actionId);
        if (bAct) bAct.remainingUsage++;
    }
    if (entry.param !== null) {
        const bNum = BLOCKS.find(b => b.category === CATEGORIES.NUM && b.value === entry.param);
        if (bNum) bNum.remainingUsage++;
    }
    if (entry.objectId) {
        const bObj = BLOCKS.find(b => b.id === entry.objectId);
        if (bObj) bObj.remainingUsage++;
    }
    if (entry.objectId2) {
        const bObj2 = BLOCKS.find(b => b.id === entry.objectId2);
        if (bObj2) bObj2.remainingUsage++;
    }

    hackingStack.splice(index, 1);
    selectedBlockIndex = -1;
    selectedSlot = null;
    renderHackConsole();
}
// renderHackConsoleの最後に呼ぶように修正

function openHackingScreen() {
    if (isHacking || gameOver || !gameActive) return;
    isHacking = true;
    keys['s'] = false; keys['S'] = false;

    // Phase 3: Reset usage counts per session
    BLOCKS.forEach(b => b.remainingUsage = b.maxUsage);

    // Persistent Slot Management: Pre-populate with currently active modules
    hackingStack = JSON.parse(JSON.stringify(player.activeModules));

    // Adjust usage counts based on what's already in the stack
    hackingStack.forEach(entry => {
        const bMain = BLOCKS.find(b => b.id === entry.id);
        if (bMain) bMain.remainingUsage--;
        if (entry.condId) {
            const bCond = BLOCKS.find(b => b.id === entry.condId);
            if (bCond) bCond.remainingUsage--;
        }
        if (entry.actionId) {
            const bAct = BLOCKS.find(b => b.id === entry.actionId);
            if (bAct) bAct.remainingUsage--;
        }
        if (entry.param !== null) {
            const bNum = BLOCKS.find(b => b.category === CATEGORIES.NUM && b.value === entry.param);
            if (bNum) bNum.remainingUsage--;
        }
        if (entry.objectId) {
            const bObj = BLOCKS.find(b => b.id === entry.objectId);
            if (bObj) bObj.remainingUsage--;
        }
        if (entry.objectId2) {
            const bObj2 = BLOCKS.find(b => b.id === entry.objectId2);
            if (bObj2) bObj2.remainingUsage--;
        }
    });

    renderHackConsole();
    document.getElementById('hacking-console').classList.add('active');
    addLog(`論理ブロックの再構成を開始...`, 'hack');
    updateUI();
}

function closeHackingScreen() {
    isHacking = false;
    document.getElementById('hacking-console').classList.remove('active');
}

// 実行ボタン (COMPILE & EXECUTE)
document.getElementById('apply-hack').onclick = () => {
    try {
        if (hackingStack.length === 0) {
            addLog(`有効なモジュールが配置されていません`);
            return;
        }

        // ロジックブロックの完全性チェック
        for (const entry of hackingStack) {
            const def = BLOCKS.find(b => b.id === entry.id);
            if (def.hasCond && (!entry.condId || !entry.actionId)) {
                throw new Error("論理ブロックの構成が不完全です（条件またはアクションが未設定）");
            }
            if (def.hasParam && entry.param === null) {
                entry.param = def.defaultParam;
            }
            if (entry.condId) {
                const cDef = BLOCKS.find(b => b.id === entry.condId);
                if (cDef && cDef.hasObject1 && entry.objectId === null) throw new Error("条件ブロックの構成が不完全です（オブジェクト1が未設定）");
                if (cDef && cDef.hasObject2 && entry.objectId2 === null) throw new Error("条件ブロックの構成が不完全です（オブジェクト2が未設定）");
            }
        }

        // OVRWRITE Instead of Push: Session Memory Persistence
        player.activeModules = JSON.parse(JSON.stringify(hackingStack));

        // パワーレベル計算 (的の難易度スケーリング用)
        const POWER_WEIGHTS = {
            'base-splitting': 2, 'base-piercing': 1, 'main-homing': 2, 'main-laser': 3,
            'effect-explosion': 2, 'effect-chain': 2, 'effect-chain-adv': 3,
            'form-growing': 1, 'system-bit-double': 1, 'passive-blood-pact': 4,
            'main-drill': 2, 'main-gravity': 1, 'main-reflect': 1
        };
        playerPowerLevel = Math.min(20, player.activeModules.reduce((sum, mod) => {
            return sum + (POWER_WEIGHTS[mod.id] || 0.5);
        }, 0));

        // ビット消費倍率の計算 (強くなるほど消費増)
        player.bitCostMult = 1 + (playerPowerLevel * 0.1);

        addLog(`⚡ パワーレベル: ${playerPowerLevel.toFixed(1)} / ビット消費: x${player.bitCostMult.toFixed(2)}`, 'hack');
        addLog(`📈 難易度補正: 敵出現率 +${(playerPowerLevel * 150).toFixed(0)}%`, 'hack');

        // コンボ検知ヒント
        const ids = new Set(player.activeModules.map(m => m.id));
        const comboHints = [
            { requires: ['passive-magnet', 'system-bit-double'], label: '💥 コレクター型: マグネット+ビット倍増' },
            { requires: ['passive-auto-heal', 'passive-blood-pact'], label: '🥸 不死身型: 回復+決死の覚悟' },
            { requires: ['effect-freeze', 'base-stationary'], label: '🧊 氷結トラップ型: 凍結+設置' },
            { requires: ['skill-barrier', 'base-bouncing'], label: '🛡️ 反射盾型: バリア+バウンド' },
            { requires: ['skill-time-stop', 'base-stationary'], label: '⏱️ 時空支配型: 時間止め+設置' },
            { requires: ['skill-decoy', 'base-splitting'], label: '🎭 分身味方型: デコイ+分裂' },
            { requires: ['passive-blackhole', 'passive-auto-heal'], label: '⚫ 吸収経済型: ブラックホール+自動回復' }
        ];
        comboHints.forEach(hint => {
            if (hint.requires.every(id => ids.has(id))) {
                addLog('🔥 備考: ' + hint.label, 'hack');
            }
        });

        addLog(`システム同期完了: ${player.activeModules.length} モジュールが稼働状態です`, 'hack');
        hackGauge = 0;
        // hackingStack = []; // 蓄積のためにクリアせず編集可能にする
        selectedBlockIndex = -1;
        selectedSlot = null;

        closeHackingScreen();
        applyStaticStats(); // ベースステータスの確定
        applyDynamicLogic(); // 初回評価
        updateUI();
    } catch (e) {
        console.error(e);
        const errorConsole = document.getElementById('hacking-error-console');
        if (errorConsole) errorConsole.textContent = `Compile Error: ${e.message}`;
        addLog(`コンパイルエラー: ${e.message}`, 'error');
    }
};

let cachedConditions = {};

function checkCondition(condId, target = null, objId = null, objId2 = null) {
    if (!condId) return true;
    if (condId === 'cond-on-hit') {
        if (target && target.justHit) return true;
        return bulletHitRecently > 0;
    }
    if (condId === 'cond-on-touch') {
        if (!objId || !objId2) return false;

        const isPair = (t1, t2) => (objId === t1 && objId2 === t2) || (objId === t2 && objId2 === t1);

        if (isPair('obj-player', 'obj-enemy')) return contactFlags.enemy;
        if (isPair('obj-player', 'obj-bit')) return contactFlags.bit;
        if (isPair('obj-player', 'obj-bullet')) return contactFlags.bullet;
        if (isPair('obj-player', 'obj-blackhole')) return contactFlags.blackhole;
        if (isPair('obj-bullet', 'obj-enemy')) return bulletHitRecently > 0 || (target && target.justHit);

        // フォールバック
        return false;
    }
    return !!cachedConditions[condId];
}

function updateConditionCache() {
    cachedConditions = {
        'cond-hp-low': hp < MAX_HP * 0.5,
        'cond-gauge-max': hackGauge >= 100,
        'cond-enemy-near': enemies.some(e => Math.hypot(e.x - player.x, e.y - player.y) < 200),
        'cond-always': true
    };
}

function evaluateCondition(condId, target = null) {
    return checkCondition(condId, target);
}

function applyStaticStats() {
    // コンパイル時に一度だけ計算すれば良いベース値のリセット
    player.speed = PLAYER_SPEED;
    player.fireRate = 180;
    player.multiShot = 1;
    player.isHoming = false;
    player.isLaser = false;
    player.isBomb = false;
    player.isRearShot = false;
    player.bulletSpeedMult = 1.0;
    player.bulletSizeMult = 1.0;
    player.hitboxSizeMult = 1.0;
    player.isMagnet = false;
    player.autoHeal = 0;
    player.expBonus = 1.0;
    player.bulletToCoin = false;
    player.corpseExplosion = false;
    player.isSlowMotion = false;
    player.hasEndurance = false;
    player.autoFire = false;
    player.subShips = 0;
    player.advancedSubShips = 0;
    player.hasBlackHole = false;
    bitMultiplier = 1;

    // 弾丸プロパティのリセット
    player.isPiercing = false;
    player.isStationary = false;
    player.isSplitting = false;
    player.isBouncing = false;
    player.isRotating = false;
    player.isBoomerang = false;
    player.isStepAccel = false;
    player.isWave = false;
    player.isExplosion = false;
    player.isAttract = false;
    player.isChain = false;
    player.isFreeze = false;
    player.isPoison = false;
    // --- 新規プロパティリセット ---
    player.isChainAdv = false;
    player.isGravity = false;
    player.isReflecting = false;
    player.isShrink = false;
    player.isLightning = false;
    player.hasTurrets = false;
    player.hasDecoy = false;
    player.hasBlade = false;
    player.hasHacking = false;
    player.hasPortal = false;
    player.hasFireworks = false;
    player.isGrowing = false;
    player.isDrill = false;
    player.isBloodPact = false;
    // --- Phase 2 Reset ---
    player.hasEcho = false;
    player.hasBinaryTrade = false;
    player.hasInertia = false;
    player.hasCompress = false;
    player.hasLatency = false;
    player.hasSynchro = false;
    player.hasMalware = false;
    player.hasRepel = false;
    player.hasReboot = false;
    player.hasRandom = false;

    // ロジック以外の常時発動モジュールを先に適用
    player.activeModules.forEach(mod => {
        if (mod.id !== 'logic-if' && mod.id !== 'logic-while') {
            applyActionEffect(mod.id, mod.param);
        }
    });
}

function applyDynamicLogic(target = null) {
    // 毎フレーム判定が必要なロジックブロックのみ評価
    player.activeModules.forEach(mod => {
        if (mod.id === 'logic-if' || mod.id === 'logic-while') {
            if (checkCondition(mod.condId, target, mod.objectId, mod.objectId2)) {
                applyActionEffect(mod.actionId, mod.param, target);
            }
        }
    });
}

function applyActionEffect(actionId, p, target = null) {
    const obj = target || player;
    switch (actionId) {
        case 'main-shot-count': player.multiShot = Math.min(5, player.multiShot + (p || 1)); break; // 上限5
        case 'main-homing': obj.isHoming = true; break;
        case 'main-laser': obj.isLaser = true; break;
        case 'main-bomb': obj.isBomb = true; break;
        case 'main-rear': player.isRearShot = true; break;
        case 'main-speed':
            if (target) { target.vx *= 1.2; target.vy *= 1.2; }
            else player.bulletSpeedMult *= (1 + (p || 10) / 100); // 乗算スタック
            break;
        case 'main-size':
            if (target) target.size *= 1.5;
            else player.bulletSizeMult *= (1 + (p || 10) / 100); // 乗算スタック
            break;

        case 'skill-option': player.subShips += (p || 1); break; // 加算スタック

        case 'passive-speed': player.speed += PLAYER_SPEED * (p || 10) / 100; break; // 加算スタック
        case 'passive-hitbox': player.hitboxSizeMult *= 0.8; break; // 乗算スタック（どんどん小さく）
        case 'passive-magnet': player.isMagnet = true; break;
        case 'passive-auto-heal': player.autoHeal += 0.03; break; // バフ: 3倍速回復
        case 'passive-lives': player.lives = (player.lives || 3) + 1; break; // 加算スタック
        case 'passive-exp': player.expBonus *= (p || 1.2); break; // 乗算スタック

        case 'system-coin': player.bulletToCoin = true; break;
        case 'system-explode': player.corpseExplosion = true; break;
        case 'system-slow': player.isSlowMotion = true; break;
        case 'system-endure': player.hasEndurance = true; break;
        case 'system-auto-fire': player.autoFire = true; break;
        case 'passive-blackhole': player.hasBlackHole = true; break;
        case 'skill-subship-adv': player.advancedSubShips += 1; break;
        case 'system-bit-double': bitMultiplier += 1; break; // 加算スタック（1->2->3...）

        case 'base-piercing': obj.isPiercing = true; break;
        case 'base-stationary': obj.isStationary = true; break;
        case 'base-splitting': obj.isSplitting = true; break;
        case 'base-bouncing': obj.isBouncing = true; break;

        case 'form-rotating': obj.isRotating = true; break;
        case 'form-growing': obj.isGrowing = true; if (target) target.size *= 2; break;
        case 'form-boomerang': obj.isBoomerang = true; break;
        case 'form-accel': obj.isStepAccel = true; break;
        case 'form-wave': obj.isWave = true; break;

        case 'effect-explosion': obj.isExplosion = true; break;
        case 'effect-attract': obj.isAttract = true; break;
        case 'effect-chain': obj.isChain = true; break;
        case 'effect-freeze': obj.isFreeze = true; break;
        case 'effect-poison': obj.isPoison = true; break;

        case 'effect-chain-adv': obj.isChainAdv = true; break;
        case 'main-gravity': obj.isGravity = true; break;
        case 'main-reflect': obj.isReflecting = true; break;
        case 'effect-shrink': obj.isShrink = true; break;
        case 'effect-lightning': obj.isLightning = true; break;
        case 'system-hacking': player.hasHacking = true; break;
        case 'system-fireworks': player.hasFireworks = true; break;
        case 'main-drill': obj.isDrill = true; break;
        case 'passive-blood-pact': player.isBloodPact = true; player.bloodPactDamage = 4.0; break; // バフ: 4倍ダメージ

        case 'effect-echo': player.hasEcho = true; break;
        case 'system-binary-trade': player.hasBinaryTrade = true; break;
        case 'passive-inertia': player.hasInertia = true; break;
        case 'main-compress': player.hasCompress = true; break;
        case 'main-latency': player.hasLatency = true; obj.isPiercing = true; break;
        case 'skill-synchro': player.hasSynchro = true; break;
        case 'effect-malware': player.hasMalware = true; break;
        case 'effect-repel': player.hasRepel = true; break;
        case 'system-reboot': player.hasReboot = true; break;
        case 'system-random': player.hasRandom = true; break;

        default:
            // skill-系のボタン/条件発動対応
            if (actionId.startsWith('skill-')) {
                const now = Date.now();
                // 一部のスキルはフラグ管理のみ
                if (['skill-turret', 'skill-decoy', 'skill-blade', 'skill-portal'].includes(actionId)) {
                    player[actionId.replace('skill-', 'has')] = true;
                }

                // 自動/手動発動
                if (!player.skillCooldowns[actionId] || now - player.skillCooldowns[actionId] > 1000) {
                    triggerSkill(actionId, p);
                    player.skillCooldowns[actionId] = now;
                }
            }
    }
}

function triggerSkill(skillId, param) {
    switch (skillId) {
        case 'skill-barrier':
            player.barrierTimer = 300; // 5秒
            addLog("BARRIER_DEPLOYED", "hack");
            break;
        case 'skill-all-bomb':
            createExplosion(canvas.width / 2, canvas.height / 2, '#fff', 20);
            enemyBullets = [];
            enemies.forEach(e => e.hp -= 10);
            addLog("WIPE_OUT_BOMB", "hack");
            break;
        case 'skill-damage-enemy':
            createExplosion(canvas.width / 2, canvas.height / 2, '#ff0', 10);
            enemies.forEach(e => e.hp -= 20);
            addLog("GLOBAL_DAMAGE_WAVE", "hack");
            break;
        case 'skill-time-stop':
            player.isTimeStopped = true;
            setTimeout(() => { player.isTimeStopped = false; }, 3000);
            addLog("TIME_STASIS", "hack");
            break;
        case 'skill-warp':
            let dx = 0, dy = 0;
            if (keys['ArrowLeft']) dx = -100;
            if (keys['ArrowRight']) dx = 100;
            if (keys['ArrowUp']) dy = -100;
            if (keys['ArrowDown']) dy = 100;
            player.x = Math.max(20, Math.min(canvas.width - 20, player.x + dx));
            player.y = Math.max(20, Math.min(canvas.height - 20, player.y + dy));
            createExplosion(player.x, player.y, '#0ff', 10);
            addLog("WARP_JUMP", "hack");
            break;
        case 'skill-invincible':
            player.isInvincible = true;
            setTimeout(() => { player.isInvincible = false; }, 3000);
            addLog("INVINCIBILITY_MODE", "hack");
            break;
        case 'skill-turret':
            turrets.push(new Turret(player.x, player.y));
            addLog("TURRET_DEPLOYED", "hack");
            break;
        case 'skill-decoy':
            decoys.push(new Decoy(player.x, player.y));
            addLog("DECOY_ACTIVE", "hack");
            break;
        case 'skill-blade':
            player.bladeTimer = 60; // 1秒
            addLog("BLADE_READY", "hack");
            break;
        case 'skill-portal':
            portals = [new Portal(player.x - 50, player.y, false), new Portal(player.x + 50, player.y, true)];
            addLog("PORTAL_OPEN", "hack");
            break;
    }
}

function takeDamage(amt) {
    if (player.isInvincible || player.barrierTimer > 0) {
        // バリア被弾: 镜面に回りの山を作る
        if (player.barrierTimer > 0) {
            enemyBullets.filter(eb => Math.hypot(eb.x - player.x, eb.y - player.y) < 100).forEach(eb => {
                bullets.push({
                    x: eb.x, y: eb.y, vx: -eb.vx * 1.5, vy: -eb.vy * 1.5,
                    color: '#0ff', size: 1.0, life: 120, time: 0, hitEnemies: new Map(),
                    isExplosion: player.isExplosion
                });
            });
            enemyBullets = enemyBullets.filter(eb => Math.hypot(eb.x - player.x, eb.y - player.y) >= 100);
        }
        return;
    }

    // 耐忍コンボ: HP1れぞ特殊発動
    if (player.hasEndurance && hp - amt <= 0 && hp > 1) {
        hp = 1;
        player.hasEndurance = false; // 1回かぎ
        player.isInvincible = true;
        hackGauge = 100; // ゲージ全回復
        addLog('\u26a1 耐忍発動! 無敵でゲージ充全!', 'hack');
        createExplosion(player.x, player.y, '#fff', 30);
        setTimeout(() => { player.isInvincible = false; }, 2000);
        return;
    }

    hp -= amt;
    // screenShake = 15; // REMOVED
    if (hp <= 0) {
        hp = 0;
        gameOver = true;
        showGameOver();
    }
}

function createExplosion(x, y, color, count) {
    if (particles.length > 200) count = Math.min(count, 2);
    // screenShake = Math.max(screenShake, count * 0.5); // REMOVED
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 20 + Math.random() * 20,
            maxLife: 40,
            color: color,
            size: 2 + Math.random() * 3
        });
    }
}



function createLightning(x, y, chainLimit = 5, excludedEnemies = new Set()) {
    createExplosion(x, y, '#fff', 15);

    // 範囲ダメージ (直撃)
    enemies.forEach(e => {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < 100) {
            e.hp -= 2;
            e.staticFieldTimer = 180; // 「避雷針」状態化 (3秒)
            excludedEnemies.add(e);
        }
    });

    // 「チェイン・ボルト」: 次の敵へ連鎖
    if (chainLimit > 0) {
        let nearest = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            if (!excludedEnemies.has(e)) {
                const d = Math.hypot(e.x - x, e.y - y);
                if (d < 150 && d < minDist) {
                    minDist = d;
                    nearest = e;
                }
            }
        });

        if (nearest) {
            lightningStrikes.push({ x1: x, y1: y, x2: nearest.x, y2: nearest.y, life: 10 });
            // 再帰的に次の連鎖を発生（少し遅延させるとビジュアルが良いが、今回は即時）
            createLightning(nearest.x, nearest.y, chainLimit - 1, excludedEnemies);
        }
    } else {
        // 最初のボルト（雲から）
        lightningStrikes.push({ x1: x, y1: 0, x2: x, y2: y, life: 15, isBolt: true });
    }
}

class Turret {
    constructor(x, y) {
        this.x = x; this.y = y; this.life = 600; this.lastFire = 0;
    }
    update(now) {
        this.life--;
        if (now - this.lastFire > 400) {
            this.lastFire = now;
            bullets.push({
                x: this.x, y: this.y, vx: 0, vy: -10, baseVx: 0, baseVy: -10,
                color: '#ff0', size: 0.8, life: 120, time: 0
            });
        }
        return this.life > 0;
    }
    draw() {
        ctx.fillStyle = '#444';
        ctx.strokeStyle = '#ff0';
        ctx.strokeRect(this.x - 10, this.y - 10, 20, 20);
        ctx.fillRect(this.x - 5, this.y - 5, 10, 10);
    }
}

class Decoy {
    constructor(x, y) {
        this.x = x; this.y = y; this.life = 400; this.hp = 50;
    }
    update() {
        this.life--;
        if (this.hp <= 0) return false;
        return this.life > 0;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#0ff';
        ctx.strokeRect(-15, -15, 30, 30);
        ctx.restore();
    }
}

class Portal {
    constructor(x, y, isExit) {
        this.x = x; this.y = y; this.life = 600; this.isExit = isExit;
    }
}

class Bit {
    constructor(x, y) {
        this.x = x; this.y = y;
    }
    update() {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 30) {
            playerBits += 1; // 低下 (10 -> 5)
            contactFlags.bit = true;
            updateUI();
            return true;
        }
        if (dist < 200 || player.isMagnet) {
            this.x += dx / 10;
            this.y += dy / 10;
        } else {
            this.y += 2;
        }
        return this.y > canvas.height;
    }
    draw() {
        ctx.fillStyle = '#0f0';
        ctx.fillRect(this.x - 4, this.y - 4, 8, 8);
    }
}

function updateUI() {
    const hpBar = document.getElementById('hp-bar');
    if (hpBar) hpBar.style.width = `${hp}%`;
    const scoreVal = document.getElementById('score-count');
    if (scoreVal) scoreVal.textContent = formatTime(score);
    const bitsVal = document.getElementById('bit-count'); // bits-count -> bit-count
    if (bitsVal) bitsVal.textContent = playerBits;
    const hackBar = document.getElementById('hack-bar'); // hack-fill -> hack-bar 
    if (hackBar) {
        hackBar.style.width = `${hackGauge}%`; // height -> width (HUD is horizontal)
        hackBar.style.background = hackGauge >= 100 ? '#0ff' : '#066';
    }
    const hackText = document.getElementById('hack-percentage');
    if (hackText) hackText.textContent = `${Math.floor(hackGauge)}%`;
    const hackReady = document.getElementById('hack-ready-text');
    if (hackReady) hackReady.textContent = hackGauge >= 100 ? "!! SYSTEM_READY !!" : "(GATHERING_DATA)";

    // ゴール到達率
    const goalPct = Math.min(100, (score / CLEAR_TIME) * 100);
    const goalBar = document.getElementById('goal-bar');
    if (goalBar) goalBar.style.width = `${goalPct}%`;
    const goalText = document.getElementById('goal-text');
    if (goalText) goalText.textContent = `${Math.floor(goalPct)}% 到着`;

    // HOME画面のビット表示
    const homeBitCount = document.getElementById('home-bit-count');
    if (homeBitCount) homeBitCount.textContent = playerBits;

    // Boss HUD
    const bossHud = document.getElementById('boss-hud');
    const boss = enemies.find(e => e.isBoss);
    if (boss && bossHud) {
        bossHud.classList.remove('hidden');
        const bossName = document.getElementById('boss-name');
        if (bossName) bossName.textContent = `BOSS_DETECTED: [${boss.name}]`;
        const bossHpBar = document.getElementById('boss-hp-bar');
        if (bossHpBar) bossHpBar.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    } else if (bossHud) {
        bossHud.classList.add('hidden');
    }
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
}

function addLog(msg, type = 'info') {
    const logBox = document.getElementById('log-container'); // log-box -> log-container
    if (!logBox) return;
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    div.textContent = `> ${msg}`;
    logBox.prepend(div);
    if (logBox.children.length > 5) logBox.lastChild.remove();
}

function saveGameState() {
    localStorage.setItem('hacker_shooter_bits', playerBits);
    localStorage.setItem('hacker_shooter_loadout', JSON.stringify(activeLoadout));
}

function gameClear() {
    gameActive = false;
    document.getElementById('clear-screen').classList.remove('hidden');
    document.getElementById('clear-time-val').textContent = formatTime(score);
    saveGameState();
    addLog("MISSION_COMPLETE", "hack");
}

class Enemy {
    constructor() {
        this.x = Math.random() * (canvas.width - 40) + 20;
        this.y = -20;

        let baseHp = 1 + Math.floor(playerPowerLevel * 0.8);
        if (bossesDefeated >= 1) {
            baseHp = Math.max(3, baseHp); // 1体目のボス撃破後は最低でも弾3発分の体力に
        }
        this.speed = 2 + Math.random() * 2;
        this.color = '#0ff';
        this.type = 'normal';
        this.w = 30;
        this.h = 30;

        // ボス撃破進行に応じた敵バリエーション
        if (bossesDefeated === 0) {
            this.hp = baseHp;
        } else if (bossesDefeated === 1) {
            let rand = Math.random();
            if (rand < 0.4) {
                this.hp = baseHp * 4;       // タンク
                this.speed *= 0.5;
                this.color = '#f80';
                this.type = 'tank';
            } else {
                this.hp = baseHp * 1.5;     // スピード
                this.speed *= 1.8;
                this.color = '#ff0';
                this.type = 'speed';
            }
        } else {
            let rand = Math.random();
            if (rand < 0.3) {
                this.hp = baseHp * 6;       // スーパータンク
                this.speed *= 0.6;
                this.color = '#f80';
                this.type = 'tank';
            } else if (rand < 0.6) {
                this.hp = baseHp * 2.5;     // 特攻スピード
                this.speed *= 2.5;
                this.color = '#ff0';
                this.type = 'speed';
            } else {
                this.hp = baseHp * 3;       // シューター
                this.speed *= 0.8;
                this.color = '#f0f';
                this.type = 'shooter';
                this.fireTimer = Math.random() * 60;
            }
        }

        // 全体難易度の底上げ
        this.hp = Math.ceil(this.hp * (1 + bossesDefeated * 0.5));
        this.maxHp = this.hp;

        this.angle = 0;
        this.freezeTimer = 0;
        this.poisonTimer = 0;
        this.staticFieldTimer = 0;
        this.vulnerableTimer = 0;
        this.noiseLevel = 0;
        this.isSelfDestruct = false;
    }
    update(speedMult) {
        if (this.freezeTimer > 0) {
            this.freezeTimer--;
            speedMult = 0;
        }
        if (this.poisonTimer > 0) {
            this.poisonTimer--;
            this.hp -= 0.01;
            if (Math.random() < 0.1) createExplosion(this.x, this.y, '#0f0', 2);
        }

        // 「避雷針」状態: 周囲に放電ダメージ
        if (this.staticFieldTimer > 0) {
            this.staticFieldTimer--;
            enemies.forEach(e => {
                if (e !== this) {
                    const d = Math.hypot(e.x - this.x, e.y - this.y);
                    if (d < 80) e.hp -= 0.05; // 微弱ダメージ
                }
            });
            if (Math.random() < 0.2) {
                lightningStrikes.push({
                    x1: this.x, y1: this.y,
                    x2: this.x + (Math.random() - 0.5) * 40,
                    y2: this.y + (Math.random() - 0.5) * 40,
                    life: 5
                });
            }
        }

        if (this.vulnerableTimer > 0) this.vulnerableTimer--;

        // Malware Stack: 自爆ロジック
        if (this.isSelfDestruct && Math.random() < 0.3) {
            enemyBullets.push({
                x: this.x, y: this.y,
                vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                color: '#f00', size: 1.0, life: 60
            });
            this.hp -= 0.1;
        }

        // Shooterの射撃アクション
        if (this.type === 'shooter' && !player.isTimeStopped) {
            this.fireTimer--;
            if (this.fireTimer <= 0) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                enemyBullets.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
                    color: '#f0f', size: 1.0, life: 100
                });
                this.fireTimer = 100 + Math.random() * 60;
            }
        }

        this.y += this.speed * speedMult;
        this.angle += 0.05 * speedMult;

        // 全てのブラックホールに吸い寄せられる
        vortices.forEach(v => {
            const dx = v.x - this.x;
            const dy = v.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1200) { // 画面全体をカバー
                // 吸引力を大幅強化 (15)
                this.x += (dx / dist) * 15;
                this.y += (dy / dist) * 15;
            }
        });
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.freezeTimer > 0) {
            ctx.strokeStyle = '#0af';
            // ctx.shadowBlur = 15;
            // ctx.shadowColor = '#0ff';
        } else if (this.poisonTimer > 0) {
            ctx.strokeStyle = '#0f0';
            // ctx.shadowBlur = 10;
            // ctx.shadowColor = '#0f0';
        } else {
            ctx.strokeStyle = this.isShrink ? '#088' : '#0ff';
        }
        if (this.isShrink) ctx.scale(0.6, 0.6);

        // 避雷針エフェクト
        if (this.staticFieldTimer > 0) {
            // ctx.shadowBlur = 10;
            // ctx.shadowColor = '#fff';
            ctx.strokeStyle = '#fff';
        }

        ctx.lineWidth = 2;
        ctx.beginPath();

        // 敵タイプ別の描画形状
        if (this.type === 'tank') {
            ctx.lineWidth = 3;
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 136, 0, 0.3)';
        } else if (this.type === 'speed') {
            ctx.moveTo(0, 15);
            ctx.lineTo(12, -12);
            ctx.lineTo(-12, -12);
            ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        } else if (this.type === 'shooter') {
            ctx.moveTo(-15, -12);
            ctx.lineTo(15, -12);
            ctx.lineTo(0, 15);
            ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
        } else {
            ctx.moveTo(0, -16);
            ctx.lineTo(16, 0);
            ctx.lineTo(0, 16);
            ctx.lineTo(-16, 0);
            ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // Malware Noise
        if (this.noiseLevel > 0) {
            ctx.fillStyle = '#f00';
            for (let i = 0; i < this.noiseLevel; i++) {
                ctx.fillRect((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 2, 2);
            }
        }

        // Vulnerable marker
        if (this.vulnerableTimer > 0) {
            ctx.strokeStyle = '#f0f';
            ctx.strokeRect(-18, -18, 36, 36);
        }

        // 内部パーツ
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(-5, -5, 10, 10);

        ctx.restore();
    }
    die() {
        createExplosion(this.x, this.y, this.isShrink ? '#088' : '#0ff', 15);
        if (player.hasFireworks) {
            const colors = ['#f00', '#ff0', '#0ff', '#f0f', '#fff'];
            for (let i = 0; i < 5; i++) createExplosion(this.x, this.y, colors[i], 10);
        }
        // ビット獲得量を固定 (2ビット)
        const count = 2;
        for (let i = 0; i < count; i++) bits.push(new Bit(this.x, this.y));

        // ブラックホール設置（パッシブ）
        if (player.hasBlackHole && Math.random() < 0.2) {
            createVortex(this.x, this.y);
        }

        // Phase 2: Echo Sonar (残響)
        if (player.hasEcho) {
            createShockwave(this.x, this.y);
        }

        // Phase 2: Reboot Step (再起動)
        if (player.hasReboot) {
            player.isInvincible = true;
            player.invincibleTimer = 60; // 1s
            player.disarmedTimer = 60;   // 1s disarm
            addLog("SYSTEM_REBOOTING...", "hack");
        }
    }
}

function createShockwave(x, y) {
    particles.push({
        x: x, y: y, type: 'shockwave', radius: 10, maxRadius: 150, life: 30
    });
}

class Boss extends Enemy {
    constructor(hp, name) {
        super();
        this.x = canvas.width / 2;
        this.y = -100;
        this.hp = hp;
        this.maxHp = hp;
        this.name = name;
        this.isBoss = true;
        this.state = 'enter';
        this.patternTimer = 0;
        this.pattern = 0;
        this.targetY = 80;
        this.angle = 0;
        this.speed = 0;
    }

    update(speedMult) {
        if (this.state === 'enter') {
            this.y += 1;
            if (this.y >= this.targetY) this.state = 'active';
            return;
        }

        this.patternTimer++;
        this.angle += 0.02;

        if (this.patternTimer % 300 === 0) {
            this.pattern = (this.pattern + 1) % 3;
        }

        // Attack patterns (Buffed Aggression)
        if (this.pattern === 0) { // Fan
            if (this.patternTimer % 45 === 0) {
                for (let i = -2; i <= 2; i++) {
                    const angle = Math.atan2(player.y - this.y, player.x - this.x) + i * 0.3;
                    enemyBullets.push({
                        x: this.x, y: this.y,
                        vx: Math.cos(angle) * 3, vy: Math.sin(angle) * 3,
                        color: '#f0f', size: 1.5, life: 300
                    });
                }
            }
        } else if (this.pattern === 1) { // Rotate
            if (this.patternTimer % 8 === 0) {
                const count = 3;
                for (let i = 0; i < count; i++) {
                    const angle = this.angle * 2 + (i * Math.PI * 2 / count);
                    enemyBullets.push({
                        x: this.x, y: this.y,
                        vx: Math.cos(angle) * 2.5, vy: Math.sin(angle) * 2.5,
                        color: '#ff0', size: 1.2, life: 300
                    });
                }
            }
        } else if (this.pattern === 2) { // Sniper
            if (this.patternTimer % 60 === 0) {
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                enemyBullets.push({
                    x: this.x, y: this.y,
                    vx: Math.cos(angle) * 7, vy: Math.sin(angle) * 7,
                    color: '#f00', size: 2.0, life: 300, isSniper: true
                });
            }
        }

        this.x += Math.sin(this.patternTimer / 50) * 1.5;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 3;
        // ctx.shadowBlur = 15;
        // ctx.shadowColor = '#f0f';

        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const r = i % 2 === 0 ? 50 : 25;
            const a = i * Math.PI * 2 / 12;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 0, 255, 0.2)';
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(-15, -15, 30, 30);

        ctx.restore();
    }

    die() {
        createExplosion(this.x, this.y, '#f0f', 50);
        bossesDefeated++;

        let memIncrease = 50;
        if (bossesDefeated === 2) {
            memIncrease = 150; // 2体目ボス撃破時は大幅ボーナス
        }
        MAX_HACK_MEMORY += memIncrease;
        updateUI();

        if (bossesDefeated >= 3) {
            gameClear();
        } else {
            addLog(`BOSS_DESTROYED: [${this.name}]`, 'hack');
            addLog(`SYSTEM_UPDATE: MAX_MEMORY EXPANDED TO ${MAX_HACK_MEMORY}MB`, 'sys');
        }
        for (let i = 0; i < 15; i++) bits.push(new Bit(this.x, this.y)); // 最適化のため低下 (40 -> 15)
    }
}

function createVortex(x, y) {
    if (vortices.length >= 1) return; // 1つ消えるまで次を置けない
    vortices.push({ x: x, y: y, life: 300, radius: 0 });
}
function startGame() {
    hp = MAX_HP;
    hackGauge = 0;
    score = 0;
    gameOver = false;
    gameActive = true;
    isHacking = false;

    player.activeModules = [];
    player.barrierTimer = 0;
    player.isTimeStopped = false;
    player.isInvincible = false;
    player.invincibleTimer = 0;
    player.disarmedTimer = 0;
    player.advancedSubShips = 0;

    bossesDefeated = 0;
    nextBossScore = 60;
    player.bossTimeElapsed = 0;
    playerPowerLevel = 0;
    currentHackMemory = 0;
    MAX_HACK_MEMORY = 400;

    // システムビット初期化 (セッション毎に800にリセット)
    playerBits = 800;
    updateUI();

    applyStaticStats(); // 初期ステータス適用

    slowTimer = 0;
    startTime = Date.now();
    enemies = []; bullets = []; enemyBullets = []; bits = []; particles = []; vortices = [];
    turrets = []; decoys = []; portals = []; lightningStrikes = [];

    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('side-hud').classList.remove('hidden');
    document.getElementById('controls-guide').classList.remove('hidden');
    document.getElementById('clear-screen').classList.add('hidden');

    addLog("システム起動完了。");
    updateUI();
}

// 追加: クリア画面ボタン
document.getElementById('clear-retry-btn').onclick = startGame;
document.getElementById('clear-home-btn').onclick = backToHome;

function backToHome() {
    gameActive = false;
    document.getElementById('home-screen').classList.remove('hidden');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('clear-screen').classList.add('hidden');
    document.getElementById('side-hud').classList.add('hidden');
    document.getElementById('controls-guide').classList.add('hidden');
}

// モバイル操作の実装
if (isMobile) {
    const leftBtn = document.getElementById('move-left-btn');
    const rightBtn = document.getElementById('move-right-btn');
    const shootBtn = document.getElementById('shoot-btn');
    const hackBtn = document.getElementById('hack-btn');

    if (leftBtn) {
        leftBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['ArrowLeft'] = true; });
        leftBtn.addEventListener('touchend', e => { e.preventDefault(); keys['ArrowLeft'] = false; });
    }
    if (rightBtn) {
        rightBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['ArrowRight'] = true; });
        rightBtn.addEventListener('touchend', e => { e.preventDefault(); keys['ArrowRight'] = false; });
    }
    if (shootBtn) {
        shootBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['a'] = true; });
        shootBtn.addEventListener('touchend', e => { e.preventDefault(); keys['a'] = false; });
    }
    if (hackBtn) {
        hackBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['s'] = true; });
        hackBtn.addEventListener('touchend', e => { e.preventDefault(); keys['s'] = false; });
    }
}

// --- 5. UI設定 & 操作 ---
// Loadout/Collection logic removed

const navStart = document.getElementById('nav-start');
if (navStart) navStart.onclick = startGame;

document.getElementById('retry-button').onclick = startGame;
document.getElementById('back-home-button').onclick = backToHome;
document.getElementById('clear-retry-btn').onclick = startGame;
document.getElementById('clear-home-btn').onclick = backToHome;

document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('home-screen').classList.remove('hidden');
});

// toggleLoadout removed

function pullGacha() {
    addLog("ガチャ機能は廃止されました。", "hack");
}

document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('home-screen').classList.remove('hidden');
});

// --- 6. コアループ ---
function update() {
    if (!gameActive || gameOver || isHacking) return;
    const now = Date.now();

    if (isPaused) {
        // ポーズ中は経過時間が進まないように開始時間をずらす
        startTime += (now - (lastTime || now));
        lastTime = now;
        return;
    }

    // 接触フラグリセット
    contactFlags.player = false;
    contactFlags.enemy = false;
    contactFlags.bit = false;
    contactFlags.bullet = false;
    contactFlags.blackhole = false;

    // ブラックホール接触判定
    vortices.forEach(v => {
        if (Math.hypot(v.x - player.x, v.y - player.y) < v.radius) {
            contactFlags.blackhole = true;
        }
    });

    // 自機接触フラグの統合 (何かに触れていれば真)
    if (contactFlags.enemy || contactFlags.bit || contactFlags.bullet || contactFlags.blackhole) {
        contactFlags.player = true;
    }

    // Boss戦中は時間を停止 (Mission Timer 停止)
    const isBossActive = enemies.some(e => e.isBoss);
    if (!isBossActive) {
        score = (now - startTime - (player.bossTimeElapsed || 0)) / 1000;
    } else {
        player.bossTimeElapsed = (player.bossTimeElapsed || 0) + (now - lastTime);
    }
    lastTime = now;
    updateUI(); // スコア更新後にUI反映

    // 自動での早期クリア判定を削除 (ボス3体目撃破でクリアになる)

    // 状態評価とキャッシュ更新
    updateConditionCache();
    applyStaticStats(); // ベース値を一旦戻す
    applyDynamicLogic(); // ロジックで上書き

    if (player.autoHeal > 0 && hp < MAX_HP) {
        hp = Math.min(MAX_HP, hp + player.autoHeal);
    }
    if (player.barrierTimer > 0) player.barrierTimer--;
    if (bulletHitRecently > 0) bulletHitRecently--; // タイマーのデクリメント追加

    // 決死の覚悟 [passive-blood-pact] (自傷ダメージ)
    if (player.isBloodPact && gameActive && !gameOver) {
        hp -= 0.05; // 毎フレーム微減
        if (hp <= 0) takeDamage(0.1); // 死なないようにtakeDamage経由で処理
    }

    updateUI();

    // プレイヤー移動
    let moveX = 0;
    let moveY = 0;
    if (keys['ArrowLeft']) moveX -= player.speed;
    if (keys['ArrowRight']) moveX += player.speed;
    if (keys['ArrowUp']) moveY -= player.speed;
    if (keys['ArrowDown']) moveY += player.speed;

    player.x += moveX;
    player.y += moveY;
    player.moveX = moveX; // Track for Inertia Drive
    player.moveY = moveY;
    player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
    player.y = Math.max(20, Math.min(canvas.height - 20, player.y));

    // Aキー: 射撃
    if (keys['a'] || keys['A'] || player.autoFire) {
        if (player.hasCompress) {
            player.chargeLevel = Math.min(100, (player.chargeLevel || 0) + (player.autoFire ? 2 : 1) * (1 + (player.fireRateBonus || 0)));
        } else {
            const shootReady = !player.lastFireTime || now - player.lastFireTime > player.fireRate;
            if (shootReady) {
                fireBullets(now);
                player.lastFireTime = now;
            }
        }
    } else {
        if (player.hasCompress && player.chargeLevel > 20) {
            fireBullets(now, player.chargeLevel / 100);
            player.chargeLevel = 0;
            player.lastFireTime = now;
        } else {
            player.chargeLevel = 0;
        }
    }

    // Reboot Step: Invincibility Timer
    if (player.invincibleTimer > 0) {
        player.invincibleTimer--;
        if (player.invincibleTimer <= 0) player.isInvincible = false;
    }

    // Reboot Step: Disarm
    if (player.disarmedTimer > 0) {
        player.disarmedTimer--;
        player.lastFireTime = now; // Prevent firing
    }

    // Sキー: ハッキング
    if (keys['s'] || keys['S']) {
        if (hackGauge >= 100 && !isHacking) {
            openHackingScreen();
        }
    }

    // Dキー: 特殊スキル発動
    if (keys['d'] || keys['D']) {
        if (now - (player.lastSkillTime || 0) > 1000) { // 1秒リピート防止
            player.activeModules.forEach(mod => {
                if (mod.id.startsWith('skill-') && mod.id !== 'skill-option') {
                    triggerSkill(mod.id, mod.param);
                }
            });
            player.lastSkillTime = now;
        }
    }

    // 敵スポーン (難易度大幅アップ: レベルとボス撃破数で相乗効果)
    const dynamicSpawnRate = ENEMY_SPAWN_RATE * (1 + playerPowerLevel * 2.0) * (1 + bossesDefeated * 0.8);
    if (Math.random() < dynamicSpawnRate) {
        enemies.push(new Enemy());
    }

    // Bossスポーン (Buffed HP & Scaling)
    if (score >= nextBossScore && bossesDefeated < 3 && !enemies.some(e => e.isBoss)) {
        // Boss Spawn (HP scaled with playerPowerLevel and loops)
        let hpMultiplier = (1 + playerPowerLevel * 0.8) * (1 + bossesDefeated * 0.5);
        let hp = 200 * hpMultiplier; // Boss 1 
        if (bossesDefeated === 1) hp = 400 * hpMultiplier; // Boss 2
        if (bossesDefeated === 2) hp = 800 * hpMultiplier; // Boss 3
        const names = ["GATEKEEPER", "SENTINEL", "CORE_GUARDIAN"];
        enemies.push(new Boss(hp, names[bossesDefeated]));
        addLog(`!! WARNING: BOSS_SIGNAL_DETECTED !!`, 'error');
        nextBossScore += 60;
    }

    // 更新処理
    updateProjectiles(now);
    updateEnemies();
    updateBits();
    updateParticles();

    // エンティティ更新
    turrets = turrets.filter(t => t.update(now));
    decoys = decoys.filter(d => d.update());
    portals = portals.filter(p => { p.life--; return p.life > 0; });
    lightningStrikes = lightningStrikes.filter(l => { l.life--; return l.life > 0; });

    // ハッキング [system-hacking] (自機周囲の敵弾をハック)
    if (player.hasHacking) {
        enemyBullets.forEach(eb => {
            const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
            if (dist < 80) {
                // 自分弾に変換 (Hacker Shooter style)
                bullets.push({
                    x: eb.x, y: eb.y, vx: -eb.vx, vy: -eb.vy * 1.5,
                    color: '#0ff', size: 1.0, life: 120, time: 0,
                    // プレイヤーの強化属性を乗せる (Combo 1: 弾幕反射型)
                    isExplosion: player.isExplosion,
                    isChain: player.isChain || player.isChainAdv,
                    isGrowing: player.isGrowing,
                    isDrill: player.isDrill,
                    damage: player.isBloodPact ? 3.0 : 1.0,
                    hitEnemies: new Map()
                });
                eb.y = 1000; // 消去
            }
        });
    }

    if (bulletHitRecently > 0) bulletHitRecently--;

    // ブレード [skill-blade] (近接攻撃 & 弾消し)
    if (player.bladeTimer > 0) {
        player.bladeTimer--;
        // 攻撃範囲
        const bx = player.x; const by = player.y - 40;
        enemyBullets = enemyBullets.filter(eb => {
            if (Math.hypot(eb.x - bx, eb.y - by) < 60) return false;
            return true;
        });
        enemies.forEach(e => {
            if (Math.hypot(e.x - bx, e.y - by) < 80) e.hp -= 0.5;
        });
        createExplosion(bx + (Math.random() - 0.5) * 40, by + (Math.random() - 0.5) * 40, '#fff', 2);
    }

    // ブラックホール実体
    vortices = vortices.filter(v => {
        v.radius = Math.min(60, v.radius + 1.5);
        v.life--;
        // 敵弾消去 + ブラックホールコンボ: 吸収数分だけHP回復
        enemyBullets = enemyBullets.filter(eb => {
            if (Math.hypot(eb.x - v.x, eb.y - v.y) < v.radius) {
                hp = Math.min(MAX_HP, hp + 0.5); // 吸収どとに回復
                return false;
            }
            return true;
        });
        return v.life > 0;
    });

    // デコイシナジー: デコイがある間、プレイヤーのダメージが2倍
    player.decoyDamageBoost = decoys.length > 0 ? 2.0 : 1.0;

    // 高度サブ機の射撃ロジック
    if (player.advancedSubShips > 0 && now % 400 < 20 && enemies.length > 0) {
        for (let i = 0; i < player.advancedSubShips; i++) {
            const angle = (now / 500) + (i * Math.PI * 2 / player.advancedSubShips);
            const sx = player.x + Math.cos(angle) * 45;
            const sy = player.y + Math.sin(angle) * 45;
            const target = enemies[Math.floor(Math.random() * enemies.length)];
            const dx = target.x - sx;
            const dy = target.y - sy;
            const dist = Math.hypot(dx, dy);
            bullets.push({
                x: sx, y: sy,
                vx: (dx / dist) * 10, vy: (dy / dist) * 10,
                color: '#0ff', size: 1.0, life: 80
            });
        }
    }
}

function fireBullets(now, chargeScale = 0) {
    let bulletSpeed = 10 * player.bulletSpeedMult;
    let bulletSize = 1 * player.bulletSizeMult;
    let damageMult = (player.isBloodPact ? (player.bloodPactDamage || 4.0) : 1.0);

    let count = player.multiShot;
    updateUI(); // 表示状態を更新

    // Binary Trade (等価交換)
    if (player.hasBinaryTrade && playerBits > 0) {
        if (playerBits % 2 === 0) damageMult *= 2.0;
        else count += 2;
    }

    // Inertia Drive (慣性)
    if (player.hasInertia) {
        const speed = Math.hypot(player.moveX || 0, player.moveY || 0);
        damageMult *= (1 + speed / 10);
    }

    // Random Access (乱数)
    if (player.hasRandom) {
        const rng = 0.5 + Math.random() * 2.5; // 0.5 ~ 3.0
        damageMult *= rng;
        bulletSpeed *= (0.8 + Math.random() * 0.4);
        bulletSize *= (0.8 + Math.random() * 0.4);
    }

    // Data Compression (圧縮)
    if (chargeScale > 0) {
        damageMult *= (1 + chargeScale * 5);
        bulletSize *= (1 + chargeScale * 3);
        count = 1; // 1つに凝縮
    }
    const spread = 0.2;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spread;
        const angle = -Math.PI / 2 + offset;
        const vx = Math.cos(angle) * bulletSpeed;
        const vy = Math.sin(angle) * bulletSpeed;

        bullets.push({
            x: player.x, y: player.y - 20,
            vx, vy, baseVx: vx, baseVy: vy,
            color: player.isLaser ? '#0ff' : (player.isExplosion ? '#f50' : '#0f4'),
            size: bulletSize,
            life: 240, time: 0,

            isPiercing: player.isPiercing,
            isStationary: player.isStationary,
            isSplitting: player.isSplitting,
            isBouncing: player.isBouncing,
            isRotating: player.isRotating,
            isBoomerang: player.isBoomerang,
            isStepAccel: player.isStepAccel,
            isWave: player.isWave,
            isExplosion: player.isExplosion,
            isAttract: player.isAttract,
            isChain: player.isChain,
            isFreeze: player.isFreeze,
            isPoison: player.isPoison,
            isLaser: player.isLaser,
            isHoming: player.isHoming,
            isGrowing: player.isGrowing,
            isDrill: player.isDrill, // 追加
            isBloodPact: player.isBloodPact, // 追加

            // --- 新規プロパティ継承 ---
            isChainAdv: player.isChainAdv,
            isGravity: player.isGravity,
            isReflecting: player.isReflecting,
            isShrink: player.isShrink,
            isLightning: player.isLightning,
            bounces: player.isReflecting ? 5 : 0,

            damage: damageMult,
            size: bulletSize,

            originX: player.x, originY: player.y,
            hitEnemies: new Map(),

            // --- Phase 2: NEW PROPERTIES ---
            hasLatency: player.hasLatency,
            latencyTrail: [],
            hasRepel: player.hasRepel
        });
    }

    if (player.isRearShot) {
        const angle = Math.PI / 2;
        bullets.push({
            x: player.x, y: player.y + 20,
            vx: Math.cos(angle) * bulletSpeed, vy: Math.sin(angle) * bulletSpeed,
            baseVx: 0, baseVy: bulletSpeed,
            color: '#f0f', size: 1.0, life: 180, time: 0
        });
    }

    // サブ機の射撃もプロパティ継承
    for (let i = 0; i < player.subShips; i++) {
        const offset = (i + 1) * 30 * (i % 2 === 0 ? 1 : -1);
        bullets.push({
            x: player.x + offset, y: player.y,
            vx: 0, vy: -bulletSpeed, baseVx: 0, baseVy: -bulletSpeed,
            color: '#0f4', size: bulletSize, life: 180, time: 0,
            isPiercing: player.isPiercing, isExplosion: player.isExplosion
        });
    }
}

function updateProjectiles(now) {
    // Phase 2: Synchro Link (同期)
    const synchroActive = player.hasSynchro && bullets.length >= 5;

    // プレイヤーの弾をコインに変える (システム)
    if (player.bulletToCoin) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const eb = enemyBullets[i];
            if (Math.hypot(eb.x - player.x, eb.y - player.y) < 60) {
                bits.push(new Bit(eb.x, eb.y));
                enemyBullets.splice(i, 1);
            }
        }
    }

    // プレイヤー弾
    bullets = bullets.filter(b => {
        b.time++;
        b.justHit = false;

        // Phase 2: Latency Bomb Trail
        if (b.hasLatency && b.time % 3 === 0) {
            b.latencyTrail.push({ x: b.x, y: b.y, life: 60 });
        }

        // Phase 2: Synchro Link (同期)
        if (synchroActive) {
            let target = enemies[0];
            if (target) {
                const angle = Math.atan2(target.y - b.y, target.x - b.x);
                b.vx += (Math.cos(angle) * 12 - b.vx) * 0.1;
                b.vy += (Math.sin(angle) * 12 - b.vy) * 0.1;
            }
        }

        applyDynamicLogic(b); // 毎フレームのロジック評価 (IF ALWAYS 等)

        // --- 挙動（フォーム・ブロック）の適用 ---
        if (b.isRotating) {
            // 自機の周りを回転 (Combo 2: 回転ブラックホール・バリア)
            const orbitRadius = 60 + Math.sin(b.time * 0.05) * 20;
            const orbitAngle = (b.time * 0.1) + (b.vx * 0.01);
            b.x = player.x + Math.cos(orbitAngle) * orbitRadius;
            b.y = player.y + Math.sin(orbitAngle) * orbitRadius;

            // 回転中も引き寄せ (Combo 2)
            if (b.isAttract || b.isGravity) {
                enemies.forEach(e => {
                    const d = Math.hypot(e.x - b.x, e.y - b.y);
                    if (d < 150) {
                        e.x += (b.x - e.x) * 0.05;
                        e.y += (b.y - e.y) * 0.05;
                    }
                });
            }
        } else if (b.isStationary) {
            // その場に留まる
            b.vx = 0; b.vy = 0;
            b.x += b.vx; b.y += b.vy;
        } else if (b.isWave) {
            // 波形移動
            const waveOffset = Math.sin(b.time * 0.2) * (b.isGrowing ? 20 : 8);
            const perpX = -b.baseVy;
            const perpY = b.baseVx;
            const mag = Math.hypot(perpX, perpY) || 1;
            b.x += (b.vx + (perpX / mag) * waveOffset);
            b.y += (b.vy + (perpY / mag) * waveOffset);
        } else if (b.isBoomerang) {
            // 往復 (Combo 3: 無限ブーメラン)
            // 60フレームごとに進行方向を反転させて無限に往復させる
            if (Math.floor(b.time / 60) % 2 === 0) {
                b.x += b.vx; b.y += b.vy;
            } else {
                b.x -= b.vx; b.y -= b.vy;
            }

            // 巨大化ブーメランならさらにヒット範囲拡大
            if (b.isGrowing) b.size = Math.min(5, b.size + 0.05);
        } else if (b.isStepAccel) {
            // 時間差加速 (Combo 4: 時限式・ボム)
            // 最初はゆっくり、30フレーム後に一気に加速
            const isWait = b.time < 40;
            const speedFact = isWait ? 0.2 : 3.5;
            b.x += b.vx * speedFact; b.y += b.vy * speedFact;

            // 待機中はわずかに震える演出
            if (isWait) { b.x += Math.sin(b.time) * 2; b.y += Math.cos(b.time) * 2; }
        } else if (b.isHoming) {
            // ホーミング (Combo 1: 追尾)
            let target = null;
            let minDist = 1000;
            for (let e of enemies) {
                const d = Math.hypot(e.x - b.x, e.y - b.y);
                if (d < minDist) { minDist = d; target = e; }
            }
            if (target) {
                const angle = Math.atan2(target.y - b.y, target.x - b.x);
                b.vx += Math.cos(angle) * 1.5;
                b.vy += Math.sin(angle) * 1.5;
                const speed = Math.hypot(b.vx, b.vy);
                const maxS = 12;
                if (speed > maxS) { b.vx = (b.vx / speed) * maxS; b.vy = (b.vy / speed) * maxS; }
                b.x += b.vx; b.y += b.vy;
            } else if (b.isBouncing || b.isReflecting) {
                // 敵がいない時はバウンドに任せる
                b.x += b.vx; b.y += b.vy;
            } else {
                b.x += b.vx; b.y += b.vy;
            }
        } else if (b.isLaser) {
            b.y -= 25;
        } else {
            b.x += b.vx; b.y += b.vy;
        }

        // バウンド判定 [isReflecting]
        if (b.isReflecting && b.bounces > 0) {
            if (b.x < 0 || b.x > canvas.width) { b.vx *= -1; b.bounces--; createExplosion(b.x, b.y, b.color, 3); }
            if (b.y < 0 || b.y > canvas.height) { b.vy *= -1; b.bounces--; createExplosion(b.x, b.y, b.color, 3); }
        } else if (b.isBouncing) {
            if (b.x < 0 || b.x > canvas.width) b.vx *= -1;
            if (b.y < 0 || b.y > canvas.height) b.vy *= -1;
        }

        // ポータル判定 [hasPortal]
        if (portals.length >= 2) {
            const pin = portals[0]; const pout = portals[1];
            if (Math.hypot(b.x - pin.x, b.y - pin.y) < 20 && !b.portalled) {
                b.x = pout.x; b.y = pout.y; b.portalled = true;
            }
        }

        // 重力弾 [isGravity]
        if (b.isGravity) {
            enemies.forEach(e => {
                const d = Math.hypot(e.x - b.x, e.y - b.y);
                if (d < 150) {
                    e.x += (b.x - e.x) * 0.05 * (1 - d / 150);
                    e.y += (b.y - e.y) * 0.05 * (1 - d / 150);
                }
            });
        }

        // 吸い寄せ面（弾が敵を引き寄せる）
        if (b.isAttract) {
            enemies.forEach(e => {
                const d = Math.hypot(e.x - b.x, e.y - b.y);
                if (d < 120) {
                    e.x += (b.x - e.x) * 0.03;
                    e.y += (b.y - e.y) * 0.03;
                }
            });
        }

        if (b.y < -150 || b.y > canvas.height + 150 || b.x < -150 || b.x > canvas.width + 150 || b.life-- <= 0) {
            // Latency Bomb Explosion
            if (b.hasLatency && b.latencyTrail.length > 0) {
                b.latencyTrail.forEach(p => {
                    createExplosion(p.x, p.y, '#f00', 3);
                    enemies.forEach(e => {
                        if (Math.hypot(e.x - p.x, e.y - p.y) < 50) e.hp -= 2;
                    });
                });
            }
            return false;
        }

        // 當たり判定
        for (let e of enemies) {
            if (Math.hypot(e.x - b.x, e.y - b.y) < 20 + b.size * 5) {
                // 多段ヒット判定 (ドリル)
                if (b.isDrill) {
                    const lastHit = b.hitEnemies.get(e) || 0;
                    if (b.time - lastHit < 10) continue; // 10フレーム間隔でヒット
                    b.hitEnemies.set(e, b.time);
                }

                // 特殊効果
                if (b.isFreeze) e.freezeTimer = 180;
                if (b.isPoison) e.poisonTimer = 300;

                if (b.isChainAdv || b.isChain) {
                    const jumpDist = b.isChainAdv ? 180 : 120;
                    enemies.forEach(e2 => {
                        if (e !== e2 && Math.hypot(e2.x - e.x, e2.y - e.y) < jumpDist) {
                            e2.hp -= (b.isChainAdv ? 1.0 : 0.5) * (b.damage || 1);
                            createExplosion(e2.x, e2.y, '#0ff', 2);
                            // 雷撃ビジュアル (簡易)
                            lightningStrikes.push({ x1: e.x, y1: e.y, x2: e2.x, y2: e2.y, life: 10 });
                        }
                    });
                }

                if (b.isShrink) {
                    e.isShrink = true;
                    e.hp -= 1;
                }

                if (b.isLightning) {
                    createLightning(b.x, b.y);
                }

                // ダメージ適用 (Blood Pact・Drillの係数 + デコイシナジー + 残響)
                const damage = (b.damage || 1) * (player.decoyDamageBoost || 1) * (e.vulnerableTimer > 0 ? 1.5 : 1.0);
                e.hp -= damage;

                // Malware Stack (浸食)
                if (player.hasMalware) {
                    e.noiseLevel = (e.noiseLevel || 0) + 1;
                    if (e.noiseLevel > 30) e.isSelfDestruct = true;
                }
                bulletHitRecently = 10;
                b.justHit = true; // 今回のフレームでヒットしたフラグ

                // 即時ロジック評価 (IF 敵に当たった THEN ...)
                applyDynamicLogic(b);

                if (b.isExplosion) {
                    createExplosion(b.x, b.y, '#f50', 15);
                    // 反射ボムコンボ：反射するごとに爆発する
                    if (!b.isReflecting && !b.isBouncing) {
                        if (!b.isDrill) return false; // ドリルでなければ消滅
                    }

                    // 反射中の爆発ダメージ
                    enemies.forEach(e2 => {
                        if (Math.hypot(e2.x - b.x, e2.y - b.y) < 120 && e !== e2) {
                            e2.hp -= 1 * (b.damage || 1);
                        }
                    });
                }

                if (b.isSplitting) {
                    for (let j = 0; j < 2; j++) {
                        // 子弾への全プロパティ継承 (完璧なコピー)
                        const child = Object.assign({}, b);
                        child.vx = (Math.random() - 0.5) * 12;
                        child.vy = (Math.random() - 0.5) * 12;
                        child.life = 120;
                        child.time = 0;
                        child.isSplitting = false;
                        child.hitEnemies = new Map(); // ヒット履歴リセット
                        bullets.push(child);
                    }
                    if (!b.isDrill) return false; // ドリルでなければ消滅
                }

                if (!b.isPiercing && !b.isLaser && !b.isDrill) return false;
            }
        }
        return true;
    });

    // 敵弾
    enemyBullets = enemyBullets.filter(eb => {
        eb.x += eb.vx * (player.isSlowMotion ? 0.4 : 1);
        eb.y += eb.vy * (player.isSlowMotion ? 0.4 : 1);
        if (eb.y > canvas.height + 20) return false;

        const dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist < 10 * player.hitboxSizeMult + 5) {
            if (player.barrierTimer > 0 || player.isInvincible) {
                contactFlags.bullet = true; // バリア中でも接触は検知
                return false;
            }
            takeDamage(10, 'bullet');
            return false;
        }

        // Magnetic Repel (反発)
        if (player.hasRepel) {
            bullets.forEach(b => {
                const d = Math.hypot(eb.x - b.x, eb.y - b.y);
                if (d < 50) {
                    const angle = Math.atan2(eb.y - b.y, eb.x - b.x);
                    eb.vx += Math.cos(angle) * 1.5;
                    eb.vy += Math.sin(angle) * 1.5;
                }
            });
        }
        return true;
    });
}

function updateEnemies() {
    enemies = enemies.filter(e => {
        let speedMult = player.isTimeStopped ? 0 : (player.isSlowMotion ? 0.5 : 1);
        if (e.isShrink) speedMult *= 0.6;
        e.update(speedMult);
        if (e.y > canvas.height + 50) return false;

        // ターゲット (デコイがいれば優先)
        const targetObj = decoys.length > 0 ? decoys[0] : player;
        if (decoys.length > 0) {
            const dx = targetObj.x - e.x;
            const dy = targetObj.y - e.y;
            const dist = Math.hypot(dx, dy);
            e.x += (dx / dist) * 1.0;
        }

        // 自機衝突
        if (Math.hypot(e.x - player.x, e.y - player.y) < 15 * player.hitboxSizeMult + 15) {
            contactFlags.enemy = true;
            if (!player.isInvincible) takeDamage(20, 'enemy');
            e.hp = 0;
        }
        // デコイ衝突
        decoys.forEach(d => {
            if (Math.hypot(e.x - d.x, e.y - d.y) < 30) {
                d.hp -= 10; e.hp = 0;
            }
        });

        if (e.hp <= 0) {
            e.die();
            if (player.corpseExplosion) {
                createExplosion(e.x, e.y, '#f00', 5);
                for (let e2 of enemies) { if (Math.hypot(e2.x - e.x, e2.y - e.y) < 80) e2.hp -= 1; }
            }
            hackGauge = Math.min(100, hackGauge + 10);
            return false;
        }
        // 稀に弾を撃つ (BOSSのみ)
        if (e.isBoss && !player.isTimeStopped && Math.random() < 0.005) {
            const ebX = e.x; const ebY = e.y;
            const target = decoys.length > 0 ? decoys[0] : player;
            const angle = Math.atan2(target.y - ebY, target.x - ebX);
            enemyBullets.push({ x: ebX, y: ebY, vx: Math.cos(angle) * 4, vy: Math.sin(angle) * 4 });
        }
        return true;
    });
}

function updateBits() {
    bits = bits.filter(b => !b.update());
}

function updateParticles() {
    particles = particles.filter(p => {
        if (p.type === 'shockwave') {
            p.radius += (p.maxRadius - p.radius) * 0.1;
            p.life--;
            // Shockwave interaction: apply vulnerability debuff
            enemies.forEach(e => {
                if (Math.hypot(e.x - p.x, e.y - p.y) < p.radius) {
                    e.vulnerableTimer = 180; // 3s
                }
            });
            return p.life > 0;
        }
        p.x += p.vx; p.y += p.vy;
        p.life--; return p.life > 0;
    });
}

function takeDamage(amount, type = null) {
    if (type === 'enemy') contactFlags.enemy = true;
    if (type === 'bullet') contactFlags.bullet = true;

    if (player.hasEndurance && hp <= amount && hp > 1) {
        hp = 1;
        player.hasEndurance = false; // 一度きり
        addLog("ENDURANCE_ACTIVATED!", "hack");
    } else {
        hp -= amount;
        if (hp <= 0) {
            if (player.lives > 0) {
                player.lives--;
                hp = MAX_HP;
                addLog(`SYSTEM_REBOOT: LIVES REMAINING ${player.lives}`, "hack");
            } else {
                gameOver = true;
                showGameOver();
            }
        }
    }
}

// 異常終了時の強制復帰用
window.addEventListener('error', () => { isHacking = false; gameActive = true; });

function draw() {
    ctx.save();
    // モーションブラーのための半透明黒クリア
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 5, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter'; // グロウ効果

    // スクロールするサイバー空間グリッド背景
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.15)';
    ctx.lineWidth = 1;
    let gridOffset = (Date.now() / 30) % 40;
    ctx.beginPath();
    for (let y = gridOffset; y < canvas.height; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    ctx.stroke();

    // 背景コード雨 (廃止)

    // プレイヤー描画 (機械っぽいデザイン)
    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.isInvincible) {
        ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.5 + 0.5;
    }

    // メインボディ
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(12, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ウィング
    ctx.fillStyle = '#333';
    ctx.fillRect(-18, 0, 6, 12);
    ctx.fillRect(12, 0, 6, 12);
    ctx.strokeStyle = '#00ff41';
    ctx.strokeRect(-18, 0, 6, 12);
    ctx.strokeRect(12, 0, 6, 12);

    // コア
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0ff';
    // ctx.shadowBlur = 10;
    // ctx.shadowColor = '#0ff';
    ctx.fill();
    // ctx.shadowBlur = 0;

    // スラスター
    if (gameActive && !player.isTimeStopped) {
        ctx.fillStyle = `rgba(255, 100, 0, ${0.5 + Math.random() * 0.5})`;
        const th = 8 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(-4, 8);
        ctx.lineTo(0, 8 + th);
        ctx.lineTo(4, 8);
        ctx.fill();
    }
    ctx.restore();

    // バリア描画
    if (player.barrierTimer > 0) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, 40, 0, Math.PI * 2);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // オプション描画
    for (let i = 0; i < player.subShips; i++) {
        const offset = (i + 1) * 30 * (i % 2 === 0 ? 1 : -1);
        ctx.fillStyle = '#f0f';
        ctx.fillRect(player.x + offset - 5, player.y - 5, 10, 10);
    }

    // 弾描画
    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        if (b.isLaser) {
            ctx.fillRect(b.x - 2, 0, 4, b.y);
        } else {
            // Latency Trail Drawing REMOVED FOR PERF

            // 最適化: arc を fillRect に変更して描画負荷を大幅軽減
            const s = 5 * b.size;
            ctx.fillRect(b.x - s, b.y - s, s * 2, s * 2);
        }
    });

    // 高度サブ機の描画
    if (player.advancedSubShips > 0) {
        for (let i = 0; i < player.advancedSubShips; i++) {
            const angle = (Date.now() / 500) + (i * Math.PI * 2 / player.advancedSubShips);
            const sx = player.x + Math.cos(angle) * 45;
            const sy = player.y + Math.sin(angle) * 45;
            ctx.fillStyle = '#0ff';
            // ctx.shadowBlur = 10;
            // ctx.shadowColor = '#0ff';
            ctx.fillRect(sx - 4, sy - 4, 8, 8);
            // ctx.shadowBlur = 0;
        }
    }

    // ブラックホール描画（負荷軽減のため単純な円に変更）
    vortices.forEach(v => {
        ctx.fillStyle = 'rgba(64, 0, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(100, 0, 255, 0.8)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(v.x, v.y, v.radius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
    });

    // 敵弾描画
    ctx.fillStyle = '#f11';
    enemyBullets.forEach(eb => {
        ctx.fillRect(eb.x - 3, eb.y - 3, 6, 6);
    });

    // 敵描画
    enemies.forEach(e => e.draw());

    // ビット描画
    bits.forEach(b => b.draw());

    // パーティクル描画
    particles.forEach(p => {
        if (p.type === 'shockwave') {
            ctx.strokeStyle = `rgba(255, 0, 255, ${p.life / 30})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 30;
            ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            ctx.globalAlpha = 1.0;
        }
    });

    // 雷撃・連鎖エフェクト描画
    ctx.lineWidth = 2;
    lightningStrikes.forEach(l => {
        ctx.strokeStyle = l.isBolt ? '#fff' : '#0ff';
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    });

    // 設置物描画
    turrets.forEach(t => t.draw());
    decoys.forEach(d => d.draw());
    portals.forEach(p => {
        ctx.strokeStyle = p.isExit ? '#f0f' : '#0ff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 20, 0, Math.PI * 2); ctx.stroke();
    });

    // ブレードエフェクト
    if (player.bladeTimer > 0) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(player.x, player.y - 40, 60, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
}

function showGameOver() {
    document.getElementById('overlay').classList.remove('hidden');
    document.getElementById('final-score').textContent = `最終稼働時間: ${document.getElementById('score-count').textContent}`;
    saveGameState(); // ビットを保存
    addLog("CRITICAL_SYSTEM_FAILURE", "hack");
}

function loop() {
    update();
    draw();
    if (isPaused && gameActive && !gameOver && !isHacking) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0ff';
        ctx.font = 'bold 40px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0ff';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press [P] or [ESC] to Resume', canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
    }
    requestAnimationFrame(loop);
}

// 起動
loop();
