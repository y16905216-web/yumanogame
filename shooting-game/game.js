const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 540;

// --- 1. 定数・初期設定 ---
const MAX_HP = 100;
const PLAYER_SPEED = 5;
const ENEMY_SPAWN_RATE = 0.03; // 出現率を低下 (0.06 -> 0.03)
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
let isPaused = false;
let isEasyMode = false;
let lastTime = Date.now();
let bulletHitRecently = 0;
let bitMultiplier = 1;
let screenShake = 0;
let playerPowerLevel = 0; // 敵難易度スケーリング用
let terminalLogs = ["SYSTEM_READY"];
let bossesDefeated = 0;
let nextBossScore = 60;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);

let player = {
    x: canvas.width / 2, y: canvas.height / 2, w: 30, h: 30,
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
    'main-shot-count', 'passive-hitbox', 'num-1'
];
const starterCounts = {
    'main-shot-count': 3,
    'passive-hitbox': 3,
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
let MAX_STACK_ACTIONS = 5;
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

// --- Tower Mode State ---
let isTowerMode = false;
let towerState = {
    currentFloor: 1,
    maxFloors: 30,
    floorOptions: [],
    bits: 0,
    lives: 1,
    permanentUpgrades: JSON.parse(localStorage.getItem('hacker_shooter_tower_upgrades')) || {
        maxHP: 100,
        initialBits: 0,
        revives: 0,
        initialSlots: 5
    },
    currentTrouble: null, // 'darkness', 'nobits', 'highload'
    pendingReward: null,
    pendingBits: 0
};

class TowerManager {
    static generateFloors() {
        const types = ['battle', 'battle', 'battle'];
        if (towerState.currentFloor % 5 === 0) {
            return [{ type: 'shop', difficulty: 'REST', reward: 'RESTORE_SHOP' }];
        }
        if (towerState.currentFloor === 30) {
            return [{ type: 'boss', id: 'MASTER_CORE', difficulty: 'OMEGA', reward: 'SYSTEM_COMPLETE' }];
        }

        const options = [];
        const difficulties = ['EASY', 'NORMAL', 'HARD'];
        const colors = ['red', 'blue', 'green', 'yellow'];

        for (let i = 0; i < 3; i++) {
            const diff = difficulties[i];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const rewardPool = BLOCKS.filter(b => b.isTowerChip);
            const rewardBlock = rewardPool[Math.floor(Math.random() * rewardPool.length)];
            
            // 難易度別のビット報酬
            let rewardBits = 100;
            if (diff === 'NORMAL') rewardBits = 250;
            if (diff === 'HARD') rewardBits = 500;

            options.push({
                type: 'battle',
                difficulty: diff,
                color: color,
                rewardBlockId: rewardBlock ? rewardBlock.id : 'main-shot-count',
                rewardBits: rewardBits,
                trouble: Math.random() < 0.2 ? ['darkness', 'nobits', 'highload'][Math.floor(Math.random() * 3)] : null
            });
        }
        return options;
    }

    static startFloor(option) {
        towerState.currentTrouble = option.trouble;
        towerState.pendingReward = option.rewardBlockId;
        towerState.pendingBits = option.rewardBits || 0;
        gameActive = true;
        isPaused = false;
        hp = towerState.permanentUpgrades.maxHP;
        score = 0;
        startTime = Date.now();
        
        // モジュールとステータスの同期
        player.activeModules = JSON.parse(JSON.stringify(hackingStack));
        applyStaticStats();
        applyDynamicLogic();
        
        // トラブルフロア演出
        if (towerState.currentTrouble === 'darkness') {
            addLog("!! WARNING: VISUAL_SENSOR_FAILURE (暗晦状態)", "error");
        }
        
        closeOverlays();
        closeHackingScreen();
    }

    static clearFloor() {
        gameActive = false;
        towerState.currentFloor++;
        towerState.bits = playerBits;
        towerState.lives = player.lives; // 残数を保存
        
        // ビット報酬の付与
        if (towerState.pendingBits) {
            playerBits += towerState.pendingBits;
            addLog(`FLOOR_REWARD: ${towerState.pendingBits} BIT 獲得`, "hack");
            towerState.pendingBits = 0;
        }

        if (towerState.currentFloor > towerState.maxFloors) {
            gameClear();
        } else {
            showTowerAssembleScreen();
        }
    }
}

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
window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && gameActive && !gameOver && !isHacking) {
        isPaused = !isPaused;
    }
});
window.addEventListener('keyup', e => keys[e.key] = false);

let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches && e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        mouseX = (e.touches[0].clientX - rect.left) * scaleX;
        mouseY = (e.touches[0].clientY - rect.top) * scaleY;
    }
}, { passive: false });


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
    { id: 'skill-invincible', category: CATEGORIES.SKILL, label: '[ 無敵状態 ] になる', desc: '一定時間、体当たりで敵を破壊可能', hasParam: false, icon: '👻' },

    // ... (Passive and System remain mapped by their IDs later)

    // 3. 機体性能（パッシブ・常時発動）
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
    { id: 'system-auto-fire', category: CATEGORIES.SYSTEM, label: '[ オートエイム ] をオンにする', desc: '自動で敵を狙って撃つ', hasParam: false, icon: '🤖' },

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
        if (bMain) total += bMain.memory * (entry.level || 1); // レベル分メモリを消費

        if (entry.condId) {
            const bCond = BLOCKS.find(b => b.id === entry.condId);
            if (bCond) total += bCond.memory;
        }
        if (entry.actionId) {
            const bAct = BLOCKS.find(b => b.id === entry.actionId);
            if (bAct) total += bAct.memory;
        }
    });

    // 高負荷エリア: 消費電力が2倍
    if (isTowerMode && towerState.currentTrouble === 'highload') {
        total *= 2;
    }
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
    let basePool = BLOCKS;
    if (isTowerMode) {
        basePool = BLOCKS.filter(b => b.isTowerChip);
    }

    if (currentHackTab === 'attack') {
        filtered = basePool.filter(b => b.category === CATEGORIES.MAIN || b.category === CATEGORIES.SKILL);
    } else if (currentHackTab === 'buff') {
        filtered = basePool.filter(b => b.category === CATEGORIES.PASSIVE);
    } else if (currentHackTab === 'system') {
        filtered = basePool.filter(b => b.category === CATEGORIES.SYSTEM);
    } else if (currentHackTab === 'logic') {
        if (isTowerMode) {
            filtered = []; // タワーモードではロジックブロック等を使用しない
        } else {
            filtered = basePool.filter(b => b.category === CATEGORIES.LOGIC || b.category === CATEGORIES.COND || b.category === CATEGORIES.NUM);
        }
    } else if (currentHackTab === 'data') {
        if (isTowerMode) {
            filtered = [];
        } else {
            filtered = basePool.filter(b => b.category === CATEGORIES.PARAM);
        }
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

            // Tower Chip Level Badge
            if (isTowerMode && entry.level) {
                html += ` <span class="level-badge" style="background:${blockDef.color}; color:#fff; padding:0 5px; border-radius:10px; font-size:0.5rem;">Lv.${entry.level}</span>`;
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

    selectedBlockIndex = -1;
    selectedSlot = null;
    renderHackConsole();
}

function closeOverlays() {
    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    closeHackingScreen();
    isPaused = false;
}

function showTowerFloorSelect() {
    closeOverlays();
    const overlay = document.getElementById('tower-floor-select');
    overlay.classList.remove('hidden');
    document.getElementById('tower-floor-num').textContent = `F${String(towerState.currentFloor).padStart(2, '0')}`;
    
    const container = document.getElementById('floor-options-container');
    container.innerHTML = '';
    
    // プログレスバー（サイドバー）の生成
    const sidebar = document.getElementById('tower-progress-sidebar');
    if (sidebar) {
        sidebar.innerHTML = '';
        for (let i = 1; i <= 30; i++) {
            const dot = document.createElement('div');
            dot.className = 'tower-dot';
            if (i < towerState.currentFloor) dot.classList.add('cleared');
            if (i === towerState.currentFloor) dot.classList.add('active');
            dot.setAttribute('data-floor', `F${i.toString().padStart(2, '0')}`);
            sidebar.appendChild(dot);
            if (i === towerState.currentFloor) {
                setTimeout(() => {
                    dot.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    towerState.floorOptions = TowerManager.generateFloors();
    towerState.floorOptions.forEach(opt => {
        const card = document.createElement('div');
        card.className = `floor-card type-${opt.color || 'blue'}`;
        
        let rewardName = "???";
        if (opt.rewardBlockId) {
            const b = BLOCKS.find(x => x.id === opt.rewardBlockId);
            if (b) rewardName = b.label.split(']')[1] || b.label;
        } else if (opt.type === 'shop') rewardName = "REST_SHOP";
        else if (opt.type === 'boss') rewardName = "MASTER_CORE";

        card.innerHTML = `
            <div class="floor-info-left">
                <div class="floor-diff">${opt.difficulty}</div>
                <div style="font-size:0.9rem; color:#fff;">${opt.type.toUpperCase()}</div>
                ${opt.trouble ? `<div class="floor-trouble">[! ERROR: ${opt.trouble.toUpperCase()}]</div>` : ''}
            </div>
            <div class="floor-info-right">
                <div class="floor-reward">CHIP: ${rewardName}</div>
                <div class="floor-reward" style="color:#00ff41;">BITS: +${opt.rewardBits || 0}</div>
            </div>
        `;
        card.onclick = () => TowerManager.startFloor(opt);
        container.appendChild(card);
    });
}

function showTowerAssembleScreen() {
    // 報酬を付与
    if (towerState.pendingReward) {
        const block = BLOCKS.find(b => b.id === towerState.pendingReward);
        if (block) {
            addLog(`NEW_CHIP_ACQUIRED: ${block.label}`, "hack");
            
            // Tower Mode のスタック（重ねがけ）ロジック
            let existing = hackingStack.find(m => m.id === towerState.pendingReward);
            if (existing) {
                existing.level = (existing.level || 1) + 1;
                addLog(`${block.label} が Lv.${existing.level} に強化されました`, "hack");
            } else {
                hackingStack.push({ id: block.id, level: 1, param: null, condId: 'cond-always', actionId: block.id });
            }
        }
    }
    towerState.pendingReward = null;
    
    // ハッキング画面を出さずに、自動でステータスを更新してフロア選択へ
    applyStaticStats();
    applyDynamicLogic();
    updateUI();
    
    showTowerFloorSelect();
    addLog(`FLOOR_${towerState.currentFloor-1}_CLEAR: システムをアップグレードしました`, "hack");
}

function showTowerMetaHack() {
    closeOverlays();
    const modal = document.getElementById('tower-meta-hack');
    modal.classList.remove('hidden');
    renderTowerMetaHack();
}

function closeTowerMetaHack() {
    document.getElementById('tower-meta-hack').classList.add('hidden');
    document.getElementById('home-screen').classList.remove('hidden');
}

function renderTowerMetaHack() {
    const bitsDisplay = document.getElementById('meta-hack-bits');
    bitsDisplay.textContent = `AVAILABLE_BITS: ${playerBits}`;
    
    const list = document.getElementById('meta-upgrade-list');
    list.innerHTML = '';
    
    const upgrades = [
        { id: 'maxHP', label: '最大HPアップ', cost: 500, step: 20 },
        { id: 'initialBits', label: '初期ビット増加', cost: 300, step: 100 },
        { id: 'revives', label: 'リコンストラクト (復活回数)', cost: 1000, step: 1 },
        { id: 'initialSlots', label: '初期スロット拡張', cost: 800, step: 1 }
    ];

    upgrades.forEach(upg => {
        const div = document.createElement('div');
        div.style = "display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #222; padding:5px 0;";
        const currentVal = towerState.permanentUpgrades[upg.id];
        div.innerHTML = `
            <div>
                <div style="font-size:0.8rem;">${upg.label}</div>
                <div style="font-size:0.6rem; color:#888;">現在: ${currentVal}</div>
            </div>
            <button class="btn-primary" style="font-size:0.6rem; padding:4px 8px;" onclick="buyMetaUpgrade('${upg.id}', ${upg.cost}, ${upg.step})">
                強化 (${upg.cost} BIT)
            </button>
        `;
        list.appendChild(div);
    });
}

function buyMetaUpgrade(id, cost, step) {
    if (playerBits >= cost) {
        playerBits -= cost;
        towerState.permanentUpgrades[id] += step;
        localStorage.setItem('hacker_shooter_bits', playerBits);
        localStorage.setItem('hacker_shooter_tower_upgrades', JSON.stringify(towerState.permanentUpgrades));
        addLog(`UPGRADE_SUCCESS: ${id}`, "hack");
        renderTowerMetaHack();
        updateHomeBits();
    } else {
        addLog("INSUFFICIENT_BITS", "error");
    }
}

function updateHomeBits() {
    const el = document.getElementById('home-bit-count');
    if (el) el.textContent = playerBits;
}

// 既存ボタンのイベントリスナー追加
document.addEventListener('DOMContentLoaded', () => {
    // ナビゲーションボタンのイベントリスナー設定
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => selectMode(item.getAttribute('data-mode'));
    });
    
    // 初期モードを選択状態にする
    selectMode('normal');
});

const modeData = {
    'normal': {
        title: 'STANDARD_MODE',
        desc: '3分間の生存テスト。自己ハッキングによるシステム改変を駆使し、迫りくる防衛プログラムを排除せよ。',
        meta: 'TIME_LIMIT: 3:00 | MEMORY: 400MB',
        action: () => { isEasyMode = false; isTowerMode = false; startGame(); }
    },
    'easy': {
        title: 'DEBUG_EASY_MODE',
        desc: '初心者向けモード。メモリ制限を解除し、あらゆるモジュールを自由に試行可能。リラックスして楽しめます。',
        meta: 'TIME_LIMIT: NONE | MEMORY: UNLIMITED',
        action: () => { isEasyMode = true; isTowerMode = false; startGame(); }
    },
    'tower': {
        title: 'TOWER_INFLATION',
        desc: 'フロア攻略モード。各階で得られる強化チップを重ねがけし、無限のインフレを体験せよ。ボスを倒すとクリア。',
        meta: 'GOAL: FLOOR 30 | ONE_BOSS_CLEAR: ENABLED',
        action: () => {
            isTowerMode = true;
            isEasyMode = false;
            towerState.currentFloor = 1;
            towerState.bits = towerState.permanentUpgrades.initialBits;
            showTowerFloorSelect();
        }
    },
    'metahack': {
        title: 'META_UPGRADE',
        desc: '永続的な機体強化。ビットを消費して、基本性能や復活回数をアップグレードし、より高い階層を目指せ。',
        meta: 'TARGET: PERMANENT_STATS',
        action: () => showTowerMetaHack()
    }
};

let selectedMode = 'normal';

function selectMode(mode) {
    selectedMode = mode;
    const data = modeData[mode];
    
    // UI更新
    document.getElementById('selected-mode-title').textContent = data.title;
    document.getElementById('selected-mode-desc').textContent = data.desc;
    document.getElementById('selected-mode-meta').textContent = data.meta;
    
    // アクティブクラスの切り替え
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-mode') === mode);
    });
    
    // スタートボタンの表示
    const startBtn = document.getElementById('execute-start-btn');
    startBtn.classList.remove('hidden');
    startBtn.onclick = data.action;
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

    // シナジーボーナスの適用
    const redBonus = calculateSynergyBonus('red');
    const yellowBonus = calculateSynergyBonus('yellow');
    const blueBonus = calculateSynergyBonus('blue');
    const greenBonus = calculateSynergyBonus('green');

    if (redBonus > 1.0) {
        player.bulletSizeMult *= redBonus;
        // ダメージへの影響は火器発射時に適用
    }
    if (yellowBonus > 1.0) {
        player.bulletSpeedMult *= yellowBonus;
    }
    if (blueBonus > 1.0) {
        player.hitboxSizeMult *= 0.8; // 20%縮小
    }
    // greenBonus は後ほど特殊効果に適用

    // ロジック以外の常時発動モジュールを先に適用
    player.activeModules.forEach(mod => {
        if (mod.id !== 'logic-if' && mod.id !== 'logic-while') {
            applyActionEffect(mod.id, mod.param, null, mod.level || 1);
        }
    });
}

function applyDynamicLogic(target = null) {
    // 毎フレーム判定が必要なロジックブロックのみ評価
    player.activeModules.forEach(mod => {
        if (mod.id === 'logic-if' || mod.id === 'logic-while') {
            if (checkCondition(mod.condId, target, mod.objectId, mod.objectId2)) {
                applyActionEffect(mod.actionId, mod.param, target, mod.level || 1);
            }
        }
    });
}

function applyActionEffect(actionId, p, target = null, level = 1) {
    const obj = target || player;
    switch (actionId) {
        // --- TOWER MODE CHIPS (30 SELECTION) ---
        // 【赤：破壊系統】
        case 'chip-red-dmg': player.towerDamageMult = (player.towerDamageMult || 1.0) * (1 + 0.5 * level); break;
        case 'chip-red-exp': player.towerExplosionSize = (player.towerExplosionSize || 1.0) * (1 + 0.4 * level); obj.isExplosion = true; break;
        case 'chip-red-fire': player.fireRate = Math.max(30, 180 / (1 + 0.3 * level)); break;
        case 'chip-red-size': player.bulletSizeMult *= (1 + 0.5 * level); break;
        case 'chip-red-crit': player.towerCritChance = (player.towerCritChance || 0) + (10 * level); break;

        // 【青：手数・誘導系統】
        case 'chip-blue-shot': player.multiShot = Math.min(36, player.multiShot + (2 * level)); break;
        case 'chip-blue-homing': obj.isHoming = true; player.towerHomingStrength = (player.towerHomingStrength || 1) + level; break;
        case 'chip-blue-split': obj.isSplitting = true; player.towerSplitCount = (player.towerSplitCount || 2) + level; break;
        case 'chip-blue-bounce': obj.isBouncing = true; player.towerBounceCount = (player.towerBounceCount || 1) + (2 * level); break;
        case 'chip-blue-speed': player.bulletSpeedMult *= (1 + 0.2 * level); break;

        // 【黄：軌道・多段系統】
        case 'chip-yellow-pierce': obj.isPiercing = true; player.towerPierceCount = (player.towerPierceCount || 1) + level; break;
        case 'chip-yellow-drill': obj.isDrill = true; player.towerDrillInterval = Math.max(2, 10 - level); break;
        case 'chip-yellow-range': player.towerRangeMult = (player.towerRangeMult || 1.0) + (0.5 * level); break;
        case 'chip-yellow-knock': player.towerKnockback = (player.towerKnockback || 0) + (5 * level); break;
        case 'chip-yellow-follow': player.towerHasFollowup = true; player.towerFollowupLevel = level; break;

        // 【緑：リソース・ハック系統】
        case 'chip-green-bit': player.towerBitGainMult = (player.towerBitGainMult || 1.0) + (0.5 * level); break;
        case 'chip-green-magnet': player.isMagnet = true; player.towerMagnetRange = (player.towerMagnetRange || 200) + (100 * level); break;
        case 'chip-green-drop': player.towerDropRateMult = (player.towerDropRateMult || 1.0) + (0.2 * level); break;
        case 'chip-green-cost': /* メモリ計算側で処理済み */ break;
        case 'chip-green-recycle': player.towerRecycleChance = (player.towerRecycleChance || 0) + (10 * level); break;

        // 【紫：妨害・状態異常系統】
        case 'chip-purple-lightning': player.isLightning = true; player.towerLightningChain = (player.towerLightningChain || 3) + level; break;
        case 'chip-purple-stun': player.towerStunDuration = (player.towerStunDuration || 0) + (30 * level); break;
        case 'chip-purple-attract': player.hasBlackHole = true; player.towerVortexStrength = (player.towerVortexStrength || 1.0) + (0.5 * level); break;
        case 'chip-purple-defdown': player.towerDefDownLevel = level; break;
        case 'chip-purple-poison': player.isPoison = true; player.towerPoisonMult = (player.towerPoisonMult || 1.0) + (0.5 * level); break;

        // 【白：機体・生存系統】
        case 'chip-white-speed': player.speed = PLAYER_SPEED * (1 + 0.1 * level); break;
        case 'chip-white-invinc': player.towerInvincMult = (player.towerInvincMult || 1.0) + (0.5 * level); break;
        case 'chip-white-guard': player.towerAutoGuardChance = (player.towerAutoGuardChance || 0) + (5 * level); break;
        case 'chip-white-regen': player.autoHeal += (0.01 * level); break;
        case 'chip-white-hitbox': player.hitboxSizeMult *= Math.pow(0.8, level); break;

        // --- ORIGINAL BLOCKS ---
        case 'main-shot-count': player.multiShot = Math.min(5, player.multiShot + (p || 1)); break;
        case 'main-homing': obj.isHoming = true; break;
        case 'main-laser': obj.isLaser = true; break;
        case 'main-bomb': obj.isBomb = true; break;
        case 'main-rear': player.isRearShot = true; break;
        case 'main-speed':
            if (target) { target.vx *= 1.2; target.vy *= 1.2; }
            else player.bulletSpeedMult *= (1 + (p || 10) / 100);
            break;
        case 'main-size':
            if (target) target.size *= 1.5;
            else player.bulletSizeMult *= (1 + (p || 10) / 100);
            break;
        case 'skill-option': player.subShips += (p || 1); break;
        case 'passive-hitbox': player.hitboxSizeMult *= 0.8; break;
        case 'passive-magnet': player.isMagnet = true; break;
        case 'passive-auto-heal': player.autoHeal += 0.03; break;
        case 'passive-lives': player.lives = (player.lives || 3) + 1; break;
        case 'passive-exp': player.expBonus *= (p || 1.2); break;
        case 'system-coin': player.bulletToCoin = true; break;
        case 'system-explode': player.corpseExplosion = true; break;
        case 'system-slow': player.isSlowMotion = true; break;
        case 'system-endure': player.hasEndurance = true; break;
        case 'system-auto-fire': player.autoFire = true; break;
        case 'passive-blackhole': player.hasBlackHole = true; break;
        case 'skill-subship-adv': player.advancedSubShips += 1; break;
        case 'system-bit-double': bitMultiplier += 1; break;
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
        case 'passive-blood-pact': player.isBloodPact = true; player.bloodPactDamage = 4.0; break;
        case 'effect-echo': player.hasEcho = true; break;
        case 'system-binary-trade': player.hasBinaryTrade = true; break;
        case 'main-compress': player.hasCompress = true; break;
        case 'main-latency': player.hasLatency = true; obj.isPiercing = true; break;
        case 'skill-synchro': player.hasSynchro = true; break;
        case 'effect-malware': player.hasMalware = true; break;
        case 'effect-repel': player.hasRepel = true; break;
        case 'system-reboot': player.hasReboot = true; break;
        case 'system-random': player.hasRandom = true; break;

        default:
            if (actionId.startsWith('skill-')) {
                const now = Date.now();
                if (['skill-turret', 'skill-decoy', 'skill-blade', 'skill-portal'].includes(actionId)) {
                    player[actionId.replace('skill-', 'has')] = true;
                }
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
            // ビット消失フロア
            if (isTowerMode && towerState.currentTrouble === 'nobits') {
                addLog("!! ERROR: BIT_STORAGE_OFFLINE", "error");
            } else {
                playerBits += 1;
                contactFlags.bit = true;
                updateUI();
            }
            return true;
        }
        const magnetRange = (player.isMagnet ? 400 : 200) + (player.towerMagnetRange || 0);
        if (dist < magnetRange) {
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
        // 4辺のどこかからランダムにスポーン
        const side = Math.floor(Math.random() * 4);
        if (side === 0) { // 上から
            this.x = Math.random() * canvas.width;
            this.y = -20;
            this.dirX = 0; this.dirY = 1;
        } else if (side === 1) { // 下から
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + 20;
            this.dirX = 0; this.dirY = -1;
        } else if (side === 2) { // 左から
            this.x = -20;
            this.y = Math.random() * canvas.height;
            this.dirX = 1; this.dirY = 0;
        } else { // 右から
            this.x = canvas.width + 20;
            this.y = Math.random() * canvas.height;
            this.dirX = -1; this.dirY = 0;
        }

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
        const floorHPMult = isTowerMode ? (1 + (towerState.currentFloor - 1) * 0.1) : 1.0;
        this.hp = Math.ceil(this.hp * (1 + bossesDefeated * 0.5) * floorHPMult);
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
            this.hp -= 0.01 * (this.poisonDamageMult || 1.0);
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

        // プレイヤーの方向に向かって移動（360度全方位）
        if (!this.isBoss) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy) || 1;
            this.x += (dx / dist) * this.speed * speedMult;
            this.y += (dy / dist) * this.speed * speedMult;
        }
        this.angle += 0.05 * speedMult;

        // 全てのブラックホールに吸い寄せられる
        vortices.forEach(v => {
            const dx = v.x - this.x;
            const dy = v.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1200) { 
                const strength = 15 + (player.towerVortexStrength || 0);
                this.x += (dx / dist) * strength;
                this.y += (dy / dist) * strength;
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
        if (this.isBoss && isTowerMode) {
            gameClear();
            return;
        }
        createExplosion(this.x, this.y, this.isShrink ? '#088' : '#0ff', 15);
        if (player.hasFireworks) {
            const colors = ['#f00', '#ff0', '#0ff', '#f0f', '#fff'];
            for (let i = 0; i < 5; i++) createExplosion(this.x, this.y, colors[i], 10);
        }
        // ビット獲得量
        const dropMult = (player.towerBitGainMult || 1.0) * (player.towerDropRateMult || 1.0);
        let count = 2 * dropMult;
        if (this.isBoss) count = 15 * dropMult;
        for (let i = 0; i < count; i++) bits.push(new Bit(this.x, this.y));

        // 追撃チップ (範囲追い打ち)
        if (player.towerHasFollowup) {
            const range = 100 + (player.towerFollowupLevel || 1) * 20;
            const dmg = (player.towerFollowupLevel || 1) * 2;
            createExplosion(this.x, this.y, '#fff', 20);
            enemies.forEach(e => {
                if (Math.hypot(e.x - this.x, e.y - this.y) < range) e.hp -= dmg;
            });
        }

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
            // 中心に向かって進入
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.hypot(dx, dy);
            this.x += (dx / dist) * 2;
            this.y += (dy / dist) * 2;
            if (dist < 120) this.state = 'active';
            return;
        }

        this.patternTimer++;
        this.angle += 0.02;

        // ノーマルスピードでプレイヤーに突進する
        const bossSpeed = 1.5;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy) || 1;
        this.x += (dx / dist) * bossSpeed * speedMult;
        this.y += (dy / dist) * bossSpeed * speedMult;
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

        if (this.name === 'MASTER_CORE' || bossesDefeated >= 3) {
            gameClear();
        } else {
            addLog(`BOSS_DESTROYED: [${this.name}]`, 'hack');
            addLog(`SYSTEM_UPDATE: MAX_MEMORY EXPANDED TO ${MAX_HACK_MEMORY}MB`, 'sys');
        }
        // ビット獲得量はベースクラス Enemy.die で一括管理
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
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    
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
    
    // 永続強化の適用
    MAX_HACK_MEMORY = isEasyMode ? 99999 : 400; // イージーモード時は無制限
    if (isTowerMode) {
        hp = towerState.permanentUpgrades.maxHP;
        MAX_STACK_ACTIONS = towerState.permanentUpgrades.initialSlots;
        // フロア1ならビットを初期化
        if (towerState.currentFloor === 1) {
            playerBits = towerState.permanentUpgrades.initialBits;
        } else {
            // 前のフロアから引き継ぎ (towerState.bits に保存しておく)
            playerBits = towerState.bits;
        }
    } else {
        MAX_STACK_ACTIONS = 5;
        playerBits = 800; // スタンダードモードの初期値
    }
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
    isTowerMode = false;
    document.getElementById('home-screen').classList.remove('hidden');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('clear-screen').classList.add('hidden');
    document.getElementById('side-hud').classList.add('hidden');
    document.getElementById('controls-guide').classList.add('hidden');
}

// モバイル操作の実装
if (isMobile) {
    const hackBtn = document.getElementById('hack-btn');

    if (hackBtn) {
        hackBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['s'] = true; });
        hackBtn.addEventListener('touchend', e => { e.preventDefault(); keys['s'] = false; });
    }
}

// --- 5. UI設定 & 操作 ---
// Loadout/Collection logic removed

// 旧スタートボタンのリスナーは selectMode 内で管理されるため削除

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

    // タワーモードのフロアクリア判定 (30秒でクリア)
    if (isTowerMode) {
        const floorGoal = (towerState.currentFloor === 30) ? 9999 : 30; 
        if (score >= floorGoal) {
            towerState.bits = playerBits; // ビットを次フロアへ持ち越し
            TowerManager.clearFloor();
        }
    }

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

    // プレイヤー移動 (固定砲台)
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.moveX = 0;
    player.moveY = 0;

    // 自動連射 (常に射撃)
    if (player.hasCompress) {
        player.chargeLevel = Math.min(100, (player.chargeLevel || 0) + 2 * (1 + (player.fireRateBonus || 0)));
        if (player.chargeLevel >= 100) {
            fireBullets(now, 1.0);
            player.chargeLevel = 0;
            player.lastFireTime = now;
        }
    } else {
        const shootReady = !player.lastFireTime || now - player.lastFireTime > player.fireRate;
        if (shootReady && !player.isTimeStopped && player.disarmedTimer <= 0) {
            fireBullets(now);
            player.lastFireTime = now;
        }
        player.chargeLevel = 0;
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

    // Sキー: ハッキング (タワーモードでは戦闘中不可)
    if ((keys['s'] || keys['S']) && !isTowerMode) {
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
    const towerSpawnMult = isTowerMode ? (1 + (towerState.currentFloor - 1) * 0.05) : 1.0;
    const dynamicSpawnRate = ENEMY_SPAWN_RATE * (1 + playerPowerLevel * 2.0) * (1 + bossesDefeated * 0.8) * towerSpawnMult;
    if (Math.random() < dynamicSpawnRate) {
        enemies.push(new Enemy());
    }

    // ボス出現
    const bossSpawnThreshold = isTowerMode ? 15 : nextBossScore;
    const maxBosses = isTowerMode ? 1 : 3;
    if (score >= bossSpawnThreshold && bossesDefeated < maxBosses && !enemies.some(e => e.isBoss)) {
        const hpMultiplier = (1 + playerPowerLevel * 0.8) * (1 + bossesDefeated * 0.5);
        let bossHp = 200 * hpMultiplier; // Boss 1
        if (bossesDefeated === 1) bossHp = 400 * hpMultiplier; // Boss 2
        if (bossesDefeated === 2) bossHp = 800 * hpMultiplier; // Boss 3
        const names = ["GATEKEEPER", "SENTINEL", "CORE_GUARDIAN"];
        enemies.push(new Boss(bossHp, names[bossesDefeated]));
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

    // タワーモード倍率
    if (isTowerMode) {
        damageMult *= (player.towerDamageMult || 1.0);
        
        // クリティカル判定
        if (Math.random() * 100 < (player.towerCritChance || 0)) {
            damageMult *= 3.0; // クリティカルは3倍
            addLog("!! CRITICAL_HIT !!", "hack");
        }
    }

    // 赤色シナジー: ダメージ20%アップ
    if (calculateSynergyBonus('red') > 1.0) damageMult *= 1.2;

    // Binary Trade (等価交換)
    if (player.hasBinaryTrade && playerBits > 0) {
        if (Math.random() * 100 >= (player.towerRecycleChance || 0)) {
            playerBits--; // 確率で消費を回避 (Recycle)
        }
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
    
    let targetX = mouseX;
    let targetY = mouseY;
    
    // オートエイム機能 [system-auto-fire]
    if (player.autoFire) {
        let nearestEnemy = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < minDist) {
                minDist = d;
                nearestEnemy = e;
            }
        });
        if (nearestEnemy) {
            targetX = nearestEnemy.x;
            targetY = nearestEnemy.y;
        }
    }

    const baseAngle = Math.atan2(targetY - player.y, targetX - player.x);
    const spread = 0.2;
    for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spread;
        const angle = baseAngle + offset;
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
            isDrill: player.isDrill,
            isBloodPact: player.isBloodPact,

            // --- TOWER MODE CHIP PROPERTIES ---
            explosionSize: player.towerExplosionSize || 1.0,
            isLightning: player.isLightning,
            lightningChain: player.towerLightningChain || 3,
            drillInterval: player.towerDrillInterval || 10,
            pierceCount: player.towerPierceCount || 1,
            bounceCount: (player.isReflecting ? 5 : 0) + (player.towerBounceCount || 0),
            splitCount: player.towerSplitCount || 2,
            homingStrength: player.towerHomingStrength || 1,
            rangeLimit: 600 * (player.towerRangeMult || 1.0),
            knockback: player.towerKnockback || 0,
            stunDuration: player.towerStunDuration || 0,
            defDown: (player.towerDefDownLevel || 0) * 0.1, // 10% per level
            poisonMult: player.towerPoisonMult || 1.0,

            damage: damageMult,
            originX: player.x, originY: player.y,
            hitEnemies: new Map(),

            hasLatency: player.hasLatency,
            latencyTrail: [],
            hasRepel: player.hasRepel
        });
    }

    if (player.isRearShot) {
        const rearAngle = baseAngle + Math.PI;
        bullets.push({ 
            x: player.x, y: player.y, 
            vx: Math.cos(rearAngle) * bulletSpeed, vy: Math.sin(rearAngle) * bulletSpeed,
            baseVx: Math.cos(rearAngle) * bulletSpeed, baseVy: Math.sin(rearAngle) * bulletSpeed, 
            color: '#f0f', size: 1.0, life: 180, time: 0 
        });
    }

    // サブ機の射撃もプロパティ継承
    for (let i = 0; i < player.subShips; i++) {
        const offset = (i + 1) * 30 * (i % 2 === 0 ? 1 : -1);
        const subX = player.x + Math.cos(baseAngle + Math.PI/2) * offset;
        const subY = player.y + Math.sin(baseAngle + Math.PI/2) * offset;
        bullets.push({
            x: subX, y: subY,
            vx: Math.cos(baseAngle) * bulletSpeed, 
            vy: Math.sin(baseAngle) * bulletSpeed,
            baseVx: Math.cos(baseAngle) * bulletSpeed, 
            baseVy: Math.sin(baseAngle) * bulletSpeed,
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

        // 射程上限チェック
        if (b.rangeLimit && Math.hypot(b.x - b.originX, b.y - b.originY) > b.rangeLimit) return false;

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
            // 往復（1往復のみ）
            // 画面外まで進んだら帰り、残が0で消滅
            if (!b.boomerangReturning) {
                // 射出方向に進む
                b.x += b.vx; b.y += b.vy;
                // 画面外に出たら帰り張りに切り替え
                if (b.x < 0 || b.x > canvas.width || b.y < 0 || b.y > canvas.height) {
                    b.boomerangReturning = true;
                    b.vx = -b.vx;
                    b.vy = -b.vy;
                }
            } else {
                // 帰り道: 出発地点に向かう
                b.x += b.vx; b.y += b.vy;
                // 出発地点に到達したら消滅
                if (Math.hypot(b.x - b.originX, b.y - b.originY) < 20) {
                    return false;
                }
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
                const strength = 0.5 + (b.homingStrength || 1) * 0.5;
                b.vx += Math.cos(angle) * strength;
                b.vy += Math.sin(angle) * strength;
                const speed = Math.hypot(b.vx, b.vy);
                const maxS = 12 + (b.homingStrength || 1);
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

        // バウンド判定 [isReflecting / isBouncing]
        if ((b.isReflecting || b.isBouncing) && (b.bounceCount > 0)) {
            if (b.x < 0 || b.x > canvas.width) { b.vx *= -1; b.bounceCount--; createExplosion(b.x, b.y, b.color, 3); }
            else if (b.y < 0 || b.y > canvas.height) { b.vy *= -1; b.bounceCount--; createExplosion(b.x, b.y, b.color, 3); }
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
                    createLightning(b.x, b.y, b.lightningChain || 3);
                }

                // 塔モード特殊効果: ノックバック・麻痺・毒
                if (b.knockback) {
                    const angle = Math.atan2(e.y - b.y, e.x - b.x);
                    e.x += Math.cos(angle) * b.knockback;
                    e.y += Math.sin(angle) * b.knockback;
                }
                if (b.stunDuration) e.freezeTimer = Math.max(e.freezeTimer || 0, b.stunDuration);
                if (b.poisonMult > 1.0) { e.poisonTimer = 300; e.poisonDamageMult = b.poisonMult; }
                if (b.defDown) { e.vulnerableTimer = 180; e.defDownMult = (e.defDownMult || 1.0) * (1 + b.defDown); }

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
                    const sc = b.splitCount || 2;
                    for (let j = 0; j < sc; j++) {
                        const child = Object.assign({}, b);
                        const angle = (Math.PI * 2 / sc) * j;
                        child.vx = Math.cos(angle) * 8;
                        child.vy = Math.sin(angle) * 8;
                        child.life = 120;
                        child.time = 0;
                        child.isSplitting = false;
                        child.hitEnemies = new Map();
                        bullets.push(child);
                    }
                    if (!b.isDrill) return false;
                }

                if (b.isPiercing) {
                    if (b.pierceCount > 0) {
                        b.pierceCount--;
                        b.hitEnemies.set(e, b.time); // 貫通時も同一フレームでの多重ヒット防止
                    } else {
                        if (!b.isDrill) return false;
                    }
                } else if (!b.isLaser && !b.isDrill) {
                    return false;
                }
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
        if (dist < 100 && Math.random() * 100 < (player.towerAutoGuardChance || 0)) {
            createExplosion(eb.x, eb.y, '#fff', 3);
            return false; // ガード成功
        }

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
        // 画面外チェック (4辺すべて)
        if (e.y > canvas.height + 60 || e.y < -60 || e.x < -60 || e.x > canvas.width + 60) return false;

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
    if (player.isInvincible || player.barrierTimer > 0) {
        if (type === 'enemy') contactFlags.enemy = true;
        if (type === 'bullet') contactFlags.bullet = true;

        // バリア反射
        if (player.barrierTimer > 0 && type === 'bullet') {
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

    if (type === 'enemy') contactFlags.enemy = true;
    if (type === 'bullet') contactFlags.bullet = true;

    // 耐忍コンボ
    if (player.hasEndurance && hp - amount <= 0 && hp > 1) {
        hp = 1;
        player.hasEndurance = false;
        player.isInvincible = true;
        hackGauge = 100;
        addLog('⚡ 耐忍発動: HP1で踏みとどまった!', 'hack');
        createExplosion(player.x, player.y, '#fff', 30);
        setTimeout(() => { player.isInvincible = false; }, 2000 * (player.towerInvincMult || 1.0));
        return;
    }

    let finalAmount = amount;
    if (isTowerMode) {
        const reduct = (player.towerDamageReduct || 0) * 0.05; // Lv1につき5%
        finalAmount *= (1 - reduct);
    }
    hp -= finalAmount;
    if (hp <= 0) {
        if (player.lives > 0) {
            player.lives--;
            hp = MAX_HP;
            addLog(`SYSTEM_REBOOT: LIVES REMAINING ${player.lives}`, "hack");
        } else if (isTowerMode && towerState.permanentUpgrades.revives > 0) {
            towerState.permanentUpgrades.revives--;
            hp = towerState.permanentUpgrades.maxHP;
            addLog("!! EMERGENCY_RECONSTRUCT: 復活", "hack");
        } else {
            gameOver = true;
            showGameOver();
        }
    } else {
        // 被弾無敵
        player.isInvincible = true;
        player.invincibleTimer = 60 * (player.towerInvincMult || 1.0);
        setTimeout(() => { player.isInvincible = false; }, 1000 * (player.towerInvincMult || 1.0));
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

    // 暗闇演出
    if (isTowerMode && towerState.currentTrouble === 'darkness') {
        ctx.save();
        ctx.beginPath();
        // 自機周りだけ円形にくり抜く
        ctx.arc(player.x, player.y, 120, 0, Math.PI * 2);
        ctx.clip();
    }

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

    // プレイヤー描画 (砲台デザイン)
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(player.x, player.y);

    if (player.isInvincible) {
        ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.5 + 0.5;
    }

    // 底面プレート (六角形の底面)
    ctx.fillStyle = '#0d1a0d';
    ctx.strokeStyle = '#00cc33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const hexR = 20;
    for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI / 3) - Math.PI / 6;
        i === 0 ? ctx.moveTo(Math.cos(a) * hexR, Math.sin(a) * hexR)
                : ctx.lineTo(Math.cos(a) * hexR, Math.sin(a) * hexR);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 外周リング
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.strokeStyle = '#005511';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 回転リング (マウス方向に回転)
    const barrelAngle = Math.atan2(mouseY - player.y, mouseX - player.x);
    ctx.save();
    ctx.rotate(barrelAngle);

    // 砲身カバー
    ctx.fillStyle = '#1a301a';
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 1.5;
    ctx.fillRect(10, -5, 26, 10);
    ctx.strokeRect(10, -5, 26, 10);
    // 砲嘴強調
    ctx.fillStyle = '#00ff41';
    ctx.fillRect(32, -2.5, 5, 5);
    // 根元補強
    ctx.fillStyle = '#003300';
    ctx.fillRect(10, -5, 6, 10);

    ctx.restore();

    // 砲塔中心ドーム
    ctx.fillStyle = '#1a3a1a';
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 中心点発光
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0ff';
    ctx.fill();

    // デッキングライン (4方向)
    ctx.strokeStyle = 'rgba(0,255,65,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-22, 0); ctx.lineTo(-12, 0);
    ctx.moveTo(12, 0); ctx.lineTo(22, 0);
    ctx.moveTo(0, -22); ctx.lineTo(0, -12);
    ctx.moveTo(0, 12); ctx.lineTo(0, 22);
    ctx.stroke();

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

    // カーソル (ターゲットレティクル)
    if (gameActive && !isHacking) {
        const rx = mouseX, ry = mouseY;
        const ro = 12, ri = 5, gap = 4;
        ctx.save();
        ctx.strokeStyle = '#ff3300';
        ctx.lineWidth = 1.5;
        // 外周円
        ctx.beginPath();
        ctx.arc(rx, ry, ro, 0, Math.PI * 2);
        ctx.stroke();
        // 内側点
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ff3300';
        ctx.fill();
        // 十字線 (4方向)
        ctx.beginPath();
        ctx.moveTo(rx, ry - ro - gap); ctx.lineTo(rx, ry - ri);
        ctx.moveTo(rx, ry + ri);       ctx.lineTo(rx, ry + ro + gap);
        ctx.moveTo(rx - ro - gap, ry); ctx.lineTo(rx - ri, ry);
        ctx.moveTo(rx + ri, ry);       ctx.lineTo(rx + ro + gap, ry);
        ctx.stroke();
        ctx.restore();
    }

    if (isTowerMode && towerState.currentTrouble === 'darkness') {
        ctx.restore(); // 暗闇クリップ終了
        // くり抜いた外側を暗く塗る
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
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
