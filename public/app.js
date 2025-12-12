const socket = io();

let profiles = [];
let currentProfile = null;
let selectedProfiles = new Set();

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

// Елементи DOM
const profilesGrid = document.getElementById('profiles-grid');
const newProfileBtn = document.getElementById('new-profile-btn');
const refreshBtn = document.getElementById('refresh-btn');
const cleanupBtn = document.getElementById('cleanup-btn');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterProxy = document.getElementById('filter-proxy');
const newProfileModal = document.getElementById('new-profile-modal');
const proxyModal = document.getElementById('proxy-modal');
const fingerprintModal = document.getElementById('fingerprint-modal');
const newProfileForm = document.getElementById('new-profile-form');
const proxyForm = document.getElementById('proxy-form');

// Bulk actions
const bulkActionsDiv = document.getElementById('bulk-actions');
const bulkOpenBtn = document.getElementById('bulk-open-btn');
const bulkCloseBtn = document.getElementById('bulk-close-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const selectedCountSpan = document.getElementById('selected-count');

// Завантажити профілі
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        if (data.success) {
            profiles = data.profiles;
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

    document.getElementById('total-profiles').textContent = total;
    document.getElementById('open-profiles').textContent = open;
    document.getElementById('proxy-profiles').textContent = withProxy;
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

// Відкрити/закрити профіль
async function toggleProfile(name, isOpen, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    console.log(`toggleProfile called: name=${name}, isOpen=${isOpen}`);

    try {
        const endpoint = isOpen ? `/api/profiles/${name}/close` : `/api/profiles/${name}/open`;
        console.log(`Calling endpoint: ${endpoint}`);

        const response = await fetch(endpoint, { method: 'POST' });
        const data = await response.json();

        console.log(`Response:`, data);

        if (data.success) {
            showNotification(`Profile ${isOpen ? 'closed' : 'opened'} successfully`, 'success');
            await loadProfiles();
        } else {
            console.error(`API Error:`, data.error);
            showNotification(data.error || 'Operation failed', 'error');
        }
    } catch (error) {
        console.error('Error toggling profile:', error);
        showNotification('Operation failed', 'error');
    }
}

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

// View fingerprint details
async function viewFingerprint(name) {
    const profile = profiles.find(p => p.name === name);
    if (!profile) return;

    currentProfile = name;
    document.getElementById('fp-profile-name').textContent = name;

    const fp = profile.fingerprint;
    const detailsDiv = document.getElementById('fingerprint-details');

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

    fingerprintModal.style.display = 'block';
}

// Налаштувати проксі
function configureProxy(name) {
    currentProfile = name;
    const profile = profiles.find(p => p.name === name);

    if (profile && profile.proxy) {
        document.getElementById('proxy-input').value = profile.proxy;
        document.getElementById('proxy-type').value = profile.proxyType;
    } else {
        document.getElementById('proxy-input').value = '';
        document.getElementById('proxy-type').value = 'http';
    }

    // Ховаємо результат попереднього тесту
    document.getElementById('proxy-test-result').style.display = 'none';

    proxyModal.style.display = 'block';
}

// Тестувати проксі
document.getElementById('test-proxy-btn').addEventListener('click', async () => {
    const proxyInput = document.getElementById('proxy-input').value;
    const proxyType = document.getElementById('proxy-type').value;
    const resultDiv = document.getElementById('proxy-test-result');

    if (!proxyInput) {
        showNotification('Enter proxy details first', 'error');
        return;
    }

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="loader"></div> Testing proxy...';

    try {
        // Спочатку збережемо проксі тимчасово
        const tempSaveResponse = await fetch(`/api/profiles/${currentProfile}/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: `${proxyInput}:${proxyType}` })
        });

        if (!tempSaveResponse.ok) {
            throw new Error('Failed to save proxy temporarily');
        }

        // Тепер тестуємо
        const response = await fetch(`/api/profiles/${currentProfile}/proxy/test`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `
                <div style="background: #c6f6d5; padding: 15px; border-radius: 8px; border-left: 4px solid #48bb78;">
                    <div style="font-weight: bold; color: #22543d; margin-bottom: 10px;">✅ Proxy Working!</div>
                    <div style="font-size: 13px; color: #2d3748;">
                        <div><strong>IP:</strong> ${data.ip}</div>
                        <div><strong>Location:</strong> ${data.location.city}, ${data.location.region}, ${data.location.country}</div>
                        <div><strong>Response Time:</strong> ${data.responseTime}</div>
                    </div>
                </div>
            `;
            showNotification('Proxy is working!', 'success');
        } else {
            resultDiv.innerHTML = `
                <div style="background: #fed7d7; padding: 15px; border-radius: 8px; border-left: 4px solid #f56565;">
                    <div style="font-weight: bold; color: #742a2a; margin-bottom: 10px;">❌ Proxy Failed</div>
                    <div style="font-size: 13px; color: #2d3748;">
                        <div><strong>Error:</strong> ${data.error}</div>
                    </div>
                </div>
            `;
            showNotification('Proxy test failed', 'error');
        }
    } catch (error) {
        console.error('Error testing proxy:', error);
        resultDiv.innerHTML = `
            <div style="background: #fed7d7; padding: 15px; border-radius: 8px;">
                <div style="color: #742a2a;">❌ Test failed: ${error.message}</div>
            </div>
        `;
        showNotification('Proxy test failed', 'error');
    }
});

// Зберегти проксі
proxyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const proxy = document.getElementById('proxy-input').value;
    const proxyType = document.getElementById('proxy-type').value;

    try {
        const response = await fetch(`/api/profiles/${currentProfile}/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ proxy: `${proxy}:${proxyType}` })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Proxy configured successfully', 'success');
            proxyModal.style.display = 'none';
            loadProfiles();
        } else {
            showNotification(data.error || 'Failed to configure proxy', 'error');
        }
    } catch (error) {
        console.error('Error configuring proxy:', error);
        showNotification('Failed to configure proxy', 'error');
    }
});

// Regenerate fingerprint
document.getElementById('regenerate-fp-btn').addEventListener('click', async () => {
    try {
        const response = await fetch(`/api/profiles/${currentProfile}/fingerprint`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Fingerprint regenerated successfully', 'success');
            fingerprintModal.style.display = 'none';
            loadProfiles();
        } else {
            showNotification(data.error || 'Failed to regenerate fingerprint', 'error');
        }
    } catch (error) {
        console.error('Error regenerating fingerprint:', error);
        showNotification('Failed to regenerate fingerprint', 'error');
    }
});

document.getElementById('close-fp-modal-btn').addEventListener('click', () => {
    fingerprintModal.style.display = 'none';
});

// Видалити профіль
async function deleteProfile(name, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/profiles/${name}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Profile deleted successfully', 'success');
            await loadProfiles();
        } else {
            showNotification(data.error || 'Failed to delete profile', 'error');
        }
    } catch (error) {
        console.error('Error deleting profile:', error);
        showNotification('Failed to delete profile', 'error');
    }
}

// Створити новий профіль
newProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('profile-name').value;

    try {
        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Profile created successfully', 'success');
            newProfileModal.style.display = 'none';
            document.getElementById('profile-name').value = '';
            loadProfiles();
        } else {
            showNotification(data.error || 'Failed to create profile', 'error');
        }
    } catch (error) {
        console.error('Error creating profile:', error);
        showNotification('Failed to create profile', 'error');
    }
});

// Cleanup dead browsers
cleanupBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/cleanup', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showNotification(`Cleaned ${data.cleaned} dead browsers`, 'success');
            loadProfiles();
        }
    } catch (error) {
        console.error('Error cleaning up:', error);
        showNotification('Cleanup failed', 'error');
    }
});

// Event listeners
newProfileBtn.addEventListener('click', () => {
    newProfileModal.style.display = 'block';
});

refreshBtn.addEventListener('click', loadProfiles);

// Bulk actions listeners
bulkOpenBtn.addEventListener('click', () => bulkAction('open'));
bulkCloseBtn.addEventListener('click', () => bulkAction('close'));
bulkDeleteBtn.addEventListener('click', () => bulkAction('delete'));
deselectAllBtn.addEventListener('click', () => {
    selectedProfiles.clear();
    renderProfiles();
});

searchInput.addEventListener('input', renderProfiles);
filterStatus.addEventListener('change', renderProfiles);
filterProxy.addEventListener('change', renderProfiles);

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

// Socket.IO events
socket.on('profile_created', () => loadProfiles());
socket.on('profile_opened', () => loadProfiles());
socket.on('profile_closed', () => loadProfiles());
socket.on('profile_deleted', () => loadProfiles());
socket.on('profile_updated', () => loadProfiles());
socket.on('profile_renamed', () => loadProfiles());

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
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
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Завантажити профілі при старті
loadProfiles();

// Оновлювати кожні 5 секунд
setInterval(loadProfiles, 5000);

