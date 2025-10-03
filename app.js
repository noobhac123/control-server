document.addEventListener('DOMContentLoaded', () => {
    // --- MOCK TELEGRAM DATA ---
    const tg = window.Telegram || {
        WebApp: {
            initDataUnsafe: { user: { first_name: 'User', photo_url: 'https://i.ibb.co/2kr3tws/default-avatar.png' } },
            ready: () => {},
            expand: () => {}
        }
    };
    tg.WebApp.ready();
    tg.WebApp.expand();

    // --- GAME CONFIGURATION ---
    const VAULT_CAPACITY_HOURS = 4; // Vault fills up in 4 hours

    const UPGRADES = {
        'gpu-miner': { name: 'GPU Miner', icon: '💻', baseCost: 50, baseProfit: 5 },
        'asic-rig': { name: 'ASIC Rig', icon: '⚙️', baseCost: 500, baseProfit: 25 },
        'data-center': { name: 'Data Center', icon: '🏢', baseCost: 5000, baseProfit: 150 },
        'quantum-comp': { name: 'Quantum Comp', icon: '⚛️', baseCost: 50000, baseProfit: 1000 }
    };

    // --- DOM ELEMENTS ---
    const splashScreen = document.getElementById('splash-screen');
    const appContainer = document.getElementById('app-container');
    const userPhoto = document.getElementById('user-photo');
    const userName = document.getElementById('user-name');
    const userBalanceDisplay = document.getElementById('user-balance');
    const profitRateDisplay = document.getElementById('profit-rate');
    const navButtons = document.querySelectorAll('.nav-btn');
    const contentSections = document.querySelectorAll('.content-section');
    const accumulatedEarningsDisplay = document.getElementById('accumulated-earnings');
    const vaultProgressFill = document.getElementById('vault-progress-fill');
    const vaultTimerDisplay = document.getElementById('vault-timer');
    const claimButton = document.getElementById('claim-button');
    const upgradeListContainer = document.getElementById('upgrade-list');
    const copyReferralBtn = document.getElementById('copy-referral-btn');

    // --- GAME STATE ---
    let state = {
        balance: 1000,
        profitPerHour: 0,
        lastClaimTimestamp: Date.now(),
        upgrades: {
            'gpu-miner': { level: 1 },
            'asic-rig': { level: 0 },
            'data-center': { level: 0 },
            'quantum-comp': { level: 0 }
        }
    };
    
    // --- INITIALIZATION ---
    function initializeApp() {
        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            splashScreen.addEventListener('transitionend', () => splashScreen.classList.add('hidden'), { once: true });
            appContainer.classList.remove('hidden');

            setupUserInfo();
            setupNavigation();
            setupInteractions();
            calculateProfitPerHour();
            renderMineUpgrades();
            updateAllDisplays();
            
            setInterval(updateVault, 1000);
        }, 2000);
    }

    function setupUserInfo() {
        const user = tg.WebApp.initDataUnsafe.user;
        if (user) {
            userName.textContent = user.first_name || 'User';
            if (user.photo_url) userPhoto.src = user.photo_url;
        }
    }
    
    function setupNavigation() {
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.dataset.target;
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                contentSections.forEach(section => {
                    section.classList.toggle('active', section.id === targetId);
                });
            });
        });
    }

    function setupInteractions() {
        claimButton.addEventListener('click', handleClaim);
        copyReferralBtn.addEventListener('click', copyReferralLink);
        upgradeListContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.upgrade-button');
            if (button) {
                handleUpgrade(button.dataset.id);
            }
        });
    }

    // --- UI RENDERING & UPDATES ---
    
    // NEW: Advanced Number Formatting Function
    function formatNumber(num) {
        num = Math.floor(num);
        if (num < 1000) return num.toString();
        
        const suffixes = ["", "K", "M", "B", "T"];
        const i = Math.floor(Math.log10(num) / 3);
        let value = (num / Math.pow(1000, i));

        if (value >= 100) {
            value = Math.floor(value);
        } else if (value >= 10) {
            value = value.toFixed(1);
        } else {
            value = value.toFixed(2);
        }
        
        return value + suffixes[i];
    }

    function updateAllDisplays() {
        updateBalanceDisplay();
        profitRateDisplay.textContent = formatNumber(state.profitPerHour);
    }

    function updateBalanceDisplay() {
        userBalanceDisplay.textContent = formatNumber(state.balance);
        userBalanceDisplay.classList.add('updated');
        setTimeout(() => userBalanceDisplay.classList.remove('updated'), 300);
    }

    function renderMineUpgrades() {
        upgradeListContainer.innerHTML = '';
        for (const id in UPGRADES) {
            const upgrade = UPGRADES[id];
            const level = state.upgrades[id].level;
            const cost = calculateUpgradeCost(id);
            const profitContribution = upgrade.baseProfit * Math.pow(1.5, level - 1) * level;
            
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="item-icon">${upgrade.icon}</div>
                <div class="item-info">
                    <h4>${upgrade.name}</h4>
                    <p>Level ${level} • +${formatNumber(profitContribution)} p/h</p>
                </div>
                <button class="upgrade-button" data-id="${id}" ${state.balance < cost ? 'disabled' : ''}>
                    ${formatNumber(cost)} 💎
                </button>
            `;
            upgradeListContainer.appendChild(item);
        }
    }


    function updateVault() {
        const { accumulated, progress, timeRemaining } = calculateAccumulatedEarnings();
        accumulatedEarningsDisplay.textContent = formatNumber(accumulated);
        vaultProgressFill.style.width = `${progress * 100}%`;

        if (progress >= 1) {
            vaultTimerDisplay.textContent = 'Vault is full';
        } else {
            const hours = Math.floor(timeRemaining / 3600);
            const minutes = Math.floor((timeRemaining % 3600) / 60);
            vaultTimerDisplay.textContent = `Full in ${hours}h ${minutes}m`;
        }
        claimButton.disabled = accumulated < 1;
    }

    // --- GAME LOGIC ---
    function calculateProfitPerHour() {
        let totalProfit = 0;
        for (const id in state.upgrades) {
            const level = state.upgrades[id].level;
            if (level > 0) {
                 // A slightly adjusted formula for more noticeable progression
                totalProfit += UPGRADES[id].baseProfit * level * (1 + (level - 1) * 0.1);
            }
        }
        state.profitPerHour = totalProfit;
    }
    
    function calculateUpgradeCost(id) {
        return Math.floor(UPGRADES[id].baseCost * Math.pow(1.8, state.upgrades[id].level));
    }

    function calculateAccumulatedEarnings() {
        const elapsedTimeInSeconds = (Date.now() - state.lastClaimTimestamp) / 1000;
        const maxAccumulationSeconds = VAULT_CAPACITY_HOURS * 3600;
        const effectiveSeconds = Math.min(elapsedTimeInSeconds, maxAccumulationSeconds);
        
        const accumulated = (state.profitPerHour / 3600) * effectiveSeconds;
        const progress = effectiveSeconds / maxAccumulationSeconds;
        const timeRemaining = maxAccumulationSeconds - effectiveSeconds;

        return { accumulated, progress, timeRemaining };
    }

    function handleClaim() {
        const { accumulated } = calculateAccumulatedEarnings();
        if (accumulated >= 1) {
            state.balance += accumulated;
            state.lastClaimTimestamp = Date.now();
            updateAllDisplays();
            updateVault();
            renderMineUpgrades(); // To update disabled state of buttons
        }
    }
    
    function handleUpgrade(id) {
        const cost = calculateUpgradeCost(id);
        if (state.balance >= cost) {
            state.balance -= cost;
            state.upgrades[id].level++;
            calculateProfitPerHour();
            updateAllDisplays();
            renderMineUpgrades(); // Re-render to update costs and levels
        }
    }
    
    function copyReferralLink() {
        const user = tg.WebApp.initDataUnsafe.user;
        const botUsername = 'YourBotUsername';
        const link = `https://t.me/${botUsername}?start=${user ? user.id : 'friend'}`;
        navigator.clipboard.writeText(link).then(() => {
            copyReferralBtn.textContent = 'Copied!';
            setTimeout(() => { copyReferralBtn.textContent = 'Invite a Friend'; }, 2000);
        });
    }

    // --- START THE APP ---
    initializeApp();
});