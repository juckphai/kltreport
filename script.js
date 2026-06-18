// ==========================================
// 📋 หัวข้อหลักที่ 1: Global Variables
// ==========================================
let deviceConfigs = {}; // เก็บตั้งค่าอุปกรณ์จาก Firebase
let currentSensorValues = {}; // เก็บค่าปัจจุบัน
let chart;

// ข้อมูลสำหรับกราฟ (แยกตาม ID ของเซนเซอร์)
let sensorHistory = {
    timestamps: [],
    data: {} // เช่น { "us_01": [10, 12, ...], "soil_01": [50, 45, ...] }
};

let connectionMode = 'offline';

// ตัวแปรสำหรับเก็บ interval ของ Presence
let presenceIntervalId = null;
let currentUsername = null;
let currentUserRole = null;

// ตัวแปรสำหรับเก็บสถานะเตือนภัยน้ำล้นตลิ่ง
let floodAlertStatus = {}; // เก็บสถานะการเตือนของแต่ละอุปกรณ์ { "us_01": "normal", "us_02": "flood" }

// ตัวแปรสำหรับระบบ Telegram
let telegramConfig = {};
let telegramCheckInterval = null;

// ตัวแปรสำหรับระบบแจ้งเตือนอุปกรณ์ออฟไลน์
let deviceHealthMonitorInterval = null;

// ตัวแปรสำหรับการบันทึกอัตโนมัติ
let autoLogIntervalId = null;
let currentIntervalMinutes = 15;

// ==========================================
// 📋 หัวข้อหลักที่ 2: ค่าคงที่สำหรับระบบ Level Config (5 ระดับ)
// ==========================================

const DEFAULT_LEVELS_CONFIG = {
    very_high: { min: 90, max: 100, label: '🔴 มากที่สุด', color: '#ef4444' },
    high: { min: 70, max: 89, label: '🟠 มาก', color: '#f59e0b' },
    normal: { min: 40, max: 69, label: '🟢 ปานกลาง', color: '#10b981' },
    low: { min: 20, max: 39, label: '🔵 น้อย', color: '#3b82f6' },
    very_low: { min: 0, max: 19, label: '🟣 น้อยที่สุด', color: '#6366f1' }
};

const LEVEL_KEYS = ['very_high', 'high', 'normal', 'low', 'very_low'];
const LEVEL_NAMES = {
    very_high: 'มากที่สุด',
    high: 'มาก',
    normal: 'ปานกลาง',
    low: 'น้อย',
    very_low: 'น้อยที่สุด'
};
const LEVEL_EMOJIS = {
    very_high: '🔴',
    high: '🟠',
    normal: '🟢',
    low: '🔵',
    very_low: '🟣'
};
const LEVEL_COLORS = {
    very_high: '#ef4444',
    high: '#f59e0b',
    normal: '#10b981',
    low: '#3b82f6',
    very_low: '#6366f1'
};

// ==========================================
// 🏷️ หัวข้อหลักที่ 3: ระบบจัดการชื่อโครงการ (Project Title Management)
//    🔹 3.1 initTitleListener - ฟังการเปลี่ยนแปลงชื่อโครงการ
//    🔹 3.2 openTitleEditor - เปิดหน้าต่างแก้ไขชื่อ
//    🔹 3.3 closeTitleEditor - ปิดหน้าต่างแก้ไขชื่อ
//    🔹 3.4 saveProjectTitle - บันทึกชื่อโครงการ
//    🔹 3.5 deleteProjectTitle - ลบชื่อโครงการ
// ==========================================

// 🔹 3.1: initTitleListener
function initTitleListener() {
    if (!window.db) return;
    
    const titleRef = window.ref(window.db, 'settings/project_title');
    window.onValue(titleRef, (snapshot) => {
        const titleEl = document.getElementById('projectTitle');
        if (!titleEl) return;
        
        const title = snapshot.exists() ? snapshot.val() : "หน้าจอจัดการและรายงานโครงการ(น้องโค้ก)";
        titleEl.textContent = title;
        
        const activeRole = sessionStorage.getItem('activeRole');
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) {
            editBtn.style.display = (activeRole === 'admin') ? 'block' : 'none';
        }
    });
}

// 🔹 3.2: openTitleEditor
window.openTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    const titleEl = document.getElementById('projectTitle');
    const inputField = document.getElementById('newProjectTitle');
    
    if (modal && titleEl && inputField) {
        modal.style.display = 'flex';
        inputField.value = titleEl.textContent;
    }
};

// 🔹 3.3: closeTitleEditor
window.closeTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// 🔹 3.4: saveProjectTitle
window.saveProjectTitle = async function() {
    const newTitle = document.getElementById('newProjectTitle').value.trim();
    if (!newTitle) {
        alert("กรุณากรอกชื่อโครงการ");
        return;
    }
    
    try {
        await window.set(window.ref(window.db, 'settings/project_title'), newTitle);
        closeTitleEditor();
        alert("✅ บันทึกชื่อโครงการสำเร็จ");
    } catch (e) {
        alert("❌ บันทึกไม่สำเร็จ: " + e.message);
    }
};

// 🔹 3.5: deleteProjectTitle
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

// ==========================================
// 👥 หัวข้อหลักที่ 4: ระบบ Presence (แสดงรายชื่อผู้ใช้ที่ออนไลน์)
//    🔹 4.1 updatePresence - อัปเดตสถานะออนไลน์
//    🔹 4.2 removePresence - ลบสถานะออนไลน์
//    🔹 4.3 updateCompactOnlineUsers - อัปเดตแสดงรายชื่อผู้ใช้ออนไลน์
// ==========================================

// 🔹 4.1: updatePresence
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
            onDisconnectRef.onDisconnect().remove().catch(err => console.warn("⚠️ onDisconnect error:", err));
        }
    });

    if (presenceIntervalId) clearInterval(presenceIntervalId);
    presenceIntervalId = setInterval(() => {
        window.update(presenceRef, {
            lastSeen: new Date().toISOString()
        }).catch(err => console.warn("⚠️ lastSeen update error:", err));
    }, 30000);
}

// 🔹 4.2: removePresence
function removePresence(username) {
    if (!window.db || !username) return;
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    window.remove(presenceRef).catch(err => console.warn("⚠️ removePresence error:", err));
}

// 🔹 4.3: updateCompactOnlineUsers
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
                    listHtml += `
                        <div class="compact-user-item">
                            <span class="role-icon">${roleIcon}</span>
                            <span class="username-text">${escapeHtml(user.name)}</span>
                        </div>
                    `;
                });
                compactListEl.innerHTML = listHtml;
            } else {
                compactListEl.innerHTML = '<div class="compact-user-item" style="opacity:0.7;">ไม่มีผู้ใช้ออนไลน์</div>';
            }
        } else {
            compactTextEl.textContent = `ออนไลน์ 0 คน`;
            compactListEl.innerHTML = '<div class="compact-user-item" style="opacity:0.7;">ไม่มีผู้ใช้ออนไลน์</div>';
        }
    });
}

// ==========================================
// 🔐 หัวข้อหลักที่ 5: ระบบ Login (ตรวจสอบจาก Firebase)
//    🔹 5.1 togglePassword - แสดง/ซ่อนรหัสผ่าน
//    🔹 5.2 handleLogin - จัดการการล็อกอิน
//    🔹 5.3 loginSuccess - ทำงานเมื่อล็อกอินสำเร็จ
//    🔹 5.4 applyRole - กำหนดสิทธิ์และแสดง UI
// ==========================================

// 🔹 5.1: togglePassword
window.togglePassword = function() {
    const passInput = document.getElementById('password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
};

// 🔹 5.2: handleLogin
window.handleLogin = async function() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const remember = document.getElementById('rememberMe').checked;

    if (!user || !pass) return alert('กรุณากรอกข้อมูลให้ครบ');

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

// 🔹 5.3: loginSuccess
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
    
    // เริ่มตรวจสอบสุขภาพอุปกรณ์เมื่อ login สำเร็จ
    startDeviceHealthMonitor();
}

// 🔹 5.4: applyRole
function applyRole(role, username) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    
    // แสดงชื่อผู้ใช้ (ไม่แสดงสิทธิ์)
    const userNameSpan = document.getElementById('currentUserName');
    if (userNameSpan) {
        userNameSpan.textContent = username;
    }
    
    if (role === 'admin') {
        document.getElementById('adminControls').classList.remove('role-hidden');
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) editBtn.style.display = 'block';
    } else {
        document.getElementById('adminControls').classList.add('role-hidden');
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) editBtn.style.display = 'none';
    }
}

// ==========================================
// 🚪 หัวข้อหลักที่ 6: ระบบ Logout (พร้อมลบ Presence)
//    🔹 6.1 logout - ออกจากระบบ
// ==========================================

// 🔹 6.1: logout
window.logout = async function() {
    const currentUser = sessionStorage.getItem('currentUser');
    
    if (presenceIntervalId) {
        clearInterval(presenceIntervalId);
        presenceIntervalId = null;
    }
    
    // หยุดการทำงานของ Telegram auto check เมื่อ Logout
    if (telegramCheckInterval) {
        clearInterval(telegramCheckInterval);
        telegramCheckInterval = null;
    }
    
    // หยุดการทำงานของ Device Health Monitor เมื่อ Logout
    if (deviceHealthMonitorInterval) {
        clearInterval(deviceHealthMonitorInterval);
        deviceHealthMonitorInterval = null;
    }
    
    localStorage.removeItem('savedUsername');
    localStorage.removeItem('savedPassword');
    localStorage.removeItem('rememberMe');
    sessionStorage.clear();

    if (currentUser && window.db) {
        const presenceRef = window.ref(window.db, 'online_users/' + currentUser);
        try {
            await presenceRef.onDisconnect().cancel();
            await window.remove(presenceRef);
            console.log("✅ ลบสถานะออนไลน์เรียบร้อย");
        } catch (err) {
            console.error("❌ ลบสถานะออนไลน์ไม่สำเร็จ:", err);
        }
    }
    
    window.location.reload();
};

// ==========================================
// 👥 หัวข้อหลักที่ 7: ระบบจัดการผู้ใช้งาน (User Manager)
//    🔹 7.1 openUserManager - เปิดหน้าจอจัดการผู้ใช้
//    🔹 7.2 closeUserManager - ปิดหน้าจอจัดการผู้ใช้
//    🔹 7.3 editUser - แก้ไขข้อมูลผู้ใช้
//    🔹 7.4 saveUser - บันทึก/อัปเดตผู้ใช้
//    🔹 7.5 deleteUser - ลบผู้ใช้
//    🔹 7.6 renderUserTable - แสดงตารางผู้ใช้
//    🔹 7.7 escapeHtml - ป้องกัน XSS
// ==========================================

// 🔹 7.1: openUserManager
window.openUserManager = async function() {
    document.getElementById('userModal').style.display = 'flex';
    await renderUserTable();
};

// 🔹 7.2: closeUserManager
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

// 🔹 7.3: editUser
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

// 🔹 7.4: saveUser
window.saveUser = async function(isEdit = false) {
    const username = document.getElementById('manageUsername').value.trim();
    const password = document.getElementById('managePassword').value.trim();
    const role = document.getElementById('manageRole').value;

    if (!username || !password) return alert("กรุณากรอก Username และ Password");

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

// 🔹 7.5: deleteUser
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
                alert("❌ ไม่สามารถลบได้: ระบบจำเป็นต้องมีบัญชี Admin อย่างน้อย 1 บัญชีเพื่อจัดการระบบ");
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

// 🔹 7.6: renderUserTable
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
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">📭 ยังไม่มีข้อมูลผู้ใช้ กรุณาเพิ่มผู้ใช้ด้านบน</td></tr>';
        }
    } catch (error) {
        console.error("Error loading users:", error);
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: #d32f2f;">❌ โหลดข้อมูลล้มเหลว: ${error.message}</td></tr>`;
    }
}

// 🔹 7.7: escapeHtml
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==========================================
// ⚙️ หัวข้อหลักที่ 8: ระบบจัดการอุปกรณ์เซนเซอร์ (Device Manager)
//    🔹 8.1 openDeviceManager - เปิด Device Manager
//    🔹 8.2 closeDeviceManager - ปิด Device Manager
//    🔹 8.3 toggleDevice - สลับสถานะการทำงานของอุปกรณ์
//    🔹 8.4 deleteDevice - ลบอุปกรณ์
//    🔹 8.5 resetDeviceForm - รีเซ็ตฟอร์ม (ปรับปรุง: ใช้ Advanced Alert เพียงอย่างเดียว)
//    🔹 8.6 handleEditClick - จัดการคลิกปุ่มแก้ไข
//    🔹 8.7 renderDeviceTable - แสดงตารางอุปกรณ์ (ปรับปรุง: ใช้ Advanced Alert)
//    🔹 8.8 renderLevelConfigInline - แสดง UI ระดับในฟอร์ม
//    🔹 8.9 toggleLevelMode - สลับโหมดการตั้งค่าระดับ
//    🔹 8.10 applyBoundaryToLevels - นำค่าขีดจำกัดมาใช้กับระดับ
//    🔹 8.11 resetLevelConfigInline - รีเซ็ตค่าระดับ
//    🔹 8.12 getLevelConfigFromForm - อ่านค่าระดับจากฟอร์ม
//    🔹 8.13 saveDeviceWithLevelConfig - บันทึกอุปกรณ์พร้อมระดับ
//    🔹 8.14 loadDeviceForEditWithLevelConfig - โหลดข้อมูลแก้ไข
//    🔹 8.15 loadAdvancedAlertConfig - โหลดการตั้งค่า Advanced Alert
// ==========================================

// 🔹 8.1: openDeviceManager
window.openDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
        renderDeviceTable();
        renderBoardTable();
        resetDeviceForm();
        renderLevelConfigInline(null);
    }
};

// 🔹 8.2: closeDeviceManager
window.closeDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'none';
        resetDeviceForm();
    }
};

// 🔹 8.3: toggleDevice
window.toggleDevice = async function(id, currentStatus) {
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), { enabled: !currentStatus });
        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
    } catch(e) { 
        console.error("❌ toggleDevice error:", e);
        alert("❌ เปลี่ยนสถานะไม่สำเร็จ: " + e.message);
    }
};

// 🔹 8.4: deleteDevice
window.deleteDevice = async function(id) {
    if(confirm(`⚠️ ยืนยันการลบอุปกรณ์ ${id} ออกจากระบบถาวร? (ประวัติข้อมูลของอุปกรณ์นี้อาจแสดงผลผิดพลาดได้)`)) {
        try {
            await window.remove(window.ref(window.db, `device_configs/${id}`));
            renderDeviceTable();
            renderBoardTable();
            renderSensorCards();
            updateChartStructure();
            updateStandaloneAlertPanel();
            renderSummaryTable();
        } catch(e) { 
            console.error("❌ deleteDevice error:", e);
            alert("❌ ลบไม่สำเร็จ: " + e.message);
        }
    }
};

// 🔹 8.5: resetDeviceForm - รีเซ็ตฟอร์ม (ใช้ Advanced Alert เพียงอย่างเดียว)
function resetDeviceForm() {
    document.getElementById('devId').value = '';
    document.getElementById('devId').readOnly = false;
    document.getElementById('devName').value = '';
    document.getElementById('devUnit').value = '';
    document.getElementById('devTypeCustom').value = '';
    
    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) alertCheckbox.checked = true;
    
    // 🔹 รีเซ็ต Advanced Alert
    const thresholdInput = document.getElementById('alertThreshold');
    const rateChangeInput = document.getElementById('alertRateChange');
    const rateTimeInput = document.getElementById('alertRateTime');
    
    if (thresholdInput) thresholdInput.value = '';
    if (rateChangeInput) rateChangeInput.value = '';
    if (rateTimeInput) rateTimeInput.value = '';
    
    renderLevelConfigInline(null);
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds()');
    }
    
    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) modeSelect.value = 'manual';
    toggleLevelMode();
}

// 🔹 8.6: handleEditClick
window.handleEditClick = function(id) {
    const config = deviceConfigs[id];
    if (!config) {
        alert("ไม่พบข้อมูลอุปกรณ์");
        return;
    }
    
    loadDeviceForEditWithLevelConfig(
        id, 
        config.name, 
        config.type, 
        config.unit || '', 
        config.levels || null,
        config.alertEnabled !== false
    );
};

// 🔹 8.7: renderDeviceTable - แสดงตารางอุปกรณ์ (ใช้ Advanced Alert)
function renderDeviceTable() {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    
    const thead = document.querySelector('#deviceTable thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width: 8%;">🆔 ID</th>
                <th style="width: 13%;">📛 ชื่อจุดติดตั้ง</th>
                <th style="width: 10%;">🔍 ชนิด</th>
                <th style="width: 8%;">📏 หน่วย</th>
                <th style="width: 14%;">📊 ระดับการแจ้งเตือน</th>
                <th style="width: 10%;">⚠️ ค่าวิกฤต</th>
                <th style="width: 10%;">📈 อัตราเปลี่ยน</th>
                <th style="width: 8%;">⏱️ เวลา(นาที)</th>
                <th style="width: 19%;">⚙️ จัดการ</th>
            </tr>
        `;
    }
    
    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');
    
    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 40px; color:#64748b;">📭 ยังไม่มีข้อมูลเซนเซอร์ กรุณาเพิ่มเซนเซอร์ด้านบน</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const [id, config] of sensors) {
        const tr = document.createElement('tr');
        
        const unitDisplay = config.unit ? escapeHtml(config.unit) : '-';
        
        let typeDisplay = config.type;
        const typeMap = {
            'ultrasonic': '📡 Ultrasonic',
            'soil': '🌱 Soil',
            'rain': '🌧️ Rain',
            'ph': '🧪 pH',
            'temp': '🌡️ Temperature'
        };
        if (typeMap[config.type]) {
            typeDisplay = typeMap[config.type];
        } else {
            typeDisplay = `📝 ${config.type}`;
        }
        
        const levels = config.levels || null;
        const levelDisplay = levels ? createLevelBarsHTML(levels) : '<span style="color:#64748b; font-size:0.6rem;">-</span>';
        
        // 🔹 ดึงค่าจาก advancedAlert โดยตรง (ใช้ชุดข้อมูลเดียว)
        const advanced = config.advancedAlert || {};
        const criticalVal = advanced.threshold !== null && advanced.threshold !== undefined ? advanced.threshold : '-';
        const rateVal = advanced.rateChange !== null && advanced.rateChange !== undefined ? advanced.rateChange : '-';
        const timeVal = advanced.rateTime !== null && advanced.rateTime !== undefined ? advanced.rateTime : '-';
        
        const isEnabled = config.enabled !== false;
        const statusIcon = isEnabled ? '✅' : '❌';
        const statusColor = isEnabled ? '#4caf50' : '#ef4444';
        
        tr.innerHTML = `
            <td data-label="ID">
                <strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong>
                <span style="font-size: 0.7rem; color: ${statusColor}; margin-left: 4px;">${statusIcon}</span>
            </td>
            <td data-label="ชื่อจุดติดตั้ง"><strong>📛 ${escapeHtml(config.name)}</strong></td>
            <td data-label="ชนิดเซนเซอร์">${typeDisplay}</td>
            <td data-label="หน่วยวัด" style="text-align: center;"><strong>${unitDisplay}</strong></td>
            <td data-label="ระดับการแจ้งเตือน" style="font-size:0.7rem;">${levelDisplay}</td>
            <td data-label="ค่าวิกฤต" style="text-align: center; font-weight: bold; color: #ef4444;">${criticalVal}</td>
            <td data-label="อัตราเปลี่ยน" style="text-align: center; font-weight: bold; color: #f59e0b;">${rateVal}</td>
            <td data-label="เวลา(นาที)" style="text-align: center; font-weight: bold; color: #3b82f6;">${timeVal}</td>
            <td data-label="จัดการ">
                <button class="btn-small edit-btn" 
                        style="background:#ffa726; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:5px;"
                        onclick="handleEditClickWithThresholds('${id}')">✏️ แก้ไข</button>
                <button onclick="confirmDeleteDevice('${escapeHtml(id)}')" 
                        class="btn-small danger" 
                        style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

// 🔹 8.8: renderLevelConfigInline - สร้าง UI ระดับในฟอร์ม
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
                    <input type="number" class="level-min-inline" data-level="${key}" 
                           value="${level.min !== undefined ? level.min : 0}" 
                           min="0" max="100" placeholder="Min"
                           style="width: 45px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.7rem; text-align: center;">
                    <span style="color: #64748b; font-size: 0.6rem;">-</span>
                    <input type="number" class="level-max-inline" data-level="${key}" 
                           value="${level.max !== undefined ? level.max : 100}" 
                           min="0" max="100" placeholder="Max"
                           style="width: 45px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #e2e8f0; font-size: 0.7rem; text-align: center;">
                </div>
                <input type="text" class="level-label-inline" data-level="${key}" 
                       value="${level.label || LEVEL_NAMES[key]}" 
                       placeholder="ป้ายชื่อ"
                       style="width: 100%; margin-top: 3px; padding: 2px 4px; border-radius: 3px; border: 1px solid #475569; background: #0f172a; color: #94a3b8; font-size: 0.6rem;">
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 🔹 8.9: toggleLevelMode
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

// 🔹 8.10: applyBoundaryToLevels
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

// 🔹 8.11: resetLevelConfigInline
window.resetLevelConfigInline = function() {
    if (confirm('⚠️ รีเซ็ตการตั้งค่าระดับเป็นค่าเริ่มต้น?')) {
        renderLevelConfigInline(null);
        const container = document.getElementById('levelConfigInlineContainer');
        if (container) delete container.dataset.boundaryApplied;
    }
};

// 🔹 8.12: getLevelConfigFromForm
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
            
            if (min < 0 || min > 100 || max < 0 || max > 100) {
                isValid = false;
                errors.push(`ระดับ ${key}: ค่าต้องอยู่ระหว่าง 0-100`);
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
                errors.push(`ค่าระดับ ${ranges[i].key} (${ranges[i].min}-${ranges[i].max}) ทับซ้อนกับ ${ranges[i+1].key} (${ranges[i+1].min}-${ranges[i+1].max})`);
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

// 🔹 8.13: saveDeviceWithLevelConfig - บันทึกอุปกรณ์พร้อมระดับ
window.saveDeviceWithLevelConfig = async function(isEdit = false) {
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
    
    // 🔹 ดึงค่า Advanced Alert
    const thresholdInput = document.getElementById('alertThreshold');
    const rateChangeInput = document.getElementById('alertRateChange');
    const rateTimeInput = document.getElementById('alertRateTime');
    
    const advancedAlert = {
        threshold: thresholdInput && thresholdInput.value !== "" ? Number(thresholdInput.value) : null,
        rateChange: rateChangeInput && rateChangeInput.value !== "" ? Number(rateChangeInput.value) : null,
        rateTime: rateTimeInput && rateTimeInput.value !== "" ? Number(rateTimeInput.value) : null
    };
    
    if (!id || !name) return alert("กรุณากรอก ID และ ชื่อจุดติดตั้ง");
    
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
            updatedAt: new Date().toISOString()
        };
        
        if (!isEdit) {
            updateData.enabled = true;
            updateData.alert_count = 0;
            updateData.is_acknowledged = false;
            updateData.last_alert_time = null;
        }
        
        await window.update(window.ref(window.db, `device_configs/${id}`), updateData);
        
        if (deviceConfigs[id]) {
            deviceConfigs[id] = { ...deviceConfigs[id], ...updateData };
        }
        
        const actionText = isEdit ? 'อัปเดต' : 'เพิ่ม';
        alert(`✅ ${actionText}อุปกรณ์ ${id} สำเร็จ [แจ้งเตือน: ${alertEnabled ? 'เปิด' : 'ปิด'}]`);
        
        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        renderSummaryTable();
        
        if (!isEdit) {
            resetDeviceForm();
        } else {
            const config = deviceConfigs[id];
            if (config) {
                loadDeviceForEditWithLevelConfig(
                    id, 
                    config.name, 
                    config.type, 
                    config.unit || '', 
                    config.levels || null,
                    config.alertEnabled !== false
                );
            }
        }
        
        console.log(`✅ ${actionText}อุปกรณ์ ${id} สำเร็จ`);
        
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
    }
};

// 🔹 8.14: loadDeviceForEditWithLevelConfig - โหลดข้อมูลแก้ไข
window.loadDeviceForEditWithLevelConfig = function(id, name, type, unit, levels, alertEnabled) {
    document.getElementById('devId').value = id;
    document.getElementById('devId').readOnly = true;
    document.getElementById('devName').value = name;
    document.getElementById('devUnit').value = unit;
    
    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) {
        alertCheckbox.checked = (alertEnabled !== false);
    }
    
    const typeSelect = document.getElementById('devType');
    const customContainer = document.getElementById('customTypeContainer');
    const customInput = document.getElementById('devTypeCustom');
    
    const optionExists = Array.from(typeSelect.options).some(opt => opt.value === type);
    
    if (optionExists) {
        typeSelect.value = type;
        if (customContainer) customContainer.style.display = 'none';
    } else {
        typeSelect.value = 'other';
        if (customContainer) customContainer.style.display = 'block';
        if (customInput) customInput.value = type;
    }
    
    if (levels && Object.keys(levels).length > 0) {
        renderLevelConfigInline(levels);
    } else {
        renderLevelConfigInline(null);
    }
    
    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) modeSelect.value = 'manual';
    toggleLevelMode();
    
    // 🔹 โหลด Advanced Alert
    const config = deviceConfigs[id];
    if (config) {
        loadAdvancedAlertConfig(config);
    }
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 อัปเดตข้อมูล';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds(true)');
    }
    
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    
    renderDeviceTable();
    renderBoardTable();
};

// 🔹 8.15: loadAdvancedAlertConfig - โหลดการตั้งค่า Advanced Alert
window.loadAdvancedAlertConfig = function(config) {
    const thresholdInput = document.getElementById('alertThreshold');
    const rateChangeInput = document.getElementById('alertRateChange');
    const rateTimeInput = document.getElementById('alertRateTime');
    
    if (!thresholdInput || !rateChangeInput || !rateTimeInput) {
        console.warn("⚠️ ไม่พบฟิลด์ Advanced Alert ในหน้า UI");
        return;
    }
    
    if (config && config.advancedAlert) {
        const alert = config.advancedAlert;
        thresholdInput.value = alert.threshold !== null && alert.threshold !== undefined ? alert.threshold : '';
        rateChangeInput.value = alert.rateChange !== null && alert.rateChange !== undefined ? alert.rateChange : '';
        rateTimeInput.value = alert.rateTime !== null && alert.rateTime !== undefined ? alert.rateTime : '';
    } else {
        thresholdInput.value = '';
        rateChangeInput.value = '';
        rateTimeInput.value = '';
    }
};

// ==========================================
// 🔌 หัวข้อหลักที่ 9: ระบบ Provisioning ติดตั้งบอร์ดผ่าน USB
//    🔹 9.1 startProvisioningProcess - เริ่มกระบวนการติดตั้ง
// ==========================================

// 🔹 9.1: startProvisioningProcess
window.startProvisioningProcess = async function() {
    if (!("serial" in navigator)) {
        alert("❌ เบราว์เซอร์ของคุณไม่รองรับการติดตั้งผ่าน USB\nกรุณาใช้ Google Chrome หรือ Microsoft Edge และต้องใช้งานผ่าน HTTPS เท่านั้น");
        return;
    }
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        alert("เชื่อมต่อสำเร็จ! กำลังเตรียมส่งข้อมูล WiFi ให้บอร์ด...");
        const deviceId = prompt("ใส่ ID อุปกรณ์ (เช่น pond01):");
        const ssid = prompt("ชื่อ WiFi (SSID):");
        const pass = prompt("รหัสผ่าน WiFi:");
        if (!deviceId || !ssid) { alert("⚠️ ยกเลิกการติดตั้ง"); await port.close(); return; }
        const writer = port.writable.getWriter();
        const configData = { device_id: deviceId, ssid: ssid, password: pass };
        const encoder = new TextEncoder();
        await writer.write(encoder.write(JSON.stringify(configData) + "\n"));
        writer.releaseLock();
        await port.close();
        await window.set(window.ref(window.db, `device_configs/${deviceId}`), {
            name: "อุปกรณ์ " + deviceId,
            type: "board",
            enabled: true,
            ssid: ssid,
            status: "online",
            alert_count: 0,
            is_acknowledged: false,
            alertEnabled: false,
            last_alert_time: null,
            updatedAt: window.serverTimestamp()
        });
        alert("✅ ติดตั้งและบันทึกข้อมูลเรียบร้อย!");
        renderDeviceTable();
        renderBoardTable();
        renderSummaryTable();
    } catch (error) {
        console.error("Provisioning Error:", error);
        if (error.name === 'NotFoundError') alert("❌ ไม่พบพอร์ต USB: กรุณาตรวจสอบว่าเสียบสายและเลือกบอร์ดแล้ว");
        else if (error.name === 'SecurityError') alert("❌ สิทธิ์ไม่เพียงพอ: โปรดตรวจสอบว่าเว็บไซต์เป็น HTTPS");
        else alert("❌ การติดตั้งล้มเหลว: " + error.message);
    }
};

// ==========================================
// 📊 หัวข้อหลักที่ 10: UI และ Chart Dynamic Rendering
//    🔹 10.1 renderSensorCards - แสดงการ์ดเซนเซอร์
//    🔹 10.2 initChart - เริ่มต้นกราฟ
//    🔹 10.3 updateChartStructure - อัปเดตโครงสร้างกราฟ
//    🔹 10.4 checkFloodAlert - ตรวจสอบสถานะน้ำล้นตลิ่ง
//    🔹 10.5 processNewData - ประมวลผลข้อมูลใหม่
// ==========================================

// 🔹 10.1: renderSensorCards
function renderSensorCards() {
    const container = document.getElementById('sensorGridContainer');
    container.innerHTML = ''; 
    let hasEnabledDevice = false;
    for (const [id, config] of Object.entries(deviceConfigs)) {
        if (config.type === 'board') continue;
        hasEnabledDevice = true;
        
        // 🔹 ตรวจสอบสถานะการเปิดใช้งาน
        const isEnabled = config.enabled !== false;
        const displayValue = isEnabled ? (currentSensorValues[id] ?? '--') : "ปิดอยู่";
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
        
        const valueDisplay = isEnabled ? 
            `<span id="val_${id}">${displayValue}</span>` : 
            `<span style="color: #94a3b8; font-weight: 400;">${displayValue}</span>`;
        
        const cardHTML = `
            <div class="${cardClass}" id="card_${id}">
                <div class="sensor-title">${icon} ${escapeHtml(config.name)}</div>
                <div class="sensor-value">
                    ${valueDisplay}
                    <span class="sensor-unit">${isEnabled ? escapeHtml(config.unit) : ''}</span>
                </div>
                <div id="levelBadge_${id}" class="sensor-level-badge-container"></div>
                ${alertBadge}
                <div class="timestamp" id="time_${id}">${isEnabled ? `อัปเดต: ${displayValue !== '--' ? timeStr : 'รอข้อมูล...'}` : '⏸️ อุปกรณ์ปิดอยู่'}</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
        
        if (isEnabled && displayValue !== '--' && displayValue !== 'ปิดอยู่' && !isNaN(displayValue)) {
            updateSensorCardLevel(id, parseFloat(displayValue));
        }
    }
    if (!hasEnabledDevice) container.innerHTML = '<div style="width:100%; text-align:center; color:#fff; grid-column: 1 / -1;">ไม่มีเซนเซอร์ที่เปิดใช้งาน กรุณาตั้งค่าใน "จัดการเซนเซอร์"</div>';
    
    renderSummaryTable();
}

// 🔹 10.2: initChart
function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: true, interaction: { mode: 'index', intersect: false }, plugins: { title: { display: true, text: 'Real-time Data (เฉพาะอุปกรณ์ที่เปิด)' } } }
    });
    updateChartStructure();
}

// 🔹 10.3: updateChartStructure
function updateChartStructure() {
    if (!chart) return;
    const datasets = [];
    Object.keys(deviceConfigs).forEach((id, index) => {
        const config = deviceConfigs[id];
        if(!config.enabled) return;
        if (config.type === 'board') return;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const color = colors[index % colors.length];
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        datasets.push({ label: `${config.name} (${config.unit})`, data: sensorHistory.data[id], borderColor: color, backgroundColor: color + '33', tension: 0.1, fill: true });
    });
    chart.data.datasets = datasets;
    chart.update();
}

// 🔹 10.4: checkFloodAlert
function checkFloodAlert(id, value, config) {
    if (config.type !== 'ultrasonic') return 'normal';
    const levels = config.levels || null;
    if (!levels) return 'normal';
    
    const veryHigh = levels.very_high || { min: 90 };
    if (value >= veryHigh.min) {
        return 'flood';
    }
    const high = levels.high || { min: 70 };
    if (value >= high.min) {
        return 'warning';
    }
    return 'normal';
}

// 🔹 10.5: processNewData
function processNewData(dataObj) {
    const timeNow = new Date();
    currentSensorValues = dataObj;
    sensorHistory.timestamps.push(timeNow.toLocaleTimeString());
    if(sensorHistory.timestamps.length > 100) sensorHistory.timestamps.shift();
    
    Object.keys(deviceConfigs).forEach(id => {
        const config = deviceConfigs[id];
        if (!config.enabled) return;
        if (config.type === 'board') return;
        
        const valEl = document.getElementById(`val_${id}`);
        const timeEl = document.getElementById(`time_${id}`);
        const value = dataObj[id] !== undefined ? dataObj[id] : 0;
        
        if(valEl) valEl.textContent = value;
        if(timeEl) timeEl.textContent = `อัปเดต: ${timeNow.toLocaleTimeString()}`;
        
        if (!isNaN(value)) {
            updateSensorCardLevel(id, value);
        }
        
        if (config.type === 'ultrasonic') {
            const status = checkFloodAlert(id, value, config);
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
        sensorHistory.data[id].push(value);
        if(sensorHistory.data[id].length > 100) sensorHistory.data[id].shift();
    });
    
    if(chart) { chart.data.labels = sensorHistory.timestamps; chart.update('none'); }
}

// ==========================================
// 📡 หัวข้อหลักที่ 11: การเชื่อมต่อและดักฟัง Firebase
//    🔹 11.1 initFirebaseListeners - เริ่มต้นฟังข้อมูลจาก Firebase
// ==========================================

// 🔹 11.1: initFirebaseListeners
function initFirebaseListeners() {
    if (!window.db) return;
    initTitleListener();
    const configRef = window.ref(window.db, 'device_configs');
    window.onValue(configRef, (snapshot) => {
        deviceConfigs = snapshot.exists() ? snapshot.val() : {};
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        if (document.getElementById('deviceModal').style.display === 'flex') {
            renderDeviceTable();
            renderBoardTable();
        }
        updateAlertHistoryDropdown();
    });
    const currentRef = window.ref(window.db, 'sensors/current');
    window.onValue(currentRef, (snapshot) => {
        if (snapshot.exists()) processNewData(snapshot.val());
    });
    window.onValue(window.ref(window.db, ".info/connected"), (snap) => {
        const statusEl = document.getElementById('espStatus');
        if (snap.val() === true) { statusEl.className = 'connection-status online'; statusEl.textContent = 'Connected (Firebase)'; }
        else { statusEl.className = 'connection-status offline'; statusEl.textContent = 'Disconnected'; }
    });
    updateCompactOnlineUsers();
    initTelegramListeners();
    
    setTimeout(() => {
        updateStandaloneAlertPanel();
    }, 1000);
}

// ==========================================
// 📋 หัวข้อหลักที่ 12: ระบบจัดการบอร์ดและเซนเซอร์แยก
//    🔹 12.1 renderBoardTable - แสดงตารางบอร์ด
//    🔹 12.2 filterBoardTable - ค้นหาบอร์ด
//    🔹 12.3 filterSensorTable - ค้นหาเซนเซอร์
// ==========================================

// 🔹 12.1: renderBoardTable
function renderBoardTable() {
    const boardTbody = document.getElementById('boardTableBody');
    if (!boardTbody) return;
    
    const boards = Object.entries(deviceConfigs).filter(([id, config]) => config.type === 'board');
    
    if (boards.length === 0) {
        boardTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color:#64748b;">📭 ยังไม่มีบอร์ดที่ติดตั้ง</td></tr>';
        return;
    }
    
    boardTbody.innerHTML = '';
    boards.forEach(([id, config]) => {
        const tr = document.createElement('tr');
        const statusText = config.status === 'online' ? '🟢 ออนไลน์' : '🔴 ออฟไลน์';
        const statusColor = config.status === 'online' ? '#4caf50' : '#d32f2f';
        tr.innerHTML = `
            <td data-label="ID"><strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong></td>
            <td data-label="สถานะ"><span style="color:${statusColor}; font-weight:bold;">${statusText}</span></td>
            <td data-label="จัดการ">
                <button onclick="toggleDevice('${escapeHtml(id)}', ${config.enabled})" 
                        style="background:${config.enabled ? '#ffa726' : '#4caf50'}; 
                               color:white; border:none; padding:6px 14px; 
                               border-radius:20px; cursor:pointer; margin-right:5px;">
                    ${config.enabled ? '⏸️ ปิด' : '▶️ เปิด'}
                </button>
                <button onclick="confirmDeleteDevice('${escapeHtml(id)}')" 
                        class="danger" style="background:#d32f2f; color:white; 
                        border:none; padding:6px 14px; border-radius:20px; cursor:pointer;">
                    🗑️ ลบ
                </button>
            </td>
        `;
        boardTbody.appendChild(tr);
    });
}

// 🔹 12.2: filterBoardTable
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

// 🔹 12.3: filterSensorTable
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

// ==========================================
// 💬 หัวข้อหลักที่ 13: ระบบ Telegram
//    🔹 13.1 sendTelegramTextManual - ส่งข้อความ Telegram
//    🔹 13.2 triggerManualReport - ส่งรายงานด้วยตนเอง
//    🔹 13.3 runAutoReport - ส่งรายงานอัตโนมัติ
//    🔹 13.4 saveSubscriber - บันทึกผู้รับ
//    🔹 13.5 deleteSubscriber - ลบผู้รับ
//    🔹 13.6 editSubscriber - แก้ไขผู้รับ
//    🔹 13.7 updateSubscriber - อัปเดตผู้รับ
//    🔹 13.8 renderSubscribersTable - แสดงตารางผู้รับ
//    🔹 13.9 clearHistory - ล้างประวัติ
//    🔹 13.10 deleteHistoryItem - ลบประวัติรายการ
//    🔹 13.11 renderHistoryTable - แสดงตารางประวัติ
//    🔹 13.12 saveTelegramConfig - บันทึกการตั้งค่า Telegram
//    🔹 13.13 startTelegramAutoCheck - เริ่มตรวจสอบเวลาส่งอัตโนมัติ
//    🔹 13.14 loadTelegramConfig - โหลดการตั้งค่า Telegram
//    🔹 13.15 initTelegramListeners - เริ่มฟังการเปลี่ยนแปลงการตั้งค่า
// ==========================================

// 🔹 13.1: sendTelegramTextManual
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

// 🔹 13.2: triggerManualReport
window.triggerManualReport = async function() {
    const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
    if (!configSnap.exists()) {
        alert("❌ ระบบยังไม่ได้ตั้งค่า Telegram กรุณาติดต่อ Admin");
        return;
    }
    
    const config = configSnap.val();
    const token = config.botToken;
    if (!token || token.trim() === '') {
        alert("❌ ยังไม่ได้ตั้งค่า Bot Token กรุณาติดต่อ Admin");
        return;
    }
    
    const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
    if (!subsSnap.exists()) {
        alert("❌ ยังไม่มีรายชื่อผู้รับ กรุณาติดต่อ Admin");
        return;
    }
    const subs = subsSnap.val();
    
    const customMessage = prompt("กรุณากรอกข้อความที่ต้องการสื่อสารเพิ่มเติม (ถ้าไม่มีให้เว้นว่างไว้แล้วกด OK):", "");
    if (customMessage === null) return;

    const reportType = document.getElementById('reportTypeSelect')?.value || 'status';
    const sender = sessionStorage.getItem('currentUser') || 'Unknown User';
    let reportText = `📢 <b>รายงาน: ${reportType === 'status' ? 'สถานะฮาร์ดแวร์' : 'สภาพการทำงานระบบ'}</b>\n`;
    reportText += `👤 ผู้ส่ง: ${sender}\n\n`;

    if (customMessage.trim() !== "") {
        reportText += `💬 <b>ข้อความจากผู้ส่ง:</b>\n🟢 <b>${escapeHtml(customMessage)}</b>\n\n`;
    }

    if (reportType === 'status') {
        let hasData = false;
        for (const [id, value] of Object.entries(currentSensorValues)) {
            const cfg = deviceConfigs[id] || {};
            if (cfg.enabled && cfg.type !== 'board') {
                reportText += `• <b>${cfg.name || id}</b>: ${value} ${cfg.unit || ''}\n`;
                hasData = true;
            }
        }
        if (!hasData) reportText += `⚠️ ไม่มีข้อมูลเซนเซอร์ในขณะนี้\n`;
    } else {
        reportText += `🟢 สถานะ Firebase: <b>เชื่อมต่อปกติ</b>\n`;
        reportText += `👥 ผู้ใช้งานออนไลน์: ${document.getElementById('compactOnlineText')?.textContent || 'ตรวจสอบไม่ได้'}\n`;
        reportText += `📡 อุปกรณ์เปิดใช้งาน: ${Object.values(deviceConfigs).filter(d => d.enabled && d.type !== 'board').length} เซนเซอร์\n`;
        reportText += `🕐 เวลาปัจจุบัน: ${new Date().toLocaleString('th-TH')}\n`;
    }
    
    let successCount = 0;
    let failCount = 0;
    for (let subId in subs) {
        const success = await sendTelegramTextManual(token, subs[subId].chatId, reportText);
        await window.push(window.ref(window.db, 'settings/telegram/history'), {
            timestamp: new Date().toISOString(),
            target: subs[subId].name,
            sender: sender,
            status: success ? "success" : "failed"
        });
        if (success) successCount++;
        else failCount++;
    }
    
    if (successCount > 0) {
        alert(`✅ ส่งรายงานเรียบร้อยแล้วให้ ${successCount} คน${failCount > 0 ? ` (ล้มเหลว ${failCount} คน)` : ''}`);
    } else {
        alert(`❌ การส่งรายงานล้มเหลว (${failCount} คน) กรุณาตรวจสอบ Token และ Chat ID`);
    }
    renderHistoryTable();
};

// 🔹 13.3: runAutoReport
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
            reportText += `• ${devConfig.name || id}: ${value} ${devConfig.unit || ''}\n`;
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

// 🔹 13.4: saveSubscriber
window.saveSubscriber = async function() {
    const name = document.getElementById('subName').value.trim();
    const chatId = document.getElementById('subChatId').value.trim();
    if(!name || !chatId) return alert("กรุณากรอกข้อมูลให้ครบ");
    
    const subId = 'sub_' + Date.now();
    await window.set(window.ref(window.db, `settings/telegram/subscribers/${subId}`), { name, chatId });
    document.getElementById('subName').value = '';
    document.getElementById('subChatId').value = '';
    renderSubscribersTable();
};

// 🔹 13.5: deleteSubscriber
window.deleteSubscriber = async function(subId) {
    await window.remove(window.ref(window.db, `settings/telegram/subscribers/${subId}`));
    renderSubscribersTable();
};

// 🔹 13.6: editSubscriber
window.editSubscriber = function(subId, name, chatId) {
    document.getElementById('subName').value = name;
    document.getElementById('subChatId').value = chatId;
    const btn = document.querySelector('button[onclick="saveSubscriber()"]');
    if (btn) {
        btn.textContent = '💾 อัปเดต';
        btn.setAttribute('onclick', `updateSubscriber('${subId}')`);
    }
};

// 🔹 13.7: updateSubscriber
window.updateSubscriber = async function(subId) {
    const name = document.getElementById('subName').value;
    const chatId = document.getElementById('subChatId').value;
    if (!name || !chatId) return alert("กรุณากรอกข้อมูลให้ครบ");
    
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

// 🔹 13.8: renderSubscribersTable
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
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#2e7d32;">📭 ยังไม่มีผู้รับ</td></tr>';
    }
}

// 🔹 13.9: clearHistory
window.clearHistory = async function() {
    if (confirm("ยืนยันการลบประวัติการส่งทั้งหมด?")) {
        try {
            await window.remove(window.ref(window.db, 'settings/telegram/history'));
            renderHistoryTable();
            alert("✅ ล้างประวัติทั้งหมดสำเร็จ");
        } catch (error) {
            alert("❌ ล้างประวัติไม่สำเร็จ: " + error.message);
        }
    }
};

// 🔹 13.10: deleteHistoryItem
window.deleteHistoryItem = async function(historyId) {
    if (confirm("ยืนยันการลบประวัติรายการนี้?")) {
        try {
            await window.remove(window.ref(window.db, `settings/telegram/history/${historyId}`));
            renderHistoryTable();
        } catch (error) {
            alert("❌ ลบประวัติไม่สำเร็จ: " + error.message);
        }
    }
};

// 🔹 13.11: renderHistoryTable
async function renderHistoryTable() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram/history'));
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (snap.exists()) {
        const history = Object.entries(snap.val()).reverse();
        history.forEach(([id, item]) => {
            const timestampDisplay = formatThaiDate(item.timestamp);
            tbody.innerHTML += `<tr>
                <td>${timestampDisplay}</td>
                <td>${escapeHtml(item.target)}</td>
                <td>${escapeHtml(item.sender)}</td>
                <td>${item.status === 'success' ? '✅' : '❌'}</td>
                <td><button onclick="deleteHistoryItem('${id}')" class="danger" style="background:#d32f2f; color:white; border:none; padding:4px 12px; border-radius:20px; cursor:pointer; font-size:0.7rem;">🗑️ ลบ</button></td>
            </tr>`;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#2e7d32;">📭 ยังไม่มีประวัติการส่ง</td></tr>';
    }
}

// 🔹 13.12: saveTelegramConfig
window.saveTelegramConfig = async function() {
    const config = {
        botToken: document.getElementById('teleBotToken').value.trim(),
        sendTime: document.getElementById('teleSendTime').value,
        enabled: document.getElementById('teleEnabled').checked
    };
    await window.set(window.ref(window.db, 'settings/telegram/config'), config);
    alert("✅ บันทึกค่าสำเร็จ");
};

// 🔹 13.13: startTelegramAutoCheck
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

// 🔹 13.14: loadTelegramConfig
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

// 🔹 13.15: initTelegramListeners
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

// ==========================================
// 🛠️ หัวข้อหลักที่ 14: ระบบตั้งค่าการบันทึก & สำรองข้อมูล
//    🔹 14.1 openSettingsManager - เปิดหน้าต่างตั้งค่าระบบ
//    🔹 14.2 closeSettingsManager - ปิดหน้าต่างตั้งค่าระบบ
//    🔹 14.3 saveLogInterval - บันทึกความถี่การบันทึก
//    🔹 14.4 startAutoLogging - เริ่มการบันทึกอัตโนมัติ
//    🔹 14.5 exportDataOffline - ส่งออกข้อมูล
//    🔹 14.6 importDataOffline - นำเข้าข้อมูล
// ==========================================

// 🔹 14.1: openSettingsManager
window.openSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('logInterval').value = currentIntervalMinutes;
    loadTelegramConfig();
};

// 🔹 14.2: closeSettingsManager
window.closeSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'none';
};

// 🔹 14.3: saveLogInterval
window.saveLogInterval = async function() {
    const min = parseInt(document.getElementById('logInterval').value);
    if (isNaN(min) || min < 1) return alert("กรุณากรอกตัวเลขมากกว่า 0");
    try {
        await window.set(window.ref(window.db, `settings/log_interval`), min);
        alert(`✅ บันทึกความถี่เป็น ${min} นาที สำเร็จ`);
    } catch (e) { alert("❌ บันทึกไม่สำเร็จ: " + e.message); }
};

// 🔹 14.4: startAutoLogging
function startAutoLogging(minutes) {
    if (autoLogIntervalId) clearInterval(autoLogIntervalId);
    currentIntervalMinutes = minutes;
    const ms = minutes * 60 * 1000;
    console.log(`⏱️ เริ่มการบันทึกข้อมูลอัตโนมัติทุกๆ ${minutes} นาที`);
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

// 🔹 14.5: exportDataOffline
window.exportDataOffline = function() {
    if (sensorHistory.timestamps.length === 0) return alert("ไม่มีข้อมูลในระบบให้สำรองครับ");
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

// 🔹 14.6: importDataOffline
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
                        const matchedId = Object.keys(deviceConfigs).find(id => ds.label.includes(deviceConfigs[id].name));
                        if(matchedId && sensorHistory.data[matchedId]) ds.data = sensorHistory.data[matchedId];
                    });
                    chart.update();
                }
                alert("✅ โหลดข้อมูลจากไฟล์ Backup สำเร็จ กราฟอัปเดตแล้ว");
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

// ==========================================
// 📋 หัวข้อหลักที่ 15: ระบบแจ้งเตือนอุปกรณ์ออฟไลน์
//    🔹 15.1 monitorDeviceHealth - ตรวจสอบสุขภาพอุปกรณ์
//    🔹 15.2 acknowledgeAlert - รับทราบการแจ้งเตือน
//    🔹 15.3 startDeviceHealthMonitor - เริ่มตรวจสอบสุขภาพอุปกรณ์
//    🔹 15.4 resetDeviceAlertStatus - รีเซ็ตสถานะการแจ้งเตือน
// ==========================================

// 🔹 15.1: monitorDeviceHealth
async function monitorDeviceHealth() {
    const now = Date.now();
    const devicesRef = window.ref(window.db, 'device_configs');
    const snapshot = await window.get(devicesRef);
    
    if (!snapshot.exists()) return;
    const devices = snapshot.val();

    for (const [id, config] of Object.entries(devices)) {
        if (config.alertEnabled === false) continue;
        if (!config.enabled) continue;
        if (config.is_acknowledged === true) continue;
        if (config.type === 'board') continue;
        
        const lastSeenTime = config.lastSeen ? new Date(config.lastSeen).getTime() : 0;
        const isOffline = (now - lastSeenTime) > 180000;
        
        if (isOffline) {
            const count = config.alert_count || 0;
            const lastTime = config.last_alert_time || 0;
            
            let shouldAlert = false;
            if (count === 0) shouldAlert = true;
            else if (count === 1 && (now - lastTime) >= 300000) shouldAlert = true;
            else if (count === 2 && (now - lastTime) >= 600000) shouldAlert = true;

            if (shouldAlert && count < 3) {
                const message = `🚨 <b>แจ้งเตือนอุปกรณ์ขัดข้อง!</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n🔢 ครั้งที่: ${count + 1}/3\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}\n⚠️ สถานะ: อุปกรณ์ออฟไลน์`;
                
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
                
                console.log(`🔔 ส่งการแจ้งเตือนอุปกรณ์ ${id} ครั้งที่ ${count + 1}/3`);
            }
        }
    }
    
    updateStandaloneAlertPanel();
}

// 🔹 15.2: acknowledgeAlert
window.acknowledgeAlert = async function(id) {
    if (!id) {
        console.error("❌ ไม่มี ID อุปกรณ์");
        return;
    }
    
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            is_acknowledged: true,
            alert_count: 0,
            last_alert_time: null
        });
        
        alert("✅ รับทราบการแจ้งเตือนเรียบร้อย ระบบจะหยุดส่งคำเตือนสำหรับอุปกรณ์นี้จนกว่าจะกลับมาออนไลน์ใหม่");
        updateStandaloneAlertPanel();
        renderDeviceTable();
        renderBoardTable();
        renderSummaryTable();
    } catch (error) {
        console.error("❌ รับทราบการแจ้งเตือนไม่สำเร็จ:", error);
        alert("❌ รับทราบการแจ้งเตือนไม่สำเร็จ: " + error.message);
    }
};

// 🔹 15.3: startDeviceHealthMonitor
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
        } catch (error) {
            console.error("❌ deviceHealthMonitor error:", error);
        }
    }, 30000);
    
    console.log("✅ เริ่มระบบตรวจสอบสุขภาพอุปกรณ์อัตโนมัติ (ตรวจสอบทุก 30 วินาที)");
}

// 🔹 15.4: resetDeviceAlertStatus
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
                console.log(`🔄 รีเซ็ตสถานะการแจ้งเตือนของอุปกรณ์ ${id} (กลับมาออนไลน์แล้ว)`);
                updateStandaloneAlertPanel();
                renderDeviceTable();
                renderBoardTable();
                renderSummaryTable();
            }
        }
    } catch (error) {
        console.error(`❌ รีเซ็ตสถานะอุปกรณ์ ${id} ไม่สำเร็จ:`, error);
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 16: ระบบ Custom Type และเกณฑ์การแจ้งเตือนแบบอิสระ
//    🔹 16.1 updateDynamicFields - อัปเดตฟิลด์ไดนามิก
//    🔹 16.2 updateCustomTypeVisibility - แสดง/ซ่อน Custom Type
//    🔹 16.3 initCustomTypeFields - เริ่มต้นฟิลด์ Custom Type
// ==========================================

// 🔹 16.1: updateDynamicFields
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

// 🔹 16.2: updateCustomTypeVisibility
window.updateCustomTypeVisibility = function() {
    const type = document.getElementById('devType').value;
    const customContainer = document.getElementById('customTypeContainer');
    if (customContainer) {
        customContainer.style.display = (type === 'other') ? 'block' : 'none';
    }
};

// 🔹 16.3: initCustomTypeFields
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
    }
    
    let dynamicFields = document.getElementById('dynamicFields');
    if (!dynamicFields) {
        const container = document.getElementById('dynamicFields');
        if (container) {
            container.innerHTML = `
                <div style="flex:1; min-width: 200px;">
                    <input type="text" id="thr_label_1" placeholder="ชื่อเกณฑ์แจ้งเตือน 1 (เช่น ระดับเตือนภัย)" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                    <input type="number" id="thr_val_1" placeholder="ค่าเกณฑ์ 1" style="width:100%; margin-top:5px; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                </div>
                <div style="flex:1; min-width: 200px;">
                    <input type="text" id="thr_label_2" placeholder="ชื่อเกณฑ์แจ้งเตือน 2 (เช่น ระดับอันตราย)" style="width:100%; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                    <input type="number" id="thr_val_2" placeholder="ค่าเกณฑ์ 2" style="width:100%; margin-top:5px; padding: 8px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #e2e8f0;">
                </div>
            `;
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
        devTypeSelect.setAttribute('onchange', 'updateDynamicFields(); updateCustomTypeVisibility();');
    }
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds()');
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 17: Standalone Alert Panel
//    🔹 17.1 updateStandaloneAlertPanel - อัปเดตแผงแจ้งเตือน
//    🔹 17.2 createStandaloneAlertPanelIfNotExists - สร้างแผงแจ้งเตือน
// ==========================================

// 🔹 17.1: updateStandaloneAlertPanel
async function updateStandaloneAlertPanel() {
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

// 🔹 17.2: createStandaloneAlertPanelIfNotExists
function createStandaloneAlertPanelIfNotExists() {
    let panel = document.getElementById('standaloneAlertPanel');
    if (panel) return;
    
    const mainApp = document.getElementById('mainApp');
    if (!mainApp) return;
    
    const statusBar = document.getElementById('status-bar') || mainApp.querySelector('.status-bar');
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes blink { 
            0% { opacity: 1; } 
            50% { opacity: 0.6; } 
            100% { opacity: 1; } 
        }
        .alert-panel-blink { animation: blink 1.5s infinite; }
    `;
    document.head.appendChild(style);
    
    const panelHTML = `
        <div id="standaloneAlertPanel" class="alert-panel-blink" style="display: none; background: #fee2e2; padding: 20px; border: 3px solid #ef4444; border-radius: 12px; margin-bottom: 25px; box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.3);">
            <h3 style="color: #b91c1c; margin-top: 0; margin-bottom: 15px; display: flex; align-items: center; font-size: 1.2rem;">
                <span style="margin-right: 10px; font-size: 1.5rem;">🚨</span> แจ้งเตือน: พบอุปกรณ์ขัดข้อง
            </h3>
            <div id="alertListContainer" style="display: flex; gap: 12px; flex-wrap: wrap;"></div>
        </div>
    `;
    
    if (statusBar) {
        statusBar.insertAdjacentHTML('beforebegin', panelHTML);
    } else {
        mainApp.insertAdjacentHTML('afterbegin', panelHTML);
    }
    
    console.log("✅ สร้าง Standalone Alert Panel สำเร็จ");
}

// ==========================================
// 📋 หัวข้อหลักที่ 18: ตารางสรุปสถานะการแจ้งเตือน
//    🔹 18.1 renderSummaryTable - แสดงตารางสรุปสถานะ
//    🔹 18.2 toggleAlertEnabled - สลับการเปิด/ปิดการแจ้งเตือน
//    🔹 18.3 toggleSummaryTable - แสดง/ซ่อนตาราง
// ==========================================

// 🔹 18.1: renderSummaryTable
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
        const tr = document.createElement('tr');
        
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';
        
        const typeMap = {
            'ultrasonic': 'ระยะทาง',
            'soil': 'ความชื้นดิน',
            'rain': 'ปริมาณน้ำฝน',
            'ph': 'ค่ากรดด่าง',
            'temp': 'อุณหภูมิ'
        };
        const typeDisplay = typeMap[config.type] || config.type;
        
        tr.innerHTML = `
            <td style="padding: 12px; border-bottom: 1px solid #334155; color: #e2e8f0; font-weight: 500;">
                ${icon} ${escapeHtml(config.name)}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                ${typeDisplay}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center;">
                <span style="color: ${isEnabled ? '#4caf50' : '#ef4444'}; font-weight: bold;">
                    ${isEnabled ? '✅ พร้อมทำงาน' : '❌ ไม่พร้อม'}
                </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center;">
                <span style="font-weight: bold; color: ${isAlertEnabled ? '#4caf50' : '#ef4444'};">
                    ${isAlertEnabled ? '🔊 เปิด' : '🔇 ปิด'}
                </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center; display: flex; gap: 5px; justify-content: center;">
                <button class="toggle-alert-btn ${isEnabled ? 'active' : ''}" 
                        style="background: ${isEnabled ? '#4caf50' : '#64748b'}"
                        onclick="toggleDevice('${id}', ${isEnabled})">
                    ${isEnabled ? '⏸️ ปิดอุปกรณ์' : '▶️ เริ่มทำงาน'}
                </button>
                <button class="toggle-alert-btn ${isAlertEnabled ? 'active' : ''}"
                        onclick="toggleAlertEnabled('${id}')">
                    ${isAlertEnabled ? '🔔 ปิดแจ้งเตือน' : '🔕 เปิดแจ้งเตือน'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 🔹 18.2: toggleAlertEnabled
window.toggleAlertEnabled = async function(id) {
    if (!id) {
        console.error("❌ ไม่มี ID อุปกรณ์");
        return;
    }
    
    const config = deviceConfigs[id];
    if (!config) {
        alert("❌ ไม่พบข้อมูลอุปกรณ์");
        return;
    }
    
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
            
        } catch (error) {
            console.error("❌ เปลี่ยนสถานะการแจ้งเตือนไม่สำเร็จ:", error);
            alert("❌ เปลี่ยนสถานะไม่สำเร็จ: " + error.message);
        }
    }
};

// 🔹 18.3: toggleSummaryTable
window.toggleSummaryTable = function() {
    const tableWrapper = document.getElementById('summaryTableWrapper');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');
    
    if (tableWrapper.style.display === 'none') {
        tableWrapper.style.display = 'block';
        btnText.textContent = 'ซ่อนตาราง';
        btnIcon.textContent = '🔼';
    } else {
        tableWrapper.style.display = 'none';
        btnText.textContent = 'แสดงตาราง';
        btnIcon.textContent = '🔽';
    }
};

// ==========================================
// 🟢 หัวข้อหลักที่ 19: ระบบตรวจสอบระดับ (Level Alert)
//    🔹 19.1 evaluateLevelWithCustom - ประเมินค่าระดับ//    🔹 19.2 updateSensorCardLevel - อัปเดตระดับใน Card
//    🔹 19.3 checkLevelAlert - ตรวจสอบและแจ้งเตือนระดับ
//    🔹 19.4 checkLevelAlerts - ตรวจสอบระดับทั้งหมด
// ==========================================

// 🔹 19.1: evaluateLevelWithCustom
function evaluateLevelWithCustom(value, levels) {
    if (!levels || typeof value !== 'number' || isNaN(value)) {
        return { key: 'unknown', label: 'ไม่มีข้อมูล', color: '#9ca3af' };
    }

    const levelKeys = ['very_high', 'high', 'normal', 'low', 'very_low'];
    const colors = {
        very_high: '#ef4444',
        high: '#f59e0b',
        normal: '#10b981',
        low: '#3b82f6',
        very_low: '#6366f1'
    };

    for (const key of levelKeys) {
        const level = levels[key];
        if (level && value >= level.min && value <= level.max) {
            return {
                key: key,
                label: level.label || key,
                color: colors[key] || '#9ca3af'
            };
        }
    }

    return { key: 'unknown', label: 'นอกเกณฑ์', color: '#9ca3af' };
}

// 🔹 19.2: updateSensorCardLevel
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
        <div class="sensor-level-badge level-${result.key}" 
             style="display:inline-block; padding:2px 10px; border-radius:12px; font-size:0.65rem; font-weight:700; margin-top:4px; background:${result.color}; color:white;">
            ${result.label}
        </div>
    `;
}

// 🔹 19.3: checkLevelAlert
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
    }
}

// 🔹 19.4: checkLevelAlerts
async function checkLevelAlerts() {
    try {
        const devicesRef = window.ref(window.db, 'device_configs');
        const snapshot = await window.get(devicesRef);

        if (!snapshot.exists()) return;
        const devices = snapshot.val();

        for (const [id, config] of Object.entries(devices)) {
            const value = currentSensorValues[id];
            if (value === undefined || value === null || isNaN(value)) continue;
            await checkLevelAlert(id, value, config);
        }
    } catch (error) {
        console.error('❌ checkLevelAlerts error:', error);
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 20: ระบบ Anti-Spam และการแจ้งเตือนขั้นสูง
//    🔹 20.1 alertLock - ตัวแปรล็อกการแจ้งเตือน
//    🔹 20.2 getHistoryFromFirebase - ดึงประวัติจาก Firebase
//    🔹 20.3 analyzeSensorLogic - ตรรกะแจ้งเตือนหลัก (ใช้ Advanced Alert)
//    🔹 20.4 sendTelegramAlert - ส่งข้อความ Telegram พร้อม Anti-Spam
// ==========================================

// 🔹 20.1: alertLock - ตัวแปรล็อกการแจ้งเตือน (Anti-Spam)
const alertLock = {};

// 🔹 20.2: getHistoryFromFirebase - ดึงประวัติจาก Firebase
async function getHistoryFromFirebase(id, minutes) {
    if (!window.db) {
        console.warn("⚠️ getHistoryFromFirebase: Firebase not ready");
        return [];
    }
    
    const now = Date.now();
    const startTime = now - (minutes * 60 * 1000);
    const historyRef = window.ref(window.db, 'sensor_history');
    
    try {
        const snapshot = await window.get(
            window.query(
                historyRef, 
                window.orderByKey(), 
                window.startAt(new Date(startTime).toISOString())
            )
        );
        
        if (!snapshot.exists()) return [];
        
        let history = [];
        snapshot.forEach((child) => {
            const data = child.val();
            if (data && data[id] !== undefined) {
                history.push(data[id]);
            }
        });
        return history;
    } catch (error) {
        console.error("❌ getHistoryFromFirebase error:", error);
        return [];
    }
}

// 🔹 20.3: analyzeSensorLogic - ตรรกะแจ้งเตือนหลัก (ใช้ Advanced Alert)
async function analyzeSensorLogic(id, rawValue, config) {
    if (!config || !id || rawValue === undefined || rawValue === null) return;
    
    if (config.alertEnabled === false) return;
    if (!config.enabled) return;
    if (config.type === 'board') return;
    if (config.is_acknowledged === true) return;
    
    const value = parseFloat(rawValue);
    if (isNaN(value)) return;
    
    // 🔹 ดึงค่าจาก advancedAlert โดยตรง
    const advanced = config.advancedAlert || {};
    const threshold = advanced.threshold !== undefined ? advanced.threshold : null;
    const rateChange = advanced.rateChange !== undefined ? advanced.rateChange : null;
    const rateTime = advanced.rateTime !== undefined ? advanced.rateTime : 5;
    
    // 🔹 ตรวจสอบค่าวิกฤต (Threshold)
    if (threshold !== null && value >= threshold) {
        const message = `🚨 วิกฤต: ${config.name} ถึงระดับ ${value.toFixed(2)} ${config.unit || ''} แล้ว (เกณฑ์ ${threshold})`;
        await sendTelegramAlert(id, config, message);
        await saveAlertHistory(id, { message: message, type: 'threshold', status: 'sent' });
    }

    // 🔹 ตรวจสอบอัตราการเพิ่มขึ้น (Rate of Change)
    if (rateChange !== null && rateTime) {
        const history = await getHistoryFromFirebase(id, rateTime);
        if (history.length > 0) {
            const oldestValue = parseFloat(history[0]);
            if (!isNaN(oldestValue)) {
                const delta = value - oldestValue;
                if (delta >= rateChange) {
                    const message = `📈 อัตราการเพิ่มสูง: ${config.name} เพิ่มขึ้น ${delta.toFixed(2)} ${config.unit || ''} ใน ${rateTime} นาที (เกณฑ์ ${rateChange})`;
                    await sendTelegramAlert(id, config, message);
                    await saveAlertHistory(id, { message: message, type: 'rate_change', status: 'sent' });
                }
            }
        }
    }
}

// 🔹 20.4: sendTelegramAlert - ส่งข้อความ Telegram พร้อม Anti-Spam
async function sendTelegramAlert(sensorId, config, message) {
    if (!sensorId || !message) return;
    
    const now = Date.now();
    const LOCK_TIME = 10 * 60 * 1000;

    if (alertLock[sensorId] && (now - alertLock[sensorId] < LOCK_TIME)) {
        console.log(`⏳ Anti-Spam: ${sensorId} ถูกล็อกไว้`);
        return;
    }
    
    try {
        const configSnap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        const token = configSnap.val()?.botToken;
        
        if (!token || token.trim() === '') {
            console.warn("⚠️ ไม่มี Bot Token");
            return;
        }
        
        const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
        
        if (token && subsSnap.exists()) {
            const subs = subsSnap.val();
            let successCount = 0;
            
            for (let subId in subs) {
                const chatId = subs[subId].chatId;
                if (chatId) {
                    const success = await sendTelegramTextManual(token, chatId, message);
                    if (success) successCount++;
                }
            }
            
            if (successCount > 0) {
                await window.push(window.ref(window.db, 'settings/telegram/history'), {
                    timestamp: new Date().toISOString(),
                    target: `แจ้งเตือน: ${config.name}`,
                    sender: 'ระบบอัตโนมัติ',
                    status: 'success'
                });
                console.log(`✅ ส่งแจ้งเตือน ${sensorId} สำเร็จ`);
            }
            
            alertLock[sensorId] = now;
            
            await window.update(window.ref(window.db, `device_configs/${sensorId}`), {
                alert_count: (config.alert_count || 0) + 1,
                last_alert_time: now
            });
            
            updateStandaloneAlertPanel();
            renderAlertHistoryTable(sensorId);
        }
    } catch (error) {
        console.error("❌ sendTelegramAlert error:", error);
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 21: ระบบจัดการประวัติการแจ้งเตือนแบบละเอียด
//    🔹 21.1 getAlertHistory - ดึงประวัติการแจ้งเตือน
//    🔹 21.2 saveAlertHistory - บันทึกประวัติการแจ้งเตือน
//    🔹 21.3 renderAlertHistoryTable - แสดงตารางประวัติการแจ้งเตือน
//    🔹 21.4 updateAlertHistoryDropdown - อัปเดต dropdown เลือกอุปกรณ์
//    🔹 21.5 loadAlertHistory - โหลดประวัติการแจ้งเตือน
// ==========================================

// 🔹 21.1: getAlertHistory - ดึงประวัติการแจ้งเตือน
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
                history.push({
                    id: child.key,
                    ...data
                });
            }
        });
        
        history.sort((a, b) => {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        return history.slice(0, limit);
    } catch (error) {
        console.error("❌ getAlertHistory error:", error);
        return [];
    }
}

// 🔹 21.2: saveAlertHistory - บันทึกประวัติการแจ้งเตือน
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

// 🔹 21.3: renderAlertHistoryTable - แสดงตารางประวัติการแจ้งเตือน
async function renderAlertHistoryTable(deviceId) {
    const container = document.getElementById('alertHistoryContainer');
    if (!container) return;
    
    if (!deviceId) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">📭 เลือกอุปกรณ์เพื่อแสดงประวัติการแจ้งเตือน</div>';
        return;
    }
    
    const history = await getAlertHistory(deviceId);
    
    if (history.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">📭 ยังไม่มีประวัติการแจ้งเตือนสำหรับอุปกรณ์นี้</div>';
        return;
    }
    
    let html = `
        <div class="alert-history-table-wrapper" style="overflow-x:auto; margin-top:10px;">
            <table class="device-table" style="width:100%;">
                <thead>
                    <tr>
                        <th style="text-align:left;">เวลา</th>
                        <th style="text-align:left;">ข้อความแจ้งเตือน</th>
                        <th style="text-align:left;">ประเภท</th>
                        <th style="text-align:center;">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    history.forEach(item => {
        const timeDisplay = formatThaiDateTime(item.timestamp);
        const statusDisplay = item.status === 'sent' ? '✅ ส่งแล้ว' : '⚠️ รอดำเนินการ';
        const statusColor = item.status === 'sent' ? '#4caf50' : '#f59e0b';
        
        html += `
            <tr>
                <td style="padding:8px 12px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.8rem;">${timeDisplay}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #334155; color:#e2e8f0;">${escapeHtml(item.message || 'ไม่ระบุข้อความ')}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #334155; color:#94a3b8; font-size:0.8rem;">${escapeHtml(item.type || 'ทั่วไป')}</td>
                <td style="padding:8px 12px; border-bottom:1px solid #334155; text-align:center;">
                    <span style="color:${statusColor}; font-weight:bold;">${statusDisplay}</span>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

// 🔹 21.4: updateAlertHistoryDropdown - อัปเดต dropdown เลือกอุปกรณ์
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

// 🔹 21.5: loadAlertHistory - โหลดประวัติการแจ้งเตือน
window.loadAlertHistory = function() {
    const select = document.getElementById('alertHistoryDeviceSelect');
    if (!select) return;
    
    const deviceId = select.value;
    renderAlertHistoryTable(deviceId);
};

// ==========================================
// 📋 หัวข้อหลักที่ 22: ระบบส่งแจ้งเตือนแบบรวม (Combined Alert System)
//    🔹 22.1 sendCombinedAlert - ส่งแจ้งเตือนแบบรวมพร้อมประวัติ
//    🔹 22.2 checkAllAlertConditions - ตรวจสอบเงื่อนไขทั้งหมด
//    🔹 22.3 checkAllAlertConditionsForAllDevices - ตรวจสอบทุกอุปกรณ์
// ==========================================

// 🔹 22.1: sendCombinedAlert - ส่งแจ้งเตือนแบบรวมพร้อมประวัติ
async function sendCombinedAlert(sensorId, config, message, alertType = 'general') {
    if (!sensorId || !message) return false;
    
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
            
            console.log(`✅ ส่งแจ้งเตือน ${sensorId} สำเร็จ (${alertType})`);
        }
        
        return success;
    } catch (error) {
        console.error("❌ sendCombinedAlert error:", error);
        return false;
    }
}

// 🔹 22.2: checkAllAlertConditions - ตรวจสอบเงื่อนไขทั้งหมด (ใช้ Advanced Alert)
async function checkAllAlertConditions(sensorId, value, config) {
    if (!config || !sensorId || value === undefined || value === null) return;
    
    if (config.alertEnabled === false) return;
    if (!config.enabled) return;
    if (config.type === 'board') return;
    if (config.is_acknowledged === true) return;
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;
    
    let alertMessages = [];
    
    // 🔹 ดึงค่าจาก advancedAlert โดยตรง
    const advanced = config.advancedAlert || {};
    const threshold = advanced.threshold !== undefined ? advanced.threshold : null;
    const rateChange = advanced.rateChange !== undefined ? advanced.rateChange : null;
    const rateTime = advanced.rateTime !== undefined ? advanced.rateTime : 5;
    
    // 🔹 ตรวจสอบค่าวิกฤต (Threshold)
    if (threshold !== null && numValue >= threshold) {
        alertMessages.push(`🚨 วิกฤต: ค่า ${numValue.toFixed(2)} ${config.unit || ''} เกินเกณฑ์วิกฤต (${threshold})`);
    }
    
    // 🔹 ตรวจสอบอัตราการเปลี่ยนแปลง (Rate of Change)
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
    
    // 🔹 ตรวจสอบระดับ (Level)
    if (config.levels) {
        const levelResult = evaluateLevelWithCustom(numValue, config.levels);
        if (levelResult.key === 'very_high' || levelResult.key === 'high') {
            alertMessages.push(`📊 ระดับ ${levelResult.label}: ค่า ${numValue.toFixed(2)} ${config.unit || ''} อยู่ในระดับอันตราย`);
        }
    }
    
    // 🔹 ส่งแจ้งเตือนทุกข้อความที่ตรวจพบ
    for (const msg of alertMessages) {
        const fullMessage = `🚨 <b>แจ้งเตือนอุปกรณ์</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${sensorId}\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}\n\n${msg}`;
        await sendCombinedAlert(sensorId, config, fullMessage, 'condition');
    }
}

// 🔹 22.3: checkAllAlertConditionsForAllDevices - ตรวจสอบทุกอุปกรณ์
async function checkAllAlertConditionsForAllDevices() {
    try {
        for (const [id, config] of Object.entries(deviceConfigs)) {
            const value = currentSensorValues[id];
            if (value === undefined || value === null || isNaN(value)) continue;
            await checkAllAlertConditions(id, value, config);
        }
    } catch (error) {
        console.error('❌ checkAllAlertConditionsForAllDevices error:', error);
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 23: ฟังก์ชันเริ่มต้นระบบตามไฟล์ 17
//    🔹 23.1 initializeAllFeatures - เรียกใช้ฟังก์ชันทั้งหมด
// ==========================================

// 🔹 23.1: initializeAllFeatures - เรียกใช้ฟังก์ชันทั้งหมด
function initializeAllFeatures() {
    // ใช้ CSS สำหรับ disabled-card
    applyDisabledCardStyles();
    
    // อัปเดต dropdown ประวัติการแจ้งเตือน
    updateAlertHistoryDropdown();
    
    console.log("✅ ระบบตามไฟล์ 17 ถูกเปิดใช้งานแล้ว (ครบทุกข้อ)");
    console.log("   🔹 1. สถานะ 'อุปกรณ์ปิดอยู่' บน Sensor Card");
    console.log("   🔹 2. ระบบยืนยันก่อนทำรายการ (Confirmation)");
    console.log("   🔹 3. ปรับวันที่และเวลาเป็นภาษาไทย");
    console.log("   🔹 4. ระบบจัดการความผิดพลาดที่เป็นมิตร");
    console.log("   🔹 5. แสดงแถบสีเกณฑ์แจ้งเตือนในตาราง");
    console.log("   🔹 6. ระบบบันทึกค่าเป็น Number (Advanced Alert)");
    console.log("   🔹 7. ระบบ Anti-Spam และการแจ้งเตือนขั้นสูง");
    console.log("   🔹 8. ระบบประวัติการแจ้งเตือนแบบละเอียด");
    console.log("   🔹 9. ระบบส่งแจ้งเตือนแบบรวม (Combined Alert)");
    console.log("   🔹 10. การรีเซ็ตปุ่มบันทึกอัตโนมัติ");
    console.log("   🔹 11. เพิ่มคอลัมน์ ⏱️ เวลา(นาที) ในตารางเซนเซอร์");
}

// ==========================================
// 📋 หัวข้อหลักที่ 24: ระบบแสดงสถานะอุปกรณ์ปิดอยู่
//    🔹 24.1 applyDisabledCardStyles - ใช้ CSS สำหรับการ์ดที่ปิดอยู่
// ==========================================

// 🔹 24.1: applyDisabledCardStyles - เพิ่ม CSS สำหรับการ์ดที่ปิดอยู่
function applyDisabledCardStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .disabled-card {
            opacity: 0.6;
            filter: grayscale(1);
            border: 2px dashed #64748b;
        }
        .disabled-card .sensor-value {
            color: #94a3b8 !important;
        }
        .disabled-card .sensor-unit {
            color: #64748b !important;
        }
        .disabled-card .timestamp {
            color: #64748b !important;
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// 📋 หัวข้อหลักที่ 25: ระบบยืนยันก่อนทำรายการ (Confirmation)
//    🔹 25.1 confirmAction - ฟังก์ชันยืนยันการกระทำ
//    🔹 25.2 confirmClearLocalData - ยืนยันการลบข้อมูลสถิติ
//    🔹 25.3 confirmDeleteDevice - ยืนยันการลบอุปกรณ์
//    🔹 25.4 confirmDeleteUser - ยืนยันการลบผู้ใช้
//    🔹 25.5 confirmClearHistory - ยืนยันการล้างประวัติ
// ==========================================

// 🔹 25.1: confirmAction - ฟังก์ชันหลักสำหรับยืนยันการกระทำ
function confirmAction(message, warning = '⚠️ คำเตือน') {
    return confirm(`${warning}: ${message}`);
}

// 🔹 25.2: confirmClearLocalData - ยืนยันการลบข้อมูลสถิติ
window.confirmClearLocalData = function() {
    if (confirm("⚠️ คำเตือน: คุณต้องการลบข้อมูลสถิติในเครื่องทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้")) {
        if (sensorHistory) {
            sensorHistory.timestamps = [];
            sensorHistory.data = {};
            if (chart) {
                chart.data.labels = [];
                chart.data.datasets.forEach(ds => ds.data = []);
                chart.update();
            }
            alert("✅ ลบข้อมูลสถิติในเครื่องเรียบร้อย");
        } else {
            alert("📭 ไม่มีข้อมูลสถิติในเครื่องให้ลบ");
        }
    }
};

// 🔹 25.3: confirmDeleteDevice - ยืนยันการลบอุปกรณ์
window.confirmDeleteDevice = function(id) {
    const config = deviceConfigs[id];
    const deviceName = config ? config.name : id;
    if (confirm(`⚠️ คำเตือน: คุณต้องการลบอุปกรณ์ "${deviceName}" (ID: ${id}) ออกจากระบบถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
        deleteDevice(id);
    }
};

// 🔹 25.4: confirmDeleteUser - ยืนยันการลบผู้ใช้
window.confirmDeleteUser = function(username) {
    if (confirm(`⚠️ คำเตือน: คุณต้องการลบผู้ใช้ "${username}" ออกจากระบบถาวรใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
        deleteUser(username);
    }
};

// 🔹 25.5: confirmClearHistory - ยืนยันการล้างประวัติ
window.confirmClearHistory = function() {
    if (confirm("⚠️ คำเตือน: คุณต้องการลบประวัติการส่งทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้")) {
        clearHistory();
    }
};

// ==========================================
// 📋 หัวข้อหลักที่ 26: ระบบปรับวันที่และเวลาเป็นภาษาไทย
//    🔹 26.1 formatThaiDate - แปลงวันที่เป็นภาษาไทย
//    🔹 26.2 formatThaiDateTime - แปลงวันที่และเวลาเป็นภาษาไทย
//    🔹 26.3 formatThaiTime - แปลงเวลาเป็นภาษาไทย
// ==========================================

// 🔹 26.1: formatThaiDate - แปลงวันที่เป็นภาษาไทย
function formatThaiDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('th-TH', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit' 
        }) + ' น.';
    } catch (e) {
        return dateStr;
    }
}

// 🔹 26.2: formatThaiDateTime - แปลงวันที่และเวลาแบบเต็ม
function formatThaiDateTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('th-TH', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        }) + ' น.';
    } catch (e) {
        return dateStr;
    }
}

// 🔹 26.3: formatThaiTime - แปลงเวลาเป็นภาษาไทย
function formatThaiTime(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleTimeString('th-TH', { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 27: ระบบจัดการความผิดพลาดที่เป็นมิตร
//    🔹 27.1 showFriendlyError - แสดงข้อความผิดพลาดที่เป็นมิตร
//    🔹 27.2 wrapAsyncWithFriendlyError - ห่อหุ้มฟังก์ชัน async
//    🔹 27.3 handleError - จัดการข้อผิดพลาดทั่วไป
// ==========================================

// 🔹 27.1: showFriendlyError - แสดงข้อความผิดพลาดที่เป็นมิตร
function showFriendlyError(err) {
    if (!err) {
        alert("⚠️ ขออภัย พบปัญหาในการทำงาน กรุณาลองใหม่อีกครั้ง");
        return;
    }
    
    const errorMessage = err.message || String(err);
    
    if (errorMessage.includes("permission_denied") || errorMessage.includes("PERMISSION_DENIED")) {
        alert("❌ คุณไม่มีสิทธิ์ทำรายการนี้ กรุณาติดต่อแอดมิน");
    } else if (errorMessage.includes("network") || errorMessage.includes("NETWORK")) {
        if (navigator.onLine === false) {
            alert("❌ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตของคุณ");
        } else {
            alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
        }
    } else if (errorMessage.includes("not found") || errorMessage.includes("NOT_FOUND")) {
        alert("❌ ไม่พบข้อมูลที่ต้องการ กรุณาตรวจสอบอีกครั้ง");
    } else if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
        alert("⏱️ การทำงานใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
    } else {
        alert(`⚠️ ขออภัย พบปัญหาในการทำงาน: ${errorMessage}`);
    }
}

// 🔹 27.2: wrapAsyncWithFriendlyError - ห่อหุ้มฟังก์ชัน async
async function wrapAsyncWithFriendlyError(asyncFn, fallbackValue = null) {
    try {
        return await asyncFn();
    } catch (err) {
        showFriendlyError(err);
        return fallbackValue;
    }
}

// 🔹 27.3: handleError - จัดการข้อผิดพลาดทั่วไป
function handleError(err, context = '') {
    console.error(`❌ Error in ${context}:`, err);
    showFriendlyError(err);
}

// ==========================================
// 📋 หัวข้อหลักที่ 28: ระบบแสดงแถบสีเกณฑ์แจ้งเตือนในตาราง
//    🔹 28.1 createLevelBarsHTML - สร้าง HTML แถบสีระดับ
// ==========================================

// 🔹 28.1: createLevelBarsHTML - สร้าง HTML แถบสีระดับ
function createLevelBarsHTML(levels) {
    if (!levels) return '<span style="color:#64748b; font-size:0.6rem;">-</span>';
    
    const levelKeys = ['very_high', 'high', 'normal', 'low', 'very_low'];
    const levelNames = {
        very_high: 'มากที่สุด',
        high: 'มาก',
        normal: 'ปานกลาง',
        low: 'น้อย',
        very_low: 'น้อยที่สุด'
    };
    const levelColors = {
        very_high: '#ef4444',
        high: '#f59e0b',
        normal: '#10b981',
        low: '#3b82f6',
        very_low: '#6366f1'
    };
    
    let html = '';
    for (const key of levelKeys) {
        if (levels[key]) {
            html += `<span style="background:${levelColors[key]}; color:white; padding:2px 6px; border-radius:4px; font-size:0.6rem; margin-right:2px; display:inline-block;">${levelNames[key]}</span>`;
        }
    }
    
    return html || '<span style="color:#64748b; font-size:0.6rem;">-</span>';
}

// ==========================================
// 📋 หัวข้อหลักที่ 29: ระบบจัดการ Thresholds (ใช้ Advanced Alert)
//    🔹 29.1 renderDeviceTableWithThresholds - แสดงตารางเซนเซอร์ (ใช้ Advanced Alert)
//    🔹 29.2 saveDeviceWithThresholds - บันทึกอุปกรณ์พร้อม Advanced Alert
//    🔹 29.3 loadDeviceForEditWithThresholds - โหลดข้อมูลแก้ไข
//    🔹 29.4 resetSaveButtonState - รีเซ็ตสถานะปุ่มบันทึก
//    🔹 29.5 handleEditClickWithThresholds - จัดการคลิกปุ่มแก้ไข
// ==========================================

// 🔹 29.1: renderDeviceTableWithThresholds - แสดงตารางเซนเซอร์ (ใช้ Advanced Alert)
function renderDeviceTableWithThresholds() {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    
    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');
    
    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 40px; color:#64748b;">📭 ยังไม่มีข้อมูลเซนเซอร์</td></tr>';
        return;
    }

    const thead = document.querySelector('#deviceTable thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width: 8%;">🆔 ID</th>
                <th style="width: 13%;">📛 ชื่อจุดติดตั้ง</th>
                <th style="width: 10%;">🔍 ชนิด</th>
                <th style="width: 8%;">📏 หน่วย</th>
                <th style="width: 14%;">📊 ระดับการแจ้งเตือน</th>
                <th style="width: 10%;">⚠️ ค่าวิกฤต</th>
                <th style="width: 10%;">📈 อัตราเปลี่ยน</th>
                <th style="width: 8%;">⏱️ เวลา(นาที)</th>
                <th style="width: 19%;">⚙️ จัดการ</th>
            </tr>
        `;
    }

    tbody.innerHTML = '';
    for (const [id, config] of sensors) {
        const tr = document.createElement('tr');
        
        const unitDisplay = config.unit ? escapeHtml(config.unit) : '-';
        
        let typeDisplay = config.type;
        const typeMap = {
            'ultrasonic': '📡 Ultrasonic',
            'soil': '🌱 Soil',
            'rain': '🌧️ Rain',
            'ph': '🧪 pH',
            'temp': '🌡️ Temperature'
        };
        if (typeMap[config.type]) {
            typeDisplay = typeMap[config.type];
        } else {
            typeDisplay = `📝 ${config.type}`;
        }
        
        const levels = config.levels || null;
        const levelDisplay = levels ? createLevelBarsHTML(levels) : '<span style="color:#64748b; font-size:0.6rem;">-</span>';
        
        // 🔹 ดึงค่าจาก advancedAlert โดยตรง (ใช้ชุดข้อมูลเดียว)
        const advanced = config.advancedAlert || {};
        const criticalVal = advanced.threshold !== null && advanced.threshold !== undefined ? advanced.threshold : '-';
        const rateVal = advanced.rateChange !== null && advanced.rateChange !== undefined ? advanced.rateChange : '-';
        const timeVal = advanced.rateTime !== null && advanced.rateTime !== undefined ? advanced.rateTime : '-';
        
        const isEnabled = config.enabled !== false;
        const statusIcon = isEnabled ? '✅' : '❌';
        const statusColor = isEnabled ? '#4caf50' : '#ef4444';
        
        tr.innerHTML = `
            <td data-label="ID">
                <strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong>
                <span style="font-size: 0.7rem; color: ${statusColor}; margin-left: 4px;">${statusIcon}</span>
            </td>
            <td data-label="ชื่อจุดติดตั้ง"><strong>📛 ${escapeHtml(config.name)}</strong></td>
            <td data-label="ชนิดเซนเซอร์">${typeDisplay}</td>
            <td data-label="หน่วยวัด" style="text-align: center;"><strong>${unitDisplay}</strong></td>
            <td data-label="ระดับการแจ้งเตือน" style="font-size:0.7rem;">${levelDisplay}</td>
            <td data-label="ค่าวิกฤต" style="text-align: center; font-weight: bold; color: #ef4444;">${criticalVal}</td>
            <td data-label="อัตราเปลี่ยน" style="text-align: center; font-weight: bold; color: #f59e0b;">${rateVal}</td>
            <td data-label="เวลา(นาที)" style="text-align: center; font-weight: bold; color: #3b82f6;">${timeVal}</td>
            <td data-label="จัดการ">
                <button class="btn-small edit-btn" 
                        style="background:#ffa726; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:5px;"
                        onclick="handleEditClickWithThresholds('${id}')">✏️ แก้ไข</button>
                <button onclick="confirmDeleteDevice('${escapeHtml(id)}')" 
                        class="btn-small danger" 
                        style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

// 🔹 29.2: saveDeviceWithThresholds - บันทึกอุปกรณ์พร้อม Advanced Alert (ใช้ข้อมูลชุดเดียว)
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
    
    // 🔹 ดึงค่าจาก Advanced Alert เท่านั้น
    const alertThresholdInput = document.getElementById('alertThreshold');
    const alertRateChangeInput = document.getElementById('alertRateChange');
    const alertRateTimeInput = document.getElementById('alertRateTime');
    
    const advancedAlert = {
        threshold: alertThresholdInput?.value ? Number(alertThresholdInput.value) : null,
        rateChange: alertRateChangeInput?.value ? Number(alertRateChangeInput.value) : null,
        rateTime: alertRateTimeInput?.value ? Number(alertRateTimeInput.value) : null
    };
    
    if (!id || !name) return alert("กรุณากรอก ID และ ชื่อจุดติดตั้ง");
    
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
            updatedAt: new Date().toISOString()
        };
        
        if (!isEdit) {
            updateData.enabled = true;
            updateData.alert_count = 0;
            updateData.is_acknowledged = false;
            updateData.last_alert_time = null;
        }
        
        await window.update(window.ref(window.db, `device_configs/${id}`), updateData);
        
        if (deviceConfigs[id]) {
            deviceConfigs[id] = { ...deviceConfigs[id], ...updateData };
        }
        
        const actionText = isEdit ? 'อัปเดต' : 'เพิ่ม';
        alert(`✅ ${actionText}อุปกรณ์ ${id} สำเร็จ [แจ้งเตือน: ${alertEnabled ? 'เปิด' : 'ปิด'}]`);
        
        resetSaveButtonState();
        
        renderDeviceTableWithThresholds();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        renderSummaryTable();
        updateAlertHistoryDropdown();
        
        if (!isEdit) {
            resetDeviceForm();
        } else {
            const config = deviceConfigs[id];
            if (config) {
                loadDeviceForEditWithThresholds(
                    id, 
                    config.name, 
                    config.type, 
                    config.unit || '', 
                    config.levels || null,
                    config.alertEnabled !== false
                );
            }
        }
        
        console.log(`✅ ${actionText}อุปกรณ์ ${id} สำเร็จ`);
        
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
    }
};

// 🔹 29.3: loadDeviceForEditWithThresholds - โหลดข้อมูลแก้ไข
window.loadDeviceForEditWithThresholds = function(id, name, type, unit, levels, alertEnabled) {
    document.getElementById('devId').value = id;
    document.getElementById('devId').readOnly = true;
    document.getElementById('devName').value = name;
    document.getElementById('devUnit').value = unit;
    
    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) {
        alertCheckbox.checked = (alertEnabled !== false);
    }
    
    // 🔹 โหลด Advanced Alert จาก config
    const config = deviceConfigs[id];
    if (config) {
        loadAdvancedAlertConfig(config);
    }
    
    const typeSelect = document.getElementById('devType');
    const customContainer = document.getElementById('customTypeContainer');
    const customInput = document.getElementById('devTypeCustom');
    
    const optionExists = Array.from(typeSelect.options).some(opt => opt.value === type);
    
    if (optionExists) {
        typeSelect.value = type;
        if (customContainer) customContainer.style.display = 'none';
    } else {
        typeSelect.value = 'other';
        if (customContainer) customContainer.style.display = 'block';
        if (customInput) customInput.value = type;
    }
    
    if (levels && Object.keys(levels).length > 0) {
        renderLevelConfigInline(levels);
    } else {
        renderLevelConfigInline(null);
    }
    
    const modeSelect = document.getElementById('levelModeSelect');
    if (modeSelect) modeSelect.value = 'manual';
    toggleLevelMode();
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 อัปเดตข้อมูล';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds(true)');
    }
    
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
    }
    
    renderDeviceTableWithThresholds();
    renderBoardTable();
    updateAlertHistoryDropdown();
};

// 🔹 29.4: resetSaveButtonState - รีเซ็ตสถานะปุ่มบันทึก
function resetSaveButtonState() {
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveDeviceWithThresholds()');
    }
}

// 🔹 29.5: handleEditClickWithThresholds - จัดการคลิกปุ่มแก้ไข
window.handleEditClickWithThresholds = function(id) {
    const config = deviceConfigs[id];
    if (!config) {
        alert("ไม่พบข้อมูลอุปกรณ์");
        return;
    }
    
    loadDeviceForEditWithThresholds(
        id, 
        config.name, 
        config.type, 
        config.unit || '', 
        config.levels || null,
        config.alertEnabled !== false
    );
};

// ==========================================
// 🚀 หัวข้อหลักที่ 30: DOMContentLoaded - จุดเริ่มต้นหลัก
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 กำลังเริ่มต้นระบบ...");
    
    if (window.db) {
        initFirebaseListeners();
    }
    
    const checkDbInterval = setInterval(() => {
        if (window.db) {
            clearInterval(checkDbInterval);
            const settingsRef = window.ref(window.db, 'settings/log_interval');
            window.onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) startAutoLogging(snapshot.val());
                else startAutoLogging(15);
            });
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
    
    function initReportTypeSelector() {
        const reportTypeSelect = document.getElementById('reportTypeSelect');
        if (!reportTypeSelect) {
            const userActions = document.getElementById('userActions');
            if (userActions) {
                const selectHtml = `
                    <select id="reportTypeSelect" style="padding: 10px; border-radius: 8px; margin-bottom: 10px; background: #1e293b; color: #e2e8f0; border: 1px solid #475569;">
                        <option value="status">📊 รายงานสถานะฮาร์ดแวร์ปัจจุบัน</option>
                        <option value="system">⚙️ รายงานสภาพการทำงานของระบบ</option>
                    </select>
                    <br>
                `;
                userActions.insertAdjacentHTML('afterbegin', selectHtml);
            }
        }
    }
    initReportTypeSelector();
    
    function showReportButtonForAll() {
        const userActions = document.getElementById('userActions');
        if (userActions) {
            userActions.style.display = 'block';
        }
    }
    showReportButtonForAll();
    
    initChart();
    createStandaloneAlertPanelIfNotExists();
    initCustomTypeFields();
    
    window.renderLevelConfigInline = renderLevelConfigInline;
    window.toggleLevelMode = toggleLevelMode;
    window.applyBoundaryToLevels = applyBoundaryToLevels;
    window.resetLevelConfigInline = resetLevelConfigInline;
    window.getLevelConfigFromForm = getLevelConfigFromForm;
    window.saveDeviceWithLevelConfig = saveDeviceWithLevelConfig;
    window.loadDeviceForEditWithLevelConfig = loadDeviceForEditWithLevelConfig;
    window.evaluateLevelWithCustom = evaluateLevelWithCustom;
    window.updateSensorCardLevel = updateSensorCardLevel;
    window.checkLevelAlert = checkLevelAlert;
    window.checkLevelAlerts = checkLevelAlerts;
    
    renderLevelConfigInline(null);
    toggleLevelMode();
    
    initializeAllFeatures();
    updateAlertHistoryDropdown();
    
    console.log("✅ ระบบพร้อมทำงาน (เวอร์ชันสมบูรณ์ + ใช้ Advanced Alert แทน Threshold Inputs)");
});

// ==========================================
// 📋 หัวข้อหลักที่ 31: ฟังก์ชันเสริมสำหรับความเข้ากันได้
//    🔹 31.1 ขยาย processNewData ให้เรียก analyzeSensorLogic และ checkAllAlertConditions
// ==========================================

// 🔹 31.1: ขยาย processNewData แบบสมบูรณ์
const originalProcessNewData = processNewData;

processNewData = async function(dataObj) {
    if (originalProcessNewData) {
        originalProcessNewData(dataObj);
    }
    
    for (const [id, value] of Object.entries(dataObj)) {
        const config = deviceConfigs[id];
        if (!config) continue;
        await analyzeSensorLogic(id, value, config);
        await checkAllAlertConditions(id, value, config);
    }
};