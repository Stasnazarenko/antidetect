// initialize socket.io safely
let socket = null;
try { if (typeof io !== 'undefined') socket = io(); } catch (e) { console.warn('socket.io init failed', e); }

let profiles = [];
let currentProfile = null;
let selectedProfiles = new Set();

// Safe getEl helper — define early so other code can use it
function getEl(id) { return document.getElementById(id) || null; }

// Pending handlers queue must exist before any safeOn calls
const __pendingHandlers = [];

// Safe helper to attach listeners only if element exists
// If element not present yet, push to pendingHandlers and attach in initApp
function safeOn(id, event, handler) {
    const el = getEl(id);
    if (el) {
        el.addEventListener(event, handler);
    } else {
        __pendingHandlers.push({ id, event, handler });
    }
}

// Initialize core DOM references early (must be available before render/load functions run)
let profilesGrid = null;
let searchInput = null;
let filterStatus = null;
let filterProxy = null;
let selectedCountSpan = null;
let bulkActionsDiv = null;

// Safe modal helpers
function showModal(id) {
    const el = getEl(id);
    if (el) el.style.display = 'block';
}
function hideModal(id) {
    const el = getEl(id);
    if (el) el.style.display = 'none';
}

// Ensure commonly used modal elements exist as variables for older code compatibility
const proxyModal = getEl('proxy-modal');
const newProfileModal = getEl('new-profile-modal');
const fingerprintModal = getEl('fingerprint-modal');

// Генерація аватара профілю
function generateAvatar(name) {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
        '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
    ];

    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const color = colors[hash % colors.length];
    const initial = name.charAt(0).toUpperCase();

    return { color, initial };
}

// Завантажити профілі
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        if (data.success) {
            profiles = data.profiles;
            console.log('[UI] Loaded profiles:', profiles.length);
            updateStats();
            renderProfiles();
        }
    } catch (error) {
        console.error('Error loading profiles:', error);
        showNotification('Failed to load profiles', 'error');
    }
}

// Оновити статистику
function updateStats() {
    const total = profiles.length;
    const open = profiles.filter(p => p.open).length;
    const withProxy = profiles.filter(p => p.proxy).length;

    const elTotal = getEl('total-profiles'); if (elTotal) elTotal.textContent = total;
    const elOpen = getEl('open-profiles'); if (elOpen) elOpen.textContent = open;
    const elProxy = getEl('proxy-profiles'); if (elProxy) elProxy.textContent = withProxy;
}

// Відрендерити профілі
function renderProfiles() {
    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = filterStatus.value;
    const proxyFilter = filterProxy.value;

    let filtered = profiles.filter(profile => {
        // Пошук
        if (searchTerm && !profile.name.toLowerCase().includes(searchTerm)) {
            return false;
        }

        // Фільтр по статусу
        if (statusFilter === 'open' && !profile.open) return false;
        if (statusFilter === 'closed' && profile.open) return false;

        // Фільтр по проксі
        if (proxyFilter === 'with-proxy' && !profile.proxy) return false;
        if (proxyFilter === 'without-proxy' && profile.proxy) return false;

        return true;
    });

    if (filtered.length === 0) {
        profilesGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <h3>No profiles found</h3>
                <p>Create a new profile to get started</p>
            </div>
        `;
        return;
    }

    profilesGrid.innerHTML = filtered.map(profile => {
        const avatar = generateAvatar(profile.name);
        const isSelected = selectedProfiles.has(profile.name);
        const fpPreview = getFingerprintPreview(profile.fingerprint);

        return `
        <div class="profile-card ${isSelected ? 'selected' : ''}" data-profile="${profile.name}">
            <input type="checkbox" class="profile-checkbox" 
                   data-profile="${profile.name}" 
                   ${isSelected ? 'checked' : ''}
                   onclick="toggleSelect('${profile.name}', event)">
            
            <div class="profile-avatar" style="background: ${avatar.color}">
                ${avatar.initial}
            </div>
            
            <div class="profile-header">
                <div class="profile-name">${profile.name}</div>
                <div class="profile-status ${profile.open ? 'status-open' : 'status-closed'}">
                    ${profile.open ? '🟢 Open' : '⚫ Closed'}
                </div>
            </div>
            
            <div class="profile-info">
                <div class="info-row">
                    <span class="info-label">Proxy:</span>
                    <span class="info-value">${profile.proxy ? '✅ Configured' : '❌ None'}</span>
                </div>
                ${profile.proxy && typeof profile.proxy === 'object' ? `
                <div class="info-row">
                    <span class="info-label">Assigned proxy:</span>
                    <span class="info-value">${profile.proxy.id || profile.proxy.server || profile.proxy}
                        ${profile.proxy.tags && profile.proxy.tags.length ? `<span class=\"badge\">${profile.proxy.tags.join(', ')}</span>` : ''}
                        ${profile.proxy.status ? `<span class=\"status-badge ${profile.proxy.status==='active'?'status-active':'status-failed'}\">${profile.proxy.status}</span>` : ''}
                    </span>
                </div>
                ` : ''}
                <div class="info-row">
                    <span class="info-label">OS:</span>
                    <span class="info-value">${fpPreview.os}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Screen:</span>
                    <span class="info-value">${fpPreview.screen}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Cores:</span>
                    <span class="info-value">${fpPreview.cores}</span>
                </div>
                ${profile.proxy ? `
                <div class="info-row">
                    <span class="info-label">Type:</span>
                    <span class="info-value">${profile.proxyType.toUpperCase()}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="profile-actions">
                <button class="btn ${profile.open ? 'btn-danger' : 'btn-success'}" 
                        onclick="toggleProfile('${profile.name}', ${profile.open}, event)">
                    ${profile.open ? '⏹️ Close' : '▶️ Open'}
                </button>
                <button class="btn btn-primary" onclick="viewFingerprint('${profile.name}')">
                    🖐️ Fingerprint
                </button>
                <button class="btn btn-primary" onclick="configureProxy('${profile.name}')">
                    🔧 Proxy
                </button>
                <button class="btn btn-danger" onclick="deleteProfile('${profile.name}', event)">
                    🗑️ Delete
                </button>
            </div>
        </div>
    `;
    }).join('');

    updateBulkActions();
}

// Отримати preview fingerprint
function getFingerprintPreview(fp) {
    if (!fp || typeof fp !== 'object') {
        return { os: 'Random', screen: 'Auto', cores: 'Auto' };
    }

    const os = fp.os || 'Random';
    const screen = fp.screen ?
        (fp.screen.minWidth ? `${fp.screen.minWidth}x${fp.screen.minHeight}` : 'Auto') :
        'Auto';
    const cores = fp.hardwareConcurrency ||
        (fp.hardwareConcurrency?.min ? `${fp.hardwareConcurrency.min}-${fp.hardwareConcurrency.max}` : 'Auto');

    return { os, screen, cores };
}

// Відкрити/закрити профіль (improved error handling and UI feedback)
async function toggleProfile(name, isOpen, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    console.log(`toggleProfile called: name=${name}, isOpen=${isOpen}`);

    try {
        const endpoint = isOpen ? `/api/profiles/${encodeURIComponent(name)}/close` : `/api/profiles/${encodeURIComponent(name)}/open`;
        console.log(`Calling endpoint: ${endpoint}`);

        const response = await fetch(endpoint, { method: 'POST' });
        let data = null;
        try {
            data = await response.json();
        } catch (e) {
            data = null;
        }

        if (response.ok && data && data.success) {
            showNotification(`Profile ${isOpen ? 'closed' : 'opened'} successfully`, 'success');
            await loadProfiles();
            return;
        }

        const errMsg = (data && (data.error || data.message)) ? (data.error || data.message) : `Server responded with status ${response.status}`;
        console.error(`API Error opening/closing profile:`, errMsg);

        // If proxy/connect related — open proxy modal for this profile with error message
        if (errMsg.toLowerCase().includes('proxy') || errMsg.toLowerCase().includes('connect') || errMsg.toLowerCase().includes('ecoff')) {
            // show notification
            showNotification(`Failed: ${errMsg}`, 'error');
            // open proxy modal for this profile so user can check/fix proxy
            configureProxy(name, errMsg);
        } else {
            showNotification(errMsg, 'error');
        }

        // Always refresh profiles state to ensure UI accuracy
        await loadProfiles();

    } catch (error) {
        console.error('Error toggling profile:', error);
        showNotification('Operation failed: ' + (error && error.message ? error.message : String(error)), 'error');
        // refresh to ensure state
        try { await loadProfiles(); } catch (e) {}
    }
}

// Delete profile from UI (called by onclick in profile cards)
async function deleteProfile(name, event) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (!confirm(`Delete profile "${name}"? This will remove profile data from storage.`)) return;
    try {
        const resp = await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data && data.success) {
            showNotification('Profile deleted', 'success');
            await loadProfiles();
        } else {
            showNotification(data.error || 'Failed to delete', 'error');
        }
    } catch (e) {
        console.error('deleteProfile error', e);
        showNotification('Delete failed', 'error');
    }
}

// Bulk action buttons wiring (if elements exist)
const bulkOpenBtn = getEl('bulk-open-btn'); if (bulkOpenBtn) bulkOpenBtn.addEventListener('click', () => bulkAction('open'));
const bulkCloseBtn = getEl('bulk-close-btn'); if (bulkCloseBtn) bulkCloseBtn.addEventListener('click', () => bulkAction('close'));
const bulkDeleteBtn = getEl('bulk-delete-btn'); if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', () => bulkAction('delete'));
const deselectAllBtn = getEl('deselect-all-btn'); if (deselectAllBtn) deselectAllBtn.addEventListener('click', () => { selectedProfiles.clear(); renderProfiles(); });
const selectAllBtn = getEl('select-all-btn'); if (selectAllBtn) selectAllBtn.addEventListener('click', () => { profiles.forEach(p=>selectedProfiles.add(p.name)); renderProfiles(); });

// Bulk select functions
function toggleSelect(name, event) {
    event.stopPropagation();

    if (selectedProfiles.has(name)) {
        selectedProfiles.delete(name);
    } else {
        selectedProfiles.add(name);
    }

    renderProfiles();
}

function updateBulkActions() {
    const count = selectedProfiles.size;
    selectedCountSpan.textContent = count;

    if (count > 0) {
        bulkActionsDiv.style.display = 'flex';
    } else {
        bulkActionsDiv.style.display = 'none';
    }
}

async function bulkAction(action) {
    if (selectedProfiles.size === 0) return;

    const profiles = Array.from(selectedProfiles);

    // Confirmation перед циклом
    if (action === 'delete') {
        if (!confirm(`Delete ${profiles.length} profile(s)?`)) return;
    }

    let successCount = 0;

    console.log(`[Bulk ${action}] Starting for ${profiles.length} profiles:`, profiles);

    for (const name of profiles) {
        try {
            let endpoint;
            let method = 'POST';

            switch(action) {
                case 'open':
                    endpoint = `/api/profiles/${name}/open`;
                    break;
                case 'close':
                    endpoint = `/api/profiles/${name}/close`;
                    break;
                case 'delete':
                    endpoint = `/api/profiles/${name}`;
                    method = 'DELETE';
                    break;
            }

            console.log(`[Bulk ${action}] ${name}: ${method} ${endpoint}`);

            const response = await fetch(endpoint, { method });
            const data = await response.json();

            console.log(`[Bulk ${action}] ${name} response:`, data);

            if (data.success) {
                successCount++;
            } else {
                console.error(`[Bulk ${action}] ${name} failed:`, data.error);
            }

            // Затримка щоб АПІ встиг обробити
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
            console.error(`[Bulk ${action}] Error for ${name}:`, error);
        }
    }

    // Більша затримка перед оновленням UI щоб всі операції завершились
    await new Promise(resolve => setTimeout(resolve, 1000));

    showNotification(`${action} completed: ${successCount}/${profiles.length}`, successCount > 0 ? 'success' : 'error');
    selectedProfiles.clear();
    await loadProfiles();
    updateBulkActions();
}

// Safe wrappers for frequently-used DOM getters
function elVal(id) { const e = getEl(id); return e ? e.value : ''; }
function elSetVal(id, v) { const e = getEl(id); if (e) e.value = v; }
function elHide(id) { const e = getEl(id); if (e) e.style.display = 'none'; }
function elShow(id) { const e = getEl(id); if (e) e.style.display = 'block'; }

// Update viewFingerprint to use safe getters
async function viewFingerprint(name) {
    const profile = profiles.find(p => p.name === name);
    if (!profile) return;

    currentProfile = name;
    const fpNameEl = getEl('fp-profile-name'); if (fpNameEl) fpNameEl.textContent = name;

    const fp = profile.fingerprint;
    const detailsDiv = getEl('fingerprint-details');

    if (!detailsDiv) return;

    if (!fp || typeof fp !== 'object') {
        detailsDiv.innerHTML = '<div class="fp-item"><p>No custom fingerprint configured. Using random generation.</p></div>';
    } else {
        detailsDiv.innerHTML = Object.entries(fp).map(([key, value]) => {
            let displayValue = JSON.stringify(value, null, 2);
            if (displayValue.length > 100) {
                displayValue = displayValue.substring(0, 100) + '...';
            }

            return `
                <div class="fp-item">
                    <div class="fp-label">${key}</div>
                    <div class="fp-value">${displayValue}</div>
                </div>
            `;
        }).join('');
    }

    showModal('fingerprint-modal');
}

// Helper: load list of proxies from server
async function loadProxiesList() {
    try {
        const resp = await fetch('/api/proxies');
        const j = await resp.json();
        return (j && j.proxies) ? j.proxies : (Array.isArray(j) ? j : []);
    } catch (e) {
        console.error('loadProxiesList failed', e);
        return [];
    }
}

// Helper: populate a <select> element with saved proxies
async function loadProxiesIntoSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">(no proxy)</option>';
    try {
        const list = await loadProxiesList();
        for (const p of list) {
            const opt = document.createElement('option');
            opt.value = p.id || `${p.host}:${p.port}`;
            opt.textContent = `${p.host}:${p.port}${p.tags && p.tags.length ? ' ['+p.tags.join(',')+']' : ''}`;
            selectEl.appendChild(opt);
        }
    } catch (e) {
        console.error('loadProxiesIntoSelect failed', e);
    }
}

// Fix populateProxyExistingSelect to use getEl inside (avoid undefined global)
async function populateProxyExistingSelect() {
    const proxyExistingSelect = getEl('proxy-existing-select');
    if (!proxyExistingSelect) return;
    const list = await loadProxiesList();
    proxyExistingSelect.innerHTML = '<option value="">(choose saved proxy)</option><option value="custom">-- Custom proxy --</option>';
    for (const p of list) {
        const opt = document.createElement('option');
        opt.value = p.id || `${p.host}:${p.port}`;
        opt.textContent = `${p.host}:${p.port}${p.tags && p.tags.length ? ' ['+p.tags.join(', ')+']' : ''} ${p.status ? '('+p.status+')' : ''}`;
        proxyExistingSelect.appendChild(opt);
    }
}

// Replace direct proxy-existing select fill: use safe set
// (duplicate implementation removed)

// Replace inline assignments with elSetVal/elHide
(async function replaceDirectProxyAssignments(){
    // fill found proxy details when selected
})();

// Ensure test-proxy is attached via safeOn (deduplicate)
safeOn('test-proxy-btn', 'click', async () => {
    const proxyExistingSelect = getEl('proxy-existing-select');
    const selected = proxyExistingSelect ? proxyExistingSelect.value : '';
    const resultDiv = getEl('proxy-test-result');
    if (resultDiv) { elShow('proxy-test-result'); resultDiv.innerHTML = '<div class="loader"></div> Testing proxy...'; }

    try {
        let resp, data;
        if (selected && selected !== 'custom') {
            resp = await fetch(`/api/proxies/${selected}/test`, { method: 'POST' });
        } else {
            const proxyInputVal = elVal('proxy-input');
            const proxyTypeVal = elVal('proxy-type') || 'http';
            if (!proxyInputVal) { showNotification('Enter proxy to test', 'error'); if (resultDiv) elHide('proxy-test-result'); return; }
            resp = await fetch('/api/proxies/test', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ proxy: `${proxyInputVal}`, type: proxyTypeVal }) });
        }
        data = await resp.json();
        if (resultDiv) {
            if (data.success) resultDiv.innerHTML = `<div style=\"background:#c6f6d5;padding:10px;border-radius:6px;\">✅ OK — IP: ${data.ip} — ${data.location && data.location.city ? data.location.city+',' : ''} ${data.location && data.location.country ? data.location.country : ''} — ${data.responseTime||''}</div>`;
            else resultDiv.innerHTML = `<div style=\"background:#fed7d7;padding:10px;border-radius:6px;\">❌ ${data.error}</div>`;
        }
    } catch (err) {
        console.error('Test proxy error', err);
        const resultDiv2 = getEl('proxy-test-result'); if (resultDiv2) resultDiv2.innerHTML = `<div style=\"background:#fed7d7;padding:10px;border-radius:6px;\">❌ ${err.message}</div>`;
    }
});

// Replace direct proxy input setters used earlier
function setProxyInputsFromFound(found) {
    elSetVal('proxy-input', `${found.host}:${found.port}${found.username ? ':'+found.username+':'+found.password : ''}`);
    elSetVal('proxy-type', found.type || 'http');
}

// Close modal handlers: any element with class 'close' should hide its parent modal
Array.from(document.getElementsByClassName('close')).forEach(el => {
    el.addEventListener('click', (e) => {
        const modal = el.closest('.modal');
        if (modal) modal.style.display = 'none';
    });
});

// Налаштувати проксі — тепер приймає optional errorMsg, показує помилку у proxy-test-result
function configureProxy(name, errorMsg) {
    currentProfile = name;
    const profile = profiles.find(p => p.name === name);

    // Fill existing saved proxy select first
    populateProxyExistingSelect().catch(() => {});

    if (profile && profile.proxy && typeof profile.proxy === 'object') {
        // show assigned proxy details safely
        setProxyInputsFromFound(profile.proxy);
    } else {
        elSetVal('proxy-input', '');
        elSetVal('proxy-type', 'http');
    }

    // Show previous proxy test result area
    const resultDiv = getEl('proxy-test-result');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        if (errorMsg) {
            resultDiv.innerHTML = `<div style="background:#fed7d7;padding:10px;border-radius:6px;">❌ ${escapeHtml(errorMsg)}</div>`;
        } else {
            resultDiv.innerHTML = '';
        }
    }

    showModal('proxy-modal');
}

// Regenerate fingerprint (safe attach)
safeOn('regenerate-fp-btn', 'click', async () => {
    try {
        const response = await fetch(`/api/profiles/${currentProfile}/fingerprint`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Fingerprint regenerated successfully', 'success');
            const fm = getEl('fingerprint-modal'); if (fm) fm.style.display = 'none';
            await loadProfiles();
        } else {
            showNotification(data.error || 'Failed to regenerate fingerprint', 'error');
        }
    } catch (error) {
        console.error('Error regenerating fingerprint:', error);
        showNotification('Failed to regenerate fingerprint', 'error');
    }
});

safeOn('close-fp-modal-btn', 'click', () => {
    const fm = getEl('fingerprint-modal'); if (fm) fm.style.display = 'none';
});

// New profile modal elements (safe refs)
const newProfileCloseBtnSafe = getEl('new-profile-close');
const newProfileProxySelectSafe = getEl('new-profile-proxy-select');
const newProfileAssignCheckboxSafe = getEl('new-profile-assign-checkbox');

// New profile button and form (safe)
safeOn('new-profile-btn', 'click', async () => {
    await loadProxiesIntoSelect(getEl('new-profile-proxy-select'));
    const nm = getEl('new-profile-modal'); if (nm) nm.style.display = 'block';
});

safeOn('new-profile-close', 'click', () => { const nm = getEl('new-profile-modal'); if (nm) nm.style.display = 'none'; });

safeOn('new-profile-form', 'submit', async (e) => {
    e.preventDefault();
    const nameEl = getEl('profile-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) { showNotification('Profile name required', 'error'); return; }

    // If assign checkbox unchecked, ignore selected proxy
    const proxyId = (getEl('new-profile-assign-checkbox') && getEl('new-profile-assign-checkbox').checked) ? (getEl('new-profile-proxy-select') ? getEl('new-profile-proxy-select').value : null) : null;

    try {
        const body = proxyId ? { name, proxyId } : { name };
        const resp = await fetch('/api/profiles', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (data && data.success) {
            showNotification('Profile created successfully', 'success');
            const nm = getEl('new-profile-modal'); if (nm) nm.style.display = 'none';
            if (nameEl) nameEl.value = '';
            await loadProfiles();
        } else {
            showNotification(data.error || 'Failed to create profile', 'error');
        }
    } catch (err) {
        console.error('Create profile error', err);
        showNotification('Failed to create profile', 'error');
    }
});

// Header buttons: create / import / proxy manager / cleanup / refresh
safeOn('create-dropdown-btn', 'click', (e) => {
    // toggle dropdown menu visibility
    const dd = getEl('create-dropdown');
    if (!dd) return;
    dd.classList.toggle('open');
});

safeOn('menu-new-profile', 'click', async () => {
    await loadProxiesIntoSelect(getEl('new-profile-proxy-select'));
    showModal('new-profile-modal');
});

safeOn('menu-ephemeral', 'click', async () => {
    // populate ephemeral proxy select
    const select = getEl('ephemeral-proxy-select');
    if (select) {
        select.innerHTML = '<option value="">(no proxy)</option>';
        try {
            const resp = await fetch('/api/proxies');
            const j = await resp.json();
            const list = (j && j.proxies) ? j.proxies : [];
            for (const p of list) {
                const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.host}:${p.port}${p.tags && p.tags.length ? ' ['+p.tags.join(',')+']' : ''}`; select.appendChild(opt);
            }
        } catch (e) { console.error('Failed to load proxies for ephemeral', e); }
    }
    const em = getEl('ephemeral-modal'); if (em) em.style.display = 'block';
});

safeOn('import-dropdown-btn', 'click', (e) => {
    const dd = getEl('import-dropdown'); if (!dd) return; dd.classList.toggle('open');
});

// Bind Proxy Manager header button (previously inline onclick caused openProxyManager not defined error)
safeOn('open-proxy-manager-btn', 'click', () => {
    try { window.openProxyManager(); } catch (e) { console.error('openProxyManager failed', e); }
});

// Open file input when user clicks Import Profiles menu
safeOn('menu-import-profiles', 'click', () => {
    const fi = getEl('profiles-file-input'); if (fi) fi.click();
});

// Parse uploaded profiles file and show import preview
safeOn('profiles-file-input', 'change', async (e) => {
    const input = e.target;
    if (!input || !input.files || input.files.length === 0) return;
    const file = input.files[0];
    const text = await file.text();

    // Normalize line endings
    const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
        showNotification('No lines found in file', 'error');
        return;
    }

    // Detect delimiter (comma, semicolon, tab, pipe) by checking first non-empty line
    const first = lines[0];
    let delimiter = ',';
    if (first.includes('\t')) delimiter = '\t';
    else if (first.includes(';')) delimiter = ';';
    else if (first.includes('|')) delimiter = '|';
    else delimiter = ',';

    // If header present (contains name or profile), skip it
    const header = lines[0].toLowerCase();
    let startIndex = 0;
    if (header.includes('name') || header.includes('profile') || header.includes('profileName'.toLowerCase())) startIndex = 1;

    const parsed = [];
    for (let i = startIndex; i < lines.length; i++) {
        const l = lines[i];
        const parts = l.split(new RegExp(delimiter));
        // Trim parts
        const cols = parts.map(p => p.trim());
        // At minimum must have name or profile
        if (cols.length === 0) continue;
        let name = cols[0] || '';
        let proxy = cols[1] || '';
        // If the line is like host:port with no explicit profile name, create a generated name
        if (!name && proxy) {
            name = `imported_${i}`;
        }
        if (!name) continue;
        const item = { name };
        if (proxy) {
            // If proxy looks like an id (starts with _ or numeric) or contains host:port, pass as proxy string
            item.proxy = proxy;
        }
        parsed.push(item);
    }

    // Populate preview modal
    const countEl = getEl('import-preview-count'); if (countEl) countEl.textContent = `${parsed.length} profiles parsed`;
    const table = getEl('import-preview-table'); if (table) {
        // Build header
        const headerRow = `<tr><th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0">Name</th><th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0">Proxy</th></tr>`;
        const rows = parsed.map(p => `<tr><td style="padding:6px;border-bottom:1px solid #f1f5f9">${escapeHtml(p.name)}</td><td style="padding:6px;border-bottom:1px solid #f1f5f9">${escapeHtml(p.proxy||'')}</td></tr>`).join('');
        table.innerHTML = headerRow + rows;
    }

    // Store parsed on the window for confirm handler
    window.__importParsedProfiles = parsed;

    // Show preview modal
    const im = getEl('import-preview-modal'); if (im) im.style.display = 'block';

    // Reset input value so selecting same file again will trigger change
    input.value = '';
});

// Confirm import (send to server)
safeOn('confirm-import-btn', 'click', async () => {
    const toImport = window.__importParsedProfiles || [];
    if (!Array.isArray(toImport) || toImport.length === 0) { showNotification('No profiles parsed', 'error'); return; }
    try {
        const resp = await fetch('/api/profiles/import', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ profiles: toImport }) });
        const data = await resp.json();
        if (data && data.success) {
            showNotification(`Imported ${data.results ? data.results.filter(r=>r.success).length : toImport.length}/${toImport.length}`, 'success');
            const im = getEl('import-preview-modal'); if (im) im.style.display = 'none';
            // clear preview
            const table = getEl('import-preview-table'); if (table) table.innerHTML = '';
            const countEl = getEl('import-preview-count'); if (countEl) countEl.textContent = '0 profiles parsed';
            window.__importParsedProfiles = [];
            // reload profiles list
            await loadProfiles();
        } else {
            showNotification(data.error || 'Import failed', 'error');
        }
    } catch (e) {
        console.error('Confirm import failed', e);
        showNotification('Import request failed', 'error');
    }
});

// Cancel import preview
safeOn('cancel-import-btn', 'click', () => {
    const im = getEl('import-preview-modal'); if (im) im.style.display = 'none';
    window.__importParsedProfiles = [];
    const table = getEl('import-preview-table'); if (table) table.innerHTML = '';
    const countEl = getEl('import-preview-count'); if (countEl) countEl.textContent = '0 profiles parsed';
});

// Small helper: escape html for table
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

// The following direct listeners were duplicated and could throw in some layouts. They are now handled via safeOn wrappers above.
// Remove leftover direct listeners to avoid runtime errors.

/* START-REMOVE-DUPLICATE-LISTENERS */
// removed: document.getElementById('test-proxy-btn').addEventListener(...)
// removed: document.getElementById('regenerate-fp-btn').addEventListener(...)
// removed: document.getElementById('close-fp-modal-btn').addEventListener(...)
// removed: proxyForm.addEventListener('submit', ...)
// removed: newProfileBtn.addEventListener('click', ...)
// removed: newProfileForm.addEventListener('submit', ...)
/* END-REMOVE-DUPLICATE-LISTENERS */

// Provide global fallback for inline onclick="openProxyManager()" in index.html
window.openProxyManager = function() {
    try {
        if (window.ipcRenderer && window.ipcRenderer.invoke) {
            window.ipcRenderer.invoke('open-proxy-manager');
            return;
        }
    } catch (e) {}
    window.open('/proxy-manager.html', '_blank');
};

// Debugging hooks: log load and capture global errors to help diagnose why UI may be frozen
try {
    console.log('[app.js] loaded');
} catch (e) {}

window.addEventListener('error', function (ev) {
    try {
        console.error('[app.js] window error:', ev && ev.message ? ev.message : ev);
    } catch (e) {}
});
window.addEventListener('unhandledrejection', function (ev) {
    try {
        console.error('[app.js] unhandledrejection:', ev && ev.reason ? ev.reason : ev);
    } catch (e) {}
});

// Ensure app initializes after DOM is ready: add initApp and attach to DOMContentLoaded or run immediately if already loaded
function initApp() {
    try {
        console.log('[app.js] initApp starting, pending handlers=', __pendingHandlers.length);
        // rebind DOM refs now that DOM is ready
        profilesGrid = getEl('profiles-grid');
        searchInput = getEl('search-input');
        filterStatus = getEl('filter-status');
        filterProxy = getEl('filter-proxy');
        selectedCountSpan = getEl('selected-count');
        bulkActionsDiv = getEl('bulk-actions');
        // Attach some listeners to inputs for live filtering
        const si = getEl('search-input'); if (si) si.addEventListener('input', renderProfiles);
        const fs = getEl('filter-status'); if (fs) fs.addEventListener('change', renderProfiles);
        const fp = getEl('filter-proxy'); if (fp) fp.addEventListener('change', renderProfiles);

        // Attach any pending handlers queued before DOM ready
        for (const h of __pendingHandlers) {
            try {
                const el = getEl(h.id);
                if (el) {
                    el.addEventListener(h.event, h.handler);
                    console.log('[app.js] attached pending handler for', h.id);
                } else {
                    console.warn('[app.js] pending handler element not found:', h.id);
                }
            } catch (e) {
                console.error('[app.js] error attaching pending handler for', h.id, e);
            }
        }

        loadProfiles();
        // periodic refresh
        setInterval(loadProfiles, 5000);

        console.log('[app.js] initApp finished');
    } catch (e) {
        console.error('initApp error', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
