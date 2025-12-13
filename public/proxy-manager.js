const socket = io();

let proxies = [];
let currentProxy = null;

// IPC API for Electron
const { ipcRenderer } = window;

async function fetchProxies() {
    if (ipcRenderer && ipcRenderer.invoke) {
        return await ipcRenderer.invoke('get-proxies');
    }
    // fallback for web: localStorage
    const stored = localStorage.getItem('proxies');
    return stored ? JSON.parse(stored) : [];
}
async function saveProxy(proxy) {
    if (ipcRenderer && ipcRenderer.invoke) {
        await ipcRenderer.invoke('add-proxy', proxy);
        if (ipcRenderer.send) ipcRenderer.send('proxies-updated');
        return;
    }
    // fallback for web
    let proxies = await fetchProxies();
    proxies.push(proxy);
    localStorage.setItem('proxies', JSON.stringify(proxies));
}
async function removeProxy(id) {
    if (ipcRenderer && ipcRenderer.invoke) {
        await ipcRenderer.invoke('delete-proxy', id);
        if (ipcRenderer.send) ipcRenderer.send('proxies-updated');
        return;
    }
    let proxies = await fetchProxies();
    proxies = proxies.filter(p => p.id !== id);
    localStorage.setItem('proxies', JSON.stringify(proxies));
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
        if (searchTerm && !proxy.host.toLowerCase().includes(searchTerm)) return false;
        if (statusFilter !== 'all' && proxy.status !== statusFilter) return false;
        if (typeFilter !== 'all' && proxy.type !== typeFilter) return false;
        if (tagFilter && !proxy.tags.some(t => t.toLowerCase().includes(tagFilter))) return false;
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
                        <strong>${proxy.host}:${proxy.port}</strong>
                        <span style="color: #718096; margin-left: 10px;">${proxy.type.toUpperCase()}</span>
                    </div>
                    <div class="proxy-status ${statusClass}">${statusText}</div>
                </div>
                
                <div class="proxy-tags">
                    ${proxy.tags.map(tag => `
                        <span class="tag">
                            ${tag}
                            <span class="remove" onclick="removeTag('${proxy.id}', '${tag}')">×</span>
                        </span>
                    `).join('')}
                    <button class="btn btn-secondary" style="font-size: 11px; padding: 4px 8px;" 
                            onclick="addTag('${proxy.id}')">+ Tag</button>
                </div>
                
                ${proxy.testResult ? `
                    <div class="proxy-info">
                        <div><strong>IP:</strong> ${proxy.testResult.ip}</div>
                        <div><strong>Location:</strong> ${proxy.testResult.location.city}, ${proxy.testResult.location.country}</div>
                        <div><strong>Response:</strong> ${proxy.testResult.responseTime}</div>
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

    proxies.push(proxy);
    saveProxies();
    renderProxies();
    updateStats();

    document.getElementById('new-proxy-modal').style.display = 'none';
    document.getElementById('new-proxy-form').reset();

    showNotification('Proxy added successfully', 'success');
});

// Тестувати проксі
async function testProxy(id) {
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) return;

    proxy.status = 'testing';
    renderProxies();

    try {
        const proxyString = formatProxyString(proxy);
        // Створюємо тимчасовий тестовий профіль
        const testProfileName = `_test_proxy_${Date.now()}`;
        // Зберігаємо проксі в тестовий профіль
        const saveResponse = await fetch(`/api/profiles/${testProfileName}/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: proxyString })
        });
        // Тестуємо
        const testResponse = await fetch(`/api/profiles/${testProfileName}/proxy/test`, {
            method: 'POST'
        });
        const data = await testResponse.json();
        if (data.success) {
            proxy.status = 'active';
            proxy.testResult = data;
            showNotification('Proxy test successful!', 'success');
        } else {
            proxy.status = 'failed';
            proxy.testResult = { error: data.error };
            // Додаємо підказку для 407
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
    saveProxies();
    renderProxies();
    updateStats();
}

// Assign проксі до профілю
async function assignToProfile(proxyId) {
    const proxy = proxies.find(p => p.id === proxyId);
    if (!proxy) return;

    const profileName = prompt('Enter profile name:');
    if (!profileName) return;

    try {
        const proxyString = `${proxy.host}:${proxy.port}:${proxy.username}:${proxy.password}:${proxy.type}`;

        const response = await fetch(`/api/profiles/${profileName}/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: proxyString })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(`Proxy assigned to ${profileName}`, 'success');
        } else {
            showNotification(data.error || 'Failed to assign proxy', 'error');
        }
    } catch (error) {
        showNotification('Error assigning proxy', 'error');
    }
}

// Додати тег
function addTag(proxyId) {
    const tag = prompt('Enter tag name:');
    if (!tag) return;

    const proxy = proxies.find(p => p.id === proxyId);
    if (proxy && !proxy.tags.includes(tag)) {
        proxy.tags.push(tag);
        saveProxies();
        renderProxies();
    }
}

// Видалити тег
function removeTag(proxyId, tag) {
    const proxy = proxies.find(p => p.id === proxyId);
    if (proxy) {
        proxy.tags = proxy.tags.filter(t => t !== tag);
        saveProxies();
        renderProxies();
    }
}

// Видалити проксі
function deleteProxy(id) {
    if (!confirm('Delete this proxy?')) return;

    proxies = proxies.filter(p => p.id !== id);
    saveProxies();
    renderProxies();
    updateStats();
    showNotification('Proxy deleted', 'success');
}

// Імпорт проксі
document.getElementById('import-submit-btn').addEventListener('click', () => {
    const textarea = document.getElementById('import-textarea');
    const lines = textarea.value.split('\n').filter(l => l.trim());

    let imported = 0;

    lines.forEach(line => {
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
            proxies.push(proxy);
            imported++;
        }
    });

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
    proxies = await fetchProxies();
    // Якщо це Electron і proxies не масив, або undefined/null, то явно зробити []
    if (!Array.isArray(proxies)) proxies = [];
    renderProxies();
    document.getElementById('add-proxy-btn').onclick = () => {
        document.getElementById('new-proxy-modal').style.display = 'block';
    };

    // Якщо працюємо в Electron, оновлюємо список після додавання/видалення через IPC
    if (window.ipcRenderer && window.ipcRenderer.on) {
        window.ipcRenderer.on('proxies-updated', async () => {
            proxies = await fetchProxies();
            if (!Array.isArray(proxies)) proxies = [];
            renderProxies();
        });
    }
});
