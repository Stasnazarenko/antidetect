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
    if (el) {
        // Make modal visible and interactive
        el.style.display = 'block';
        el.style.pointerEvents = 'auto';
        // ensure modal-content also accepts pointer events
        const content = el.querySelector('.modal-content');
        if (content) content.style.pointerEvents = 'auto';
        // autofocus first input in modal to improve UX
        try {
            const firstInput = el.querySelector('input, button, select, textarea');
            if (firstInput && typeof firstInput.focus === 'function') {
                setTimeout(() => { try { firstInput.focus(); } catch (e) {} }, 50);
            }
        } catch (e) { /* ignore */ }
    }
}
function hideModal(id) {
    const el = getEl(id);
    if (el) {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        const content = el.querySelector('.modal-content'); if (content) content.style.pointerEvents = 'none';
    }
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

            // Immediately add a local placeholder so the UI reflects the new profile without a full reload
            try {
                const exists = profiles.find(p => p.name === name);
                if (!exists) {
                    profiles.unshift({ name: name, open: false, proxy: false, proxyType: 'http', fingerprint: false, proxyInfo: null });
                    updateStats();
                    renderProfiles();
                }
            } catch (e) { console.warn('Immediate local insert failed', e); }

            // close the new-profile modal explicitly and any overlays
            closeAllModals();
            closeAllDropdowns();
            restoreHeaderInteraction();

            // re-sync with server after a short delay to pick up canonical data
            setTimeout(async () => {
                if (nameEl) nameEl.value = '';
                await loadProfiles();
                try { renderProfiles(); } catch(e) {}
            }, 900);
        } else {
            showNotification(data && (data.error || data.message) ? (data.error || data.message) : 'Failed to create profile', 'error');
            console.debug('[app.js] create profile response', data);
        }
    } catch (err) {
        console.error('Create profile error', err);
        showNotification('Failed to create profile', 'error');
    }
});

// Header buttons: create / import / proxy manager / cleanup / refresh
safeOn('create-dropdown-btn', 'click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    // close import/advanced dropdowns first
    const importDd = getEl('import-dropdown'); if (importDd) importDd.classList.remove('open');
    const advDd = getEl('advanced-dropdown'); if (advDd) advDd.classList.remove('open');
    const dd = getEl('create-dropdown'); if (!dd) return; dd.classList.toggle('open');
    console.debug('[app.js] create-dropdown open?', dd.classList.contains('open'));
    // debug current open dropdowns
    console.debug('[app.js] open dropdowns:', Array.from(document.querySelectorAll('.dropdown.open')).map(d=>d.id));
});

safeOn('import-dropdown-btn', 'click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const createDd = getEl('create-dropdown'); if (createDd) createDd.classList.remove('open');
    const advDd = getEl('advanced-dropdown'); if (advDd) advDd.classList.remove('open');
    const dd = getEl('import-dropdown'); if (!dd) return; dd.classList.toggle('open');
    console.debug('[app.js] import-dropdown open?', dd.classList.contains('open'));
    console.debug('[app.js] open dropdowns:', Array.from(document.querySelectorAll('.dropdown.open')).map(d=>d.id));
});

safeOn('advanced-dropdown-btn', 'click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const createDd = getEl('create-dropdown'); if (createDd) createDd.classList.remove('open');
    const importDd = getEl('import-dropdown'); if (importDd) importDd.classList.remove('open');
    const dd = getEl('advanced-dropdown'); if (!dd) return; dd.classList.toggle('open');
    console.debug('[app.js] advanced-dropdown open?', dd.classList.contains('open'));
    console.debug('[app.js] open dropdowns:', Array.from(document.querySelectorAll('.dropdown.open')).map(d=>d.id));
});

// Ensure new-profile submit closes modals and dropdowns reliably on success
// (Single handler - handles create, closes modals, reloads profiles)
safeOn('new-profile-form', 'submit', async (e) => {
    e.preventDefault();
    const nameEl = getEl('profile-name');
    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) { showNotification('Profile name required', 'error'); return; }

    const proxyId = (getEl('new-profile-assign-checkbox') && getEl('new-profile-assign-checkbox').checked) ? (getEl('new-profile-proxy-select') ? getEl('new-profile-proxy-select').value : null) : null;

    try {
        const body = proxyId ? { name, proxyId } : { name };
        const resp = await fetch('/api/profiles', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await resp.json();
        if (data && data.success) {
            showNotification('Profile created successfully', 'success');
            // close the new-profile modal explicitly and any overlays
            closeAllModals();
            closeAllDropdowns();
            restoreHeaderInteraction();
            // give server/DB more time then reload profiles and render
            setTimeout(async () => {
                if (nameEl) nameEl.value = '';
                await loadProfiles();
                try { renderProfiles(); } catch(e) {}
            }, 900);
        } else {
            showNotification(data.error || 'Failed to create profile', 'error');
            console.debug('[app.js] create profile response', data);
        }
    } catch (err) {
        console.error('Create profile error', err);
        showNotification('Failed to create profile', 'error');
    }
});

// Dropdown helpers: close all dropdowns and toggle
function closeAllDropdowns() {
    const dds = document.querySelectorAll('.dropdown');
    dds.forEach(dd => dd.classList.remove('open'));
}

// Safer dropdown outside click handler and delegation for items
(function setupDropdownBehavior(){
    // Close dropdown when clicking outside: use closest to detect if inside a dropdown
    document.addEventListener('click', (e) => {
        const insideDropdown = !!e.target.closest('.dropdown');
        if (!insideDropdown) closeAllDropdowns();
    });

    // Close dropdown after clicking any .dropdown .item
    document.addEventListener('click', (e) => {
        const item = e.target.closest('.item');
        if (item && item.closest('.dropdown')) {
            const dd = item.closest('.dropdown');
            if (dd) dd.classList.remove('open');
        }
    });
})();

// Ensure dropdowns close after selecting an item
safeOn('menu-new-profile', 'click', async (e) => {
    // existing handler logic runs (attached earlier), just close dropdown
    const dd = getEl('create-dropdown'); if (dd) dd.classList.remove('open');
});
safeOn('menu-ephemeral', 'click', async (e) => {
    const dd = getEl('create-dropdown'); if (dd) dd.classList.remove('open');
});
safeOn('menu-import-profiles', 'click', (e) => {
    const dd = getEl('import-dropdown'); if (dd) dd.classList.remove('open');
});
safeOn('menu-template', 'click', (e) => {
    const dd = getEl('import-dropdown'); if (dd) dd.classList.remove('open');
    // Trigger template download or show instructions
    // For now, open template file in new tab
    window.open('/template.csv', '_blank');
});

// Bind Cleanup and Refresh buttons
safeOn('cleanup-btn', 'click', async () => {
    try {
        const resp = await fetch('/api/cleanup', { method: 'POST' });
        const data = await resp.json();
        if (data && data.success) {
            showNotification(`Cleanup finished: cleaned ${data.cleaned || 0}`, 'success');
            await loadProfiles();
        } else {
            showNotification(data.error || 'Cleanup failed', 'error');
        }
    } catch (e) {
        console.error('Cleanup error', e);
        showNotification('Cleanup request failed', 'error');
    }
});

// Remove any direct references to refresh-btn by making sure safeOn('refresh-btn', ...) no longer throws
// Add handler for advanced cleanup menu item
safeOn('menu-cleanup', 'click', async () => {
    // Close any open dropdowns safely
    const dd = getEl('advanced-dropdown'); if (dd) dd.classList.remove('open');
    try {
        const res = await fetch('/api/cleanup', { method: 'POST' });
        const data = await res.json();
        if (data && data.success) {
            showNotification(`Cleanup finished: cleaned ${data.cleaned || 0}`, 'success');
            await loadProfiles();
        } else {
            showNotification((data && data.error) || 'Cleanup failed', 'error');
        }
    } catch (e) {
        console.error('menu-cleanup error', e);
        showNotification('Cleanup request failed', 'error');
    }
});

// Hide the old refresh button if present (safety)
const oldRefresh = getEl('refresh-btn'); if (oldRefresh) oldRefresh.style.display = 'none';
// Hide direct cleanup-btn (we moved it into Advanced menu)
const oldCleanup = getEl('cleanup-btn'); if (oldCleanup) oldCleanup.style.display = 'none';

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

        // Ensure ephemeral radios are attached on init
        // (move these calls into initApp to avoid DOM timing issues)
        attachEphemeralRadios();
        updateEphemeralSelectVisibility();

        // attach strong header captures now that DOM is ready
        try { attachStrongHeaderCaptures(); } catch(e) { console.warn('attachStrongHeaderCaptures failed at init', e); }
        // register header delegation to ensure menu items work
        try { registerHeaderDelegation(); } catch (e) { console.warn('registerHeaderDelegation failed at init', e); }

        loadProfiles();
        // periodic refresh
        setInterval(loadProfiles, 5000);

        // Safety check: detect if header area is covered by any element that blocks clicks
        try {
            const headerEl = document.querySelector('header');
            if (headerEl) {
                const r = headerEl.getBoundingClientRect();
                // sample several points across header to be robust
                const samples = 5;
                for (let i = 0; i < samples; i++) {
                    const sampleX = Math.round(r.left + (r.width * (i + 0.5) / samples));
                    const sampleY = Math.round(r.top + r.height / 2);
                    const topEl = document.elementFromPoint(sampleX, sampleY);
                    if (topEl && !headerEl.contains(topEl) && topEl !== headerEl) {
                        console.warn('[UI] Header appears to be overlapped by:', topEl, 'at point', sampleX, sampleY);
                        try { console.warn('[UI] topEl computed styles:', getComputedStyle(topEl)); } catch(e){}

                        // If it's a modal overlay or modal-content, try to hide it (recoverable action)
                        const modal = topEl.closest('.modal');
                        if (modal) {
                            console.info('[UI] Attempting to hide blocking modal:', modal);
                            try {
                                modal.style.display = 'none';
                                // also remove any inline overlay opacity/pointer events and mark for restoration
                                modal.style.pointerEvents = 'none';
                                modal.setAttribute('data-temp-disabled', 'true');
                                // give header priority
                                headerEl.style.zIndex = '1000000';
                                headerEl.style.pointerEvents = 'auto';
                                console.info('[UI] Hidden modal to restore header interaction');
                            } catch (e) {
                                console.error('[UI] Failed to hide modal', e);
                            }
                            break; // after fixing one sample re-evaluate later
                        }

                        // If blocking element is not modal but has high z-index, try to disable its pointer events
                        try {
                            const cs = getComputedStyle(topEl);
                            const z = parseInt(cs.zIndex) || 0;
                            if (z > 0) {
                                console.info('[UI] Temporarily disabling pointer-events on blocking element to recover header clicks');
                                topEl.style.pointerEvents = 'none';
                                // mark for restore later
                                try { topEl.setAttribute('data-temp-disabled','true'); } catch(e){}
                                // ensure header receives clicks
                                headerEl.style.zIndex = '1000000';
                                headerEl.style.pointerEvents = 'auto';
                                break;
                            }
                        } catch (e) { console.error('[UI] error while trying to disable blocking element', e); }
                    } else {
                        console.log('[UI] Header area sample not overlapped. topEl:', topEl);
                    }
                }
            }
        } catch (e) { console.error('Header overlap detection failed', e); }

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

// Ephemeral modal handlers
safeOn('ephemeral-cancel-btn', 'click', () => {
    const em = getEl('ephemeral-modal'); if (em) em.style.display = 'none';
});

// Show/hide ephemeral select based on radio option
function updateEphemeralSelectVisibility() {
    const radios = document.getElementsByName('ephemeral-proxy-option');
    const select = getEl('ephemeral-proxy-select');
    if (!radios || !select) return;
    let selected = 'none';
    for (const r of radios) if (r.checked) selected = r.value;
    if (selected === 'choose') select.style.display = 'block';
    else select.style.display = 'none';
}

// Attach change listeners to ephemeral radio buttons (deferred attach in initApp too)
function attachEphemeralRadios() {
    const radios = document.getElementsByName('ephemeral-proxy-option');
    if (!radios) return;
    for (const r of radios) {
        r.addEventListener('change', updateEphemeralSelectVisibility);
    }
}

safeOn('ephemeral-launch-btn', 'click', async () => {
    const resultDiv = getEl('ephemeral-result'); if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.innerHTML = '<div class="loader"></div> Launching...'; }
    try {
        const radios = document.getElementsByName('ephemeral-proxy-option');
        let choice = 'none';
        for (const r of radios) if (r.checked) choice = r.value;

        let payload = {};
        if (choice === 'none') {
            // no proxy -> empty payload
        } else if (choice === 'random') {
            // pick a random saved proxy client-side
            const resp = await fetch('/api/proxies');
            const j = await resp.json();
            const list = (j && j.proxies) ? j.proxies : [];
            if (!Array.isArray(list) || list.length === 0) {
                if (resultDiv) resultDiv.innerHTML = '<div style="background:#fed7d7;padding:10px;border-radius:6px;">❌ No saved proxies to pick randomly</div>';
                return;
            }
            const idx = Math.floor(Math.random() * list.length);
            const picked = list[idx];
            payload.proxyId = picked.id || `${picked.host}:${picked.port}`;
        } else if (choice === 'choose') {
            const select = getEl('ephemeral-proxy-select');
            if (select && select.value) payload.proxyId = select.value;
            else {
                if (resultDiv) resultDiv.innerHTML = '<div style="background:#fed7d7;padding:10px;border-radius:6px;">❌ Choose a proxy or select another option</div>';
                return;
            }
        }

        const resp2 = await fetch('/api/profiles/ephemeral', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
        const data = await resp2.json();
        if (data && data.success) {
            if (resultDiv) resultDiv.innerHTML = `<div style="background:#c6f6d5;padding:10px;border-radius:6px;">✅ Launched ephemeral: ${data.ephemeral}</div>`;
            // hide modal after short delay
            setTimeout(() => { const em = getEl('ephemeral-modal'); if (em) em.style.display = 'none'; }, 900);
        } else {
            if (resultDiv) resultDiv.innerHTML = `<div style="background:#fed7d7;padding:10px;border-radius:6px;">❌ ${data && data.error ? data.error : 'Failed to launch'}</div>`;
        }
    } catch (e) {
        console.error('Ephemeral launch error', e);
        const resultDiv2 = getEl('ephemeral-result'); if (resultDiv2) resultDiv2.innerHTML = `<div style="background:#fed7d7;padding:10px;border-radius:6px;">❌ ${e && e.message ? e.message : String(e)}</div>`;
    }
});

// Simple toast notification helper used across UI (was missing and caused ReferenceError)
function ensureNotificationsContainer() {
    let container = document.getElementById('notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications-container';
        // minimal styling so toasts are visible
        container.style.position = 'fixed';
        container.style.top = '16px';
        container.style.right = '16px';
        container.style.zIndex = 200000;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        document.body.appendChild(container);
    }
    return container;
}

function showNotification(message, type = 'info') {
    try {
        const container = ensureNotificationsContainer();
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        // style per type
        notif.style.padding = '10px 12px';
        notif.style.borderRadius = '8px';
        notif.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
        notif.style.color = '#0f172a';
        notif.style.fontSize = '13px';
        notif.style.maxWidth = '360px';
        notif.style.wordBreak = 'break-word';
        if (type === 'error') {
            notif.style.background = '#fed7d7';
            notif.style.border = '1px solid #fca5a5';
        } else if (type === 'success') {
            notif.style.background = '#c6f6d5';
            notif.style.border = '1px solid #86efac';
        } else {
            notif.style.background = '#e2e8f0';
            notif.style.border = '1px solid #cbd5e1';
        }
        container.appendChild(notif);
        // auto-remove
        setTimeout(() => {
            try { notif.remove(); } catch(e){}
        }, 3600);
    } catch (e) {
        console.error('showNotification failed', e);
    }
}

// Strong capture-phase helper (now capture-only logger) to ensure clicks reach UI early without toggling
function attachStrongHeaderCaptures() {
    try {
        const ids = ['create-dropdown-btn','import-dropdown-btn','advanced-dropdown-btn','open-proxy-manager-btn'];
        for (const id of ids) {
            const el = getEl(id);
            if (!el) continue;
            if (el._strongCapture) continue;
            // capture-only: log early, do not prevent default or toggle
            el.addEventListener('click', (ev) => {
                try { console.debug('[app.js][capture-only] click on', id); } catch(e){}
                // intentionally do not call stopImmediatePropagation or preventDefault;
                // let bubble-phase handlers (safeOn) handle the action
            }, true);
            el._strongCapture = true;
        }
    } catch (e) { console.error('attachStrongHeaderCaptures failed', e); }
}

// call moved into initApp to ensure DOM is ready

// Global capture: if user clicks inside header area but top element isn't header (blocked by overlay), hide/disable it so header buttons work
document.addEventListener('click', function captureHeaderClicks(e) {
    try {
        const header = document.querySelector('header');
        if (!header) return;
        const rect = header.getBoundingClientRect();
        const x = e.clientX, y = e.clientY;
        if (x == null || y == null) return;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            const topEl = document.elementFromPoint(x, y);
            if (topEl && !header.contains(topEl)) {
                // If it's a modal or overlay, hide it
                const modal = topEl.closest('.modal');
                if (modal && modal.style.display !== 'none') {
                    console.debug('[app.js] capture: hiding blocking modal to allow header click', modal);
                    modal.style.display = 'none';
                    modal.style.pointerEvents = 'none';
                    modal.setAttribute('data-temp-disabled','true');
                    // prevent the original event from propagating further (we handled overlay)
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }
                // If not a modal, but element has high z-index, disable its pointer-events temporarily
                try {
                    const cs = getComputedStyle(topEl);
                    const z = parseInt(cs.zIndex) || 0;
                    if (z > 1000) {
                        console.debug('[app.js] capture: disabling pointer-events on blocking element', topEl);
                        topEl.style.pointerEvents = 'none';
                        try { topEl.setAttribute('data-temp-disabled','true'); } catch(e){}
                        header.style.zIndex = '1000000';
                        header.style.pointerEvents = 'auto';
                        // prevent original click from acting on the overlay
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                } catch (err) { /* ignore */ }
            }
        }
    } catch (err) { console.error('captureHeaderClicks error', err); }
}, true);

// Ensure header/action buttons always accept pointer events and are on top
(function ensureHeaderButtonsInteractive(){
    try {
        const btns = ['create-dropdown-btn','import-dropdown-btn','advanced-dropdown-btn','open-proxy-manager-btn'];
        for (const id of btns) {
            const el = getEl(id);
            if (!el) continue;
            el.style.pointerEvents = 'auto';
            el.style.zIndex = '1000001';
        }
    } catch(e){ console.error('ensureHeaderButtonsInteractive failed', e); }
})();

// central handler for header item actions (reusable)
async function handleHeaderActionById(id) {
    try {
        // hide any visible modals/overlays that may block clicks
        try {
            document.querySelectorAll('.modal').forEach(m => {
                try {
                    if (getComputedStyle(m).display !== 'none') {
                        m.style.display = 'none';
                        m.style.pointerEvents = 'none';
                    }
                } catch(e) {}
            });
            // also remove any top-level overlay elements commonly used
            const overlays = document.querySelectorAll('.overlay, .modal-backdrop');
            overlays.forEach(o => { try { o.style.display = 'none'; o.style.pointerEvents = 'none'; } catch(e){} });
        } catch(e) { console.warn('pre-clean overlays failed', e); }

        closeAllDropdowns();

        // visual flash so user sees handler activation
        try {
            const headerEl = document.querySelector('header');
            if (headerEl) {
                const prev = headerEl.style.boxShadow;
                headerEl.style.boxShadow = '0 0 0 4px rgba(0,128,0,0.12)';
                setTimeout(() => { try { headerEl.style.boxShadow = prev; } catch(e){} }, 350);
            }
        } catch(e){}

        console.debug('[app.js] handleHeaderActionById triggered for', id);

        if (id === 'menu-new-profile') {
            try { await loadProxiesIntoSelect(getEl('new-profile-proxy-select')); } catch(e){}
            showModal('new-profile-modal');
            return;
        }
        if (id === 'menu-ephemeral') {
            const select = getEl('ephemeral-proxy-select');
            if (select) {
                select.innerHTML = '<option value="">(no proxy)</option>';
                try {
                    const resp = await fetch('/api/proxies'); const j = await resp.json(); const list = (j && j.proxies) ? j.proxies : [];
                    for (const p of list) { const opt = document.createElement('option'); opt.value = p.id || `${p.host}:${p.port}`; opt.textContent = `${p.host}:${p.port}${p.tags && p.tags.length ? ' ['+p.tags.join(',')+']' : ''}`; select.appendChild(opt); }
                } catch(e) { console.error('Failed to load proxies for ephemeral', e); }
            }
            showModal('ephemeral-modal');
            return;
        }
        if (id === 'menu-import-profiles') { const fi = getEl('profiles-file-input'); if (fi) fi.click(); return; }
        if (id === 'menu-template') { window.open('/template.csv', '_blank'); return; }
        if (id === 'menu-cleanup') {
            try { const res = await fetch('/api/cleanup', { method: 'POST' }); const data = await res.json(); if (data && data.success) showNotification(`Cleanup finished: cleaned ${data.cleaned || 0}`, 'success'); else showNotification((data && data.error) || 'Cleanup failed', 'error'); await loadProfiles(); } catch(e){ console.error('Cleanup request failed', e); showNotification('Cleanup request failed','error'); }
            return;
        }
        if (id === 'open-proxy-manager-btn') { window.open('/proxy-manager.html', '_blank'); return; }
    } catch (err) { console.error('handleHeaderActionById error', err); }
}

// Attach per-item fallback handlers using safeOn to ensure clicks trigger actions even if delegation fails
const headerItemIds = ['menu-new-profile','menu-ephemeral','menu-import-profiles','menu-template','menu-cleanup','open-proxy-manager-btn'];
for (const hid of headerItemIds) {
    (function(id){
        safeOn(id, 'click', (e) => {
            try { if (e && e.stopPropagation) { e.stopPropagation(); e.preventDefault(); } } catch(_){}
            handleHeaderActionById(id);
        });
    })(hid);
}

// Ensure delegated handler uses the central handler
function registerHeaderDelegation() {
    try {
        const header = document.querySelector('header');
        if (!header) return console.warn('[app.js] header not found for delegation');

        header.addEventListener('click', async (ev) => {
            const item = ev.target.closest('.item');
            if (!item) return;
            ev.preventDefault(); ev.stopPropagation();
            const id = item.id;
            console.debug('[app.js] header delegated click:', id);
            await handleHeaderActionById(id);
        }, true);

        console.debug('[app.js] header menu delegation registered');
    } catch (err) {
        console.error('registerHeaderDelegation failed', err);
    }
}

// Additional fallback: document-level listener for any `.item` clicks to ensure actions always fire
document.addEventListener('click', function(ev) {
    try {
        const item = ev.target.closest && ev.target.closest('.item');
        if (!item) return;
        // prevent other handlers from suppressing
        ev.preventDefault(); ev.stopPropagation();
        const id = item.id;
        if (!id) return;
        console.debug('[app.js] document fallback click for item', id);
        handleHeaderActionById(id);
    } catch (e) { /* ignore */ }
}, true);

// Direct fallback for proxy manager button (in case id-based safeOn didn't attach)
(function attachProxyBtnFallback(){
    try {
        const btn = getEl('open-proxy-manager-btn');
        if (!btn) return;
        if (btn._pmAttached) return;
        btn.addEventListener('click', (e) => { try { e.preventDefault(); e.stopPropagation(); handleHeaderActionById('open-proxy-manager-btn'); } catch(err){} });
        btn._pmAttached = true;
    } catch(e) { console.error('attachProxyBtnFallback failed', e); }
})();

// Close all modal helper (used in several places)
function closeAllModals() {
    try {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => {
            try { m.style.display = 'none'; m.style.pointerEvents = 'none'; } catch(e){}
        });
        // also remove any modal-backdrop/overlay elements if present
        const backs = document.querySelectorAll('.modal-backdrop, .overlay');
        backs.forEach(b => { try { b.style.display = 'none'; b.style.pointerEvents = 'none'; } catch(e){} });
    } catch (e) { console.warn('closeAllModals failed', e); }
}

// Restore header interaction if previously disabled by overlay-fixes
function restoreHeaderInteraction() {
    try {
        const headerEl = document.querySelector('header');
        if (headerEl) {
            headerEl.style.zIndex = '';
            headerEl.style.pointerEvents = 'auto';
            headerEl.style.boxShadow = '';
        }
        // re-enable pointer events for any elements we temporarily disabled earlier
        document.querySelectorAll('[data-temp-disabled="true"]').forEach(el => {
            try { el.style.pointerEvents = ''; el.removeAttribute('data-temp-disabled'); } catch(e){}
        });
    } catch(e) { console.warn('restoreHeaderInteraction failed', e); }
}
