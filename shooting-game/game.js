const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 540;
canvas.height = 960;

// --- 1. 定数・初期設定 ---
const BATTLE_FIELD_HEIGHT = 600;
const INTERACTION_FIELD_HEIGHT = 360;
const MAX_HP = 100;
const PLAYER_SPEED = 5;
const ENEMY_SPAWN_RATE = 0.03; // 出現率を低下 (0.06 -> 0.03)
const HACK_DURATION = 5000;
const CLEAR_TIME = 180; // 3分でゴール到達

// --- 2. ゲーム状態 ---
let hp = MAX_HP;
let hackGauge = 0;
let energyGauge = 0; // 追加: 専用エネルギーゲージ
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
let bossesDefeated = 0;
let nextBossScore = 60;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);
let towerMissiles = [];

let player = {
    x: canvas.width / 2, y: canvas.height - 100, w: 30, h: 30,
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
let threads = []; // 追加: スレッド(糸)の配列
let bits = []; // 獲得アイテム
let isSwiping = false;
let swipeConnectedBits = [];
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
    pendingBits: 0,
    skillCooldown: 0,
    skillMaxCooldown: 1800
};

class TowerManager {
    static generateFloors() {
        const types = ['battle', 'battle', 'battle'];
        if (towerState.currentFloor % 5 === 0) {
            return [{ type: 'shop', difficulty: 'REST', reward: 'RESTORE_SHOP' }];
        }
        if (Math.random() < 0.15 && towerState.currentFloor > 1 && towerState.currentFloor !== 30) {
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

            // 難易度別のビット報酬 (上方調整)
            let rewardBits = 200;
            if (diff === 'NORMAL') rewardBits = 500;
            if (diff === 'HARD') rewardBits = 1000;

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

        if (option.type === 'shop') {
            gameActive = false;
            towerState.currentTrouble = null;
            closeOverlays();
            showTowerShopScreen();
            return;
        }

        // ゲーム状態の初期化
        gameActive = true;
        isPaused = false;
        gameOver = false;
        hp = towerState.permanentUpgrades.maxHP;
        score = 0;
        towerState.dominatedCount = 0;
        towerState.dominationGoal = 10 + Math.min(40, towerState.currentFloor * 2); // 支配目標
        if (option.difficulty === 'HARD') towerState.dominationGoal += 5;

        startTime = Date.now();
        lastTime = Date.now();

        // 演出用タイマー
        towerState.startAnimTimer = 180; // 3秒間
        towerState.isClearing = false;

        // オブジェクトのクリア
        enemies = []; bullets = []; enemyBullets = []; bits = []; particles = []; vortices = [];
        turrets = []; decoys = []; portals = []; lightningStrikes = []; towerMissiles = [];
        player.subShips = 0;

        // 即座にボスを配置
        const hpMultiplier = (1 + (towerState.currentFloor - 1) * 0.5);
        const names = ["ROOT_ADMIN", "SECURITY_CORE", "SYSTEM_KERNEL"];
        const boss = new Boss(500 * hpMultiplier, names[(towerState.currentFloor - 1) % 3]);
        enemies.push(boss);

        // モジュールとステータスの同期
        player.activeModules = JSON.parse(JSON.stringify(hackingStack));
        applyStaticStats();
        applyDynamicLogic();

        // UI遷移
        document.getElementById('home-screen').classList.add('hidden');
        document.getElementById('tower-floor-select').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('side-hud').classList.remove('hidden');
        document.getElementById('controls-guide').classList.remove('hidden');
        document.getElementById('clear-screen').classList.add('hidden');

        updateUI();

        // トラブルフロア演出
        console.log("Starting floor:", option);
        addLog(`FLOOR_${towerState.currentFloor}_START: ${option.difficulty}`, "hack");

        closeOverlays();
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
    if (isSwiping) return; // スワイプ中はマウス移動でのレティクル追従を制限（任意）
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseX = (e.clientX - rect.left) * scaleX;
    mouseY = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('pointerdown', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    if (py > BATTLE_FIELD_HEIGHT) {
        isSwiping = true;
        swipeConnectedBits = [];
        // 初回の衝突判定
        checkSwipeCollision(px, py);
    }

    if (player.isTargetingMissile) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const tx = (e.clientX - rect.left) * scaleX;
        const ty = (e.clientY - rect.top) * scaleY;
        player.isTargetingMissile = false;
        player.isSlowMotion = false; // 時間減速を解除
        addLog("MISSILE: 照準固定、ミサイル射出！", "error");
        towerMissiles.push({
            startX: player.x, startY: player.y,
            x: player.x, y: player.y,
            targetX: tx, targetY: ty,
            progress: 0,
            speed: 0.04
        });
        hackGauge = 0; // 消費
    }
});

canvas.addEventListener('pointermove', e => {
    if (!isSwiping) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    checkSwipeCollision(px, py);
});

canvas.addEventListener('pointerup', () => {
    if (isSwiping) {
        if (swipeConnectedBits.length >= 3) {
            executeSwipeAttack();
        }
        isSwiping = false;
        swipeConnectedBits = [];
    }
});

function checkSwipeCollision(px, py) {
    bits.forEach(b => {
        if (!swipeConnectedBits.includes(b)) {
            const d = Math.hypot(b.x - px, b.y - py);
            if (d < 40) {
                swipeConnectedBits.push(b);
                // 連結エフェクト
                createExplosion(b.x, b.y, '#0ff', 5);
            }
        }
    });
}

function executeSwipeAttack() {
    const power = swipeConnectedBits.length;
    addLog(`SWIPE_LINK: ${power} BITS CONNECTED!`, 'hack');
    
    // 特殊攻撃の放出
    for (let i = 0; i < power; i++) {
        bullets.push({
            x: player.x, y: player.y - 40,
            vx: (Math.random() - 0.5) * 10, vy: -15,
            color: '#fff', size: 1.5, life: 120, damage: 5.0
        });
    }
    
    // ゲージも大幅増加
    hackGauge = Math.min(100, hackGauge + power * 2);
    
    // ビットを消費
    bits = bits.filter(b => !swipeConnectedBits.includes(b));
    playerBits += power;
    updateUI();
}

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
    RED: 'red',
    BLUE: 'blue',
    YELLOW: 'yellow',
    GREEN: 'green',
    PURPLE: 'purple',
    WHITE: 'white',
    LOGIC: 'logic',
    COND: 'cond',
    NUM: 'num',
    PARAM: 'data'
};

const BLOCKS = [
    // --- 【赤：コンパイル系統】（ドカンと倒す） ---
    { id: 'chip-red-dmg', category: CATEGORIES.RED, label: '[ 威力アップ ]', desc: 'コンパイルの一斉攻撃ダメージ上昇', isTowerChip: true, color: '#ff4444', icon: '🔺' },
    { id: 'chip-red-range', category: CATEGORIES.RED, label: '[ 爆発サイズ ]', desc: 'コンパイル時の爆風範囲拡大', isTowerChip: true, color: '#ff4444', icon: '💥' },
    { id: 'chip-red-rate', category: CATEGORIES.RED, label: '[ 連鎖速度 ]', desc: '糸を伝わってダメージが波及する速度上昇', isTowerChip: true, color: '#ff4444', icon: '⚡' },
    { id: 'chip-red-crit', category: CATEGORIES.RED, label: '[ クリティカル ]', desc: '確率でコンパイルダメージが2倍', isTowerChip: true, color: '#ff4444', icon: '🎯' },
    { id: 'chip-red-follow', category: CATEGORIES.RED, label: '[ 追撃 ]', desc: 'コンパイル後、生き残った敵に小ダメージ', isTowerChip: true, color: '#ff4444', icon: '👹' },

    // --- 【青：スレッド系統】（たくさん繋ぐ） ---
    { id: 'chip-blue-count', category: CATEGORIES.BLUE, label: '[ 同時接続数 ]', desc: '一度に伸ばせる糸の本数増加', isTowerChip: true, color: '#4444ff', icon: '🧶' },
    { id: 'chip-blue-length', category: CATEGORIES.BLUE, label: '[ 糸の長さ ]', desc: '遠くの敵まで糸が届く', isTowerChip: true, color: '#4444ff', icon: '📏' },
    { id: 'chip-blue-width', category: CATEGORIES.BLUE, label: '[ 糸の太さ ]', desc: '糸の当たり判定が広がり巻き込みやすくなる', isTowerChip: true, color: '#4444ff', icon: '〰️' },
    { id: 'chip-blue-speed', category: CATEGORIES.BLUE, label: '[ 発射速度 ]', desc: '糸が前方に伸びるスピード上昇', isTowerChip: true, color: '#4444ff', icon: '⏩' },
    { id: 'chip-blue-homing', category: CATEGORIES.BLUE, label: '[ 自動追尾 ]', desc: '糸が近くの敵へ自動でカーブして繋がる', isTowerChip: true, color: '#4444ff', icon: '🛰️' },

    // --- 【黄：ドレイン系統】（エネルギーを吸う） ---
    { id: 'chip-yellow-drain', category: CATEGORIES.YELLOW, label: '[ 吸収スピード ]', desc: '敵からHP/パワーを吸い取る速度上昇', isTowerChip: true, color: '#ffff44', icon: '💉' },
    { id: 'chip-yellow-slow', category: CATEGORIES.YELLOW, label: '[ 弱体化 ]', desc: '繋がれた敵の移動速度低下', isTowerChip: true, color: '#ffff44', icon: '⏬' },
    { id: 'chip-yellow-atkdown', category: CATEGORIES.YELLOW, label: '[ 攻撃弱体化 ]', desc: '繋がれた敵の攻撃力低下', isTowerChip: true, color: '#ffff44', icon: '📉' },
    { id: 'chip-yellow-defdown', category: CATEGORIES.YELLOW, label: '[ 防御弱体化 ]', desc: '繋がれた敵の防御力低下（被ダメ増）', isTowerChip: true, color: '#ffff44', icon: '💔' },
    { id: 'chip-yellow-regen', category: CATEGORIES.YELLOW, label: '[ リジェネ ]', desc: '敵と繋がっている間、自分のHPが回復', isTowerChip: true, color: '#ffff44', icon: '💖' },

    // --- 【緑：リソース系統】（お宝を稼ぐ） ---
    { id: 'chip-green-bit', category: CATEGORIES.GREEN, label: '[ ビット増加 ]', desc: '敵撃破時の獲得ビット量増加', isTowerChip: true, color: '#44ff44', icon: '💰' },
    { id: 'chip-green-magnet', category: CATEGORIES.GREEN, label: '[ アイテム回収 ]', desc: '離れたビットを自動で自機に引き寄せる', isTowerChip: true, color: '#44ff44', icon: '🧲' },
    { id: 'chip-green-drop', category: CATEGORIES.GREEN, label: '[ ドロップ率 ]', desc: '敵が回復アイテムなどを落とす確率UP', isTowerChip: true, color: '#44ff44', icon: '🎁' },
    { id: 'chip-green-cost', category: CATEGORIES.GREEN, label: '[ コスト削減 ]', desc: 'ブロック装備の全体メモリ負荷低下', isTowerChip: true, color: '#44ff44', icon: '📉' },
    { id: 'chip-green-save', category: CATEGORIES.GREEN, label: '[ 弾数節約 ]', desc: '糸やコンパイル時に確率でリソース消費なし', isTowerChip: true, color: '#44ff44', icon: '♻️' },

    // --- 【紫：バグ系統】（ジャマをする） ---
    { id: 'chip-purple-stun', category: CATEGORIES.PURPLE, label: '[ ビリビリ ]', desc: '繋いだ敵を確率で麻痺させて移動停止', isTowerChip: true, color: '#ff44ff', icon: '⚡' },
    { id: 'chip-purple-poison', category: CATEGORIES.PURPLE, label: '[ どく ]', desc: '繋がっている間、敵HPにスリップダメージ', isTowerChip: true, color: '#ff44ff', icon: '☠️' },
    { id: 'chip-purple-knockback', category: CATEGORIES.PURPLE, label: '[ ふきとばし ]', desc: 'コンパイル時、周囲の敵を大きくノックバック', isTowerChip: true, color: '#ff44ff', icon: '💨' },
    { id: 'chip-purple-warp', category: CATEGORIES.PURPLE, label: '[ ワープ ]', desc: 'コンパイル時、敵をランダムな位置へテレポート', isTowerChip: true, color: '#ff44ff', icon: '🌀' },
    { id: 'chip-purple-burn', category: CATEGORIES.PURPLE, label: '[ 炎上 ]', desc: 'コンパイル後も敵が一定時間燃えてダメージ', isTowerChip: true, color: '#ff44ff', icon: '🔥' },

    // --- 【白：機体系統】（じっと耐える） ---
    { id: 'chip-white-def', category: CATEGORIES.WHITE, label: '[ カチカチ ]', desc: '自機の被ダメージを軽減', isTowerChip: true, color: '#ffffff', icon: '🛡️' },
    { id: 'chip-white-invinc', category: CATEGORIES.WHITE, label: '[ むてき ]', desc: 'コンパイル実行後の無敵時間が長くなる', isTowerChip: true, color: '#ffffff', icon: '👻' },
    { id: 'chip-white-barrier', category: CATEGORIES.WHITE, label: '[ バリア ]', desc: '確率で自機に当たる敵弾を自動消去', isTowerChip: true, color: '#ffffff', icon: '💠' },
    { id: 'chip-white-small', category: CATEGORIES.WHITE, label: '[ 判定小さく ]', desc: '自機の当たり判定が小さくなる', isTowerChip: true, color: '#ffffff', icon: '🤏' },
    { id: 'chip-white-heal', category: CATEGORIES.WHITE, label: '[ 不動回復 ]', desc: '移動していない間、自動でHPが回復', isTowerChip: true, color: '#ffffff', icon: '🧘' }
];

// Phase 3: Initialize usage counts and memory costs
BLOCKS.forEach(b => {
    b.memory = 40;
    b.maxUsage = 3;
    b.remainingUsage = b.maxUsage;
});

const AVAILABLE_CONDITIONS = [];
const AVAILABLE_ACTIONS = [];
const AVAILABLE_CHARACTERS = [];
const ALL_ITEMS = BLOCKS;

let currentHackTab = 'red';

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

    if (currentHackTab === 'red') {
        filtered = basePool.filter(b => b.category === CATEGORIES.RED);
    } else if (currentHackTab === 'blue') {
        filtered = basePool.filter(b => b.category === CATEGORIES.BLUE);
    } else if (currentHackTab === 'yellow') {
        filtered = basePool.filter(b => b.category === CATEGORIES.YELLOW);
    } else if (currentHackTab === 'green') {
        filtered = basePool.filter(b => b.category === CATEGORIES.GREEN);
    } else if (currentHackTab === 'purple') {
        filtered = basePool.filter(b => b.category === CATEGORIES.PURPLE);
    } else if (currentHackTab === 'white') {
        filtered = basePool.filter(b => b.category === CATEGORIES.WHITE);
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

    // Bits display update
    const bitsSpan = document.getElementById('tower-floor-bits');
    if (bitsSpan) bitsSpan.textContent = playerBits;

    const container = document.getElementById('floor-options-container');
    container.innerHTML = '';

    // プログレスバー（サイドバー）の生成
    const sidebar = document.getElementById('tower-progress-sidebar');
    if (sidebar) {
        sidebar.innerHTML = '';
        for (let i = 1; i <= 30; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tower-node-wrapper';
            if (i < towerState.currentFloor) wrapper.classList.add('cleared');
            if (i === towerState.currentFloor) wrapper.classList.add('active');

            wrapper.innerHTML = `
                <div class="tower-dot"></div>
                <div class="tower-dot-label">F${i.toString().padStart(2, '0')}</div>
            `;

            sidebar.appendChild(wrapper);
            if (i === towerState.currentFloor) {
                setTimeout(() => {
                    wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }

    // Reroll Button Hook
    const rerollBtn = document.getElementById('tower-reroll-btn');
    if (rerollBtn) {
        rerollBtn.onclick = () => {
            if (playerBits >= 100) {
                playerBits -= 100;
                addLog("REROLL_EXECUTED: データを再構成しました (-100 BITS)", "hack");
                showTowerFloorSelect(); // Regenerate options and re-render
            } else {
                addLog("ERROR: INSUFFICIENT_BITS_FOR_REROLL", "error");
                rerollBtn.style.color = '#ff0000';
                rerollBtn.style.borderColor = '#ff0000';
                setTimeout(() => {
                    rerollBtn.style.color = '#ffaa00';
                    rerollBtn.style.borderColor = '#ffaa00';
                }, 300);
            }
        };
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
        const startFn = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            console.log("Floor start triggered for:", opt.difficulty);
            TowerManager.startFloor(opt);
        };
        card.onclick = startFn;
        card.addEventListener('touchend', startFn); // 念のため touchend も追加
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
    player.activeModules = JSON.parse(JSON.stringify(hackingStack));
    applyStaticStats();
    applyDynamicLogic();
    updateUI();

    showTowerFloorSelect();
    addLog(`FLOOR_${towerState.currentFloor - 1}_CLEAR: システムをアップグレードしました`, "hack");
}

function showTowerShopScreen() {
    closeOverlays();
    const overlay = document.getElementById('tower-shop-screen');
    overlay.classList.remove('hidden');
    document.getElementById('shop-bits').textContent = playerBits;

    const container = document.getElementById('shop-items-container');
    container.innerHTML = '';

    const skills = [
        { id: 'debugger_shield', name: 'デバッガー・シールド', desc: '5秒間、敵弾を無効化するバリアを展開', price: 300 },
        { id: 'overclock', name: 'オーバークロック', desc: '一時的に連射狂化されるが、後で速度低下', price: 400 },
        { id: 'logic_chain', name: 'ロジック・チェーン', desc: '敵撃破時に周囲の敵へ連爆ダメージ伝播', price: 500 },
        { id: 'rewrite_code', name: 'リライト・コード', desc: '周囲の敵をハッキングし同士討ちさせる', price: 600 },
        { id: 'missile_strike', name: 'ミサイル・ストライク', desc: '画面をタップした位置に超広範囲爆撃', price: 700 },
        { id: 'code_burst', name: 'コード・バースト', desc: '全敵を静止し、解除時に蓄積ダメージを与える', price: 800 }
    ];

    // Pick 2 random skills to sell
    const shuffledSkills = skills.sort(() => 0.5 - Math.random());
    const shopOptions = [
        { type: 'heal', name: 'システム修復', desc: 'HPを最大まで回復する', price: 200 },
        shuffledSkills[0],
        shuffledSkills[1]
    ];

    shopOptions.forEach(opt => {
        const card = document.createElement('div');
        card.style.background = 'rgba(0, 30, 0, 0.8)';
        card.style.border = '1px solid #00ff41';
        card.style.padding = '15px';
        card.style.width = '200px';
        card.style.textAlign = 'center';
        card.style.borderRadius = '4px';

        card.innerHTML = `
            <div style="color: #fff; font-weight: bold; margin-bottom: 5px;">${opt.name}</div>
            <div style="color: #aaa; font-size: 0.7rem; margin-bottom: 10px; min-height: 40px;">${opt.desc}</div>
            <div style="color: #0ff; margin-bottom: 10px; font-family: monospace; font-weight: bold;">${opt.price} BITS</div>
            <button class="buy-btn" style="background: #00ff41; color: #000; padding: 8px 10px; font-weight: bold; width: 100%; border: none; cursor: pointer; border-radius: 4px;">購入 [ BUY ]</button>
        `;

        const btn = card.querySelector('.buy-btn');
        btn.onclick = () => {
            if (playerBits >= opt.price) {
                playerBits -= opt.price;
                document.getElementById('shop-bits').textContent = playerBits;
                addLog(`SHOP: ${opt.name} を購入しました`, "hack");
                btn.textContent = "購入済み [ BOUGHT ]";
                btn.style.background = "#555";
                btn.style.color = "#aaa";
                btn.disabled = true;

                if (opt.type === 'heal') {
                    hp = towerState.permanentUpgrades.maxHP;
                    addLog("HUD: 機体完全性が回復しました", "hack");
                } else {
                    player.currentTowerSkill = opt.id;
                    player.currentTowerSkillName = opt.name;
                    addLog(`SKILL_UPDATED: [${opt.name}]`, "hack");
                }
            } else {
                addLog("ERROR: BITS不足です", "error");
            }
        };
        container.appendChild(card);
    });

    document.getElementById('shop-leave-btn').onclick = () => {
        addLog("SHOP: 通信を切断します...", "hack");
        TowerManager.clearFloor();
    };
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
    // 操作説明ガイドに差し替えたため、現在は静的表示のみ。
    // 必要に応じて将来的にキーコンフィグなどの動的要素をここに追加可能。
}

function buyMetaUpgrade(id, cost, step) {
    // 永続強化機能は廃止されました。
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
            hackingStack = []; // タワーモード開始時にスタックをリセット
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
    document.getElementById('hacking-console').classList.remove('hidden'); // hiddenを解除
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
    document.getElementById('hacking-console').classList.add('hidden'); // hiddenを追加
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

function calculateSynergyBonus(colorName) {
    if (!player.activeModules) return 1.0;
    const colorMap = {
        'red': '#ff4444',
        'blue': '#4444ff',
        'green': '#44ff44',
        'yellow': '#ffff44'
    };
    const targetColor = colorMap[colorName];
    const count = player.activeModules.filter(m => {
        const b = BLOCKS.find(x => x.id === m.id);
        return b && b.color === targetColor;
    }).length;

    if (count >= 5) return 1.5;
    if (count >= 3) return 1.2;
    return 1.0;
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
    player.disarmedTimer = 0; // 必須：弾が出ない原因の修正
    player.invincibleTimer = 0;
    player.isInvincible = false;
    player.isTimeStopped = false;
    player.barrierTimer = 0;
    player.chargeLevel = 0;
    player.lastSkillTime = 0;
    player.bossTimeElapsed = 0;

    // Tower Skills Flags
    player.hasDebuggerShield = false;
    player.isOverclocked = false;
    player.isCoolingDown = false;
    player.hasLogicChainActive = false;

    player.hasEndurance = false;
    player.autoFire = false;
    // player.subShips = 0; // 毎フレームのリセットを停止
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
    // --- 新規プロパティリセット (6系統30種) ---
    player.compileDamageBonus = 0;
    player.compileSizeBonus = 0;
    player.compileSpeedBonus = 0;
    player.compileCritChance = 0;
    player.hasCompilePursuit = false;

    player.bonusThreads = 0;
    player.threadMaxLengthBonus = 0;
    player.threadWidthBonus = 0;
    player.threadRateBonus = 0;
    player.threadSpeedBonus = 0;
    player.hasThreadHoming = false;

    player.drainSpeedBonus = 0;
    player.threadSlowEnemy = false;
    player.threadAtkDown = false;
    player.threadDefDown = false;
    player.threadRegen = false;

    player.bitBonus = 0;
    player.dropBonus = 0;
    player.memoryCostReduction = 0;
    player.compileFreeChance = 0;

    player.threadStunChance = 0;
    player.threadPoisonActive = false;
    player.compileKnockback = false;
    player.compileWarp = false;
    player.compileBurn = false;

    player.defBonus = 0;
    player.invincBonus = 0;
    player.barrierChance = 0;
    player.idleHeal = 0;
    player.subShipAutoMode = true; // デフォルトはオート召喚モード

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
    if (player.isOverclocked) player.fireRate *= 0.3; // 連射狂化
    if (player.isCoolingDown) player.speed *= 0.3;    // 移動速度激減
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
        // --- 6系統・全30種の新規ブロック ---
        // 【赤：コンパイル系統】
        case 'chip-red-dmg': player.compileDamageBonus = (player.compileDamageBonus || 0) + (0.5 * level); break;
        case 'chip-red-range': player.compileSizeBonus = (player.compileSizeBonus || 0) + (0.5 * level); break;
        case 'chip-red-rate': player.compileSpeedBonus = (player.compileSpeedBonus || 0) + (0.2 * level); break;
        case 'chip-red-crit': player.compileCritChance = (player.compileCritChance || 0) + (0.2 * level); break;
        case 'chip-red-follow': player.hasCompilePursuit = true; break;

        // 【青：スレッド系統】
        case 'chip-blue-count': player.bonusThreads = (player.bonusThreads || 0) + level; break;
        case 'chip-blue-length': player.threadMaxLengthBonus = (player.threadMaxLengthBonus || 0) + (50 * level); break;
        case 'chip-blue-width': player.threadWidthBonus = (player.threadWidthBonus || 0) + (2 * level); break;
        case 'chip-blue-speed':
            player.threadRateBonus = (player.threadRateBonus || 0) + (0.2 * level);
            player.threadSpeedBonus = (player.threadSpeedBonus || 0) + (0.3 * level);
            break;
        case 'chip-blue-homing': player.hasThreadHoming = true; break;

        // 【黄：ドレイン系統】
        case 'chip-yellow-drain': player.drainSpeedBonus = (player.drainSpeedBonus || 0) + (1.0 * level); break;
        case 'chip-yellow-slow': player.threadSlowEnemy = true; break;
        case 'chip-yellow-atkdown': player.threadAtkDown = true; break;
        case 'chip-yellow-defdown': player.threadDefDown = true; break;
        case 'chip-yellow-regen': player.threadRegen = true; break;

        // 【緑：リソース系統】
        case 'chip-green-bit': player.bitBonus = (player.bitBonus || 0) + level; break;
        case 'chip-green-magnet': player.isMagnet = true; player.towerMagnetRange = 300; break;
        case 'chip-green-drop': player.dropBonus = (player.dropBonus || 0) + (0.2 * level); break;
        case 'chip-green-cost': player.memoryCostReduction = (player.memoryCostReduction || 0) + (0.2 * level); break;
        case 'chip-green-save': player.compileFreeChance = (player.compileFreeChance || 0) + (15 * level); break;

        // 【紫：バグ系統】
        case 'chip-purple-stun': player.threadStunChance = (player.threadStunChance || 0) + (0.1 * level); break;
        case 'chip-purple-poison': player.threadPoisonActive = true; break;
        case 'chip-purple-knockback': player.compileKnockback = true; break;
        case 'chip-purple-warp': player.compileWarp = true; break;
        case 'chip-purple-burn': player.compileBurn = true; break;

        // 【白：機体系統】
        case 'chip-white-def': player.defBonus = (player.defBonus || 0) + (0.2 * level); break;
        case 'chip-white-invinc': player.invincBonus = (player.invincBonus || 0) + (1.0 * level); break;
        case 'chip-white-barrier': player.barrierChance = (player.barrierChance || 0) + (0.1 * level); break;
        case 'chip-white-small': player.hitboxSizeMult = Math.max(0.2, (player.hitboxSizeMult || 1.0) - (0.2 * level)); break;
        case 'chip-white-heal': player.idleHeal = (player.idleHeal || 0) + (0.1 * level); break;


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
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = 2 + Math.random() * 2;
        this.inInteractionArea = false;
    }
    update() {
        if (this.y > BATTLE_FIELD_HEIGHT) {
            this.inInteractionArea = true;
        }

        if (this.inInteractionArea) {
            // 下部エリア内での動き（バウンドまたは滞留）
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 20 || this.x > canvas.width - 20) this.vx *= -1;
            if (this.y < BATTLE_FIELD_HEIGHT + 20 || this.y > canvas.height - 20) this.vy *= -1;
            
            // 摩擦
            this.vx *= 0.99;
            this.vy *= 0.99;
        } else {
            this.y += 3;
        }

        return false; // 基本的に消えない（スワイプで消す）
    }
    draw() {
        const isConnected = swipeConnectedBits.includes(this);
        ctx.fillStyle = isConnected ? '#fff' : '#0f0';
        if (isConnected) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#fff';
        }
        ctx.fillRect(this.x - 6, this.y - 6, 12, 12);
        ctx.shadowBlur = 0;
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

    // エネルギーゲージ (右側)
    const energyBar = document.getElementById('energy-bar');
    if (energyBar) {
        energyBar.style.width = `${energyGauge}%`;
        energyBar.style.boxShadow = energyGauge >= 50 ? '0 0 10px #ffdd00' : 'none';
    }

    // サブ機召喚モード
    const modeText = document.getElementById('subship-mode-text');
    if (modeText) {
        modeText.textContent = player.subShipAutoMode ? "AUTO_DEPLOY" : "MANUAL_AUTH";
        modeText.style.color = player.subShipAutoMode ? "#00ff41" : "#ffdd00";
    }

    // フロアボス進捗 (Boss HP)
    if (isTowerMode) {
        const goalBar = document.getElementById('goal-bar');
        const goalText = document.getElementById('goal-text');
        const boss = enemies.find(e => e.isBoss);

        if (boss) {
            const hpPercent = Math.max(0, (boss.hp / boss.maxHp) * 100);
            const progress = 100 - hpPercent;
            if (goalBar) goalBar.style.width = `${progress}%`;

            // 接続中の敵機をカウント
            const tetheredCount = enemies.filter(e => !e.isBoss && (typeof threads !== "undefined" ? threads : []).some(t => t.active && t.target === e)).length;

            if (goalText) {
                goalText.textContent = `BOSS_SUPPRESSION: ${Math.floor(progress)}% [TETHERED: ${tetheredCount}]`;
                if (tetheredCount > 0) goalText.style.color = "#ffdd00";
                else goalText.style.color = "#fff";
            }
        }

        const goalLabel = goalText.previousElementSibling;
        if (goalLabel) goalLabel.textContent = "ターゲット制圧プログレス（Aキーで起爆）";
    }

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

    // Tower Skill HUD
    const skillHud = document.getElementById('tower-skill-hud');
    if (isTowerMode) {
        if (skillHud) skillHud.classList.remove('hidden');
        const skillName = document.getElementById('tower-skill-name');
        if (skillName) skillName.textContent = player.currentTowerSkillName || 'NO SKILL';

        const cooldownBar = document.getElementById('tower-skill-cooldown-bar');
        if (cooldownBar && player.currentTowerSkill) {
            const pct = Math.floor(hackGauge);
            cooldownBar.style.width = `${pct}%`;
            cooldownBar.style.background = pct >= 100 ? '#00ff41' : '#066';
            skillName.style.color = pct >= 100 ? '#fff' : '#888';
        }
    } else if (skillHud) {
        skillHud.classList.add('hidden');
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
        } else if (side === 1) { // 戦闘エリア下部から
            this.x = Math.random() * canvas.width;
            this.y = BATTLE_FIELD_HEIGHT + 20;
            this.dirX = 0; this.dirY = -1;
        } else if (side === 2) { // 左から
            this.x = -20;
            this.y = Math.random() * BATTLE_FIELD_HEIGHT;
            this.dirX = 1; this.dirY = 0;
        } else { // 右から
            this.x = canvas.width + 20;
            this.y = Math.random() * BATTLE_FIELD_HEIGHT;
            this.dirX = -1; this.dirY = 0;
        }

        // HPを大幅に強化 (弾幕シューティングから糸で吸う形へ)
        let baseHp = 150 + Math.floor((playerPowerLevel || 0) * 30);
        if (bossesDefeated >= 1) {
            baseHp = Math.max(200, baseHp);
        }
        let baseSpd = (2 + Math.random() * 2) * 0.5;
        if (isTowerMode) baseSpd *= 0.6; // タワーモード専用移動速度低下
        this.speed = baseSpd;
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

        const floorHPMult = isTowerMode ? (1 + (towerState.currentFloor - 1) * 0.05) : 1.0;
        this.hp = Math.ceil(this.hp * (1 + bossesDefeated * 0.5) * floorHPMult);
        this.maxHp = this.hp;

        this.angle = 0;
        this.freezeTimer = 0;
        this.poisonTimer = 0;
        this.staticFieldTimer = 0;
        this.vulnerableTimer = 0;
        this.noiseLevel = 0;
        this.isSelfDestruct = false;
        this.hackingProgress = 0;
        this.isAlly = false;
        this.lastShotTime = 0;
        this.targetId = Math.random().toString(36).substr(2, 9);
    }
    update(speedMult) {
        if (this.isTethered) { // 糸が当たっている敵は移動停止
            speedMult = 0;
        }
        this.isTethered = false; // 使用後にリセットするように変更

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

        // 垂直落下移動
        if (!this.isBoss) {
            this.y += this.speed * speedMult;
            // 画面外（下）に出たらダメージ
            if (this.y > canvas.height + 20) {
                hp -= 5;
                addLog("!! BREACH_DETECTED: NODE_REACHED_CORE !!", "error");
                this.hp = -100; // 消去フラグ
            }
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

        // 味方化時の挙動: 指定された間隔で付近の敵に弾を撃つ
        if (this.isAlly) {
            this.color = '#0ff'; // 味方カラー
            const now = Date.now();
            if (now - (this.lastShotTime || 0) > 1200) {
                let nearest = null;
                let minDist = 500;
                for (let e of enemies) {
                    if (e !== this && !e.isAlly) {
                        const d = Math.hypot(e.x - this.x, e.y - this.y);
                        if (d < minDist) { minDist = d; nearest = e; }
                    }
                }
                if (nearest) {
                    const ang = Math.atan2(nearest.y - this.y, nearest.x - this.x);
                    bullets.push({
                        x: this.x, y: this.y, vx: Math.cos(ang) * 10, vy: Math.sin(ang) * 10,
                        color: '#0ff', size: 1.0, life: 100, attacker: 'ally', damage: 50
                    });
                    this.lastShotTime = now;
                }
            }

            // ウイルス拡散 (Viral Hacking): 付近の敵にスレッドを伸ばす
            if (now - (this.lastViralTime || 0) > 3000) {
                let targetEnemy = null;
                let minDist = 300;
                for (let e of enemies) {
                    if (e !== this && !e.isAlly && !e.isTetheredByAlly) {
                        const d = Math.hypot(e.x - this.x, e.y - this.y);
                        if (d < minDist) { minDist = d; targetEnemy = e; }
                    }
                }
                if (targetEnemy) {
                    const speed = 12;
                    const angle = Math.atan2(targetEnemy.y - this.y, targetEnemy.x - this.x);
                    threads.push({
                        x: this.x, y: this.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        active: false,
                        target: null,
                        ownerId: `ally_${this.targetId || Math.random()}`,
                        life: 60, baseLife: 60, width: 1.5,
                        drainRate: 0.3, // 味方のハックは少し遅い
                        isAllyThread: true
                    });
                    targetEnemy.isTetheredByAlly = true; // 重複防止
                    this.lastViralTime = now;
                }
            }
        }
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

        const hpRatio = this.hp / this.maxHp;

        // HPによる色の変化とグリッチオフセット
        let glitchX = 0;
        let glitchY = 0;
        let pColor = '0, 255, 255';

        if (this.type === 'tank') pColor = '255, 136, 0';
        else if (this.type === 'speed') pColor = '255, 255, 0';
        else if (this.type === 'shooter') pColor = '255, 0, 255';

        // HPが減ると色が赤みを帯び、形状がブレる
        if (hpRatio <= 0.5) {
            pColor = '255, 100, 100'; // 危険状態色
            if (hpRatio <= 0.25) {
                pColor = '255, 0, 0'; // 瀕死
                glitchX = (Math.random() - 0.5) * 4;
                glitchY = (Math.random() - 0.5) * 4;
            }
        }
        ctx.translate(glitchX, glitchY); // グリッチ適用

        // 敵タイプ別の描画形状
        if (this.type === 'tank') {
            ctx.lineWidth = 3;
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${pColor}, 0.4)`;
            ctx.strokeStyle = `rgba(${pColor}, 1.0)`;
        } else if (this.type === 'speed') {
            ctx.moveTo(0, 15);
            ctx.lineTo(12, -12);
            ctx.lineTo(-12, -12);
            ctx.fillStyle = `rgba(${pColor}, 0.4)`;
            ctx.strokeStyle = `rgba(${pColor}, 1.0)`;
        } else if (this.type === 'shooter') {
            ctx.moveTo(-15, -12);
            ctx.lineTo(15, -12);
            ctx.lineTo(0, 15);
            ctx.fillStyle = `rgba(${pColor}, 0.4)`;
            ctx.strokeStyle = `rgba(${pColor}, 1.0)`;
        } else {
            ctx.moveTo(0, -16);
            ctx.lineTo(16, 0);
            ctx.lineTo(0, 16);
            ctx.lineTo(-16, 0);
            ctx.fillStyle = `rgba(${pColor}, 0.3)`;
            ctx.strokeStyle = `rgba(${pColor}, 1.0)`;
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        // 追加のノイズ(体力が減るほど増加)
        const noiseAmount = (this.noiseLevel || 0) + (hpRatio < 0.5 ? Math.floor((0.5 - hpRatio) * 10) : 0);
        if (noiseAmount > 0) {
            ctx.fillStyle = '#f00';
            for (let i = 0; i < noiseAmount; i++) {
                ctx.fillRect((Math.random() - 0.5) * 35, (Math.random() - 0.5) * 35, 2, 2);
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

        // ハッキング進捗ゲージ (頭上に表示)
        if (this.hackingProgress > 0 && !this.isAlly) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(this.x - 20, this.y - 35, 40, 4);
            ctx.fillStyle = '#0ff';
            ctx.fillRect(this.x - 20, this.y - 35, 40 * this.hackingProgress, 4);
        }
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
        this.y = 80;
        this.hp = hp;
        this.maxHp = hp;
        this.name = name;
        this.isBoss = true;
        this.state = 'active';
        this.attackTimer = 300; // 5秒ごとに攻撃
        this.angle = 0;
        this.speed = 0;
    }

    update(speedMult) {
        this.angle += 0.02;
        this.attackTimer--;

        if (this.attackTimer <= 0) {
            // ボス攻撃
            hp -= 15;
            addLog(`!! BOSS_ATTACK: EXECUTION_ERROR !!`, 'error');
            screenShake = 15;
            createExplosion(player.x, player.y, '#f00', 50);
            this.attackTimer = 240 + Math.random() * 120; // 次の攻撃
        }

        // 陣形維持 (少し左右に揺れる)
        this.x = canvas.width / 2 + Math.sin(Date.now() / 1000) * 100;
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

        if (this.name === 'MASTER_CORE' || (isTowerMode ? bossesDefeated >= 1 : bossesDefeated >= 3)) {
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
    energyGauge = 0; // リセット
    player.subShipAutoMode = true; // リセット
    score = 0;
    gameOver = false;
    gameActive = true;
    isHacking = false;
    hackingStack = []; // 通常モード開始時にスタックをリセット
    player.x = canvas.width / 2;
    player.y = canvas.height - 80;
    
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
    enemies = []; bullets = []; enemyBullets = []; bits = []; particles = []; vortices = []; threads = [];
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

    // タワーモードのフロアクリア判定 (ボス撃破)
    if (isTowerMode && !towerState.isClearing) {
        const boss = enemies.find(e => e.isBoss);
        if (boss && boss.hp <= 0) {
            towerState.isClearing = true;
            addLog("▶ MISSION_COMPLETE: BOSS_NEUTRALIZED", "hack");
            setTimeout(() => {
                towerState.bits = playerBits;
                TowerManager.clearFloor();
            }, 3000);
        }
    }

    // プレイヤー位置を固定 (下側)
    player.y = canvas.height - 100;
    player.x = canvas.width / 2;

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

    if (towerState.skillCooldown > 0) {
        towerState.skillCooldown--;
    }

    // 決死の覚悟 [passive-blood-pact] (自傷ダメージ)
    if (player.isBloodPact && gameActive && !gameOver) {
        hp -= 0.05; // 毎フレーム微減
        if (hp <= 0) takeDamage(0.1); // 死なないようにtakeDamage経由で処理
    }

    updateUI();

    // プレイヤー移動 (固定砲台: 下部中央)
    player.x = canvas.width / 2;
    player.y = canvas.height - 80;
    player.moveX = 0;
    player.moveY = 0;

    // 新メイン攻撃：スレッド（糸）射出 (制限撤廃)
    if (keys[' '] || keys['Space']) {
        const activeThreads = (typeof threads !== "undefined" ? threads : []).filter(t => t.active || Math.hypot(t.x - (t.originX || player.x), t.y - (t.originY || player.y)) > 0).length;
        const threadCooldown = 150 * (1 - (player.threadRateBonus || 0));
        if (now - (player.lastThreadTime || 0) > threadCooldown) {
            const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
            const speed = 15 * (1 + (player.threadSpeedBonus || 0));
            threads.push({
                originX: player.x, originY: player.y,
                x: player.x, y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                active: false,
                target: null,
                life: 80 + (player.threadMaxLengthBonus || 0),
                baseLife: 80 + (player.threadMaxLengthBonus || 0),
                width: 2 + (player.threadWidthBonus || 0),
                isHoming: player.hasThreadHoming || false,
                drainRate: 0.5 * (1 + (player.drainSpeedBonus || 0)),
                ownerType: 'player'
            });
            player.lastThreadTime = now;
        }
    }
    // ワンタップ射出化：離した瞬間の削除を廃止

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

    // Cキー: ハッキング (通常モード)
    if (keys['c'] || keys['C']) {
        if (!isTowerMode) {
            if (hackGauge >= 100 && !isHacking) {
                openHackingScreen();
            }
        }
    }

    // Sキー: コンパイル (タワーモードのスキル等もここに統合可能)
    if (keys['s'] || keys['S']) {
        if (!isTowerMode) {
            if (now - (player.lastCompileTime || 0) > 1000) {
                executeCompile(now);
                player.lastCompileTime = now;
            }
        } else {
            // タワーモードのスキル発動 (HackGauge 100%消費)
            if (player.currentTowerSkill && hackGauge >= 100 && gameActive && !gameOver) {
                if (player.currentTowerSkill === 'missile_strike') {
                    activateTowerSkill('missile_strike');
                } else {
                    activateTowerSkill(player.currentTowerSkill);
                    hackGauge = 0;
                }
                keys['s'] = false; keys['S'] = false;
            }
        }
    }

    // Shiftキー: サブ機召喚モード切替 (Auto / Manual)
    if (keys['Shift']) {
        player.subShipAutoMode = !player.subShipAutoMode;
        addLog(`▶ SUB_SHIP_MODE: ${player.subShipAutoMode ? 'AUTO' : 'MANUAL'}`, "hack");
        keys['Shift'] = false;
    }

    // Aキー: 一斉起爆 (Detonate)
    if ((keys['a'] || keys['A'])) {
        triggerDetonation();
        keys['a'] = false; keys['A'] = false;
    }

    // オート召喚ロジック (Autoモード時)
    if (player.subShipAutoMode && energyGauge >= 50 && (player.subShips || 0) < 4) {
        if (now - (player.lastSubShipTime || 0) > 1000) {
            energyGauge -= 50;
            player.subShips = (player.subShips || 0) + 1;
            addLog(`▶ AUTO_SUMMON: SUB_SHIP`, "hack");
            player.lastSubShipTime = now;
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
    const towerSpawnMult = isTowerMode ? (1 + (towerState.currentFloor - 1) * 0.02) : 1.0; 
    let dynamicSpawnRate = ENEMY_SPAWN_RATE * (1 + playerPowerLevel * 2.0) * (1 + bossesDefeated * 0.8) * towerSpawnMult;
    if (isTowerMode) dynamicSpawnRate *= 0.3; // タワーモード専用スポーン大幅減
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
    if (typeof updateThreads === 'function') updateThreads(now);
    updateProjectiles(now);
    updateTowerMissiles();
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

function triggerDetonation() {
    let explodedAny = false;
    let totalBlastDamage = 0;
    const boss = enemies.find(e => e.isBoss);

    enemies.forEach(e => {
        if (e.isBoss) return;
        const connectedThreads = (typeof threads !== "undefined" ? threads : []).filter(t => t.active && t.target === e);
        const count = connectedThreads.length;

        if (count > 0) {
            // ダメージ計算: (基本50 + 接続数 * 50) * 接続数 (垂直爆破シナジー効果)
            const damage = (50 + count * 50) * count;
            e.hp = -1; // 爆破消滅
            totalBlastDamage += damage;
            explodedAny = true;

            // 演出: 敵からボスへのエネルギーライン
            if (boss) {
                for (let i = 0; i < 5; i++) {
                    particles.push({
                        x: e.x, y: e.y,
                        vx: (boss.x - e.x) / 20 + (Math.random() - 0.5) * 5,
                        vy: (boss.y - e.y) / 20 + (Math.random() - 0.5) * 5,
                        color: count > 3 ? '#ffdd00' : '#0ff',
                        life: 20
                    });
                }
            }

            createExplosion(e.x, e.y, '#f00', 30 * count);
            connectedThreads.forEach(t => { t.life = 0; });
        }
    });

    if (explodedAny && boss) {
        boss.hp -= totalBlastDamage;
        screenShake = Math.min(40, 10 + (totalBlastDamage / 50));
        addLog(`▶ OVERLOAD_BLAST -> BOSS: ${Math.floor(totalBlastDamage)} DMG`, "hack");
    } else if (!boss) {
        addLog("▶ ERROR: BOSS_NOT_DETECTED", "error");
    } else {
        addLog("▶ ERROR: NO_NODE_CONNECTED", "error");
    }
}

function updateThreads(now) {
    if (typeof threads === "undefined") return;

    const activeThreads = threads.filter(t => t.active);

    threads = threads.filter(t => {
        if (!t.active) {
            t.x += t.vx;
            t.y += t.vy;
            let ox = player.x; let oy = player.y;
            if (t.ownerId && t.ownerId.startsWith('subship_')) {
                const i = parseInt(t.ownerId.split('_')[1]);
                const angle = (now / 1000) + (i * Math.PI * 2 / Math.max(1, player.subShips || 1));
                ox = player.x + Math.cos(angle) * 50;
                oy = player.y + Math.sin(angle) * 50;
            }
            const dist = Math.hypot(t.x - ox, t.y - oy);
            if (dist > t.baseLife * 10) return false;

            let hitEnemy = null;
            for (let e of enemies) {
                if (Math.hypot(e.x - t.x, e.y - t.y) < 20 + t.width) {
                    hitEnemy = e;
                    break;
                }
            }
            if (hitEnemy) {
                t.active = true;
                t.target = hitEnemy;
            }

            if (t.isHoming && !t.active) {
                let nearest = null;
                let minDist = 300;
                for (let e of enemies) {
                    const d = Math.hypot(e.x - t.x, e.y - t.y);
                    if (d < minDist) { minDist = d; nearest = e; }
                }
                if (nearest) {
                    const angle = Math.atan2(nearest.y - t.y, nearest.x - t.x);
                    const speed = Math.hypot(t.vx, t.vy);
                    t.vx += Math.cos(angle) * speed * 0.1;
                    t.vy += Math.sin(angle) * speed * 0.1;
                    const newSpeed = Math.hypot(t.vx, t.vy);
                    t.vx = (t.vx / newSpeed) * speed;
                    t.vy = (t.vy / newSpeed) * speed;
                }
            }
        } else {
            if (!t.target || t.target.hp <= 0 || !enemies.includes(t.target)) {
                return false;
            }
            t.x = t.target.x;
            t.y = t.target.y;
            t.target.isTethered = true; // 敵の移動を停止

            // ハッキング進捗の蓄積 (ダメージは与えない)
            if (!t.target.isAlly) {
                t.target.hackingProgress = Math.min(1, (t.target.hackingProgress || 0) + (t.drainRate || 0.5) * 0.05);
                if (t.target.hackingProgress >= 1) {
                    t.target.isAlly = true;
                    towerState.dominatedCount = (towerState.dominatedCount || 0) + 1; // 支配数加算
                    addLog(`▶ SYSTEM_DOMINATED: ${t.target.targetId || 'NODE'}`, "hack");
                    createExplosion(t.target.x, t.target.y, '#0ff', 10);
                }
            }

            hackGauge = Math.min(100, (hackGauge || 0) + t.drainRate * 0.5);
            energyGauge = Math.min(100, (energyGauge || 0) + t.drainRate * 2.0);
            score += t.drainRate * 10;

            if (Math.random() < 0.2) {
                particles.push({
                    x: t.target.x,
                    y: t.target.y,
                    vx: (Math.random() - 0.5) * 2,
                    vy: (Math.random() - 0.5) * 2,
                    color: t.target.isAlly ? '#0ff' : '#f00',
                    life: 20,
                    size: 2
                });
            }
        }
        return true;
    });
}

function drawThreads(ctx) {
    if (typeof threads === "undefined") return;
    const now = Date.now();
    threads.forEach(t => {
        let ox = t.originX || player.x;
        let oy = t.originY || player.y;

        // 接続相手がいる場合、起点をオーナーの現在位置に更新 (動くサブ機など)
        if (t.ownerId && t.ownerId.startsWith('subship_')) {
            const idx = parseInt(t.ownerId.split('_')[1]);
            const angle = (now / 1000) + (idx * Math.PI * 2 / Math.max(1, player.subShips));
            ox = player.x + Math.cos(angle) * 60;
            oy = player.y + Math.sin(angle) * 60;
        } else if (t.ownerType === 'player') {
            ox = player.x; oy = player.y;
        }
        if (t.ownerId && t.ownerId.startsWith('subship_')) {
            const i = parseInt(t.ownerId.split('_')[1]);
            const angle = (now / 1000) + (i * Math.PI * 2 / Math.max(1, player.subShips || 1));
            ox = player.x + Math.cos(angle) * 50;
            oy = player.y + Math.sin(angle) * 50;
        } else if (t.ownerId && t.ownerId.startsWith('ally_')) {
            // 味方機（Viral Hacking）のスレッド起点
            const ally = enemies.find(e => e.isAlly && e.targetId === t.ownerId.split('_')[1]);
            if (ally) { ox = ally.x; oy = ally.y; }
        }
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(t.x, t.y);
        // ハッキング中は進捗に応じた色
        if (t.active && t.target) {
            const r = Math.floor(255 * (1 - t.target.hackingProgress));
            const g = Math.floor(255 * t.target.hackingProgress);
            ctx.strokeStyle = `rgb(${r}, ${g}, 255)`;
        } else {
            ctx.strokeStyle = '#4444ff';
        }
        ctx.lineWidth = t.width || 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(t.x, t.y, t.width * 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    });
}

function executeCompile(now) {
    if (typeof threads === "undefined" || threads.length === 0) return;

    let cost = 100;
    if (Math.random() * 100 < (player.compileFreeChance || 0)) {
        cost = 0;
        addLog("▶ ENERGY_SAVED (FREE COMPILE)", "hack");
    }

    if (hackGauge < cost) {
        addLog(`▶ ENERGY_LOW: コンパイル不可 (Need ${cost}%)`, "error");
        return;
    }
    hackGauge -= cost;

    let compileDamage = 150 * (1 + (player.compileDamageBonus || 0));
    let explosionSize = 60 * (1 + (player.compileSizeBonus || 0));
    let isCrit = Math.random() < (player.compileCritChance || 0);

    if (isCrit) compileDamage *= 2;

    const connectedTargets = [];
    threads.forEach(t => {
        if (t.active && t.target) {
            if (!connectedTargets.includes(t.target)) connectedTargets.push(t.target);
            if (t.chains) {
                t.chains.forEach(c => {
                    if (!connectedTargets.includes(c)) connectedTargets.push(c);
                });
            }
        }
    });

    if (connectedTargets.length > 0) {
        addLog(isCrit ? "▶ CRITICAL COMPILE!" : "▶ COMPILE EXECUTED", "hack");
    }

    connectedTargets.forEach(target => {
        target.hp -= compileDamage;
        createExplosion(target.x, target.y, '#ff4444', explosionSize / 30);

        enemies.forEach(e => {
            if (e !== target && Math.hypot(e.x - target.x, e.y - target.y) < explosionSize) {
                e.hp -= compileDamage * 0.5;
            }
        });

        if (target.hp > 0 && player.hasCompilePursuit) {
            setTimeout(() => {
                if (enemies.includes(target) && target.hp > 0) {
                    target.hp -= compileDamage * 0.3;
                    createExplosion(target.x, target.y, '#ff8800', 1);
                }
            }, 300);
        }
    });

    threads = [];
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
            towerBossDamageMult: player.towerBossDamageMult || 1.0,
            hasFrag: player.hasFrag,
            fragLevel: player.fragLevel,
            hasBurn: player.hasBurn,
            burnLevel: player.burnLevel,
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
        const subX = player.x + Math.cos(baseAngle + Math.PI / 2) * offset;
        const subY = player.y + Math.sin(baseAngle + Math.PI / 2) * offset;
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

function updateTowerMissiles() {
    towerMissiles = towerMissiles.filter(m => {
        m.progress += m.speed;
        m.x = m.startX + (m.targetX - m.startX) * m.progress;
        // Parabolic arc for vertical Y
        m.y = m.startY + (m.targetY - m.startY) * m.progress - Math.sin(m.progress * Math.PI) * 200;

        if (m.progress >= 1) {
            createExplosion(m.targetX, m.targetY, '#f80', 250);
            createExplosion(m.targetX, m.targetY, '#fff', 150);
            enemies.forEach(e => {
                if (Math.hypot(e.x - m.targetX, e.y - m.targetY) < 250) {
                    e.hp -= 300 * (player.towerDamageMult || 1.0); // 大ダメージ
                }
            });
            screenShake = 20; // 画面揺れ追加
            return false;
        }
        return true;
    });
}

function activateTowerSkill(skillId) {
    if (!gameActive) return;

    switch (skillId) {
        case 'debugger_shield':
            player.hasDebuggerShield = true;
            addLog("SKILL: デバッガー・シールド展開", "hack");
            setTimeout(() => { player.hasDebuggerShield = false; addLog("SHIELD_OFF", "hack"); }, 5000);
            break;
        case 'overclock':
            player.isOverclocked = true;
            addLog("SKILL: オーバークロック開始", "hack");
            setTimeout(() => {
                player.isOverclocked = false;
                player.isCoolingDown = true;
                addLog("OVERCLOCK_END: 冷却状態", "error");
                setTimeout(() => {
                    player.isCoolingDown = false;
                    addLog("COOLING_COMPLETE", "hack");
                }, 3000);
            }, 5000);
            break;
        case 'logic_chain':
            player.hasLogicChainActive = true;
            addLog("SKILL: ロジック・チェーン起動", "hack");
            setTimeout(() => { player.hasLogicChainActive = false; addLog("LOGIC_CHAIN_OFF", "hack"); }, 8000);
            break;
        case 'rewrite_code':
            addLog("SKILL: リライト・コード送信", "hack");
            // 半径300以内の敵をハック
            enemies.forEach(e => {
                if (Math.hypot(e.x - player.x, e.y - player.y) < 300 && !e.isBoss) {
                    e.isHacked = true;
                }
            });
            break;
        case 'missile_strike':
            player.isTargetingMissile = true;
            player.isSlowMotion = true; // 時間減速開始
            addLog("SKILL: 攻撃座標を指定してください", "hack");
            break;
        case 'code_burst':
            player.isTimeStopped = true; // 既存の時間を止めるフラグを流用
            addLog("SKILL: コード・バースト (無限ループ)", "hack");
            setTimeout(() => {
                player.isTimeStopped = false;
                addLog("LOOP_END: ダメージ清算", "hack");
                // 凍結中のダメージをバースト
                enemies.forEach(e => {
                    if (e.frozenDamage && e.frozenDamage > 0) {
                        e.hp -= e.frozenDamage;
                        createExplosion(e.x, e.y, '#f00', Math.min(50, e.frozenDamage));
                        e.frozenDamage = 0;
                    }
                });
            }, 5000);
            break;
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
            // 自分自身や味方は撃たない
            if (b.attacker === 'ally' && e.isAlly) continue;
            if (!e.isAlly && (b.attacker === 'player' || b.attacker === 'subship' || b.attacker === 'ally')) {
                if (Math.hypot(e.x - b.x, e.y - b.y) < e.w / 2 + b.size * 5) {
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

                    // ダメージ適用 (Blood Pact・Drillの係数 + デコイシナジー + 残響 + タワーボス補正)
                    let damage = (b.damage || 1) * (player.decoyDamageBoost || 1) * (e.vulnerableTimer > 0 ? 1.5 : 1.0);
                    if (e.isBoss && b.towerBossDamageMult) damage *= b.towerBossDamageMult;

                    if (player.isTimeStopped) {
                        e.frozenDamage = (e.frozenDamage || 0) + damage;
                    } else {
                        e.hp -= damage;
                    }

                    // 生命吸収 [towerLifeSteal]
                    if (player.towerLifeSteal) {
                        hp = Math.min(player.towerMaxHP || MAX_HP, hp + damage * player.towerLifeSteal);
                    }

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
                        // 破片飛散 [hasFrag]
                        if (b.hasFrag) {
                            for (let j = 0; j < 3 + b.fragLevel; j++) {
                                const fAngle = Math.random() * Math.PI * 2;
                                bullets.push({
                                    x: b.x, y: b.y, vx: Math.cos(fAngle) * 5, vy: Math.sin(fAngle) * 5,
                                    color: '#ff0', size: 0.5, life: 30, damage: b.damage * 0.3
                                });
                            }
                        }
                        // 残火発生 [hasBurn]
                        if (b.hasBurn) {
                            particles.push({
                                x: b.x, y: b.y, vx: 0, vy: 0, life: 120, type: 'burn_floor', level: b.burnLevel
                            });
                        }
                        return false;
                    }
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
            if (typeof e.die === 'function') Object;
            if (player.corpseExplosion) {
                createExplosion(e.x, e.y, '#f00', 5);
                for (let e2 of enemies) { if (Math.hypot(e2.x - e.x, e2.y - e.y) < 80) e2.hp -= 1; }
            }
            if (isTowerMode) {
                createExplosion(e.x, e.y, '#f80', 80); // 巨大爆発エフェクト
                for (let e2 of enemies) {
                    if (e2 !== e && Math.hypot(e2.x - e.x, e2.y - e.y) < 100) {
                        e2.hp -= 30 * (player.towerDamageMult || 1.0); // 巻き込みダメージ
                        createExplosion(e2.x, e2.y, '#f40', 20); // バチバチ
                    }
                }
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
        if (p.type === 'burn_floor') {
            p.life--;
            enemies.forEach(e => {
                if (Math.hypot(e.x - p.x, e.y - p.y) < 40) {
                    e.hp -= 0.1 * (p.level || 1);
                }
            });
            return p.life > 0;
        }
        p.x += p.vx; p.y += p.vy;
        p.life--; return p.life > 0;
    });
}

function takeDamage(amount, type = null) {
    if (player.hasDebuggerShield) {
        if (Math.random() < 0.2) addLog("SHIELD_BLOCK: 攻撃を無効化", "info");
        createExplosion(player.x, player.y, '#0af', 15);
        return;
    }
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

    // Code Burst 演出
    if (player.isTimeStopped) {
        ctx.fillStyle = 'rgba(0, 5, 0, 0.8)'; // 暗め
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = '10px monospace';
        for (let i = 0; i < 15; i++) {
            ctx.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), Math.random() * canvas.width, Math.random() * canvas.height);
        }
    } else {
        ctx.fillStyle = 'rgba(0, 5, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 暗闇演出
    if (isTowerMode && towerState.currentTrouble === 'darkness') {
        ctx.save();
        ctx.beginPath();
        // 自機周りだけ円形にくり抜く
        ctx.arc(player.x, player.y, 250, 0, Math.PI * 2); // 120 -> 250 (Wides the view area)
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

    // 自機直上のステータスバー (HP) - 回転しないようにrestoreの後に配置
    ctx.save();
    ctx.translate(player.x, player.y);
    const barW = 40;
    const barH = 5;
    const barY = -40;
    // HP Bar
    ctx.fillStyle = 'rgba(0, 50, 0, 0.5)';
    ctx.fillRect(-barW / 2, barY, barW, barH);
    ctx.fillStyle = '#00ff41';
    ctx.fillRect(-barW / 2, barY, barW * (hp / MAX_HP), barH);

    // Thread Stock Indicator (5 dots)
    const currentActiveThreads = (typeof threads !== "undefined" ? threads : []).filter(t => t.active || Math.hypot(t.x - player.x, t.y - player.y) > 0).length;
    const maxThreadsCount = 5 + (player.bonusThreads || 0);
    const dotW = 6;
    const dotSpacing = 2;
    const totalDotW = (dotW + dotSpacing) * maxThreadsCount - dotSpacing;
    const dotY = barY - 8; // HPバーの少し上

    for (let i = 0; i < maxThreadsCount; i++) {
        const dx = -totalDotW / 2 + i * (dotW + dotSpacing);
        ctx.fillStyle = (i < currentActiveThreads) ? '#444' : '#0ff'; // 使用中は暗く、ストックはシアン
        ctx.fillRect(dx, dotY, dotW, 4);
        if (i >= currentActiveThreads) {
            ctx.shadowBlur = 5;
            ctx.shadowColor = '#0ff';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(dx, dotY, dotW, 4);
            ctx.shadowBlur = 0;
        }
    }
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

    // オプション（サブ機）の描画アップグレード
    const nowMs = Date.now();
    for (let i = 0; i < player.subShips; i++) {
        const angle = (nowMs / 1000) + (i * Math.PI * 2 / Math.max(1, player.subShips));
        const sx = player.x + Math.cos(angle) * 60;
        const sy = player.y + Math.sin(angle) * 60;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(nowMs / 500); // 自身も回転
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // 六角形コアの見た目
        for (let j = 0; j < 6; j++) {
            ctx.lineTo(Math.cos(j * Math.PI / 3) * 12, Math.sin(j * Math.PI / 3) * 12);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
        ctx.fill();

        // 中心部分
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();

        // 自機とのリンク線
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // スレッド描画
    if (typeof drawThreads === 'function') drawThreads(ctx);

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

    // タワーミサイル描画
    towerMissiles.forEach(m => {
        ctx.fillStyle = '#f80';
        ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        // ターゲット地点を示すレティクル
        ctx.strokeStyle = '#f00'; ctx.beginPath(); ctx.arc(m.targetX, m.targetY, 250 * m.progress, 0, Math.PI * 2); ctx.stroke();
    });

    // ターゲット指定モード時のオーバーレイ
    if (player.isTargetingMissile) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '24px monospace';
        ctx.textAlign = 'center'; ctx.fillText(">> SELECT TARGET LOCATION <<", canvas.width / 2, canvas.height / 2 - 50);

        ctx.strokeStyle = '#f00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mouseX, mouseY, 40, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mouseX - 50, mouseY); ctx.lineTo(mouseX + 50, mouseY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mouseX, mouseY - 50); ctx.lineTo(mouseX, mouseY + 50); ctx.stroke();
    }

    // 敵弾描画
    ctx.fillStyle = '#f11';
    enemyBullets.forEach(eb => {
        ctx.fillRect(eb.x - 3, eb.y - 3, 6, 6);
    });

    // 敵描画
    enemies.forEach(e => e.draw());

    // フィールド境界線
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.5)';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, BATTLE_FIELD_HEIGHT);
    ctx.lineTo(canvas.width, BATTLE_FIELD_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // スワイプの糸描画
    if (isSwiping && swipeConnectedBits.length > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        swipeConnectedBits.forEach((b, i) => {
            if (i === 0) ctx.moveTo(b.x, b.y);
            else ctx.lineTo(b.x, b.y);
        });
        ctx.stroke();
        
        // 最後のビットから現在のポインタ位置まで線を引く（任意）
        // if (swipeConnectedBits.length > 0) { ... }
    }

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
        } else if (p.type === 'burn_floor') {
            ctx.fillStyle = `rgba(255, ${Math.random() * 100}, 0, ${p.life / 120})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
            ctx.fill();
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
        ctx.moveTo(rx, ry + ri); ctx.lineTo(rx, ry + ro + gap);
        ctx.moveTo(rx - ro - gap, ry); ctx.lineTo(rx - ri, ry);
        ctx.moveTo(rx + ri, ry); ctx.lineTo(rx + ro + gap, ry);
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

    // --- システム演出オーバーレイ ---
    if (isTowerMode) {
        // フロア開始演出 (SYSTEM INITIALIZING)
        if (towerState.startAnimTimer > 0) {
            towerState.startAnimTimer--;
            const alpha = Math.min(1, towerState.startAnimTimer / 60);
            ctx.fillStyle = `rgba(0, 20, 10, ${alpha * 0.8})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = 'bold 45px "Courier New", monospace';
            ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 15; ctx.shadowColor = '#0f0';
            ctx.fillText(`SYSTEM_INITIALIZING_FLOOR_${towerState.currentFloor}`, canvas.width / 2, canvas.height / 2);
            ctx.font = '16px "Courier New", monospace';
            ctx.fillText("BOOTING_NEURAL_INTERFACE... SUCCESS", canvas.width / 2, canvas.height / 2 + 40);
            ctx.shadowBlur = 0;
        }

        // フロア支配完了演出 (DOMINATION COMPLETE)
        if (towerState.isClearing) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.font = 'bold 50px "Courier New", monospace';
            ctx.fillStyle = '#0ff';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 20; ctx.shadowColor = '#0ff';
            ctx.fillText("DOMINATION_COMPLETE", canvas.width / 2, canvas.height / 2);
            ctx.font = '20px "Courier New", monospace';
            ctx.fillText("NETWORK_SECURED: ACCESSING_NEXT_SEGMENT...", canvas.width / 2, canvas.height / 2 + 50);
            ctx.shadowBlur = 0;

            // 画面のグリッチ
            if (Math.random() < 0.1) {
                ctx.fillStyle = 'rgba(0, 255, 255, 0.2)';
                ctx.fillRect(0, Math.random() * canvas.height, canvas.width, 2);
            }
        }
    }
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
