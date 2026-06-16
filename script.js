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

// ✅ หัวข้อย่อย 1.1: ตัวแปรสำหรับเก็บ interval ของ Presence (เพิ่มตามไฟล์ 17)
let presenceIntervalId = null;
let currentUsername = null;
let currentUserRole = null;

// ✅ หัวข้อย่อย 1.2: ตัวแปรสำหรับเก็บสถานะเตือนภัยน้ำล้นตลิ่ง
let floodAlertStatus = {}; // เก็บสถานะการเตือนของแต่ละอุปกรณ์ { "us_01": "normal", "us_02": "flood" }

// ==========================================
// 📋 หัวข้อหลักที่ 1.3: ตัวแปรสำหรับระบบ Telegram (เพิ่มจากไฟล์ 12)
// ==========================================
let telegramConfig = {}; // เก็บการตั้งค่า Telegram จาก Firebase
let telegramCheckInterval = null; // เก็บ interval สำหรับตรวจสอบเวลาส่งอัตโนมัติ

// ==========================================
// 📋 หัวข้อหลักที่ 1.4: ตัวแปรสำหรับระบบแจ้งเตือนอุปกรณ์ออฟไลน์ (เพิ่มจากไฟล์ 15)
// ==========================================
let deviceHealthMonitorInterval = null; // เก็บ interval สำหรับตรวจสอบสุขภาพอุปกรณ์


// ==========================================
// 🏷️ หัวข้อหลักที่ 2: ระบบจัดการชื่อโครงการ (Project Title Management)
// ==========================================

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
    if (modal) {
        modal.style.display = 'none';
    }
};

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
// 👥 หัวข้อหลักที่ 3: ระบบ Presence (แสดงรายชื่อผู้ใช้ที่ออนไลน์) - ปรับปรุงใหม่
// ==========================================

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

function removePresence(username) {
    if (!window.db || !username) return;
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    window.remove(presenceRef).catch(err => console.warn("⚠️ removePresence error:", err));
}

// ฟังก์ชันอัปเดตการแสดงผลรายชื่อผู้ใช้ออนไลน์แบบ Compact ในแถบ User Info
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
// 🔐 หัวข้อหลักที่ 4: ระบบ Login (ตรวจสอบจาก Firebase)
// ==========================================

window.togglePassword = function() {
    const passInput = document.getElementById('password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
};

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
    
    // ✅ หัวข้อย่อย 4.1: เริ่มตรวจสอบสุขภาพอุปกรณ์เมื่อ login สำเร็จ
    startDeviceHealthMonitor();
}

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
// 🚪 หัวข้อหลักที่ 5: ระบบ Logout (พร้อมลบ Presence)
// ==========================================

window.logout = async function() {
    const currentUser = sessionStorage.getItem('currentUser');
    
    if (presenceIntervalId) {
        clearInterval(presenceIntervalId);
        presenceIntervalId = null;
    }
    
    // ✅ หัวข้อย่อย 5.1: หยุดการทำงานของ Telegram auto check เมื่อ Logout
    if (telegramCheckInterval) {
        clearInterval(telegramCheckInterval);
        telegramCheckInterval = null;
    }
    
    // ✅ หัวข้อย่อย 5.2: หยุดการทำงานของ Device Health Monitor เมื่อ Logout
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
// 👥 หัวข้อหลักที่ 6: ระบบจัดการผู้ใช้งาน (User Manager)
// ==========================================

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

window.deleteUser = async function(username) {
    if (confirm(`ลบผู้ใช้ ${username} ออกจากระบบ?`)) {
        try {
            await window.remove(window.ref(window.db, `online_users/${username}`));
            await window.remove(window.ref(window.db, `users/${username}`));
            alert(`✅ ลบผู้ใช้ ${username} สำเร็จ`);
            await renderUserTable();
            updateCompactOnlineUsers(); // รีเฟรชรายชื่อออนไลน์
        } catch (error) {
            alert("❌ ลบไม่สำเร็จ: " + error.message);
        }
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
                        <button onclick="deleteUser('${escapeHtml(username)}')" class="btn-small danger">🗑️ ลบ</button>
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}


// ==========================================
// ⚙️ หัวข้อหลักที่ 7: ระบบจัดการอุปกรณ์เซนเซอร์ (Device Manager)
// ==========================================

window.openDeviceManager = function() {
    document.getElementById('deviceModal').style.display = 'flex';
    renderDeviceTable();
};

window.closeDeviceManager = function() {
    document.getElementById('deviceModal').style.display = 'none';
    document.getElementById('devId').value = '';
    document.getElementById('devId').readOnly = false;
    document.getElementById('devName').value = '';
    document.getElementById('devUnit').value = '';
    // 🔹 หัวข้อย่อย 7.1: เคลียร์ค่า bankLevel, bottomLevel, warningLevel เมื่อปิด Modal
    document.getElementById('devBankLevel').value = '';
    document.getElementById('devBottomLevel').value = '';
    document.getElementById('devWarningLevel').value = '';
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveDevice()');
    }
};

// 🔹 หัวข้อย่อย 7.2: แก้ไขอุปกรณ์ - โหลดค่า bankLevel, bottomLevel, warningLevel กลับมา
window.editDevice = function(id, name, type, unit, bankLevel = '', bottomLevel = '', warningLevel = '') {
    document.getElementById('devId').value = id;
    document.getElementById('devId').readOnly = true;
    document.getElementById('devName').value = name;
    document.getElementById('devType').value = type;
    document.getElementById('devUnit').value = unit;
    document.getElementById('devBankLevel').value = bankLevel;
    document.getElementById('devBottomLevel').value = bottomLevel;
    document.getElementById('devWarningLevel').value = warningLevel;
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 อัปเดตข้อมูล';
        saveBtn.setAttribute('onclick', 'saveDevice(true)');
    }
};

// 🔹 หัวข้อย่อย 7.3: บันทึกอุปกรณ์ - เพิ่มการบันทึก bankLevel, bottomLevel, warningLevel
window.saveDevice = async function(isEdit = false) {
    const id = document.getElementById('devId').value.trim();
    const name = document.getElementById('devName').value.trim();
    const type = document.getElementById('devType').value;
    const unit = document.getElementById('devUnit').value.trim();
    // 🔹 7.3.1: ดึงค่า bankLevel, bottomLevel, warningLevel จาก input
    const bankLevel = parseFloat(document.getElementById('devBankLevel').value.trim()) || 0;
    const bottomLevel = parseFloat(document.getElementById('devBottomLevel').value.trim()) || 0;
    const warningLevel = parseFloat(document.getElementById('devWarningLevel').value.trim()) || 0;

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
        // 🔹 7.3.2: บันทึกข้อมูลพร้อม bankLevel, bottomLevel, warningLevel
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            name: name,
            type: type,
            unit: unit,
            bankLevel: bankLevel,
            bottomLevel: bottomLevel,
            warningLevel: warningLevel,
            updatedAt: new Date().toISOString()
        });
        alert(`✅ ${isEdit ? 'อัปเดต' : 'เพิ่ม'}อุปกรณ์ ${id} สำเร็จ`);
        closeDeviceManager();
        renderDeviceTable();
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
    }
};

window.toggleDevice = async function(id, currentStatus) {
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), { enabled: !currentStatus });
    } catch(e) { console.error(e); }
};

window.deleteDevice = async function(id) {
    if(confirm(`ลบอุปกรณ์ ${id} ออกจากระบบ? (ประวัติข้อมูลของอุปกรณ์นี้อาจแสดงผลผิดพลาดได้)`)) {
        try {
            await window.remove(window.ref(window.db, `device_configs/${id}`));
            renderDeviceTable();
        } catch(e) { console.error(e); }
    }
};

function renderDeviceTable() {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    
    if(Object.keys(deviceConfigs).length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 40px;">📭 ยังไม่มีข้อมูลอุปกรณ์ กรุณาเพิ่มอุปกรณ์ด้านบน</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const [id, config] of Object.entries(deviceConfigs)) {
        const tr = document.createElement('tr');
        const statusBadge = config.enabled ? `<span class="status-badge status-on" style="background: linear-gradient(135deg, #4caf50, #2e7d32); color: white; padding:4px 12px; border-radius:20px;">✅ เปิดใช้งาน</span>` : `<span class="status-badge status-off" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding:4px 12px; border-radius:20px;">⛔ ปิดใช้งาน</span>`;
        const toggleBtnText = config.enabled ? '🔴 ปิดการทำงาน' : '🟢 เปิดการทำงาน';
        const toggleBtnClass = config.enabled ? 'btn-small danger' : 'btn-small edit-btn';
        
        let typeThai = '';
        switch(config.type) {
            case 'ultrasonic': typeThai = '📡 Ultrasonic (ระยะ)'; break;
            case 'soil': typeThai = '🌱 Soil (ความชื้นดิน)'; break;
            case 'rain': typeThai = '🌧️ Rain (น้ำฝน)'; break;
            case 'ph': typeThai = '🧪 pH (ค่ากรดด่าง)'; break;
            case 'temp': typeThai = '🌡️ Temperature (อุณหภูมิ)'; break;
            default: typeThai = config.type;
        }
        
        // 🔹 7.3.3: แสดงค่า bankLevel, bottomLevel, warningLevel ในตาราง (เพิ่มคอลัมน์)
        const bankVal = config.bankLevel !== undefined ? config.bankLevel : '-';
        const bottomVal = config.bottomLevel !== undefined ? config.bottomLevel : '-';
        const warningVal = config.warningLevel !== undefined ? config.warningLevel : '-';
        
        // ✅ หัวข้อย่อย 7.4: แสดงปุ่ม "รับทราบ" ในตารางอุปกรณ์
        let ackStatus = '';
        if (config.is_acknowledged) {
            ackStatus = `<span style="color:green;">✅ รับทราบแล้ว</span>`;
        } else if (config.alert_count && config.alert_count > 0) {
            ackStatus = `<button onclick="acknowledgeAlert('${escapeHtml(id)}')" class="btn-small" style="background:#2196F3; color:white; padding:4px 12px; border-radius:20px; border:none; cursor:pointer;">🔔 รับทราบ</button>`;
        } else {
            ackStatus = `<span style="color:#888; font-size:0.8rem;">-</span>`;
        }
        
        // ✅ หัวข้อย่อย 7.5: แสดงจำนวนการแจ้งเตือน
        const alertCountDisplay = config.alert_count || 0;
        
        tr.innerHTML = `
            <td data-label="ID"><strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong></td>
            <td data-label="ชื่อจุดติดตั้ง"><strong>📛 ${escapeHtml(config.name)}</strong></td>
            <td data-label="ชนิดเซนเซอร์">${typeThai}</td>
            <td data-label="หน่วย"><span style="background: #e8f5e9; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${escapeHtml(config.unit || '-')}</span></td>
            <td data-label="ระดับตลิ่ง"><span style="background: #fff3e0; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; color:#e65100;">${bankVal}</span></td>
            <td data-label="ระดับก้นบ่อ"><span style="background: #e3f2fd; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; color:#0d47a1;">${bottomVal}</span></td>
            <td data-label="ระดับเตือน"><span style="background: #fce4ec; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; color:#b71c1c;">${warningVal}</span></td>
            <td data-label="แจ้งเตือน"><span style="background: #ffeb3b; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem;">${alertCountDisplay}/3</span></td>
            <td data-label="รับทราบ">${ackStatus}</td>
            <td data-label="สถานะ">${statusBadge}</td>
            <td data-label="จัดการ">
                <button onclick="editDevice('${escapeHtml(id)}', '${escapeHtml(config.name)}', '${config.type}', '${escapeHtml(config.unit)}', '${config.bankLevel || ''}', '${config.bottomLevel || ''}', '${config.warningLevel || ''}')" class="btn-small edit-btn" style="background:#ffa726; margin-right:8px;">✏️ แก้ไข</button>
                <button onclick="toggleDevice('${escapeHtml(id)}', ${config.enabled})" class="${toggleBtnClass}" style="margin-right: 8px;">${toggleBtnText}</button>
                <button onclick="deleteDevice('${escapeHtml(id)}')" class="btn-small danger">🗑️ ลบ</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}


// ==========================================
// 🔌 หัวข้อหลักที่ 8: ระบบ Provisioning ติดตั้งบอร์ดผ่าน USB
// ==========================================

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
        await writer.write(encoder.encode(JSON.stringify(configData) + "\n"));
        writer.releaseLock();
        await port.close();
        await window.set(window.ref(window.db, `device_configs/${deviceId}`), {
            name: "อุปกรณ์ " + deviceId,
            type: "ultrasonic",
            enabled: true,
            ssid: ssid,
            status: "online",
            bankLevel: 0,
            bottomLevel: 0,
            warningLevel: 0,
            alert_count: 0,
            is_acknowledged: false,
            last_alert_time: null,
            updatedAt: window.serverTimestamp()
        });
        alert("✅ ติดตั้งและบันทึกข้อมูลเรียบร้อย!");
        if (typeof renderDeviceTable === 'function') renderDeviceTable();
    } catch (error) {
        console.error("Provisioning Error:", error);
        if (error.name === 'NotFoundError') alert("❌ ไม่พบพอร์ต USB: กรุณาตรวจสอบว่าเสียบสายและเลือกบอร์ดแล้ว");
        else if (error.name === 'SecurityError') alert("❌ สิทธิ์ไม่เพียงพอ: โปรดตรวจสอบว่าเว็บไซต์เป็น HTTPS");
        else alert("❌ การติดตั้งล้มเหลว: " + error.message);
    }
};


// ==========================================
// 📊 หัวข้อหลักที่ 9: UI และ Chart Dynamic Rendering
// ==========================================

function renderSensorCards() {
    const container = document.getElementById('sensorGridContainer');
    container.innerHTML = ''; 
    let hasEnabledDevice = false;
    for (const [id, config] of Object.entries(deviceConfigs)) {
        if (!config.enabled) continue;
        hasEnabledDevice = true;
        const val = currentSensorValues[id] !== undefined ? currentSensorValues[id] : '--';
        const timeStr = new Date().toLocaleTimeString();
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';
        
        // 🔹 หัวข้อย่อย 9.1: แสดงสถานะน้ำล้นตลิ่งบน Sensor Card
        const alertStatus = floodAlertStatus[id] || 'normal';
        let alertBadge = '';
        if (config.type === 'ultrasonic' && alertStatus === 'flood') {
            alertBadge = `<div class="alert-badge flood" style="background: #d32f2f; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center; animation: alertPulse 1.5s infinite;">⚠️ น้ำล้นตลิ่ง!</div>`;
        } else if (config.type === 'ultrasonic' && alertStatus === 'warning') {
            alertBadge = `<div class="alert-badge warning" style="background: #f57c00; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center;">⚠️ ระดับน้ำใกล้ตลิ่ง</div>`;
        }
        
        // 🔹 หัวข้อย่อย 9.2: แสดงค่าระดับตลิ่งและก้นบ่อใน Sensor Card
        const bankInfo = (config.type === 'ultrasonic' && config.bankLevel !== undefined) 
            ? `<div style="font-size: 0.7rem; color: #2e7d32; margin-top: 4px;">ตลิ่ง: ${config.bankLevel} ${config.unit || ''} | ก้นบ่อ: ${config.bottomLevel || 0} ${config.unit || ''}</div>`
            : '';
        
        const cardHTML = `
            <div class="sensor-card" id="card_${id}">
                <div class="sensor-title">${icon} ${escapeHtml(config.name)}</div>
                <div class="sensor-value">
                    <span id="val_${id}">${val}</span>
                    <span class="sensor-unit">${escapeHtml(config.unit)}</span>
                </div>
                ${bankInfo}
                ${alertBadge}
                <div class="timestamp" id="time_${id}">อัปเดต: ${val !== '--' ? timeStr : 'รอข้อมูล...'}</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    }
    if (!hasEnabledDevice) container.innerHTML = '<div style="width:100%; text-align:center; color:#fff; grid-column: 1 / -1;">ไม่มีเซนเซอร์ที่เปิดใช้งาน กรุณาตั้งค่าใน "จัดการเซนเซอร์"</div>';
}

function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: true, interaction: { mode: 'index', intersect: false }, plugins: { title: { display: true, text: 'Real-time Data (เฉพาะอุปกรณ์ที่เปิด)' } } }
    });
    updateChartStructure();
}

function updateChartStructure() {
    if (!chart) return;
    const datasets = [];
    Object.keys(deviceConfigs).forEach((id, index) => {
        const config = deviceConfigs[id];
        if(!config.enabled) return;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const color = colors[index % colors.length];
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        datasets.push({ label: `${config.name} (${config.unit})`, data: sensorHistory.data[id], borderColor: color, backgroundColor: color + '33', tension: 0.1, fill: true });
    });
    chart.data.datasets = datasets;
    chart.update();
}

// 🔹 หัวข้อย่อย 9.3: ฟังก์ชันตรวจสอบสถานะน้ำล้นตลิ่ง
function checkFloodAlert(id, value, config) {
    if (config.type !== 'ultrasonic') return 'normal';
    if (config.bankLevel === undefined || config.bankLevel === 0) return 'normal';
    if (config.warningLevel === undefined) return 'normal';
    
    const bank = config.bankLevel;
    const warning = config.warningLevel;
    
    if (value >= bank) {
        return 'flood';
    } else if (value >= warning) {
        return 'warning';
    }
    return 'normal';
}

function processNewData(dataObj) {
    const timeNow = new Date();
    currentSensorValues = dataObj;
    sensorHistory.timestamps.push(timeNow.toLocaleTimeString());
    if(sensorHistory.timestamps.length > 100) sensorHistory.timestamps.shift();
    
    // 🔹 หัวข้อย่อย 9.4: อัปเดตสถานะการเตือนภัยน้ำล้นตลิ่ง
    Object.keys(deviceConfigs).forEach(id => {
        const config = deviceConfigs[id];
        if (!config.enabled) return;
        
        const valEl = document.getElementById(`val_${id}`);
        const timeEl = document.getElementById(`time_${id}`);
        const value = dataObj[id] !== undefined ? dataObj[id] : 0;
        
        if(valEl) valEl.textContent = value;
        if(timeEl) timeEl.textContent = `อัปเดต: ${timeNow.toLocaleTimeString()}`;
        
        // ตรวจสอบสถานะน้ำล้นตลิ่ง
        if (config.type === 'ultrasonic') {
            const status = checkFloodAlert(id, value, config);
            floodAlertStatus[id] = status;
            
            // อัปเดต UI แสดงสถานะบน Card
            const card = document.getElementById(`card_${id}`);
            if (card) {
                // ลบ alert badge เก่า
                const oldBadge = card.querySelector('.alert-badge');
                if (oldBadge) oldBadge.remove();
                
                // ลบ class flood/warning alert
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
        
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        sensorHistory.data[id].push(value);
        if(sensorHistory.data[id].length > 100) sensorHistory.data[id].shift();
    });
    
    if(chart) { chart.data.labels = sensorHistory.timestamps; chart.update('none'); }
}


// ==========================================
// 📡 หัวข้อหลักที่ 10: การเชื่อมต่อและดักฟัง Firebase
// ==========================================

function initFirebaseListeners() {
    if (!window.db) return;
    initTitleListener();
    const configRef = window.ref(window.db, 'device_configs');
    window.onValue(configRef, (snapshot) => {
        deviceConfigs = snapshot.exists() ? snapshot.val() : {};
        renderSensorCards();
        updateChartStructure();
        if(document.getElementById('deviceModal').style.display === 'flex') renderDeviceTable();
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
    
    // ✅ หัวข้อย่อย 10.1: เริ่มต้นดักฟังการตั้งค่า Telegram
    initTelegramListeners();
}


// ==========================================
// 💬 หัวข้อหลักที่ 11: ระบบ Telegram (Manual & Auto Text Report) - เพิ่มจากไฟล์ 12
// ==========================================

// 🔹 หัวข้อย่อย 11.1: ฟังก์ชันส่งข้อความจริง (ใช้ร่วมกันทั้ง Auto และ Manual)
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

// 🔹 หัวข้อย่อย 11.2: ฟังก์ชันสำหรับ "ส่งเองทันที" (เรียกจากปุ่มในหน้าจอ) - ปรับปรุงตามไฟล์ 14 และ 16
//    ผู้ใช้งานทั่วไป (User) สามารถกดส่งได้ โดย Token ถูกดึงจาก Firebase โดยอัตโนมัติ
//    🔹 หัวข้อย่อย 11.2.1: เพิ่มการเลือกประเภท reportType (ตามไฟล์ 16)
window.triggerManualReport = async function() {
    // 1. ดึง Token จาก Firebase (การตั้งค่าที่ Admin ตั้งไว้)
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
    
    // 2. ดึงรายชื่อผู้รับ
    const subsSnap = await window.get(window.ref(window.db, 'settings/telegram/subscribers'));
    if (!subsSnap.exists()) {
        alert("❌ ยังไม่มีรายชื่อผู้รับ กรุณาติดต่อ Admin");
        return;
    }
    const subs = subsSnap.val();
    
    // 3. ดึงประเภทรายงานที่ผู้ใช้เลือก (ตามไฟล์ 16)
    const reportType = document.getElementById('reportTypeSelect')?.value || 'status';
    
    // 4. สร้างข้อความตามประเภท (ตามไฟล์ 16)
    const sender = sessionStorage.getItem('currentUser') || 'Unknown User';
    let reportText = `📢 <b>รายงาน: ${reportType === 'status' ? 'สถานะฮาร์ดแวร์' : 'สภาพการทำงานระบบ'}</b>\n`;
    reportText += `👤 ผู้ส่ง: ${sender}\n\n`;

    if (reportType === 'status') {
        // รายงานสถานะเซนเซอร์แบบเดิม
        let hasData = false;
        for (const [id, value] of Object.entries(currentSensorValues)) {
            const cfg = deviceConfigs[id] || {};
            if (cfg.enabled) {
                reportText += `• <b>${cfg.name || id}</b>: ${value} ${cfg.unit || ''}\n`;
                hasData = true;
            }
        }
        if (!hasData) {
            reportText += `⚠️ ไม่มีข้อมูลเซนเซอร์ในขณะนี้\n`;
        }
    } else {
        // รายงานสภาพการทำงาน (ตัวอย่างข้อมูลระบบ) - ตามไฟล์ 16
        reportText += `🟢 สถานะ Firebase: <b>เชื่อมต่อปกติ</b>\n`;
        reportText += `⏱️ ความถี่บันทึกสถิติ: ${currentIntervalMinutes} นาที\n`;
        reportText += `👥 ผู้ใช้งานออนไลน์: ${document.getElementById('compactOnlineText')?.textContent || 'ตรวจสอบไม่ได้'}\n`;
        reportText += `📡 อุปกรณ์เปิดใช้งาน: ${Object.values(deviceConfigs).filter(d => d.enabled).length} บอร์ด\n`;
        
        // เพิ่มข้อมูลวันที่/เวลาที่เซนเซอร์ล่าสุด (ตามคำแนะนำในไฟล์ 16)
        const now = new Date();
        reportText += `🕐 เวลาปัจจุบัน: ${now.toLocaleString('th-TH')}\n`;
        
        // แสดงสถานะอุปกรณ์แต่ละตัว
        reportText += `\n📋 สถานะอุปกรณ์:\n`;
        for (const [id, cfg] of Object.entries(deviceConfigs)) {
            if (cfg.enabled) {
                const status = currentSensorValues[id] !== undefined ? '✅ ทำงาน' : '⏳ รอข้อมูล';
                reportText += `• ${cfg.name || id}: ${status}\n`;
            }
        }
    }
    
    // 5. ยืนยันการส่ง
    if (!confirm("ยืนยันการส่งรายงานทาง Telegram?")) {
        return;
    }

    // 6. ส่งรายงานไปยังผู้รับทั้งหมด
    let successCount = 0;
    let failCount = 0;
    for (let subId in subs) {
        const success = await sendTelegramTextManual(token, subs[subId].chatId, reportText);
        // บันทึกประวัติ
        await window.push(window.ref(window.db, 'settings/telegram/history'), {
            timestamp: new Date().toISOString(),
            target: subs[subId].name,
            sender: sender,
            status: success ? "success" : "failed"
        });
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }
    
    // 7. แจ้งผลการส่ง
    if (successCount > 0) {
        alert(`✅ ส่งรายงาน ${reportType === 'status' ? 'สถานะฮาร์ดแวร์' : 'สภาพการทำงานระบบ'} ให้ ${successCount} คน เรียบร้อยแล้ว${failCount > 0 ? ` (ล้มเหลว ${failCount} คน)` : ''}`);
    } else {
        alert(`❌ การส่งรายงานล้มเหลวทั้งหมด (${failCount} คน) กรุณาตรวจสอบ Token และ Chat ID`);
    }
    
    // อัปเดตตารางประวัติ
    renderHistoryTable();
};

// 🔹 หัวข้อย่อย 11.3: ฟังก์ชันสำหรับระบบอัตโนมัติ (ส่งรายงานประจำวัน)
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
        reportText += `• ${devConfig.name || id}: ${value} ${devConfig.unit || ''}\n`;
    }
    
    // ส่งไปยังผู้รับทั้งหมด
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

// 🔹 หัวข้อย่อย 11.4: จัดการรายชื่อผู้รับ (CRUD)
// ✅ หัวข้อย่อย 11.4.1: ฟังก์ชันเพิ่มผู้รับ
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

// ✅ หัวข้อย่อย 11.4.2: ฟังก์ชันลบผู้รับ
window.deleteSubscriber = async function(subId) {
    await window.remove(window.ref(window.db, `settings/telegram/subscribers/${subId}`));
    renderSubscribersTable();
};

// ✅ หัวข้อย่อย 11.4.3: ฟังก์ชันแก้ไขผู้รับ (เพิ่มจากไฟล์ 17)
window.editSubscriber = function(subId, name, chatId) {
    document.getElementById('subName').value = name;
    document.getElementById('subChatId').value = chatId;
    // ปรับปุ่มเพิ่ม ให้กลายเป็นปุ่มอัปเดตชั่วคราว
    const btn = document.querySelector('button[onclick="saveSubscriber()"]');
    if (btn) {
        btn.textContent = '💾 อัปเดต';
        btn.setAttribute('onclick', `updateSubscriber('${subId}')`);
    }
};

// ✅ หัวข้อย่อย 11.4.4: ฟังก์ชันอัปเดตผู้รับ (เพิ่มจากไฟล์ 17)
window.updateSubscriber = async function(subId) {
    const name = document.getElementById('subName').value;
    const chatId = document.getElementById('subChatId').value;
    if (!name || !chatId) return alert("กรุณากรอกข้อมูลให้ครบ");
    
    await window.update(window.ref(window.db, `settings/telegram/subscribers/${subId}`), { name, chatId });
    alert("✅ อัปเดตข้อมูลผู้รับสำเร็จ");
    
    // รีเซ็ตปุ่มกลับเป็นปุ่มเพิ่ม
    const btn = document.querySelector('button[onclick^="updateSubscriber"]');
    if (btn) {
        btn.textContent = '➕ เพิ่ม';
        btn.setAttribute('onclick', 'saveSubscriber()');
    }
    document.getElementById('subName').value = '';
    document.getElementById('subChatId').value = '';
    renderSubscribersTable();
};

// 🔹 หัวข้อย่อย 11.5: แสดงผลตาราง (UI Render) - ปรับปรุงตามไฟล์ 17
// ✅ หัวข้อย่อย 11.5.1: แสดงตารางรายชื่อผู้รับพร้อมปุ่มแก้ไข
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

// 🔹 หัวข้อย่อย 11.5.2: แสดงตารางประวัติการส่งพร้อมปุ่มลบ (ปรับปรุงตามไฟล์ 17)
// ✅ หัวข้อย่อย 11.5.2.1: ฟังก์ชันล้างประวัติทั้งหมด (เพิ่มจากไฟล์ 17)
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

// ✅ หัวข้อย่อย 11.5.2.2: ฟังก์ชันลบประวัติรายการ (เพิ่มจากไฟล์ 17)
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

// ✅ หัวข้อย่อย 11.5.2.3: แสดงตารางประวัติพร้อมปุ่มลบ (ปรับปรุงตามไฟล์ 17)
async function renderHistoryTable() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram/history'));
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (snap.exists()) {
        const history = Object.entries(snap.val()).reverse(); // เก็บ key ไว้ลบรายรายการ
        history.forEach(([id, item]) => {
            tbody.innerHTML += `<tr>
                <td>${new Date(item.timestamp).toLocaleTimeString()}</td>
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

// 🔹 หัวข้อย่อย 11.6: ฟังก์ชันบันทึกการตั้งค่าลง Firebase (แบบมีผู้รับ)
window.saveTelegramConfig = async function() {
    const config = {
        botToken: document.getElementById('teleBotToken').value.trim(),
        sendTime: document.getElementById('teleSendTime').value,
        enabled: document.getElementById('teleEnabled').checked
    };
    await window.set(window.ref(window.db, 'settings/telegram/config'), config);
    alert("✅ บันทึกค่าสำเร็จ");
};

// 🔹 หัวข้อย่อย 11.7: ตัวเช็คเวลาอัตโนมัติ
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

// 🔹 หัวข้อย่อย 11.8: โหลดค่าการตั้งค่า Telegram ลงในฟอร์ม
async function loadTelegramConfig() {
    try {
        const snap = await window.get(window.ref(window.db, 'settings/telegram/config'));
        if (snap.exists()) {
            const config = snap.val();
            document.getElementById('teleBotToken').value = config.botToken || '';
            document.getElementById('teleSendTime').value = config.sendTime || '';
            document.getElementById('teleEnabled').checked = config.enabled || false;
        }
        // โหลดรายชื่อผู้รับและประวัติ
        await renderSubscribersTable();
        await renderHistoryTable();
    } catch (e) {
        console.warn("⚠️ ไม่สามารถโหลดการตั้งค่า Telegram:", e);
    }
}

// 🔹 หัวข้อย่อย 11.9: ดักฟังการเปลี่ยนแปลงการตั้งค่า Telegram จาก Firebase
function initTelegramListeners() {
    if (!window.db) return;
    
    const configRef = window.ref(window.db, 'settings/telegram/config');
    window.onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            telegramConfig = snapshot.val();
        } else {
            telegramConfig = {};
        }
        // โหลดค่าลงฟอร์มถ้า Modal เปิดอยู่
        const modal = document.getElementById('settingsModal');
        if (modal && modal.style.display === 'flex') {
            loadTelegramConfig();
        }
    });
    
    // เริ่มต้นตัวเช็คเวลาอัตโนมัติ
    startTelegramAutoCheck();
}

// ==========================================
// 📋 หัวข้อหลักที่ 12: ฟังก์ชันแสดง/ซ่อนปุ่มตามสิทธิ์ (Security Control)
//    🔹 12.1: ฟังก์ชัน applyRole - ควบคุมการแสดงผลปุ่มตามบทบาท
// ==========================================

// หมายเหตุ: ฟังก์ชัน applyRole ถูกประกาศไว้แล้วในหัวข้อหลักที่ 4
// แต่เราจะทำการปรับปรุงให้รองรับการแสดงปุ่มส่งรายงานสำหรับทุกคน
// และเพิ่มการแสดงปุ่มเลือกรูปแบบรายงานตามไฟล์ 16

// 🔹 หัวข้อย่อย 12.2: ปรับปรุงฟังก์ชัน applyRole เพื่อแสดงปุ่มเลือกรูปแบบรายงาน
// (ฟังก์ชันนี้ถูกประกาศไว้แล้วในหัวข้อหลักที่ 4 แต่เราจะเขียนทับเพื่อเพิ่มฟังก์ชันการทำงาน)
// เนื่องจากฟังก์ชัน applyRole ถูกประกาศไว้แล้ว เราจะไม่ประกาศซ้ำ
// แต่จะเพิ่มโค้ดในส่วนของ DOMContentLoaded เพื่อแสดงปุ่มเลือกรูปแบบรายงาน

// ==========================================
// 🛠️ หัวข้อหลักที่ 13: ระบบตั้งค่าการบันทึก & สำรองข้อมูล
// ==========================================

let autoLogIntervalId = null;
let currentIntervalMinutes = 15;

window.openSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('logInterval').value = currentIntervalMinutes;
    // ✅ หัวข้อย่อย 13.1: โหลดค่า Telegram เมื่อเปิด Modal
    loadTelegramConfig();
};

window.closeSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'none';
};

window.saveLogInterval = async function() {
    const min = parseInt(document.getElementById('logInterval').value);
    if (isNaN(min) || min < 1) return alert("กรุณากรอกตัวเลขมากกว่า 0");
    try {
        await window.set(window.ref(window.db, `settings/log_interval`), min);
        alert(`✅ บันทึกความถี่เป็น ${min} นาที สำเร็จ`);
    } catch (e) { alert("❌ บันทึกไม่สำเร็จ: " + e.message); }
};

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

document.addEventListener('DOMContentLoaded', () => {
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
});


// ==========================================
// 📋 หัวข้อหลักที่ 14: ระบบแจ้งเตือนอุปกรณ์ออฟไลน์อัตโนมัติ 3 ครั้ง
//    🔹 14.1: ฟังก์ชันตรวจสอบสุขภาพอุปกรณ์ - ตรวจจับอุปกรณ์ออฟไลน์และส่งแจ้งเตือน (ปรับปรุงตามไฟล์ 17)
//    🔹 14.2: ฟังก์ชันรับทราบการแจ้งเตือน - กดครั้งเดียวหยุดทันที (ปรับปรุงตามไฟล์ 17)
//    🔹 14.3: ฟังก์ชันเริ่มต้นการตรวจสอบอุปกรณ์
//    🔹 14.4: ฟังก์ชันรีเซ็ตสถานะการเตือนเมื่ออุปกรณ์กลับมาออนไลน์
// ==========================================

// ✅ หัวข้อย่อย 14.1: ฟังก์ชันตรวจสอบสุขภาพอุปกรณ์ - ตรวจจับอุปกรณ์ออฟไลน์และส่งแจ้งเตือน
//    (ปรับปรุงตามไฟล์ 17: ตรวจสอบ is_acknowledged ก่อนเสมอ)
async function monitorDeviceHealth() {
    const now = Date.now();
    const devicesRef = window.ref(window.db, 'device_configs');
    const snapshot = await window.get(devicesRef);
    
    if (!snapshot.exists()) return;
    const devices = snapshot.val();

    for (const [id, config] of Object.entries(devices)) {
        // ข้ามอุปกรณ์ที่ไม่ได้เปิดใช้งาน
        if (!config.enabled) continue;
        
        // 🔥 ปรับปรุงตามไฟล์ 17: ถ้ามีการกดรับทราบไปแล้ว ให้ข้ามการแจ้งเตือน
        if (config.is_acknowledged === true) continue;
        
        // ตรวจสอบว่าออฟไลน์ (เช่น ไม่มีข้อมูลใน 3 นาที)
        const lastSeenTime = config.lastSeen ? new Date(config.lastSeen).getTime() : 0;
        const isOffline = (now - lastSeenTime) > 180000; // 3 นาที
        
        if (isOffline) {
            const count = config.alert_count || 0;
            const lastTime = config.last_alert_time || 0;
            
            // Logic การแจ้งเตือน 3 ครั้ง (ตามไฟล์ 17)
            let shouldAlert = false;
            if (count === 0) shouldAlert = true; // ครั้งที่ 1 (ทันที)
            else if (count === 1 && (now - lastTime) >= 300000) shouldAlert = true; // ครั้งที่ 2 (5 นาที)
            else if (count === 2 && (now - lastTime) >= 600000) shouldAlert = true; // ครั้งที่ 3 (10 นาที)

            if (shouldAlert && count < 3) {
                // สร้างข้อความแจ้งเตือน (ปรับปรุงตามไฟล์ 17)
                const message = `🚨 <b>แจ้งเตือนอุปกรณ์ขัดข้อง!</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n🔢 ครั้งที่: ${count + 1}/3\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}\n⚠️ สถานะ: อุปกรณ์ออฟไลน์`;
                
                // ดึงรายชื่อผู้รับ Telegram เพื่อส่งข้อความ
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
                
                // อัปเดตสถานะใน Firebase (ตามไฟล์ 17)
                await window.update(window.ref(window.db, `device_configs/${id}`), {
                    alert_count: count + 1,
                    last_alert_time: now
                });
                
                console.log(`🔔 ส่งการแจ้งเตือนอุปกรณ์ ${id} ครั้งที่ ${count + 1}/3`);
            }
        }
    }
}

// ✅ หัวข้อย่อย 14.2: ฟังก์ชันรับทราบการแจ้งเตือน - กดครั้งเดียวหยุดทันที (ปรับปรุงตามไฟล์ 17)
window.acknowledgeAlert = async function(id) {
    if (!id) {
        console.error("❌ ไม่มี ID อุปกรณ์");
        return;
    }
    
    try {
        // 🔥 ปรับปรุงตามไฟล์ 17: เมื่อกดรับทราบ ให้ตั้งค่า is_acknowledged = true และรีเซ็ต alert_count = 0
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            is_acknowledged: true,
            alert_count: 0
        });
        
        alert("✅ รับทราบการแจ้งเตือนเรียบร้อย ระบบจะหยุดส่งคำเตือนสำหรับอุปกรณ์นี้จนกว่าจะกลับมาออนไลน์ใหม่");
        renderDeviceTable(); // รีเฟรชตารางอุปกรณ์
    } catch (error) {
        console.error("❌ รับทราบการแจ้งเตือนไม่สำเร็จ:", error);
        alert("❌ รับทราบการแจ้งเตือนไม่สำเร็จ: " + error.message);
    }
};

// ✅ หัวข้อย่อย 14.3: ฟังก์ชันเริ่มต้นการตรวจสอบอุปกรณ์
function startDeviceHealthMonitor() {
    // หยุด interval เก่าถ้ามี
    if (deviceHealthMonitorInterval) {
        clearInterval(deviceHealthMonitorInterval);
        deviceHealthMonitorInterval = null;
    }
    
    // ตรวจสอบทุก 30 วินาที (ตามที่แนะนำในไฟล์ 15)
    deviceHealthMonitorInterval = setInterval(async () => {
        try {
            // ตรวจสอบว่ามีผู้ใช้ login อยู่หรือไม่ (ทำงานเฉพาะเมื่อ login แล้ว)
            const currentUser = sessionStorage.getItem('currentUser');
            if (!currentUser) return;
            
            await monitorDeviceHealth();
        } catch (error) {
            console.error("❌ deviceHealthMonitor error:", error);
        }
    }, 30000); // 30 วินาที
    
    console.log("✅ เริ่มระบบตรวจสอบสุขภาพอุปกรณ์อัตโนมัติ (ตรวจสอบทุก 30 วินาที)");
}

// ✅ หัวข้อย่อย 14.4: ฟังก์ชันรีเซ็ตสถานะการเตือนเมื่ออุปกรณ์กลับมาออนไลน์
//    ระบบจะกลับมาทำงานแจ้งเตือนอีกครั้งอัตโนมัติเมื่ออุปกรณ์นั้นมีการส่งข้อมูลเข้ามาใหม่ (Online)
//    เพราะฟังก์ชันนี้จะทำการรีเซ็ต is_acknowledged กลับเป็น false
async function resetDeviceAlertStatus(id) {
    try {
        const deviceRef = window.ref(window.db, `device_configs/${id}`);
        const snapshot = await window.get(deviceRef);
        
        if (snapshot.exists()) {
            const config = snapshot.val();
            
            // ถ้าอุปกรณ์กลับมาออนไลน์ (มีการอัปเดต lastSeen) และมีสถานะการแจ้งเตือนค้างอยู่
            if (config.alert_count > 0 || config.is_acknowledged === true) {
                await window.update(deviceRef, {
                    alert_count: 0,
                    is_acknowledged: false,
                    last_alert_time: null
                });
                console.log(`🔄 รีเซ็ตสถานะการแจ้งเตือนของอุปกรณ์ ${id} (กลับมาออนไลน์แล้ว)`);
                
                // รีเฟรชตารางอุปกรณ์
                renderDeviceTable();
            }
        }
    } catch (error) {
        console.error(`❌ รีเซ็ตสถานะอุปกรณ์ ${id} ไม่สำเร็จ:`, error);
    }
}

// ✅ แก้ไข function processNewData เพื่อตรวจจับการกลับมาออนไลน์ของอุปกรณ์
//    (เพิ่มการเรียก resetDeviceAlertStatus เมื่ออุปกรณ์กลับมาออนไลน์)
const originalProcessNewData = processNewData;
processNewData = function(dataObj) {
    // เรียกใช้ฟังก์ชันเดิม
    originalProcessNewData(dataObj);
    
    // ตรวจสอบอุปกรณ์ที่กลับมาออนไลน์และรีเซ็ตสถานะการเตือน
    if (Object.keys(deviceConfigs).length > 0) {
        Object.keys(deviceConfigs).forEach(id => {
            const config = deviceConfigs[id];
            if (!config.enabled) return;
            
            const value = dataObj[id];
            if (value !== undefined && value !== null) {
                // อุปกรณ์ส่งข้อมูลเข้ามา แสดงว่ากลับมาออนไลน์แล้ว
                if (config.alert_count > 0 || config.is_acknowledged === true) {
                    resetDeviceAlertStatus(id);
                }
            }
        });
    }
};


// ==========================================
// 📋 หัวข้อหลักที่ 15: การปรับปรุง UI ตามไฟล์ 16 (เพิ่ม select รูปแบบรายงาน)
//    🔹 15.1: ตรวจสอบและแสดง select สำหรับเลือกรูปแบบรายงาน
//    🔹 15.2: จัดการการแสดงผลปุ่มส่งรายงานตามสิทธิ์
// ==========================================

// ✅ หัวข้อย่อย 15.1: ตรวจสอบและแสดง select สำหรับเลือกรูปแบบรายงาน
// ฟังก์ชันนี้จะถูกเรียกเมื่อ DOM โหลดเสร็จเพื่อตรวจสอบว่ามี select อยู่ในหน้าเว็บหรือไม่
function initReportTypeSelector() {
    const reportTypeSelect = document.getElementById('reportTypeSelect');
    if (!reportTypeSelect) {
        // ถ้าไม่มี select ให้สร้างและเพิ่มเข้าไปใน userActions
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

// ✅ หัวข้อย่อย 15.2: จัดการการแสดงผลปุ่มส่งรายงานตามสิทธิ์
// ฟังก์ชันนี้จะถูกเรียกเมื่อมีการ login เพื่อแสดงปุ่มส่งรายงานให้ทุกคนเห็น
function showReportButtonForAll() {
    const userActions = document.getElementById('userActions');
    if (userActions) {
        userActions.style.display = 'block';
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 16: การโหลดข้อมูลเริ่มต้น (Initialization)
//    🔹 16.1: ตรวจสอบการ login อัตโนมัติจาก localStorage
//    🔹 16.2: เริ่มต้นการทำงานของระบบทั้งหมด
// ==========================================

// ✅ หัวข้อย่อย 16.1: ตรวจสอบการ login อัตโนมัติจาก localStorage
function checkAutoLogin() {
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    if (rememberMe) {
        const savedUsername = localStorage.getItem('savedUsername');
        const savedPassword = localStorage.getItem('savedPassword');
        if (savedUsername && savedPassword) {
            document.getElementById('username').value = savedUsername;
            document.getElementById('password').value = savedPassword;
            document.getElementById('rememberMe').checked = true;
            // ทำการ login อัตโนมัติ
            handleLogin();
        }
    }
}

// ✅ หัวข้อย่อย 16.2: เริ่มต้นการทำงานของระบบทั้งหมด
document.addEventListener('DOMContentLoaded', function() {
    // เริ่มต้นการเชื่อมต่อ Firebase
    if (window.db) {
        initFirebaseListeners();
    }
    
    // ตรวจสอบการ login อัตโนมัติ
    checkAutoLogin();
    
    // เริ่มต้น UI สำหรับเลือกรูปแบบรายงาน (ตามไฟล์ 16)
    initReportTypeSelector();
    
    // แสดงปุ่มส่งรายงานให้ทุกคนเห็น
    showReportButtonForAll();
    
    console.log("🚀 ระบบพร้อมทำงาน (เวอร์ชันที่ปรับปรุงตามไฟล์ 16 และ 17)");
});