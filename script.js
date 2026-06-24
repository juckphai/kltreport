// ============================================================
//  1. GLOBAL VARIABLES
// ============================================================
let deviceConfigs = {};
let currentSensorValues = {};
let chart;
let sensorHistory = { timestamps: [], data: {} };
let connectionMode = 'offline';
let presenceIntervalId = null;
let currentUsername = null;
let currentUserRole = null;
let floodAlertStatus = {};
let telegramConfig = {};
let telegramCheckInterval = null;
let deviceHealthMonitorInterval = null;
let autoLogIntervalId = null;
let currentIntervalMinutes = 15;
let globalAlertMuted = false;
let lastUpdateTracker = {};
let serverTimeOffset = 0;
let loggingConfig = { type: 'day', val: 1, rec: 24, intervalMs: 3600000, maxRecords: 24 };

const DEFAULT_LEVELS_CONFIG = {
    very_high: { min: 90, max: 100, label: '🔴 มากที่สุด', color: '#ef4444' },
    high: { min: 70, max: 89, label: '🟠 มาก', color: '#f59e0b' },
    normal: { min: 40, max: 69, label: '🟢 ปานกลาง', color: '#10b981' },
    low: { min: 20, max: 39, label: '🔵 น้อย', color: '#3b82f6' },
    very_low: { min: 0, max: 19, label: '🟣 น้อยที่สุด', color: '#6366f1' }
};

const LEVEL_KEYS = ['very_high', 'high', 'normal', 'low', 'very_low'];
const LEVEL_NAMES = { very_high: 'มากที่สุด', high: 'มาก', normal: 'ปานกลาง', low: 'น้อย', very_low: 'น้อยที่สุด' };
const LEVEL_EMOJIS = { very_high: '🔴', high: '🟠', normal: '🟢', low: '🔵', very_low: '🟣' };
const LEVEL_COLORS = { very_high: '#ef4444', high: '#f59e0b', normal: '#10b981', low: '#3b82f6', very_low: '#6366f1' };

const SENSOR_TEMPLATES = {
    ultrasonic: {
        label: '📡 Ultrasonic (วัดระดับน้ำ)',
        levels: {
            very_low: { min: 0, max: 30, label: 'น้ำน้อยมาก' },
            low: { min: 31, max: 60, label: 'น้ำน้อย' },
            normal: { min: 61, max: 120, label: 'ปกติ' },
            high: { min: 121, max: 180, label: 'น้ำมาก' },
            very_high: { min: 181, max: 300, label: 'น้ำมากมาก' }
        }
    },
    ultrasonic_river: {
        label: '🌊 Ultrasonic (River Mode)',
        levels: {
            very_low: { min: 0, max: 19, label: 'น้ำน้อยมาก' },
            low: { min: 20, max: 39, label: 'น้ำน้อย' },
            normal: { min: 40, max: 69, label: 'ปกติ' },
            high: { min: 70, max: 89, label: 'เตือนภัย' },
            very_high: { min: 90, max: 999, label: 'วิกฤต' }
        }
    },
    soil: {
        label: '🌱 Soil (ความชื้นดิน)',
        levels: {
            very_low: { min: 0, max: 19, label: 'แห้งมาก' },
            low: { min: 20, max: 39, label: 'แห้ง' },
            normal: { min: 40, max: 69, label: 'ปกติ' },
            high: { min: 70, max: 89, label: 'ชื้น' },
            very_high: { min: 90, max: 100, label: 'ชื้นมาก' }
        }
    },
    ph: {
        label: '🧪 pH (ค่ากรดด่าง)',
        levels: {
            very_low: { min: 0, max: 3, label: 'กรดจัด' },
            low: { min: 4, max: 5, label: 'กรด' },
            normal: { min: 6, max: 8, label: 'เป็นกลาง' },
            high: { min: 9, max: 10, label: 'ด่าง' },
            very_high: { min: 11, max: 14, label: 'ด่างจัด' }
        }
    },
    temp: {
        label: '🌡️ Temperature (อุณหภูมิ)',
        levels: {
            very_low: { min: -10, max: 9, label: 'หนาวจัด' },
            low: { min: 10, max: 19, label: 'หนาว' },
            normal: { min: 20, max: 29, label: 'ปกติ' },
            high: { min: 30, max: 39, label: 'ร้อน' },
            very_high: { min: 40, max: 50, label: 'ร้อนจัด' }
        }
    },
    rain: {
        label: '🌧️ Rain (ปริมาณน้ำฝน)',
        levels: {
            very_low: { min: 0, max: 4, label: 'ฝนน้อย' },
            low: { min: 5, max: 19, label: 'ฝนปานกลาง' },
            normal: { min: 20, max: 49, label: 'ฝนตก' },
            high: { min: 50, max: 99, label: 'ฝนหนัก' },
            very_high: { min: 100, max: 999, label: 'ฝนหนักมาก' }
        }
    }
};

// ============================================================
//  2. HELPER FUNCTIONS
// ============================================================
function getTimestampMs(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    if (typeof value === 'object' && value !== null) {
        try {
            if (value.seconds !== undefined) {
                return value.seconds * 1000 + (value.nanoseconds || 0) / 1000000;
            }
            if (value.toString) {
                const str = value.toString();
                const d = new Date(str);
                if (!isNaN(d.getTime())) return d.getTime();
            }
        } catch (e) {}
        return 0;
    }
    return 0;
}

function formatUptime(firebaseTimestamp) {
    if (!firebaseTimestamp) return "-";
    let start;
    if (typeof firebaseTimestamp === 'object') {
        start = firebaseTimestamp.timestamp || firebaseTimestamp.seconds * 1000 || 0;
    } else {
        start = firebaseTimestamp;
    }
    if (!start || isNaN(start)) return "-";
    const now = Date.now() + serverTimeOffset;
    const diff = now - start;
    if (diff < 0) return "0 นาที";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    let result = [];
    if (days > 0) result.push(`${days} วัน`);
    if (hours > 0 || days > 0) result.push(`${hours} ชม.`);
    result.push(`${minutes} นาที`);
    return result.join(' ');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.';
    } catch (e) { return dateStr; }
}

function formatThaiDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
    } catch (e) { return dateStr; }
}

function showFriendlyError(err) {
    if (!err) { alert("⚠️ ขออภัย พบปัญหาในการทำงาน กรุณาลองใหม่อีกครั้ง"); return; }
    const errorMessage = err.message || String(err);
    if (errorMessage.includes("permission_denied")) {
        alert("❌ คุณไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อแอดมิน");
    } else if (errorMessage.includes("network")) {
        if (navigator.onLine === false) {
            alert("❌ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณ");
        } else {
            alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
        }
    } else if (errorMessage.includes("not found")) {
        alert("❌ ไม่พบข้อมูลที่ต้องการ กรุณาตรวจสอบอีกครั้ง");
    } else if (errorMessage.includes("timeout")) {
        alert("⏱️ การทำงานใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
    } else {
        alert(`⚠️ ขออภัย พบปัญหาในการทำงาน: ${errorMessage}`);
    }
}

function handleError(err, context = '') {
    console.error(`❌ Error in ${context}:`, err);
    showFriendlyError(err);
}

function getSignalBarsHTML(rssi) {
    let bars = 0;
    let className = "";
    if (rssi >= -55) { bars = 4; className = "signal-strong"; }
    else if (rssi >= -70) { bars = 3; className = "signal-strong"; }
    else if (rssi >= -80) { bars = 2; className = "signal-mid"; }
    else { bars = 1; className = "signal-low"; }
    let html = `<div class="signal-bars ${className}">`;
    for (let i = 1; i <= 4; i++) {
        html += `<div class="bar bar-${i}" style="opacity: ${i <= bars ? '1' : '0.3'}"></div>`;
    }
    html += `</div>`;
    return html;
}

function getRSSIStatusText(rssi) {
    if (rssi === 0 || !rssi) return "📶 ไม่มีสัญญาณ";
    if (rssi >= -55) return "📶 แรงมาก";
    if (rssi >= -70) return "📶 แรง";
    if (rssi >= -80) return "📶 ปานกลาง";
    return "📶 อ่อน";
}

// ============================================================
//  3. PROJECT TITLE MANAGEMENT
// ============================================================
function initTitleListener() {
    if (!window.db) return;
    const titleRef = window.ref(window.db, 'settings/project_title');
    window.onValue(titleRef, (snapshot) => {
        const titleEl = document.getElementById('projectTitle');
        if (!titleEl) return;
        const title = snapshot.exists() ? snapshot.val() : "หน้าจอจัดการและรายงาน kltreport";
        titleEl.textContent = title;
    });
}

window.openTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    const titleEl = document.getElementById('projectTitle');
    const inputField = document.getElementById('newProjectTitle');
    if (modal && titleEl && inputField) {
        modal.style.display = 'flex';
        inputField.value = titleEl.textContent;
    }
};

window.closeTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    if (modal) modal.style.display = 'none';
};

window.saveProjectTitle = async function() {
    const newTitle = document.getElementById('newProjectTitle').value.trim();
    if (!newTitle) { alert("กรุณากรอกชื่อโครงการ"); return; }
    try {
        await window.set(window.ref(window.db, 'settings/project_title'), newTitle);
        closeTitleEditor();
        alert("✅ บันทึกชื่อโครงการสำเร็จ");
    } catch (e) {
        alert("❌ บันทึกไม่สำเร็จ: " + e.message);
    }
};

window.deleteProjectTitle = async function() {
    if (confirm("ยืนยันการลบชื่อโครงการ? (จะกลับสู่ค่าเริ่มต้น)")) {
        try {
            await window.remove(window.ref(window.db, 'settings/project_title'));
            closeTitleEditor();
            alert("✅ ลบชื่อโครงการสำเร็จ (กลับสู่ค่าเริ่มต้น)");
        } catch (e) {
            alert("❌ ลบไม่สำเร็จ: " + e.message);
        }
    }
};

// ============================================================
//  4. PRESENCE SYSTEM
// ============================================================
function updatePresence(username, role) {
    if (!window.db || !username) return;
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    window.set(presenceRef, {
        role: role,
        loginAt: window.serverTimestamp(),
        lastSeen: new Date().toISOString()
    }).catch(err => console.warn("⚠️ updatePresence set error:", err));

    window.onValue(window.ref(window.db, '.info/connected'), (snap) => {
        if (snap.val() === true) {
            const onDisconnectRef = window.ref(window.db, 'online_users/' + username);
            window.onDisconnect(onDisconnectRef).remove().catch(err => {
                console.warn("⚠️ onDisconnect error:", err);
            });
        }
    });

    if (presenceIntervalId) clearInterval(presenceIntervalId);
    presenceIntervalId = setInterval(() => {
        window.update(presenceRef, {
            lastSeen: new Date().toISOString()
        }).catch(err => console.warn("⚠️ lastSeen update error:", err));
    }, 30000);
}

function removePresence(username) {
    if (!window.db || !username) return;
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    window.remove(presenceRef).catch(err => console.warn("⚠️ removePresence error:", err));
}

function updateCompactOnlineUsers() {
    if (!window.db) return;
    const listRef = window.ref(window.db, 'online_users');
    window.onValue(listRef, (snapshot) => {
        const compactTextEl = document.getElementById('compactOnlineText');
        const compactListEl = document.getElementById('compactUsersList');
        if (!compactTextEl || !compactListEl) return;
        if (snapshot.exists()) {
            const users = snapshot.val();
            let onlineUsers = [];
            const now = new Date().getTime();
            Object.keys(users).forEach(u => {
                const lastSeen = new Date(users[u].lastSeen).getTime();
                if (now - lastSeen < 30000) {
                    onlineUsers.push({ name: u, role: users[u].role });
                }
            });
            const count = onlineUsers.length;
            compactTextEl.textContent = `ออนไลน์ ${count} คน`;
            if (count > 0) {
                let listHtml = `<div class="online-count-header">🟢 ออนไลน์ ${count} คน</div>`;
                onlineUsers.forEach(user => {
                    const roleIcon = user.role === 'admin' ? '👑' : '👤';
                    listHtml += `<div class="compact-user-item"><span class="role-icon">${roleIcon}</span><span class="username-text">${escapeHtml(user.name)}</span></div>`;
                });
                compactListEl.innerHTML = listHtml;
            } else {
                compactListEl.innerHTML = '<div class="compact-user-item" style="opacity:0.7;">ไม่มีผู้ใช้ออนไลน์</div>';
            }
        } else {
            compactTextEl.textContent = 'ออนไลน์ 0 คน';
            compactListEl.innerHTML = '<div class="compact-user-item" style="opacity:0.7;">ไม่มีผู้ใช้ออนไลน์</div>';
        }
    });
}

// ============================================================
//  5. LOGIN SYSTEM
// ============================================================
window.togglePassword = function() {
    const passInput = document.getElementById('password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
};

window.handleLogin = async function() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const remember = document.getElementById('rememberMe').checked;

    if (!user || !pass) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }

    try {
        if (!window.db) throw new Error('Firebase ไม่พร้อมใช้งาน');
        const userRef = window.ref(window.db, `users/${user}`);
        const snapshot = await window.get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.password === pass) {
                loginSuccess(userData.role, user, pass, remember);
            } else {
                alert('❌ รหัสผ่านไม่ถูกต้อง');
            }
        } else {
            alert('❌ ไม่พบชื่อผู้ใช้นี้ในระบบ');
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
};

function loginSuccess(role, user, pass, remember) {
    sessionStorage.setItem('activeRole', role);
    sessionStorage.setItem('currentUser', user);
    currentUsername = user;
    currentUserRole = role;

    if (remember) {
        localStorage.setItem('savedUsername', user);
        localStorage.setItem('savedPassword', pass);
        localStorage.setItem('rememberMe', 'true');
    } else {
        localStorage.removeItem('savedUsername');
        localStorage.removeItem('savedPassword');
        localStorage.removeItem('rememberMe');
    }

    applyRole(role, user);
    updatePresence(user, role);
    updateCompactOnlineUsers();
    initTitleListener();
    startDeviceHealthMonitor();
    
    // ✅ เพิ่ม: อัปเดต Status Bar หลังจาก login สำเร็จ
    setTimeout(() => {
        updateStatusBarBoardDetails();
    }, 1500);
}

// ============================================================
//  6. APPLY ROLE (แสดง/ซ่อน Admin Controls)
// ============================================================
function applyRole(role, username) {
    // แสดง Main App และซ่อน Login
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';

    // แสดงชื่อผู้ใช้
    const userNameSpan = document.getElementById('currentUserName');
    if (userNameSpan) {
        userNameSpan.textContent = username;
    }

    // ✅ แสดง/ซ่อน Admin Controls
    const adminControls = document.getElementById('adminControls');
    if (adminControls) {
        if (role === 'admin') {
            adminControls.classList.remove('role-hidden');
            console.log("✅ Admin controls activated");
        } else {
            adminControls.classList.add('role-hidden');
            console.log("👤 User mode: Admin controls hidden");
        }
    } else {
        console.warn("⚠️ ไม่พบ element #adminControls");
    }

    // ✅ แสดง/ซ่อนปุ่ม Admin Menu Toggle
    const adminMenuToggleBtn = document.getElementById('adminMenuToggleBtn');
    if (adminMenuToggleBtn) {
        if (role === 'admin') {
            adminMenuToggleBtn.style.display = 'inline-block';
            console.log("✅ Admin menu toggle button shown");
        } else {
            adminMenuToggleBtn.style.display = 'none';
        }
    } else {
        console.warn("⚠️ ไม่พบ element #adminMenuToggleBtn");
    }

    // ✅ เพิ่ม: อัปเดต Status Bar หลังจากแสดงหน้า
    setTimeout(() => {
        updateStatusBarBoardDetails();
    }, 1000);
}

// ============================================================
//  7. ADMIN MENU TOGGLE
// ============================================================
window.toggleAdminMenu = function() {
    const menu = document.getElementById('adminMenuModal');
    if (menu) {
        const isVisible = menu.style.display === 'flex';
        menu.style.display = isVisible ? 'none' : 'flex';
        console.log(`🔄 Admin Menu: ${isVisible ? 'ซ่อน' : 'แสดง'}`);
    } else {
        console.warn("⚠️ ไม่พบ element #adminMenuModal");
    }
};

// ============================================================
//  8. LOGOUT SYSTEM
// ============================================================
window.logout = async function() {
    const currentUser = sessionStorage.getItem('currentUser');

    if (presenceIntervalId) {
        clearInterval(presenceIntervalId);
        presenceIntervalId = null;
    }
    if (telegramCheckInterval) {
        clearInterval(telegramCheckInterval);
        telegramCheckInterval = null;
    }
    if (deviceHealthMonitorInterval) {
        clearInterval(deviceHealthMonitorInterval);
        deviceHealthMonitorInterval = null;
    }
    if (autoLogIntervalId) {
        clearInterval(autoLogIntervalId);
        autoLogIntervalId = null;
    }

    localStorage.removeItem('savedUsername');
    localStorage.removeItem('savedPassword');
    localStorage.removeItem('rememberMe');
    sessionStorage.clear();

    if (currentUser && window.db) {
        const presenceRef = window.ref(window.db, 'online_users/' + currentUser);
        try {
            await window.onDisconnect(presenceRef).cancel();
            await window.remove(presenceRef);
            console.log("✅ ลบสถานะออนไลน์เรียบร้อย");
        } catch (err) {
            console.error("❌ ลบสถานะออนไลน์ไม่สำเร็จ:", err);
        }
    }

    window.location.reload();
};

// ============================================================
//  9. CLEAR LOCAL DATA
// ============================================================
window.confirmClearLocalData = function() {
    if (confirm("⚠️ คุณต้องการลบข้อมูลสถิติในเครื่อง และรีเฟรชหน้าเว็บเพื่อเคลียร์แคชใช่หรือไม่?")) {
        const savedUser = localStorage.getItem('savedUsername');
        const savedPass = localStorage.getItem('savedPassword');
        const rememberMe = localStorage.getItem('rememberMe');

        if (typeof sensorHistory !== 'undefined') {
            sensorHistory.timestamps = [];
            sensorHistory.data = {};
        }
        
        if (typeof chart !== 'undefined' && chart) {
            chart.data.labels = [];
            chart.data.datasets.forEach(ds => ds.data = []);
            chart.update();
        }

        localStorage.clear();
        sessionStorage.clear();

        if (savedUser) localStorage.setItem('savedUsername', savedUser);
        if (savedPass) localStorage.setItem('savedPassword', savedPass);
        if (rememberMe) localStorage.setItem('rememberMe', rememberMe);

        window.location.reload(true);
        
        alert("✅ ล้างข้อมูลสถิติและรีเฟรชแคชเรียบร้อยแล้ว (ข้อมูล Login ยังอยู่)");
    }
};

// ============================================================
//  10. USER MANAGEMENT
// ============================================================
window.openUserManager = async function() {
    document.getElementById('userModal').style.display = 'flex';
    await renderUserTable();
};

window.closeUserManager = function() {
    document.getElementById('userModal').style.display = 'none';
    document.getElementById('manageUsername').value = '';
    document.getElementById('managePassword').value = '';
    document.getElementById('manageRole').value = 'user';
    const saveBtn = document.querySelector('.user-management-form .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveUser()');
    }
    document.getElementById('manageUsername').readOnly = false;
};

window.editUser = function(username, password, role) {
    const userField = document.getElementById('manageUsername');
    userField.value = username;
    userField.readOnly = true;
    document.getElementById('managePassword').value = password;
    document.getElementById('manageRole').value = role;
    const saveBtn = document.querySelector('.user-management-form .save-btn');
    saveBtn.textContent = '💾 อัปเดต';
    saveBtn.setAttribute('onclick', 'saveUser(true)');
};

window.saveUser = async function(isEdit = false) {
    const username = document.getElementById('manageUsername').value.trim();
    const password = document.getElementById('managePassword').value.trim();
    const role = document.getElementById('manageRole').value;

    if (!username || !password) { alert("กรุณากรอก Username และ Password"); return; }

    try {
        await window.update(window.ref(window.db, `users/${username}`), {
            password: password,
            role: role,
            updatedAt: new Date().toISOString()
        });
        alert(`✅ ${isEdit ? 'อัปเดต' : 'บันทึก'}ผู้ใช้ ${username} สำเร็จ`);
        closeUserManager();
        await renderUserTable();
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกได้: " + error.message);
    }
};

window.deleteUser = async function(username) {
    const currentUser = sessionStorage.getItem('currentUser');
    if (username === currentUser) {
        alert("❌ ไม่สามารถลบตัวเองได้ขณะที่กำลังใช้งานระบบอยู่");
        return;
    }

    try {
        const snapshot = await window.get(window.ref(window.db, `users`));
        if (!snapshot.exists()) return;
        const users = snapshot.val();

        if (users[username] && users[username].role === 'admin') {
            const admins = Object.entries(users).filter(([_, data]) => data.role === 'admin');
            if (admins.length <= 1) {
                alert("❌ ไม่สามารถลบได้: ระบบจำเป็นต้องมีบัญชี Admin อย่างน้อย 1 บัญชี");
                return;
            }
        }

        if (confirm(`⚠️ ยืนยันการลบผู้ใช้ "${username}" ออกจากระบบถาวร?`)) {
            await window.remove(window.ref(window.db, `online_users/${username}`));
            await window.remove(window.ref(window.db, `users/${username}`));
            alert(`✅ ลบผู้ใช้ ${username} สำเร็จ`);
            await renderUserTable();
            updateCompactOnlineUsers();
        }
    } catch (error) {
        console.error("❌ ลบผู้ใช้ไม่สำเร็จ:", error);
        alert("❌ เกิดข้อผิดพลาดในการลบผู้ใช้: " + error.message);
    }
};

async function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">📥 กำลังโหลดข้อมูลผู้ใช้...</td></tr>';

    try {
        const snapshot = await window.get(window.ref(window.db, 'users'));
        if (snapshot.exists()) {
            const users = snapshot.val();
            tbody.innerHTML = '';
            for (const [username, userData] of Object.entries(users)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Username"><strong style="color:#1b5e20;">${escapeHtml(username)}</strong></td>
                    <td data-label="Password"><span style="font-family: monospace; font-size: 0.85rem;">${escapeHtml(userData.password || '******')}</span></td>
                    <td data-label="Role"><span class="role-badge ${userData.role === 'admin' ? 'role-admin' : 'role-user'}">${userData.role === 'admin' ? '👑 Admin' : '👤 User'}</span></td>
                    <td data-label="Action">
                        <button onclick="editUser('${escapeHtml(username)}', '${escapeHtml(userData.password || '')}', '${userData.role}')" class="btn-small edit-btn" style="background:#ffa726; color:white; margin-right:8px;">✏️ แก้ไข</button>
                        <button onclick="confirmDeleteUser('${escapeHtml(username)}')" class="btn-small danger">🗑️ ลบ</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">📭 ยังไม่มีข้อมูลผู้ใช้</td></tr>';
        }
    } catch (error) {
        console.error("Error loading users:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: #d32f2f;">❌ โหลดข้อมูลล้มเหลว: ${error.message}</td></tr>`;
    }
}

// ============================================================
//  11. DEVICE MANAGEMENT
// ============================================================
window.openDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
        renderDeviceTable();
        renderBoardTable();
        resetDeviceForm();
        renderLevelConfigInline(null);
        setTimeout(() => {
            initTemplateSelector();
            renderTemplateSelector();
        }, 100);
        setTimeout(() => {
            scanForNewSensors();
        }, 800);
    }
};

window.closeDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'none';
        resetDeviceForm();
    }
};

window.toggleDevice = async function(id, currentStatus) {
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), { enabled: !currentStatus });
        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
        updateStatusBarBoardDetails();
    } catch (e) {
        console.error("❌ toggleDevice error:", e);
        alert("❌ เปลี่ยนสถานะไม่สำเร็จ: " + e.message);
    }
};

window.deleteDevice = async function(id) {
    if (confirm(`⚠️ ยืนยันการลบอุปกรณ์ ${id} ออกจากระบบถาวร?`)) {
        try {
            await window.remove(window.ref(window.db, `device_configs/${id}`));
            renderDeviceTable();
            renderBoardTable();
            renderSensorCards();
            updateChartStructure();
            updateStandaloneAlertPanel();
            renderSummaryTable();
            updateAlertHistoryDropdown();
            updateStatusBarBoardDetails();
        } catch (e) {
            console.error("❌ deleteDevice error:", e);
            alert("❌ ลบไม่สำเร็จ: " + e.message);
        }
    }
};

function resetDeviceForm() {
    document.getElementById('devId').value = '';
    document.getElementById('devId').readOnly = false;
    document.getElementById('devName').value = '';
    document.getElementById('devUnit').value = '';
    document.getElementById('devTypeCustom').value = '';
    document.getElementById('installHeight').value = '';
    document.getElementById('bankHeight').value = '';

    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) alertCheckbox.checked = true;

    document.getElementById('alertThreshold').value = '';
    document.getElementById('alertRateChange').value = '';
    document.getElementById('alertRateTime').value = '';
    document.getElementById('alertLimit').value = '';
    document.getElementById('alertInterval').value = '';

    renderLevelConfigInline(null);

    const saveBtn = document.getElementById('saveSensorBtn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึกข้อมูลเซนเซอร์';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds(false)');
    }

    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) modeSelect.value = 'manual';
    toggleLevelMode();

    document.getElementById('autoMin').value = '';
    document.getElementById('autoMax').value = '';
    document.getElementById('riverMin').value = '';
    document.getElementById('riverNormal').value = '';
    document.getElementById('riverWarning').value = '';
    document.getElementById('riverCritical').value = '';
}

// ============================================================
//  12. RENDER DEVICE TABLE
// ============================================================
function renderDeviceTable() {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;

    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');

    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 40px; color:#64748b;">📭 ยังไม่มีข้อมูลเซนเซอร์</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const [id, config] of sensors) {
        const tr = document.createElement('tr');

        const unitDisplay = config.unit ? escapeHtml(config.unit) : '-';
        let typeDisplay = config.type;
        const typeMap = { 'ultrasonic': '📡 Ultrasonic', 'soil': '🌱 Soil', 'rain': '🌧️ Rain', 'ph': '🧪 pH', 'temp': '🌡️ Temperature' };
        typeDisplay = typeMap[config.type] || `📝 ${config.type}`;

        const levels = config.levels || null;
        const levelDisplay = levels ? createLevelBarsHTML(levels) : '<span style="color:#64748b; font-size:0.6rem;">-</span>';

        const advanced = config.advancedAlert || {};
        const criticalVal = advanced.threshold !== null && advanced.threshold !== undefined ? advanced.threshold : '-';
        const rateVal = advanced.rateChange !== null && advanced.rateChange !== undefined ? advanced.rateChange : '-';
        const timeVal = advanced.rateTime !== null && advanced.rateTime !== undefined ? advanced.rateTime : '-';

        const alertLimit = config.alertLimit !== undefined ? config.alertLimit : 3;
        const alertInterval = config.alertInterval !== undefined ? config.alertInterval : 5;

        const isEnabled = config.enabled !== false;
        const statusIcon = isEnabled ? '✅' : '❌';
        const statusColor = isEnabled ? '#4caf50' : '#ef4444';

        let ultrasonicInfo = '';
        if (config.type === 'ultrasonic' && (config.installHeight || config.bankHeight)) {
            ultrasonicInfo = `<div style="font-size:0.6rem; color:#60a5fa; margin-top:2px;">📏 ติดตั้ง: ${config.installHeight || '-'} cm | ตลิ่ง: ${config.bankHeight || '-'} cm</div>`;
        }

        tr.innerHTML = `
            <td data-label="ID"><strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong><span style="font-size: 0.7rem; color: ${statusColor}; margin-left: 4px;">${statusIcon}</span></td>
            <td data-label="ชื่อจุดติดตั้ง"><strong>📛 ${escapeHtml(config.name)}</strong>${ultrasonicInfo}</td>
            <td data-label="ชนิดเซนเซอร์">${typeDisplay}</td>
            <td data-label="หน่วยวัด" style="text-align: center;"><strong>${unitDisplay}</strong></td>
            <td data-label="ระดับการแจ้งเตือน" style="font-size:0.7rem;">${levelDisplay}</td>
            <td data-label="ค่าวิกฤต" style="text-align: center; font-weight: bold; color: #ef4444;">${criticalVal}</td>
            <td data-label="อัตราเปลี่ยน" style="text-align: center; font-weight: bold; color: #f59e0b;">${rateVal}</td>
            <td data-label="เวลา(นาที)" style="text-align: center; font-weight: bold; color: #3b82f6;">${timeVal}</td>
            <td data-label="จำกัดครั้ง" style="text-align: center; font-weight: bold; color: #8b5cf6;">${alertLimit}</td>
            <td data-label="ความถี่(นาที)" style="text-align: center; font-weight: bold; color: #ec4899;">${alertInterval}</td>
            <td data-label="จัดการ">
                <button class="btn-small edit-btn" style="background:#ffa726; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:5px;" onclick="handleEditClickWithThresholds('${id}')">✏️ แก้ไข</button>
                <button onclick="confirmDeleteDevice('${escapeHtml(id)}')" class="btn-small danger" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

// ============================================================
//  13. LEVEL CONFIG
// ============================================================
function renderLevelConfigInline(levels) {
    const container = document.getElementById('levelConfigInlineContainer');
    if (!container) return;

    if (!levels) {
        levels = JSON.parse(JSON.stringify(DEFAULT_LEVELS_CONFIG));
    }

    let html = '';
    LEVEL_KEYS.forEach(key => {
        const level = levels[key] || DEFAULT_LEVELS_CONFIG[key];
        html += `
            <div class="level-item-inline" data-level="${key}" style="background: #1e293b; padding: 8px 12px; border-radius: 6px; border: 1px solid #334155;">
                <div class="level-header" style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${LEVEL_COLORS[key]};"></span>
                    <span style="color: #e2e8f0; font-size: 0.75rem; font-weight: 600;">${LEVEL_EMOJIS[key]} ${LEVEL_NAMES[key]}</span>
                </div>
                <div class="level-inputs" style="display: flex; gap: 4px; align-items: center;">
                    <input type="number" class="level-min-inline" data-level="${key}" value="${level.min !== undefined ? level.min : 0}" min="0" max="100" placeholder="Min" style="width: 45px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.7rem; text-align: center;">
                    <span style="color: #64748b; font-size: 0.6rem;">-</span>
                    <input type="number" class="level-max-inline" data-level="${key}" value="${level.max !== undefined ? level.max : 100}" min="0" max="100" placeholder="Max" style="width: 45px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.7rem; text-align: center;">
                </div>
                <input type="text" class="level-label-inline" data-level="${key}" value="${level.label || LEVEL_NAMES[key]}" placeholder="ป้ายชื่อ" style="width: 100%; margin-top: 3px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #94a3b8; font-size: 0.6rem;">
            </div>
        `;
    });

    container.innerHTML = html;
}

function createLevelBarsHTML(levels) {
    if (!levels) return '<span style="color:#64748b; font-size:0.6rem;">-</span>';
    let html = '';
    for (const key in levels) {
        const level = levels[key];
        if (level) {
            html += `<span style="background:${level.color || '#9ca3af'}; color:white; padding:2px 6px; border-radius:4px; font-size:0.6rem; margin-right:2px; display:inline-block;" title="${level.min}-${level.max}">${level.label || key}</span>`;
        }
    }
    return html || '<span style="color:#64748b; font-size:0.6rem;">-</span>';
}

function evaluateLevelWithCustom(value, levels) {
    if (!levels || typeof value !== 'number' || isNaN(value)) {
        return { key: 'unknown', label: 'ไม่มีข้อมูล', color: '#9ca3af' };
    }
    for (const key of LEVEL_KEYS) {
        const level = levels[key];
        if (level && value >= level.min && value <= level.max) {
            return { key: key, label: level.label || key, color: level.color || LEVEL_COLORS[key] || '#9ca3af' };
        }
    }
    return { key: 'unknown', label: 'นอกเกณฑ์', color: '#9ca3af' };
}

function getLevelConfigFromForm() {
    const container = document.getElementById('levelConfigInlineContainer');
    if (!container) return null;

    const levels = {};
    let isValid = true;
    const errors = [];

    LEVEL_KEYS.forEach(key => {
        const minInput = container.querySelector(`.level-min-inline[data-level="${key}"]`);
        const maxInput = container.querySelector(`.level-max-inline[data-level="${key}"]`);
        const labelInput = container.querySelector(`.level-label-inline[data-level="${key}"]`);

        if (minInput && maxInput && labelInput) {
            const min = parseFloat(minInput.value);
            const max = parseFloat(maxInput.value);
            const label = labelInput.value.trim() || LEVEL_NAMES[key];

            if (isNaN(min) || isNaN(max)) {
                isValid = false;
                errors.push(`ระดับ ${key}: กรุณากรอกตัวเลข`);
                return;
            }

            if (min >= max) {
                isValid = false;
                errors.push(`ระดับ ${key}: Min (${min}) ต้องน้อยกว่า Max (${max})`);
                return;
            }

            levels[key] = { min, max, label, color: LEVEL_COLORS[key] };
        }
    });

    if (isValid) {
        const ranges = LEVEL_KEYS.map(key => ({ key, min: levels[key].min, max: levels[key].max }));
        ranges.sort((a, b) => a.min - b.min);
        for (let i = 0; i < ranges.length - 1; i++) {
            if (ranges[i].max >= ranges[i + 1].min) {
                isValid = false;
                errors.push(`ค่าระดับ ${ranges[i].key} (${ranges[i].min}-${ranges[i].max}) ทับซ้อนกับ ${ranges[i+1].key}`);
                break;
            }
        }
    }

    if (!isValid) {
        alert(`⚠️ ข้อมูลระดับไม่ถูกต้อง:\n${errors.join('\n')}`);
        return null;
    }

    return levels;
}

window.toggleLevelMode = function() {
    const modeSelect = document.getElementById('levelModeSelect');
    const boundaryContainer = document.getElementById('boundaryInputsContainer');
    const levelsContainer = document.getElementById('levelConfigInlineContainer');

    if (!modeSelect || !boundaryContainer || !levelsContainer) return;

    const mode = modeSelect.value;
    if (mode === 'boundary') {
        boundaryContainer.style.display = 'flex';
        levelsContainer.style.opacity = '0.6';
        levelsContainer.style.pointerEvents = 'none';
    } else {
        boundaryContainer.style.display = 'none';
        levelsContainer.style.opacity = '1';
        levelsContainer.style.pointerEvents = 'auto';
    }
};

window.applyBoundaryToLevels = function() {
    const b1 = parseFloat(document.getElementById('boundary1').value) || 0;
    const b2 = parseFloat(document.getElementById('boundary2').value) || 20;
    const b3 = parseFloat(document.getElementById('boundary3').value) || 40;
    const b4 = parseFloat(document.getElementById('boundary4').value) || 70;
    const b5 = parseFloat(document.getElementById('boundary5').value) || 90;

    if (b1 >= b2 || b2 >= b3 || b3 >= b4 || b4 >= b5) {
        alert('⚠️ ขีดจำกัดต้องเรียงจากน้อยไปมาก: 0 → 20 → 40 → 70 → 90');
        return;
    }

    const levels = {
        very_low: { min: b1, max: b2 - 1, label: '🟣 น้อยที่สุด', color: '#6366f1' },
        low: { min: b2, max: b3 - 1, label: '🔵 น้อย', color: '#3b82f6' },
        normal: { min: b3, max: b4 - 1, label: '🟢 ปานกลาง', color: '#10b981' },
        high: { min: b4, max: b5 - 1, label: '🟠 มาก', color: '#f59e0b' },
        very_high: { min: b5, max: 100, label: '🔴 มากที่สุด', color: '#ef4444' }
    };

    renderLevelConfigInline(levels);
    document.getElementById('levelConfigInlineContainer').dataset.boundaryApplied = 'true';
    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) {
        modeSelect.value = 'manual';
        toggleLevelMode();
    }
};

window.resetLevelConfigInline = function() {
    if (confirm('⚠️ รีเซ็ตการตั้งค่าระดับเป็นค่าเริ่มต้น?')) {
        renderLevelConfigInline(null);
        const container = document.getElementById('levelConfigInlineContainer');
        if (container) delete container.dataset.boundaryApplied;
    }
};

// ============================================================
//  14. SAVE & EDIT DEVICE
// ============================================================
window.saveDeviceWithThresholds = async function(isEdit = false) {
    const id = document.getElementById('devId').value.trim();
    const name = document.getElementById('devName').value.trim();
    const unit = document.getElementById('devUnit').value.trim();

    const selectedType = document.getElementById('devType').value;
    let type = selectedType;
    if (selectedType === 'other') {
        const customType = document.getElementById('devTypeCustom');
        if (customType) {
            type = customType.value.trim() || 'other';
        } else {
            type = 'other';
        }
    }

    const levels = getLevelConfigFromForm();
    if (!levels) return;

    const alertEnabledCheckbox = document.getElementById('devAlertEnabled');
    const alertEnabled = alertEnabledCheckbox ? alertEnabledCheckbox.checked : true;

    const alertThresholdInput = document.getElementById('alertThreshold');
    const alertRateChangeInput = document.getElementById('alertRateChange');
    const alertRateTimeInput = document.getElementById('alertRateTime');

    const advancedAlert = {
        threshold: alertThresholdInput?.value !== '' ? Number(alertThresholdInput.value) : null,
        rateChange: alertRateChangeInput?.value !== '' ? Number(alertRateChangeInput.value) : null,
        rateTime: alertRateTimeInput?.value !== '' ? Number(alertRateTimeInput.value) : null
    };

    const alertLimitInput = document.getElementById('alertLimit');
    const alertIntervalInput = document.getElementById('alertInterval');
    const alertLimit = alertLimitInput?.value !== '' ? parseInt(alertLimitInput.value) : 3;
    const alertInterval = alertIntervalInput?.value !== '' ? parseInt(alertIntervalInput.value) : 5;

    const installHeight = document.getElementById('installHeight').value !== '' ? Number(document.getElementById('installHeight').value) : null;
    const bankHeight = document.getElementById('bankHeight').value !== '' ? Number(document.getElementById('bankHeight').value) : null;

    if (type === 'ultrasonic' && installHeight !== null && bankHeight !== null) {
        if (bankHeight > installHeight) {
            alert("⚠️ คำเตือน: ระดับตลิ่งไม่ควรสูงกว่าระยะติดตั้ง (ก้นบ่อ)!");
            return;
        }
    }

    if (!id || !name) { alert("กรุณากรอก ID และ ชื่อจุดติดตั้ง"); return; }

    if (!isEdit) {
        try {
            const checkSnapshot = await window.get(window.ref(window.db, `device_configs/${id}`));
            if (checkSnapshot.exists()) {
                alert(`❌ ID ${id} มีอยู่ในระบบแล้ว กรุณาใช้ ID อื่น`);
                return;
            }
        } catch (err) {
            console.warn("⚠️ ตรวจสอบ ID ซ้ำไม่สำเร็จ:", err);
        }
    }

    try {
        const updateData = {
            name: name,
            type: type,
            unit: unit,
            levels: levels,
            advancedAlert: advancedAlert,
            alertEnabled: alertEnabled,
            alertLimit: alertLimit,
            alertInterval: alertInterval,
            installHeight: installHeight,
            bankHeight: bankHeight,
            updatedAt: new Date().toISOString()
        };

        if (!isEdit) {
            updateData.enabled = true;
            updateData.alert_count = 0;
            updateData.is_acknowledged = false;
            updateData.last_alert_time = null;
            updateData.lastSeen = new Date().toISOString();
        }

        await window.update(window.ref(window.db, `device_configs/${id}`), updateData);

        if (deviceConfigs[id]) {
            deviceConfigs[id] = { ...deviceConfigs[id], ...updateData };
        }

        const actionText = isEdit ? 'อัปเดต' : 'เพิ่ม';
        alert(`✅ ${actionText}อุปกรณ์ ${id} สำเร็จ`);

        resetDeviceForm();
        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        renderSummaryTable();
        updateAlertHistoryDropdown();
        updateStatusBarBoardDetails();

    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
        console.error("❌ saveDeviceWithThresholds error:", error);
    }
};

window.handleEditClickWithThresholds = function(id) {
    const config = deviceConfigs[id];
    if (!config) { alert("ไม่พบข้อมูลอุปกรณ์"); return; }

    document.getElementById('devId').value = id;
    document.getElementById('devId').readOnly = true;
    document.getElementById('devName').value = config.name || '';
    document.getElementById('devUnit').value = config.unit || '';

    const typeSelect = document.getElementById('devType');
    const customContainer = document.getElementById('customTypeContainer');
    const customInput = document.getElementById('devTypeCustom');

    const optionExists = Array.from(typeSelect.options).some(opt => opt.value === config.type);
    if (optionExists) {
        typeSelect.value = config.type;
        if (customContainer) customContainer.style.display = 'none';
    } else {
        typeSelect.value = 'other';
        if (customContainer) customContainer.style.display = 'block';
        if (customInput) customInput.value = config.type || '';
    }

    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) {
        alertCheckbox.checked = (config.alertEnabled !== false);
    }

    if (config.advancedAlert) {
        const adv = config.advancedAlert;
        document.getElementById('alertThreshold').value = adv.threshold !== undefined && adv.threshold !== null ? adv.threshold : '';
        document.getElementById('alertRateChange').value = adv.rateChange !== undefined && adv.rateChange !== null ? adv.rateChange : '';
        document.getElementById('alertRateTime').value = adv.rateTime !== undefined && adv.rateTime !== null ? adv.rateTime : '';
    } else {
        document.getElementById('alertThreshold').value = '';
        document.getElementById('alertRateChange').value = '';
        document.getElementById('alertRateTime').value = '';
    }

    const alertLimitInput = document.getElementById('alertLimit');
    const alertIntervalInput = document.getElementById('alertInterval');
    if (alertLimitInput) {
        alertLimitInput.value = config.alertLimit !== undefined ? config.alertLimit : 3;
    }
    if (alertIntervalInput) {
        alertIntervalInput.value = config.alertInterval !== undefined ? config.alertInterval : 5;
    }

    document.getElementById('installHeight').value = config.installHeight !== undefined && config.installHeight !== null ? config.installHeight : '';
    document.getElementById('bankHeight').value = config.bankHeight !== undefined && config.bankHeight !== null ? config.bankHeight : '';

    if (config.levels && Object.keys(config.levels).length > 0) {
        renderLevelConfigInline(config.levels);
    } else {
        renderLevelConfigInline(null);
    }

    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) modeSelect.value = 'manual';
    toggleLevelMode();

    const saveBtn = document.getElementById('saveSensorBtn');
    if (saveBtn) {
        saveBtn.textContent = '💾 อัปเดตข้อมูลเซนเซอร์';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds(true)');
    }

    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
    }

    updateCustomTypeVisibility();

    renderDeviceTable();
    renderBoardTable();
    updateAlertHistoryDropdown();
};

// ============================================================
//  15. AUTO-SCAN SENSOR DISCOVERY
// ============================================================
window.scanForNewSensors = async function() {
    const resultsContainer = document.getElementById('discoveryResults');
    if (!resultsContainer) {
        console.warn("⚠️ ไม่พบ container #discoveryResults");
        return;
    }

    resultsContainer.innerHTML = '<span style="color: #60a5fa; animation: pulse 1s infinite;">⏳ กำลังตรวจหาสัญญาณจากเซนเซอร์ที่ออนไลน์อยู่...</span>';

    try {
        const configSnap = await window.get(window.ref(window.db, 'device_configs'));
        const allDevices = configSnap.exists() ? configSnap.val() : {};

        const currentSnap = await window.get(window.ref(window.db, 'sensors/current'));
        
        if (!currentSnap.exists()) {
            resultsContainer.innerHTML = `<div style="color: #f59e0b; padding: 12px; background: #451a03; border-radius: 8px; border: 1px solid #f59e0b;">⚠️ ไม่พบข้อมูลเซนเซอร์ใน <code>sensors/current</code><span style="display: block; font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">💡 ลองเช็คว่า ESP32 ส่งค่ามาที่ Firebase แล้วหรือยัง</span></div>`;
            return;
        }

        const currentData = currentSnap.val();
        let activeSensors = [];

        Object.entries(currentData).forEach(([key, value]) => {
            if (key.startsWith('_')) return;
            if (key === 'meta') return;
            if (!allDevices[key] && typeof value === 'number') {
                activeSensors.push({ id: key, value: value });
            }
        });

        if (activeSensors.length === 0) {
            resultsContainer.innerHTML = `<div style="color: #10b981; padding: 12px; background: #064e3b; border-radius: 8px; border: 1px solid #10b981;">✅ ตรวจสอบแล้ว: ไม่พบเซนเซอร์ใหม่ที่กำลังส่งค่าออนไลน์อยู่ในขณะนี้<span style="display: block; font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">💡 ถ้ามีเซนเซอร์ใหม่ ลองรอให้ ESP32 ส่งค่าก่อน แล้วกดสแกนใหม่</span></div>`;
            return;
        }

        resultsContainer.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'color: #e2e8f0; font-weight: bold; margin-bottom: 10px; font-size: 0.9rem;';
        header.textContent = `📡 พบเซนเซอร์ออนไลน์ใหม่ ${activeSensors.length} ตัว:`;
        resultsContainer.appendChild(header);

        activeSensors.forEach(sensor => {
            const btn = document.createElement('button');
            btn.style.cssText = `margin: 5px; padding: 12px 18px; border-radius: 8px; border: 2px solid #10b981; background: #064e3b; color: #e2e8f0; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;`;
            btn.onmouseover = function() { this.style.background = '#065f46'; this.style.borderColor = '#34d399'; this.style.transform = 'scale(1.02)'; };
            btn.onmouseout = function() { this.style.background = '#064e3b'; this.style.borderColor = '#10b981'; this.style.transform = 'scale(1)'; };

            const statusDot = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#4ade80; animation:pulse 1.5s infinite;"></span>';
            btn.innerHTML = `${statusDot}<strong>${escapeHtml(sensor.id)}</strong><span style="font-size:0.7rem; color: #94a3b8;">ค่า: ${sensor.value}</span>`;

            btn.onclick = async () => {
                if (!confirm(`⚠️ ยืนยันการติดตั้งเซนเซอร์ "${sensor.id}"\n📊 ค่าปัจจุบัน: ${sensor.value}\n\nต้องการติดตั้งเข้าสู่ระบบใช่หรือไม่?`)) return;

                const deviceModal = document.getElementById('deviceModal');
                if (deviceModal) deviceModal.style.display = 'flex';

                const idInput = document.getElementById('devId');
                if (idInput) {
                    idInput.value = sensor.id;
                    idInput.readOnly = true;
                    idInput.style.backgroundColor = '#064e3b';
                    setTimeout(() => { idInput.style.backgroundColor = ''; }, 2000);
                }

                const nameInput = document.getElementById('devName');
                if (nameInput && !nameInput.value) {
                    nameInput.value = `เซนเซอร์ (${sensor.id})`;
                }

                const typeSelect = document.getElementById('devType');
                const unitInput = document.getElementById('devUnit');
                
                if (typeSelect && unitInput) {
                    const detectedType = autoDetectSensorType(sensor.id);
                    const detectedUnit = getDefaultUnit(detectedType);
                    
                    if (detectedType !== 'other') {
                        typeSelect.value = detectedType;
                        unitInput.value = detectedUnit;
                        if (SENSOR_TEMPLATES[detectedType]) {
                            loadSensorTemplate(detectedType);
                        }
                    }
                }

                const saveBtn = document.getElementById('saveSensorBtn');
                if (saveBtn) {
                    saveBtn.textContent = '💾 บันทึกข้อมูลเซนเซอร์';
                    saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds(false)');
                }
                
                document.getElementById('devId').readOnly = false;
                updateCustomTypeVisibility();
                
                alert(`✅ เตรียมตั้งค่าเซนเซอร์ "${sensor.id}" เรียบร้อย\n📊 ค่าปัจจุบัน: ${sensor.value}\n\nกรุณาตรวจสอบข้อมูลและกดบันทึก`);
            };
            resultsContainer.appendChild(btn);
        });

        const autoInstallBtn = document.createElement('button');
        autoInstallBtn.style.cssText = `margin: 10px 5px; padding: 12px 24px; border-radius: 8px; border: none; background: #10b981; color: white; cursor: pointer; font-size: 0.9rem; font-weight: bold; transition: all 0.2s; display: block; width: 100%; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);`;
        autoInstallBtn.onmouseover = function() { this.style.background = '#059669'; this.style.transform = 'scale(1.01)'; };
        autoInstallBtn.onmouseout = function() { this.style.background = '#10b981'; this.style.transform = 'scale(1)'; };
        autoInstallBtn.textContent = `⚡ ติดตั้งอัตโนมัติทั้งหมด (${activeSensors.length} ตัว)`;

        autoInstallBtn.onclick = async () => {
            if (!confirm(`⚠️ ยืนยันการติดตั้งอัตโนมัติ ${activeSensors.length} ตัว?`)) return;
            
            let successCount = 0;
            let failList = [];
            
            for (const sensor of activeSensors) {
                try {
                    const detectedType = autoDetectSensorType(sensor.id);
                    await window.set(window.ref(window.db, `device_configs/${sensor.id}`), {
                        name: `เซนเซอร์ (${sensor.id})`,
                        type: detectedType,
                        unit: getDefaultUnit(detectedType),
                        enabled: true,
                        alertEnabled: true,
                        levels: SENSOR_TEMPLATES[detectedType]?.levels || null,
                        advancedAlert: { threshold: null, rateChange: null, rateTime: null },
                        alertLimit: 3,
                        alertInterval: 5,
                        createdAt: new Date().toISOString(),
                        lastSeen: new Date().toISOString(),
                        alert_count: 0,
                        is_acknowledged: false,
                        last_alert_time: null,
                        initialValue: sensor.value
                    });
                    successCount++;
                } catch (err) {
                    console.error(`❌ ติดตั้ง ${sensor.id} ล้มเหลว:`, err);
                    failList.push(sensor.id);
                }
            }
            
            if (failList.length === 0) {
                alert(`✅ ติดตั้งเสร็จสิ้น: สำเร็จ ${successCount} ตัว`);
            } else {
                alert(`⚠️ ติดตั้งเสร็จสิ้น: สำเร็จ ${successCount} ตัว, ล้มเหลว ${failList.length} ตัว\n❌ ${failList.join(', ')}`);
            }
            
            renderDeviceTable();
            renderBoardTable();
            renderSensorCards();
            updateChartStructure();
            updateAlertHistoryDropdown();
            renderSummaryTable();
            updateStatusBarBoardDetails();
            setTimeout(() => scanForNewSensors(), 500);
        };
        resultsContainer.appendChild(autoInstallBtn);

        const rescanBtn = document.createElement('button');
        rescanBtn.style.cssText = `margin: 5px; padding: 10px 20px; border-radius: 8px; border: 1px solid #475569; background: transparent; color: #94a3b8; cursor: pointer; font-size: 0.8rem; transition: all 0.2s; display: block; margin-top: 8px;`;
        rescanBtn.onmouseover = function() { this.style.background = '#1e293b'; this.style.color = '#e2e8f0'; };
        rescanBtn.onmouseout = function() { this.style.background = 'transparent'; this.style.color = '#94a3b8'; };
        rescanBtn.textContent = '🔄 สแกนใหม่';
        rescanBtn.onclick = () => scanForNewSensors();
        resultsContainer.appendChild(rescanBtn);

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `margin-top: 10px; padding: 8px 12px; color: #64748b; font-size: 0.7rem; border-top: 1px solid #1e293b; text-align: center;`;
        infoDiv.textContent = `💡 พบ ${activeSensors.length} เซนเซอร์ • อัปเดตล่าสุด: ${new Date().toLocaleTimeString('th-TH')}`;
        resultsContainer.appendChild(infoDiv);

    } catch (error) {
        console.error("❌ Scan Error:", error);
        resultsContainer.innerHTML = `<div style="color: #ef4444; padding: 12px; background: #4a044e; border-radius: 8px; border: 1px solid #ef4444;">❌ เกิดข้อผิดพลาด: ${error.message}<span style="display: block; font-size: 0.8rem; color: #94a3b8; margin-top: 4px;">💡 กรุณาตรวจสอบการเชื่อมต่อ Firebase หรือลองสแกนใหม่</span></div>`;
    }
};

function autoDetectSensorType(id) {
    if (!id) return 'other';
    const lower = id.toLowerCase();
    if (lower.includes('us') || lower.includes('ultra') || lower.includes('water') || lower.includes('river') || lower.includes('depth')) return 'ultrasonic';
    if (lower.includes('soil') || lower.includes('moist') || lower.includes('humidity')) return 'soil';
    if (lower.includes('temp') || lower.includes('temperature')) return 'temp';
    if (lower.includes('ph')) return 'ph';
    if (lower.includes('rain') || lower.includes('pluvio')) return 'rain';
    return 'other';
}

function getDefaultUnit(type) {
    const map = { 'ultrasonic': 'cm', 'soil': '%', 'temp': '°C', 'ph': 'pH', 'rain': 'mm' };
    return map[type] || '';
}

// ============================================================
//  16. PROVISIONING (USB)
// ============================================================
window.startProvisioningProcess = async function() {
    if (!("serial" in navigator)) {
        alert("❌ เบราว์เซอร์ของคุณไม่รองรับการติดตั้งผ่าน USB (กรุณาใช้ Chrome หรือ Edge)");
        return;
    }

    try {
        let port;
        try {
            port = await navigator.serial.requestPort();
        } catch (e) {
            console.log("ผู้ใช้ยกเลิกการเลือกพอร์ต");
            return;
        }

        const boardId = prompt("🆔 กรุณาระบุ ID สำหรับบอร์ดนี้ (เช่น esp32_node_01):");
        if (!boardId) return;

        const ssid = prompt("📶 ชื่อ WiFi (SSID):");
        if (!ssid) return;

        const pass = prompt("🔑 รหัสผ่าน WiFi:");

        await port.open({ baudRate: 115200 });

        console.log("⏳ กำลังรอให้บอร์ดบูตเสร็จ...");
        await new Promise(resolve => setTimeout(resolve, 2500));

        console.log("📡 กำลังรอสัญญาณ READY จากบอร์ด...");
        let ready = false;
        let readyTimeout = false;
        const timeoutId = setTimeout(() => {
            readyTimeout = true;
            console.warn("⏱️ หมดเวลารอ READY (5 วินาที)");
        }, 5000);

        try {
            const reader = port.readable.getReader();
            let buffer = '';
            while (!ready && !readyTimeout) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = new TextDecoder().decode(value);
                buffer += chunk;
                if (buffer.includes("READY")) {
                    ready = true;
                    console.log("✅ ได้รับสัญญาณ READY จากบอร์ด!");
                    break;
                }
                if (buffer.length > 1024) buffer = buffer.slice(-512);
            }
            reader.releaseLock();
        } catch (e) {
            console.warn("⚠️ อ่าน Serial ไม่สำเร็จ:", e);
        }
        clearTimeout(timeoutId);

        const configData = { id: boardId, ssid: ssid, password: pass || "" };
        console.log("📤 กำลังส่งข้อมูล Provisioning:", configData);

        const writer = port.writable.getWriter();
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(JSON.stringify(configData) + "\n"));
        writer.releaseLock();

        console.log("⏳ กำลังรอให้บอร์ดประมวลผล...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (window.db) {
            const boardRef = window.ref(window.db, `device_configs/${boardId}`);
            const snap = await window.get(boardRef);
            if (!snap.exists()) {
                await window.set(boardRef, {
                    name: "บอร์ดควบคุม (" + boardId + ")",
                    type: "board",
                    enabled: true,
                    status: "online",
                    onlineSince: new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                });
                console.log(`✅ สร้างบอร์ด ${boardId} ใน Firebase สำเร็จ`);
            } else {
                await window.update(boardRef, {
                    status: "online",
                    onlineSince: new Date().toISOString(),
                    lastSeen: new Date().toISOString()
                });
                console.log(`✅ อัปเดตสถานะบอร์ด ${boardId} สำเร็จ`);
            }
        }

        await port.close();
        alert(`✅ ติดตั้งบอร์ด ${boardId} สำเร็จ!`);
        renderBoardTable();
        renderDeviceTable();
        updateStandaloneAlertPanel();
        updateStatusBarBoardDetails();

    } catch (error) {
        console.error("❌ Provisioning Error:", error);
        alert("❌ การติดตั้งล้มเหลว: " + error.message);
    }
};

// ============================================================
//  17. SENSOR CARDS & CHART
// ============================================================
function renderSensorCards() {
    const container = document.getElementById('sensorGridContainer');
    container.innerHTML = '';
    let hasEnabledDevice = false;

    for (const [id, config] of Object.entries(deviceConfigs)) {
        if (config.type === 'board') continue;
        hasEnabledDevice = true;

        const isEnabled = config.enabled !== false;
        let displayValue = isEnabled ? (currentSensorValues[id] ?? '--') : "ปิดอยู่";

        if (isEnabled && config.type === 'ultrasonic' && config.installHeight && currentSensorValues[id] !== undefined && currentSensorValues[id] !== null) {
            const rawDistance = parseFloat(currentSensorValues[id]);
            if (!isNaN(rawDistance)) {
                const actualWaterLevel = config.installHeight - rawDistance;
                displayValue = actualWaterLevel.toFixed(2);
            }
        }

        const cardClass = isEnabled ? "sensor-card" : "sensor-card disabled-card";

        const timeStr = new Date().toLocaleTimeString();
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';

        const alertStatus = floodAlertStatus[id] || 'normal';
        let alertBadge = '';
        if (isEnabled && config.type === 'ultrasonic' && alertStatus === 'flood') {
            alertBadge = `<div class="alert-badge flood" style="background: #d32f2f; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center; animation: alertPulse 1.5s infinite;">⚠️ น้ำล้นตลิ่ง!</div>`;
        } else if (isEnabled && config.type === 'ultrasonic' && alertStatus === 'warning') {
            alertBadge = `<div class="alert-badge warning" style="background: #f57c00; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center;">⚠️ ระดับน้ำใกล้ตลิ่ง</div>`;
        }

        const valueDisplay = isEnabled ? `<span id="val_${id}">${displayValue}</span>` : `<span style="color: #94a3b8; font-weight: 400;">${displayValue}</span>`;

        const cardHTML = `
            <div class="${cardClass}" id="card_${id}">
                <div class="sensor-title">${icon} ${escapeHtml(config.name)}</div>
                <div class="sensor-value">${valueDisplay}<span class="sensor-unit">${isEnabled ? escapeHtml(config.unit) : ''}</span></div>
                <div id="levelBadge_${id}" class="sensor-level-badge-container"></div>
                ${alertBadge}
                <div class="timestamp" id="time_${id}">${isEnabled ? `อัปเดต: ${displayValue !== '--' && displayValue !== 'ปิดอยู่' ? timeStr : 'รอข้อมูล...'}` : '⏸️ อุปกรณ์ปิดอยู่'}</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);

        if (isEnabled && displayValue !== '--' && displayValue !== 'ปิดอยู่' && !isNaN(displayValue)) {
            updateSensorCardLevel(id, parseFloat(displayValue));
        }
    }

    if (!hasEnabledDevice) {
        container.innerHTML = '<div style="width:100%; text-align:center; color:#fff; grid-column: 1 / -1;">ไม่มีเซนเซอร์ที่เปิดใช้งาน</div>';
    }

    renderSummaryTable();
}

function updateSensorCardLevel(sensorId, value) {
    const container = document.getElementById(`levelBadge_${sensorId}`);
    if (!container) return;

    const config = deviceConfigs[sensorId];
    if (!config) return;

    const levels = config.levels || null;
    if (!levels) {
        container.innerHTML = '';
        return;
    }

    const result = evaluateLevelWithCustom(value, levels);
    if (result.key === 'unknown') {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="sensor-level-badge level-${result.key}" style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.65rem; font-weight:700; margin-top:4px; background:${result.color}; color:white;">
            ${result.label}
        </div>
    `;
}

function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: { title: { display: true, text: 'Real-time Data (เฉพาะอุปกรณ์ที่เปิด)' } }
        }
    });
    updateChartStructure();
}

function updateChartStructure() {
    if (!chart) return;
    const datasets = [];
    let index = 0;
    const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];

    Object.keys(deviceConfigs).forEach((id) => {
        const config = deviceConfigs[id];
        if (!config.enabled) return;
        if (config.type === 'board') return;
        const color = colors[index % colors.length];
        index++;
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        datasets.push({
            label: `${config.name} (${config.unit})`,
            data: sensorHistory.data[id],
            borderColor: color,
            backgroundColor: color + '33',
            tension: 0.1,
            fill: true
        });
    });

    chart.data.datasets = datasets;
    chart.update();
}

// ============================================================
//  18. PROCESS NEW DATA
// ============================================================
async function processNewData(dataObj) {
    const timeNow = new Date();
    currentSensorValues = dataObj;
    sensorHistory.timestamps.push(timeNow.toLocaleTimeString());
    if (sensorHistory.timestamps.length > 100) sensorHistory.timestamps.shift();

    for (const [id, value] of Object.entries(dataObj)) {
        const config = deviceConfigs[id];
        if (!config) continue;

        await updateDeviceLastSeen(id);

        if (!config.enabled) continue;
        if (config.type === 'board') continue;

        let displayValue = value;

        if (config.type === 'ultrasonic' && config.installHeight) {
            const rawDistance = parseFloat(value);
            if (!isNaN(rawDistance)) {
                const actualWaterLevel = config.installHeight - rawDistance;
                displayValue = actualWaterLevel.toFixed(2);
                
                if (config.bankHeight && actualWaterLevel >= config.bankHeight) {
                    floodAlertStatus[id] = 'flood';
                } else if (config.bankHeight && actualWaterLevel >= (config.bankHeight * 0.8)) {
                    floodAlertStatus[id] = 'warning';
                } else {
                    floodAlertStatus[id] = 'normal';
                }
            }
        }

        const valEl = document.getElementById(`val_${id}`);
        const timeEl = document.getElementById(`time_${id}`);

        if (valEl) valEl.textContent = displayValue;
        if (timeEl) timeEl.textContent = `อัปเดต: ${timeNow.toLocaleTimeString()}`;

        if (!isNaN(displayValue)) {
            updateSensorCardLevel(id, parseFloat(displayValue));
        }

        if (config.type === 'ultrasonic') {
            const status = checkFloodAlert(id, parseFloat(displayValue), config);
            floodAlertStatus[id] = status;

            const card = document.getElementById(`card_${id}`);
            if (card) {
                const oldBadge = card.querySelector('.alert-badge');
                if (oldBadge) oldBadge.remove();
                card.classList.remove('flood-alert', 'warning-alert');

                let alertBadge = '';
                if (status === 'flood') {
                    card.classList.add('flood-alert');
                    alertBadge = `<div class="alert-badge flood" style="background: #d32f2f; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center; animation: alertPulse 1.5s infinite;">⚠️ น้ำล้นตลิ่ง!</div>`;
                } else if (status === 'warning') {
                    card.classList.add('warning-alert');
                    alertBadge = `<div class="alert-badge warning" style="background: #f57c00; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center;">⚠️ ระดับน้ำใกล้ตลิ่ง</div>`;
                }
                if (alertBadge) {
                    const timestamp = card.querySelector('.timestamp');
                    if (timestamp) {
                        timestamp.insertAdjacentHTML('beforebegin', alertBadge);
                    }
                }
            }
        }

        if (value !== undefined && value !== null) {
            if (config.alert_count > 0 || config.is_acknowledged === true) {
                resetDeviceAlertStatus(id);
            }
        }

        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        sensorHistory.data[id].push(parseFloat(displayValue));
        if (sensorHistory.data[id].length > 100) sensorHistory.data[id].shift();

        await analyzeSensorLogic(id, parseFloat(displayValue), config);
        await checkAllAlertConditions(id, parseFloat(displayValue), config);
    }

    if (chart) {
        chart.data.labels = sensorHistory.timestamps;
        chart.update('none');
    }
    
    updateStatusBarBoardDetails();
}

// ============================================================
//  19. FIREBASE LISTENERS
// ============================================================
function initFirebaseListeners() {
    if (!window.db) return;

    const offsetRef = window.ref(window.db, ".info/serverTimeOffset");
    window.onValue(offsetRef, (snap) => {
        serverTimeOffset = snap.val() || 0;
        console.log("⏱️ Server Time Offset:", serverTimeOffset, "ms");
    });

    initTitleListener();

    const configRef = window.ref(window.db, 'device_configs');
    window.onValue(configRef, (snapshot) => {
        deviceConfigs = snapshot.exists() ? snapshot.val() : {};
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        renderBoardTable();
        renderDeviceTable();
        updateAlertHistoryDropdown();
        updateStatusBarBoardDetails();
    });

    const currentRef = window.ref(window.db, 'sensors/current');
    window.onValue(currentRef, (snapshot) => {
        if (snapshot.exists()) processNewData(snapshot.val());
    });

    window.onValue(window.ref(window.db, ".info/connected"), (snap) => {
        const statusEl = document.getElementById('espStatus');
        if (snap.val() === true) {
            statusEl.className = 'connection-status online';
            statusEl.textContent = 'Connected (Firebase)';
        } else {
            statusEl.className = 'connection-status offline';
            statusEl.textContent = 'Disconnected';
        }
        updateStatusBarBoardDetails();
    });

    updateCompactOnlineUsers();
    initTelegramListeners();

    const muteRef = window.ref(window.db, 'settings/global_alert_muted');
    window.onValue(muteRef, (snapshot) => {
        globalAlertMuted = snapshot.exists() ? snapshot.val() : false;
        renderSummaryTable();
        const checkbox = document.getElementById('globalAlertMute');
        if (checkbox) checkbox.checked = globalAlertMuted;
        const statusText = document.getElementById('globalMuteStatus');
        if (statusText) {
            statusText.textContent = globalAlertMuted ? '🔕 ปิดการแจ้งเตือนอยู่' : '🔔 แจ้งเตือนปกติ';
            statusText.style.color = globalAlertMuted ? '#ef4444' : '#10b981';
        }
    });

    setTimeout(() => {
        updateStandaloneAlertPanel();
        updateStatusBarBoardDetails();
    }, 1000);
}

// ============================================================
//  20. BOARD TABLE
// ============================================================
function renderBoardTable() {
    const boardTbody = document.getElementById('boardTableBody');
    if (!boardTbody) return;

    const boards = Object.entries(deviceConfigs).filter(([id, config]) => config.type === 'board');

    if (boards.length === 0) {
        boardTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color:#64748b;">📭 ยังไม่มีบอร์ดที่ติดตั้ง</td></tr>';
        return;
    }

    boardTbody.innerHTML = '';
    const now = Date.now() + serverTimeOffset;

    boards.forEach(([id, config]) => {
        const tr = document.createElement('tr');
        
        // คำนวณสถานะออนไลน์
        const lastSeenTime = getTimestampMs(config.lastSeen);
        const isOnline = (now - lastSeenTime) < 420000; // 7 นาที
        
        // ดึงค่า RSSI
        const rssi = config.wifi_rssi || 0;
        const signalHtml = rssi !== 0 ? getSignalBarsHTML(rssi) : "📶 --";
        const rssiStatusText = getRSSIStatusText(rssi); // ดึงข้อความ "แรง" หรือ "ปานกลาง" จากฟังก์ชันเดิม
        
        // คำนวณ Uptime
        const uptimeDisplay = isOnline ? formatUptime(config.onlineSince || config.lastSeen) : "-";

        tr.innerHTML = `
            <td data-label="ID">
                <strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong>
            </td>
            <td data-label="สถานะ" style="padding: 10px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
                    <span style="color:${isOnline ? '#4caf50' : '#d32f2f'}; font-weight:bold;">
                        ${isOnline ? '🟢 ออนไลน์' : '🔴 ออฟไลน์'}
                    </span>
                    <span style="background: #1e293b; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; color: #60a5fa;">
                        ${rssi} dBm
                    </span>
                    <span style="font-size: 0.75rem; font-weight: bold; color: #fff;">${rssiStatusText.replace('📶 ', '')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #94a3b8;">
                    ${signalHtml}
                    <span>⏳ ออนไลน์ต่อเนื่อง: ${uptimeDisplay}</span>
                </div>
                <div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">
                    📅 ล่าสุด: ${lastSeenTime > 0 ? new Date(lastSeenTime).toLocaleString('th-TH') : '-'}
                </div>
            </td>
            <td data-label="จัดการ">
                <button onclick="toggleDevice('${escapeHtml(id)}', ${config.enabled})" style="background:${config.enabled ? '#ffa726' : '#4caf50'}; color:white; border:none; padding:6px 12px; border-radius:20px; cursor:pointer;">${config.enabled ? '⏸️ ปิด' : '▶️ เปิด'}</button>
                <button onclick="confirmDeleteDevice('${escapeHtml(id)}')" class="danger" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:20px; cursor:pointer;">🗑️ ลบ</button>
            </td>
        `;
        boardTbody.appendChild(tr);
    });
    
    updateStatusBarBoardDetails();
}

function filterBoardTable() {
    const searchInput = document.getElementById('searchBoard');
    if (!searchInput) return;
    const filter = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('#boardTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
    });
}

function filterSensorTable() {
    const searchInput = document.getElementById('searchSensor');
    if (!searchInput) return;
    const filter = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('#deviceTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
    });
}

// ============================================================
//  21. UPDATE DEVICE LAST SEEN (THROTTLE)
// ============================================================
async function updateDeviceLastSeen(id) {
    if (!window.db || !id) return;

    const now = Date.now();
    const THROTTLE_INTERVAL = window.__THROTTLE_INTERVAL_MS || 15000;

    if (lastUpdateTracker[id] && (now - lastUpdateTracker[id] < THROTTLE_INTERVAL)) {
        return;
    }

    try {
        const nowIso = new Date().toISOString();
        const config = deviceConfigs[id];
        const updateData = { lastSeen: nowIso };

        if (config && config.status === "offline") {
            updateData.status = "online";
            updateData.onlineSince = nowIso;
            updateData.alert_count = 0;
            updateData.is_acknowledged = false;
            updateData.last_alert_time = null;
            console.log(`✅ ${id} กลับมาออนไลน์ (รีเซ็ตสถานะ)`);
        } else if (config && config.status !== "offline") {
            if (!config.onlineSince) {
                updateData.onlineSince = config.lastSeen || nowIso;
            }
        }

        await window.update(window.ref(window.db, `device_configs/${id}`), updateData);
        lastUpdateTracker[id] = now;

        if (deviceConfigs[id]) {
            deviceConfigs[id].lastSeen = nowIso;
            if (updateData.status) {
                deviceConfigs[id].status = updateData.status;
                deviceConfigs[id].onlineSince = updateData.onlineSince;
                deviceConfigs[id].alert_count = 0;
                deviceConfigs[id].is_acknowledged = false;
                deviceConfigs[id].last_alert_time = null;
                renderBoardTable();
                updateStandaloneAlertPanel();
                renderSummaryTable();
                updateStatusBarBoardDetails();
            }
        }
    } catch (error) {
        console.error(`❌ อัปเดต lastSeen ของ ${id} ล้มเหลว:`, error);
    }
}

// ============================================================
//  22. DEVICE HEALTH MONITOR
// ============================================================
async function monitorDeviceHealth() {
    const now = Date.now() + serverTimeOffset;
    const devicesRef = window.ref(window.db, 'device_configs');
    const snapshot = await window.get(devicesRef);
    if (!snapshot.exists()) return;

    const devices = snapshot.val();

    for (const [id, config] of Object.entries(devices)) {
        if (config.enabled === false) continue;

        const lastSeenTime = getTimestampMs(config.lastSeen);
        const isActuallyOffline = (now - lastSeenTime) > 420000;

        if (isActuallyOffline) {
            if (config.status !== "offline") {
                console.log(`⚠️ อุปกรณ์ ${id} ขาดการติดต่อ สั่ง Offline (${Math.round((now - lastSeenTime)/60000)} นาที)`);
                await window.update(window.ref(window.db, `device_configs/${id}`), { status: "offline" });

                if (!config.is_acknowledged) {
                    const limit = config.alertLimit || 3;
                    const interval = (config.alertInterval || 5) * 60000;
                    await sendHealthAlert(id, config, "🚨 อุปกรณ์ออฟไลน์", limit, interval, now, "offline");
                }
            }
        } else {
            if (config.status === "offline") {
                console.log(`✅ ตรวจพบสัญญาณจาก ${id} สั่งเปลี่ยนสถานะเป็น Online`);
                await window.update(window.ref(window.db, `device_configs/${id}`), {
                    status: "online",
                    onlineSince: new Date().toISOString(),
                    alert_count: 0,
                    is_acknowledged: false,
                    last_alert_time: null
                });
                await sendHealthAlert(id, config, "✅ อุปกรณ์กลับมาออนไลน์", 1, 0, now, "online");
            }
        }
    }
    updateStandaloneAlertPanel();
    renderBoardTable();
    updateStatusBarBoardDetails();
}

async function sendHealthAlert(id, config, title, limit, interval, now, type) {
    const muted = await isAlertMuted();
    if (muted) return;

    const count = config.alert_count || 0;
    const lastTime = config.last_alert_time || 0;

    if (type === "online") {
        const msg = `${title}\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n⏱️ ${new Date().toLocaleString('th-TH')}`;
        await sendTelegramMessage(msg);
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            alert_count: 0,
            is_acknowledged: false
        });
        return;
    }

    if (count < limit && (now - lastTime) >= interval) {
        const msg = `${title}\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n🔢 ครั้งที่: ${count + 1}/${limit}\n⏱️ ${new Date().toLocaleString('th-TH')}`;
        const success = await sendTelegramMessage(msg);

        if (success) {
            await window.update(window.ref(window.db, `device_configs/${id}`), {
                alert_count: count + 1,
                last_alert_time: now
            });
        }
    }
}

async function sendTelegramMessage(message) {
    if (!window.db) return false;
    const muted = await isAlertMuted();
    if (muted) return false;

    try {
        const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        if (!configSnap.exists()) return false;
        const config = configSnap.val();
        const token = config.botToken;
        if (!token || token.trim() === '') return false;

        const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
        if (!subsSnap.exists()) return false;

        const subs = subsSnap.val();
        let success = false;
        for (let subId in subs) {
            const result = await sendTelegramTextManual(token, subs[subId].chatId, message);
            if (result) success = true;
        }
        return success;
    } catch (error) {
        console.error("❌ sendTelegramMessage error:", error);
        return false;
    }
}

async function sendTelegramTextManual(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
        });
        return response.ok;
    } catch (e) {
        console.error("❌ ส่งรายงานไม่สำเร็จ:", e);
        return false;
    }
}

function startDeviceHealthMonitor() {
    if (deviceHealthMonitorInterval) {
        clearInterval(deviceHealthMonitorInterval);
        deviceHealthMonitorInterval = null;
    }

    deviceHealthMonitorInterval = setInterval(async () => {
        try {
            const currentUser = sessionStorage.getItem('currentUser');
            if (!currentUser) return;
            await monitorDeviceHealth();
            await checkLevelAlerts();
            await checkAllAlertConditionsForAllDevices();
            updateStatusBarBoardDetails();
        } catch (error) {
            console.error("❌ deviceHealthMonitor error:", error);
        }
    }, 45000);

    console.log("✅ เริ่มระบบตรวจสอบสุขภาพอุปกรณ์อัตโนมัติ");
}

async function resetDeviceAlertStatus(id) {
    try {
        const deviceRef = window.ref(window.db, `device_configs/${id}`);
        const snapshot = await window.get(deviceRef);

        if (snapshot.exists()) {
            const config = snapshot.val();
            if (config.alert_count > 0 || config.is_acknowledged === true) {
                await window.update(deviceRef, {
                    alert_count: 0,
                    is_acknowledged: false,
                    last_alert_time: null
                });
                console.log(`🔄 รีเซ็ตสถานะการแจ้งเตือนของอุปกรณ์ ${id}`);
                updateStandaloneAlertPanel();
                renderDeviceTable();
                renderBoardTable();
                renderSummaryTable();
                updateStatusBarBoardDetails();
            }
        }
    } catch (error) {
        console.error(`❌ รีเซ็ตสถานะอุปกรณ์ ${id} ไม่สำเร็จ:`, error);
    }
}

// ============================================================
//  23. LEVEL ALERT
// ============================================================
async function checkLevelAlert(id, value, config) {
    if (config.alertEnabled === false) return;
    if (!config.enabled) return;
    if (config.is_acknowledged === true) return;
    if (config.type === 'board') return;

    const levels = config.levels || null;
    if (!levels) return;

    const result = evaluateLevelWithCustom(value, levels);
    if (result.key === 'unknown' || result.key === 'normal' || result.key === 'low' || result.key === 'very_low') {
        if (config.alert_count > 0) {
            await resetDeviceAlertStatus(id);
        }
        return;
    }

    const alertLevels = ['very_high', 'high'];
    if (!alertLevels.includes(result.key)) return;

    const now = Date.now();
    const count = config.alert_count || 0;
    const lastTime = config.last_alert_time || 0;

    let shouldAlert = false;
    if (count === 0) shouldAlert = true;
    else if (count === 1 && (now - lastTime) >= 300000) shouldAlert = true;
    else if (count === 2 && (now - lastTime) >= 600000) shouldAlert = true;

    if (shouldAlert && count < 3) {
        const muted = await isAlertMuted();
        if (muted) {
            console.log(`🔕 ระบบ Mute ทำงานอยู่: งดส่งแจ้งเตือนระดับ ${id}`);
            return;
        }

        const message = `🚨 <b>แจ้งเตือนระดับเกินเกณฑ์!</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n📊 ระดับ: ${result.label}\n📈 ค่าปัจจุบัน: ${value} ${config.unit || ''}\n🔢 ครั้งที่: ${count + 1}/3\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}`;

        const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
        if (subsSnap.exists()) {
            const subs = subsSnap.val();
            const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
            const token = configSnap.exists() ? configSnap.val().botToken : '';

            if (token && token.trim() !== '') {
                for (let subId in subs) {
                    await sendTelegramTextManual(token, subs[subId].chatId, message);
                }
            }
        }

        await window.update(window.ref(window.db, `device_configs/${id}`), {
            alert_count: count + 1,
            last_alert_time: now
        });

        console.log(`🔔 ส่งการแจ้งเตือนระดับ ${result.key} สำหรับ ${id} ครั้งที่ ${count + 1}/3`);
        updateStandaloneAlertPanel();
        updateStatusBarBoardDetails();
    }
}

async function checkLevelAlerts() {
    try {
        const devicesRef = window.ref(window.db, 'device_configs');
        const snapshot = await window.get(devicesRef);
        if (!snapshot.exists()) return;

        const devices = snapshot.val();
        for (const [id, config] of Object.entries(devices)) {
            const value = currentSensorValues[id];
            if (value === undefined || value === null || isNaN(value)) continue;
            
            let checkValue = value;
            if (config.type === 'ultrasonic' && config.installHeight) {
                const rawDistance = parseFloat(value);
                if (!isNaN(rawDistance)) {
                    checkValue = config.installHeight - rawDistance;
                }
            }
            await checkLevelAlert(id, checkValue, config);
        }
    } catch (error) {
        console.error('❌ checkLevelAlerts error:', error);
    }
}

// ============================================================
//  24. COMBINED ALERT
// ============================================================
const alertLock = {};

async function getHistoryFromFirebase(id, minutes) {
    if (!window.db) return [];
    const now = Date.now();
    const startTime = now - (minutes * 60 * 1000);
    const historyRef = window.ref(window.db, 'sensor_history');

    try {
        const snapshot = await window.get(historyRef);
        if (!snapshot.exists()) return [];

        let history = [];
        snapshot.forEach((child) => {
            const data = child.val();
            if (data && data.values && data.values[id] !== undefined) {
                const logTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
                if (!isNaN(logTime) && logTime >= startTime) {
                    history.push(data.values[id]);
                }
            } else if (data && data[id] !== undefined) {
                const logTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
                if (!isNaN(logTime) && logTime >= startTime) {
                    history.push(data[id]);
                }
            }
        });
        return history;
    } catch (error) {
        console.error("❌ getHistoryFromFirebase error:", error);
        return [];
    }
}

async function analyzeSensorLogic(id, rawValue, config) {
    if (!config || !id || rawValue === undefined || rawValue === null) return;
    if (config.alertEnabled === false) return;
    if (!config.enabled) return;
    if (config.type === 'board') return;
    if (config.is_acknowledged === true) return;

    const value = parseFloat(rawValue);
    if (isNaN(value)) return;

    const advanced = config.advancedAlert || {};
    const threshold = advanced.threshold !== undefined ? advanced.threshold : null;
    const rateChange = advanced.rateChange !== undefined ? advanced.rateChange : null;
    const rateTime = advanced.rateTime !== undefined ? advanced.rateTime : 5;

    if (threshold !== null && value >= threshold) {
        const message = `🚨 วิกฤต: ${config.name} ถึงระดับ ${value.toFixed(2)} ${config.unit || ''} แล้ว (เกณฑ์ ${threshold})`;
        await sendCombinedAlert(id, config, message, 'threshold');
    }

    if (rateChange !== null && rateTime) {
        const history = await getHistoryFromFirebase(id, rateTime);
        if (history.length > 0) {
            const oldestValue = parseFloat(history[0]);
            if (!isNaN(oldestValue)) {
                const delta = value - oldestValue;
                if (delta >= rateChange) {
                    const message = `📈 อัตราการเพิ่มสูง: ${config.name} เพิ่มขึ้น ${delta.toFixed(2)} ${config.unit || ''} ใน ${rateTime} นาที (เกณฑ์ ${rateChange})`;
                    await sendCombinedAlert(id, config, message, 'rate_change');
                }
            }
        }
    }
}

async function sendCombinedAlert(sensorId, config, message, alertType = 'general') {
    if (!sensorId || !message) return false;

    const muted = await isAlertMuted();
    if (muted) {
        console.log(`🔕 ระบบ Mute ทำงานอยู่: งดส่งแจ้งเตือน ${sensorId}`);
        return false;
    }

    const now = Date.now();
    const LOCK_TIME = 10 * 60 * 1000;

    if (alertLock[sensorId] && (now - alertLock[sensorId] < LOCK_TIME)) {
        console.log(`⏳ Anti-Spam: ${sensorId} ถูกล็อกไว้`);
        return false;
    }

    try {
        const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        const token = configSnap.val()?.botToken;

        if (!token || token.trim() === '') {
            console.warn("⚠️ ไม่มี Bot Token");
            return false;
        }

        const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
        let success = false;

        if (subsSnap.exists()) {
            const subs = subsSnap.val();
            for (let subId in subs) {
                const chatId = subs[subId].chatId;
                if (chatId) {
                    const result = await sendTelegramTextManual(token, chatId, message);
                    if (result) success = true;
                }
            }
        }

        if (success) {
            await saveAlertHistory(sensorId, {
                message: message,
                type: alertType,
                status: 'sent'
            });

            alertLock[sensorId] = now;

            await window.update(window.ref(window.db, `device_configs/${sensorId}`), {
                alert_count: (config.alert_count || 0) + 1,
                last_alert_time: now
            });

            updateStandaloneAlertPanel();
            renderAlertHistoryTable(sensorId);
            updateStatusBarBoardDetails();

            console.log(`✅ ส่งแจ้งเตือน ${sensorId} สำเร็จ (${alertType})`);
        }

        return success;
    } catch (error) {
        console.error("❌ sendCombinedAlert error:", error);
        return false;
    }
}

async function checkAllAlertConditions(sensorId, value, config) {
    if (!config || !sensorId || value === undefined || value === null) return;
    if (config.alertEnabled === false) return;
    if (!config.enabled) return;
    if (config.type === 'board') return;
    if (config.is_acknowledged === true) return;

    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    let alertMessages = [];

    const advanced = config.advancedAlert || {};
    const threshold = advanced.threshold !== undefined ? advanced.threshold : null;
    const rateChange = advanced.rateChange !== undefined ? advanced.rateChange : null;
    const rateTime = advanced.rateTime !== undefined ? advanced.rateTime : 5;

    if (threshold !== null && numValue >= threshold) {
        alertMessages.push(`🚨 วิกฤต: ค่า ${numValue.toFixed(2)} ${config.unit || ''} เกินเกณฑ์วิกฤต (${threshold})`);
    }

    if (rateChange !== null && rateTime) {
        const history = await getHistoryFromFirebase(sensorId, rateTime);
        if (history.length > 0) {
            const oldestValue = parseFloat(history[0]);
            if (!isNaN(oldestValue)) {
                const delta = numValue - oldestValue;
                if (delta >= rateChange) {
                    alertMessages.push(`📈 อัตราการเพิ่มสูง: เพิ่มขึ้น ${delta.toFixed(2)} ${config.unit || ''} ใน ${rateTime} นาที (เกณฑ์ ${rateChange})`);
                }
            }
        }
    }

    if (config.levels) {
        const levelResult = evaluateLevelWithCustom(numValue, config.levels);
        if (levelResult.key === 'very_high' || levelResult.key === 'high') {
            alertMessages.push(`📊 ระดับ ${levelResult.label}: ค่า ${numValue.toFixed(2)} ${config.unit || ''} อยู่ในระดับอันตราย`);
        }
    }

    for (const msg of alertMessages) {
        const fullMessage = `🚨 <b>แจ้งเตือนอุปกรณ์</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${sensorId}\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}\n\n${msg}`;
        await sendCombinedAlert(sensorId, config, fullMessage, 'condition');
    }
}

async function checkAllAlertConditionsForAllDevices() {
    try {
        for (const [id, config] of Object.entries(deviceConfigs)) {
            const value = currentSensorValues[id];
            if (value === undefined || value === null || isNaN(value)) continue;
            
            let checkValue = value;
            if (config.type === 'ultrasonic' && config.installHeight) {
                const rawDistance = parseFloat(value);
                if (!isNaN(rawDistance)) {
                    checkValue = config.installHeight - rawDistance;
                }
            }
            await checkAllAlertConditions(id, checkValue, config);
        }
    } catch (error) {
        console.error('❌ checkAllAlertConditionsForAllDevices error:', error);
    }
}

// ============================================================
//  25. ALERT HISTORY
// ============================================================
async function getAlertHistory(deviceId, limit = 50) {
    if (!window.db) return [];
    try {
        const historyRef = window.ref(window.db, `alert_history/${deviceId}`);
        const snapshot = await window.get(historyRef);
        if (!snapshot.exists()) return [];

        const history = [];
        snapshot.forEach((child) => {
            const data = child.val();
            if (data) {
                history.push({ id: child.key, ...data });
            }
        });
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return history.slice(0, limit);
    } catch (error) {
        console.error("❌ getAlertHistory error:", error);
        return [];
    }
}

async function saveAlertHistory(deviceId, alertData) {
    if (!window.db) return false;
    try {
        const historyRef = window.ref(window.db, `alert_history/${deviceId}`);
        await window.push(historyRef, {
            ...alertData,
            timestamp: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error("❌ saveAlertHistory error:", error);
        return false;
    }
}

async function renderAlertHistoryTable(deviceId) {
    const container = document.getElementById('alertHistoryContainer');
    if (!container) return;

    if (!deviceId) {
        container.innerHTML = `<div style="text-align:center; padding:30px 20px; color:#64748b; background: #0f172a; border-radius: 8px; border: 1px dashed #334155;"><span style="font-size:2rem; display:block; margin-bottom:10px;">📭</span>กรุณาเลือกอุปกรณ์จากรายการด้านบนเพื่อแสดงประวัติการแจ้งเตือน</div>`;
        return;
    }

    const history = await getAlertHistory(deviceId);

    if (history.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:30px 20px; color:#64748b; background: #0f172a; border-radius: 8px; border: 1px dashed #334155;"><span style="font-size:2rem; display:block; margin-bottom:10px;">📭</span>ยังไม่มีประวัติการแจ้งเตือนสำหรับอุปกรณ์นี้</div>`;
        return;
    }

    let html = `
        <div style="margin-bottom: 12px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; background: #0f172a; padding: 10px 14px; border-radius: 8px; border: 1px solid #334155;">
            <button onclick="deleteSelectedAlertHistory('${deviceId}')" style="background:#d32f2f; color:white; border:none; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🗑️ ลบรายการที่เลือก</button>
            <button onclick="clearAllAlertHistory('${deviceId}')" style="background:#b91c1c; color:white; border:none; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:0.8rem;">🔥 ล้างประวัติทั้งหมด</button>
            <span style="color:#94a3b8; font-size:0.8rem; margin-left:auto;">รวม ${history.length} รายการ</span>
        </div>
        <div style="overflow-x:auto; border-radius:8px; border:1px solid #1e293b;">
            <table style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="background: #0f172a; border-bottom: 2px solid #1e293b;">
                        <th style="text-align:center; width:40px; padding:10px 6px;"><input type="checkbox" id="selectAllAlerts" onchange="toggleSelectAllAlerts()" style="cursor:pointer; width:17px; height:17px; accent-color:#3b82f6;"></th>
                        <th style="text-align:left; padding:10px 12px; color:#94a3b8; font-weight:600; font-size:0.8rem;">⏱️ เวลา</th>
                        <th style="text-align:left; padding:10px 12px; color:#94a3b8; font-weight:600; font-size:0.8rem;">📝 ข้อความ</th>
                        <th style="text-align:center; padding:10px 12px; color:#94a3b8; font-weight:600; font-size:0.8rem;">📌 สถานะ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    history.forEach(item => {
        const statusDisplay = item.status === 'sent' ? '✅ ส่งแล้ว' : '⚠️ รอดำเนินการ';
        const statusColor = item.status === 'sent' ? '#4caf50' : '#f59e0b';

        html += `
            <tr style="border-bottom: 1px solid #1e293b; transition:0.15s;">
                <td style="text-align:center; padding:8px 6px;"><input type="checkbox" class="alert-checkbox" value="${escapeHtml(item.id)}" style="cursor:pointer; width:16px; height:16px; accent-color:#3b82f6;"></td>
                <td style="padding:8px 12px; color:#94a3b8; font-size:0.8rem; white-space:nowrap;">${formatThaiDateTime(item.timestamp)}</td>
                <td style="padding:8px 12px; color:#e2e8f0; font-size:0.85rem; word-break:break-word; line-height:1.4;">${escapeHtml(item.message || 'ไม่ระบุข้อความ')}</td>
                <td style="padding:8px 12px; text-align:center;"><span style="color:${statusColor}; font-weight:bold; font-size:0.8rem; background:${statusColor}15; padding:2px 10px; border-radius:12px;">${statusDisplay}</span></td>
            </tr>
        `;
    });

    html += `</tbody></table></div><div style="margin-top:10px; color:#64748b; font-size:0.7rem;">💡 เลือกช่อง ☑ เพื่อเลือกรายการ | 📌 เลือกหลายรายการเพื่อลบพร้อมกัน | ⚠️ การลบไม่สามารถกู้คืนได้</div>`;

    container.innerHTML = html;
}

function updateAlertHistoryDropdown() {
    const select = document.getElementById('alertHistoryDeviceSelect');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">-- เลือกอุปกรณ์ --</option>';

    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');
    sensors.forEach(([id, config]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${config.name || id} (${id})`;
        select.appendChild(option);
    });

    if (currentValue && document.querySelector(`#alertHistoryDeviceSelect option[value="${currentValue}"]`)) {
        select.value = currentValue;
    }
}

window.loadAlertHistory = function() {
    const select = document.getElementById('alertHistoryDeviceSelect');
    if (!select) return;
    renderAlertHistoryTable(select.value);
};

window.toggleSelectAllAlerts = function() {
    const selectAllCheckbox = document.getElementById('selectAllAlerts');
    if (!selectAllCheckbox) return;
    const isChecked = selectAllCheckbox.checked;
    const checkboxes = document.querySelectorAll('.alert-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
};

window.deleteSelectedAlertHistory = async function(deviceId) {
    if (!deviceId) { alert("❌ ไม่พบ ID อุปกรณ์"); return; }

    const selectedCheckboxes = document.querySelectorAll('.alert-checkbox:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (selectedIds.length === 0) {
        alert("⚠️ กรุณาเลือกรายการที่ต้องการลบอย่างน้อย 1 รายการ");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบประวัติที่เลือก ${selectedIds.length} รายการ?`)) return;

    try {
        let successCount = 0;
        let failCount = 0;

        const container = document.getElementById('alertHistoryContainer');
        if (container) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:#60a5fa;">⏳ กำลังลบข้อมูล ${selectedIds.length} รายการ...</div>`;
        }

        for (const historyId of selectedIds) {
            try {
                await window.remove(window.ref(window.db, `alert_history/${deviceId}/${historyId}`));
                successCount++;
            } catch (err) {
                failCount++;
                console.error(`❌ ลบรายการ ${historyId} ล้มเหลว:`, err);
            }
        }

        if (failCount === 0) {
            alert(`✅ ลบประวัติ ${successCount} รายการสำเร็จ`);
        } else {
            alert(`⚠️ ลบสำเร็จ ${successCount} รายการ, ล้มเหลว ${failCount} รายการ`);
        }

        await renderAlertHistoryTable(deviceId);
        const selectAll = document.getElementById('selectAllAlerts');
        if (selectAll) selectAll.checked = false;

    } catch (error) {
        console.error("❌ deleteSelectedAlertHistory error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
};

window.clearAllAlertHistory = async function(deviceId) {
    if (!deviceId) { alert("❌ ไม่พบ ID อุปกรณ์"); return; }

    const history = await getAlertHistory(deviceId);
    if (history.length === 0) {
        alert("📭 ไม่มีประวัติการแจ้งเตือนสำหรับอุปกรณ์นี้");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบประวัติทั้งหมด ${history.length} รายการของอุปกรณ์นี้?`)) return;

    const container = document.getElementById('alertHistoryContainer');
    if (container) {
        container.innerHTML = `<div style="text-align:center; padding:30px; color:#f87171;">⏳ กำลังล้างประวัติทั้งหมด ${history.length} รายการ...</div>`;
    }

    try {
        await window.remove(window.ref(window.db, `alert_history/${deviceId}`));
        alert(`✅ ล้างประวัติทั้งหมด ${history.length} รายการสำเร็จ`);
        await renderAlertHistoryTable(deviceId);
    } catch (error) {
        console.error("❌ clearAllAlertHistory error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
        await renderAlertHistoryTable(deviceId);
    }
};

// ============================================================
//  26. STANDALONE ALERT PANEL
// ============================================================
function updateStandaloneAlertPanel() {
    const panel = document.getElementById('standaloneAlertPanel');
    const container = document.getElementById('alertListContainer');

    if (!panel || !container) return;

    let alerts = Object.entries(deviceConfigs).filter(([id, cfg]) =>
        cfg.alert_count > 0 &&
        cfg.is_acknowledged !== true &&
        cfg.enabled === true &&
        cfg.type !== 'board' &&
        cfg.alertEnabled !== false
    );

    if (alerts.length > 0) {
        panel.style.display = 'block';
        container.innerHTML = '';

        alerts.forEach(([id, cfg]) => {
            const btn = document.createElement('button');
            btn.innerHTML = `✅ รับทราบอุปกรณ์: ${cfg.name || id}`;
            btn.style.cssText = "background: #b91c1c; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: 0.3s; box-shadow: 0 4px 6px rgba(0,0,0,0.2);";
            btn.onmouseover = function() { this.style.transform = 'scale(1.05)'; };
            btn.onmouseout = function() { this.style.transform = 'scale(1)'; };
            btn.onclick = () => window.acknowledgeAlert(id);
            container.appendChild(btn);
        });
    } else {
        panel.style.display = 'none';
    }
}

window.acknowledgeAlert = async function(id) {
    if (!id) { console.error("❌ ไม่มี ID อุปกรณ์"); return; }
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            is_acknowledged: true,
            alert_count: 0,
            last_alert_time: null
        });
        alert("✅ รับทราบการแจ้งเตือนเรียบร้อย");
        updateStandaloneAlertPanel();
        renderDeviceTable();
        renderBoardTable();
        renderSummaryTable();
        updateStatusBarBoardDetails();
    } catch (error) {
        console.error("❌ รับทราบการแจ้งเตือนไม่สำเร็จ:", error);
        alert("❌ รับทราบการแจ้งเตือนไม่สำเร็จ: " + error.message);
    }
};

function createStandaloneAlertPanelIfNotExists() {
    let panel = document.getElementById('standaloneAlertPanel');
    if (panel) return;

    const mainApp = document.getElementById('mainApp');
    if (!mainApp) return;

    const style = document.createElement('style');
    style.textContent = `@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }.alert-panel-blink { animation: blink 1.5s infinite; }`;
    document.head.appendChild(style);

    const panelHTML = `
        <div id="standaloneAlertPanel" class="alert-panel-blink" style="display: none; background: #fee2e2; padding: 20px; border: 3px solid #ef4444; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);">
            <h3 style="color: #b91c1c; margin-top: 0; margin-bottom: 15px; display: flex; align-items: center; font-size: 1.2rem;">
                <span style="margin-right: 10px; font-size: 1.5rem;">🚨</span> แจ้งเตือน: พบอุปกรณ์ขัดข้อง
            </h3>
            <div id="alertListContainer" style="display: flex; gap: 12px; flex-wrap: wrap;"></div>
        </div>
    `;

    const statusBar = document.getElementById('status-bar') || mainApp.querySelector('.status-bar');
    if (statusBar) {
        statusBar.insertAdjacentHTML('beforebegin', panelHTML);
    } else {
        mainApp.insertAdjacentHTML('afterbegin', panelHTML);
    }
}

// ============================================================
//  27. GLOBAL MUTE
// ============================================================
async function isAlertMuted() {
    if (!window.db) return false;
    try {
        const snap = await window.get(window.ref(window.db, 'settings/global_alert_muted'));
        return snap.exists() ? snap.val() : false;
    } catch (error) {
        console.warn("⚠️ ตรวจสอบสถานะ Mute ไม่สำเร็จ:", error);
        return false;
    }
}

window.toggleGlobalMute = async function(isMuted) {
    try {
        await window.set(window.ref(window.db, 'settings/global_alert_muted'), isMuted);
        globalAlertMuted = isMuted;
        renderSummaryTable();

        const checkbox = document.getElementById('globalAlertMute');
        if (checkbox) checkbox.checked = isMuted;

        const statusText = document.getElementById('globalMuteStatus');
        if (statusText) {
            statusText.textContent = isMuted ? '🔕 ปิดการแจ้งเตือนอยู่' : '🔔 แจ้งเตือนปกติ';
            statusText.style.color = isMuted ? '#ef4444' : '#10b981';
        }

        console.log(`🔕 ระบบ Mute: ${isMuted ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}`);
    } catch (e) {
        console.error("❌ ไม่สามารถเปลี่ยนสถานะ Mute ได้:", e);
        alert("❌ ไม่สามารถเปลี่ยนสถานะได้: " + e.message);
    }
};

async function loadGlobalMuteStatus() {
    if (!window.db) return;
    try {
        const snap = await window.get(window.ref(window.db, 'settings/global_alert_muted'));
        globalAlertMuted = snap.exists() ? snap.val() : false;

        const checkbox = document.getElementById('globalAlertMute');
        if (checkbox) checkbox.checked = globalAlertMuted;

        const statusText = document.getElementById('globalMuteStatus');
        if (statusText) {
            statusText.textContent = globalAlertMuted ? '🔕 ปิดการแจ้งเตือนอยู่' : '🔔 แจ้งเตือนปกติ';
            statusText.style.color = globalAlertMuted ? '#ef4444' : '#10b981';
        }
        renderSummaryTable();
    } catch (error) {
        console.warn("⚠️ โหลดสถานะ Mute ไม่สำเร็จ:", error);
    }
}

// ============================================================
//  28. GLOBAL ALERT SETTINGS
// ============================================================
window.openGlobalAlertSettings = async function() {
    const modal = document.getElementById('globalAlertModal');
    if (!modal) {
        alert("กรุณาเพิ่ม Modal สำหรับตั้งค่าการแจ้งเตือนในไฟล์ HTML");
        return;
    }
    modal.style.display = 'flex';
    await loadGlobalMuteStatus();
    await loadGlobalAlertDefaults();
    renderGlobalAlertDeviceList();
};

window.closeGlobalAlertSettings = function() {
    const modal = document.getElementById('globalAlertModal');
    if (modal) modal.style.display = 'none';
    const resultDiv = document.getElementById('globalAlertResult');
    if (resultDiv) {
        resultDiv.style.display = 'none';
        resultDiv.textContent = '';
    }
};

async function loadGlobalAlertDefaults() {
    if (!window.db) return;
    try {
        const snap = await window.get(window.ref(window.db, 'settings/global_alert_defaults'));
        const limitInput = document.getElementById('globalAlertLimit');
        const intervalInput = document.getElementById('globalAlertInterval');

        if (snap.exists()) {
            const config = snap.val();
            if (limitInput) limitInput.value = config.limit || 3;
            if (intervalInput) intervalInput.value = config.interval || 5;
        } else {
            if (limitInput) limitInput.value = 3;
            if (intervalInput) intervalInput.value = 5;
        }
    } catch (error) {
        console.warn("⚠️ โหลดค่าเริ่มต้น Global Alert ไม่สำเร็จ:", error);
    }
}

function renderGlobalAlertDeviceList() {
    const container = document.getElementById('globalAlertDeviceList');
    if (!container) return;

    const devices = Object.entries(deviceConfigs)
        .filter(([id, config]) => config.type !== 'board' && config.enabled !== false);

    if (devices.length === 0) {
        container.innerHTML = '<span style="color: #64748b;">📭 ไม่มีอุปกรณ์ที่เปิดใช้งานในระบบ</span>';
        return;
    }

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
    const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
    devices.forEach(([id, config]) => {
        const icon = iconMap[config.type] || '🔍';
        html += `<span style="background: #1e293b; padding: 4px 10px; border-radius: 4px; border: 1px solid #334155; font-size: 0.7rem;">${icon} ${escapeHtml(config.name || id)}</span>`;
    });
    html += '</div>';
    html += `<div style="margin-top: 8px; color: #64748b; font-size: 0.75rem;">รวม ${devices.length} อุปกรณ์</div>`;

    container.innerHTML = html;
}

window.applyGlobalAlertSettings = async function() {
    const limitInput = document.getElementById('globalAlertLimit');
    const intervalInput = document.getElementById('globalAlertInterval');
    const resultDiv = document.getElementById('globalAlertResult');

    if (!limitInput || !intervalInput) {
        alert("❌ ไม่พบฟิลด์การตั้งค่า");
        return;
    }

    const limit = parseInt(limitInput.value);
    const interval = parseInt(intervalInput.value);

    if (isNaN(limit) || limit < 1 || limit > 99) {
        alert("⚠️ กรุณากรอกจำนวนครั้งให้ถูกต้อง (1-99)");
        limitInput.focus();
        return;
    }

    if (isNaN(interval) || interval < 1 || interval > 999) {
        alert("⚠️ กรุณากรอกความถี่ให้ถูกต้อง (1-999 นาที)");
        intervalInput.focus();
        return;
    }

    const devices = Object.entries(deviceConfigs)
        .filter(([id, config]) => config.type !== 'board' && config.enabled !== false);

    if (devices.length === 0) {
        alert("📭 ไม่มีอุปกรณ์ที่เปิดใช้งานในระบบ");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการตั้งค่าการแจ้งเตือนให้กับ ${devices.length} อุปกรณ์?`)) return;

    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#1e293b';
        resultDiv.style.color = '#60a5fa';
        resultDiv.textContent = '⏳ กำลังบันทึกการตั้งค่า...';
    }

    try {
        let successCount = 0;
        for (const [id, config] of devices) {
            try {
                await window.update(window.ref(window.db, `device_configs/${id}`), {
                    alertLimit: limit,
                    alertInterval: interval,
                    updatedAt: new Date().toISOString()
                });
                successCount++;
            } catch (err) {
                console.error(`❌ อัปเดตอุปกรณ์ ${id} ล้มเหลว:`, err);
            }
        }

        await window.set(window.ref(window.db, 'settings/global_alert_defaults'), {
            limit: limit,
            interval: interval,
            updatedAt: new Date().toISOString()
        });

        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#064e3b';
            resultDiv.style.color = '#4ade80';
            resultDiv.textContent = `✅ บันทึกสำเร็จ! ตั้งค่าให้ ${successCount} อุปกรณ์`;
        }

        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateStandaloneAlertPanel();
        renderSummaryTable();
        updateStatusBarBoardDetails();

        alert(`✅ ตั้งค่าการแจ้งเตือนสำเร็จ! (${successCount} อุปกรณ์)`);
        setTimeout(() => closeGlobalAlertSettings(), 3000);

    } catch (error) {
        console.error("❌ applyGlobalAlertSettings error:", error);
        if (resultDiv) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = '#4a044e';
            resultDiv.style.color = '#f87171';
            resultDiv.textContent = `❌ เกิดข้อผิดพลาด: ${error.message}`;
        }
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
};

// ============================================================
//  29. SUMMARY TABLE
// ============================================================
function renderSummaryTable() {
    const tbody = document.getElementById('summaryTableBody');
    if (!tbody) return;

    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');

    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #94a3b8;">📭 ยังไม่มีอุปกรณ์ที่กำหนดค่า</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    sensors.forEach(([id, config]) => {
        const isEnabled = config.enabled !== false;
        const isAlertEnabled = config.alertEnabled !== false;

        let alertStatusText = "";
        let alertStatusColor = "";

        if (globalAlertMuted) {
            alertStatusText = "🔕 ปิด (ระบบส่วนกลาง)";
            alertStatusColor = "#f87171";
        } else {
            alertStatusText = isAlertEnabled ? "🔊 เปิดปกติ" : "🔇 ปิดเฉพาะจุด";
            alertStatusColor = isAlertEnabled ? "#4caf50" : "#ef4444";
        }

        const tr = document.createElement('tr');
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';

        let ultrasonicInfo = '';
        if (config.type === 'ultrasonic' && (config.installHeight || config.bankHeight)) {
            ultrasonicInfo = `<div style="font-size:0.6rem; color:#60a5fa;">📏 ติดตั้ง: ${config.installHeight || '-'} cm | ตลิ่ง: ${config.bankHeight || '-'} cm</div>`;
        }

        tr.innerHTML = `
            <td style="padding: 12px; border-bottom: 1px solid #334155; color: #e2e8f0; font-weight: 500;">${icon} ${escapeHtml(config.name)}${ultrasonicInfo}</td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center; color: #94a3b8; font-size: 0.85rem;">${config.type}</td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center;"><span style="color: ${isEnabled ? '#4caf50' : '#ef4444'}; font-weight: bold;">${isEnabled ? '✅ พร้อมทำงาน' : '❌ ไม่พร้อม'}</span></td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center;"><span style="font-weight: bold; color: ${alertStatusColor};">${alertStatusText}</span></td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center; display: flex; gap: 5px; justify-content: center;">
                <button class="toggle-alert-btn ${isEnabled ? 'active' : ''}" style="background: ${isEnabled ? '#4caf50' : '#64748b'}" onclick="toggleDevice('${id}', ${isEnabled})">${isEnabled ? '⏸️ ปิด' : '▶️ เปิด'}</button>
                <button class="toggle-alert-btn ${isAlertEnabled && !globalAlertMuted ? 'active' : ''}" ${globalAlertMuted ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} onclick="toggleAlertEnabled('${id}')">${isAlertEnabled ? '🔔 ปิดแจ้งเตือน' : '🔕 เปิดแจ้งเตือน'}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleAlertEnabled = async function(id) {
    if (!id) { console.error("❌ ไม่มี ID อุปกรณ์"); return; }

    const config = deviceConfigs[id];
    if (!config) { alert("❌ ไม่พบข้อมูลอุปกรณ์"); return; }

    const currentStatus = config.alertEnabled !== false;
    const newStatus = !currentStatus;
    const actionText = newStatus ? 'เปิด' : 'ปิด';

    if (confirm(`⚠️ คุณต้องการ${actionText}การแจ้งเตือนของอุปกรณ์ "${config.name}" ใช่หรือไม่?`)) {
        try {
            await window.update(window.ref(window.db, `device_configs/${id}`), {
                alertEnabled: newStatus
            });

            if (newStatus) {
                await window.update(window.ref(window.db, `device_configs/${id}`), {
                    alert_count: 0,
                    is_acknowledged: false,
                    last_alert_time: null
                });
            }

            console.log(`✅ ${actionText}การแจ้งเตือนของอุปกรณ์ ${id} สำเร็จ`);
            renderSummaryTable();
            renderDeviceTable();
            renderBoardTable();
            renderSensorCards();
            updateStandaloneAlertPanel();
            updateStatusBarBoardDetails();

        } catch (error) {
            console.error("❌ เปลี่ยนสถานะการแจ้งเตือนไม่สำเร็จ:", error);
            alert("❌ เปลี่ยนสถานะไม่สำเร็จ: " + error.message);
        }
    }
};

window.toggleSummaryTable = function() {
    const tableWrapper = document.getElementById('summaryTableWrapper');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');

    if (!tableWrapper || !btnText || !btnIcon) return;

    const isHidden = tableWrapper.style.display === 'none' || tableWrapper.style.display === '';

    if (isHidden) {
        tableWrapper.style.display = 'block';
        btnText.textContent = 'ซ่อนตาราง';
        btnIcon.textContent = '🔼';
    } else {
        tableWrapper.style.display = 'none';
        btnText.textContent = 'แสดงตาราง';
        btnIcon.textContent = '🔽';
    }
};

// ============================================================
//  30. TELEGRAM SYSTEM
// ============================================================
window.triggerManualReport = async function() {
    const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
    if (!configSnap.exists()) { alert("❌ ระบบยังไม่ได้ตั้งค่า Telegram กรุณาติดต่อ Admin"); return; }

    const config = configSnap.val();
    const token = config.botToken;
    if (!token || token.trim() === '') { alert("❌ ยังไม่ได้ตั้งค่า Bot Token กรุณาติดต่อ Admin"); return; }

    const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
    if (!subsSnap.exists()) { alert("❌ ยังไม่มีรายชื่อผู้รับ กรุณาติดต่อ Admin"); return; }
    const subs = subsSnap.val();

    const customMessage = prompt("กรุณากรอกข้อความที่ต้องการสื่อสารเพิ่มเติม (ถ้าไม่มีให้เว้นว่างไว้แล้วกด OK):", "");
    if (customMessage === null) return;

    const reportType = document.getElementById('reportTypeSelect')?.value || 'status';
    const sender = sessionStorage.getItem('currentUser') || 'ระบบ';
    const now = new Date();

    const dateTimeStr = now.toLocaleString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let reportText = `<pre>      📋 รายงานสถานะ      </pre>\n`;
    reportText += `━━━━━━━━━━━━━━━━━━\n`;
    reportText += `👤 <b>ผู้รายงาน:</b> ${sender === 'ระบบ' ? 'ระบบอัตโนมัติ' : sender}\n`;
    reportText += `📄 <b>หัวข้อ:</b> `;

    if (reportType === 'summary') {
        reportText += `สรุปข้อมูลเชิงวิเคราะห์ (Analytics)\n`;
        const logConfigSnap = await window.get(window.ref(window.db, 'settings/logging_config'));
        const logConfig = logConfigSnap.val() || { type: 'day' };
        const unitMap = { day: 'วัน', hour: 'ชั่วโมง', minute: 'นาที' };
        const groupType = logConfig.type || 'day';
        reportText += `🕒 <b>หน่วยสรุป:</b> ราย${unitMap[groupType] || 'วัน'}\n`;
        reportText += `━━━━━━━━━━━━━━━━━━\n`;

        const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const endTime = now.toISOString();

        try {
            const historyRef = window.ref(window.db, 'sensor_history');
            const q = window.query(historyRef, window.orderByChild('timestamp'), window.startAt(startTime), window.endAt(endTime));
            const snapshot = await window.get(q);

            if (snapshot.exists()) {
                const rawData = snapshot.val();
                const grouped = groupDataByPeriod(rawData, groupType);

                reportText += `📊 <b>สรุปข้อมูลอุปกรณ์:</b>\n`;
                let hasData = false;

                const periods = Object.keys(grouped).slice(-5);
                periods.forEach(period => {
                    const data = grouped[period];
                    Object.entries(data.devices).forEach(([id, stats]) => {
                        const diff = stats.last - stats.start;
                        const status = diff > 0.01 ? '📈' : (diff < -0.01 ? '📉' : '➖');
                        const deviceName = deviceConfigs[id]?.name || id;
                        const unit = deviceConfigs[id]?.unit || '';
                        reportText += `  • ${period}: ${deviceName} ➔ ${stats.start.toFixed(2)} → ${stats.last.toFixed(2)} ${unit} ${status}\n`;
                        hasData = true;
                    });
                });

                if (!hasData) {
                    reportText += `  ⚠️ ไม่มีข้อมูลในช่วง 24 ชม.ที่ผ่านมา\n`;
                } else {
                    reportText += `\n📌 *ข้อมูลแสดงเฉพาะ 5 ช่วงเวลาสุดท้าย*\n`;
                }
            } else {
                reportText += `⚠️ ไม่มีข้อมูลในช่วง 24 ชม.ที่ผ่านมา\n`;
            }
        } catch (e) {
            reportText += `⚠️ ไม่สามารถดึงข้อมูลสรุปได้: ${e.message}\n`;
        }

    } else if (reportType === 'status') {
        reportText += `สถานะฮาร์ดแวร์\n\n`;
        reportText += `📊 <b>ข้อมูลเซนเซอร์:</b>\n`;
        let hasData = false;
        for (const [id, value] of Object.entries(currentSensorValues)) {
            const cfg = deviceConfigs[id] || {};
            if (cfg.enabled && cfg.type !== 'board') {
                let displayVal = value;
                if (cfg.type === 'ultrasonic' && cfg.installHeight && value !== undefined && value !== null) {
                    const rawDistance = parseFloat(value);
                    if (!isNaN(rawDistance)) {
                        displayVal = (cfg.installHeight - rawDistance).toFixed(2);
                    }
                }
                reportText += `• ${cfg.name || id}: <b>${displayVal}</b> ${cfg.unit || ''}\n`;
                hasData = true;
            }
        }
        if (!hasData) reportText += `⚠️ ไม่มีข้อมูลเซนเซอร์\n`;

    } else {
        reportText += `สภาพการทำงาน\n\n`;
        reportText += `🟢 สถานะ: <b>เชื่อมต่อปกติ</b>\n`;
        reportText += `👥 ออนไลน์: ${document.getElementById('compactOnlineText')?.textContent || 'ตรวจสอบไม่ได้'}\n`;
        reportText += `📡 อุปกรณ์: ${Object.values(deviceConfigs).filter(d => d.enabled && d.type !== 'board').length} จุด\n`;
    }

    if (customMessage.trim() !== "") {
        reportText += `\n💬 <b>ข้อความเพิ่มเติม:</b>\n${escapeHtml(customMessage)}\n`;
    }

    reportText += `━━━━━━━━━━━━━━━━━━\n`;
    reportText += `📅 <b>เวลา:</b> ${dateTimeStr} น.`;

    let successCount = 0;
    for (let subId in subs) {
        const success = await sendTelegramTextManual(token, subs[subId].chatId, reportText);
        await window.push(window.ref(window.db, 'settings/telegram/history'), {
            timestamp: new Date().toISOString(),
            target: subs[subId].name,
            sender: sender,
            status: success ? "success" : "failed"
        });
        if (success) successCount++;
    }

    if (successCount > 0) {
        alert(`✅ ส่งรายงานเรียบร้อยแล้วให้ ${successCount} คน`);
    } else {
        alert(`❌ การส่งรายงานล้มเหลว กรุณาตรวจสอบ Token และ Chat ID`);
    }
    renderHistoryTable();
};

window.saveSubscriber = async function() {
    const name = document.getElementById('subName').value.trim();
    const chatId = document.getElementById('subChatId').value.trim();
    if (!name || !chatId) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }

    const subId = 'sub_' + Date.now();
    await window.set(window.ref(window.db, `settings/telegram/subscribers/${subId}`), { name, chatId });
    document.getElementById('subName').value = '';
    document.getElementById('subChatId').value = '';
    renderSubscribersTable();
};

window.deleteSubscriber = async function(subId) {
    await window.remove(window.ref(window.db, `settings/telegram/subscribers/${subId}`));
    renderSubscribersTable();
};

window.editSubscriber = function(subId, name, chatId) {
    document.getElementById('subName').value = name;
    document.getElementById('subChatId').value = chatId;
    const btn = document.querySelector('button[onclick="saveSubscriber()"]');
    if (btn) {
        btn.textContent = '💾 อัปเดต';
        btn.setAttribute('onclick', `updateSubscriber('${subId}')`);
    }
};

window.updateSubscriber = async function(subId) {
    const name = document.getElementById('subName').value;
    const chatId = document.getElementById('subChatId').value;
    if (!name || !chatId) { alert("กรุณากรอกข้อมูลให้ครบ"); return; }

    await window.update(window.ref(window.db, `settings/telegram/subscribers/${subId}`), { name, chatId });
    alert("✅ อัปเดตข้อมูลผู้รับสำเร็จ");

    const btn = document.querySelector('button[onclick^="updateSubscriber"]');
    if (btn) {
        btn.textContent = '➕ เพิ่ม';
        btn.setAttribute('onclick', 'saveSubscriber()');
    }
    document.getElementById('subName').value = '';
    document.getElementById('subChatId').value = '';
    renderSubscribersTable();
};

async function renderSubscribersTable() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
    const tbody = document.getElementById('subTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (snap.exists()) {
        Object.entries(snap.val()).forEach(([id, data]) => {
            tbody.innerHTML += `<tr>
                <td>${escapeHtml(data.name)}</td>
                <td>${escapeHtml(data.chatId)}</td>
                <td>
                    <button onclick="editSubscriber('${id}', '${escapeHtml(data.name)}', '${escapeHtml(data.chatId)}')" style="background:#ffa726; color:white; border:none; padding:6px 14px; border-radius:20px; cursor:pointer; margin-right:5px;">✏️</button>
                    <button onclick="deleteSubscriber('${id}')" class="danger" style="background:#d32f2f; color:white; border:none; padding:6px 14px; border-radius:20px; cursor:pointer;">🗑️</button>
                </td>
            </tr>`;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#64748b;">📭 ยังไม่มีผู้รับ</td></tr>';
    }
}

window.clearHistory = async function() {
    if (!confirm("⚠️ ยืนยันการลบประวัติการส่งทั้งหมด?")) return;
    try {
        await window.remove(window.ref(window.db, 'settings/telegram/history'));
        alert("✅ ล้างประวัติทั้งหมดสำเร็จ");
        await renderHistoryTable();
    } catch (error) {
        console.error("❌ clearHistory error:", error);
        alert("❌ ล้างประวัติไม่สำเร็จ: " + error.message);
    }
};

window.deleteHistoryItem = async function(historyId) {
    if (!historyId) { alert("❌ ไม่พบ ID รายการที่ต้องการลบ"); return; }
    if (confirm("⚠️ ยืนยันการลบประวัติรายการนี้?")) {
        try {
            await window.remove(window.ref(window.db, `settings/telegram/history/${historyId}`));
            alert("✅ ลบประวัติสำเร็จ");
            await renderHistoryTable();
        } catch (error) {
            console.error("❌ deleteHistoryItem error:", error);
            alert("❌ ลบประวัติไม่สำเร็จ: " + error.message);
        }
    }
};

async function renderHistoryTable() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram/history'));
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (snap.exists()) {
        const history = Object.entries(snap.val()).reverse();
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">📭 ยังไม่มีประวัติการส่ง</td></tr>';
            return;
        }

        history.forEach(([id, item]) => {
            const timestampDisplay = formatThaiDate(item.timestamp);
            const statusDisplay = item.status === 'success' ? '✅ สำเร็จ' : '❌ ล้มเหลว';
            const statusColor = item.status === 'success' ? '#4caf50' : '#ef4444';

            tbody.innerHTML += `
                <tr>
                    <td style="text-align:center;"><input type="checkbox" class="history-checkbox" value="${escapeHtml(id)}"></td>
                    <td style="font-size:0.85rem; color:#94a3b8;">${timestampDisplay}</td>
                    <td style="font-weight:500;">${escapeHtml(item.target) || '-'}</td>
                    <td>${escapeHtml(item.sender) || 'ระบบ'}</td>
                    <td style="color:${statusColor}; font-weight:bold;">${statusDisplay}</td>
                    <td><button onclick="deleteHistoryItem('${escapeHtml(id)}')" style="background:#d32f2f; color:white; border:none; padding:4px 12px; border-radius:4px; cursor:pointer; font-size:0.75rem;">🗑️ ลบ</button></td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">📭 ยังไม่มีประวัติการส่ง</td></tr>';
    }
}

window.toggleSelectAllHistory = function() {
    const isChecked = document.getElementById('selectAllHistory').checked;
    const checkboxes = document.querySelectorAll('.history-checkbox');
    checkboxes.forEach(cb => cb.checked = isChecked);
};

window.deleteSelectedHistory = async function() {
    const selectedIds = [];
    document.querySelectorAll('.history-checkbox:checked').forEach(cb => selectedIds.push(cb.value));

    if (selectedIds.length === 0) {
        alert("⚠️ กรุณาเลือกรายการที่ต้องการลบอย่างน้อย 1 รายการ");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบประวัติที่เลือกจำนวน ${selectedIds.length} รายการ?`)) return;

    try {
        let successCount = 0;
        for (const id of selectedIds) {
            try {
                await window.remove(window.ref(window.db, `settings/telegram/history/${id}`));
                successCount++;
            } catch (err) {
                console.error(`❌ ลบรายการ ${id} ล้มเหลว:`, err);
            }
        }
        alert(`✅ ลบประวัติ ${successCount} รายการสำเร็จ`);
        await renderHistoryTable();
        const selectAll = document.getElementById('selectAllHistory');
        if (selectAll) selectAll.checked = false;
    } catch (error) {
        console.error("❌ deleteSelectedHistory error:", error);
        alert("❌ ลบรายการไม่สำเร็จ: " + error.message);
    }
};

window.saveTelegramConfig = async function() {
    const config = {
        botToken: document.getElementById('teleBotToken').value.trim(),
        sendTime: document.getElementById('teleSendTime').value,
        enabled: document.getElementById('teleEnabled').checked
    };
    await window.set(window.ref(window.db, 'settings/telegram/config'), config);
    alert("✅ บันทึกค่าสำเร็จ");
};

function startTelegramAutoCheck() {
    if (telegramCheckInterval) {
        clearInterval(telegramCheckInterval);
        telegramCheckInterval = null;
    }

    telegramCheckInterval = setInterval(async () => {
        const snap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        if (!snap.exists()) return;
        const config = snap.val();
        const now = new Date();
        const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (currentTimeStr === config.sendTime && config.enabled) {
            await runAutoReport();
        }
    }, 30000);
}

async function loadTelegramConfig() {
    try {
        const snap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        if (snap.exists()) {
            const config = snap.val();
            document.getElementById('teleBotToken').value = config.botToken || '';
            document.getElementById('teleSendTime').value = config.sendTime || '';
            document.getElementById('teleEnabled').checked = config.enabled || false;
        }
        await renderSubscribersTable();
        await renderHistoryTable();
    } catch (e) {
        console.warn("⚠️ ไม่สามารถโหลดการตั้งค่า Telegram:", e);
    }
}

function initTelegramListeners() {
    if (!window.db) return;

    const configRef = window.ref(window.db, 'settings/telegram/config');
    window.onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            telegramConfig = snapshot.val();
        } else {
            telegramConfig = {};
        }
        const modal = document.getElementById('settingsModal');
        if (modal && modal.style.display === 'flex') {
            loadTelegramConfig();
        }
    });

    startTelegramAutoCheck();
}

async function runAutoReport() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram'));
    if (!snap.exists()) return;
    const config = snap.val();

    const today = new Date().toISOString().split('T')[0];
    if (config.lastSentDate === today || !config.enabled) return;

    const sender = 'ระบบอัตโนมัติ';
    let reportText = `📊 <b>รายงานสรุปประจำวัน</b>\n👤 ผู้ส่ง: ${sender}\n\n`;
    for (const [id, value] of Object.entries(currentSensorValues)) {
        const devConfig = deviceConfigs[id] || {};
        if (devConfig.type !== 'board') {
            let displayVal = value;
            if (devConfig.type === 'ultrasonic' && devConfig.installHeight && value !== undefined && value !== null) {
                const rawDistance = parseFloat(value);
                if (!isNaN(rawDistance)) {
                    displayVal = (devConfig.installHeight - rawDistance).toFixed(2);
                }
            }
            reportText += `• ${devConfig.name || id}: ${displayVal} ${devConfig.unit || ''}\n`;
        }
    }

    const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
    if (subsSnap.exists()) {
        const subs = subsSnap.val();
        let success = false;
        for (let subId in subs) {
            const result = await sendTelegramTextManual(config.botToken, subs[subId].chatId, reportText);
            if (result) success = true;
            await window.push(window.ref(window.db, 'settings/telegram/history'), {
                timestamp: new Date().toISOString(),
                target: subs[subId].name,
                sender: sender,
                status: result ? "success" : "failed"
            });
        }
        if (success) {
            await window.update(window.ref(window.db, 'settings/telegram'), { lastSentDate: today });
        }
    }
}

// ============================================================
//  STATUS BAR - BOARD DETAILS (ปรับปรุงใหม่)
// ============================================================
window.updateStatusBarBoardDetails = function() {
    const detailEl = document.getElementById('boardDetailStatus');
    const selector = document.getElementById('boardSelector');
    if (!detailEl || !selector) return;

    const boards = Object.entries(deviceConfigs).filter(([id, config]) => config.type === 'board');
    const now = Date.now() + serverTimeOffset;
    
    // --- จัดการ Dropdown ---
    if (boards.length > 0) {
        selector.style.display = 'inline-block';
        const currentValue = selector.value;
        // ล้าง options ยกเว้น option แรก (all)
        while (selector.options.length > 1) {
            selector.remove(1);
        }
        boards.forEach(([id]) => {
            let opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id.length > 20 ? id.substring(0, 18) + '…' : id;
            selector.appendChild(opt);
        });
        // รักษาค่าที่เลือกไว้
        if (Array.from(selector.options).some(opt => opt.value === currentValue)) {
            selector.value = currentValue;
        } else {
            selector.value = 'all';
        }
    } else {
        selector.style.display = 'none';
    }

    // --- ถ้าไม่มีบอร์ด ---
    if (boards.length === 0) {
        detailEl.style.display = 'none';
        return;
    }

    const selectedId = selector.value;
    let html = '';

    // --- กรณีเลือก "แสดงทั้งหมด" ---
    if (selectedId === 'all') {
        const total = boards.length;
        const onlineBoards = boards.filter(([_, c]) => {
            const lastSeen = getTimestampMs(c.lastSeen);
            return (now - lastSeen) < 420000;
        });
        const onlineCount = onlineBoards.length;
        const offlineCount = total - onlineCount;
        
        // คำนวณ RSSI เฉลี่ย
        const totalRssi = boards.reduce((sum, [_, c]) => sum + (c.wifi_rssi || 0), 0);
        const avgRssi = total > 0 ? Math.round(totalRssi / total) : 0;
        const rssiStatus = getRSSIStatusText(avgRssi);
        
        // หาบอร์ดที่ออนไลน์นานที่สุด
        let maxUptime = 0;
        let maxUptimeDisplay = '-';
        onlineBoards.forEach(([_, c]) => {
            const uptime = getTimestampMs(c.onlineSince || c.lastSeen);
            if (uptime > maxUptime) {
                maxUptime = uptime;
                maxUptimeDisplay = formatUptime(uptime);
            }
        });
        
        html = `
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
                <!-- จำนวนบอร์ดทั้งหมด -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 1.1rem;">📊</span>
                    <span style="color: #e2e8f0; font-weight: 600;">${total}</span>
                    <span style="color: #94a3b8; font-size: 0.8rem;">บอร์ด</span>
                </div>
                
                <!-- จำนวนออนไลน์ -->
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="color: #4ade80; font-size: 1rem;">🟢</span>
                    <span style="color: #4ade80; font-weight: 600;">${onlineCount}</span>
                    <span style="color: #94a3b8; font-size: 0.75rem;">ออนไลน์</span>
                </div>
                
                <!-- จำนวนออฟไลน์ (ถ้ามี) -->
                ${offlineCount > 0 ? `
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="color: #f87171; font-size: 1rem;">🔴</span>
                    <span style="color: #f87171; font-weight: 600;">${offlineCount}</span>
                    <span style="color: #94a3b8; font-size: 0.75rem;">ออฟไลน์</span>
                </div>
                ` : ''}
                
                <!-- RSSI เฉลี่ย -->
                <div style="display: flex; align-items: center; gap: 6px; border-left: 1px solid #334155; padding-left: 12px;">
                    <span style="color: #60a5fa;">📶</span>
                    <span style="color: #e2e8f0; font-weight: 500;">${avgRssi}</span>
                    <span style="color: #94a3b8; font-size: 0.75rem;">dBm</span>
                    <span style="color: #94a3b8; font-size: 0.7rem; background: #1e293b; padding: 0 8px; border-radius: 10px;">${rssiStatus}</span>
                </div>
                
                <!-- ออนไลน์ต่อเนื่องสูงสุด -->
                ${onlineBoards.length > 0 && maxUptime > 0 ? `
                <div style="display: flex; align-items: center; gap: 4px; border-left: 1px solid #334155; padding-left: 12px;">
                    <span style="color: #fbbf24;">⏳</span>
                    <span style="color: #94a3b8; font-size: 0.75rem;">ออนไลน์ต่อเนื่องสูงสุด</span>
                    <span style="color: #e2e8f0; font-weight: 500; font-size: 0.8rem;">
                        ${maxUptimeDisplay}
                    </span>
                </div>
                ` : ''}
            </div>
        `;
    } 
    // --- กรณีเลือกบอร์ดเดียว ---
    else {
        const board = boards.find(([id]) => id === selectedId);
        if (board) {
            const [id, config] = board;
            const lastSeen = getTimestampMs(config.lastSeen);
            const isOnline = (now - lastSeen) < 420000;
            const rssi = config.wifi_rssi || 0;
            const rssiText = getRSSIStatusText(rssi);
            const signalBars = getSignalBarsHTML(rssi);
            const uptime = isOnline ? formatUptime(config.onlineSince || config.lastSeen) : '-';
            const lastSeenDisplay = lastSeen > 0 ? new Date(lastSeen).toLocaleString('th-TH') : 'ไม่ทราบ';
            
            html = `
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 14px;">
                    <!-- ID และชื่อ -->
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: #60a5fa; font-size: 1.2rem;">🆔</span>
                        <span style="color: #e2e8f0; font-weight: 700; font-family: monospace; font-size: 0.9rem;">${escapeHtml(id)}</span>
                    </div>
                    
                    <!-- สถานะออนไลน์/ออฟไลน์ -->
                    <div style="display: flex; align-items: center; gap: 6px; background: ${isOnline ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)'}; padding: 3px 12px; border-radius: 20px; border: 1px solid ${isOnline ? '#4ade80' : '#f87171'};">
                        <span style="font-size: 1rem;">${isOnline ? '🟢' : '🔴'}</span>
                        <span style="color: ${isOnline ? '#4ade80' : '#f87171'}; font-weight: 600; font-size: 0.85rem;">${isOnline ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                        ${isOnline ? `<span style="color: #94a3b8; font-size: 0.65rem; margin-left: 4px;">(${uptime})</span>` : ''}
                    </div>
                    
                    <!-- RSSI + Signal Bars -->
                    <div style="display: flex; align-items: center; gap: 8px; border-left: 1px solid #334155; padding-left: 12px;">
                        ${signalBars}
                        <div style="display: flex; flex-direction: column;">
                            <span style="color: #e2e8f0; font-weight: 500; font-size: 0.85rem;">${rssi} dBm</span>
                            <span style="color: #94a3b8; font-size: 0.65rem;">${rssiText}</span>
                        </div>
                    </div>
                    
                    <!-- Uptime (ถ้าออนไลน์) -->
                    ${isOnline ? `
                    <div style="display: flex; align-items: center; gap: 6px; border-left: 1px solid #334155; padding-left: 12px;">
                        <span style="color: #fbbf24;">⏳</span>
                        <div style="display: flex; flex-direction: column;">
                            <span style="color: #e2e8f0; font-weight: 500; font-size: 0.85rem;">${uptime}</span>
                            <span style="color: #94a3b8; font-size: 0.65rem;">ออนไลน์ต่อเนื่อง</span>
                        </div>
                    </div>
                    ` : `
                    <!-- ออฟไลน์ตั้งแต่ -->
                    <div style="display: flex; align-items: center; gap: 6px; border-left: 1px solid #334155; padding-left: 12px;">
                        <span style="color: #94a3b8;">📅</span>
                        <div style="display: flex; flex-direction: column;">
                            <span style="color: #94a3b8; font-size: 0.8rem;">ออฟไลน์ตั้งแต่</span>
                            <span style="color: #f87171; font-size: 0.75rem;">${lastSeenDisplay}</span>
                        </div>
                    </div>
                    `}
                </div>
            `;
        } else {
            // ถ้าหา board ไม่เจอ (กรณี error) ให้แสดงภาพรวมแทน
            const total = boards.length;
            const onlineBoards = boards.filter(([_, c]) => {
                const lastSeen = getTimestampMs(c.lastSeen);
                return (now - lastSeen) < 420000;
            });
            const onlineCount = onlineBoards.length;
            const offlineCount = total - onlineCount;
            
            html = `
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px;">
                    <span style="color: #f87171;">⚠️</span>
                    <span style="color: #e2e8f0;">ไม่พบข้อมูลบอร์ดที่เลือก</span>
                    <span style="color: #94a3b8; font-size: 0.8rem;">${total} บอร์ด</span>
                    <span style="color: #4ade80;">🟢 ${onlineCount}</span>
                    ${offlineCount > 0 ? `<span style="color: #f87171;">🔴 ${offlineCount}</span>` : ''}
                </div>
            `;
        }
    }

    detailEl.innerHTML = html;
    detailEl.style.display = 'block';
};

// ============================================================
//  31. SETTINGS MANAGER
// ============================================================
window.openSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('logInterval').value = 15;
    loadTelegramConfig();
    loadLoggingConfig();
};

window.closeSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'none';
};

window.saveLogInterval = async function() {
    const min = parseInt(document.getElementById('logInterval').value);
    if (isNaN(min) || min < 1) { alert("กรุณากรอกตัวเลขมากกว่า 0"); return; }
    try {
        await window.set(window.ref(window.db, `settings/log_interval`), min);
        alert(`✅ บันทึกความถี่เป็น ${min} นาที สำเร็จ`);
    } catch (e) { alert("❌ บันทึกไม่สำเร็จ: " + e.message); }
};

window.exportDataOffline = function() {
    if (sensorHistory.timestamps.length === 0) { alert("ไม่มีข้อมูลในระบบให้สำรองครับ"); return; }
    const dataStr = JSON.stringify(sensorHistory, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KLT_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.importDataOffline = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.timestamps && importedData.data) {
                sensorHistory = importedData;
                if (chart) {
                    chart.data.labels = sensorHistory.timestamps;
                    chart.data.datasets.forEach(ds => {
                        const matchedId = Object.keys(deviceConfigs).find(id => ds.label.includes(deviceConfigs[id]?.name));
                        if (matchedId && sensorHistory.data[matchedId]) ds.data = sensorHistory.data[matchedId];
                    });
                    chart.update();
                }
                alert("✅ โหลดข้อมูลจากไฟล์ Backup สำเร็จ");
                closeSettingsManager();
            } else throw new Error("โครงสร้างไฟล์ไม่ถูกต้อง");
        } catch (err) {
            alert("❌ ไฟล์ไม่ถูกต้อง หรือเกิดข้อผิดพลาดในการอ่านไฟล์");
            console.error(err);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
};

// ============================================================
//  32. AUTO-LOG (FIFO)
// ============================================================
window.loadLoggingConfig = async function() {
    if (!window.db) return;
    try {
        const snap = await window.get(window.ref(window.db, 'settings/logging_config'));
        if (snap.exists()) {
            const config = snap.val();
            const periodValue = document.getElementById('periodValue');
            const periodType = document.getElementById('periodType');
            const recordsPerPeriod = document.getElementById('recordsPerPeriod');

            if (periodValue) periodValue.value = config.val || '';
            if (periodType) periodType.value = config.type || 'day';
            if (recordsPerPeriod) recordsPerPeriod.value = config.rec || '';

            const periodLabel = document.getElementById('periodLabel');
            if (periodLabel) {
                const typeMap = { day: 'วัน', hour: 'ชั่วโมง', minute: 'นาที' };
                periodLabel.textContent = typeMap[config.type] || 'วัน';
            }

            const summaryGroupType = document.getElementById('summaryGroupType');
            if (summaryGroupType) {
                const typeMap = { day: 'วัน', hour: 'ชั่วโมง', minute: 'นาที' };
                summaryGroupType.textContent = typeMap[config.type] || 'วัน';
            }

            if (typeof calculateAutoLogPreview === 'function') {
                calculateAutoLogPreview();
            }

            console.log("✅ โหลดการตั้งค่า Auto-Log สำเร็จ:", config);
        } else {
            const periodValue = document.getElementById('periodValue');
            const periodType = document.getElementById('periodType');
            const recordsPerPeriod = document.getElementById('recordsPerPeriod');

            if (periodValue && !periodValue.value) periodValue.value = 1;
            if (periodType && !periodType.value) periodType.value = 'day';
            if (recordsPerPeriod && !recordsPerPeriod.value) recordsPerPeriod.value = 24;

            const periodLabel = document.getElementById('periodLabel');
            if (periodLabel) periodLabel.textContent = 'วัน';

            const summaryGroupType = document.getElementById('summaryGroupType');
            if (summaryGroupType) summaryGroupType.textContent = 'วัน';

            if (typeof calculateAutoLogPreview === 'function') {
                calculateAutoLogPreview();
            }

            console.log("📭 ยังไม่มีการตั้งค่า Auto-Log ใช้ค่าเริ่มต้น");
        }
    } catch (error) {
        console.warn("⚠️ โหลดการตั้งค่า Auto-Log ไม่สำเร็จ:", error);
    }
};

window.applyLoggingConfig = async function() {
    const periodValue = document.getElementById('periodValue');
    const periodType = document.getElementById('periodType');
    const recordsPerPeriod = document.getElementById('recordsPerPeriod');

    if (!periodValue || !periodType || !recordsPerPeriod) {
        alert("❌ ไม่พบฟิลด์การตั้งค่า");
        return;
    }

    const val = parseInt(periodValue.value);
    const type = periodType.value;
    const rec = parseInt(recordsPerPeriod.value);

    if (isNaN(val) || val < 1) { alert("⚠️ กรุณากรอกจำนวนให้ถูกต้อง (อย่างน้อย 1)"); periodValue.focus(); return; }
    if (isNaN(rec) || rec < 1) { alert("⚠️ กรุณากรอกจำนวนครั้งให้ถูกต้อง (อย่างน้อย 1)"); recordsPerPeriod.focus(); return; }

    let intervalMs = 0;
    const typeMap = { day: 'วัน', hour: 'ชั่วโมง', minute: 'นาที' };

    if (type === 'day') {
        intervalMs = (86400000) / rec;
    } else if (type === 'hour') {
        intervalMs = (val * 3600000) / rec;
    } else if (type === 'minute') {
        intervalMs = (val * 60000) / rec;
    } else {
        alert("⚠️ ประเภทข้อมูลไม่ถูกต้อง");
        return;
    }

    if (intervalMs < 1000) {
        alert("⚠️ ความถี่ในการบันทึกน้อยกว่า 1 วินาที กรุณาปรับลดจำนวนครั้ง");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการตั้งค่า Auto-Log:\n\n📊 ระยะเวลา: ${val} ${typeMap[type] || type}\n📈 จำนวนครั้ง: ${rec} ครั้ง\n⏱️ ความถี่: ${(intervalMs / 1000).toFixed(1)} วินาที`)) return;

    try {
        await window.set(window.ref(window.db, 'settings/logging_config'), {
            type: type,
            val: val,
            rec: rec,
            intervalMs: intervalMs,
            maxRecords: val * rec,
            updatedAt: new Date().toISOString()
        });

        startAutoLoggingFromConfig();
        alert("✅ บันทึกการตั้งค่า Auto-Log สำเร็จ");

        const periodLabel = document.getElementById('periodLabel');
        if (periodLabel) {
            periodLabel.textContent = typeMap[type] || type;
        }

        const summaryGroupType = document.getElementById('summaryGroupType');
        if (summaryGroupType) {
            summaryGroupType.textContent = typeMap[type] || 'วัน';
        }

        if (typeof calculateAutoLogPreview === 'function') {
            calculateAutoLogPreview();
        }

    } catch (error) {
        console.error("❌ applyLoggingConfig error:", error);
        alert("❌ บันทึกไม่สำเร็จ: " + error.message);
    }
};

async function startAutoLoggingFromConfig() {
    if (!window.db) return;
    if (autoLogIntervalId) {
        clearInterval(autoLogIntervalId);
        autoLogIntervalId = null;
    }

    try {
        const snap = await window.get(window.ref(window.db, 'settings/logging_config'));
        if (!snap.exists()) {
            console.log("📭 ไม่พบการตั้งค่า Auto-Log ใช้ค่าเริ่มต้น (15 นาที)");
            startAutoLogging(15);
            return;
        }

        const config = snap.val();
        const intervalMs = config.intervalMs || 900000;
        const maxRecords = config.maxRecords || 1000;

        console.log(`⏱️ เริ่ม Auto-Log: ทุก ${(intervalMs / 60000).toFixed(1)} นาที, เก็บสูงสุด ${maxRecords} รายการ`);

        autoLogIntervalId = setInterval(async () => {
            await logSensorDataWithFIFO(maxRecords);
        }, intervalMs);

        setTimeout(async () => {
            await logSensorDataWithFIFO(maxRecords);
        }, 3000);

    } catch (error) {
        console.error("❌ startAutoLoggingFromConfig error:", error);
        startAutoLogging(15);
    }
}

function startAutoLogging(minutes) {
    if (autoLogIntervalId) clearInterval(autoLogIntervalId);
    currentIntervalMinutes = minutes || 15;
    const ms = currentIntervalMinutes * 60 * 1000;
    console.log(`⏱️ เริ่มการบันทึกข้อมูลอัตโนมัติทุกๆ ${currentIntervalMinutes} นาที`);
    autoLogIntervalId = setInterval(async () => {
        if (Object.keys(currentSensorValues).length === 0) return;
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const path = `sensor_history/${dateStr}/${timeStr}`;
        try {
            const dataToSave = { ...currentSensorValues, savedAt: now.toISOString() };
            await window.set(window.ref(window.db, path), dataToSave);
            console.log(`📝 บันทึกข้อมูลสถิติลง Firebase สำเร็จ (${timeStr})`);
        } catch (e) { console.error("❌ บันทึกสถิติไม่สำเร็จ:", e); }
    }, ms);
}

async function logSensorDataWithFIFO(maxRecords) {
    if (!window.db) return;
    if (Object.keys(currentSensorValues).length === 0) {
        console.log("📭 ไม่มีข้อมูลเซนเซอร์ให้บันทึก");
        return;
    }

    try {
        const historyRef = window.ref(window.db, 'sensor_history');
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();

        const valuesToSave = {};
        for (const [id, value] of Object.entries(currentSensorValues)) {
            const config = deviceConfigs[id];
            if (config && config.type === 'ultrasonic' && config.installHeight && value !== undefined && value !== null) {
                const rawDistance = parseFloat(value);
                if (!isNaN(rawDistance)) {
                    valuesToSave[id] = config.installHeight - rawDistance;
                } else {
                    valuesToSave[id] = value;
                }
            } else {
                valuesToSave[id] = value;
            }
        }

        const newLog = {
            timestamp: now.toISOString(),
            values: valuesToSave,
            deviceConfigs: { ...deviceConfigs }
        };

        await window.push(historyRef, newLog);
        console.log(`📝 บันทึกข้อมูลสำเร็จ (${now.toLocaleString('th-TH')})`);

        sensorHistory.timestamps.push(timeLabel);
        if (sensorHistory.timestamps.length > 100) sensorHistory.timestamps.shift();

        for (const [id, value] of Object.entries(valuesToSave)) {
            if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
            sensorHistory.data[id].push(value);
            if (sensorHistory.data[id].length > 100) sensorHistory.data[id].shift();
        }

        if (chart) {
            chart.data.labels = sensorHistory.timestamps;
            chart.update('none');
        }

        const snapshot = await window.get(historyRef);
        if (!snapshot.exists()) return;

        const totalCount = snapshot.numChildren ? snapshot.numChildren() : Object.keys(snapshot.val()).length;

        if (totalCount > maxRecords) {
            const toDelete = totalCount - maxRecords;
            console.log(`🧹 ข้อมูลเกิน ${toDelete} รายการ กำลังลบข้อมูลเก่า...`);

            const oldestQuery = window.query(historyRef, window.orderByKey(), window.limitToFirst(toDelete));
            const oldestSnap = await window.get(oldestQuery);

            if (oldestSnap.exists()) {
                const updates = {};
                oldestSnap.forEach((child) => {
                    updates[child.key] = null;
                });
                await historyRef.update(updates);
                console.log(`✅ ลบข้อมูลเก่า ${toDelete} รายการสำเร็จ`);
            }
        }

    } catch (error) {
        console.error("❌ logSensorDataWithFIFO error:", error);
    }
}

function initAutoLogging() {
    if (!window.db) {
        console.warn("⚠️ Firebase ยังไม่พร้อม รอเริ่ม Auto-Log ทีหลัง");
        setTimeout(initAutoLogging, 2000);
        return;
    }
    startAutoLoggingFromConfig();

    const configRef = window.ref(window.db, 'settings/logging_config');
    window.onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            console.log("🔄 ตรวจพบการเปลี่ยนแปลงการตั้งค่า Auto-Log");
            startAutoLoggingFromConfig();
        }
    });
}

// ============================================================
//  33. AUTO-LOG PREVIEW & LABEL
// ============================================================
window.updatePeriodLabel = function() {
    const periodType = document.getElementById('periodType');
    const periodLabel = document.getElementById('periodLabel');

    if (!periodType || !periodLabel) return;

    const typeMap = { 'day': 'วัน', 'hour': 'ชั่วโมง', 'minute': 'นาที' };
    const selectedValue = periodType.value;
    periodLabel.textContent = typeMap[selectedValue] || 'วัน';
};

window.calculateAutoLogPreview = function() {
    const periodValue = document.getElementById('periodValue');
    const periodType = document.getElementById('periodType');
    const recordsPerPeriod = document.getElementById('recordsPerPeriod');
    const previewContainer = document.getElementById('logPreviewContainer');

    if (!periodValue || !periodType || !recordsPerPeriod || !previewContainer) return;

    const val = parseInt(periodValue.value);
    const type = periodType.value;
    const rec = parseInt(recordsPerPeriod.value);

    if (isNaN(val) || val < 1 || isNaN(rec) || rec < 1) {
        previewContainer.innerHTML = `<span style="color: #94a3b8; font-size: 0.8rem;">⚠️ กรุณากรอกข้อมูลให้ครบถ้วนเพื่อดูตัวอย่าง</span>`;
        return;
    }

    let totalRecords = 0;
    let intervalSeconds = 0;
    let timeUnitText = '';
    const typeMap = { day: 'วัน', hour: 'ชั่วโมง', minute: 'นาที' };

    if (type === 'day') {
        totalRecords = val * rec;
        intervalSeconds = (86400) / rec;
        timeUnitText = 'วัน';
    } else if (type === 'hour') {
        totalRecords = val * rec;
        intervalSeconds = (3600) / rec;
        timeUnitText = 'ชั่วโมง';
    } else if (type === 'minute') {
        totalRecords = val * rec;
        intervalSeconds = (60) / rec;
        timeUnitText = 'นาที';
    } else {
        previewContainer.innerHTML = `<span style="color: #ef4444;">❌ ประเภทข้อมูลไม่ถูกต้อง</span>`;
        return;
    }

    let intervalDisplay = '';
    if (intervalSeconds >= 3600) {
        const hours = Math.floor(intervalSeconds / 3600);
        const minutes = Math.round((intervalSeconds % 3600) / 60);
        if (minutes === 0) {
            intervalDisplay = `${hours} ชั่วโมง`;
        } else {
            intervalDisplay = `${hours} ชั่วโมง ${minutes} นาที`;
        }
    } else if (intervalSeconds >= 60) {
        const minutes = Math.floor(intervalSeconds / 60);
        const seconds = Math.round(intervalSeconds % 60);
        if (seconds === 0) {
            intervalDisplay = `${minutes} นาที`;
        } else {
            intervalDisplay = `${minutes} นาที ${seconds} วินาที`;
        }
    } else {
        intervalDisplay = `${Math.round(intervalSeconds)} วินาที`;
    }

    const estimatedSizeKB = Math.round((totalRecords * 0.3) / 1024 * 10) / 10;
    const estimatedSizeMB = Math.round((totalRecords * 0.3) / (1024 * 1024) * 100) / 100;

    previewContainer.innerHTML = `
        <div style="background: #0f172a; border-radius: 8px; padding: 12px 16px; border: 1px solid #1e293b; margin-top: 8px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                <div><div style="color: #60a5fa; font-size: 1.2rem; font-weight: bold;">${totalRecords.toLocaleString()}</div><div style="color: #94a3b8; font-size: 0.7rem;">📊 จำนวนข้อมูลทั้งหมด</div></div>
                <div><div style="color: #34d399; font-size: 1.2rem; font-weight: bold;">${intervalDisplay}</div><div style="color: #94a3b8; font-size: 0.7rem;">⏱️ ความถี่ในการบันทึก</div></div>
                <div><div style="color: #f472b6; font-size: 1.2rem; font-weight: bold;">${estimatedSizeMB > 1 ? `${estimatedSizeMB} MB` : `${estimatedSizeKB} KB`}</div><div style="color: #94a3b8; font-size: 0.7rem;">💾 พื้นที่โดยประมาณ</div></div>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; font-size: 0.7rem; color: #64748b;">
                <span>📅 ระยะเวลา: ${val} ${timeUnitText}</span>
                <span>📈 จำนวนต่อ ${timeUnitText}: ${rec} ครั้ง</span>
                <span>📦 ${Math.ceil(totalRecords / rec)} ${timeUnitText}</span>
            </div>
        </div>
    `;
};

window.updateLoggingDisplay = function() {
    updatePeriodLabel();
    calculateAutoLogPreview();
};

// ============================================================
//  34. MANUAL CLEANUP
// ============================================================
window.manualDeleteByRange = async function() {
    const startInput = document.getElementById('deleteStart');
    const endInput = document.getElementById('deleteEnd');

    if (!startInput || !endInput) {
        alert("❌ ไม่พบฟิลด์เลือกช่วงเวลา");
        return;
    }

    const startStr = startInput.value;
    const endStr = endInput.value;

    if (!startStr || !endStr) {
        alert("⚠️ กรุณาระบุช่วงเวลาให้ครบถ้วน");
        return;
    }

    const startTime = new Date(startStr).getTime();
    const endTime = new Date(endStr).getTime();

    if (isNaN(startTime) || isNaN(endTime)) {
        alert("⚠️ รูปแบบเวลาไม่ถูกต้อง");
        return;
    }

    if (startTime > endTime) {
        alert("⚠️ เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด");
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบข้อมูลในช่วงเวลา:\n\n📅 ตั้งแต่: ${new Date(startTime).toLocaleString('th-TH')}\n📅 ถึง: ${new Date(endTime).toLocaleString('th-TH')}`)) return;

    try {
        const historyRef = window.ref(window.db, 'sensor_history');
        const snapshot = await window.get(historyRef);

        if (!snapshot.exists()) {
            alert("📭 ไม่มีข้อมูลประวัติในระบบ");
            return;
        }

        let count = 0;
        const updates = {};

        snapshot.forEach((child) => {
            const data = child.val();
            if (data && data.timestamp) {
                const logTime = new Date(data.timestamp).getTime();
                if (logTime >= startTime && logTime <= endTime) {
                    updates[child.key] = null;
                    count++;
                }
            }
        });

        if (count === 0) {
            alert("📭 ไม่พบข้อมูลในช่วงเวลาที่ระบุ");
            return;
        }

        if (confirm(`⚠️ พบข้อมูล ${count} รายการในช่วงเวลานี้ ต้องการลบใช่หรือไม่?`)) {
            await historyRef.update(updates);
            alert(`✅ ลบข้อมูลสำเร็จ ${count} รายการ`);
        }

    } catch (error) {
        console.error("❌ manualDeleteByRange error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
};

window.manualDeleteAll = async function() {
    const userInput = prompt(`🔥 คำเตือนขั้นสูงสุด!\n\nคุณกำลังจะลบข้อมูลประวัติเซนเซอร์ทั้งหมดในระบบ!\n📊 ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้\n\n✅ พิมพ์ "ยืนยันลบทั้งหมด" เพื่อดำเนินการ`);

    if (userInput !== "ยืนยันลบทั้งหมด") {
        alert("❌ ยกเลิกการลบข้อมูล");
        return;
    }

    try {
        await window.remove(window.ref(window.db, 'sensor_history'));
        alert("✅ ล้างข้อมูลประวัติทั้งหมดเรียบร้อยแล้ว");
    } catch (error) {
        console.error("❌ manualDeleteAll error:", error);
        alert("❌ เกิดข้อผิดพลาด: " + error.message);
    }
};

// ============================================================
//  35. ANALYTICAL SUMMARY SYSTEM
// ============================================================
function groupDataByPeriod(rawData, type) {
    const grouped = {};

    if (!rawData || typeof rawData !== 'object') return grouped;

    Object.values(rawData).forEach(entry => {
        if (!entry || !entry.timestamp) return;

        const date = new Date(entry.timestamp);
        if (isNaN(date.getTime())) return;

        let periodKey;
        if (type === 'day') {
            periodKey = date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else if (type === 'hour') {
            periodKey = `${date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${String(date.getHours()).padStart(2, '0')}:00 น.`;
        } else {
            periodKey = `${date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} น.`;
        }

        if (!grouped[periodKey]) {
            grouped[periodKey] = { devices: {} };
        }

        const values = entry.values || entry;
        Object.entries(values).forEach(([devId, val]) => {
            if (deviceConfigs[devId]?.type === 'board') return;
            if (typeof val !== 'number' || isNaN(val)) return;

            if (!grouped[periodKey].devices[devId]) {
                grouped[periodKey].devices[devId] = {
                    start: val,
                    last: val,
                    min: val,
                    max: val,
                    deviceName: deviceConfigs[devId]?.name || devId
                };
            } else {
                const d = grouped[periodKey].devices[devId];
                d.last = val;
                d.min = Math.min(d.min, val);
                d.max = Math.max(d.max, val);
            }
        });
    });

    return grouped;
}

window.renderSummaryTableWithDetails = async function(startDate, endDate) {
    const tbody = document.getElementById('summaryTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#60a5fa;">⏳ กำลังประมวลผลข้อมูล...</td></tr>';

    try {
        const configSnap = await window.get(window.ref(window.db, 'settings/logging_config'));
        const config = configSnap.val() || { type: 'day' };
        const groupType = config.type || 'day';

        const startIso = new Date(startDate).toISOString();
        const endIso = new Date(endDate).toISOString();

        const historyRef = window.ref(window.db, 'sensor_history');
        const q = window.query(historyRef, window.orderByChild('timestamp'), window.startAt(startIso), window.endAt(endIso));

        const snapshot = await window.get(q);

        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">📭 ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>';
            return;
        }

        const rawData = snapshot.val();
        const groupedData = groupDataByPeriod(rawData, groupType);

        const periods = Object.keys(groupedData);
        if (periods.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">📭 ไม่พบข้อมูลที่สามารถจัดกลุ่มได้</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        let totalRows = 0;

        periods.sort((a, b) => {
            try {
                const dateA = new Date(a.replace(/ น\.$/, '').replace(/ (\d{2}):\d{2} น\./, ' $1:00'));
                const dateB = new Date(b.replace(/ น\.$/, '').replace(/ (\d{2}):\d{2} น\./, ' $1:00'));
                return dateA - dateB;
            } catch (e) {
                return 0;
            }
        });

        periods.forEach(period => {
            const data = groupedData[period];
            const deviceEntries = Object.entries(data.devices);

            deviceEntries.forEach(([id, stats]) => {
                const diff = (stats.last - stats.start);
                const diffDisplay = diff.toFixed(2);
                let statusText = '';
                let statusColor = '';

                if (diff > 0.01) {
                    statusText = '📈 เพิ่มขึ้น';
                    statusColor = '#10b981';
                } else if (diff < -0.01) {
                    statusText = '📉 ลดลง';
                    statusColor = '#ef4444';
                } else {
                    statusText = '➖ คงที่';
                    statusColor = '#f59e0b';
                }

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #1e293b';
                tr.innerHTML = `
                    <td style="padding: 8px 12px; color: #94a3b8; font-size: 0.8rem; white-space: nowrap;">${period}</td>
                    <td style="padding: 8px 12px; color: #e2e8f0; font-weight: 500;">${escapeHtml(stats.deviceName || id)}</td>
                    <td style="padding: 8px 12px; color: #94a3b8; font-size: 0.85rem;">${stats.start.toFixed(2)} ➔ ${stats.last.toFixed(2)}<span style="color: #64748b; font-size: 0.7rem; margin-left: 4px;">(min: ${stats.min.toFixed(2)} / max: ${stats.max.toFixed(2)})</span></td>
                    <td style="padding: 8px 12px; font-weight: bold; color: ${diff >= 0 ? '#10b981' : '#ef4444'};">${diff >= 0 ? '+' : ''}${diffDisplay}</td>
                    <td style="padding: 8px 12px; color: ${statusColor};">${statusText}</td>
                `;
                tbody.appendChild(tr);
                totalRows++;
            });
        });

        if (totalRows === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#94a3b8;">📭 ไม่พบข้อมูลที่สามารถแสดงได้</td></tr>';
        }

    } catch (error) {
        console.error('❌ renderSummaryTableWithDetails error:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#ef4444;">❌ เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    }
};

window.runSummaryQuery = function() {
    const startInput = document.getElementById('summaryStart');
    const endInput = document.getElementById('summaryEnd');

    if (!startInput || !endInput) {
        alert('⚠️ ไม่พบฟิลด์เลือกช่วงเวลา');
        return;
    }

    const startVal = startInput.value;
    const endVal = endInput.value;

    if (!startVal || !endVal) {
        alert('⚠️ กรุณาเลือกช่วงเวลาให้ครบถ้วน');
        return;
    }

    const startTime = new Date(startVal).getTime();
    const endTime = new Date(endVal).getTime();

    if (isNaN(startTime) || isNaN(endTime)) {
        alert('⚠️ รูปแบบเวลาไม่ถูกต้อง');
        return;
    }

    if (startTime > endTime) {
        alert('⚠️ เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด');
        return;
    }

    window.renderSummaryTableWithDetails(startVal, endVal);
};

window.setDefaultSummaryTimeRange = function() {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const startInput = document.getElementById('summaryStart');
    const endInput = document.getElementById('summaryEnd');

    if (startInput) {
        const year = oneDayAgo.getFullYear();
        const month = String(oneDayAgo.getMonth() + 1).padStart(2, '0');
        const day = String(oneDayAgo.getDate()).padStart(2, '0');
        const hours = String(oneDayAgo.getHours()).padStart(2, '0');
        const minutes = String(oneDayAgo.getMinutes()).padStart(2, '0');
        startInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    if (endInput) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        endInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    if (typeof window.runSummaryQuery === 'function') {
        setTimeout(() => {
            window.runSummaryQuery();
        }, 300);
    }
};

// ============================================================
//  36. TEMPLATES & CUSTOM TYPE
// ============================================================
function renderTemplateSelector() {
    const container = document.getElementById('templateSelectorContainer');
    if (!container) return;

    let html = `<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;"><span style="color: #94a3b8; font-size: 0.75rem; display: flex; align-items: center;">📋 โหลดเทมเพลต:</span>`;

    for (const [key, template] of Object.entries(SENSOR_TEMPLATES)) {
        html += `<button type="button" onclick="loadSensorTemplate('${key}')" style="background: #1e293b; color: #e2e8f0; border: 1px solid #475569; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.7rem; hover:background: #334155;">${template.label}</button>`;
    }

    html += `<button type="button" onclick="resetLevelConfigInline()" style="background: #ef4444; color: white; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.7rem;">🔄 รีเซ็ต</button></div>`;

    container.innerHTML = html;
}

function initTemplateSelector() {
    const levelConfigContainer = document.getElementById('levelConfigInlineContainer');
    if (levelConfigContainer) {
        const parent = levelConfigContainer.parentElement;
        if (parent) {
            let templateContainer = document.getElementById('templateSelectorContainer');
            if (!templateContainer) {
                templateContainer = document.createElement('div');
                templateContainer.id = 'templateSelectorContainer';
                templateContainer.style.cssText = 'margin-bottom: 8px;';
                parent.insertBefore(templateContainer, levelConfigContainer);
            }
            renderTemplateSelector();
        }
    }
}

window.loadSensorTemplate = function(templateKey) {
    if (!templateKey || !SENSOR_TEMPLATES[templateKey]) {
        alert('⚠️ ไม่พบเทมเพลตสำหรับชนิดนี้');
        return;
    }

    const template = SENSOR_TEMPLATES[templateKey];
    const levels = template.levels;

    renderLevelConfigInline(levels);

    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) {
        modeSelect.value = 'manual';
        toggleLevelMode();
    }

    const container = document.getElementById('levelConfigInlineContainer');
    if (container) {
        container.dataset.boundaryApplied = 'true';
    }

    console.log(`✅ โหลดเทมเพลต ${template.label} สำเร็จ`);
};

window.autoGenerateLevels = function() {
    const minInput = document.getElementById('autoMin');
    const maxInput = document.getElementById('autoMax');

    if (!minInput || !maxInput) {
        console.warn("⚠️ ไม่พบฟิลด์ autoMin หรือ autoMax");
        return;
    }

    const min = parseFloat(minInput.value);
    const max = parseFloat(maxInput.value);

    if (isNaN(min) || isNaN(max)) {
        alert('⚠️ กรุณากรอกค่าต่ำสุดและสูงสุดให้ถูกต้อง');
        return;
    }

    if (max <= min) {
        alert('⚠️ ค่าสูงสุดต้องมากกว่าค่าต่ำสุด');
        return;
    }

    const step = (max - min) / 5;

    const levels = {
        very_low: { min: Math.round(min), max: Math.round(min + step - 1), label: 'น้อยที่สุด' },
        low: { min: Math.round(min + step), max: Math.round(min + step * 2 - 1), label: 'น้อย' },
        normal: { min: Math.round(min + step * 2), max: Math.round(min + step * 3 - 1), label: 'ปานกลาง' },
        high: { min: Math.round(min + step * 3), max: Math.round(min + step * 4 - 1), label: 'มาก' },
        very_high: { min: Math.round(min + step * 4), max: Math.round(max), label: 'มากที่สุด' }
    };

    renderLevelConfigInline(levels);

    const container = document.getElementById('levelConfigInlineContainer');
    if (container) {
        container.dataset.boundaryApplied = 'true';
    }

    console.log(`✅ สร้างระดับอัตโนมัติจาก ${min} ถึง ${max}`);
};

window.applyRiverLevels = function() {
    const minInput = document.getElementById('riverMin');
    const normalInput = document.getElementById('riverNormal');
    const warningInput = document.getElementById('riverWarning');
    const criticalInput = document.getElementById('riverCritical');

    if (!minInput || !normalInput || !warningInput || !criticalInput) {
        console.warn("⚠️ ไม่พบฟิลด์ River Mode");
        return;
    }

    const min = parseFloat(minInput.value);
    const normal = parseFloat(normalInput.value);
    const warning = parseFloat(warningInput.value);
    const critical = parseFloat(criticalInput.value);

    if (isNaN(min) || isNaN(normal) || isNaN(warning) || isNaN(critical)) {
        alert('⚠️ กรุณากรอกค่าทุกช่องให้ถูกต้อง');
        return;
    }

    if (min >= normal || normal >= warning || warning >= critical) {
        alert('⚠️ ค่าต้องเรียงจากน้อยไปมาก: Min < Normal < Warning < Critical');
        return;
    }

    const levels = {
        very_low: { min: 0, max: min, label: 'น้ำน้อยมาก' },
        low: { min: min + 1, max: normal, label: 'น้ำน้อย' },
        normal: { min: normal + 1, max: warning, label: 'ปกติ' },
        high: { min: warning + 1, max: critical, label: 'เตือนภัย' },
        very_high: { min: critical + 1, max: 999, label: 'วิกฤต' }
    };

    renderLevelConfigInline(levels);

    const container = document.getElementById('levelConfigInlineContainer');
    if (container) {
        container.dataset.boundaryApplied = 'true';
    }

    console.log(`✅ ตั้งค่าระดับ River Mode: Min=${min}, Normal=${normal}, Warning=${warning}, Critical=${critical}`);
};

// ============================================================
//  37. CUSTOM TYPE VISIBILITY
// ============================================================
window.updateCustomTypeVisibility = function() {
    const type = document.getElementById('devType').value;
    const customContainer = document.getElementById('customTypeContainer');
    const usConfig = document.getElementById('ultrasonicVerticalConfig');
    
    if (customContainer) customContainer.style.display = (type === 'other') ? 'block' : 'none';
    if (usConfig) usConfig.style.display = (type === 'ultrasonic') ? 'block' : 'none';
};

function initCustomTypeFields() {
    const deviceModal = document.getElementById('deviceModal');
    if (deviceModal) {
        let customContainer = document.getElementById('customTypeContainer');
        if (!customContainer) {
            const devTypeSelect = document.getElementById('devType');
            if (devTypeSelect) {
                const parent = devTypeSelect.parentElement;
                const container = document.createElement('div');
                container.id = 'customTypeContainer';
                container.style.cssText = 'display:none; margin-top:10px;';

                const input = document.createElement('input');
                input.type = 'text';
                input.id = 'devTypeCustom';
                input.placeholder = 'ระบุชนิดเซนเซอร์ของคุณที่นี่ (เช่น Lux, CO2)';
                input.style.cssText = 'width:100%; padding:8px; border-radius:6px; border:1px solid #475569; background:#1e293b; color:#e2e8f0;';

                container.appendChild(input);
                parent.appendChild(container);
            }
        }

        let usConfig = document.getElementById('ultrasonicVerticalConfig');
        if (!usConfig) {
            const devTypeSelect = document.getElementById('devType');
            if (devTypeSelect) {
                const parent = devTypeSelect.parentElement;
                const container = document.createElement('div');
                container.id = 'ultrasonicVerticalConfig';
                container.style.cssText = 'display:none; margin-top:15px; padding:15px; background:#0f172a; border-radius:8px; border:1px solid #3b82f6;';
                
                container.innerHTML = `
                    <h4 style="color: #60a5fa; margin-bottom: 10px;">🌊 ตั้งค่าการวัดระดับน้ำแนวตั้ง</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div>
                            <label style="color: #94a3b8; font-size: 0.75rem; display: block; margin-bottom: 4px;">📏 ระยะติดตั้ง (เซนเซอร์ถึงก้นบ่อ)</label>
                            <input type="number" id="installHeight" placeholder="เช่น 200 (cm)" step="any" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                        </div>
                        <div>
                            <label style="color: #94a3b8; font-size: 0.75rem; display: block; margin-bottom: 4px;">⚠️ ระดับตลิ่ง (วัดจากก้นบ่อขึ้นมา)</label>
                            <input type="number" id="bankHeight" placeholder="เช่น 180 (cm)" step="any" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                        </div>
                    </div>
                    <p style="font-size: 0.65rem; color: #64748b; margin-top: 8px;">
                        * สูตร: ระดับน้ำจริง = ระยะติดตั้ง - ระยะที่เซนเซอร์วัดได้<br>
                        * ถ้าระดับน้ำจริง ≥ ระดับตลิ่ง = <b>น้ำท่วมตลิ่ง</b>
                    </p>
                `;
                parent.appendChild(container);
            }
        }

        let usInstruction = document.getElementById('ultrasonicInstruction');
        if (!usInstruction) {
            const devTypeSelect = document.getElementById('devType');
            if (devTypeSelect) {
                const parent = devTypeSelect.parentElement;
                const container = document.createElement('div');
                container.id = 'ultrasonicInstruction';
                container.style.cssText = 'margin-top: 15px; padding: 15px; background: #064e3b; border-radius: 8px; border: 1px solid #10b981; font-size: 0.8rem; color: #d1fae5;';
                
                container.innerHTML = `
                    <h4 style="color: #6ee7b7; margin-bottom: 8px;">💡 คำแนะนำการตั้งค่าให้ถูกต้อง:</h4>
                    <ul style="padding-left: 20px; margin: 0;">
                        <li><b>ระยะติดตั้ง:</b> วัดจาก <u>จุดติดตั้งเซนเซอร์</u> ถึง <u>ก้นบ่อ/พื้นบ่อ</u> (หน่วยเป็น cm)</li>
                        <li><b>ระดับตลิ่ง:</b> วัดจาก <u>ก้นบ่อ</u> ขึ้นมาถึง <u>ระดับที่น้ำจะล้นตลิ่ง</u> (หน่วยเป็น cm)</li>
                        <li>ตัวอย่าง: บ่อลึก 300 cm ติดเซนเซอร์ที่ปากบ่อ ให้กรอก 300 / ถ้าต้องการเตือนที่ระดับ 280 cm ให้กรอก 280</li>
                    </ul>
                `;
                parent.appendChild(container);
            }
        }
    }

    const devTypeSelect = document.getElementById('devType');
    if (devTypeSelect) {
        let hasOther = false;
        for (const option of devTypeSelect.options) {
            if (option.value === 'other') {
                hasOther = true;
                break;
            }
        }
        if (!hasOther) {
            const option = document.createElement('option');
            option.value = 'other';
            option.textContent = '📝 อื่นๆ (ระบุเอง)';
            devTypeSelect.appendChild(option);
        }
        devTypeSelect.setAttribute('onchange', 'updateCustomTypeVisibility();');
    }

    updateCustomTypeVisibility();
}

window.updateDynamicFields = function(existingThresholds = {}) {
    const type = document.getElementById('devType').value;
    const customContainer = document.getElementById('customTypeContainer');
    if (customContainer) {
        customContainer.style.display = (type === 'other') ? 'block' : 'none';
    }

    const container = document.getElementById('dynamicFields');
    if (!container) return;

    const label1 = existingThresholds.label1 || '';
    const val1 = existingThresholds.val1 || '';
    const label2 = existingThresholds.label2 || '';
    const val2 = existingThresholds.val2 || '';

    let html = `
        <div style="flex:1; min-width: 200px;">
            <input type="text" id="thr_label_1" placeholder="ชื่อเกณฑ์แจ้งเตือน 1 (เช่น ระดับเตือนภัย)" value="${label1}" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
            <input type="number" id="thr_val_1" placeholder="ค่าเกณฑ์ 1" value="${val1}" style="width:100%; margin-top:5px; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
        </div>
        <div style="flex:1; min-width: 200px;">
            <input type="text" id="thr_label_2" placeholder="ชื่อเกณฑ์แจ้งเตือน 2 (เช่น ระดับอันตราย)" value="${label2}" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
            <input type="number" id="thr_val_2" placeholder="ค่าเกณฑ์ 2" value="${val2}" style="width:100%; margin-top:5px; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
        </div>
    `;
    container.innerHTML = html;
};

// ============================================================
//  38. CONFIRM FUNCTIONS
// ============================================================
window.confirmDeleteDevice = function(id) {
    const config = deviceConfigs[id];
    const deviceName = config ? config.name : id;
    if (confirm(`⚠️ คำเตือน: คุณต้องการลบอุปกรณ์ "${deviceName}" (ID: ${id}) ออกจากระบบถาวรใช่หรือไม่?`)) {
        deleteDevice(id);
    }
};

window.confirmDeleteUser = function(username) {
    if (confirm(`⚠️ คำเตือน: คุณต้องการลบผู้ใช้ "${username}" ออกจากระบบถาวรใช่หรือไม่?`)) {
        deleteUser(username);
    }
};

window.confirmClearHistory = function() {
    if (confirm("⚠️ ยืนยันการลบประวัติการส่งทั้งหมด?")) {
        clearHistory();
    }
};

function applyDisabledCardStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .disabled-card { opacity: 0.6; filter: grayscale(1); border: 2px dashed #64748b; }
        .disabled-card .sensor-value { color: #94a3b8 !important; }
        .disabled-card .sensor-unit { color: #64748b !important; }
        .disabled-card .timestamp { color: #64748b !important; }
    `;
    document.head.appendChild(style);
}

function initializeAllFeatures() {
    applyDisabledCardStyles();
    updateAlertHistoryDropdown();
    console.log("✅ ระบบพร้อมทำงาน (เวอร์ชันปรับปรุงใหม่)");
    console.log("   🔹 ระบบ Auto-Log (FIFO) เริ่มต้นแล้ว");
    console.log("   🔹 ระบบ Global Mute พร้อมทำงาน");
    console.log("   🔹 ระบบ Throttle พร้อมใช้งาน");
    console.log("   🔹 ระบบ onDisconnect ใช้ Functional API");
    console.log("   🔹 ปรับเกณฑ์ offline/online เป็น 7 นาที");
    console.log("   🔹 ใช้ Server Time Offset");
    console.log("   🔹 ระบบสรุปข้อมูลเชิงวิเคราะห์ (Analytics) พร้อมใช้งาน");
    console.log("   🔹 รองรับ Ultrasonic Vertical Water Level (วัดระดับน้ำแนวตั้ง)");
    console.log("   🔹 ปุ่ม Admin Menu แสดงเฉพาะ Admin");
}

// ============================================================
//  39. DOMContentLoaded - MAIN ENTRY POINT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 กำลังเริ่มต้นระบบ...");

    // ✅ ตรวจสอบ Role จาก sessionStorage ทันทีที่โหลดหน้าเว็บ
    const savedRole = sessionStorage.getItem('activeRole');
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedRole && savedUser) {
        console.log(`👤 พบ session: ${savedUser} (${savedRole})`);
        applyRole(savedRole, savedUser);
        updatePresence(savedUser, savedRole);
        updateCompactOnlineUsers();
        initTitleListener();
        startDeviceHealthMonitor();
    } else {
        console.log("👤 ไม่พบ session, รอ login");
    }

    if (window.db) {
        initFirebaseListeners();
    }

    const checkDbInterval = setInterval(() => {
        if (window.db) {
            clearInterval(checkDbInterval);
            const settingsRef = window.ref(window.db, 'settings/log_interval');
            window.onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) {
                    console.log(`📊 พบการตั้งค่า log_interval: ${snapshot.val()} นาที`);
                }
            });
            loadGlobalMuteStatus();
            setTimeout(() => {
                loadLoggingConfig();
                initAutoLogging();
            }, 1000);
        }
    }, 500);

    function checkAutoLogin() {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        if (rememberMe) {
            const savedUsername = localStorage.getItem('savedUsername');
            const savedPassword = localStorage.getItem('savedPassword');
            if (savedUsername && savedPassword) {
                document.getElementById('username').value = savedUsername;
                document.getElementById('password').value = savedPassword;
                document.getElementById('rememberMe').checked = true;
                handleLogin();
            }
        }
    }
    checkAutoLogin();

    initChart();
    createStandaloneAlertPanelIfNotExists();
    initCustomTypeFields();

    window.renderLevelConfigInline = renderLevelConfigInline;
    window.toggleLevelMode = toggleLevelMode;
    window.applyBoundaryToLevels = applyBoundaryToLevels;
    window.resetLevelConfigInline = resetLevelConfigInline;
    window.getLevelConfigFromForm = getLevelConfigFromForm;
    window.evaluateLevelWithCustom = evaluateLevelWithCustom;
    window.updateSensorCardLevel = updateSensorCardLevel;
    window.checkLevelAlert = checkLevelAlert;
    window.checkLevelAlerts = checkLevelAlerts;

    renderLevelConfigInline(null);
    toggleLevelMode();

    initializeAllFeatures();
    updateAlertHistoryDropdown();

    setTimeout(() => {
        initTemplateSelector();
        renderTemplateSelector();
    }, 500);

    setTimeout(() => {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        const savedUsername = localStorage.getItem('savedUsername');
        if (rememberMe && savedUsername && !sessionStorage.getItem('currentUser')) {
            const passwordField = document.getElementById('password');
            if (passwordField && passwordField.value) {
                handleLogin();
            }
        }
    }, 1000);

    setTimeout(() => {
        initializeAllFeatures();
        console.log("✅ ระบบพร้อมทำงาน (เวอร์ชันปรับปรุงใหม่)");
        // ✅ เพิ่ม: อัปเดต Status Bar หลังจากโหลดทุกอย่าง
        updateStatusBarBoardDetails();
    }, 2000);
});

console.log("✅ โหลดโค้ดเวอร์ชันปรับปรุงเรียบร้อย");