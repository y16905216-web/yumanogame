// ui.js
document.addEventListener('DOMContentLoaded', () => {
    // Nav Navigation
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');
    const sideNav = document.getElementById('side-nav');

    let isTransitioning = false;

    function switchScreen(targetId) {
        if (isTransitioning) return;
        const oldScreen = document.querySelector('.screen.active');
        const targetScreen = document.getElementById(targetId);
        
        if (oldScreen === targetScreen) return;
        
        if (oldScreen) {
            isTransitioning = true;
            
            // Start animations
            oldScreen.classList.add('page-turn-exit');
            targetScreen.classList.add('active', 'page-turn-enter');
            
            // Update nav active state immediately for better feedback
            navItems.forEach(n => n.classList.remove('active'));
            const navItem = document.querySelector(`.nav-item[data-target="${targetId}"]`);
            if(navItem) navItem.classList.add('active');

            setTimeout(() => {
                oldScreen.classList.remove('active', 'page-turn-exit');
                targetScreen.classList.remove('page-turn-enter');
                isTransitioning = false;
            }, 600); // matching CSS animation duration
        } else {
            targetScreen.classList.add('active');
        }

        // Side Nav Visibility
        if(targetId === 'view-play') {
            if(sideNav) sideNav.style.display = 'none';
        } else {
            if(sideNav) sideNav.style.display = 'flex';
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

    // Quit Game Button (Now in pause menu)
    const quitBtn = document.getElementById('btn-quit-game');
    if(quitBtn) {
        quitBtn.addEventListener('click', () => {
            if(GAME_STATE.isPaused) window.togglePause(); // Resume internals before stopping clean
            
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
    }

    let currentPreviewCharId = GAME_STATE.equippedChar;

    function getCompanyName(charId) {
        const companyMap = {
            'mono': 'トンボ鉛筆',
            'uni': '三菱鉛筆',
            'kurutoga': '三菱鉛筆',
            'jetstream': '三菱鉛筆',
            'mackee': 'ゼブラ',
            'campus': 'コクヨ',
            'preppy': 'プラチナ万年筆',
            'frixion': 'パイロットコーポレーション',
            'rotring600': 'ロットリング',
            'wood': '野原工芸'
        };
        return companyMap[charId] ? `『${companyMap[charId]}』より` : 'ステツムオリジナル';
    }

    function updateDetailArea(charId) {
        const char = STATIONERY_DATA[charId];
        if(!char) return;

        document.getElementById('detail-char-img').src = char.imageSrc;
        document.getElementById('detail-char-name').innerText = char.name;
        document.getElementById('detail-char-series').innerText = getCompanyName(charId);
        document.getElementById('detail-char-desc').innerText = char.description;
        document.getElementById('detail-char-cost').innerText = char.skillCost;

        // Optionally randomize or set dummy levels for visuals
        // To make it look like tsumtsum, we just leave the HTML static dummy numbers,
        // but let's change button text if already equipped
        const setBtn = document.getElementById('btn-set-mysta');
        if(charId === GAME_STATE.equippedChar) {
            setBtn.innerText = 'セット中';
            setBtn.disabled = true;
        } else {
            setBtn.innerText = 'マイステにセット';
            setBtn.disabled = false;
        }

        // Update list styling
        document.querySelectorAll('.char-card').forEach(card => card.classList.remove('selected'));
        const activeCard = document.querySelector(`.char-card[data-char-id="${charId}"]`);
        if(activeCard) activeCard.classList.add('selected');
    }

    // Set Mysta Button Logic
    const setBtn = document.getElementById('btn-set-mysta');
    if(setBtn) {
        setBtn.addEventListener('click', () => {
            if(currentPreviewCharId && currentPreviewCharId !== GAME_STATE.equippedChar) {
                GAME_STATE.equippedChar = currentPreviewCharId;
                saveEquippedChar();
                renderCharacters(); // re-render list marks
                updateHomeCharacter();
                updateDetailArea(currentPreviewCharId);
            }
        });
    }

    function renderCharacters() {
        const pagesContainer = document.getElementById('character-pages-container');
        const dotsContainer = document.getElementById('page-dots-container');
        if(!pagesContainer) return; // For safety
        
        pagesContainer.innerHTML = '';
        if(dotsContainer) dotsContainer.innerHTML = '';
        
        const chars = Object.values(STATIONERY_DATA);
        const charsPerPage = 6;
        const totalPages = Math.ceil(chars.length / charsPerPage);
        
        for (let p = 0; p < totalPages; p++) {
            // ドットの生成
            if(dotsContainer) {
                const dot = document.createElement('div');
                dot.className = 'page-dot' + (p === 0 ? ' active' : '');
                dotsContainer.appendChild(dot);
            }

            // ページの生成
            const pageDiv = document.createElement('div');
            pageDiv.className = 'char-page';
            
            const startIdx = p * charsPerPage;
            const pageChars = chars.slice(startIdx, startIdx + charsPerPage);
            
            // キャラの描画
            pageChars.forEach(char => {
                const isUnlocked = GAME_STATE.unlockedChars.includes(char.id);
                const isEquipped = GAME_STATE.equippedChar === char.id;
                
                const div = document.createElement('div');
                div.className = 'char-card' + (!isUnlocked ? ' locked' : '') + (isEquipped ? ' equipped-mark' : '');
                div.setAttribute('data-char-id', char.id);
                
                div.innerHTML = `
                    <img src="${char.imageSrc}" alt="${char.name}">
                    <span class="name">${isUnlocked ? char.name : '???'}</span>
                `;

                if(isUnlocked) {
                    div.addEventListener('click', () => {
                        currentPreviewCharId = char.id;
                        updateDetailArea(char.id);
                    });
                }
                
                pageDiv.appendChild(div);
            });
            
            // 空き枠の埋め (6枠に満たない場合)
            for(let empty = pageChars.length; empty < charsPerPage; empty++) {
                const emptySlot = document.createElement('div');
                emptySlot.className = 'empty-slot';
                pageDiv.appendChild(emptySlot);
            }
            
            pagesContainer.appendChild(pageDiv);
        }
        
        // Ensure default view is updated
        updateDetailArea(currentPreviewCharId);

        // スクロール時のページインジケーター更新
        pagesContainer.addEventListener('scroll', () => {
            const pageIndex = Math.round(pagesContainer.scrollLeft / pagesContainer.clientWidth);
            if(dotsContainer) {
                const dots = dotsContainer.querySelectorAll('.page-dot');
                dots.forEach((d, i) => {
                    if(i === pageIndex) d.classList.add('active');
                    else d.classList.remove('active');
                });
            }
        });
    }
    // Initial render
    renderCharacters();
    // Expose for gacha updates
    window.renderCharacters = renderCharacters;

    // Add UI global function
    window.onGameOver = function() {
        // Triggered by game.js when time finishes
        const quitBtn = document.getElementById('btn-quit-game');
        if(quitBtn) quitBtn.click();
    };

});
