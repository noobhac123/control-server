document.addEventListener('DOMContentLoaded', () => {
    const tg = window.Telegram.WebApp;
    tg.expand();

    const splashScreen = document.getElementById('splash-screen');
    const appContainer = document.getElementById('app-container');
    
    // Splash screen को 1.5 सेकंड बाद छिपाएं
    setTimeout(() => {
        splashScreen.classList.add('fade-out');
        splashScreen.addEventListener('transitionend', () => {
            splashScreen.style.display = 'none';
            appContainer.classList.remove('hidden');
        }, { once: true });
    }, 1500);

    // जांचें कि क्या Firebase सही से लोड हुआ है
    if (!firebase || !firebase.database) {
        console.error("Firebase is not initialized.");
        document.body.innerHTML = "Error: Firebase could not be loaded. Please try again later.";
        return;
    }
    
    // टेस्टिंग के लिए नकली टेलीग्राम यूजर ऑब्जेक्ट। असल में यह टेलीग्राम से आता है।
    if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
        console.warn("Telegram user data not found. Using mock data for testing.");
        tg.initDataUnsafe = {
            user: {
                id: Math.floor(Math.random() * 1000000), // टेस्टिंग के लिए रैंडम आईडी
                first_name: "Test",
                last_name: "User",
                username: "testuser",
                photo_url: "https://i.ibb.co/2kr3tws/default-avatar.png"
            },
            start_param: 'ref_987654321' // नए यूजर के लिए नकली रेफरल
        };
    }

    const db = firebase.database();
    const userId = tg.initDataUnsafe.user.id;
    const userRef = db.ref('users/' + userId);
    let userData = {};

    // UI एलिमेंट्स
    const balanceElement = document.getElementById('user-balance');
    const profitRateElement = document.getElementById('profit-rate');
    const accumulatedEarningsElement = document.getElementById('accumulated-earnings');
    const vaultProgressFill = document.getElementById('vault-progress-fill');
    const vaultTimerElement = document.getElementById('vault-timer');
    const claimButton = document.getElementById('claim-button');
    const userNameElement = document.getElementById('user-name');
    const userUsernameElement = document.getElementById('user-username');
    const userPhotoElement = document.getElementById('user-photo');

    // ऐप शुरू करें
    function initializeApp() {
        const user = tg.initDataUnsafe.user;
        userNameElement.textContent = `${user.first_name} ${user.last_name || ''}`.trim();
        userUsernameElement.textContent = `@${user.username || 'no-username'}`;
        if (user.photo_url) userPhotoElement.src = user.photo_url;

        userRef.once('value', (snapshot) => {
            if (snapshot.exists()) {
                // मौजूदा यूजर
                userData = snapshot.val();
                if (!userData.upgrades) userData.upgrades = { storage: 0, speed: 0 };
                if (!userData.dailyRewards) userData.dailyRewards = { lastClaimedDay: -1, streak: 0, lastClaimTimestamp: 0 };
                console.log("Existing user found:", userData);
                startApp();
            } else {
                // नया यूजर
                console.log("New user detected. Creating profile...");
                handleNewUser();
            }
        });
    }
    
    // नए यूजर और रेफरल लॉजिक को हैंडल करें
    async function handleNewUser() {
        const user = tg.initDataUnsafe.user;
        const startParam = tg.initDataUnsafe.start_param;
        let initialBalance = 0;
        let referrerId = null;

        if (startParam && startParam.startsWith('ref_')) {
            const potentialReferrerId = startParam.split('_')[1];
            // जांचें कि रेफरर आईडी वैध है और यूजर खुद को रेफर नहीं कर रहा है
            if (!isNaN(potentialReferrerId) && potentialReferrerId != userId) {
                console.log(`User was referred by: ${potentialReferrerId}`);
                initialBalance = 1000; // नए यूजर को 1000 बोनस मिलेगा
                referrerId = potentialReferrerId;
                await giveBonusToReferrer(referrerId);
            } else {
                console.log("Invalid or self-referral ID detected.");
            }
        }

        const defaultProfitRate = 10;
        const defaultStorageHours = 2;
        const newUserProfile = {
            id: userId,
            firstName: user.first_name,
            lastName: user.last_name || '',
            username: user.username || '',
            balance: initialBalance,
            profitRate: defaultProfitRate,
            storageCapacity: defaultStorageHours * defaultProfitRate,
            lastClaim: Date.now(),
            upgrades: { storage: 0, speed: 0 },
            dailyRewards: { lastClaimedDay: -1, streak: 0, lastClaimTimestamp: 0 },
            referrer: referrerId,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await userRef.set(newUserProfile);
        console.log("New user profile created.");
        userData = newUserProfile;
        startApp();
    }

    // रेफर करने वाले को बोनस दें
    async function giveBonusToReferrer(referrerId) {
        const referrerRef = db.ref('users/' + referrerId);
        try {
            const snapshot = await referrerRef.once('value');
            if (snapshot.exists()) {
                // बैलेंस को सुरक्षित रूप से अपडेट करें
                const newBalance = (snapshot.val().balance || 0) + 1000;
                await referrerRef.child('balance').set(newBalance);
                console.log(`Successfully gave 1000 gems bonus to referrer ${referrerId}`);
                
                // रेफरर के लिए ट्रांजेक्शन लॉग करें (वैकल्पिक)
                const transactionsRef = db.ref('transactions/' + referrerId);
                await transactionsRef.push({
                    type: 'referral_bonus',
                    amount: 1000,
                    from: { id: userId, name: tg.initDataUnsafe.user.first_name },
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
            } else {
                console.log(`Referrer with ID ${referrerId} not found.`);
            }
        } catch (error) {
            console.error("Error giving bonus to referrer:", error);
        }
    }

    // यूजर डेटा लोड होने के बाद ऐप शुरू करें
    function startApp() {
        updateUI();
        setInterval(updateVault, 1000); // हर सेकंड वॉल्ट अपडेट करें
        setupEventListeners();
        loadUpgrades();
        loadDailyRewards();
        loadLeaderboard();
        loadTransactions();
    }
    
    function formatNumber(num) {
        if (typeof num !== 'number') return '0';
        return Math.floor(num).toLocaleString('en-US');
    }

    function updateUI() {
        balanceElement.textContent = formatNumber(userData.balance);
        profitRateElement.textContent = formatNumber(userData.profitRate);
    }
    
    function updateVault() {
        const now = Date.now();
        const timeDiffSeconds = (now - userData.lastClaim) / 1000;
        const profitPerSecond = userData.profitRate / 3600;
        
        let accumulated = Math.max(0, timeDiffSeconds * profitPerSecond);
        accumulated = Math.min(accumulated, userData.storageCapacity);

        accumulatedEarningsElement.textContent = formatNumber(accumulated);
        const progress = userData.storageCapacity > 0 ? (accumulated / userData.storageCapacity) * 100 : 0;
        vaultProgressFill.style.width = `${progress}%`;
        
        if (progress >= 100) {
            vaultTimerElement.textContent = "Vault is full";
        } else {
            const remainingCapacity = userData.storageCapacity - accumulated;
            const secondsToFull = remainingCapacity / profitPerSecond;
            const hours = Math.floor(secondsToFull / 3600);
            const minutes = Math.floor((secondsToFull % 3600) / 60);
            vaultTimerElement.textContent = `Full in ${hours}h ${minutes}m`;
        }
        claimButton.disabled = accumulated < 1;
    }

    function setupEventListeners() {
        // नेविगेशन बटन
        const navButtons = document.querySelectorAll('.nav-btn');
        const contentSections = document.querySelectorAll('.content-section');
        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                const targetId = button.dataset.target;
                contentSections.forEach(section => {
                    section.classList.toggle('active', section.id === targetId);
                });
            });
        });

        // क्लेम बटन
        claimButton.addEventListener('click', () => {
            const now = Date.now();
            const timeDiffSeconds = (now - userData.lastClaim) / 1000;
            const profitPerSecond = userData.profitRate / 3600;
            let accumulated = Math.min(timeDiffSeconds * profitPerSecond, userData.storageCapacity);
            
            const amountToClaim = Math.floor(accumulated);
            if (amountToClaim < 1) return;

            userData.balance += amountToClaim;
            // बचे हुए समय को आगे बढ़ाएं ताकि कुछ भी बर्बाद न हो
            userData.lastClaim = now - ((accumulated - amountToClaim) * 1000 / profitPerSecond); 
            
            userRef.update({ balance: userData.balance, lastClaim: userData.lastClaim });
            updateUI();
        });

        // दोस्त को आमंत्रित करें बटन
        const inviteButton = document.getElementById('copy-referral-btn');
        inviteButton.addEventListener('click', () => {
            const botUsername = "PhantomXP_Bot"; // <<-- यहाँ आपका यूजरनेम अपडेट कर दिया गया है
            if (botUsername === "YOUR_BOT_USERNAME_HERE") {
                alert("Please configure the bot username in app.js");
                return;
            }
            const referralLink = `https://t.me/${botUsername}?start=ref_${userId}`;
            const text = `💰 Join CryptoCash and get a 1,000 gem bonus! Let's earn together. 💎`;
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`;
            tg.openTelegramLink(shareUrl);
        });
    }
    
    // अपग्रेड्स की सूची
    const upgrades = [
        { id: 'storage', name: 'Vault Storage', icon: '📦', description: 'Hours of passive accumulation', baseCost: 100, levels: [4, 6, 8, 12, 24] },
        { id: 'speed', name: 'Mining Speed', icon: '⚡', description: 'Increase gems per hour', baseCost: 150, levels: [20, 50, 100, 250, 500] }
    ];

    function loadUpgrades() {
        const upgradeList = document.getElementById('upgrade-list');
        upgradeList.innerHTML = '';
        upgrades.forEach(upgrade => {
            const currentLevel = userData.upgrades[upgrade.id] || 0;
            if (currentLevel >= upgrade.levels.length) return; // अधिकतम लेवल

            const cost = Math.floor(upgrade.baseCost * Math.pow(2.2, currentLevel));
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="item-icon">${upgrade.icon}</div>
                <div class="item-info"><h4>${upgrade.name} - Lvl ${currentLevel + 1}</h4><p>+${upgrade.levels[currentLevel]} ${upgrade.id === 'storage' ? 'hours' : '💎/hr'}</p></div>
                <button class="upgrade-button" data-upgrade-id="${upgrade.id}" data-cost="${cost}">${formatNumber(cost)} 💎</button>
            `;
            upgradeList.appendChild(item);
        });
        document.querySelectorAll('.upgrade-button').forEach(button => button.addEventListener('click', handleUpgrade));
    }
    
    function handleUpgrade(event) {
        const button = event.currentTarget;
        const upgradeId = button.dataset.upgradeId;
        const cost = parseInt(button.dataset.cost);
        
        if (userData.balance >= cost) {
            const upgradeInfo = upgrades.find(u => u.id === upgradeId);
            const currentLevel = userData.upgrades[upgradeId] || 0;
            
            userData.balance -= cost;
            userData.upgrades[upgradeId] = currentLevel + 1;

            if (upgradeId === 'speed') {
                userData.profitRate += upgradeInfo.levels[currentLevel];
            }
            
            // किसी भी अपग्रेड के बाद स्टोरेज क्षमता की फिर से गणना करें
            const storageUpgradeInfo = upgrades.find(u => u.id === 'storage');
            const storageLevel = userData.upgrades['storage'] || 0;
            const storageHours = storageLevel > 0 ? storageUpgradeInfo.levels[storageLevel - 1] : 2; // लेवल 0 पर डिफ़ॉल्ट 2 घंटे
            userData.storageCapacity = storageHours * userData.profitRate;

            userRef.update({
                balance: userData.balance,
                upgrades: userData.upgrades,
                profitRate: userData.profitRate,
                storageCapacity: userData.storageCapacity
            }).then(() => {
                console.log(`Upgraded ${upgradeId} to level ${currentLevel + 1}`);
                updateUI();
                loadUpgrades();
            }).catch(err => console.error("Upgrade failed:", err));

        } else {
            alert("Not enough gems!");
        }
    }

    // खाली फ़ंक्शन (भविष्य में लागू करने के लिए)
    function loadDailyRewards() {
         const container = document.getElementById('daily-reward-container');
         container.innerHTML = '<p class="text-muted">Daily rewards coming soon!</p>';
    }

    function loadLeaderboard() {
        const container = document.getElementById('leaderboard-container');
        container.innerHTML = '<p class="text-muted">Leaderboard is being calculated...</p>';
    }

    function loadTransactions() {
        const container = document.getElementById('transaction-history-container');
        const transactionsRef = db.ref('transactions/' + userId).limitToLast(10);
        transactionsRef.on('value', snapshot => {
            if (snapshot.exists()) {
                container.innerHTML = '';
                const txs = [];
                snapshot.forEach(child => { txs.push(child.val()) });
                txs.reverse().forEach(tx => {
                     const item = document.createElement('div');
                     item.className = 'list-item';
                     item.innerHTML = `
                        <div class="item-icon">💰</div>
                        <div class="item-info">
                           <h4>${tx.type.replace('_',' ')}</h4>
                           <p>From: ${tx.from.name || 'System'}</p>
                        </div>
                        <span class="leaderboard-balance">+${formatNumber(tx.amount)} 💎</span>
                     `;
                     container.appendChild(item);
                });
            } else {
                 container.innerHTML = '<p class="text-muted">No transactions yet.</p>';
            }
        });
    }

    // ऐप को इनिशियलाइज़ करें
    initializeApp();
});