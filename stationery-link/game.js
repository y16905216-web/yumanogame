// game.js
const Engine = Matter.Engine,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Vector = Matter.Vector;

// Config
const ITEM_RADIUS = 32; // 改広画面に合わせて38→32へ縮小
const MAX_ITEMS = 32; // 密度に合わせて40→32へ調整
let CANVAS_WIDTH = 0;
let CANVAS_HEIGHT = 0;
const canvas = document.getElementById('game-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Engine Setup
const engine = Engine.create();
engine.world.gravity.y = 1.2;
const world = engine.world;

function updateCanvasSize() {
    const container = document.getElementById('game-canvas-area');
    if (!container || !canvas) return;
    
    // Get actual content size (excluding padding)
    const rect = container.getBoundingClientRect();
    CANVAS_WIDTH = rect.width;
    CANVAS_HEIGHT = rect.height;
    
    // Only update attributes if they've changed to avoid flickering
    if (canvas.width !== CANVAS_WIDTH || canvas.height !== CANVAS_HEIGHT) {
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
    }
}
updateCanvasSize();

window.addEventListener('resize', () => {
    updateCanvasSize();
    createWalls();
});

// Walls - Oval Bowl Style
let walls = [];
function createWalls() {
    if (walls.length > 0) Composite.remove(world, walls);
    const opt = { isStatic: true, friction: 0.05, restitution: 0.2 };
    
    walls = [];
    const segments = 30;
    const centerX = CANVAS_WIDTH / 2;
    const radiusX = CANVAS_WIDTH * 0.48;
    const radiusY = CANVAS_HEIGHT * 0.52; // Slightly taller bowl for the frame

    // Create a semi-oval bowl. The bottom is at CANVAS_HEIGHT - 5px
    const bottomBaseline = CANVAS_HEIGHT - 10;

    for (let i = 0; i <= segments; i++) {
        const theta = Math.PI + Math.PI * (i / segments);
        const x = centerX + radiusX * Math.cos(theta);
        const centerY = bottomBaseline - radiusY;
        const y = centerY - radiusY * Math.sin(theta);

        const nextTheta = Math.PI + Math.PI * ((i + 1) / segments);
        const nextX = centerX + radiusX * Math.cos(nextTheta);
        const nextY = centerY - radiusY * Math.sin(nextTheta);
        
        const midX = (x + nextX) / 2;
        const midY = (y + nextY) / 2;
        const angle = Math.atan2(nextY - y, nextX - x);
        const length = Math.sqrt(Math.pow(nextX - x, 2) + Math.pow(nextY - y, 2)) + 2;

        const segment = Bodies.rectangle(midX, midY, length, 40, {
            ...opt,
            angle: angle
        });
        walls.push(segment);
    }
    
    // Add top "guard" walls to keep things from flying out sideways if they jump
    walls.push(Bodies.rectangle(-20, CANVAS_HEIGHT/2, 40, CANVAS_HEIGHT, { isStatic: true }));
    walls.push(Bodies.rectangle(CANVAS_WIDTH + 20, CANVAS_HEIGHT/2, 40, CANVAS_HEIGHT, { isStatic: true }));

    Composite.add(world, walls);
}

// State
let items = []; 
let isDragging = false;
let connectedPath = [];
let lastPos = {x: 0, y: 0};

// Skill active states
const ACTIVE_SKILL = {
    isKurutogaDrive: false,
    isJetstreamSmooth: false,
    isMackeePaint: false,
    isMechActive: false,
    isBallActive: false
};

// Preload Images
const images = {};
function loadImages() {
    Object.keys(STATIONERY_DATA).forEach(type => {
        const img = new Image();
        img.src = STATIONERY_DATA[type].imageSrc;
        images[type] = img;
    });
}
loadImages();

// Pick types that can spawn (Equipped + 4 random others)
let stageTypes = [];
function initStageTypes() {
    // Ensure we have 5 unique types including the equipped one
    const equipped = GAME_STATE.equippedChar || 'mono';
    const all = Object.keys(STATIONERY_DATA);
    const others = all.filter(k => k !== equipped);
    
    // Shuffle others
    for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }
    
    stageTypes = [equipped].concat(others.slice(0, 4));
}

// UI Elements
const skillBtn = document.getElementById('skill-btn');
const skillGaugeFill = document.getElementById('skill-gauge-fill');
const skillCharImg = document.getElementById('skill-char-img');

function updateSkillGaugeUI() {
    if(!skillBtn) return;
    const char = STATIONERY_DATA[GAME_STATE.equippedChar];
    const max = char.skillCost || 15;
    const pct = Math.min((GAME_STATE.skillGauge / max) * 100, 100);
    skillGaugeFill.style.height = `${pct}%`;
    
    if (GAME_STATE.skillGauge >= max) {
        skillBtn.removeAttribute('disabled');
        skillGaugeFill.style.boxShadow = '0 0 20px rgba(255,235,59,1)';
    } else {
        skillBtn.setAttribute('disabled', 'true');
        skillGaugeFill.style.boxShadow = '0 0 10px rgba(255,235,59,0.8)';
    }
}

// Sound Context
let audioCtx = null;
function playKnockSound() {
    if(!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
}

function playScribbleSound() {
    if(!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const noise = audioCtx.createOscillator();
    const noiseGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    
    // High pass filter for scratchy "scribble" sound
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000 + Math.random() * 2000, audioCtx.currentTime);
    
    // Use a noisy-ish oscillator or just transient
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(200 + Math.random() * 100, audioCtx.currentTime);
    noise.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    
    noiseGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    noise.start(audioCtx.currentTime);
    noise.stop(audioCtx.currentTime + 0.05);
}

// Knock Button Event
if(skillBtn) {
    skillBtn.addEventListener('click', () => {
        const char = STATIONERY_DATA[GAME_STATE.equippedChar];
        if (GAME_STATE.skillGauge >= char.skillCost) {
            playKnockSound();
            GAME_STATE.skillGauge = 0;
            updateSkillGaugeUI();
            executeSkill(char);
        }
    });
}

// Spawning
function spawnItem(forceType = null) {
    if (items.length >= MAX_ITEMS) return;
    const type = forceType || stageTypes[Math.floor(Math.random() * stageTypes.length)];
    const x = Math.random() * (CANVAS_WIDTH - ITEM_RADIUS * 2) + ITEM_RADIUS;
    
    const body = Bodies.circle(x, -ITEM_RADIUS, ITEM_RADIUS * 0.9, {
        restitution: 0.1, 
        friction: ACTIVE_SKILL.isJetstreamSmooth ? 0.3 : 0.8,
        frictionAir: 0.02,
        density: 1.0,
        render: { opacity: 1 } // for frixion
    });
    body.stationeryType = type;
    body.isWoodBomb = false;
    body.isInkBomb = false;
    
    Composite.add(world, body);
    items.push(body);
}

// Interaction - Direct Catch Style (Handles scaling/padding automatically)
function getEventPos(e) {
    if (!canvas) return lastPos;
    
    // 1. Prioritize offsetX / offsetY for Pointer/Mouse (Most stable)
    if (typeof e.offsetX !== 'undefined' && e.target === canvas) {
        return { x: e.offsetX, y: e.offsetY };
    }
    
    // 2. Fallback for Touch (Calculate relative to element rect)
    const rect = canvas.getBoundingClientRect();
    const evt = e.touches ? e.touches[0] : e;
    if(!evt) return lastPos;
    
    return {
        x: (evt.clientX - rect.left),
        y: (evt.clientY - rect.top)
    };
}

// Pencil Trace Effect (Visual Feedback)
function createPencilTrace(pos) {
    const parent = document.getElementById('effects-layer') || document.body;
    const dot = document.createElement('div');
    dot.className = 'pencil-trace';
    
    // Add small random offset for "scribble" look
    const rx = (Math.random() - 0.5) * 10;
    const ry = (Math.random() - 0.5) * 10;
    
    dot.style.left = `${pos.x + rx}px`;
    dot.style.top = `${pos.y + ry}px`;
    
    parent.appendChild(dot);
    
    // Fade out and remove
    dot.animate([
        { opacity: 0.8, transform: 'scale(1) rotate(0deg)' },
        { opacity: 0, transform: 'scale(0.5) rotate(45deg)' }
    ], { duration: 400, easing: 'ease-out' }).onfinish = () => dot.remove();
}

canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if(GAME_STATE.isPaused) return; // PAUSE GUARD
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    isDragging = true;
    lastPos = getEventPos(e);
    lastCheckedPos = { ...lastPos }; // For interpolation
    connectedPath = [];
    
    createPencilTrace(lastPos); // Feedback!
    
    // Ballpoint Skill: Auto Chain on touch
    if (ACTIVE_SKILL.isBallActive) {
        const bodiesUnder = Matter.Query.point(items, lastPos);
        if (bodiesUnder.length > 0) {
            autoChain(bodiesUnder[0]);
            isDragging = false; // Don't start normal drag if auto-chained
            return;
        }
    }

    checkIntersection(lastPos);
});

let lastCheckedPos = {x:0, y:0};

canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if(GAME_STATE.isPaused) return; // PAUSE GUARD
    if (!isDragging) return;
    const newPos = getEventPos(e);
    
    if (ACTIVE_SKILL.isMackeePaint) {
        // Oil Paint: delete everything under the cursor immediately and convert to coins
        const bodiesUnder = Matter.Query.point(items, newPos);
        if (bodiesUnder.length > 0) {
            const b = bodiesUnder[0];
            createDOMEffect('explosion-effect', b.position, 50, '#1a202c');
            removeBody(b);
            GAME_STATE.score += 50;
            GAME_STATE.coins += 1;
            updateUI();
        }
    } else {
        // Interpolation for fast swipes: check segments
        interpolateCheck(lastCheckedPos, newPos);
        checkIntersection(newPos);
        
        if (Math.random() > 0.6) createPencilTrace(newPos); // Feedback during drag
    }
    
    lastCheckedPos = { ...newPos };
    lastPos = newPos;
});

function interpolateCheck(p1, p2) {
    const dist = Vector.magnitude(Vector.sub(p1, p2));
    if (dist < 10) return; // Skip if too small

    const steps = Math.ceil(dist / 15); // Check every 15px
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const middlePos = {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t
        };
        checkIntersection(middlePos);
    }
}

window.addEventListener('pointerup', () => {
    if(GAME_STATE.isPaused) return; // PAUSE GUARD
    if (!isDragging) return;
    isDragging = false;
    
    // Mackee skill ends on pointer up
    if (ACTIVE_SKILL.isMackeePaint) {
        ACTIVE_SKILL.isMackeePaint = false;
        return;
    }
    
    if (connectedPath.length >= 3 || connectedPath.some(b => b.isWoodBomb || b.isInkBomb)) {
        
        let equipClearedCount = 0;
        
        // Bomb trigger check
        connectedPath.forEach(b => {
            if(b.stationeryType === GAME_STATE.equippedChar && !b.isWoodBomb && !b.isInkBomb) {
                equipClearedCount++;
            }
            if(b.isWoodBomb) {
                triggerWoodBomb(b.position);
            }
            if(b.isInkBomb) {
                triggerInkBomb(b.position);
            }
        });
        
        // Apply gauge
        if(equipClearedCount > 0) {
            GAME_STATE.skillGauge += equipClearedCount;
            updateSkillGaugeUI();
        }
        
        // Mechanical Pencil Skill: Area Line Cut
        if (ACTIVE_SKILL.isMechActive && connectedPath.length >= 2) {
            lineAreaClear(connectedPath[0].position, connectedPath[connectedPath.length - 1].position);
        }

        removeBodies(connectedPath);
        
        // Combo multiplier / score
        GAME_STATE.score += connectedPath.length * 100 * (ACTIVE_SKILL.isJetstreamSmooth ? 1.5 : 1.0);
        updateUI();
    }
    
    connectedPath = [];
});

function checkIntersection(pos) {
    if(GAME_STATE.isPaused) return; // PAUSE GUARD
    
    // 1. まずはピンポイントで触れているものを探す
    let bodiesUnder = Matter.Query.point(items, pos);
    
    // 2. 周辺をさらに広い円形でスキャン（なぞりやすさ向上）
    if (bodiesUnder.length === 0) {
        const touchRadius = 30; // 半径縮小に伴い微調整
        const bounds = {
            min: { x: pos.x - touchRadius, y: pos.y - touchRadius },
            max: { x: pos.x + touchRadius, y: pos.y + touchRadius }
        };
        bodiesUnder = Matter.Query.region(items, bounds);
        
        // 「指の跡」に近い順、かつ「現在繋いでいる種類」に近いものを優先する
        bodiesUnder.sort((a, b) => {
            const distA = Vector.magnitude(Vector.sub(a.position, pos));
            const distB = Vector.magnitude(Vector.sub(b.position, pos));
            
            // すでに繋がっている経路の最後尾に近い方を優先する（マグネット効果）
            if (connectedPath.length > 0) {
                const last = connectedPath[connectedPath.length - 1];
                const dPathA = Vector.magnitude(Vector.sub(a.position, last.position));
                const dPathB = Vector.magnitude(Vector.sub(b.position, last.position));
                return (distA + dPathA * 0.5) - (distB + dPathB * 0.5);
            }
            return distA - distB;
        });
    }

    if (bodiesUnder.length > 0) {
        // ... previous body selection logic ...
        let body = bodiesUnder[0];
        if (body.render && body.render.opacity === 0) return;
        
        if (connectedPath.length === 0) {
            connectedPath.push(body);
        } else {
            const lastInPath = connectedPath[connectedPath.length - 1];
            
            // Allow connecting to bombs explicitly, or same type
            if (body.stationeryType === lastInPath.stationeryType || body.isWoodBomb || body.isInkBomb || lastInPath.isWoodBomb || lastInPath.isInkBomb) {
                
                // Backtrack
                if (connectedPath.length >= 2 && body === connectedPath[connectedPath.length - 2]) {
                    connectedPath.pop();
                    return;
                }
                
                // Add
                if (!connectedPath.includes(body)) {
                    const dist = Vector.magnitude(Vector.sub(body.position, lastInPath.position));
                    // しきい値をさらに広げて、より離れていても吸い付くように調整
                    const threshold = ACTIVE_SKILL.isKurutogaDrive ? ITEM_RADIUS * 12.0 : ITEM_RADIUS * 9.5;
                    if (dist < threshold) {
                        connectedPath.push(body);
                        playScribbleSound(); // 鉛筆の音
                        
                        // If kurutoga drive, absorb immediately adjacent ones to the path
                        if (ACTIVE_SKILL.isKurutogaDrive) {
                            absorbAround(lastInPath.position, body.position);
                        }
                    }
                }
            }
        }
    }
}

function absorbAround(p1, p2) {
    // Collect all bodies nearby the line segment
    const bounds = {
        min: { x: Math.min(p1.x, p2.x) - ITEM_RADIUS * 2, y: Math.min(p1.y, p2.y) - ITEM_RADIUS * 2},
        max: { x: Math.max(p1.x, p2.x) + ITEM_RADIUS * 2, y: Math.max(p1.y, p2.y) + ITEM_RADIUS * 2}
    };
    const caught = Matter.Query.region(items, bounds);
    caught.forEach(b => {
        if(!connectedPath.includes(b) && (b.render.opacity !== 0)) {
            connectedPath.push(b);
        }
    });
}

function removeBody(body) {
    spawnFlyingCoins(body.position, 1);
    Composite.remove(world, body);
    items = items.filter(b => b !== body);
}

// Multi-pen Skill Helpers
function autoChain(startBody) {
    const type = startBody.stationeryType;
    if (!type || startBody.isWoodBomb || startBody.isInkBomb) return;
    
    const chain = [startBody];
    const visited = new Set();
    visited.add(startBody);
    
    const queue = [startBody];
    while(queue.length > 0) {
        const current = queue.shift();
        const nearby = items.filter(b => 
            !visited.has(b) && 
            b.stationeryType === type && 
            !b.isWoodBomb && !b.isInkBomb &&
            Vector.magnitude(Vector.sub(b.position, current.position)) < ITEM_RADIUS * 3.5
        );
        nearby.forEach(b => {
            visited.add(b);
            chain.push(b);
            queue.push(b);
        });
    }
    
    if (chain.length >= 3) {
        playScribbleSound();
        createDOMEffect('explosion-effect', startBody.position, 150, 'rgba(255,255,255,0.5)');
        removeBodies(chain);
        GAME_STATE.score += chain.length * 120;
        
        // Gauge contribution
        if (type === GAME_STATE.equippedChar) {
            GAME_STATE.skillGauge += chain.length;
            updateSkillGaugeUI();
        }
        updateUI();
    }
}

function lineAreaClear(p1, p2) {
    const width = 120;
    const toRemove = items.filter(b => distToSegment(b.position, p1, p2) < width);
    
    if (toRemove.length > 0) {
        playKnockSound();
        createLineEffect(Vector.div(Vector.add(p1, p2), 2), Vector.angle(Vector.sub(p2, p1)), width);
        
        // Show line visual
        const mid = Vector.div(Vector.add(p1, p2), 2);
        createDOMEffect('explosion-effect', mid, width * 2, 'rgba(200,200,240,0.4)');
        
        GAME_STATE.score += toRemove.length * 80;
        removeBodies(toRemove);
        updateUI();
    }
}

function distToSegment(p, v, w) {
    const l2 = Vector.magnitudeSquared(Vector.sub(v, w));
    if (l2 === 0) return Vector.magnitude(Vector.sub(p, v));
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Vector.magnitude(Vector.sub(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
}

function removeBodies(bodiesToRemove) {
    bodiesToRemove.forEach(b => {
        spawnFlyingCoins(b.position, 1);
    });
    Composite.remove(world, bodiesToRemove);
    items = items.filter(b => !bodiesToRemove.includes(b));
}

// Skills Implementation
function showSkillCutin(char) {
    const layer = document.getElementById('effects-layer');
    const div = document.createElement('div');
    div.className = 'skill-cutin';
    div.innerText = char.skillType.toUpperCase();
    layer.appendChild(div);
    setTimeout(() => div.remove(), 1500);
}

function executeSkill(char) {
    showSkillCutin(char);
    const center = {x: CANVAS_WIDTH/2, y: CANVAS_HEIGHT/2};
    
    switch(char.skillType) {
        case 'erasure_square':
            // MONO
            setTimeout(() => {
                const s = CANVAS_WIDTH * 0.6;
                const bounds = {
                    min: { x: center.x - s/2, y: center.y - s/2 },
                    max: { x: center.x + s/2, y: center.y + s/2 }
                };
                createDOMEffect('explosion-effect', center, s, 'rgba(66, 153, 225, 0.8)');
                const toRemove = items.filter(b => b.position.x >= bounds.min.x && b.position.x <= bounds.max.x && b.position.y >= bounds.min.y && b.position.y <= bounds.max.y);
                GAME_STATE.score += toRemove.length * 80;
                removeBodies(toRemove);
                updateUI();
            }, 500);
            break;
            
        case 'hexa_change':
            // UNI
            setTimeout(() => {
                const targetType = stageTypes[Math.floor(Math.random() * stageTypes.length)];
                items.forEach(b => {
                    if(b.stationeryType === targetType) {
                        b.stationeryType = char.id;
                        createDOMEffect('explosion-effect', b.position, 60, '#742a2a');
                    }
                });
            }, 500);
            break;
            
        case 'kurutoga_drive':
            // Kurutoga
            ACTIVE_SKILL.isKurutogaDrive = true;
            setTimeout(() => ACTIVE_SKILL.isKurutogaDrive = false, 8000);
            break;
            
        case 'ultra_smooth':
            // Jetstream
            ACTIVE_SKILL.isJetstreamSmooth = true;
            engine.timing.timeScale = 1.3;
            items.forEach(b => Matter.Body.setFriction(b, 0.1));
            setTimeout(() => {
                ACTIVE_SKILL.isJetstreamSmooth = false;
                engine.timing.timeScale = 1.0;
                items.forEach(b => Matter.Body.setFriction(b, 0.8));
            }, 8000);
            break;
            
        case 'oil_paint':
            // Mackee
            ACTIVE_SKILL.isMackeePaint = true; // Handled in pointermove
            break;
            
        case 'ruled_line':
            // Campus
            setTimeout(() => {
                const lines = [CANVAS_HEIGHT*0.3, CANVAS_HEIGHT*0.5, CANVAS_HEIGHT*0.7];
                let removed = 0;
                lines.forEach(ly => {
                    createLineEffect({x: CANVAS_WIDTH/2, y: ly}, 0, ITEM_RADIUS*2.5);
                    const caught = items.filter(b => Math.abs(b.position.y - ly) < ITEM_RADIUS*2);
                    removed += caught.length;
                    removeBodies(caught);
                });
                GAME_STATE.score += removed * 80;
                GAME_STATE.coins += Math.floor(removed / 3);
                updateUI();
            }, 500);
            break;
            
        case 'ink_bomb':
            // Preppy
            setTimeout(() => {
                const targets = [...items].sort(()=>0.5-Math.random()).slice(0, 3);
                targets.forEach(b => {
                    b.isInkBomb = true;
                    // Provide a visual scale bounce
                    Matter.Body.scale(b, 1.3, 1.3);
                    createDOMEffect('explosion-effect', b.position, 80, '#b794f4');
                });
            }, 500);
            break;
            
        case 'frixion_eraser':
            // Frixion
            setTimeout(() => {
                const targetType = stageTypes.filter(t => t !== char.id)[Math.floor(Math.random() * (stageTypes.length-1))];
                items.forEach(b => {
                    if(b.stationeryType === targetType) {
                        b.render.opacity = 0; // Hide them completely
                        b.isSensor = true;    // Make them fall through bottom
                    }
                });
            }, 500);
            break;
            
        case 'grid_shot':
            // Rotring
            setTimeout(() => {
                createLineEffect(center, 0, ITEM_RADIUS*2.5); // Horiz
                createLineEffect(center, Math.PI/2, ITEM_RADIUS*2.5); // Vert
                const toRemove = items.filter(b => Math.abs(b.position.y - center.y) < ITEM_RADIUS*2 || Math.abs(b.position.x - center.x) < ITEM_RADIUS*2);
                GAME_STATE.score += toRemove.length * 100;
                removeBodies(toRemove);
                updateUI();
            }, 500);
            break;
            
        case 'aging_glow':
            // Wood
            setTimeout(() => {
                // Attract everything to center
                items.forEach(b => {
                    const force = Vector.mult(Vector.normalise(Vector.sub(center, b.position)), 0.05);
                    Matter.Body.applyForce(b, b.position, force);
                });
                
                setTimeout(() => {
                    // Create massive bomb
                    const bomb = Bodies.circle(center.x, center.y, ITEM_RADIUS * 2, { density: 5.0, friction: 1.0});
                    bomb.stationeryType = char.id;
                    bomb.isWoodBomb = true;
                    removeBodies([...items]); // Clear board
                    Composite.add(world, bomb);
                    items.push(bomb);
                    createDOMEffect('explosion-effect', center, ITEM_RADIUS*6, '#b7791f');
                }, 1000);
            }, 500);
            break;
            
        case 'multi_knock':
            // Multi-function Pen Overhauled
            if (!ACTIVE_SKILL.isMechActive) {
                ACTIVE_SKILL.isMechActive = true;
                setTimeout(() => ACTIVE_SKILL.isMechActive = false, 10000);
            } else if (!ACTIVE_SKILL.isBallActive) {
                ACTIVE_SKILL.isBallActive = true;
                setTimeout(() => ACTIVE_SKILL.isBallActive = false, 10000);
            } else {
                // If both active, just refresh someone? 
                // Or maybe the user meant they stick together.
                // Let's just say both are refreshed if used again.
            }
            updateUI();
            break;
    }
}

function triggerWoodBomb(pos) {
    createDOMEffect('explosion-effect', pos, CANVAS_WIDTH * 1.5, '#b7791f');
    const bounds = {
        min: { x: pos.x - CANVAS_WIDTH, y: pos.y - CANVAS_WIDTH },
        max: { x: pos.x + CANVAS_WIDTH, y: pos.y + CANVAS_WIDTH }
    };
    const caught = Matter.Query.region(items, bounds);
    GAME_STATE.score += caught.length * 300; // massive points
    removeBodies(caught);
}

function triggerInkBomb(pos) {
    createDOMEffect('explosion-effect', pos, 200, '#b794f4');
    const caught = items.filter(b => Vector.magnitude(Vector.sub(b.position, pos)) < 150);
    GAME_STATE.score += caught.length * 100;
    removeBodies(caught);
}

// Effects Overlay
function createDOMEffect(className, pos, size, shadowColor = 'rgba(255,255,255,0.8)') {
    const layer = document.getElementById('effects-layer');
    if(!layer) return;
    const div = document.createElement('div');
    div.className = className;
    div.style.left = `${pos.x - size/2}px`;
    div.style.top = `${pos.y - size/2}px`;
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;
    if(shadowColor !== 'rgba(255,255,255,0.8)'){
        div.style.background = `radial-gradient(circle, ${shadowColor} 0%, rgba(255,255,255,0) 70%)`;
    }
    layer.appendChild(div);
    setTimeout(() => div.remove(), 500);
}

function createLineEffect(origin, angle, width) {
    const layer = document.getElementById('effects-layer');
    if(!layer) return;
    const div = document.createElement('div');
    div.className = 'line-effect';
    const length = CANVAS_WIDTH * 2;
    div.style.width = `${length}px`;
    div.style.height = `${width}px`;
    div.style.left = `${origin.x - length/2}px`;
    div.style.top = `${origin.y - width/2}px`;
    div.style.transform = `rotate(${angle}rad)`;
    layer.appendChild(div);
    setTimeout(() => div.remove(), 400);
}

function updateUI() {
    const s = document.getElementById('score');
    if(s) s.innerText = GAME_STATE.score;
    
    // Coin update: Show session coins during play
    const gc = document.getElementById('game-coin-count');
    if(gc) gc.innerText = GAME_STATE.currentSessionCoins;
}

function spawnFlyingCoins(pos, count) {
    const layer = document.getElementById('effects-layer');
    if (!layer) return;

    for (let i = 0; i < count; i++) {
        const coin = document.createElement('div');
        coin.className = 'flying-coin';
        coin.innerHTML = '🪙';
        
        layer.appendChild(coin);
        
        // Start at item position
        coin.style.left = `${pos.x}px`;
        coin.style.top = `${pos.y}px`;

        // Standard destination: Game Coin Board is at approx top-right
        const target = document.querySelector('.paper-label-coin');
        if (!target) {
            // Failsafe: just remove coin and increment count if target missing
            coin.remove();
            GAME_STATE.currentSessionCoins += 1;
            updateUI();
            return;
        }

        const targetRect = target.getBoundingClientRect();
        const screenRect = document.getElementById('app').getBoundingClientRect();
        
        // Relative to app/layer
        const targetX = targetRect.left - screenRect.left + targetRect.width / 2;
        const targetY = targetRect.top - screenRect.top + targetRect.height / 2;

        // Animate
        const duration = 600 + Math.random() * 200;
        const jumpY = -50 - Math.random() * 100;

        coin.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${(targetX - pos.x) / 4}px, ${jumpY}px) scale(1.5)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${targetX - pos.x}px, ${targetY - pos.y}px) scale(0.5)`, opacity: 0 }
        ], {
            duration: duration,
            easing: 'cubic-bezier(0.42, 0, 0.58, 1)'
        }).onfinish = () => {
            coin.remove();
            if(!GAME_STATE.isPaused) {
                GAME_STATE.currentSessionCoins += 1;
                updateUI();
            }
        };
    }
}

// Spawner
let spawnInterval;

function spawnBulkItems(count) {
    for(let i=0; i<count; i++) {
        // 少しだけX座標を散らして一気に生成
        setTimeout(() => spawnItem(), Math.random() * 50);
    }
}

function startSpawning() {
    if(spawnInterval) clearInterval(spawnInterval);
    // 初期ドサっと落下
    spawnBulkItems(MAX_ITEMS);
    
    spawnInterval = setInterval(() => {
        const missing = MAX_ITEMS - items.length;
        if(missing > 3) {
            // 一気に补充
            const count = Math.min(missing, 12);
            spawnBulkItems(count);
        }
    }, 400); // チェック頻度
}
function stopSpawning() {
    if(spawnInterval) clearInterval(spawnInterval);
}

// Timer
let timerInterval;
function startTimer() {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(GAME_STATE.isPaused) return; // Skip logic while paused
        if(GAME_STATE.time > 0) {
            GAME_STATE.time--;
            const t = document.getElementById('time');
            if(t) t.innerText = GAME_STATE.time;
        } else {
            stopGame();
            if(window.onGameOver) window.onGameOver();
        }
    }, 1000);
}

function stopTimer() {
    if(timerInterval) clearInterval(timerInterval);
}

// Render Loop
function render() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw Oval Field (Tray) Guide
    ctx.beginPath();
    ctx.ellipse(CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.4, CANVAS_WIDTH * 0.48, CANVAS_HEIGHT * 0.56, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(74, 85, 104, 0.1)'; 
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 5]); // Hand-drawn dashed look
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw background "dish" fill
    ctx.fillStyle = 'rgba(74, 85, 104, 0.03)';
    ctx.fill();
    
    // IMPORTANT: Draw ONLY items in the items array (prevents ghosting/walls/overlapping)
    items.forEach(body => {
        if (body.render && body.render.opacity === 0) return; // Invisible
        
        const x = body.position.x;
        const y = body.position.y;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(body.angle);
        
        const type = body.stationeryType;
        const radiusMultiplier = body.isWoodBomb ? 2 : (body.isInkBomb ? 1.3 : 1);
        const actualRadius = ITEM_RADIUS * radiusMultiplier;
        
        if (images[type] && images[type].complete) {
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            
            // Critical: Clipping path for perfect circle
            ctx.beginPath();
            ctx.arc(0, 0, actualRadius, 0, 2 * Math.PI);
            ctx.clip();
            
            ctx.drawImage(images[type], -actualRadius, -actualRadius, actualRadius * 2, actualRadius * 2);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, actualRadius, 0, 2 * Math.PI);
            ctx.fillStyle = STATIONERY_DATA[type] ? STATIONERY_DATA[type].color : '#ccc';
            ctx.fill();
        }
        
        ctx.restore();
        
        if (connectedPath.includes(body)) {
            ctx.save();
            ctx.translate(x, y);
            ctx.beginPath();
            ctx.arc(0, 0, actualRadius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'white';
            ctx.stroke();
            ctx.restore();
        }
    });
    
    // Path (鉛筆風の多重線)
    if (connectedPath.length > 1) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        const drawPath = (offset, width, alpha, color) => {
            ctx.beginPath();
            const start = connectedPath[0].position;
            ctx.moveTo(start.x + offset.x, start.y + offset.y);
            for(let i = 1; i < connectedPath.length; i++) {
                const p = connectedPath[i].position;
                ctx.lineTo(p.x + offset.x, p.y + offset.y);
            }
            ctx.lineWidth = width;
            ctx.strokeStyle = color.replace('ALPHA', alpha);
            ctx.stroke();
        };

        const baseColor = ACTIVE_SKILL.isKurutogaDrive ? 'rgba(220, 38, 38, ALPHA)' : 'rgba(30,30,30, ALPHA)';
        
        // 1. かすれた広い部分
        drawPath({x:0, y:0}, 18, '0.2', baseColor);
        
        // 2. 複数の細い線を重ねて鉛筆の芯の質感を出す
        for(let j=0; j<3; j++) {
            const ox = (Math.random() - 0.5) * 4;
            const oy = (Math.random() - 0.5) * 4;
            drawPath({x:ox, y:oy}, 2 + Math.random() * 2, '0.4', baseColor);
        }

        // 3. メインの芯
        drawPath({x:0, y:0}, 5, '0.8', baseColor);
    }
    
    requestAnimationFrame(render);
}

window.togglePause = function() {
    GAME_STATE.isPaused = !GAME_STATE.isPaused;
    
    const overlay = document.getElementById('pause-overlay');
    
    if(GAME_STATE.isPaused) {
        // Pausing
        if(gameRunner) Runner.stop(gameRunner);
        if(overlay) overlay.classList.remove('hidden');
    } else {
        // Resuming
        if(gameRunner) Runner.run(gameRunner, engine);
        if(overlay) overlay.classList.add('hidden');
    }
};

// Global Control
let gameRunner = null;
let renderHandle = null;

window.startGame = function() {
    updateCanvasSize();
    
    // Critical: Clear everything including old residual bodies
    Composite.clear(world, false); 
    items = [];
    walls = [];
    
    createWalls();
    GAME_STATE.score = 0;
    GAME_STATE.time = 60;
    GAME_STATE.skillGauge = 0;
    GAME_STATE.currentSessionCoins = 0;
    GAME_STATE.isPaused = false;
    Object.keys(ACTIVE_SKILL).forEach(k => ACTIVE_SKILL[k] = false);
    
    updateUI();
    updateSkillGaugeUI();
    const t = document.getElementById('time');
    if(t) t.innerText = GAME_STATE.time;
    
    // Set Knock button icon
    if(skillCharImg) {
        skillCharImg.src = STATIONERY_DATA[GAME_STATE.equippedChar].imageSrc;
    }
    
    initStageTypes();
    
    if(!gameRunner) {
        gameRunner = Runner.create();
    }
    Runner.run(gameRunner, engine);
    
    startSpawning();
    startTimer();
    
    if(!renderHandle) {
        renderHandle = requestAnimationFrame(render);
    }
};

window.stopGame = function() {
    stopSpawning();
    stopTimer();
    if(gameRunner) {
        Runner.stop(gameRunner);
    }
    
    // Add session coins to total
    GAME_STATE.coins += GAME_STATE.currentSessionCoins;
    saveCoins();
    
    // Update Home/Shop UI
    document.querySelectorAll('#coin-count, #shop-coin-count').forEach(el => {
        el.innerText = GAME_STATE.coins;
    });

    removeBodies([...items]);
};
