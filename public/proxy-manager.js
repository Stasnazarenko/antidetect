const socket = io();

let proxies = [];
let currentProxy = null;
let pendingAssignProxyId = null;
let profilesList = [];

// --- Safe DOM helpers ---
function getEl(id) { return document.getElementById(id) || null; }
function safeOn(id, event, handler) { const el = getEl(id); if (el) el.addEventListener(event, handler); }

// Modal helpers to ensure modals are displayed centered (use display:flex)
function showModal(idOrEl) {
    const el = (typeof idOrEl === 'string') ? getEl(idOrEl) : idOrEl;
    if (!el) return;
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.pointerEvents = 'auto';
}
function hideModal(idOrEl) {
    const el = (typeof idOrEl === 'string') ? getEl(idOrEl) : idOrEl;
    if (!el) return;
    el.style.display = 'none';
    el.style.pointerEvents = 'none';
}

// IPC API for Electron
const { ipcRenderer } = window;

async function fetchProxies() {
    // If in Electron, use IPC
    if (window.ipcRenderer && window.ipcRenderer.invoke) {
        return await window.ipcRenderer.invoke('get-proxies');
    }
    // Web: call server API
    try {
        const resp = await fetch('/api/proxies');
        const json = await resp.json();
        if (json && json.success) return json.proxies || [];
        return [];
    } catch (e) {
        console.error('Failed to fetch proxies via API', e);
        return [];
    }
}

async function saveProxy(proxy) {
    if (window.ipcRenderer && window.ipcRenderer.invoke) {
        await window.ipcRenderer.invoke('add-proxy', proxy);
        if (window.ipcRenderer.send) window.ipcRenderer.send('proxies-updated');
        return;
    }

    // Web: POST to /api/proxies
    try {
        const resp = await fetch('/api/proxies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proxy)
        });
        const json = await resp.json();
        if (!json.success) throw new Error(json.error || 'Failed to save proxy');
    } catch (e) {
        console.error('Failed to save proxy via API', e);
        throw e;
    }
}

async function removeProxy(id) {
    if (window.ipcRenderer && window.ipcRenderer.invoke) {
        await window.ipcRenderer.invoke('delete-proxy', id);
        if (window.ipcRenderer.send) window.ipcRenderer.send('proxies-updated');
        return;
    }

    // Web: DELETE /api/proxies/:id
    try {
        const resp = await fetch(`/api/proxies/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const json = await resp.json();
        if (!json.success) throw new Error(json.error || 'Failed to delete proxy');
    } catch (e) {
        console.error('Failed to delete proxy via API', e);
        throw e;
    }
}

// Завантажити проксі з localStorage
function loadProxies() {
    const stored = localStorage.getItem('proxies');
    if (stored) {
        proxies = JSON.parse(stored);
    }
    updateStats();
    renderProxies();
}

// Зберегти проксі
function saveProxies() {
    localStorage.setItem('proxies', JSON.stringify(proxies));
}

// Оновити статистику
function updateStats() {
    const total = proxies.length;
    const active = proxies.filter(p => p.status === 'active').length;
    const failed = proxies.filter(p => p.status === 'failed').length;

    const totalEl = getEl('total-proxies'); if (totalEl) totalEl.textContent = total;
    const activeEl = getEl('active-proxies'); if (activeEl) activeEl.textContent = active;
    const failedEl = getEl('failed-proxies'); if (failedEl) failedEl.textContent = failed;
}

// Відрендерити проксі
function renderProxies() {
    const searchEl = getEl('search-proxy');
    const statusEl = getEl('filter-status');
    const typeEl = getEl('filter-type');
    const tagEl = getEl('filter-tag');

    const searchTerm = (searchEl && searchEl.value) ? searchEl.value.toLowerCase() : '';
    const statusFilter = (statusEl && statusEl.value) ? statusEl.value : 'all';
    const typeFilter = (typeEl && typeEl.value) ? typeEl.value : 'all';
    const tagFilter = (tagEl && tagEl.value) ? tagEl.value.toLowerCase() : '';

    let filtered = proxies.filter(proxy => {
        const tags = proxy.tags || [];
        if (searchTerm && !((proxy.host||'').toLowerCase().includes(searchTerm) || (proxy.id||'').toLowerCase().includes(searchTerm))) return false;
        if (statusFilter !== 'all' && (proxy.status || 'inactive') !== statusFilter) return false;
        if (typeFilter !== 'all' && (proxy.type || 'http') !== typeFilter) return false;
        if (tagFilter && !tags.some(t => t.toLowerCase().includes(tagFilter))) return false;
        return true;
    });

    const container = getEl('proxies-list');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No proxies found</h3>
                <p>Add proxies to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(proxy => {
        const statusClass = `status-${proxy.status || 'inactive'}`;
        const statusText = {
            active: '✅ Active',
            failed: '❌ Failed',
            testing: '🔄 Testing',
            inactive: '⚫ Untested'
        }[proxy.status || 'inactive'];

        const assigned = computeAssignedTo(proxy);
        const assignedCount = assigned.length;
        const assignedListHtml = assignedCount ? `<div class="assigned-list" id="assigned-list-${proxy.id}" style="display:none; margin-top:6px; font-size:13px; color:#4a5568;">${assigned.map(n => `<div>• ${n}</div>`).join('')}</div>` : '';

        return `
            <div class="proxy-card" data-id="${proxy.id}">
                <div class="proxy-header">
                    <div>
                        <strong>${proxy.host || ''}:${proxy.port || ''}</strong>
                        <span style="color: #718096; margin-left: 10px;">${(proxy.type || 'http').toUpperCase()}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px">
                        ${assignedCount ? `<div class="assigned-badge">${assignedCount}</div>` : ''}
                        <div class="proxy-status ${statusClass}">${statusText}</div>
                    </div>
                </div>

                <div class="proxy-tags">
                    ${(proxy.tags || []).map(tag => `
                        <span class="tag">
                            ${tag}
                            <span class="remove" onclick="removeTag('${proxy.id}', '${tag}')">×</span>
                        </span>
                    `).join('')}
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" 
                            onclick="addTag('${proxy.id}')">+ Tag</button>
                </div>

                ${assignedCount ? `
                    <div style="margin-top:8px;">
                        <button class=\"btn btn-outline\" onclick=\"toggleAssignedList('${proxy.id}')\">Show assigned profiles</button>
                        ${assignedListHtml}
                    </div>
                ` : ''}

                ${proxy.testResult ? `
                    <div class="proxy-info">
                        ${proxy.testResult.ip ? `<div><strong>IP:</strong> ${proxy.testResult.ip}</div>` : ''}
                        ${proxy.testResult.location ? `<div><strong>Location:</strong> ${(proxy.testResult.location.city||'')}${(proxy.testResult.location.city && proxy.testResult.location.country) ? ', ' : ''}${(proxy.testResult.location.country||'')}</div>` : ''}
                        ${proxy.testResult.responseTime ? `<div><strong>Response:</strong> ${proxy.testResult.responseTime}</div>` : ''}
                        ${proxy.testResult.error ? `<div><strong>Error:</strong> ${proxy.testResult.error}</div>` : ''}
                    </div>
                ` : ''}
                
                <div class="proxy-actions">
                    <button class="btn btn-warning" onclick="testProxy('${proxy.id}')">🔍 Test</button>
                    <button class="btn btn-primary" onclick="assignToProfile('${proxy.id}')">👤 Assign to Profile</button>
                    <button class="btn btn-secondary" onclick="editProxy('${proxy.id}')">✏️ Edit</button>
                    <button class="btn btn-danger" onclick="deleteProxy('${proxy.id}')">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle assigned list visibility
function toggleAssignedList(proxyId) {
    const el = document.getElementById(`assigned-list-${proxyId}`);
    if (!el) return;
    el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

// Refresh both proxies and profiles
async function refreshData() {
    try {
        proxies = await fetchProxies();
        const resp = await fetch('/api/profiles');
        const j = await resp.json();
        if (j && j.success) profilesList = j.profiles || [];
        else profilesList = [];
    } catch (e) {
        console.error('Failed to refresh data', e);
        profilesList = [];
    }
}

// Helper to compute assignedTo if not present on proxy
function computeAssignedTo(proxy) {
    if (proxy.assignedTo && Array.isArray(proxy.assignedTo)) return proxy.assignedTo;
    const list = [];
    for (const p of profilesList) {
        try {
            if (p.proxy && typeof p.proxy === 'object') {
                if (p.proxy.id && p.proxy.id === proxy.id) list.push(p.name);
                else if (p.proxy.server && (p.proxy.server === `${proxy.host}:${proxy.port}` || (proxy.server && p.proxy.server === proxy.server))) list.push(p.name);
            } else if (typeof p.proxy === 'string') {
                let s = String(p.proxy).replace(/^(https?:\/\/|socks5?:\/\/)/i, '');
                if (s.includes('@')) s = s.split('@').pop();
                if (s.startsWith(proxy.host) && s.includes(String(proxy.port))) list.push(p.name);
            }
        } catch (e) {}
    }
    return list;
}

// Ensure modal close elements work in proxy manager too
Array.from(document.getElementsByClassName('close')).forEach(el => {
    el.addEventListener('click', () => {
        const modal = el.closest('.modal');
        if (modal) modal.style.display = 'none';
    });
});

// Форматування проксі-рядка для тесту (видалити схему, якщо є)
function formatProxyString(proxy) {
    let host = proxy.host.trim();
    // Видалити всі можливі схеми (http://, https://, socks5://, http:, https:, socks5:)
    host = host.replace(/^(http|https|socks5):\/\//i, '');
    while (/^(http|https|socks5):/i.test(host)) {
        host = host.replace(/^(http|https|socks5):/i, '');
    }
    // Якщо host містить ще раз схему всередині (наприклад, http://http://...), видалити всі повтори
    host = host.replace(/(http|https|socks5):\/\//gi, '');
    host = host.replace(/(http|https|socks5):/gi, '');
    // Якщо host містить пробіли або випадкові символи на початку/кінці, обрізати
    host = host.replace(/^\s+|\s+$/g, '');
    // Якщо host містить тільки ip:port:username, не додавати :undefined
    return [host, proxy.port, proxy.username || '', proxy.password || '', proxy.type].filter(Boolean).join(':');
}

// Додати проксі
safeOn('new-proxy-form', 'submit', async (e) => {
    e.preventDefault();

    const proxy = {
        id: Date.now().toString(),
        host: (getEl('proxy-host') && getEl('proxy-host').value) || '',
        port: (getEl('proxy-port') && getEl('proxy-port').value) || '',
        username: (getEl('proxy-username') && getEl('proxy-username').value) || '',
        password: (getEl('proxy-password') && getEl('proxy-password').value) || '',
        type: (getEl('proxy-type-select') && getEl('proxy-type-select').value) || 'http',
        tags: ((getEl('proxy-tags-input') && getEl('proxy-tags-input').value) ? getEl('proxy-tags-input').value.split(',').map(t => t.trim()).filter(t => t) : []),
        status: 'inactive',
        testResult: null,
        createdAt: new Date().toISOString()
    };

    try {
        await saveProxy(proxy);

        let fetched = await fetchProxies();
        if (fetched && fetched.proxies && Array.isArray(fetched.proxies)) proxies = fetched.proxies;
        else if (Array.isArray(fetched)) proxies = fetched;
        else if (fetched && fetched.data && Array.isArray(fetched.data.proxies)) proxies = fetched.data.proxies;
        else proxies = proxies || [];

        renderProxies();
        updateStats();

        const newProxyModal = getEl('new-proxy-modal'); if (newProxyModal) hideModal(newProxyModal);
        const newProxyForm = getEl('new-proxy-form'); if (newProxyForm) newProxyForm.reset();

        showNotification('Proxy added successfully', 'success');
    } catch (err) {
        console.error('Failed to save proxy', err);
        showNotification('Failed to save proxy: ' + (err && err.message ? err.message : 'unknown'), 'error');
    }
});

// Тестувати проксі
async function testProxy(id) {
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) return;

    // set testing state
    proxy.status = 'testing';
    renderProxies();

    try {
        // Call server endpoint to test by id
        const resp = await fetch(`/api/proxies/${encodeURIComponent(id)}/test`, { method: 'POST' });
        const data = await resp.json();

        if (data.success) {
            proxy.status = 'active';
            proxy.testResult = data;
            showNotification('Proxy test successful!', 'success');
        } else {
            proxy.status = 'failed';
            proxy.testResult = { error: data.error };
            if (data.error && data.error.includes('407')) {
                showNotification('Proxy test failed: 407 Proxy Authentication Required. Перевірте логін/пароль!', 'error');
            } else {
                showNotification('Proxy test failed', 'error');
            }
        }
    } catch (error) {
        proxy.status = 'failed';
        proxy.testResult = { error: error.message };
        showNotification('Proxy test error', 'error');
    }

    // refresh list from server to pick up persisted testResult/status
    try {
        proxies = await fetchProxies();
    } catch (e) {
        // fallback to local update
        try {
            if (proxy.id) {
                await fetch(`/api/proxies/${encodeURIComponent(proxy.id)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proxy)
                });
            }
        } catch (e2) {}
    }

    renderProxies();
    updateStats();
}

// Assign проксі до профілю
async function assignToProfile(proxyId) {
    openAssignModal(proxyId);
}

async function openAssignModal(proxyId) {
    pendingAssignProxyId = proxyId;
    const select = getEl('assign-profile-select');
    if (!select) return;
    select.innerHTML = '<option value="">Loading...</option>';
    try {
        const resp = await fetch('/api/profiles');
        const data = await resp.json();
        if (data && data.success) {
            const options = data.profiles.map(p => `<option value="${p.name}">${p.name}${p.proxyInfo ? ` — ${p.proxyInfo.host}:${p.proxyInfo.port}` : ''}</option>`).join('');
            select.innerHTML = `<option value="">Select profile...</option>` + options;
        } else {
            select.innerHTML = '<option value="">No profiles</option>';
        }
    } catch (e) {
        select.innerHTML = '<option value="">Error loading profiles</option>';
    }
    const assignModal = getEl('assign-proxy-modal'); if (assignModal) showModal(assignModal);

    document.getElementById('assign-profile-cancel').addEventListener('click', () => {
        hideModal('assign-proxy-modal');
        pendingAssignProxyId = null;
    });

    document.getElementById('assign-profile-save').addEventListener('click', async () => {
        const sel = getEl('assign-profile-select');
        const profileName = sel.value;
        if (!profileName || !pendingAssignProxyId) return;
        try {
            const resp = await fetch(`/api/profiles/${encodeURIComponent(profileName)}/proxy`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyId: pendingAssignProxyId })
            });
            const data = await resp.json();
            if (data.success) {
                // refresh proxies list
                proxies = await fetchProxies();
                renderProxies();
                updateStats();
                hideModal('assign-proxy-modal');
                pendingAssignProxyId = null;
                showNotification('Proxy assigned', 'success');
            } else {
                showNotification(data.error || 'Assign failed', 'error');
            }
        } catch (e) {
            showNotification('Assign failed', 'error');
        }
    });
}

// Додати тег
function addTag(proxyId) {
    const tag = prompt('Enter tag name:');
    if (!tag) return;

    const proxy = proxies.find(p => p.id === proxyId);
    if (!proxy) return;
    proxy.tags = Array.isArray(proxy.tags) ? proxy.tags : [];

    if (!proxy.tags.includes(tag)) {
        proxy.tags.push(tag);
        // persist change
        if (window.ipcRenderer && window.ipcRenderer.invoke) {
            window.ipcRenderer.invoke('update-proxy', proxy);
            window.ipcRenderer.send && window.ipcRenderer.send('proxies-updated');
        } else if (proxy.id) {
            fetch(`/api/proxies/${encodeURIComponent(proxy.id)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proxy)
            }).catch(e => console.error('Failed to persist tag', e));
        } else {
            saveProxies();
        }
        renderProxies();
    }
}

// Видалити тег
function removeTag(proxyId, tag) {
    const proxy = proxies.find(p => p.id === proxyId);
    if (!proxy) return;
    proxy.tags = Array.isArray(proxy.tags) ? proxy.tags : [];
    proxy.tags = proxy.tags.filter(t => t !== tag);

    // persist change
    if (window.ipcRenderer && window.ipcRenderer.invoke) {
        window.ipcRenderer.invoke('update-proxy', proxy);
        window.ipcRenderer.send && window.ipcRenderer.send('proxies-updated');
    } else if (proxy.id) {
        fetch(`/api/proxies/${encodeURIComponent(proxy.id)}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proxy)
        }).catch(e => console.error('Failed to persist tag removal', e));
    } else {
        saveProxies();
    }

    renderProxies();
}

// Видалити проксі
async function deleteProxy(id) {
    if (!confirm('Delete this proxy?')) return;

    try {
        await removeProxy(id);
        proxies = proxies.filter(p => p.id !== id);
        renderProxies();
        updateStats();
        showNotification('Proxy deleted', 'success');
    } catch (e) {
        showNotification('Failed to delete proxy', 'error');
    }
}

// Редагувати проксі
function editProxy(id) {
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) return;

    const hostEl = getEl('edit-proxy-host'); if (hostEl) hostEl.value = proxy.host || '';
    const portEl = getEl('edit-proxy-port'); if (portEl) portEl.value = proxy.port || '';
    const userEl = getEl('edit-proxy-username'); if (userEl) userEl.value = proxy.username || '';
    const passEl = getEl('edit-proxy-password'); if (passEl) passEl.value = proxy.password || '';
    const typeEl = getEl('edit-proxy-type'); if (typeEl) typeEl.value = proxy.type || 'http';
    const editModal = getEl('edit-proxy-modal'); if (editModal) showModal(editModal);

    const form = getEl('edit-proxy-form');
    if (!form) return;

    const handler = async (e) => {
        e.preventDefault();
        const updated = {
            host: (getEl('edit-proxy-host') && getEl('edit-proxy-host').value) || '',
            port: (getEl('edit-proxy-port') && getEl('edit-proxy-port').value) || '',
            username: (getEl('edit-proxy-username') && getEl('edit-proxy-username').value) || '',
            password: (getEl('edit-proxy-password') && getEl('edit-proxy-password').value) || '',
            type: (getEl('edit-proxy-type') && getEl('edit-proxy-type').value) || 'http'
        };

        try {
            if (window.ipcRenderer && window.ipcRenderer.invoke) {
                const idx = proxies.findIndex(p => p.id === id);
                if (idx !== -1) proxies[idx] = Object.assign({}, proxies[idx], updated);
                await window.ipcRenderer.invoke('update-proxy', proxies[idx]);
                window.ipcRenderer.send && window.ipcRenderer.send('proxies-updated');
            } else {
                const resp = await fetch(`/api/proxies/${encodeURIComponent(id)}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, proxies.find(p => p.id === id) || {}, updated))
                });
                const json = await resp.json();
                if (!json.success) throw new Error(json.error || 'Failed to update proxy');
                const idx = proxies.findIndex(p => p.id === id);
                if (idx !== -1) proxies[idx] = Object.assign({}, proxies[idx], updated);
            }

            renderProxies();
            updateStats();
            showNotification('Proxy updated', 'success');
            const editModal2 = getEl('edit-proxy-modal'); if (editModal2) hideModal(editModal2);
            form.removeEventListener('submit', handler);
        } catch (err) {
            showNotification('Failed to update proxy', 'error');
            console.error('editProxy error:', err);
        }
    };

    // remove then add to avoid duplicate handlers
    form.removeEventListener('submit', handler);
    form.addEventListener('submit', handler);
}

// Import proxies UI handlers
const importModal = document.getElementById('import-modal');
const importSubmitBtn = document.getElementById('import-submit-btn');
const importTextarea = document.getElementById('import-textarea');
const importDefaultTag = document.getElementById('import-default-tag');
const importAssignByTag = document.getElementById('import-assign-by-tag');

const importProxiesBtn = document.getElementById('import-proxies-btn');
if (importProxiesBtn) importProxiesBtn.addEventListener('click', () => showModal(importModal));

function parseProxyLine(line) {
    if (!line || !line.trim()) return null;
    let s = line.trim();
    // ignore comments
    if (s.startsWith('#')) return null;
    // ignore lines that look like CSV header (contain host and port keywords)
    const lower = s.toLowerCase();
    if (lower.includes('host') && lower.includes('port')) return null;

    // remove surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);

    // replace common separators (commas, semicolons) with colon when appropriate
    if (s.includes(',') && !s.includes(':')) s = s.replace(/\s*,\s*/g, ':');
    if (s.includes(';') && !s.includes(':')) s = s.replace(/\s*;\s*/g, ':');

    // If string starts with a scheme (http:// etc) remove it
    s = s.replace(/^(https?:\/\/|socks5?:\/\/)/i, '');

    // If contains '@' -> auth@host:port
    if (s.includes('@')) {
        const [auth, hostPart] = s.split('@');
        const [user, pass] = auth.split(':');
        const hostClean = hostPart.replace(/^(https?:\/\/|socks5?:\/\/|socks4?:\/\/)*/i, '');
        const parts = hostClean.split(':');
        const host = parts[0];
        const port = parts[1] || '';
        return { host, port, username: user || '', password: pass || '', type: 'http' };
    }

    // split by colon
    const parts = s.split(':');
    // host:port
    if (parts.length >= 2) {
        const host = parts[0];
        const port = parts[1] || '';
        const username = parts[2] || '';
        const password = parts[3] || '';
        const type = parts[4] || 'http';
        return { host, port, username, password, type };
    }

    return null;
}

async function importProxiesFromTextarea() {
    const raw = importTextarea.value || '';
    // normalize line endings, split, trim
    const linesAll = raw.replace(/\r\n/g,'\n').split('\n').map(l=>l.trim());
    // drop commented and empty and header-like lines
    const lines = linesAll.filter(l => l && !l.startsWith('#') && !(l.toLowerCase().includes('host') && l.toLowerCase().includes('port')));
    if (lines.length === 0) { showNotification('No proxies to import', 'error'); return; }

    const parsed = lines.map(parseProxyLine).filter(Boolean);
    if (parsed.length === 0) { showNotification('No valid proxies parsed', 'error'); return; }

    // Show a quick confirm dialog with counts
    if (!confirm(`Import ${parsed.length} proxies?`)) return;

    importSubmitBtn.disabled = true;
    importSubmitBtn.textContent = 'Importing...';

    const defaultTag = (importDefaultTag && importDefaultTag.value) ? importDefaultTag.value.trim() : null;

    let success = 0;
    for (const p of parsed) {
        try {
            const obj = {
                host: p.host,
                port: String(p.port || ''),
                username: p.username || '',
                password: p.password || '',
                type: (p.type || 'http').toLowerCase(),
                tags: defaultTag ? [defaultTag] : [],
                status: 'inactive',
                testResult: null,
                createdAt: new Date().toISOString()
            };

            const resp = await fetch('/api/proxies', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj)
            });
            const data = await resp.json();
            if (data && data.success) {
                success++;
            } else {
                console.error('Failed to save proxy', data);
            }
        } catch (e) {
            console.error('Import proxy error', e);
        }
    }

    importSubmitBtn.disabled = false;
    importSubmitBtn.textContent = 'Import';

    showNotification(`Imported ${success}/${parsed.length} proxies`, success>0 ? 'success' : 'error');
    hideModal(importModal);
    // refresh proxy list
    try { proxies = await fetchProxies(); renderProxies(); updateStats(); } catch (e) {}
}


// --- DOM initialization moved into initProxyManagerPage to avoid null element errors ---
async function initProxyManagerPage() {
    // Load proxies from server
    try {
        let fetched = await fetchProxies();
        // If Electron IPC returned object (from main.cjs getProxies), normalize
        if (fetched && fetched.proxies && Array.isArray(fetched.proxies)) {
            proxies = fetched.proxies;
        } else if (Array.isArray(fetched)) {
            proxies = fetched;
        } else if (fetched && fetched.data && Array.isArray(fetched.data.proxies)) {
            // sometimes ipc returns { success: true, data: { proxies: [...] } }
            proxies = fetched.data.proxies;
        } else {
            proxies = [];
        }
    } catch (e) {
        // fallback to local stored proxies
        loadProxies();
    }

    // Ensure proxies is an array
    if (!Array.isArray(proxies)) proxies = [];

    renderProxies();
    updateStats();

    // Setup UI buttons (guard if elements missing)
    const newProxyBtn = document.getElementById('new-proxy-btn');
    if (newProxyBtn) newProxyBtn.addEventListener('click', () => {
        const modal = document.getElementById('new-proxy-modal'); if (modal) showModal(modal);
    });

    const importProxiesBtn = document.getElementById('import-proxies-btn');
    if (importProxiesBtn) importProxiesBtn.addEventListener('click', () => {
        const modal = document.getElementById('import-modal'); if (modal) showModal(modal);
    });

    const searchEl = document.getElementById('search-proxy');
    if (searchEl) searchEl.addEventListener('input', renderProxies);
    const statusFilter = document.getElementById('filter-status');
    if (statusFilter) statusFilter.addEventListener('change', renderProxies);
    const typeFilter = document.getElementById('filter-type');
    if (typeFilter) typeFilter.addEventListener('change', renderProxies);
    const tagFilter = document.getElementById('filter-tag');
    if (tagFilter) tagFilter.addEventListener('input', renderProxies);

    // Import modal submit
    const importModalEl = document.getElementById('import-modal');
    const importSubmitBtnEl = document.getElementById('import-submit-btn');
    if (importSubmitBtnEl && importModalEl) {
        importSubmitBtnEl.addEventListener('click', importProxiesFromTextarea);
        // close import modal
        const closeBtn = importModalEl.querySelector('.close');
        if (closeBtn) closeBtn.addEventListener('click', () => { hideModal(importModalEl); });
    }

    // Assign modal actions
    const assignCancel = document.getElementById('assign-profile-cancel');
    if (assignCancel) assignCancel.addEventListener('click', () => {
        const modal = document.getElementById('assign-proxy-modal'); if (modal) hideModal(modal);
        pendingAssignProxyId = null;
    });
    const assignSave = document.getElementById('assign-profile-save');
    if (assignSave) assignSave.addEventListener('click', async () => {
        const sel = document.getElementById('assign-profile-select');
        const profileName = sel ? sel.value : null;
        if (!profileName || !pendingAssignProxyId) return;
        try {
            const resp = await fetch(`/api/profiles/${encodeURIComponent(profileName)}/proxy`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyId: pendingAssignProxyId })
            });
            const data = await resp.json();
            if (data.success) {
                proxies = await fetchProxies();
                renderProxies();
                updateStats();
                const modal = document.getElementById('assign-proxy-modal'); if (modal) hideModal(modal);
                pendingAssignProxyId = null;
                showNotification('Proxy assigned', 'success');
            } else {
                showNotification(data.error || 'Assign failed', 'error');
            }
        } catch (e) {
            showNotification('Assign failed', 'error');
        }
    });

    // Modal close handlers (generic)
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal'); if (modal) hideModal(modal);
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            hideModal(e.target);
        }
    });

    // Socket listener for updates (web)
    if (!window.ipcRenderer && typeof io !== 'undefined') {
        try {
            const socket = io();
            socket.on('proxies_updated', async () => {
                proxies = await fetchProxies();
                if (!Array.isArray(proxies)) proxies = [];
                renderProxies();
                updateStats();
            });
        } catch (e) {
            // ignore
        }
    }

    // If using IPC in Electron, update list after changes
    if (window.ipcRenderer && window.ipcRenderer.on) {
        window.ipcRenderer.on('proxies-updated', async () => {
            const fetched2 = await fetchProxies();
            if (fetched2 && fetched2.proxies && Array.isArray(fetched2.proxies)) proxies = fetched2.proxies;
            else if (Array.isArray(fetched2)) proxies = fetched2;
            else proxies = [];
            renderProxies();
            updateStats();
        });
    }
}

// Attach init on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProxyManagerPage);
} else {
    initProxyManagerPage();
}

// Notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#667eea'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// On load, fetch proxies from backend (Electron) or localStorage (web)
document.addEventListener('DOMContentLoaded', async () => {
    try {
        let fetched = await fetchProxies();
        // If Electron IPC returned object (from main.cjs getProxies), normalize
        if (fetched && fetched.proxies && Array.isArray(fetched.proxies)) {
            proxies = fetched.proxies;
        } else if (Array.isArray(fetched)) {
            proxies = fetched;
        } else if (fetched && fetched.data && Array.isArray(fetched.data.proxies)) {
            // sometimes ipc returns { success: true, data: { proxies: [...] } }
            proxies = fetched.data.proxies;
        } else {
            proxies = [];
        }
    } catch (e) {
        proxies = [];
    }

    // Якщо це Electron і proxies не масив, або undefined/null, то явно зробити []
    if (!Array.isArray(proxies)) proxies = [];
    renderProxies();
    updateStats();
    const newProxyBtn = document.getElementById('new-proxy-btn');
    if (newProxyBtn) {
        newProxyBtn.onclick = () => {
            const modal = document.getElementById('new-proxy-modal');
            if (modal) showModal(modal);
        };
    }

    // Web: listen to server socket updates if available
    if (!window.ipcRenderer && typeof io !== 'undefined') {
        try {
            const socket = io();
            socket.on('proxies_updated', async () => {
                proxies = await fetchProxies();
                if (!Array.isArray(proxies)) proxies = [];
                renderProxies();
                updateStats();
            });
        } catch (e) {
            // ignore
        }
    }

    // If using IPC in Electron, update list after changes
    if (window.ipcRenderer && window.ipcRenderer.on) {
        window.ipcRenderer.on('proxies-updated', async () => {
            const fetched2 = await fetchProxies();
            if (fetched2 && fetched2.proxies && Array.isArray(fetched2.proxies)) proxies = fetched2.proxies;
            else if (Array.isArray(fetched2)) proxies = fetched2;
            else proxies = [];
            renderProxies();
            updateStats();
        });
    }
});
