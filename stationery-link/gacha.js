// gacha.js
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gacha-canvas');
    if (!canvas) return;
    
    // Set appropriate resolution for canvas
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const ctx = canvas.getContext('2d');
    
    let isDrawing = false;
    let points = [];
    
    // Gacha Config
    const GACHA_TYPES = {
        'normal': { title: 'ノーマルガチャ', cost: 1000, rareChance: 0.1 },
        'premium': { title: 'プレミアムガチャ', cost: 3000, rareChance: 0.5 }
    };
    let currentGacha = 'normal';
    
    // Gacha Selection Tabs
    const gachaTabs = document.querySelectorAll('.gacha-tab');
    const titleDisplay = document.getElementById('gacha-title-display');
    const costDisplay = document.getElementById('gacha-cost-display');

    gachaTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const type = e.currentTarget.getAttribute('data-gacha');
            if(GACHA_TYPES[type]) {
                currentGacha = type;
                gachaTabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                titleDisplay.innerText = GACHA_TYPES[type].title;
                costDisplay.innerText = `1回 ${GACHA_TYPES[type].cost}コイン`;
            }
        });
    });
    
    // UI Elements
    const resultOverlay = document.getElementById('gacha-result-overlay');
    const resultImg = document.getElementById('gacha-result-img');
    const resultName = document.getElementById('gacha-result-name');
    const resultTitle = document.getElementById('gacha-result-title');
    const btnClose = document.getElementById('btn-close-gacha');
    
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const evt = e.touches ? e.touches[0] : e;
        if(!evt) return {x:0, y:0};
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }
    
    // Start Draw
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const conf = GACHA_TYPES[currentGacha];
        
        if (GAME_STATE.coins < conf.cost) {
            alert(`コインが足りません！（必要: ${conf.cost}コイン）\nパズルを遊んで集めよう！`);
            return;
        }
        
        isDrawing = true;
        points = [];
        ctx.clearRect(0,0, canvas.width, canvas.height); // Clear previous
        
        const pos = getPointerPos(e);
        points.push(pos);
        
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = '#2d3748'; // Default black ink
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    });
    
    // Move Draw
    canvas.addEventListener('pointermove', (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        
        const pos = getPointerPos(e);
        points.push(pos);
        
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });
    
    // End Draw -> Trigger Gacha
    window.addEventListener('pointerup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (points.length < 5) { // Stroke too short
            ctx.clearRect(0,0, canvas.width, canvas.height);
            return;
        }
        
        // Subtract coins
        const conf = GACHA_TYPES[currentGacha];
        GAME_STATE.coins -= conf.cost;
        saveCoins();
        document.getElementById('coin-count').innerText = GAME_STATE.coins;
        document.getElementById('shop-coin-count').innerText = GAME_STATE.coins;
        
        triggerGacha(conf);
    });
    
    function triggerGacha(conf) {
        // Rarity determination
        const rand = Math.random();
        const isRare = rand < conf.rareChance;
        
        // Flash ink effect
        redrawStrokeEffect(isRare ? '#2196f3' : '#2d3748', isRare);
        
        // Pick character
        const availableTypes = Object.values(STATIONERY_DATA);
        // Simple equal chance picking for now
        const selectedChar = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        // Save unlock
        let isNew = false;
        if (!GAME_STATE.unlockedChars.includes(selectedChar.id)) {
            GAME_STATE.unlockedChars.push(selectedChar.id);
            saveUnlockedChars();
            isNew = true;
            if (window.renderCharacters) window.renderCharacters(); // Update UI list
        }
        
        // Show result after small delay for the ink effect
        setTimeout(() => {
            showResult(selectedChar, isNew, isRare);
            ctx.clearRect(0,0, canvas.width, canvas.height);
        }, 800);
    }
    
    function redrawStrokeEffect(color, isRare) {
        ctx.clearRect(0,0, canvas.width, canvas.height);
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        
        if (isRare) {
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }
        
        ctx.stroke();
    }
    
    function showResult(char, isNew, isRare) {
        resultImg.src = char.imageSrc;
        resultName.innerText = char.name;
        
        if (isNew) {
            resultTitle.innerText = isRare ? "SUPER RARE! (NEW)" : "NEW!";
            resultTitle.style.color = isRare ? "#00e5ff" : "#ff6b6b";
        } else {
            resultTitle.innerText = "GET!";
            resultTitle.style.color = "#a0aec0";
        }
        
        resultOverlay.classList.remove('hidden');
    }
    
    btnClose.addEventListener('click', () => {
        resultOverlay.classList.add('hidden');
    });

});
