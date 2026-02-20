(() => {
    'use strict';

    // --- Constants ---
    const STORAGE_KEY = 'ipt_demo_v1';
    const AUTH_TOKEN_KEY = 'auth_token';
    const UNVERIFIED_EMAIL_KEY = 'unverified_email';

    // --- Global State ---
    let currentUser = null;
    window.db = { accounts: [], departments: [], employees: [], requests: [] };

    // --- Utilities ---
    function generateId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function escapeHtml(str) {
        return String(str)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function showToast(message, type = 'primary') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const id = generateId('toast');
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${escapeHtml(message)}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        const toastEl = wrapper.firstElementChild;
        container.appendChild(toastEl);

        if (window.bootstrap?.Toast) {
            const toast = window.bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 2500 });
            toast.show();
            toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove(), { once: true });
        }
    }

    function findAccountByEmail(email) {
        const key = String(email || '').trim().toLowerCase();
        return window.db.accounts.find(a => String(a.email || '').trim().toLowerCase() === key) || null;
    }

    function getDepartmentById(id) {
        return window.db.departments.find(d => d.id === id) || null;
    }

    function normalizeDb(raw) {
        const db = raw && typeof raw === 'object' ? raw : {};
        db.accounts = Array.isArray(db.accounts) ? db.accounts : [];
        db.departments = Array.isArray(db.departments) ? db.departments : [];
        db.employees = Array.isArray(db.employees) ? db.employees : [];
        db.requests = Array.isArray(db.requests) ? db.requests : [];

        // Accounts: ensure shape
        db.accounts = db.accounts
            .filter(a => a && typeof a === 'object')
            .map(a => ({
                id: a.id || generateId('acc'),
                firstName: String(a.firstName || '').trim(),
                lastName: String(a.lastName || '').trim(),
                email: String(a.email || '').trim(),
                password: String(a.password || ''),
                role: a.role === 'admin' ? 'admin' : 'user',
                verified: Boolean(a.verified),
            }))
            .filter(a => a.email);

        // Departments: migrate from ["Engineering","HR"] to objects
        db.departments = db.departments
            .filter(Boolean)
            .map(d => {
                if (typeof d === 'string') {
                    return { id: generateId('dept'), name: d, description: '' };
                }
                if (typeof d === 'object') {
                    return {
                        id: d.id || generateId('dept'),
                        name: String(d.name || '').trim(),
                        description: String(d.description || '').trim(),
                    };
                }
                return null;
            })
            .filter(d => d && d.name);

        // Employees
        db.employees = db.employees
            .filter(e => e && typeof e === 'object')
            .map(e => ({
                id: e.id || generateId('emp'),
                employeeId: String(e.employeeId || e.empId || '').trim(),
                userEmail: String(e.userEmail || e.email || '').trim(),
                position: String(e.position || '').trim(),
                deptId: String(e.deptId || '').trim(),
                hireDate: String(e.hireDate || '').trim(),
            }))
            .filter(e => e.employeeId);

        // Requests
        db.requests = db.requests
            .filter(r => r && typeof r === 'object')
            .map(r => ({
                id: r.id || generateId('req'),
                employeeEmail: String(r.employeeEmail || '').trim(),
                type: String(r.type || '').trim(),
                items: Array.isArray(r.items) ? r.items : [],
                status: r.status || 'Pending',
                date: r.date || new Date().toISOString(),
            }));

        // Ensure seed admin + departments if missing
        if (!db.accounts.some(a => a.role === 'admin')) {
            db.accounts.unshift({
                id: generateId('acc'),
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@example.com',
                password: 'Password123!',
                role: 'admin',
                verified: true,
            });
        }

        if (db.departments.length === 0) {
            db.departments = [
                { id: generateId('dept'), name: 'Engineering', description: '' },
                { id: generateId('dept'), name: 'HR', description: '' },
            ];
        }

        return db;
    }

    function saveToStorage() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.db));
    }

    function loadFromStorage() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) {
            window.db = normalizeDb(null);
            saveToStorage();
            return;
        }

        try {
            const parsed = JSON.parse(saved);
            window.db = normalizeDb(parsed);
            saveToStorage(); // persist any migrations
        } catch {
            window.db = normalizeDb(null);
            saveToStorage();
        }
    }

    // --- Auth State ---
    function setAuthState(isAuth, user = null) {
        currentUser = isAuth ? user : null;
        const body = document.body;

        if (isAuth && user) {
            body.classList.remove('not-authenticated');
            body.classList.add('authenticated');
            body.classList.toggle('is-admin', user.role === 'admin');
            const label = user.firstName || user.email || 'Account';
            const dd = document.getElementById('userDropdown');
            if (dd) dd.innerText = label;
        } else {
            body.classList.remove('authenticated', 'is-admin');
            body.classList.add('not-authenticated');
            const dd = document.getElementById('userDropdown');
            if (dd) dd.innerText = 'Account';
        }
    }

    function restoreAuthFromToken() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        if (!token) return;

        const user = findAccountByEmail(token);
        if (user && user.verified) {
            setAuthState(true, user);
        } else {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            setAuthState(false, null);
        }
    }

    // --- Routing ---
    function navigateTo(hash) {
        window.location.hash = hash;
    }

    const ROUTES = {
        '#/': { pageId: 'home' },
        '#/register': { pageId: 'register' },
        '#/verify-email': { pageId: 'verify-email', onEnter: renderVerifyEmail },
        '#/login': { pageId: 'login' },
        '#/profile': { pageId: 'profile', requiresAuth: true, onEnter: renderProfile },
        '#/requests': { pageId: 'requests', requiresAuth: true, onEnter: renderRequests },
        '#/accounts': { pageId: 'accounts', requiresAuth: true, requiresAdmin: true, onEnter: renderAccounts },
        '#/departments': { pageId: 'departments', requiresAuth: true, requiresAdmin: true, onEnter: renderDepartments },
        '#/employees': { pageId: 'employees', requiresAuth: true, requiresAdmin: true, onEnter: renderEmployees },
    };

    function handleRouting() {
        const hash = window.location.hash;
        if (!hash || hash === '#') {
            navigateTo('#/');
            return;
        }

        const route = ROUTES[hash];
        if (!route) {
            navigateTo('#/');
            return;
        }

        if (route.requiresAuth && !currentUser) {
            navigateTo('#/login');
            return;
        }

        if (route.requiresAdmin && (!currentUser || currentUser.role !== 'admin')) {
            showToast('Admin access required.', 'danger');
            navigateTo('#/');
            return;
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(route.pageId);
        if (target) target.classList.add('active');
        if (route.onEnter) route.onEnter();
    }

    // --- Phase 3: Auth System ---
    function handleRegister(e) {
        e.preventDefault();

        const firstName = document.getElementById('regFirst').value.trim();
        const lastName = document.getElementById('regLast').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPass').value;

        if (password.length < 6) {
            showToast('Password must be at least 6 characters.', 'danger');
            return;
        }

        if (findAccountByEmail(email)) {
            showToast('Email already exists.', 'danger');
            return;
        }

        window.db.accounts.push({
            id: generateId('acc'),
            firstName,
            lastName,
            email,
            password,
            role: 'user',
            verified: false,
        });

        localStorage.setItem(UNVERIFIED_EMAIL_KEY, email);
        saveToStorage();
        showToast('Registered! Please verify your email (simulated).', 'warning');
        navigateTo('#/verify-email');
    }

    function renderVerifyEmail() {
        const email = localStorage.getItem(UNVERIFIED_EMAIL_KEY) || '';
        const el = document.getElementById('verify-email-address');
        if (el) el.textContent = email || 'your email';
    }

    function simulateVerification() {
        const email = localStorage.getItem(UNVERIFIED_EMAIL_KEY);
        if (!email) {
            showToast('No unverified email found. Please register first.', 'danger');
            return;
        }

        const user = findAccountByEmail(email);
        if (!user) {
            showToast('Account not found for verification.', 'danger');
            return;
        }

        user.verified = true;
        localStorage.removeItem(UNVERIFIED_EMAIL_KEY);
        saveToStorage();
        showToast('Email verified. You can now login.', 'success');
        navigateTo('#/login');
    }

    function handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPass').value;
        const user = window.db.accounts.find(a =>
            String(a.email || '').trim().toLowerCase() === email.toLowerCase() &&
            a.password === pass &&
            a.verified
        );

        if (!user) {
            showToast('Invalid credentials or unverified account.', 'danger');
            return;
        }

        localStorage.setItem(AUTH_TOKEN_KEY, user.email);
        setAuthState(true, user);
        showToast('Welcome back!', 'success');
        navigateTo('#/profile');
    }

    function logout() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setAuthState(false, null);
        showToast('Logged out.', 'secondary');
        navigateTo('#/');
    }

    // --- Rendering: Profile ---
    function renderProfile() {
        const container = document.getElementById('profile-content');
        if (!container) return;
        if (!currentUser) {
            container.innerHTML = `<p class="mb-0">Please login.</p>`;
            return;
        }

        container.innerHTML = `
            <h3>My Profile</h3>
            <p><strong>Name:</strong> ${escapeHtml(currentUser.firstName)} ${escapeHtml(currentUser.lastName)}</p>
            <p><strong>Email:</strong> ${escapeHtml(currentUser.email)}</p>
            <p><strong>Role:</strong> <span class="badge bg-primary">${escapeHtml(currentUser.role)}</span></p>
            <button class="btn btn-outline-secondary btn-sm" onclick="alert('Edit Profile: not implemented yet')">Edit Profile</button>
        `;
    }

    // --- Rendering: Accounts (Admin) ---
    function renderAccounts() {
        const list = document.getElementById('accounts-list');
        if (!list) return;

        if (window.db.accounts.length === 0) {
            list.innerHTML = `<tr><td colspan="5" class="text-muted">No accounts.</td></tr>`;
            return;
        }

        list.innerHTML = window.db.accounts.map(a => `
            <tr>
                <td>${escapeHtml(`${a.firstName} ${a.lastName}`.trim())}</td>
                <td>${escapeHtml(a.email)}</td>
                <td><span class="badge ${a.role === 'admin' ? 'bg-dark' : 'bg-secondary'}">${escapeHtml(a.role)}</span></td>
                <td>${a.verified ? '✅' : '—'}</td>
                <td class="text-end">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-primary" onclick="openEditAccountModal('${a.id}')">Edit</button>
                        <button class="btn btn-outline-warning" onclick="resetPasswordPrompt('${a.id}')">Reset PW</button>
                        <button class="btn btn-outline-danger" onclick="deleteAccount('${a.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    let accountModal = null;
    function openAddAccountModal() {
        const title = document.getElementById('accountModalTitle');
        if (title) title.textContent = 'Add Account';

        document.getElementById('accountEditId').value = '';
        document.getElementById('accFirst').value = '';
        document.getElementById('accLast').value = '';
        document.getElementById('accEmail').value = '';
        document.getElementById('accPass').value = '';
        document.getElementById('accRole').value = 'user';
        document.getElementById('accVerified').checked = false;
        document.getElementById('accPass').required = true;

        accountModal?.show();
    }

    function openEditAccountModal(accountId) {
        const account = window.db.accounts.find(a => a.id === accountId);
        if (!account) {
            showToast('Account not found.', 'danger');
            return;
        }

        const title = document.getElementById('accountModalTitle');
        if (title) title.textContent = 'Edit Account';

        document.getElementById('accountEditId').value = account.id;
        document.getElementById('accFirst').value = account.firstName;
        document.getElementById('accLast').value = account.lastName;
        document.getElementById('accEmail').value = account.email;
        document.getElementById('accPass').value = '';
        document.getElementById('accRole').value = account.role;
        document.getElementById('accVerified').checked = Boolean(account.verified);
        document.getElementById('accPass').required = false;

        accountModal?.show();
    }

    function resetPasswordPrompt(accountId) {
        const account = window.db.accounts.find(a => a.id === accountId);
        if (!account) {
            showToast('Account not found.', 'danger');
            return;
        }

        const next = prompt(`Enter new password for ${account.email} (min 6 chars):`, '');
        if (next === null) return;
        if (String(next).length < 6) {
            showToast('Password must be at least 6 characters.', 'danger');
            return;
        }
        account.password = String(next);
        saveToStorage();
        showToast('Password reset.', 'success');
    }

    function deleteAccount(accountId) {
        const account = window.db.accounts.find(a => a.id === accountId);
        if (!account) {
            showToast('Account not found.', 'danger');
            return;
        }

        if (currentUser && account.email.toLowerCase() === currentUser.email.toLowerCase()) {
            showToast('You cannot delete your own account.', 'danger');
            return;
        }

        const ok = confirm(`Delete account: ${account.email}?`);
        if (!ok) return;

        window.db.accounts = window.db.accounts.filter(a => a.id !== accountId);
        window.db.employees = window.db.employees.filter(e => e.userEmail.toLowerCase() !== account.email.toLowerCase());
        window.db.requests = window.db.requests.filter(r => r.employeeEmail.toLowerCase() !== account.email.toLowerCase());
        saveToStorage();
        renderAccounts();
        showToast('Account deleted.', 'secondary');
    }

    // --- Rendering: Departments (Admin) ---
    function addDepartmentNotImplemented() {
        alert('Not implemented');
    }

    function renderDepartments() {
        const list = document.getElementById('departments-list');
        if (!list) return;

        if (window.db.departments.length === 0) {
            list.innerHTML = `<tr><td colspan="3" class="text-muted">No departments.</td></tr>`;
            return;
        }

        list.innerHTML = window.db.departments.map(d => `
            <tr>
                <td>${escapeHtml(d.name)}</td>
                <td class="text-muted">${escapeHtml(d.description || '')}</td>
                <td class="text-end">
                    <button class="btn btn-outline-secondary btn-sm" disabled>Actions</button>
                </td>
            </tr>
        `).join('');
    }

    // --- Rendering: Employees (Admin) ---
    let employeeModal = null;
    function openAddEmployeeModal() {
        const deptSelect = document.getElementById('empDept');
        deptSelect.innerHTML = window.db.departments
            .map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
            .join('');

        document.getElementById('empEmployeeId').value = '';
        document.getElementById('empUserEmail').value = '';
        document.getElementById('empPosition').value = '';
        document.getElementById('empHireDate').value = '';

        employeeModal?.show();
    }

    function renderEmployees() {
        const list = document.getElementById('employees-list');
        if (!list) return;

        if (window.db.employees.length === 0) {
            list.innerHTML = `<tr><td colspan="6" class="text-muted">No employees.</td></tr>`;
            return;
        }

        list.innerHTML = window.db.employees.map(e => {
            const dept = getDepartmentById(e.deptId);
            return `
                <tr>
                    <td>${escapeHtml(e.employeeId)}</td>
                    <td>${escapeHtml(e.userEmail)}</td>
                    <td>${escapeHtml(e.position)}</td>
                    <td>${escapeHtml(dept ? dept.name : '—')}</td>
                    <td>${escapeHtml(e.hireDate || '—')}</td>
                    <td class="text-end">
                        <button class="btn btn-outline-danger btn-sm" onclick="deleteEmployee('${e.id}')">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function deleteEmployee(employeeRecordId) {
        const employee = window.db.employees.find(e => e.id === employeeRecordId);
        if (!employee) return;
        const ok = confirm(`Delete employee record: ${employee.employeeId}?`);
        if (!ok) return;
        window.db.employees = window.db.employees.filter(e => e.id !== employeeRecordId);
        saveToStorage();
        renderEmployees();
        showToast('Employee deleted.', 'secondary');
    }

    // --- Rendering: Requests (User) ---
    function statusBadge(status) {
        const s = String(status || 'Pending');
        const cls =
            s === 'Approved' ? 'bg-success' :
            s === 'Rejected' ? 'bg-danger' :
            'bg-warning text-dark';
        return `<span class="badge ${cls}">${escapeHtml(s)}</span>`;
    }

    function renderRequests() {
        const list = document.getElementById('requests-list');
        if (!list) return;

        const email = currentUser?.email || '';
        const rows = window.db.requests
            .filter(r => String(r.employeeEmail || '').trim().toLowerCase() === email.toLowerCase())
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));

        if (rows.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="text-muted">No requests yet.</td></tr>`;
            return;
        }

        list.innerHTML = rows.map(r => `
            <tr>
                <td>${escapeHtml(r.type)}</td>
                <td class="text-muted">${Array.isArray(r.items) ? r.items.length : 0}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${escapeHtml(new Date(r.date).toLocaleString())}</td>
            </tr>
        `).join('');
    }

    let requestModal = null;
    function addRequestItemRow(name = '', qty = 1) {
        const container = document.getElementById('reqItems');
        if (!container) return;

        const rowId = generateId('item');
        const row = document.createElement('div');
        row.className = 'row g-2 align-items-end mb-2 req-item';
        row.dataset.itemId = rowId;
        row.innerHTML = `
            <div class="col-md-8">
                <label class="form-label mb-1">Item name</label>
                <input type="text" class="form-control req-item-name" value="${escapeHtml(name)}" placeholder="e.g. Laptop">
            </div>
            <div class="col-md-3">
                <label class="form-label mb-1">Qty</label>
                <input type="number" class="form-control req-item-qty" value="${escapeHtml(qty)}" min="1" step="1">
            </div>
            <div class="col-md-1 d-grid">
                <button type="button" class="btn btn-outline-danger" data-action="remove-item" title="Remove">×</button>
            </div>
        `;
        container.appendChild(row);
    }

    function openNewRequestModal() {
        if (!currentUser) {
            navigateTo('#/login');
            return;
        }

        document.getElementById('reqType').value = 'Equipment';
        const items = document.getElementById('reqItems');
        items.innerHTML = '';
        addRequestItemRow('', 1);

        requestModal?.show();
    }

    // --- Form Wiring ---
    function wireUpForms() {
        const accountForm = document.getElementById('accountForm');
        accountForm?.addEventListener('submit', (e) => {
            e.preventDefault();

            const editId = document.getElementById('accountEditId').value.trim();
            const firstName = document.getElementById('accFirst').value.trim();
            const lastName = document.getElementById('accLast').value.trim();
            const email = document.getElementById('accEmail').value.trim();
            const password = document.getElementById('accPass').value;
            const role = document.getElementById('accRole').value === 'admin' ? 'admin' : 'user';
            const verified = document.getElementById('accVerified').checked;

            if (!email) {
                showToast('Email is required.', 'danger');
                return;
            }

            if (!editId && String(password).length < 6) {
                showToast('Password must be at least 6 characters.', 'danger');
                return;
            }

            if (editId && password && String(password).length < 6) {
                showToast('Password must be at least 6 characters.', 'danger');
                return;
            }

            const existingByEmail = findAccountByEmail(email);
            if (existingByEmail && existingByEmail.id !== editId) {
                showToast('Email already exists.', 'danger');
                return;
            }

            if (!editId) {
                window.db.accounts.push({
                    id: generateId('acc'),
                    firstName,
                    lastName,
                    email,
                    password,
                    role,
                    verified,
                });
                saveToStorage();
                renderAccounts();
                showToast('Account added.', 'success');
                accountModal?.hide();
                return;
            }

            const account = window.db.accounts.find(a => a.id === editId);
            if (!account) {
                showToast('Account not found.', 'danger');
                return;
            }

            const prevEmail = account.email;
            account.firstName = firstName;
            account.lastName = lastName;
            account.email = email;
            account.role = role;
            account.verified = verified;
            if (password) account.password = password;

            if (prevEmail.toLowerCase() !== email.toLowerCase()) {
                window.db.employees.forEach(emp => {
                    if (String(emp.userEmail).toLowerCase() === prevEmail.toLowerCase()) emp.userEmail = email;
                });
                window.db.requests.forEach(req => {
                    if (String(req.employeeEmail).toLowerCase() === prevEmail.toLowerCase()) req.employeeEmail = email;
                });
                if (localStorage.getItem(AUTH_TOKEN_KEY)?.toLowerCase() === prevEmail.toLowerCase()) {
                    localStorage.setItem(AUTH_TOKEN_KEY, email);
                }
                if (currentUser && currentUser.email.toLowerCase() === prevEmail.toLowerCase()) {
                    currentUser.email = email;
                }
            }

            saveToStorage();
            renderAccounts();
            showToast('Account updated.', 'success');
            accountModal?.hide();

            if (currentUser && currentUser.id === account.id) {
                setAuthState(true, account);
            }
        });

        const employeeForm = document.getElementById('employeeForm');
        employeeForm?.addEventListener('submit', (e) => {
            e.preventDefault();

            const employeeId = document.getElementById('empEmployeeId').value.trim();
            const userEmail = document.getElementById('empUserEmail').value.trim();
            const position = document.getElementById('empPosition').value.trim();
            const deptId = document.getElementById('empDept').value;
            const hireDate = document.getElementById('empHireDate').value;

            if (!employeeId || !userEmail || !position || !deptId || !hireDate) {
                showToast('Please complete all fields.', 'danger');
                return;
            }

            const account = findAccountByEmail(userEmail);
            if (!account) {
                showToast('User Email must match an existing account.', 'danger');
                return;
            }

            const dept = getDepartmentById(deptId);
            if (!dept) {
                showToast('Department not found.', 'danger');
                return;
            }

            window.db.employees.push({
                id: generateId('emp'),
                employeeId,
                userEmail: account.email,
                position,
                deptId: dept.id,
                hireDate,
            });
            saveToStorage();
            renderEmployees();
            showToast('Employee saved.', 'success');
            employeeModal?.hide();
        });

        const requestForm = document.getElementById('requestForm');
        requestForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const type = document.getElementById('reqType').value;
            const itemRows = Array.from(document.querySelectorAll('#reqItems .req-item'));
            const items = itemRows.map(row => {
                const name = row.querySelector('.req-item-name')?.value?.trim() || '';
                const qtyRaw = row.querySelector('.req-item-qty')?.value || '1';
                const qty = Math.max(1, Number(qtyRaw) || 1);
                return name ? { name, qty } : null;
            }).filter(Boolean);

            if (items.length === 0) {
                showToast('Add at least one item.', 'danger');
                return;
            }

            window.db.requests.push({
                id: generateId('req'),
                type,
                items,
                status: 'Pending',
                date: new Date().toISOString(),
                employeeEmail: currentUser.email,
            });

            saveToStorage();
            renderRequests();
            requestModal?.hide();
            showToast('Request submitted.', 'success');
        });

        const addItemBtn = document.getElementById('reqAddItemBtn');
        addItemBtn?.addEventListener('click', () => addRequestItemRow('', 1));

        const itemsContainer = document.getElementById('reqItems');
        itemsContainer?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action="remove-item"]');
            if (!btn) return;

            const row = btn.closest('.req-item');
            if (!row) return;

            const allRows = Array.from(document.querySelectorAll('#reqItems .req-item'));
            if (allRows.length <= 1) {
                row.querySelector('.req-item-name').value = '';
                row.querySelector('.req-item-qty').value = '1';
                return;
            }

            row.remove();
        });
    }

    // --- Init ---
    function init() {
        loadFromStorage();
        restoreAuthFromToken();

        accountModal = window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(document.getElementById('accountModal')) : null;
        employeeModal = window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(document.getElementById('employeeModal')) : null;
        requestModal = window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(document.getElementById('requestModal')) : null;

        wireUpForms();

        window.addEventListener('hashchange', handleRouting);
        handleRouting();
    }

    window.addEventListener('load', init);

    // --- Expose functions used by inline HTML handlers ---
    window.navigateTo = navigateTo;
    window.handleRouting = handleRouting;
    window.handleRegister = handleRegister;
    window.simulateVerification = simulateVerification;
    window.handleLogin = handleLogin;
    window.setAuthState = setAuthState;
    window.logout = logout;

    window.openAddAccountModal = openAddAccountModal;
    window.openEditAccountModal = openEditAccountModal;
    window.resetPasswordPrompt = resetPasswordPrompt;
    window.deleteAccount = deleteAccount;

    window.addDepartmentNotImplemented = addDepartmentNotImplemented;

    window.openAddEmployeeModal = openAddEmployeeModal;
    window.deleteEmployee = deleteEmployee;

    window.openNewRequestModal = openNewRequestModal;
})();