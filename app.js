document.addEventListener('DOMContentLoaded', () => {
    // बेसिक सेटअप और कॉन्स्टैंट्स
    const tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();

    // Firebase इनिशियलाइज़ेशन की जांच
    if (typeof firebase === 'undefined' || typeof firebase.database === 'undefined') {
        console.error("Firebase is not initialized. Please check firebaseConfig.js");
        document.body.innerHTML = "Firebase configuration error. Check console.";
        return;
    }
    const db = firebase.database();

    // --- DOM एलिमेंट्स ---
    const balanceEl = document.getElementById('user-balance');
    const profitRateEl = document.getElementById('profit-rate');
    const accumulatedEarningsEl = document.getElementById('accumulated-earnings');
    const vaultProgressFillEl = document.getElementById('vault-progress-fill');
    const vaultTimerEl = document.getElementById('vault-timer');
    const claimButton = document.getElementById('claim-button');

    // --- ऐप स्टेट और कॉन्फ़िग ---
    let userId; // userId को यहाँ घोषित किया गया है
    let userData = null;
    const VAULT_CAPACITY_HOURS = 2; // वॉल्ट 2 घंटे में भर जाता है
    const VAULT_CAPACITY_SECONDS = VAULT_CAPACITY_HOURS * 3600;
    
    // --- मुख्य इनिशियलाइज़ेशन ---
    async function initApp() {
        // --- टेलीग्राम वेरिफिकेशन ---
        // यह सुनिश्चित करता है कि ऐप केवल टेलीग्राम के अंदर चल रहा है
        if (!tg.initDataUnsafe || !tg.initDataUnsafe.user || !tg.initDataUnsafe.user.id) {
            document.getElementById('splash-title').textContent = "Please open in Telegram";
            document.querySelector('.splash-logo').style.animation = 'none'; // एनिमेशन रोकें
            console.error("Authentication failed: Not running inside a valid Telegram Web App session.");
            return; // आगे की प्रक्रिया रोकें
        }
        
        // वेरिफिकेशन सफल होने पर ही userId सेट करें
        userId = tg.initDataUnsafe.user.id;

        const splashScreen = document.getElementById('splash-screen');
        const appContainer = document.getElementById('app-container');
        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            setTimeout(() => {
                splashScreen.style.display = 'none';
                appContainer.classList.remove('hidden');
            }, 500);
        }, 1500);

        const user = tg.initDataUnsafe.user;
        document.getElementById('user-photo').src = user.photo_url || 'https://i.ibb.co/2kr3tws/default-avatar.png';
        document.getElementById('user-name').textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        document.getElementById('user-username').textContent = `@${user.username || 'telegram_user'}`;

        // रेफरल की जांच
        const startParam = tg.initDataUnsafe?.start_param;
        const referrerId = startParam ? startParam.replace('ref_', '') : null;

        await loadOrCreateUser(referrerId);
        setupNavigation();
        setupEventListeners();
        
        setInterval(updateVault, 1000);
    }

    // --- यूजर डेटा मैनेजमेंट ---
    async function loadOrCreateUser(referrerId) {
        const userRef = db.ref('users/' + userId);
        const snapshot = await userRef.once('value');
        
        if (snapshot.exists()) {
            userData = snapshot.val();
        } else {
            // नया यूजर, डेटा बनाएं
            console.log("Creating new user...");
            const initialBalance = referrerId ? 1000 : 0; 
            
            userData = {
                balance: initialBalance,
                profitRate: 100,
                lastClaimTimestamp: Date.now() - (VAULT_CAPACITY_SECONDS * 1000),
                upgrades: { 'level1': true },
                referrer: referrerId || null,
                referrals: [],
                createdAt: Date.now()
            };

            await userRef.set(userData);

            if (referrerId && referrerId != userId) {
                console.log(`User was referred by ${referrerId}`);
                const referrerRef = db.ref('users/' + referrerId);
                
                await referrerRef.transaction(referrerData => {
                    if (referrerData) {
                        referrerData.balance = (referrerData.balance || 0) + 1000;
                        if (!referrerData.referrals) {
                            referrerData.referrals = [];
                        }
                        referrerData.referrals.push(userId);
                    }
                    return referrerData;
                });
                 console.log(`Gave 1000 bonus to referrer ${referrerId}`);
            }
        }
        
        userRef.on('value', (snap) => {
            userData = snap.val();
            updateUI();
        });
    }

    // --- UI अपडेट फंक्शन्स ---
    function updateUI() {
        if (!userData) return;
        balanceEl.textContent = Math.floor(userData.balance).toLocaleString();
        profitRateEl.textContent = userData.profitRate.toLocaleString();
        updateVault();
    }
    
    function updateVault() {
        if (!userData) return;
        
        const now = Date.now();
        const elapsedTimeSeconds = (now - userData.lastClaimTimestamp) / 1000;
        
        const earningsPerHour = userData.profitRate;
        const earningsPerSecond = earningsPerHour / 3600;
        
        let accumulated = elapsedTimeSeconds * earningsPerSecond;
        const maxAccumulated = VAULT_CAPACITY_SECONDS * earningsPerSecond;

        let isFull = false;
        if (accumulated >= maxAccumulated) {
            accumulated = maxAccumulated;
            isFull = true;
        }
        
        const progressPercent = Math.min(100, (accumulated / maxAccumulated) * 100);
        
        accumulatedEarningsEl.textContent = Math.floor(accumulated).toLocaleString();
        vaultProgressFillEl.style.width = `${progressPercent}%`;
        
        if (isFull) {
            vaultTimerEl.textContent = "Vault is full";
            claimButton.disabled = false;
        } else {
            const remainingSeconds = VAULT_CAPACITY_SECONDS - elapsedTimeSeconds;
            const h = Math.floor(remainingSeconds / 3600);
            const m = Math.floor((remainingSeconds % 3600) / 60);
            const s = Math.floor(remainingSeconds % 60);
            vaultTimerEl.textContent = `Full in ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            claimButton.disabled = true;
        }
    }

    // --- इवेंट लिस्टनर्स ---
    function setupEventListeners() {
        claimButton.addEventListener('click', handleClaim);
        
        document.getElementById('copy-referral-btn').addEventListener('click', () => {
            const botUsername = "YOUR_BOT_USERNAME_HERE"; // ज़रूरी: यहाँ अपने बॉट का यूज़रनेम डालें
            const referralLink = `https://t.me/${botUsername}?start=ref_${userId}`;
            tg.HapticFeedback.impactOccurred('light');
            navigator.clipboard.writeText(referralLink).then(() => {
                alert('Referral link copied!');
            }, () => {
                alert('Failed to copy link.');
            });
        });
    }
    
    async function handleClaim() {
        if (claimButton.disabled) return;
        
        const now = Date.now();
        const elapsedTimeSeconds = (now - userData.lastClaimTimestamp) / 1000;
        const maxAccumulated = (userData.profitRate / 3600) * VAULT_CAPACITY_SECONDS;
        const accumulated = Math.min(maxAccumulated, (elapsedTimeSeconds * (userData.profitRate / 3600)));
        
        if (accumulated < 1) return;

        claimButton.disabled = true;

        const newBalance = userData.balance + accumulated;
        
        const userRef = db.ref('users/' + userId);
        await userRef.update({
            balance: newBalance,
            lastClaimTimestamp: now
        });
        
        tg.HapticFeedback.notificationOccurred('success');
        console.log(`Claimed ${accumulated}. New balance: ${newBalance}`);
    }

    // --- नेविगेशन ---
    function setupNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        const sections = document.querySelectorAll('.content-section');

        navButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.dataset.target;
                navButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                sections.forEach(section => {
                    section.classList.toggle('active', section.id === targetId);
                });
            });
        });
    }

    // ऐप चलाएं
    initApp();
});