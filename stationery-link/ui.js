// ui.js
document.addEventListener('DOMContentLoaded', () => {
    // Nav Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');
    const bottomNav = document.getElementById('bottom-nav');

    function switchScreen(targetId) {
        screens.forEach(s => s.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));

        const targetScreen = document.getElementById(targetId);
        targetScreen.classList.add('active');

        // Update nav active state (unless viewing play screen)
        if(targetId !== 'view-play') {
            const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
            if(navItem) navItem.classList.add('active');
            bottomNav.style.display = 'flex'; // show nav
        } else {
            bottomNav.style.display = 'none'; // hide nav during play
        }
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchScreen(target);
        });
    });

    // Stats updates
    const playCountDisplay = document.getElementById('play-count-display');
    const highScoreDisplay = document.getElementById('high-score-display');
    
    function updateStatsUI() {
        playCountDisplay.innerText = GAME_STATE.playCount;
        const hs = localStorage.getItem('stationeryLink_highScore') || '0';
        highScoreDisplay.innerText = hs;
        
        document.getElementById('coin-count').innerText = GAME_STATE.coins;
        document.getElementById('shop-coin-count').innerText = GAME_STATE.coins;
    }
    updateStatsUI();
    
    function updateHomeCharacter() {
        const char = STATIONERY_DATA[GAME_STATE.equippedChar] || STATIONERY_DATA['mono'];
        const imgEl = document.getElementById('home-equipped-char-img');
        if(imgEl) {
            imgEl.src = char.imageSrc;
        }
    }
    updateHomeCharacter();

    // Play Button
    document.getElementById('btn-play').addEventListener('click', () => {
        switchScreen('view-play');
        if(typeof startGame === 'function') {
            startGame();
        }
    });

    // Exit Game Button (Testing)
    document.getElementById('btn-exit-game').addEventListener('click', () => {
        if(typeof stopGame === 'function') {
            stopGame();
        }
        
        // Save score if High Score
        const hs = parseInt(localStorage.getItem('stationeryLink_highScore') || '0', 10);
        if(GAME_STATE.score > hs) {
            localStorage.setItem('stationeryLink_highScore', GAME_STATE.score.toString());
        }
        
        updateStatsUI();
        // Convert score to coins (e.g. 1% of score)
        const earnedCoins = Math.floor(GAME_STATE.score * 0.01);
        GAME_STATE.coins += earnedCoins;
        saveCoins();
        
        switchScreen('view-home');
        alert(`ゲーム終了！\nスコア: ${GAME_STATE.score}\n獲得コイン: ${earnedCoins}`);
    });

    function renderCharacters() {
        const charList = document.getElementById('character-list');
        charList.innerHTML = '';
        Object.values(STATIONERY_DATA).forEach(char => {
            const isUnlocked = GAME_STATE.unlockedChars.includes(char.id);
            const isEquipped = GAME_STATE.equippedChar === char.id;
            
            const div = document.createElement('div');
            div.className = 'char-card' + (!isUnlocked ? ' locked' : '') + (isEquipped ? ' equipped' : '');
            
            let actionHtml = '';
            if(isUnlocked) {
                if(isEquipped) {
                    actionHtml = `<button class="equip-btn disabled">装備中</button>`;
                } else {
                    actionHtml = `<button class="equip-btn" data-id="${char.id}">飾る</button>`;
                }
            } else {
                actionHtml = `<span class="lock-icon">🔒</span>`;
            }
            
            div.innerHTML = `
                <img src="${char.imageSrc}" alt="${char.name}">
                <span class="name">${isUnlocked ? char.name : '???'}</span>
                <div class="card-action">${actionHtml}</div>
            `;
            charList.appendChild(div);
        });
        
        // Attach events to equip buttons
        document.querySelectorAll('.equip-btn:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const charId = e.target.getAttribute('data-id');
                if(charId) {
                    GAME_STATE.equippedChar = charId;
                    saveEquippedChar();
                    renderCharacters();
                    updateHomeCharacter();
                }
            });
        });
    }
    // Initial render
    renderCharacters();
    // Expose for gacha updates
    window.renderCharacters = renderCharacters;

    // Add UI global function
    window.onGameOver = function() {
        // Triggered by game.js when time finishes
        document.getElementById('btn-exit-game').click();
    };

});
