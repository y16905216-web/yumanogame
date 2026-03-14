const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 480;
canvas.height = 640;

// --- 1. 定数・初期設定 ---
const MAX_HP = 100;
const PLAYER_SPEED = 5;
const ENEMY_SPAWN_RATE = 0.015;
const HACK_DURATION = 5000; // ハック成功時のログ表示時間

// --- 2. ゲーム状態 ---
let hp = MAX_HP;
let hackGauge = 0;
let score = 0;
let startTime = 0;
let gameOver = false;
let gameActive = false;
let lastTime = performance.now();

let player = {
    x: canvas.width / 2, y: canvas.height - 80, w: 30, h: 30,
    speed: PLAYER_SPEED, fireRate: 180, multiShot: 0, piercing: false, shield: 0,
    activePrograms: [], // 実行中の [IF, THEN] のペア
    subShips: [] // サブ自機の配列
};
let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = []; // パーティクル配列
let logs = [];
let codeRain = [];
let isHacking = false;
let slowTimer = 0; // 追加: 敵の減速タイマー
let isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

if (isMobile) {
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
});
window.addEventListener('keyup', e => keys[e.key] = false);

// --- 4. クラス定義 ---
class Enemy {
    constructor() {
        this.id = Math.floor(Math.random() * 9999);
        this.x = Math.random() * (canvas.width - 40) + 20;
        this.y = -50;
        this.w = 30;
        this.h = 30;
        this.hp = 2;
        this.speed = 2 + Math.random() * 2;
        this.color = '#f44';
        this.fireTimer = Math.random() * 1000; // 発射タイマー
    }

    update(timeScale = 1.0) {
        this.y += this.speed * timeScale;

        this.fireTimer += 16 * timeScale; // 時間減速の影響を受けるタイマー
        if (this.fireTimer > 1500 + Math.random() * 1000) {
            enemyBullets.push({ x: this.x, y: this.y + 15, vy: 4, color: '#f00' });
            this.fireTimer = 0;
        }
    }

    draw() {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
        ctx.fillStyle = this.color;
        ctx.font = '10px monospace';
        ctx.fillText(`ID_${this.id}`, this.x - 15, this.y + 5);
    }
}

// --- 5. UI更新・ハッキング画面ロジック ---
// 利用可能なブロック定義 (条件ブロックと行動ブロック)
const AVAILABLE_CONDITIONS = [
    { id: 'if-always', type: 'condition', label: '常に', desc: '常時発動し続ける' },
    { id: 'if-shoot', type: 'condition', label: '弾を撃つ時', desc: '自機が弾を発射した時に発動' },
    { id: 'if-hit', type: 'condition', label: '弾が当たった時', desc: '敵に弾が命中した時に発動' },
    { id: 'if-hp50', type: 'condition', label: 'HP<50%なら', desc: 'HPが50%以下の時に発動' },
    { id: 'if-3sec', type: 'condition', label: '3秒ごとに', desc: '3秒経過するたびに発動' },
    { id: 'if-close', type: 'condition', label: '敵が近い時', desc: '一定範囲内に敵がいると発動' },
    { id: 'if-graze', type: 'condition', label: '弾にかすった時', desc: '敵弾がギリギリを通ると発動' }
];

const AVAILABLE_ACTIONS = [
    { id: 'speed1', type: 'speed', label: 'SYS.SPEED_UP', desc: '移動速度アップ' },
    { id: 'fire1', type: 'fireRate', label: 'SYS.OVERDRIVE', desc: '連射速度アップ' },
    { id: 'multi1', type: 'multi', label: 'WPN.DIFFUSION', desc: '弾の拡散数増加 (3WAY/5WAY)' },
    { id: 'heal1', type: 'heal', label: 'SYS.REPAIR', desc: 'HPを回復 (条件満たすたび)' },
    { id: 'shield1', type: 'shield', label: 'DEF.SHIELD', desc: 'シールドを展開' },
    { id: 'pierce1', type: 'pierce', label: 'WPN.PIERCING', desc: '弾が敵を貫通する' },
    { id: 'split1', type: 'split', label: 'WPN.SPLIT', desc: '弾が命中時に分裂する' },
    { id: 'subship1', type: 'subship', label: 'SYS.OPTION', desc: 'サブ自機が出現して一緒に攻撃' },
    { id: 'magnet1', type: 'magnet', label: 'SYS.MAGNET', desc: '敵を中心へ吸引する' },
    { id: 'homing1', type: 'homing', label: 'WPN.HOMING', desc: '発射する弾が敵を自動追尾する' },
    { id: 'bomb1', type: 'bomb', label: 'WPN.BOMB', desc: '周囲にダメージを与える爆発を起こす' },
    { id: 'slow1', type: 'slow', label: 'SYS.TIME_SLOW', desc: '一定時間、敵と敵弾の動きを遅くする' }
];

// 行ごとのスロット状態 (最大1行に制限)
let logicRows = [
    { if: null, then: null }
];

function addLog(msg, type = '') {
    const container = document.getElementById('log-container');
    const div = document.createElement('div');
    div.className = `log-message ${type}`;
    div.textContent = `> ${msg}`;
    container.appendChild(div);
    if (container.children.length > 5) container.removeChild(container.firstChild);
    setTimeout(() => { if (div.parentNode) container.removeChild(div); }, 5000);
}

function updateUI() {
    const min = Math.floor(score / 60);
    const sec = Math.floor(score % 60);
    document.getElementById('score-count').textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    document.getElementById('hp-bar').style.width = (Math.max(0, hp) / MAX_HP * 100) + '%';

    const hackBar = document.getElementById('hack-bar');
    if (hackBar) hackBar.style.width = hackGauge + '%';
    const hackPercent = document.getElementById('hack-percentage');
    if (hackPercent) hackPercent.textContent = hackGauge + '%';

    const readyText = document.getElementById('hack-ready-text');
    if (readyText) {
        if (hackGauge >= 100) {
            readyText.textContent = "[ READY_TO_HACK ]";
            readyText.classList.add('hack-ready');
        } else {
            readyText.textContent = "(GATHERING_DATA)";
            readyText.classList.remove('hack-ready');
        }
    }
}

// パレットとスロットの描画
function renderHackConsole() {
    const paletteIf = document.getElementById('palette-if');
    const paletteThen = document.getElementById('palette-then');

    // パレットIF再描画
    if (paletteIf) {
        paletteIf.innerHTML = '';
        AVAILABLE_CONDITIONS.forEach(mod => {
            const div = document.createElement('div');
            div.className = `hack-item type-${mod.type}`;
            div.textContent = mod.label;
            div.title = mod.desc;
            div.onclick = () => moveToSlot(mod, 'if');
            paletteIf.appendChild(div);
        });
    }

    // パレットTHEN再描画
    if (paletteThen) {
        paletteThen.innerHTML = '';
        AVAILABLE_ACTIONS.forEach(mod => {
            const div = document.createElement('div');
            div.className = `hack-item type-${mod.type}`;
            div.textContent = mod.label;
            div.title = mod.desc;
            div.onclick = () => moveToSlot(mod, 'then');
            paletteThen.appendChild(div);
        });
    }

    // スロット再描画 (1行のみ)
    for (let r = 0; r < 1; r++) {
        const ifSlot = document.querySelector(`.if-slot[data-row="${r}"]`);
        const thenSlot = document.querySelector(`.then-slot[data-row="${r}"]`);

        // IF
        if (ifSlot) {
            ifSlot.innerHTML = '';
            if (logicRows[r].if) {
                ifSlot.classList.remove('empty');
                const mod = logicRows[r].if;
                const div = document.createElement('div');
                div.className = `hack-item in-slot type-${mod.type}`;
                div.textContent = mod.label;
                div.onclick = () => removeFromSlot(r, 'if');
                ifSlot.appendChild(div);
            } else {
                ifSlot.classList.add('empty');
            }
        }

        // THEN
        if (thenSlot) {
            thenSlot.innerHTML = '';
            if (logicRows[r].then) {
                thenSlot.classList.remove('empty');
                const mod = logicRows[r].then;
                const div = document.createElement('div');
                div.className = `hack-item in-slot type-${mod.type}`;
                div.textContent = mod.label;
                div.onclick = () => removeFromSlot(r, 'then');
                thenSlot.appendChild(div);
            } else {
                thenSlot.classList.add('empty');
            }
        }
    }
}

function moveToSlot(mod, type) {
    // 1行のみなのでインデックスは0だけをチェック
    for (let i = 0; i < 1; i++) {
        if (!logicRows[i][type]) {
            logicRows[i][type] = mod;
            renderHackConsole();
            return;
        }
    }
}

function removeFromSlot(rowIdx, type) {
    logicRows[rowIdx][type] = null;
    renderHackConsole();
}

function openHackingScreen() {
    if (isHacking || hackGauge < 100) return;
    isHacking = true;
    logicRows = [
        { if: null, then: null }
    ];
    renderHackConsole();
    document.getElementById('hacking-console').classList.add('active');
    addLog(`OVERRIDING_LOGIC_BLOCKS`, 'hack');
    updateUI();
}

function closeHackingScreen() {
    isHacking = false;
    document.getElementById('hacking-console').classList.remove('active');
}

// 実行ボタン (COMPILE & EXECUTE)
document.getElementById('apply-hack').onclick = () => {
    // 組み立てられたロジックをプレイヤーステータスに追加インストール（累積）
    let installedCount = 0;

    logicRows.forEach(row => {
        if (row.if && row.then) {
            player.activePrograms.push({
                condition: row.if.id,
                action: row.then.id,
                lastFired: 0
            });
            installedCount++;
        }
    });

    if (installedCount > 0) {
        addLog(`PROGRAM_COMPILED: +${installedCount} LOGICS`, 'hack');
        hackGauge = 0;

        // スロットを空に戻す（誤爆防止）
        logicRows = [{ if: null, then: null }];
    } else {
        addLog(`CANCELLED_NO_VALID_LOGIC`);
    }

    closeHackingScreen();
    updateUI();
};

document.getElementById('cancel-hack').onclick = closeHackingScreen;

// プログラムの評価メイン関数
function evaluateProgram(eventTrigger, eventData = null) {
    player.activePrograms.forEach(prog => {
        if (prog.condition === eventTrigger) {
            // 条件一致でアクション実行
            executeAction(prog.action, prog, eventData);
        }
    });
}

// 実際のアクションの内容 (ステータス系は毎フレーム再計算されるため、ここでは瞬間的なアクションのみ処理)
function executeAction(actionId, progState, eventData = null) {
    const now = Date.now();
    switch (actionId) {
        case 'heal1':
            // クールダウン設定 (連続回復防止: 短い条件ですぐ全回復しないよう1秒制限)
            if (now - progState.lastFired > 1000) {
                hp = Math.min(MAX_HP, hp + 10);
                progState.lastFired = now;
            }
            break;
        case 'shield1':
            if (now - progState.lastFired > 3000) {
                player.shield = Math.min(3, player.shield + 1);
                progState.lastFired = now;
            }
            break;
        case 'pierce1':
            player.piercing = true;
            break;
        case 'split1':
            // ヒット時に分裂する (eventDataに衝突位置などが渡される)
            if (eventData && eventData.type === 'hit') {
                bullets.push({ x: eventData.x, y: eventData.y, type: 'LASER', color: '#ff4081', vx: -3, vy: -5 });
                bullets.push({ x: eventData.x, y: eventData.y, type: 'LASER', color: '#ff4081', vx: 3, vy: -5 });
            }
            break;
        case 'subship1':
            // 常時評価でなければ呼ばれたときだけ出現処理（簡易化のため常時のみ対応とする）
            if (player.subShips.length < 2) {
                player.subShips.push({ angle: Math.PI * player.subShips.length, dist: 40 });
            }
            break;
        case 'magnet1':
            // 敵を自身に吸引
            enemies.forEach(e => {
                const dx = player.x - e.x;
                const dy = player.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 10) {
                    e.x += (dx / dist) * 1.5;
                    e.y += (dy / dist) * 1.5;
                }
            });
            break;
        case 'bomb1':
            // 爆発 (クールダウン1.5秒)
            if (now - progState.lastFired > 1500) {
                let bx = eventData && eventData.type === 'hit' ? eventData.x : player.x;
                let by = eventData && eventData.type === 'hit' ? eventData.y : player.y;
                createExplosion(bx, by, '#ff5722', 40); // 爆発エフェクト
                enemies.forEach(e => {
                    if (Math.hypot(e.x - bx, e.y - by) < 140) {
                        e.hp -= 20; // 範囲大ダメージ
                        createExplosion(e.x, e.y, e.color, 5); // 被弾エフェクト
                    }
                });
                for (let i = enemyBullets.length - 1; i >= 0; i--) {
                    if (Math.hypot(enemyBullets[i].x - bx, enemyBullets[i].y - by) < 120) {
                        enemyBullets.splice(i, 1); // 周囲の敵弾消去
                    }
                }
                progState.lastFired = now;
            }
            break;
        case 'slow1':
            // 時間減速 (クールダウン0.5秒)
            if (now - progState.lastFired > 500) {
                slowTimer = Math.min(100, slowTimer + 30); // 30フレーム分のスローを追加
                progState.lastFired = now;
            }
            break;
    }
}

function createExplosion(x, y, color, count) {
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

function startGame() {
    hp = MAX_HP; hackGauge = 0; score = 0; gameOver = false; gameActive = true; isHacking = false;
    player.activePrograms = []; // リトライ時はプログラムリセット
    player.speed = PLAYER_SPEED; player.fireRate = 180; player.multiShot = 0; player.piercing = false; player.shield = 0; player.subShips = [];
    player.homing = 0;
    slowTimer = 0;
    startTime = Date.now();
    enemies = []; bullets = []; enemyBullets = []; particles = [];
    document.getElementById('home-screen').classList.add('hidden');
    document.getElementById('overlay').classList.add('hidden');
    document.getElementById('side-hud').classList.remove('hidden');
    document.getElementById('controls-guide').classList.remove('hidden');
    addLog("SYSTEM_BOOT_COMPLETE");
    updateUI();
}

function backToHome() {
    gameActive = false;
    document.getElementById('home-screen').classList.remove('hidden');
    document.getElementById('side-hud').classList.add('hidden');
    document.getElementById('controls-guide').classList.add('hidden');
}

// モバイル操作の実装
if (isMobile) {
    const joyZone = document.getElementById('joystick-zone');
    const shootBtn = document.getElementById('shoot-btn');
    const hackBtn = document.getElementById('hack-btn');

    let touchStartX = 0;
    let touchStartY = 0;

    joyZone.addEventListener('touchstart', e => {
        const touch = e.touches[0];
        const rect = joyZone.getBoundingClientRect();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    });

    joyZone.addEventListener('touchmove', e => {
        e.preventDefault();
        const touch = e.touches[0];
        const dx = touch.clientX - touchStartX;
        const dy = touch.clientY - touchStartY;

        // 簡易的な移動
        if (Math.abs(dx) > 10) keys[dx > 0 ? 'ArrowRight' : 'ArrowLeft'] = true;
        else { keys['ArrowRight'] = false; keys['ArrowLeft'] = false; }

        if (Math.abs(dy) > 10) keys[dy > 0 ? 'ArrowDown' : 'ArrowUp'] = true;
        else { keys['ArrowDown'] = false; keys['ArrowUp'] = false; }
    });

    joyZone.addEventListener('touchend', () => {
        keys['ArrowRight'] = false;
        keys['ArrowLeft'] = false;
        keys['ArrowUp'] = false;
        keys['ArrowDown'] = false;
    });

    shootBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['a'] = true; });
    shootBtn.addEventListener('touchend', () => { keys['a'] = false; });
    hackBtn.addEventListener('touchstart', e => { e.preventDefault(); keys['s'] = true; });
    hackBtn.addEventListener('touchend', () => { keys['s'] = false; });
}

// ボタン紐付け
document.getElementById('start-btn').onclick = startGame;
document.getElementById('retry-button').onclick = startGame;
document.getElementById('back-home-button').onclick = backToHome;
document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.getElementById('home-screen').classList.remove('hidden');
});

// --- 6. コアループ ---
function update() {
    if (!gameActive || gameOver || isHacking) return;
    const now = Date.now();
    score = (now - startTime) / 1000;
    updateUI();

    // 毎フレームステータスをベース値にリセットし、パッシブ効果を再計算
    player.speed = PLAYER_SPEED;
    player.fireRate = 180;
    player.multiShot = 0;
    player.piercing = false;
    player.homing = 0;
    let targetSubShips = 0;

    // 最新状態用の条件フラグ
    let isCloseMet = false;
    enemies.forEach(e => {
        if (Math.hypot(e.x - player.x, e.y - player.y) < 120) isCloseMet = true;
    });

    let isGrazeMet = false;
    enemyBullets.forEach(eb => {
        let dist = Math.hypot(eb.x - player.x, eb.y - player.y);
        if (dist > 15 && dist < 45) isGrazeMet = true;
    });

    player.activePrograms.forEach(prog => {
        let conditionMet = false;
        if (prog.condition === 'if-always') conditionMet = true;
        if (prog.condition === 'if-hp50' && hp <= MAX_HP * 0.5) conditionMet = true;
        if (prog.condition === 'if-shoot' && (keys['a'] || keys['A'])) conditionMet = true;
        if (prog.condition === 'if-close' && isCloseMet) conditionMet = true;
        if (prog.condition === 'if-graze' && isGrazeMet) conditionMet = true;

        if (conditionMet) {
            if (prog.action === 'speed1') player.speed += PLAYER_SPEED * 0.5;
            if (prog.action === 'fire1') player.fireRate = Math.max(20, player.fireRate - 45);
            if (prog.action === 'multi1') player.multiShot += 1;
            if (prog.action === 'pierce1') player.piercing = true;
            if (prog.action === 'subship1') targetSubShips += 1;
            if (prog.action === 'homing1') player.homing += 1;

            // パッシブ以外の即時アクション（常時評価系から呼ばれる場合）
            if (['heal1', 'shield1', 'bomb1', 'slow1', 'magnet1'].includes(prog.action)) {
                executeAction(prog.action, prog, { x: player.x, y: player.y });
            }
        }
    });

    // サブ自機の数を targetSubShips に合わせる
    while (player.subShips.length < targetSubShips) {
        player.subShips.push({ angle: Math.PI * player.subShips.length, dist: 40 });
    }
    while (player.subShips.length > targetSubShips) {
        player.subShips.pop();
    }

    // プレイヤー移動
    if (keys['ArrowLeft']) player.x -= player.speed;
    if (keys['ArrowRight']) player.x += player.speed;
    if (keys['ArrowUp']) player.y -= player.speed;
    if (keys['ArrowDown']) player.y += player.speed;
    player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
    player.y = Math.max(20, Math.min(canvas.height - 20, player.y));

    // Aキー: 通常弾 (Laser)
    if (keys['a'] || keys['A']) {
        if (!player.lastFireLaser || now - player.lastFireLaser > player.fireRate) {

            // ベースの弾
            bullets.push({ x: player.x, y: player.y - 20, type: 'LASER', color: player.piercing ? '#f0f' : '#0f4', vx: 0 });

            // multiShotのレベルに応じて拡散弾を追加 (スタック対応)
            for (let i = 1; i <= player.multiShot; i++) {
                bullets.push({ x: player.x - 12 * i, y: player.y - 15 + i * 5, type: 'LASER', color: player.piercing ? '#f0f' : '#0f4', vx: -1.5 * i, vy: -10 });
                bullets.push({ x: player.x + 12 * i, y: player.y - 15 + i * 5, type: 'LASER', color: player.piercing ? '#f0f' : '#0f4', vx: 1.5 * i, vy: -10 });
            }

            // サブ自機からの発射
            player.subShips.forEach(sub => {
                bullets.push({ x: sub.x, y: sub.y - 15, type: 'LASER', color: '#7c4dff', vx: 0 });
            });

            // 弾を撃った時イベント
            evaluateProgram('if-shoot');

            player.lastFireLaser = now;
        }
    }

    // Sキー: ハッキング(自機強化)
    if (keys['s'] || keys['S']) {
        if (hackGauge >= 100 && !isHacking) {
            openHackingScreen();
        }
    }

    // 常時評価系イベント (アクション等はパッシブ計算内部で実行されるため、evaluateProgram系はイベント用)

    // イベントトリガー類
    if (isCloseMet) { evaluateProgram('if-close', { type: 'close' }); }
    if (isGrazeMet) { evaluateProgram('if-graze', { type: 'graze' }); }
    evaluateProgram('if-always');
    if (hp <= MAX_HP * 0.5) { evaluateProgram('if-hp50'); }
    if (now % 3000 < 20) { evaluateProgram('if-3sec'); }

    // 自機サブオプションの更新 (回転など)
    player.subShips.forEach(sub => {
        sub.angle += 0.05;
        sub.x = player.x + Math.cos(sub.angle) * sub.dist;
        sub.y = player.y + Math.sin(sub.angle) * sub.dist;
    });

    // 弾更新 (追尾弾ロジック対応)
    bullets.forEach((b, i) => {
        if (b.actualVy === undefined) b.actualVy = (b.vy || 0) - 10;

        if (player.homing > 0) {
            let nearest = null;
            let minDist = Infinity;
            enemies.forEach(e => {
                let dist = Math.hypot(e.x - b.x, e.y - b.y);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = e;
                }
            });
            if (nearest) {
                let angle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
                let speed = Math.hypot(b.vx || 0, b.actualVy);
                let currentAngle = Math.atan2(b.actualVy, b.vx || 0);

                let diff = angle - currentAngle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                let maxTurn = Math.min(Math.abs(diff), 0.05 * player.homing);
                currentAngle += Math.sign(diff) * maxTurn;

                b.vx = Math.cos(currentAngle) * speed;
                b.actualVy = Math.sin(currentAngle) * speed;
            }
        }
        b.x += b.vx || 0;
        b.y += b.actualVy;
        if (b.y < -20 || b.x < -20 || b.x > canvas.width + 20 || b.y > canvas.height + 20) bullets.splice(i, 1);
    });

    // スロー効果の算出
    let timeScale = 1.0;
    if (slowTimer > 0) {
        timeScale = 0.3;
        slowTimer--;
    }

    // 敵スポーン (スロー効果時は出現頻度も下がる)
    if (Math.random() < ENEMY_SPAWN_RATE * 2.5 * timeScale) {
        let e = new Enemy();
        e.hp = 3 + Math.floor(score / 30); // 時間経過でHP増加
        enemies.push(e);
    }

    // 敵の弾更新 (時間減速適用)
    enemyBullets.forEach((eb, ei) => {
        eb.y += eb.vy * timeScale;
        if (eb.y > canvas.height + 20) enemyBullets.splice(ei, 1);

        // 敵の弾 vs プレイヤー
        if (!isHacking && Math.sqrt((eb.x - player.x) ** 2 + (eb.y - player.y) ** 2) < 15) {
            enemyBullets.splice(ei, 1);
            if (player.shield > 0) {
                player.shield--;
                addLog('SHIELD_ACTIVATED: DAMAGE_BLOCKED');
            } else {
                hp -= 10;
                if (hp <= 0) {
                    gameOver = true;
                    document.getElementById('overlay').classList.remove('hidden');
                }
            }
        }
    });

    // 敵更新
    ctx.globalCompositeOperation = 'source-over';
    enemies.forEach((e, ei) => {
        e.update(timeScale); // 敵にもスロー効果適用
        if (e.y > canvas.height + 50) enemies.splice(ei, 1);

        // 衝突判定（弾 vs 敵）
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < e.w / 2 + 10) {
                // ヒットイベント発火
                evaluateProgram('if-hit', { type: 'hit', x: b.x, y: b.y });

                if (!player.piercing) {
                    bullets.splice(bi, 1); // 貫通しない弾は消す
                }
                e.hp--;
                if (e.hp <= 0) {
                    createExplosion(e.x, e.y, e.color, 15); // 爆発エフェクト
                    enemies.splice(ei, 1);
                    hackGauge = Math.min(100, hackGauge + 15);
                    break;
                } else {
                    createExplosion(e.x, e.y, '#ffaa00', 3); // ヒットエフェクト
                    hackGauge = Math.min(100, hackGauge + 5);
                }
            }
        }

        // 衝突判定（敵 vs プレイヤー）
        if (Math.sqrt((e.x - player.x) ** 2 + (e.y - player.y) ** 2) < 25) {
            createExplosion(e.x, e.y, e.color, 15);
            enemies.splice(ei, 1);
            if (player.shield > 0) {
                player.shield--;
                addLog('SHIELD_ACTIVATED: COLLISION_BLOCKED');
                createExplosion(player.x, player.y, '#00b0ff', 20); // シールド防御エフェクト
            } else {
                hp -= 10;
                createExplosion(player.x, player.y, '#ff0000', 30); // 被弾エフェクト
                if (hp <= 0) {
                    gameOver = true;
                    document.getElementById('overlay').classList.remove('hidden');
                }
            }
        }
    });

    // 背景コード雨
    codeRain.forEach(c => {
        c.y += c.speed;
        if (c.y > canvas.height) {
            c.y = -20;
            c.x = Math.random() * canvas.width;
        }
    });

    // パーティクル更新 (処理落ち防止)
    if (particles.length > 200) {
        particles.splice(0, particles.length - 200);
    }
    particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1;
        if (p.life <= 0) particles.splice(i, 1);
    });

    // 自機のエンジントレイル
    if (Math.random() < 0.5) {
        particles.push({
            x: player.x + (Math.random() - 0.5) * 10,
            y: player.y + 15,
            vx: 0,
            vy: 2 + Math.random() * 2,
            life: 10 + Math.random() * 10,
            maxLife: 20,
            color: '#00ff41',
            size: 2
        });
    }
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'lighter'; // グロウ効果のため合成モード変更

    // 背景コード雨
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#003300';
    ctx.font = '10px monospace';
    codeRain.forEach(c => {
        ctx.fillText(c.text, c.x, c.y);
    });

    // プレイヤー描画
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ff41';
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 15);
    ctx.lineTo(player.x + 15, player.y + 15);
    ctx.lineTo(player.x - 15, player.y + 15);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 255, 65, 0.4)';
    ctx.fill();
    ctx.shadowBlur = 0;

    // シールド描画
    if (player.shield > 0) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, 25, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 176, 255, ${0.5 + Math.sin(Date.now() / 150) * 0.3})`;
        ctx.lineWidth = 2 + player.shield; // 残弾数で太さが変わる
        ctx.stroke();

        ctx.fillStyle = '#00b0ff';
        ctx.font = '10px monospace';
        ctx.fillText(`SHIELD x${player.shield}`, player.x + 30, player.y);
    }

    // サブ自機描画
    player.subShips.forEach(sub => {
        ctx.fillStyle = '#7c4dff';
        ctx.beginPath();
        ctx.moveTo(sub.x, sub.y - 8);
        ctx.lineTo(sub.x + 8, sub.y + 8);
        ctx.lineTo(sub.x - 8, sub.y + 8);
        ctx.closePath();
        ctx.fill();
    });

    // 弾描画 (重ね塗りで疑似グロウ)
    bullets.forEach(b => {
        ctx.save();
        ctx.translate(b.x, b.y);
        let actualVy = b.actualVy !== undefined ? b.actualVy : ((b.vy || 0) - 10);
        ctx.rotate(Math.atan2(actualVy, b.vx || 0) + Math.PI / 2);

        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(-2, -12, 4, 24);

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-1, -10, 2, 20);
        ctx.restore();
    });

    // 敵弾描画
    enemyBullets.forEach(eb => {
        ctx.fillStyle = eb.color;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(eb.x - 4, eb.y - 7, 8, 14);

        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.fillRect(eb.x - 2, eb.y - 5, 4, 10);
    });

    // 敵描画
    ctx.globalCompositeOperation = 'source-over';
    enemies.forEach(e => e.draw());

    // パーティクル描画
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
updateUI();
