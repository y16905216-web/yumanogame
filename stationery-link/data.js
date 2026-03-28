// data.js

function createEmojiIcon(emoji, bg_color) {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 120;
    const ctx = c.getContext('2d');
    
    // Background circle
    ctx.fillStyle = bg_color;
    ctx.beginPath();
    ctx.arc(60, 60, 58, 0, Math.PI * 2);
    ctx.fill();
    
    // Glossy overlay (top half subtle white)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(60, 60, 58, Math.PI, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Emoji
    ctx.font = '60px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 60, 68); // Slightly offset down for vertical centering depending on OS
    
    return c.toDataURL();
}

const STATIONERY_DATA = {
    'mono': {
        id: 'mono',
        name: 'MONO消しゴム',
        groupId: 1,
        description: '画面中央のステを四角くまとめて消去',
        imageSrc: 'assets/mono.png',
        color: '#4299e1',
        skillType: 'erasure_square',
        skillCost: 14
    },
    'uni': {
        id: 'uni',
        name: '鉛筆・ユニ',
        groupId: 1,
        description: 'ランダムな1種をユニに変化させる',
        imageSrc: createEmojiIcon('✏️', '#742a2a'),
        color: '#742a2a',
        skillType: 'hexa_change',
        skillCost: 12
    },
    'kurutoga': {
        id: 'kurutoga',
        name: 'クルトガ',
        groupId: 2,
        description: '軌跡がオートで太くなり周辺も巻き込んで消去',
        imageSrc: 'assets/kurutoga.png',
        color: '#dd6b20',
        skillType: 'kurutoga_drive',
        skillCost: 15
    },
    'jetstream': {
        id: 'jetstream',
        name: 'ジェットストリーム',
        groupId: 2,
        description: '一定時間速度UPしコンボ受付時間延長',
        imageSrc: 'assets/jetstream.png',
        color: '#2b6cb0',
        skillType: 'ultra_smooth',
        skillCost: 16
    },
    'mackee': {
        id: 'mackee',
        name: 'マッキー極太',
        groupId: 3,
        description: '指でなぞった極太ラインをコイン化消去',
        imageSrc: createEmojiIcon('🖍️', '#1a202c'),
        color: '#1a202c',
        skillType: 'oil_paint',
        skillCost: 18
    },
    'campus': {
        id: 'campus',
        name: 'Campusノート',
        groupId: 3,
        description: '横罫線が走りライン上を一掃（ボーナスコイン）',
        imageSrc: createEmojiIcon('📓', '#c6f6d5'),
        color: '#c6f6d5',
        skillType: 'ruled_line',
        skillCost: 15
    },
    'preppy': {
        id: 'preppy',
        name: 'プレピー',
        groupId: 4,
        description: '数個を弾けるインクボムに変化させる',
        imageSrc: createEmojiIcon('🖋️', '#b794f4'),
        color: '#b794f4',
        skillType: 'ink_bomb',
        skillCost: 13
    },
    'frixion': {
        id: 'frixion',
        name: 'フリクション',
        groupId: 4,
        description: '1種類のステを完全に透明(非表示)にして繋げやすくする',
        imageSrc: createEmojiIcon('🔁', '#f56565'),
        color: '#f56565',
        skillType: 'frixion_eraser',
        skillCost: 16
    },
    'rotring600': {
        id: 'rotring600',
        name: 'ロットリング600',
        groupId: 5,
        description: '画面を正確な十字ラインで4分割消去する',
        imageSrc: createEmojiIcon('📐', '#4a5568'),
        color: '#4a5568',
        skillType: 'grid_shot',
        skillCost: 14
    },
    'wood': {
        id: 'wood',
        name: '野原工芸',
        groupId: 5,
        description: 'ステを中央に大凝縮し、超高得点木軸ボム生成',
        imageSrc: 'assets/wood.png',
        color: '#b7791f',
        skillType: 'aging_glow',
        skillCost: 20
    }
};

const GAME_STATE = {
    score: 0,
    time: 60,
    isPlaying: false,
    playCount: parseInt(localStorage.getItem('stationeryLink_playCount') || '0', 10),
    coins: parseInt(localStorage.getItem('stationeryLink_coins') || '1500', 10),
    unlockedChars: JSON.parse(localStorage.getItem('stationeryLink_unlocked') || '["mono"]'),
    equippedChar: localStorage.getItem('stationeryLink_equipped') || 'mono',
    // New fields for skill system
    skillGauge: 0
};

function savePlayCount() {
    GAME_STATE.playCount++;
    localStorage.setItem('stationeryLink_playCount', GAME_STATE.playCount.toString());
}

function saveCoins() {
    localStorage.setItem('stationeryLink_coins', GAME_STATE.coins.toString());
}

function saveUnlockedChars() {
    localStorage.setItem('stationeryLink_unlocked', JSON.stringify(GAME_STATE.unlockedChars));
}

function saveEquippedChar() {
    localStorage.setItem('stationeryLink_equipped', GAME_STATE.equippedChar);
}
