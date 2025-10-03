document.addEventListener('DOMContentLoaded', () => {
    // --- START: CONFIGURATION (Aapki details yahan add kar di hain) ---
    const firebaseConfig = {
      apiKey: "AIzaSyAe2oLRw7t6X1bOgXmnxvM5hQpp-hx04e4",
      authDomain: "cashifybot99.firebaseapp.com",
      databaseURL: "https://cashifybot99-default-rtdb.firebaseio.com",
      projectId: "cashifybot99",
      storageBucket: "cashifybot99.firebasestorage.app",
      messagingSenderId: "822810842309",
      appId: "1:822810842309:web:365e64d3a1e357f2610cac"
    };
    
    // Aapka bot username
    const BOT_USERNAME = 'PhantomXP_Bot'; 

    // --- END: CONFIGURATION ---

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // Telegram Web App object
    const tg = window.Telegram.WebApp;

    // DOM Elements
    const splashScreen = document.getElementById('splash-screen');
    const appContainer = document.getElementById('app-container');
    const userNameEl = document.getElementById('user-name');
    const userIdEl = document.getElementById('user-id');
    const userBalanceEl = document.getElementById('user-balance');
    const referralLinkEl = document.getElementById('referral-link');
    const copyReferralBtn = document.getElementById('copy-referral-btn');
    const referralCountEl = document.getElementById('referral-count');
    const dailyCheckinBtn = document.getElementById('daily-checkin-btn');

    let currentUser = null;
    let userData = null;

    // --- 1. INITIALIZATION ---
    function init() {
        tg.ready();
        tg.expand(); 

        setTimeout(() => {
            splashScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
        }, 2000);

        authenticateUser();
    }

    // --- 2. AUTHENTICATION (Bina Card wala Method) ---
    async function authenticateUser() {
        // Telegram se user ka initial data lena
        if (!tg.initDataUnsafe || !tg.initDataUnsafe.user) {
            console.error("Could not get user data from Telegram.");
            userNameEl.textContent = "Auth Failed";
            return;
        }

        const telegramUser = tg.initDataUnsafe.user;
        // Hum Telegram User ID ko hi database ki key banayenge
        const uid = telegramUser.id.toString();

        try {
            // Hum "Anonymous Login" ka istemal kar rahe hain
            // Yeh secure nahi hai, par bina card ke yahi best option hai
            await auth.signInAnonymously();
            currentUser = { uid: uid }; // Hum Telegram ID ko hi Firebase UID maan rahe hain
            
            // User ka data load karna
            await loadUserData(telegramUser);
        } catch (error) {
            console.error("Firebase Anonymous Auth Error:", error);
            userNameEl.textContent = "Login Error";
            tg.showPopup({ title: 'Error', message: 'Could not log you in. Please restart the bot.', buttons: [{type: 'ok'}] });
        }
    }

    // --- 3. USER DATA HANDLING ---
    async function loadUserData(telegramUser) {
        const userRef = db.collection('users').doc(currentUser.uid);
        const doc = await userRef.get();
        const startParam = tg.initDataUnsafe?.start_param;

        if (!doc.exists) {
            // Naye user ke liye data create karna
            const newUserData = {
                telegramId: telegramUser.id,
                firstName: telegramUser.first_name,
                lastName: telegramUser.last_name || '',
                username: telegramUser.username || '',
                balance: 0,
                referrals: 0,
                referredBy: startParam || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastCheckin: null
            };
            await userRef.set(newUserData);
            userData = newUserData;

            // Agar referrer hai to usko bonus dena
            if (startParam) {
                const referrerRef = db.collection('users').doc(startParam);
                await referrerRef.update({
                    balance: firebase.firestore.FieldValue.increment(100), // Referral bonus
                    referrals: firebase.firestore.FieldValue.increment(1)
                });
            }
        } else {
            userData = doc.data();
        }

        updateUI();
    }

    // --- 4. UPDATE UI ---
    function updateUI() {
        if (!userData) return;
        userNameEl.textContent = userData.firstName;
        userIdEl.textContent = `TG ID: ${userData.telegramId}`;
        userBalanceEl.textContent = userData.balance.toLocaleString();
        referralCountEl.textContent = userData.referrals;
        referralLinkEl.value = `https://t.me/${BOT_USERNAME}?start=${currentUser.uid}`;
        
        if (userData.lastCheckin) {
            const lastCheckinDate = userData.lastCheckin.toDate().toDateString();
            const todayDate = new Date().toDateString();
            if (lastCheckinDate === todayDate) {
                dailyCheckinBtn.textContent = 'Claimed Today';
                dailyCheckinBtn.disabled = true;
            }
        }
    }

    // --- 5. EARNING FEATURES ---
    dailyCheckinBtn.addEventListener('click', async () => {
        dailyCheckinBtn.disabled = true;
        dailyCheckinBtn.textContent = 'Claiming...';

        const userRef = db.collection('users').doc(currentUser.uid);
        const checkinBonus = 50;

        try {
            await userRef.update({
                balance: firebase.firestore.FieldValue.increment(checkinBonus),
                lastCheckin: firebase.firestore.FieldValue.serverTimestamp()
            });
            userData.balance += checkinBonus;
            userData.lastCheckin = { toDate: () => new Date() }; 
            updateUI();
            tg.showPopup({ message: `You've claimed ${checkinBonus} gems!`, buttons: [{type: 'ok'}] });
        } catch (error) {
            console.error("Error during check-in:", error);
            dailyCheckinBtn.disabled = false;
            dailyCheckinBtn.textContent = 'Claim Now';
        }
    });
    
    // --- 6. NAVIGATION ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const contentSections = document.querySelectorAll('.content-section');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            navButtons.forEach(btn => btn.classList.remove('active'));
            contentSections.forEach(section => section.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(targetId).classList.add('active');
        });
    });
    
    // --- 7. UTILITY ---
    copyReferralBtn.addEventListener('click', () => {
        referralLinkEl.select();
        document.execCommand('copy');
        tg.HapticFeedback.notificationOccurred('success');
        copyReferralBtn.textContent = 'Copied!';
        setTimeout(() => { copyReferralBtn.textContent = 'Copy'; }, 1500);
    });

    // --- Start the App ---
    init();
});