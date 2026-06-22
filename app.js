document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.protocol.startsWith('http') ? '/api' : 'http://localhost:3000/api';

    // DOM Elements - Auth
    const loginSplash = document.getElementById('login-splash');
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const appContainer = document.getElementById('app-container');
    const logoutBtn = document.getElementById('logout-btn');

    // DOM Elements - Tabs
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    // DOM Elements - Dashboard Stats
    const statUnpaid = document.getElementById('stat-unpaid');
    const statUnpaidCount = document.getElementById('stat-unpaid-count');
    const statPaid = document.getElementById('stat-paid');
    const statPaidCount = document.getElementById('stat-paid-count');
    const demoBadge = document.getElementById('demo-badge');
    const paymentForm = document.getElementById('payment-form');
    const paymentBillSelect = document.getElementById('payment-bill-select');
    const refLabel = document.getElementById('ref-label');
    const refNumber = document.getElementById('ref-number');
    const paymentAmount = document.getElementById('payment-amount');
    const paymentDate = document.getElementById('payment-date');
    const chartBarsList = document.getElementById('chart-bars-list');
    const paymentHistoryList = document.getElementById('payment-history-list');

    // DOM Elements - Mail Scanner
    const btnTriggerScan = document.getElementById('btn-trigger-scan');
    const scanOverlay = document.getElementById('scan-progress-overlay');
    const scanProgressBar = document.getElementById('scan-progress-bar');
    const emailListContainer = document.getElementById('email-list-container');
    const emailReadingPane = document.getElementById('email-reading-pane');
    const searchMailInput = document.getElementById('search-mail');
    const folderButtons = document.querySelectorAll('.folder');

    // DOM Elements - Email Connection Modal
    const configModal = document.getElementById('config-modal');
    const configForm = document.getElementById('config-form');
    const configEmail = document.getElementById('config-email');
    const configPassword = document.getElementById('config-password');
    const configHost = document.getElementById('config-host');
    const configPort = document.getElementById('config-port');
    const configSecure = document.getElementById('config-secure');
    const btnCloseConfig = document.getElementById('btn-close-config');


    // State Variables
    let bills = [];
    let payments = [];
    let emails = [];
    let currentFolder = 'all';

    // Set today's date on the payment date picker by default
    const today = new Date().toISOString().split('T')[0];
    paymentDate.value = today;

    // --- AUTHENTICATION FLOW ---
    const checkAuth = () => {
        const isAuthed = sessionStorage.getItem('bills_authed');
        if (isAuthed === 'true') {
            loginSplash.classList.add('hidden');
            appContainer.classList.remove('app-hidden');
            initializeDashboard();
        } else {
            loginSplash.classList.remove('hidden');
            appContainer.classList.add('app-hidden');
        }
    };

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = usernameInput.value.trim();
        const pass = passwordInput.value;

        if (user.toLowerCase() === 'linda' && pass === 'paloptical') {
            sessionStorage.setItem('bills_authed', 'true');
            loginError.classList.add('hidden');
            checkAuth();
        } else {
            loginError.classList.remove('hidden');
        }
    });

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('bills_authed');
        checkAuth();
    });

    // --- TAB NAVIGATION ---
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabViews.forEach(view => {
                if (view.id === `${targetTab}-view` || view.id === `${targetTab}`) {
                    view.classList.add('active');
                } else {
                    view.classList.remove('active');
                }
            });

            if (targetTab === 'dashboard') {
                loadDashboardData();
            } else if (targetTab === 'outlook-mail') {
                loadMailData();
            }
        });
    });

    // Dynamic label swap depending on payment type (e.g. Check Number vs Card Details)
    document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'check') {
                refLabel.textContent = 'Check Number';
                refNumber.placeholder = 'e.g. 1004';
            } else if (val === 'card') {
                refLabel.textContent = 'Card details';
                refNumber.placeholder = 'e.g. Visa *1234';
            } else {
                refLabel.textContent = 'Reference Code';
                refNumber.placeholder = 'e.g. ACH-483829';
            }
        });
    });

    // --- DATA HANDLING ---
    const initializeDashboard = async () => {
        checkConfigStatus();
        loadDashboardData();
    };

    const checkConfigStatus = async () => {
        try {
            const res = await fetch(`${API_BASE}/config-status`);
            const status = await res.json();
            if (!status.supabase || !status.imap || !status.openrouter) {
                demoBadge.classList.remove('hidden');
                demoBadge.textContent = "Demo Sandbox Mode";
                demoBadge.title = status.msg;
            } else {
                demoBadge.classList.add('hidden');
            }
        } catch (err) {
            console.error("Config check failed", err);
            demoBadge.classList.remove('hidden');
            demoBadge.textContent = "Offline Mode";
        }
    };

    const loadDashboardData = async () => {
        try {
            // Fetch stats
            const statsRes = await fetch(`${API_BASE}/stats`);
            const stats = await statsRes.json();
            
            statUnpaid.textContent = `$${parseFloat(stats.totalUnpaid).toFixed(2)}`;
            statUnpaidCount.textContent = `${stats.unpaidCount} pending statements`;
            
            statPaid.textContent = `$${parseFloat(stats.totalPaid).toFixed(2)}`;
            statPaidCount.textContent = `${stats.paidCount} bills settled`;

            // Fetch pending bills list to populate select form dropdown
            const billsRes = await fetch(`${API_BASE}/bills`);
            bills = await billsRes.json();
            
            // Populate select list
            paymentBillSelect.innerHTML = '<option value="" disabled selected>Select a bill...</option>';
            const pendingBills = bills.filter(b => b.status === 'unpaid');
            
            if (pendingBills.length === 0) {
                paymentBillSelect.innerHTML = '<option value="" disabled>No pending bills found</option>';
            } else {
                pendingBills.forEach(bill => {
                    const opt = document.createElement('option');
                    opt.value = bill.id;
                    opt.textContent = `${bill.vendor} - $${parseFloat(bill.amount).toFixed(2)} (Due: ${formatDate(bill.due_date)})`;
                    // Attach amount value for auto-populating amount field
                    opt.setAttribute('data-amount', bill.amount);
                    paymentBillSelect.appendChild(opt);
                });
            }

            // Auto fill amount when bill is selected
            paymentBillSelect.addEventListener('change', () => {
                const selectedOpt = paymentBillSelect.options[paymentBillSelect.selectedIndex];
                if (selectedOpt) {
                    paymentAmount.value = selectedOpt.getAttribute('data-amount');
                }
            });

            // Render Payment Distribution Chart
            renderBreakdownChart(stats.paymentMethods || [], stats.totalPaid || 1);

            // Load payments history list
            const payRes = await fetch(`${API_BASE}/payments`);
            payments = await payRes.json();
            renderPaymentHistory(payments);

        } catch (err) {
            console.error("Error loading dashboard data", err);
        }
    };

    const renderBreakdownChart = (methods, totalPaid) => {
        chartBarsList.innerHTML = '';
        if (methods.length === 0) {
            chartBarsList.innerHTML = '<div class="empty-state">No payment methods logged.</div>';
            return;
        }

        methods.forEach(item => {
            const pct = totalPaid > 0 ? (item.value / totalPaid) * 100 : 0;
            const barHTML = `
                <div class="chart-bar-item">
                    <div class="bar-info">
                        <span class="bar-label">${item.name}</span>
                        <span class="bar-val">$${parseFloat(item.value).toFixed(2)} (${pct.toFixed(0)}%)</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill fill-${item.name}" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
            chartBarsList.insertAdjacentHTML('beforeend', barHTML);
        });
    };

    const renderPaymentHistory = (list) => {
        paymentHistoryList.innerHTML = '';
        if (list.length === 0) {
            paymentHistoryList.innerHTML = '<div class="empty-state">No payments logged yet.</div>';
            return;
        }

        list.forEach(p => {
            const vendorName = p.bills ? p.bills.vendor : 'Vendor';
            const historyHTML = `
                <div class="history-item">
                    <div class="history-details">
                        <h4>${vendorName}</h4>
                        <p>Paid on: ${formatDate(p.paid_date)} ${p.ref_number ? `(${p.ref_number})` : ''}</p>
                    </div>
                    <div class="history-payment-info">
                        <div class="history-amount">$${parseFloat(p.amount).toFixed(2)}</div>
                        <span class="history-method">${p.payment_method}</span>
                    </div>
                </div>
            `;
            paymentHistoryList.insertAdjacentHTML('beforeend', historyHTML);
        });
    };

    // LOG PAYMENT ACTION
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const billId = paymentBillSelect.value;
        const method = document.querySelector('input[name="payment_method"]:checked').value;
        const ref = refNumber.value.trim();
        const amt = paymentAmount.value;
        const date = paymentDate.value;
        const note = paymentNotes.value.trim();

        if (!billId) return;

        try {
            const res = await fetch(`${API_BASE}/bills/${billId}/pay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    payment_method: method,
                    ref_number: ref,
                    amount: amt,
                    paid_date: date,
                    notes: note
                })
            });

            if (res.ok) {
                // Clear inputs
                paymentForm.reset();
                paymentDate.value = today;
                refLabel.textContent = 'Check Number';
                refNumber.placeholder = 'e.g. 1004';
                // Reload dashboard
                loadDashboardData();
            } else {
                alert("Payment recording failed.");
            }
        } catch (err) {
            console.error("Payment submission failed", err);
        }
    });

    // --- MAIL SCANNER WORKFLOW ---
    const loadMailData = async () => {
        // Load scanned bills to display in the mail viewer list
        try {
            const res = await fetch(`${API_BASE}/bills`);
            bills = await res.json();
            renderMailList();
        } catch (err) {
            console.error("Failed to load scan emails", err);
        }
    };

    const renderMailList = () => {
        emailListContainer.innerHTML = '';
        
        // Filter bills by search query
        const query = searchMailInput.value.toLowerCase().trim();
        let filtered = [...bills];
        // Sort by date_received descending (newest first)
        filtered.sort((a, b) => new Date(b.date_received) - new Date(a.date_received));

        if (currentFolder === 'bills') {
            filtered = bills.filter(b => b.status === 'unpaid' || b.status === 'paid'); 
        } else if (currentFolder === 'other') {
            filtered = bills.filter(b => b.status === 'other'); 
        }

        if (query) {
            filtered = filtered.filter(b => 
                b.vendor.toLowerCase().includes(query) || 
                b.email_subject.toLowerCase().includes(query) || 
                (b.extracted_summary && b.extracted_summary.toLowerCase().includes(query))
            );
        }

        document.getElementById('badge-total-mail').textContent = bills.length;
        document.getElementById('badge-bill-mail').textContent = bills.filter(b => b.status === 'unpaid' || b.status === 'paid').length;

        if (filtered.length === 0) {
            emailListContainer.innerHTML = '<div class="empty-state">No emails found in this category.</div>';
            return;
        }

        filtered.forEach(b => {
            const activeClass = (selectedEmailId === b.id) ? 'active' : '';
            
            let badgeHTML = '';
            if (b.status === 'paid') {
                badgeHTML = '<span class="badge info">AI Statement</span> <span class="badge success">Paid</span>';
            } else if (b.status === 'unpaid') {
                badgeHTML = '<span class="badge info">AI Statement</span> <span class="badge warning">Bill Pending</span>';
            } else {
                badgeHTML = '<span class="badge">Personal / Other</span>';
            }

            const itemHTML = `
                <div class="email-item ${activeClass}" data-id="${b.id}">
                    <div class="email-item-header">
                        <span class="email-sender" title="${b.email_sender}">${b.vendor}</span>
                        <span class="email-date">${formatDate(b.date_received)}</span>
                    </div>
                    <div class="email-subject">${b.email_subject}</div>
                    <div class="email-preview">${b.extracted_summary || 'No description available'}</div>
                    <div class="email-badge-row">
                        ${badgeHTML}
                    </div>
                </div>
            `;
            emailListContainer.insertAdjacentHTML('beforeend', itemHTML);
        });

        // Set click events for mail items
        document.querySelectorAll('.email-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-id');
                selectEmail(id);
            });
        });
    };

    let selectedEmailId = null;
    const selectEmail = (id) => {
        selectedEmailId = id;
        
        // Highlight active list item
        document.querySelectorAll('.email-item').forEach(item => {
            if (item.getAttribute('data-id') === id) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        const selectedBill = bills.find(b => b.id === id);
        if (!selectedBill) return;

        let aiCardHTML = '';
        if (selectedBill.status === 'other') {
            aiCardHTML = `
                <div class="ai-extraction-card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); margin: 1.5rem;">
                    <div class="ai-header" style="color: var(--text-secondary);">
                        <i class="fa-solid fa-brain"></i> OpenRouter AI Analysis: Classified Other
                    </div>
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">
                        This email was scanned and determined to be non-billing correspondence (e.g. personal, newsletter, notification). No payment parameters were extracted.
                    </p>
                </div>
            `;
        } else {
            aiCardHTML = `
                <div class="ai-extraction-card" style="margin: 1.5rem;">
                    <div class="ai-header">
                        <i class="fa-solid fa-brain"></i> OpenRouter AI Extracted Statement Parameters
                    </div>
                    <div class="ai-grid">
                        <div class="ai-field">
                            <span class="ai-label">Vendor</span>
                            <span class="ai-value">${selectedBill.vendor}</span>
                        </div>
                        <div class="ai-field">
                            <span class="ai-label">Amount Due</span>
                            <span class="ai-value" style="color: var(--accent-amber); font-weight: 700;">$${parseFloat(selectedBill.amount).toFixed(2)}</span>
                        </div>
                        <div class="ai-field">
                            <span class="ai-label">Due Date</span>
                            <span class="ai-value">${selectedBill.due_date ? formatDate(selectedBill.due_date) : 'N/A'}</span>
                        </div>
                        <div class="ai-field">
                            <span class="ai-label">Statement Date</span>
                            <span class="ai-value">${selectedBill.statement_date ? formatDate(selectedBill.statement_date) : 'N/A'}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Render mail details panel
        emailReadingPane.innerHTML = `
            <div class="reading-pane-header">
                <div class="reading-sender-row">
                    <div class="sender-avatar">${selectedBill.vendor.charAt(0).toUpperCase()}</div>
                    <div class="sender-info">
                        <h4>${selectedBill.vendor}</h4>
                        <p>From: &lt;${selectedBill.email_sender}&gt; • ${formatDate(selectedBill.date_received)}</p>
                    </div>
                </div>
                <h1 class="reading-subject">${selectedBill.email_subject}</h1>
            </div>
            <div class="reading-pane-body">${selectedBill.extracted_summary}</div>
            ${aiCardHTML}
        `;
    };

    // SEARCH INPUT HANDLER
    searchMailInput.addEventListener('input', () => {
        renderMailList();
    });

    // FOLDER SWITCHER
    folderButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            folderButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFolder = btn.getAttribute('data-folder');
            renderMailList();
        });
    });

    // SCAN TRIGGER ACTION
    btnTriggerScan.addEventListener('click', async () => {
        scanOverlay.classList.remove('hidden');
        scanProgressBar.style.width = '10%';
        
        let progress = 10;
        const interval = setInterval(() => {
            if (progress < 85) {
                progress += Math.floor(Math.random() * 15) + 5;
                scanProgressBar.style.width = `${progress}%`;
            }
        }, 800);

        try {
            const res = await fetch(`${API_BASE}/scan`, { method: 'POST' });
            clearInterval(interval);
            scanProgressBar.style.width = '100%';
            
            setTimeout(() => {
                scanOverlay.classList.add('hidden');
                loadMailData();
            }, 500);

        } catch (err) {
            clearInterval(interval);
            scanOverlay.classList.add('hidden');
            alert("Scan failed. Error connecting to local mail sync backend.");
        }
    });

    // UTILS
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Open connection config modal on clicking the demo badge
    demoBadge.style.cursor = 'pointer';
    demoBadge.addEventListener('click', () => {
        configModal.classList.remove('hidden');
    });

    // Close modal
    btnCloseConfig.addEventListener('click', () => {
        configModal.classList.add('hidden');
        configForm.reset();
    });

    // Handle saving connection config
    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = configEmail.value.trim();
        const password = configPassword.value;
        const host = configHost.value.trim();
        const port = configPort.value.trim();
        const secure = configSecure.checked;

        try {
            const res = await fetch(`${API_BASE}/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, host, port, secure })
            });

            if (res.ok) {
                const data = await res.json();
                alert(data.msg || "Credentials updated successfully!");
                configModal.classList.add('hidden');
                configForm.reset();
                // Re-evaluate config status
                initializeDashboard();
            } else {
                const errData = await res.json();
                alert("Failed to save credentials: " + (errData.error || "Unknown error"));
            }
        } catch (err) {
            console.error("Save credentials failed", err);
            alert("Error sending request to backend server.");
        }
    });

    // Settings Button toggle
    const btnOpenSettings = document.getElementById('btn-open-settings');
    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            configModal.classList.remove('hidden');
        });
    }

    // Run auth check on load
    checkAuth();
});

// Register Service Worker for PWA capability
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered successfully'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

