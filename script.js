// --- Phase 2 & 4: Global Variables & Database ---
const STORAGE_KEY = 'ipt_demo_v1';
let currentUser = null;
window.db = { accounts: [], departments: [], employees: [], requests: [] };

// --- Phase 4: Data Persistence ---
function loadFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        window.db = JSON.parse(saved);
    } else {
        // Seed initial admin data
        window.db.accounts.push({
            firstName: 'Admin', lastName: 'User',
            email: 'admin@example.com', password: 'Password123!',
            role: 'admin', verified: true
        });
        window.db.departments = ['Engineering', 'HR'];
        saveToStorage();
    }
}

function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
}

// --- Phase 2: Routing ---
function navigateTo(hash) {
    window.location.hash = hash;
}

function handleRouting() {
    const hash = window.location.hash || '#/';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const routeMap = {
        '#/': 'home', '#/register': 'register', '#/login': 'login',
        '#/verify-email': 'verify-email', '#/profile': 'profile',
        '#/accounts': 'accounts', '#/requests': 'requests'
    };

    const targetId = routeMap[hash] || 'home';
    
    // Auth Guards
    if (['#/profile', '#/requests'].includes(hash) && !currentUser) return navigateTo('#/login');
    if (['#/accounts'].includes(hash) && (!currentUser || currentUser.role !== 'admin')) return navigateTo('#/');

    document.getElementById(targetId).classList.add('active');
    
    // Trigger Renders
    if (hash === '#/profile') renderProfile();
    if (hash === '#/accounts') renderAccounts();
}

// --- Phase 3: Auth System ---
function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('regEmail').value;
    if (window.db.accounts.find(a => a.email === email)) return alert("Email exists!");

    const user = {
        firstName: document.getElementById('regFirst').value,
        lastName: document.getElementById('regLast').value,
        email: email,
        password: document.getElementById('regPass').value,
        role: 'user', verified: false
    };

    window.db.accounts.push(user);
    localStorage.setItem('unverified_email', email);
    saveToStorage();
    navigateTo('#/verify-email');
}

function simulateVerification() {
    const email = localStorage.getItem('unverified_email');
    const user = window.db.accounts.find(a => a.email === email);
    if (user) {
        user.verified = true;
        saveToStorage();
        alert("Verified! Please login.");
        navigateTo('#/login');
    }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPass').value;
    const user = window.db.accounts.find(a => a.email === email && a.password === pass && a.verified);

    if (user) {
        setAuthState(true, user);
        navigateTo('#/profile');
    } else {
        alert("Invalid credentials or unverified account!");
    }
}

function setAuthState(isAuth, user = null) {
    currentUser = user;
    const body = document.body;
    if (isAuth) {
        body.classList.replace('not-authenticated', 'authenticated');
        if (user.role === 'admin') body.classList.add('is-admin');
        document.getElementById('userDropdown').innerText = user.firstName;
    } else {
        body.className = 'not-authenticated';
        document.getElementById('userDropdown').innerText = 'Account';
    }
}

function logout() {
    setAuthState(false);
    navigateTo('#/');
}

// --- Phase 5 & 6: Rendering ---
function renderProfile() {
    const container = document.getElementById('profile-content');
    container.innerHTML = `
        <h3>My Profile</h3>
        <p><strong>Name:</strong> ${currentUser.firstName} ${currentUser.lastName}</p>
        <p><strong>Email:</strong> ${currentUser.email}</p>
        <p><strong>Role:</strong> <span class="badge bg-primary">${currentUser.role}</span></p>
        <button class="btn btn-outline-secondary btn-sm" onclick="alert('Edit soon!')">Edit Profile</button>
    `;
}

function renderAccounts() {
    const list = document.getElementById('accounts-list');
    list.innerHTML = window.db.accounts.map(a => `
        <tr>
            <td>${a.firstName} ${a.lastName}</td>
            <td>${a.email}</td>
            <td>${a.role}</td>
            <td>${a.verified ? '✅' : '❌'}</td>
        </tr>
    `).join('');
}

// --- Init ---
window.addEventListener('hashchange', handleRouting);
window.addEventListener('load', () => {
    loadFromStorage();
    handleRouting();
});