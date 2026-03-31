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
        'normal': { id: 'normal', title: 'ノーマルガチャ', cost: 1000, rareChance: 0.1, emoji: '📦' },
        'premium': { id: 'premium', title: 'プレミアムガチャ', cost: 3000, rareChance: 0.5, emoji: '✨' },
        'event': { id: 'event', title: 'セレクトBOX', cost: 2000, rareChance: 0.3, emoji: '🎁' }
    };
    let currentGacha = 'normal';
    
    // UI Elements
    const carousel = document.getElementById('gacha-carousel');
    const mainTitle = document.getElementById('gacha-title-display');
    const mainCost = document.getElementById('gacha-cost-display');
    const mainEmoji = document.getElementById('main-gacha-emoji');
    
    const btnPrepare = document.getElementById('btn-prepare-gacha');
    const confirmModal = document.getElementById('gacha-confirm-modal');
    const confirmName = document.getElementById('confirm-gacha-name');
    const confirmCost = document.getElementById('confirm-gacha-cost');
    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    
    const drawOverlay = document.getElementById('gacha-draw-overlay');
    const btnCancelDraw = document.getElementById('btn-cancel-draw');

    const resultOverlay = document.getElementById('gacha-result-overlay');
    const resultImg = document.getElementById('gacha-result-img');
    const resultName = document.getElementById('gacha-result-name');
    const resultTitle = document.getElementById('gacha-result-title');
    const btnClose = document.getElementById('btn-close-gacha');

    // Initialize Carousel
    function initCarousel() {
        carousel.innerHTML = '';
        Object.values(GACHA_TYPES).forEach(type => {
            const item = document.createElement('div');
            item.className = `carousel-item ${type.id === currentGacha ? 'active' : ''}`;
            item.innerHTML = `
                <div class="carousel-emoji">${type.emoji}</div>
                <div class="carousel-name">${type.title}</div>
            `;
            item.onclick = () => selectGacha(type.id);
            carousel.appendChild(item);
        });
    }
    initCarousel();

    function selectGacha(id) {
        currentGacha = id;
        const config = GACHA_TYPES[id];
        
        // Update UI
        mainTitle.innerText = config.title;
        mainCost.innerText = config.cost;
        mainEmoji.innerText = config.emoji;
        
        // Update Carousel Selection
        document.querySelectorAll('.carousel-item').forEach(el => {
            el.classList.remove('active');
            if (el.querySelector('.carousel-name').innerText === config.title) {
                el.classList.add('active');
            }
        });
    }

    // Modal Interaction
    btnPrepare.addEventListener('click', () => {
        const config = GACHA_TYPES[currentGacha];
        confirmName.innerText = config.title;
        confirmCost.innerText = config.cost;
        confirmModal.classList.remove('hidden');
    });

    btnConfirmCancel.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
    });

    btnConfirmOk.addEventListener('click', () => {
        const config = GACHA_TYPES[currentGacha];
        if (GAME_STATE.coins < config.cost) {
            alert(`コインが足りません！（必要: ${config.cost}コイン）`);
            confirmModal.classList.add('hidden');
            return;
        }
        
        confirmModal.classList.add('hidden');
        drawOverlay.classList.remove('hidden');
        resizeCanvas(); // Ensure canvas is sized correctly in the overlay
    });

    btnCancelDraw.addEventListener('click', () => {
        drawOverlay.classList.add('hidden');
        ctx.clearRect(0,0, canvas.width, canvas.height);
    });
    
    // Drawing Logic
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const evt = e.touches ? e.touches[0] : e;
        if(!evt) return {x:0, y:0};
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }
    
    canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isDrawing = true;
        points = [];
        ctx.clearRect(0,0, canvas.width, canvas.height);
        
        const pos = getPointerPos(e);
        points.push(pos);
        
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    });
    
    canvas.addEventListener('pointermove', (e) => {
        e.preventDefault();
        if (!isDrawing) return;
        
        const pos = getPointerPos(e);
        points.push(pos);
        
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });
    
    window.addEventListener('pointerup', () => {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (points.length < 5) {
            ctx.clearRect(0,0, canvas.width, canvas.height);
            return;
        }
        
        // Finalize Gacha
        const conf = GACHA_TYPES[currentGacha];
        GAME_STATE.coins -= conf.cost;
        saveCoins();
        
        // Update all coin displays
        document.querySelectorAll('#coin-count, #shop-coin-count').forEach(el => {
            el.innerText = GAME_STATE.coins;
        });
        
        triggerGacha(conf);
    });
    
    function triggerGacha(conf) {
        const rand = Math.random();
        const isRare = rand < conf.rareChance;
        
        redrawStrokeEffect(isRare ? '#2196f3' : '#2d3748', isRare);
        
        const availableTypes = Object.values(STATIONERY_DATA);
        const selectedChar = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        let isNew = false;
        if (!GAME_STATE.unlockedChars.includes(selectedChar.id)) {
            GAME_STATE.unlockedChars.push(selectedChar.id);
            saveUnlockedChars();
            isNew = true;
            if (window.renderCharacters) window.renderCharacters();
        }
        
        setTimeout(() => {
            drawOverlay.classList.add('hidden');
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
