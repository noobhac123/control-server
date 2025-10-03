document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    
    const tg = window.Telegram || { WebApp: { initDataUnsafe: { user: { id: '123_LOCAL_TEST', first_name: 'Test', last_name: 'User', username: 'testuser', photo_url: 'https://i.ibb.co/2kr3tws/default-avatar.png'}}, ready: () => {}, expand: () => {}}};
    tg.WebApp.ready(); tg.WebApp.expand();
    const userId = tg.WebApp.initDataUnsafe.user ? tg.WebApp.initDataUnsafe.user.id : null;

    const VAULT_CAPACITY_HOURS = 4;
    const WITHDRAWAL_FEE_PERCENT = 5;
    const DAILY_REWARDS = [500, 1000, 2500, 5000, 10000, 25000, 50000];
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
        if (!userId) { document.body.innerHTML = "<h1>Error: Could not identify user.</h1>"; return; }
        await loadUserData();
        dom.splashScreen.classList.add('fade-out');
        dom.splashScreen.addEventListener('transitionend', () => dom.splashScreen.classList.add('hidden'), { once: true });
        dom.appContainer.classList.remove('hidden');
        setupUI();
        setupInteractions();
        calculateProfitPerHour();
        renderAll();
        setInterval(updateVault, 1000);
    }

    async function loadUserData() {
        const snapshot = await database.ref('users/' + userId).get();
        if (snapshot.exists()) {
            state = snapshot.val();
            // Initialize new fields for returning users if they don't exist
            if (!state.upgrades) state.upgrades = {'gpu-miner': {level: 1}, 'asic-rig': {level: 0}, 'data-center': {level: 0}, 'quantum-comp': {level: 0}};
            if (!state.dailyRewardStreak) state.dailyRewardStreak = 0;
            if (!state.lastDailyRewardClaim) state.lastDailyRewardClaim = 0;
            if (!state.transactions) state.transactions = {};
        } else {
            // Create a default state for new users
            state = {
                balance: 1000, profitPerHour: 0, lastClaimTimestamp: Date.now(),
                dailyRewardStreak: 0, lastDailyRewardClaim: 0, transactions: {},
                upgrades: {'gpu-miner': {level: 1}, 'asic-rig': {level: 0}, 'data-center': {level: 0}, 'quantum-comp': {level: 0}}
            };
            await saveUserData();
        }
    }

    async function saveUserData() { await database.ref('users/' + userId).set(state); }
    
    function setupUI() {
        const user = tg.WebApp.initDataUnsafe.user;
        if (user) {
            const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
            dom.userName.textContent = fullName || user.username || 'User';
            dom.userUsername.textContent = user.username ? `@${user.username}` : '';
            if (user.photo_url) dom.userPhoto.src = user.photo_url;
        }
    }
    
    function setupInteractions() {
        dom.claimButton.addEventListener('click', handleClaim);
        dom.copyReferralBtn.addEventListener('click', copyReferralLink);
        dom.upgradeList.addEventListener('click', e => {
            const button = e.target.closest('.upgrade-button');
            if(button) handleUpgrade(button.dataset.id);
        });
        dom.dailyRewardContainer.addEventListener('click', e => {
            const dayElement = e.target.closest('.claimable');
            if(dayElement) handleDailyRewardClaim(dayElement.dataset.day);
        });
        dom.withdrawButton.addEventListener('click', handleWithdrawal);
        dom.withdrawAmount.addEventListener('input', updateWithdrawalSummary);
        dom.navButtons.forEach(button => button.addEventListener('click', () => handleNavigation(button.dataset.target)));
    }
    
    function renderAll() {
        updateBalanceDisplay();
        dom.profitRate.textContent = formatNumber(state.profitPerHour);
        renderMineUpgrades();
        renderDailyRewards();
    }
    
    function handleNavigation(targetId) {
        dom.navButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.nav-btn[data-target="${targetId}"]`).classList.add('active');
        dom.contentSections.forEach(section => section.classList.toggle('active', section.id === targetId));
        if (targetId === 'friends-section') renderLeaderboard();
        if (targetId === 'wallet-section') renderTransactionHistory();
    }
    
    function formatNumber(num) {
        num = Math.floor(num); if (num < 1000) return num.toString();
        const suffixes = ["", "K", "M", "B", "T"];
        const i = Math.floor(Math.log10(num) / 3);
        let value = (num / Math.pow(1000, i));
        if (value >= 100) { value = Math.floor(value); } else if (value >= 10) { value = value.toFixed(1); } else { value = value.toFixed(2); }
        return value + suffixes[i];
    }
    
    function updateBalanceDisplay() {
        dom.userBalance.textContent = formatNumber(state.balance);
        dom.userBalance.classList.add('updated');
        setTimeout(() => dom.userBalance.classList.remove('updated'), 300);
    }
    
    function calculateProfitPerHour() {
        state.profitPerHour = Object.keys(state.upgrades).reduce((total, id) => {
            const level = state.upgrades[id]?.level || 0;
            return level > 0 ? total + UPGRADES[id].baseProfit * level * (1 + (level - 1) * 0.1) : total;
        }, 0);
    }
    
    function calculateAccumulatedEarnings() {
        const elapsedTimeInSeconds = (Date.now() - state.lastClaimTimestamp) / 1000;
        const maxAccumulationSeconds = VAULT_CAPACITY_HOURS * 3600;
        const effectiveSeconds = Math.min(elapsedTimeInSeconds, maxAccumulationSeconds);
        const accumulated = (state.profitPerHour / 3600) * effectiveSeconds;
        return { accumulated, progress: effectiveSeconds / maxAccumulationSeconds, timeRemaining: maxAccumulationSeconds - effectiveSeconds };
    }
    
    function updateVault() {
        const { accumulated, progress, timeRemaining } = calculateAccumulatedEarnings();
        dom.accumulatedEarnings.textContent = formatNumber(accumulated);
        dom.vaultProgressFill.style.width = `${progress * 100}%`;
        dom.vaultTimer.textContent = progress >= 1 ? 'Vault is full' : `Full in ${Math.floor(timeRemaining / 3600)}h ${Math.floor((timeRemaining % 3600) / 60)}m`;
        dom.claimButton.disabled = accumulated < 1;
    }

    async function handleClaim() {
        const { accumulated } = calculateAccumulatedEarnings();
        if (accumulated >= 1) {
            state.balance += accumulated;
            state.lastClaimTimestamp = Date.now();
            await saveUserData();
            renderAll(); updateVault();
        }
    }
    
    function calculateUpgradeCost(id) { return Math.floor(UPGRADES[id].baseCost * Math.pow(1.8, state.upgrades[id]?.level || 0)); }
    
    async function handleUpgrade(id) {
        const cost = calculateUpgra