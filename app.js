let startTime; // Splash screen ke time ke liye

document.addEventListener('DOMContentLoaded', () => {
    startTime = Date.now(); // App load hone ka time record karein
    // This new, robust initialization handles all scenarios.
    // It will NEVER get stuck on the splash screen again.

    let tg = window.Telegram ? window.Telegram.WebApp : null;

    if (tg) {
        // App is running in Telegram
        tg.ready();
        tg.expand();
        main(tg); // Start the app with the real Telegram object
    } else {
        // App is NOT running in Telegram (local browser for testing)
        console.warn("Telegram Web App SDK not found. Running in MOCK mode for testing.");
        
        const mockWebApp = {
            initDataUnsafe: {
                user: {
                    id: '123_LOCAL_TEST',
                    first_name: 'Local',
                    last_name: 'User',
                    username: 'localuser',
                    photo_url: 'https://i.ibb.co/wJZR9gM/gem-coin.png'
                },
                start_param: 'referrer_456'
            },
            ready: () => console.log("Mock App Ready"),
            expand: () => console.log("Mock App Expanded")
        };
        main(mockWebApp); // Start the app with the mock object
    }
});

// The main function now accepts the 'tg' object (real or mock)
function main(tg) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.error("Firebase initialization failed:", e);
        handleError("Could not connect to services.");
        return;
    }
    const database = firebase.database();

    const userId = tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id.toString() : null;
    const referrerId = tg.start_param || null;

    // --- GAME CONFIGURATION ---
    const WITHDRAWAL_FEE_PERCENT = 5;
    const DAILY_REWARDS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
    const NEW_USER_BONUS = 1000;
    const REFERRER_BONUS = 1000;
    const BASE_ENERGY = 500;
    const ENERGY_REGEN_PER_SECOND = 2;

    const UPGRADES = {
        // Mine upgrades
        'gpu-miner':      { name: 'GPU Miner',      icon: '💻', type: 'mine', baseCost: 50,       baseProfit: 25 },
        'asic-rig':       { name: 'ASIC Rig',       icon: '⚙️', type: 'mine', baseCost: 800,      baseProfit: 100 },
        'data-center':    { name: 'Data Center',    icon: '🏢', type: 'mine', baseCost: 6000,     baseProfit: 500 },
        'quantum-comp':   { name: 'Quantum Comp',   icon: '⚛️', type: 'mine', baseCost: 50000,    baseProfit: 2500 },
        'fusion-reactor': { name: 'Fusion Reactor', icon: '☀️', type: 'mine', baseCost: 500000,   baseProfit: 15000 },
        'dyson-sphere':   { name: 'Dyson Sphere',   icon: '🌌', type: 'mine', baseCost: 10000000, baseProfit: 125000 },
        // Tapper upgrades
        'tap-power':      { name: 'Tap Power',      icon: '👆', type: 'tap',  baseCost: 200,      baseValue: 1 },
        'energy-limit':   { name: 'Energy Limit',   icon: '🔋', type: 'tap',  baseCost: 350,      baseValue: 500 }
    };

    const BOOSTS = {
        'turbo-profit': {
            name: 'Turbo Profit (x2)', icon: '🚀',
            description: 'Doubles your profit per hour for 3 hours.',
            durationHours: 3, cost: 4000
        }
    };

    const dom = {
        splashScreen: document.getElementById('splash-screen'),
        appContainer: document.getElementById('app-container'),
        userPhoto: document.getElementById('user-photo'),
        userName: document.getElementById('user-name'),
        userUsername: document.getElementById('user-username'),
        userBalance: document.getElementById('user-balance'),
        profitRate: document.getElementById('profit-rate'),
        navButtons: document.querySelectorAll('.nav-btn'),
        contentSections: document.querySelectorAll('.content-section'),
        upgradeList: document.getElementById('upgrade-list'),
        copyReferralBtn: document.getElementById('copy-referral-btn'),
        dailyRewardContainer: document.getElementById('daily-reward-container'),
        leaderboardContainer: document.getElementById('leaderboard-container'),
        withdrawAmount: document.getElementById('withdraw-amount'),
        withdrawAddress: document.getElementById('withdraw-address'),
        withdrawNetwork: document.getElementById('withdraw-network'),
        withdrawFee: document.getElementById('withdraw-fee'),
        withdrawFinal: document.getElementById('withdraw-final'),
        withdrawButton: document.getElementById('withdraw-button'),
        transactionHistoryContainer: document.getElementById('transaction-history-container'),
        tapperCoin: document.getElementById('tapper-coin'),
        tapperContainer: document.getElementById('tapper-container'),
        energyLevel: document.getElementById('energy-level'),
        energyBarFill: document.getElementById('energy-bar-fill'),
        boostList: document.getElementById('boost-list')
    };

    let state = {};
    let isLeaderboardInitialized = false; // Real-time leaderboard ke liye flag

    async function initializeApp() {
        if (!userId) {
            handleError("Could not identify user. Please launch this app via Telegram.");
            return;
        }

        try {
            await loadUserData();

            const elapsedTime = Date.now() - startTime;
            const minSplashTime = 3000; // 3 second
            const delay = Math.max(0, minSplashTime - elapsedTime);

            setTimeout(() => {
                dom.splashScreen.classList.add('fade-out');
                dom.splashScreen.addEventListener('transitionend', () => dom.splashScreen.classList.add('hidden'), { once: true });
                dom.appContainer.classList.remove('hidden');
            }, delay);

            setupUI();
            setupInteractions();
            calculateProfitPerHour();
            renderAll();
            setInterval(() => {
                updatePassiveIncome();
                updateEnergy();
            }, 1000);

            // Auto-save user data periodically to prevent data loss
            setInterval(async () => {
                if (userId && typeof state.balance !== 'undefined') {
                    await saveUserData();
                    console.log("Auto-saving user data...");
                }
            }, 10000); // Save every 10 seconds

        } catch (error) {
            console.error("Initialization failed:", error);
            handleError("Failed to load your data. Please check internet and try again.");
        }
    }

    function handleError(message) {
        dom.splashScreen.innerHTML = `<h1 style="color: #ff4d4d; text-align: center; padding: 20px; font-size: 1.2em;">${message}</h1>`;
        dom.splashScreen.style.opacity = '1';
    }

    async function loadUserData() {
        const userRef = database.ref('users/' + userId);
        const snapshot = await userRef.get();
        if (snapshot.exists()) {
            state = snapshot.val();
            if (!state.upgrades) state.upgrades = {};
            // Add new upgrades to existing users if they don't have them
            ['gpu-miner', 'asic-rig', 'data-center', 'quantum-comp', 'fusion-reactor', 'dyson-sphere'].forEach(id => {
                 if (!state.upgrades[id]) state.upgrades[id] = { level: (id === 'gpu-miner' ? 1 : 0) };
            });
            if (!state.upgrades['tap-power']) state.upgrades['tap-power'] = { level: 1 };
            if (!state.upgrades['energy-limit']) state.upgrades['energy-limit'] = { level: 0 };
            
            if (typeof state.dailyRewardStreak === 'undefined') state.dailyRewardStreak = 0;
            if (typeof state.lastDailyRewardClaim === 'undefined') state.lastDailyRewardClaim = 0;
            if (!state.transactions) state.transactions = {};
            if (typeof state.energy === 'undefined') state.energy = BASE_ENERGY + (state.upgrades['energy-limit'].level * UPGRADES['energy-limit'].baseValue);
            if (typeof state.maxEnergy === 'undefined') state.maxEnergy = BASE_ENERGY + (state.upgrades['energy-limit'].level * UPGRADES['energy-limit'].baseValue);
            if (typeof state.tapValue === 'undefined') state.tapValue = state.upgrades['tap-power'].level * UPGRADES['tap-power'].baseValue;
            if (typeof state.lastEnergyTimestamp === 'undefined') state.lastEnergyTimestamp = Date.now();
            if (typeof state.lastPassiveIncomeTimestamp === 'undefined') state.lastPassiveIncomeTimestamp = Date.now();
            if (typeof state.activeBoosts === 'undefined') state.activeBoosts = {};

        } else {
            await createNewUser();
        }
    }

    async function createNewUser() {
        const user = tg.initDataUnsafe.user;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        state = {
            balance: 0,
            profitPerHour: 0, lastPassiveIncomeTimestamp: Date.now(),
            dailyRewardStreak: 0, lastDailyRewardClaim: 0, transactions: {},
            upgrades: {
                'gpu-miner': {level: 1}, 'asic-rig': {level: 0}, 'data-center': {level: 0}, 'quantum-comp': {level: 0},
                'fusion-reactor': {level: 0}, 'dyson-sphere': {level: 0},
                'tap-power': {level: 1}, 'energy-limit': {level: 0},
            },
            energy: BASE_ENERGY, maxEnergy: BASE_ENERGY, tapValue: 1,
            lastEnergyTimestamp: Date.now(), activeBoosts: {},
            referredBy: referrerId || null, referralBonusClaimed: false,
            fullName: fullName || user.username || 'A User'
        };
        if (referrerId && referrerId !== userId && !state.referralBonusClaimed) {
            state.balance = NEW_USER_BONUS;
            const referrerRef = database.ref('users/' + referrerId);
            try {
                await referrerRef.transaction(currentData => {
                    if (currentData) {
                        currentData.balance = (currentData.balance || 0) + REFERRER_BONUS;
                    }
                    return currentData;
                });
                state.referralBonusClaimed = true;
                console.log(`Awarded ${REFERRER_BONUS} to referrer ${referrerId}`);
            } catch (error) { console.error("Failed to award referrer bonus:", error); }
        }
        await saveUserData();
    }

    async function saveUserData() {
        if (!userId) return; // Prevent saving if userId is not available
        const user = tg.initDataUnsafe.user;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        state.fullName = fullName || user.username || 'A User';
        await database.ref('users/' + userId).set(state);
    }
    
    function setupUI() { const user = tg.initDataUnsafe.user; if (user) { const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim(); dom.userName.textContent = fullName || user.username || 'User'; dom.userUsername.textContent = user.username ? `@${user.username}` : ''; if (user.photo_url) dom.userPhoto.src = user.photo_url; } }
    function setupInteractions() { dom.copyReferralBtn.addEventListener('click', copyReferralLink); dom.upgradeList.addEventListener('click', e => { const button = e.target.closest('.upgrade-button'); if(button) handleUpgrade(button.dataset.id); }); dom.dailyRewardContainer.addEventListener('click', e => { const dayElement = e.target.closest('.claimable'); if(dayElement) handleDailyRewardClaim(dayElement.dataset.day); }); dom.withdrawButton.addEventListener('click', handleWithdrawal); dom.withdrawAmount.addEventListener('input', updateWithdrawalSummary); dom.navButtons.forEach(button => button.addEventListener('click', () => handleNavigation(button.dataset.target))); dom.tapperCoin.addEventListener('click', handleTap); dom.boostList.addEventListener('click', e => { const button = e.target.closest('.boost-button'); if (button && !button.disabled && !button.classList.contains('active')) handleBuyBoost(button.dataset.id); }); }
    function renderAll() { updateBalanceDisplay(); dom.profitRate.textContent = formatNumber(state.profitPerHour); renderMineUpgrades(); renderDailyRewards(); renderEnergy(); }
    function handleNavigation(targetId) { dom.navButtons.forEach(btn => btn.classList.remove('active')); document.querySelector(`.nav-btn[data-target="${targetId}"]`).classList.add('active'); dom.contentSections.forEach(section => section.classList.toggle('active', section.id === targetId)); if (targetId === 'friends-section') renderLeaderboard(); if (targetId === 'wallet-section') renderTransactionHistory(); if (targetId === 'boosts-section') renderBoosts(); }
    function formatNumber(num) { num = Math.floor(num); if (num < 1000) return num.toString(); const suffixes = ["", "K", "M", "B", "T"]; const i = Math.floor(Math.log10(num) / 3); let value = (num / Math.pow(1000, i)); if (value >= 100) { value = Math.floor(value); } else if (value >= 10) { value = value.toFixed(1); } else { value = value.toFixed(2); } return value + suffixes[i]; }
    function updateBalanceDisplay() { dom.userBalance.textContent = formatNumber(state.balance); dom.userBalance.classList.add('updated'); setTimeout(() => dom.userBalance.classList.remove('updated'), 300); }
    function getBoostMultiplier() { const turboBoost = state.activeBoosts?.['turbo-profit']; if (turboBoost && Date.now() < turboBoost.expiresAt) return 2; return 1; }
    function calculateProfitPerHour() { const multiplier = getBoostMultiplier(); state.profitPerHour = Object.keys(state.upgrades).reduce((total, id) => { const upgradeConf = UPGRADES[id]; if (upgradeConf.type !== 'mine') return total; const level = state.upgrades[id]?.level || 0; return level > 0 ? total + upgradeConf.baseProfit * level * (1 + (level - 1) * 0.1) : total; }, 0) * multiplier; }
    function updatePassiveIncome() { const now = Date.now(); const elapsedSeconds = (now - state.lastPassiveIncomeTimestamp) / 1000; if (elapsedSeconds >= 1) { const income = (state.profitPerHour / 3600) * elapsedSeconds; state.balance += income; state.lastPassiveIncomeTimestamp = now; updateBalanceDisplay(); } }
    function calculateUpgradeCost(id) { const level = state.upgrades[id]?.level || 0; if (id === 'tap-power') return Math.floor(UPGRADES[id].baseCost * Math.pow(1.5, level)); if (id === 'energy-limit') return Math.floor(UPGRADES[id].baseCost * Math.pow(1.6, level)); return Math.floor(UPGRADES[id].baseCost * Math.pow(1.8, state.upgrades[id]?.level || 0)); }
    async function handleUpgrade(id) { const cost = calculateUpgradeCost(id); if (state.balance >= cost) { state.balance -= cost; state.upgrades[id].level++; if (UPGRADES[id].type === 'mine') { calculateProfitPerHour(); } else if (UPGRADES[id].type === 'tap') { if (id === 'tap-power') { state.tapValue = UPGRADES[id].baseValue * state.upgrades[id].level; } else if (id === 'energy-limit') { state.maxEnergy = BASE_ENERGY + (UPGRADES[id].baseValue * state.upgrades[id].level); } } await saveUserData(); renderAll(); } }
    function renderDailyRewards() { dom.dailyRewardContainer.innerHTML = ''; const now = Date.now(); const hoursSinceLastClaim = (now - (state.lastDailyRewardClaim || 0)) / (1000 * 3600); if (hoursSinceLastClaim > 48) state.dailyRewardStreak = 0; for (let i = 0; i < 7; i++) { const dayDiv = document.createElement('div'); dayDiv.className = 'daily-reward-day'; dayDiv.dataset.day = i + 1; let status = 'locked'; if (i < state.dailyRewardStreak) status = 'claimed'; else if (i === state.dailyRewardStreak && hoursSinceLastClaim >= 24) status = 'claimable'; dayDiv.classList.add(status); dayDiv.innerHTML = `<span class="day-label">Day ${i + 1}</span><span class="day-reward">${formatNumber(DAILY_REWARDS[i])} 💎</span>${status === 'claimed' ? '<span class="day-claimed-check">✓</span>' : ''}`; dom.dailyRewardContainer.appendChild(dayDiv); } }
    async function handleDailyRewardClaim(day) { day = parseInt(day) - 1; state.balance += DAILY_REWARDS[day]; state.dailyRewardStreak++; state.lastDailyRewardClaim = Date.now(); await saveUserData(); renderAll(); }
    
    function renderLeaderboard() {
        if (isLeaderboardInitialized) {
            return; // Listener pehle se active hai
        }
        isLeaderboardInitialized = true;
        dom.leaderboardContainer.innerHTML = '<p class="text-muted">Loading leaderboard...</p>';
    
        database.ref('users').orderByChild('balance').limitToLast(10).on('value', (snapshot) => {
            let users = [];
            snapshot.forEach(child => {
                users.push({ id: child.key.toString(), ...child.val() });
            });
            users.reverse(); // Sabse zyada balance wale ko upar rakhein
            dom.leaderboardContainer.innerHTML = users.map((user, i) => `<div class="list-item leaderboard-item ${user.id == userId ? 'is-user' : ''}"><span class="leaderboard-rank">${i + 1}</span><div class="item-info leaderboard-info"><span class="leaderboard-name">${user.fullName || 'A User'}</span><span class="leaderboard-balance">${formatNumber(user.balance)} 💎</span></div></div>`).join('') || '<p class="text-muted">Be the first on the leaderboard!</p>';
        });
    }

    function updateWithdrawalSummary() { const amount = parseFloat(dom.withdrawAmount.value) || 0; const fee = (amount * WITHDRAWAL_FEE_PERCENT) / 100; dom.withdrawFee.textContent = formatNumber(fee); dom.withdrawFinal.textContent = formatNumber(amount - fee); }
    async function handleWithdrawal() { const amount = parseFloat(dom.withdrawAmount.value); const address = dom.withdrawAddress.value.trim(); if (!amount || amount <= 0 || !address) { alert('Please fill all fields correctly.'); return; } const totalCost = amount + (amount * WITHDRAWAL_FEE_PERCENT / 100); if (state.balance < totalCost) { alert('Insufficient balance.'); return; } state.balance -= totalCost; const req = { amount, address, network: dom.withdrawNetwork.value, status: 'Pending', timestamp: Date.now() }; if (!state.transactions) state.transactions = {}; const ref = await database.ref('users/' + userId + '/transactions').push(req); await database.ref('all_withdrawals/' + ref.key).set({userId, ...req}); await saveUserData(); dom.withdrawAmount.value = ''; dom.withdrawAddress.value = ''; updateWithdrawalSummary(); renderAll(); renderTransactionHistory(); alert('Withdrawal request submitted!'); }
    async function renderTransactionHistory() { if (!state.transactions || Object.keys(state.transactions).length === 0) { dom.transactionHistoryContainer.innerHTML = '<p class="text-muted">No transactions yet.</p>'; return; } let historyHtml = Object.values(state.transactions).sort((a,b) => b.timestamp - a.timestamp).map(tx => `<div class="list-item"><div class="item-info"><h4>${formatNumber(tx.amount)} 💎 on ${tx.network}</h4><p>${new Date(tx.timestamp).toLocaleDateString()}</p></div><span class="transaction-status ${tx.status.toLowerCase()}">${tx.status}</span></div>`).join(''); dom.transactionHistoryContainer.innerHTML = historyHtml || '<p class="text-muted">No transactions yet.</p>'; }
    function copyReferralLink() { const botUsername = 'PhantomXP_Bot'; const link = `https://t.me/${botUsername}?start=${userId}`; navigator.clipboard.writeText(link).then(() => { dom.copyReferralBtn.textContent = 'Copied!'; setTimeout(() => { dom.copyReferralBtn.textContent = 'Invite a Friend'; }, 2000); }); }
    function renderMineUpgrades() { dom.upgradeList.innerHTML = ''; const mineUpgrades = document.createDocumentFragment(); const tapUpgrades = document.createDocumentFragment(); for (const id in UPGRADES) { const upgrade = UPGRADES[id]; const level = state.upgrades[id]?.level || 0; const cost = calculateUpgradeCost(id); const item = document.createElement('div'); item.className = 'list-item'; let infoText = ''; if (upgrade.type === 'mine') { const profitContribution = UPGRADES[id].baseProfit * level * (1 + (level - 1) * 0.1); infoText = `Level ${level} • +${formatNumber(profitContribution)} p/h`; } else if (upgrade.type === 'tap') { if (id === 'tap-power') { infoText = `Level ${level} • ${UPGRADES[id].baseValue * level} per tap`; } else if (id === 'energy-limit') { infoText = `Level ${level} • ${BASE_ENERGY + (UPGRADES[id].baseValue * level)} max energy`; } } item.innerHTML = `<div class="item-icon">${upgrade.icon}</div><div class="item-info"><h4>${upgrade.name}</h4><p>${infoText}</p></div><button class="upgrade-button" data-id="${id}" ${state.balance < cost ? 'disabled' : ''}>${formatNumber(cost)} 💎</button>`; if (upgrade.type === 'mine') { mineUpgrades.appendChild(item); } else { tapUpgrades.appendChild(item); } } const mineTitle = document.createElement('h3'); mineTitle.className = 'upgrade-section-title'; mineTitle.textContent = 'Mining Upgrades'; dom.upgradeList.appendChild(mineTitle); dom.upgradeList.appendChild(mineUpgrades); const tapTitle = document.createElement('h3'); tapTitle.className = 'upgrade-section-title'; tapTitle.textContent = 'Tapper Upgrades'; dom.upgradeList.appendChild(tapTitle); dom.upgradeList.appendChild(tapUpgrades); }
    function updateEnergy() { const now = Date.now(); const elapsedSeconds = (now - state.lastEnergyTimestamp) / 1000; const energyToAdd = Math.floor(elapsedSeconds * ENERGY_REGEN_PER_SECOND); if (energyToAdd > 0) { state.energy = Math.min(state.maxEnergy, state.energy + energyToAdd); state.lastEnergyTimestamp = now; } renderEnergy(); }
    function renderEnergy() { dom.energyLevel.textContent = `${Math.floor(state.energy)}/${state.maxEnergy}`; const energyPercentage = (state.energy / state.maxEnergy) * 100; dom.energyBarFill.style.width = `${energyPercentage}%`; }
    function handleTap(event) { if (state.energy >= state.tapValue) { state.energy -= state.tapValue; state.balance += state.tapValue; dom.tapperCoin.classList.add('tapped'); setTimeout(() => dom.tapperCoin.classList.remove('tapped'), 100); const tapValueDisplay = document.createElement('div'); tapValueDisplay.className = 'tap-value-display'; tapValueDisplay.textContent = `+${state.tapValue}`; const rect = dom.tapperContainer.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; tapValueDisplay.style.left = `${x}px`; tapValueDisplay.style.top = `${y}px`; dom.tapperContainer.appendChild(tapValueDisplay); setTimeout(() => tapValueDisplay.remove(), 1000); updateBalanceDisplay(); renderEnergy(); } }
    function formatTime(totalSeconds) { if (totalSeconds < 0) totalSeconds = 0; const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor((totalSeconds % 3600) / 60); const seconds = Math.floor(totalSeconds % 60); return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`; }
    function renderBoosts() { dom.boostList.innerHTML = ''; for (const id in BOOSTS) { const boost = BOOSTS[id]; const activeBoost = state.activeBoosts?.[id]; const isExpired = !activeBoost || Date.now() >= activeBoost.expiresAt; const item = document.createElement('div'); item.className = 'list-item'; let buttonHtml; if (boost.durationHours > 0 && activeBoost && !isExpired) { const timeLeft = Math.floor((activeBoost.expiresAt - Date.now()) / 1000); buttonHtml = `<button class="boost-button active" disabled>${formatTime(timeLeft)}</button>`; } else { buttonHtml = `<button class="boost-button" data-id="${id}" ${state.balance < boost.cost ? 'disabled' : ''}>${formatNumber(boost.cost)} 💎</button>`; } item.innerHTML = `<div class="item-icon">${boost.icon}</div><div class="item-info"><h4>${boost.name}</h4><p>${boost.description}</p></div>${buttonHtml}`; dom.boostList.appendChild(item); } }
    async function handleBuyBoost(id) { const boost = BOOSTS[id]; if (!boost || state.balance < boost.cost) return; const activeBoost = state.activeBoosts?.[id]; if (activeBoost && Date.now() < activeBoost.expiresAt) return; state.balance -= boost.cost; if (id === 'turbo-profit') { if (!state.activeBoosts) state.activeBoosts = {}; state.activeBoosts[id] = { expiresAt: Date.now() + boost.durationHours * 3600 * 1000 }; calculateProfitPerHour(); } await saveUserData(); renderAll(); renderBoosts(); }

    initializeApp();
}