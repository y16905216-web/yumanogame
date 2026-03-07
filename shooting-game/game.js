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
let score = 0;
let startTime = 0;
let gameOver = false;
let gameActive = false;
let weaponMode = 'LASER'; // LASER or HACK
let lastTime = performance.now();

let player = { x: canvas.width / 2, y: canvas.height - 80, w: 30, h: 30 };
let bullets = [];
let enemies = [];
let logs = [];
let codeRain = [];
let isHacking = false;
let currentHackingTarget = null;
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
        this.target = 'PLAYER';
        this.hacked = false;
        this.color = '#f44';
        this.message = '';
    }

    applyHack(type) {
        this.hacked = true;
        this.color = '#0ff';
        switch (type) {
            case 'speed':
                this.speed *= 0.1;
                this.message = "speed = 0.1";
                addLog(`OBJ_${this.id}: speed_optimized_for_beginner`, 'hack');
                break;
            case 'target':
                this.target = 'ENEMY';
                this.message = "target = ENEMY";
                addLog(`OBJ_${this.id}: security_re-routed_to_friend`, 'hack');
                break;
            case 'size':
                this.w *= 2.5;
                this.h *= 2.5;
                this.message = "size = 2.5";
                addLog(`OBJ_${this.id}: collider_expanded_for_easy_hit`, 'hack');
                break;
        }
        closeHackingScreen();
    }

    update() {
        if (this.target === 'PLAYER') {
            this.y += this.speed;
        } else {
            this.y += this.speed * 0.3;
            this.x += Math.sin(Date.now() / 200) * 2;
        }
    }

    draw() {
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
        ctx.fillStyle = this.color;
        ctx.font = '10px monospace';
        ctx.fillText(`ID_${this.id}`, this.x - 15, this.y + 5);
        if (this.message) {
            ctx.fillStyle = '#0ff';
            ctx.fillText(this.message, this.x + 20, this.y);
        }
    }
}

// --- 5. UI更新・ハッキング画面ロジック ---
let currentHackConfig = { speed: "通常", target: "敵", size: "通常" };

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
    document.getElementById('hp-bar').style.width = (hp / MAX_HP * 100) + '%';
    const wpMode = document.getElementById('weapon-mode');
    if (wpMode) wpMode.textContent = "[ DUAL_MODE_ACTIVE ]";

    // ブロックUIの同期
    document.getElementById('val-speed').textContent = currentHackConfig.speed;
    document.getElementById('val-target').textContent = currentHackConfig.target;
    document.getElementById('val-size').textContent = currentHackConfig.size;
}

function openHackingScreen(target) {
    if (isHacking) return;
    isHacking = true;
    currentHackingTarget = target;
    // 初期値を敵の状態からセット
    currentHackConfig = {
        speed: target.speed < 1 ? "鈍足" : "通常",
        target: target.target === 'PLAYER' ? "自分" : "敵",
        size: target.w > 30 ? "巨大" : "通常"
    };
    document.getElementById('target-id').textContent = target.id;
    document.getElementById('hacking-console').classList.add('active');
    addLog(`INTERCEPTED_OBJ: ${target.id}`, 'hack');
    updateUI();
}

function closeHackingScreen() {
    isHacking = false;
    currentHackingTarget = null;
    document.getElementById('hacking-console').classList.remove('active');
}

// ブロッククリックイベント
document.getElementById('block-speed').onclick = () => {
    const states = ["通常", "鈍足", "停止"];
    let idx = (states.indexOf(currentHackConfig.speed) + 1) % states.length;
    currentHackConfig.speed = states[idx];
    updateUI();
};
document.getElementById('block-target').onclick = () => {
    const states = ["敵", "自分"];
    let idx = (states.indexOf(currentHackConfig.target) + 1) % states.length;
    currentHackConfig.target = states[idx];
    updateUI();
};
document.getElementById('block-size').onclick = () => {
    const states = ["通常", "巨大", "極小"];
    let idx = (states.indexOf(currentHackConfig.size) + 1) % states.length;
    currentHackConfig.size = states[idx];
    updateUI();
};

// 実行ボタン
document.getElementById('apply-hack').onclick = () => {
    if (!currentHackingTarget) return;
    const t = currentHackingTarget;
    t.hacked = true;
    t.color = '#0ff';

    // スピード反映
    if (currentHackConfig.speed === "停止") t.speed = 0;
    else if (currentHackConfig.speed === "鈍足") t.speed = 0.5;
    else t.speed = 2 + Math.random();

    // ターゲット反映
    t.target = currentHackConfig.target === "自分" ? "PLAYER" : "ENEMY";

    // サイズ反映
    if (currentHackConfig.size === "巨大") { t.w = 70; t.h = 70; }
    else if (currentHackConfig.size === "極小") { t.w = 10; t.h = 10; }
    else { t.w = 30; t.h = 30; }

    t.message = `MODIFIED`;
    addLog(`OBJ_${t.id}: CODE_EXECUTED`, 'hack');
    closeHackingScreen();
};

document.getElementById('cancel-hack').onclick = closeHackingScreen;

function startGame() {
    hp = MAX_HP; score = 0; gameOver = false; gameActive = true; isHacking = false;
    startTime = Date.now();
    enemies = []; bullets = [];
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

    // プレイヤー移動
    if (keys['ArrowLeft']) player.x -= PLAYER_SPEED;
    if (keys['ArrowRight']) player.x += PLAYER_SPEED;
    if (keys['ArrowUp']) player.y -= PLAYER_SPEED;
    if (keys['ArrowDown']) player.y += PLAYER_SPEED;
    player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
    player.y = Math.max(20, Math.min(canvas.height - 20, player.y));

    // Aキー: 通常弾 (Laser)
    if (keys['a'] || keys['A']) {
        if (!player.lastFireLaser || now - player.lastFireLaser > 150) {
            bullets.push({ x: player.x, y: player.y - 20, type: 'LASER', color: '#0f4' });
            player.lastFireLaser = now;
        }
    }

    // Sキー: ハッキング弾 (Hack)
    if (keys['s'] || keys['S']) {
        if (!player.lastFireHack || now - player.lastFireHack > 500) {
            bullets.push({ x: player.x, y: player.y - 20, type: 'HACK', color: '#0ff' });
            player.lastFireHack = now;
        }
    }

    // 弾更新
    bullets.forEach((b, i) => {
        b.y -= 10;
        if (b.y < -20) bullets.splice(i, 1);
    });

    // 敵スポーン
    if (Math.random() < ENEMY_SPAWN_RATE) enemies.push(new Enemy());

    // 敵更新
    enemies.forEach((e, ei) => {
        e.update();
        if (e.y > canvas.height + 50) enemies.splice(ei, 1);

        // 衝突判定（弾 vs 敵）
        bullets.forEach((b, bi) => {
            const dx = b.x - e.x;
            const dy = b.y - e.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < e.w / 2 + 10) {
                bullets.splice(bi, 1);
                if (b.type === 'LASER') {
                    e.hp--;
                    if (e.hp <= 0) {
                        enemies.splice(ei, 1);
                        addLog(`OBJ_${e.id}: DELETED`);
                    }
                } else if (b.type === 'HACK' && !e.hacked) {
                    openHackingScreen(e);
                }
            }
        });

        // 衝突判定（敵 vs プレイヤー）
        if (Math.sqrt((e.x - player.x) ** 2 + (e.y - player.y) ** 2) < 25) {
            if (!e.hacked) {
                hp -= 10;
                enemies.splice(ei, 1);
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
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 背景コード雨
    ctx.fillStyle = '#003300';
    ctx.font = '10px monospace';
    codeRain.forEach(c => {
        ctx.fillText(c.text, c.x, c.y);
    });

    // プレイヤー描画
    ctx.strokeStyle = '#00ff41';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 15);
    ctx.lineTo(player.x + 15, player.y + 15);
    ctx.lineTo(player.x - 15, player.y + 15);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 255, 65, 0.2)';
    ctx.fill();

    // 弾描画
    bullets.forEach(b => {
        ctx.fillStyle = b.color;
        if (b.type === 'LASER') ctx.fillRect(b.x - 1, b.y - 10, 2, 20);
        else {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 敵描画
    enemies.forEach(e => e.draw());
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();
updateUI();
