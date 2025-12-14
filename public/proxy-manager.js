const socket = io();

let proxies = [];
let currentProxy = null;
let pendingAssignProxyId = null;

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

    document.getElementById('total-proxies').textContent = total;
    document.getElementById('active-proxies').textContent = active;
    document.getElementById('failed-proxies').textContent = failed;
}

// Відрендерити проксі
function renderProxies() {
    const searchTerm = document.getElementById('search-proxy').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const typeFilter = document.getElementById('filter-type').value;
    const tagFilter = document.getElementById('filter-tag').value.toLowerCase();

    let filtered = proxies.filter(proxy => {
        const tags = proxy.tags || [];
        if (searchTerm && !(proxy.host || '').toLowerCase().includes(searchTerm)) return false;
        if (statusFilter !== 'all' && (proxy.status || 'inactive') !== statusFilter) return false;
        if (typeFilter !== 'all' && (proxy.type || 'http') !== typeFilter) return false;
        if (tagFilter && !tags.some(t => t.toLowerCase().includes(tagFilter))) return false;
        return true;
    });

    const container = document.getElementById('proxies-list');

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

        return `
            <div class="proxy-card" data-id="${proxy.id}">
                <div class="proxy-header">
                    <div>
                        <strong>${proxy.host || ''}:${proxy.port || ''}</strong>
                        <span style="color: #718096; margin-left: 10px;">${(proxy.type || 'http').toUpperCase()}</span>
                    </div>
                    <div class="proxy-status ${statusClass}">${statusText}</div>
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

                ${proxy.assignedTo && proxy.assignedTo.length ? `
                    <div class="proxy-assigned" style="margin-bottom:8px;color:#4a5568;font-size:13px;">
                        Assigned to: ${proxy.assignedTo.join(', ')}
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
document.getElementById('new-proxy-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const proxy = {
        id: Date.now().toString(),
        host: document.getElementById('proxy-host').value,
        port: document.getElementById('proxy-port').value,
        username: document.getElementById('proxy-username').value,
        password: document.getElementById('proxy-password').value,
        type: document.getElementById('proxy-type-select').value,
        tags: document.getElementById('proxy-tags-input').value.split(',').map(t => t.trim()).filter(t => t),
        status: 'inactive',
        testResult: null,
        createdAt: new Date().toISOString()
    };

    try {
        // Save via server API (or via IPC in Electron)
        await saveProxy(proxy);

        // Refresh list from server (or from IPC)
        let fetched = await fetchProxies();
        if (fetched && fetched.proxies && Array.isArray(fetched.proxies)) proxies = fetched.proxies;
        else if (Array.isArray(fetched)) proxies = fetched;
        else if (fetched && fetched.data && Array.isArray(fetched.data.proxies)) proxies = fetched.data.proxies;
        else proxies = proxies || [];

        renderProxies();
        updateStats();

        document.getElementById('new-proxy-modal').style.display = 'none';
        document.getElementById('new-proxy-form').reset();

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
    const select = document.getElementById('assign-profile-select');
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
    document.getElementById('assign-proxy-modal').style.display = 'block';
}

document.getElementById('assign-profile-cancel').addEventListener('click', () => {
    document.getElementById('assign-proxy-modal').style.display = 'none';
    pendingAssignProxyId = null;
});

document.getElementById('assign-profile-save').addEventListener('click', async () => {
    const sel = document.getElementById('assign-profile-select');
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
            document.getElementById('assign-proxy-modal').style.display = 'none';
            pendingAssignProxyId = null;
            showNotification('Proxy assigned', 'success');
        } else {
            showNotification(data.error || 'Assign failed', 'error');
        }
    } catch (e) {
        showNotification('Assign failed', 'error');
    }
});

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

    document.getElementById('edit-proxy-host').value = proxy.host || '';
    document.getElementById('edit-proxy-port').value = proxy.port || '';
    document.getElementById('edit-proxy-username').value = proxy.username || '';
    document.getElementById('edit-proxy-password').value = proxy.password || '';
    document.getElementById('edit-proxy-type').value = proxy.type || 'http';
    document.getElementById('edit-proxy-modal').style.display = 'block';

    const form = document.getElementById('edit-proxy-form');
    const handler = async (e) => {
        e.preventDefault();
        const updated = {
            host: document.getElementById('edit-proxy-host').value,
            port: document.getElementById('edit-proxy-port').value,
            username: document.getElementById('edit-proxy-username').value,
            password: document.getElementById('edit-proxy-password').value,
            type: document.getElementById('edit-proxy-type').value
        };

        try {
            // If Electron IPC available, use update via main process
            if (window.ipcRenderer && window.ipcRenderer.invoke) {
                // update local store
                const idx = proxies.findIndex(p => p.id === id);
                if (idx !== -1) proxies[idx] = Object.assign({}, proxies[idx], updated);
                // save via ipc
                await window.ipcRenderer.invoke('update-proxy', proxies[idx]);
                window.ipcRenderer.send && window.ipcRenderer.send('proxies-updated');
            } else {
                // Web: call PUT /api/proxies/:id
                const resp = await fetch(`/api/proxies/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.assign({}, proxies.find(p => p.id === id) || {}, updated))
                });
                const json = await resp.json();
                if (!json.success) throw new Error(json.error || 'Failed to update proxy');
                // update local array
                const idx = proxies.findIndex(p => p.id === id);
                if (idx !== -1) proxies[idx] = Object.assign({}, proxies[idx], updated);
            }

            renderProxies();
            updateStats();
            showNotification('Proxy updated', 'success');
            document.getElementById('edit-proxy-modal').style.display = 'none';
            form.removeEventListener('submit', handler);
        } catch (err) {
            showNotification('Failed to update proxy', 'error');
            console.error('editProxy error:', err);
        }
    };

    form.removeEventListener('submit', handler);
    form.addEventListener('submit', handler);
}

// Імпорт проксі
document.getElementById('import-submit-btn').addEventListener('click', async () => {
    const textarea = document.getElementById('import-textarea');
    const lines = textarea.value.split('\n').filter(l => l.trim());

    let imported = 0;

    for (const line of lines) {
        const parts = line.trim().split(':');
        if (parts.length >= 2) {
            const proxy = {
                id: Date.now().toString() + Math.random(),
                host: parts[0],
                port: parts[1],
                username: parts[2] || '',
                password: parts[3] || '',
                type: parts[4] || 'http',
                tags: [],
                status: 'inactive',
                testResult: null,
                createdAt: new Date().toISOString()
            };

            // save each via API (web) or IPC (electron)
            try {
                if (window.ipcRenderer && window.ipcRenderer.invoke) {
                    await window.ipcRenderer.invoke('add-proxy', proxy);
                    window.ipcRenderer.send && window.ipcRenderer.send('proxies-updated');
                } else {
                    await fetch('/api/proxies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proxy) });
                }
                imported++;
            } catch (e) {
                console.error('Failed to import proxy', e);
            }
        }
    }

    // Refresh from server
    try {
        const fetched = await fetchProxies();
        proxies = Array.isArray(fetched) ? fetched : (fetched && fetched.proxies) ? fetched.proxies : [];
    } catch (e) {
        // fallback keep local
    }

    saveProxies();
    renderProxies();
    updateStats();

    document.getElementById('import-modal').style.display = 'none';
    textarea.value = '';

    showNotification(`Imported ${imported} proxies`, 'success');
});

// Event listeners
document.getElementById('new-proxy-btn').addEventListener('click', () => {
    document.getElementById('new-proxy-modal').style.display = 'block';
});

document.getElementById('import-proxies-btn').addEventListener('click', () => {
    document.getElementById('import-modal').style.display = 'block';
});

document.getElementById('search-proxy').addEventListener('input', renderProxies);
document.getElementById('filter-status').addEventListener('change', renderProxies);
document.getElementById('filter-type').addEventListener('change', renderProxies);
document.getElementById('filter-tag').addEventListener('input', renderProxies);

// Закрити модальні вікна
document.querySelectorAll('.close').forEach(closeBtn => {
    closeBtn.addEventListener('click', function() {
        this.closest('.modal').style.display = 'none';
    });
});

window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

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
            if (modal) modal.style.display = 'block';
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
