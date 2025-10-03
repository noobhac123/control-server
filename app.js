document.addEventListener('DOMContentLoaded', () => {
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
    const VAULT_CAPACITY_HOURS = 4;
    const WITHDRAWAL_FEE_PERCENT = 5;
    const DAILY_REWARDS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
    const NEW_USER_BONUS = 1000;
    const REFERRER_BONUS = 1000;
    const UPGRADES = {
        'gpu-miner': { name: 'GPU Miner', icon: '💻', baseCost: 50, baseProfit: 5 },
        'asic-rig': { name: 'ASIC Rig', icon: '⚙️', baseCost: 500, baseProfit: 25 },
        'data-center': { name: 'Data Center', icon: '🏢', baseCost: 5000, baseProfit: 150 },
        'quantum-comp': { name: 'Quantum Comp', icon: '⚛️', baseCost: 50000, baseProfit: 1000 }
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
        accumulatedEarnings: document.getElementById('accumulated-earnings'),
        vaultProgressFill: document.getElementById('vault-progress-fill'),
        vaultTimer: document.getElementById('vault-timer'),
        claimButton: document.getElementById('claim-button'),
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
        transactionHistoryContainer: document.getElementById('transaction-history-container')
    };

    let state = {};

    async function initializeApp() {
        if (!userId) {
            handleError("Could not identify user. Please launch this app via Telegram.");
            return;
        }

        try {
            await loadUserData();

            dom.splashScreen.classList.add('fade-out');
            dom.splashScreen.addEventListener('transitionend', () => dom.splashScreen.classList.add('hidden'), { once: true });
            dom.appContainer.classList.remove('hidden');

            setupUI();
            setupInteractions();
            calculateProfitPerHour();
            renderAll();
            setInterval(updateVault, 1000);
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
            if (!state.upgrades) state.upgrades = {'gpu-miner': {level: 1}, 'asic-rig': {level: 0}, 'data-center': {level: 0}, 'quantum-comp': {level: 0}};
            if (typeof state.dailyRewardStreak === 'undefined') state.dailyRewardStreak = 0;
            if (typeof state.lastDailyRewardClaim === 'undefined') state.lastDailyRewardClaim = 0;
            if (!state.transactions) state.transactions = {};
        } else {
            await createNewUser();
        }
    }

    async function createNewUser() {
        const user = tg.initDataUnsafe.user;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        const vaultCapacityMillis = VAULT_CAPACITY_HOURS * 3600 * 1000;
        state = {
            balance: 0,
            profitPerHour: 0, lastClaimTimestamp: Date.now() - vaultCapacityMillis, // Vault is full on first open
            dailyRewardStreak: 0, lastDailyRewardClaim: 0, transactions: {},
            upgrades: {'gpu-miner': {level: 1}, 'asic-rig': {level: 0}, 'data-center': {level: 0}, 'quantum-comp': {level: 0}},
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
        const user = tg.initDataUnsafe.user;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        state.fullName = fullName || user.username || 'A User';
        await database.ref('users/' + userId).set(state);
    }
    
    function setupUI() { /* ... unchanged ... */ }
    function setupInteractions() { /* ... unchanged ... */ }
    function renderAll() { /* ... unchanged ... */ }
    function handleNavigation(targetId) { /* ... unchanged ... */ }
    function formatNumber(num) { /* ... unchanged ... */ }
    function updateBalanceDisplay() { /* ... unchanged ... */ }
    function calculateProfitPerHour() { /* ... unchanged ... */ }
    function calculateAccumulatedEarnings() { /* ... unchanged ... */ }
    function updateVault() { /* ... unchanged ... */ }
    async function handleClaim() { /* ... unchanged ... */ }
    function calculateUpgradeCost(id) { /* ... unchanged ... */ }
    async function handleUpgrade(id) { /* ... unchanged ... */ }
    function renderDailyRewards() { /* ... unchanged ... */ }
    async function handleDailyRewardClaim(day) { /* ... unchanged ... */ }
    async function renderLeaderboard() { /* ... unchanged ... */ }
    function updateWithdrawalSummary() { /* ... unchanged ... */ }
    async function handleWithdrawal() { /* ... unchanged ... */ }
    async function renderTransactionHistory() { /* ... unchanged ... */ }
    function copyReferralLink() { /* ... unchanged ... */ }
    function renderMineUpgrades() { /* ... unchanged ... */ }

    // --- Implementation of unchanged functions for completeness ---
    setupUI = function() { const user = tg.initDataUnsafe.user; if (user) { const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim(); dom.userName.textContent = fullName || user.username || 'User'; dom.userUsername.textContent = user.username ? `@${user.username}` : ''; if (user.photo_url) dom.userPhoto.src = user.photo_url; } };
    setupInteractions = function() { dom.claimButton.addEventListener('click', handleClaim); dom.copyReferralBtn.addEventListener('click', copyReferralLink); dom.upgradeList.addEventListener('click', e => { const button = e.target.closest('.upgrade-button'); if(button) handleUpgrade(button.dataset.id); }); dom.dailyRewardContainer.addEventListener('click', e => { const dayElement = e.target.closest('.claimable'); if(dayElement) handleDailyRewardClaim(dayElement.dataset.day); }); dom.withdrawButton.addEventListener('click', handleWithdrawal); dom.withdrawAmount.addEventListener('input', updateWithdrawalSummary); dom.navButtons.forEach(button => button.addEventListener('click', () => handleNavigation(button.dataset.target))); };
    renderAll = function() { updateBalanceDisplay(); dom.profitRate.textContent = formatNumber(state.profitPerHour); renderMineUpgrades(); renderDailyRewards(); };
    handleNavigation = function(targetId) { dom.navButtons.forEach(btn => btn.classList.remove('active')); document.querySelector(`.nav-btn[data-target="${targetId}"]`).classList.add('active'); dom.contentSections.forEach(section => section.classList.toggle('active', section.id === targetId)); if (targetId === 'friends-section') renderLeaderboard(); if (targetId === 'wallet-section') renderTransactionHistory(); };
    formatNumber = function(num) { num = Math.floor(num); if (num < 1000) return num.toString(); const suffixes = ["", "K", "M", "B", "T"]; const i = Math.floor(Math.log10(num) / 3); let value = (num / Math.pow(1000, i)); if (value >= 100) { value = Math.floor(value); } else if (value >= 10) { value = value.toFixed(1); } else { value = value.toFixed(2); } return value + suffixes[i]; };
    updateBalanceDisplay = function() { dom.userBalance.textContent = formatNumber(state.balance); dom.userBalance.classList.add('updated'); setTimeout(() => dom.userBalance.classList.remove('updated'), 300); };
    calculateProfitPerHour = function() { state.profitPerHour = Object.keys(state.upgrades).reduce((total, id) => { const level = state.upgrades[id]?.level || 0; return level > 0 ? total + UPGRADES[id].baseProfit * level * (1 + (level - 1) * 0.1) : total; }, 0); };
    calculateAccumulatedEarnings = function() { const elapsedTimeInSeconds = (Date.now() - (state.lastClaimTimestamp || Date.now())) / 1000; const maxAccumulationSeconds = VAULT_CAPACITY_HOURS * 3600; const effectiveSeconds = Math.min(elapsedTimeInSeconds, maxAccumulationSeconds); const accumulated = (state.profitPerHour / 3600) * effectiveSeconds; return { accumulated, progress: effectiveSeconds / maxAccumulationSeconds, timeRemaining: maxAccumulationSeconds - effectiveSeconds }; };
    updateVault = function() { const { accumulated, progress, timeRemaining } = calculateAccumulatedEarnings(); dom.accumulatedEarnings.textContent = formatNumber(accumulated); dom.vaultProgressFill.style.width = `${progress * 100}%`; dom.vaultTimer.textContent = progress >= 1 ? 'Vault is full' : `Full in ${Math.floor(timeRemaining / 3600)}h ${Math.floor((timeRemaining % 3600) / 60)}m`; dom.claimButton.disabled = accumulated < 1; };
    handleClaim = async function() { const { accumulated } = calculateAccumulatedEarnings(); if (accumulated >= 1) { state.balance += accumulated; state.lastClaimTimestamp = Date.now(); await saveUserData(); renderAll(); updateVault(); } };
    calculateUpgradeCost = function(id) { return Math.floor(UPGRADES[id].baseCost * Math.pow(1.8, state.upgrades[id]?.level || 0)); };
    handleUpgrade = async function(id) { const cost = calculateUpgradeCost(id); if (state.balance >= cost) { state.balance -= cost; state.upgrades[id].level++; calculateProfitPerHour(); await saveUserData(); renderAll(); } };
    renderDailyRewards = function() { dom.dailyRewardContainer.innerHTML = ''; const now = Date.now(); const hoursSinceLastClaim = (now - (state.lastDailyRewardClaim || 0)) / (1000 * 3600); if (hoursSinceLastClaim > 48) state.dailyRewardStreak = 0; for (let i = 0; i < 7; i++) { const dayDiv = document.createElement('div'); dayDiv.className = 'daily-reward-day'; dayDiv.dataset.day = i + 1; let status = 'locked'; if (i < state.dailyRewardStreak) status = 'claimed'; else if (i === state.dailyRewardStreak && hoursSinceLastClaim >= 24) status = 'claimable'; dayDiv.classList.add(status); dayDiv.innerHTML = `<span class="day-label">Day ${i + 1}</span><span class="day-reward">${formatNumber(DAILY_REWARDS[i])} 💎</span>${status === 'claimed' ? '<span class="day-claimed-check">✓</span>' : ''}`; dom.dailyRewardContainer.appendChild(dayDiv); } };
    handleDailyRewardClaim = async function(day) { day = parseInt(day) - 1; state.balance += DAILY_REWARDS[day]; state.dailyRewardStreak++; state.lastDailyRewardClaim = Date.now(); await saveUserData(); renderAll(); };
    renderLeaderboard = async function() { dom.leaderboardContainer.innerHTML = '<p class="text-muted">Loading leaderboard...</p>'; const snapshot = await database.ref('users').orderByChild('balance').limitToLast(10).get(); let users = []; snapshot.forEach(child => { users.push({ id: child.key.toString(), ...child.val() }); }); users.reverse(); dom.leaderboardContainer.innerHTML = users.map((user, i) => `<div class="list-item leaderboard-item ${user.id == userId ? 'is-user' : ''}"><span class="leaderboard-rank">${i + 1}</span><div class="item-info leaderboard-info"><span class="leaderboard-name">${user.fullName || 'A User'}</span><span class="leaderboard-balance">${formatNumber(user.balance)} 💎</span></div></div>`).join('') || '<p class="text-muted">Be the first on the leaderboard!</p>'; };
    updateWithdrawalSummary = function() { const amount = parseFloat(dom.withdrawAmount.value) || 0; const fee = (amount * WITHDRAWAL_FEE_PERCENT) / 100; dom.withdrawFee.textContent = formatNumber(fee); dom.withdrawFinal.textContent = formatNumber(amount - fee); };
    handleWithdrawal = async function() { const amount = parseFloat(dom.withdrawAmount.value); const address = dom.withdrawAddress.value.trim(); if (!amount || amount <= 0 || !address) { alert('Please fill all fields correctly.'); return; } const totalCost = amount + (amount * WITHDRAWAL_FEE_PERCENT / 100); if (state.balance < totalCost) { alert('Insufficient balance.'); return; } state.balance -= totalCost; const req = { amount, address, network: dom.withdrawNetwork.value, status: 'Pending', timestamp: Date.now() }; if (!state.transactions) state.transactions = {}; const ref = await database.ref('users/' + userId + '/transactions').push(req); await database.ref('all_withdrawals/' + ref.key).set({userId, ...req}); await saveUserData(); dom.withdrawAmount.value = ''; dom.withdrawAddress.value = ''; updateWithdrawalSummary(); renderAll(); renderTransactionHistory(); alert('Withdrawal request submitted!'); };
    renderTransactionHistory = async function() { if (!state.transactions) { dom.transactionHistoryContainer.innerHTML = '<p class="text-muted">No transactions yet.</p>'; return; } let historyHtml = Object.values(state.transactions).sort((a,b) => b.timestamp - a.timestamp).map(tx => `<div class="list-item"><div class="item-info"><h4>${formatNumber(tx.amount)} 💎 on ${tx.network}</h4><p>${new Date(tx.timestamp).toLocaleDateString()}</p></div><span class="transaction-status ${tx.status.toLowerCase()}">${tx.status}</span></div>`).join(''); dom.transactionHistoryContainer.innerHTML = historyHtml || '<p class="text-muted">No transactions yet.</p>'; };
    copyReferralLink = function() { const botUsername = 'PhantomXP_Bot'; const link = `https://t.me/${botUsername}?start=${userId}`; navigator.clipboard.writeText(link).then(() => { dom.copyReferralBtn.textContent = 'Copied!'; setTimeout(() => { dom.copyReferralBtn.textContent = 'Invite a Friend'; }, 2000); }); };
    renderMineUpgrades = function() { dom.upgradeList.innerHTML = ''; for (const id in UPGRADES) { const upgrade = UPGRADES[id]; const level = state.upgrades[id]?.level || 0; const cost = calculateUpgradeCost(id); const profitContribution = UPGRADES[id].baseProfit * level * (1 + (level - 1) * 0.1); const item = document.createElement('div'); item.className = 'list-item'; item.innerHTML = `<div class="item-icon">${upgrade.icon}</div><div class="item-info"><h4>${upgrade.name}</h4><p>Level ${level} • +${formatNumber(profitContribution)} p/h</p></div><button class="upgrade-button" data-id="${id}" ${state.balance < cost ? 'disabled' : ''}>${formatNumber(cost)} 💎</button>`; dom.upgradeList.appendChild(item); } };

    initializeApp();
}