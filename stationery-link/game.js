// game.js
const Engine = Matter.Engine,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Vector = Matter.Vector;

// Config
const ITEM_RADIUS = 30; // アイコンのサイズ
const MAX_ITEMS = 60; // 画面内限界
let container = document.getElementById('view-play');
let CANVAS_WIDTH = container.offsetWidth;
let CANVAS_HEIGHT = container.offsetHeight;

// Engine Setup
const engine = Engine.create();
engine.world.gravity.y = 1.2;
const world = engine.world;

const canvas = document.getElementById('game-canvas');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const ctx = canvas.getContext('2d');

window.addEventListener('resize', () => {
    CANVAS_WIDTH = container.offsetWidth || window.innerWidth;
    CANVAS_HEIGHT = container.offsetHeight || window.innerHeight;
    if(canvas) {
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
    }
    createWalls();
});

// Walls
let walls = [];
function createWalls() {
    if (walls.length > 0) Composite.remove(world, walls);
    const opt = { isStatic: true, friction: 0 };
    walls = [
        Bodies.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT + 25, CANVAS_WIDTH, 50, opt), // bottom
        Bodies.rectangle(-25, CANVAS_HEIGHT / 2, 50, CANVAS_HEIGHT * 2, opt), // left
        Bodies.rectangle(CANVAS_WIDTH + 25, CANVAS_HEIGHT / 2, 50, CANVAS_HEIGHT * 2, opt) // right
    ];
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
    isMackeePaint: false
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
    stageTypes = [GAME_STATE.equippedChar];
    const available = Object.keys(STATIONERY_DATA).filter(k => k !== GAME_STATE.equippedChar);
    available.sort(() => 0.5 - Math.random());
    stageTypes = stageTypes.concat(available.slice(0, 4));
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

// Interaction
function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    const evt = e.touches ? e.touches[0] : e;
    if(!evt) return lastPos;
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    isDragging = true;
    lastPos = getEventPos(e);
    connectedPath = [];
    checkIntersection(lastPos);
});

canvas.addEventListener('pointermove', (e) => {
    e.preventDefault();
    if (!isDragging) return;
    lastPos = getEventPos(e);
    
    if (ACTIVE_SKILL.isMackeePaint) {
        // Oil Paint: delete everything under the cursor immediately and convert to coins
        const bodiesUnder = Matter.Query.point(items, lastPos);
        if (bodiesUnder.length > 0) {
            const b = bodiesUnder[0];
            createDOMEffect('explosion-effect', b.position, 50, '#1a202c');
            removeBody(b);
            GAME_STATE.score += 50;
            GAME_STATE.coins += 1;
            updateUI();
        }
    } else {
        checkIntersection(lastPos);
    }
});

window.addEventListener('pointerup', () => {
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
        
        removeBodies(connectedPath);
        
        // Combo multiplier / score
        GAME_STATE.score += connectedPath.length * 100 * (ACTIVE_SKILL.isJetstreamSmooth ? 1.5 : 1.0);
        updateUI();
    }
    
    connectedPath = [];
});

function checkIntersection(pos) {
    const bodiesUnder = Matter.Query.point(items, pos);
    if (bodiesUnder.length > 0) {
        const body = bodiesUnder[0];
        
        // Check if visible (Frixion logic)
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
                    const threshold = ACTIVE_SKILL.isKurutogaDrive ? ITEM_RADIUS * 6.0 : ITEM_RADIUS * 3.5;
                    if (dist < threshold) {
                        connectedPath.push(body);
                        
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
    Composite.remove(world, body);
    items = items.filter(b => b !== body);
}

function removeBodies(bodiesToRemove) {
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
}

// Spawner
let spawnInterval;
function startSpawning() {
    if(spawnInterval) clearInterval(spawnInterval);
    spawnInterval = setInterval(() => spawnItem(), 150);
}
function stopSpawning() {
    if(spawnInterval) clearInterval(spawnInterval);
}

// Timer
let timerInterval;
function startTimer() {
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Items
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
    
    // Path
    if (connectedPath.length > 0) {
        ctx.beginPath();
        const start = connectedPath[0].position;
        ctx.moveTo(start.x, start.y);
        for(let i = 1; i < connectedPath.length; i++) {
            const p = connectedPath[i].position;
            ctx.lineTo(p.x, p.y);
        }
        if (isDragging) {
            ctx.lineTo(lastPos.x, lastPos.y);
        }
        ctx.strokeStyle = ACTIVE_SKILL.isKurutogaDrive ? 'rgba(255, 100, 100, 0.9)' : 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = ACTIVE_SKILL.isKurutogaDrive ? 25 : (ACTIVE_SKILL.isMackeePaint ? 35 : 8);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 5;
        ctx.stroke();
    }
    
    // Mackee active hint
    if (ACTIVE_SKILL.isMackeePaint) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = '20px sans-serif';
        ctx.fillText('マッキーモード：画面をなぞり消せ！', 20, 30);
    }
    
    requestAnimationFrame(render);
}

// Global Control
let gameRunner = null;
let renderHandle = null;

window.startGame = function() {
    createWalls();
    GAME_STATE.score = 0;
    GAME_STATE.time = 60;
    GAME_STATE.skillGauge = 0;
    Object.keys(ACTIVE_SKILL).forEach(k => ACTIVE_SKILL[k] = false);
    
    updateUI();
    updateSkillGaugeUI();
    const t = document.getElementById('time');
    if(t) t.innerText = GAME_STATE.time;
    
    // Set Knock button icon
    if(skillCharImg) {
        skillCharImg.src = STATIONERY_DATA[GAME_STATE.equippedChar].imageSrc;
    }
    
    removeBodies([...items]); 
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
    removeBodies([...items]);
};
