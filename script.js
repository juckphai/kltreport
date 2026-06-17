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
// 👥 หัวข้อหลักที่ 3: ระบบ Presence (แสดงรายชื่อผู้ใช้ที่ออนไลน์)
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
    
    // เริ่มตรวจสอบสุขภาพอุปกรณ์เมื่อ login สำเร็จ
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
    const currentUser = sessionStorage.getItem('currentUser');
    
    // 1. ป้องกันการลบตัวเอง
    if (username === currentUser) {
        alert("❌ ไม่สามารถลบตัวเองได้ขณะที่กำลังใช้งานระบบอยู่");
        return;
    }

    try {
        const snapshot = await window.get(window.ref(window.db, `users`));
        if (!snapshot.exists()) return;
        
        const users = snapshot.val();
        
        // 2. ป้องกันการลบ Admin คนสุดท้าย
        if (users[username] && users[username].role === 'admin') {
            const admins = Object.entries(users).filter(([_, data]) => data.role === 'admin');
            
            if (admins.length <= 1) {
                alert("❌ ไม่สามารถลบได้: ระบบจำเป็นต้องมีบัญชี Admin อย่างน้อย 1 บัญชีเพื่อจัดการระบบ");
                return;
            }
        }

        // 3. ยืนยันการลบ
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
//   🔹 7.1: เปิด Device Manager
//   🔹 7.2: ปิด Device Manager
//   🔹 7.3: ฟังก์ชัน toggleDevice
//   🔹 7.4: ฟังก์ชัน deleteDevice
//   🔹 7.5: ฟังก์ชัน resetDeviceForm
//   🔹 7.6: ฟังก์ชัน handleEditClick
// ==========================================

window.openDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'flex';
        renderDeviceTable();
        renderBoardTable();
        
        // 🔹 7.1.1: รีเซ็ตฟอร์มเมื่อเปิด
        resetDeviceForm();
    }
};

window.closeDeviceManager = function() {
    const modal = document.getElementById('deviceModal');
    if (modal) {
        modal.style.display = 'none';
        resetDeviceForm();
    }
};

// 🔹 7.3: ฟังก์ชัน toggleDevice (เปิด/ปิด)
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

// 🔹 7.4: ฟังก์ชัน deleteDevice
window.deleteDevice = async function(id) {
    if(confirm(`⚠️ ยืนยันการลบอุปกรณ์ ${id} ออกจากระบบถาวร? (ประวัติข้อมูลของอุปกรณ์นี้อาจแสดงผลผิดพลาดได้)`)) {
        try {
            await window.remove(window.ref(window.db, `device_configs/${id}`));
            renderDeviceTable();
            renderBoardTable();
            renderSensorCards();
            updateChartStructure();
            updateStandaloneAlertPanel();
            renderSummaryTable(); // เพิ่มเพื่ออัปเดตตารางสรุป
        } catch(e) { 
            console.error("❌ deleteDevice error:", e);
            alert("❌ ลบไม่สำเร็จ: " + e.message);
        }
    }
};

// 🔹 7.5: ฟังก์ชันรีเซ็ตฟอร์ม
function resetDeviceForm() {
    document.getElementById('devId').value = '';
    document.getElementById('devId').readOnly = false;
    document.getElementById('devName').value = '';
    document.getElementById('devUnit').value = '';
    document.getElementById('devBankLevel').value = '';
    document.getElementById('devBottomLevel').value = '';
    document.getElementById('devWarningLevel').value = '';
    document.getElementById('devTypeCustom').value = '';
    document.getElementById('thr_label_1').value = '';
    document.getElementById('thr_val_1').value = '';
    document.getElementById('thr_label_2').value = '';
    document.getElementById('thr_val_2').value = '';
    
    // รีเซ็ต checkbox alertEnabled
    const alertCheckbox = document.getElementById('devAlertEnabled');
    if (alertCheckbox) alertCheckbox.checked = true;
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveDeviceWithCustomType()');
    }
}

// ==========================================
// 📋 หัวข้อหลักที่ 7.1.1: ฟังก์ชัน handleEditClick
//   🔹 แก้ไขปัญหา onclick ไม่ทำงานเนื่องจากอักขระพิเศษ
// ==========================================

window.handleEditClick = function(id) {
    const config = deviceConfigs[id];
    if (!config) {
        alert("ไม่พบข้อมูลอุปกรณ์");
        return;
    }
    
    // เรียกใช้ฟังก์ชันเดิม แต่ดึงข้อมูลจาก object deviceConfigs โดยตรง
    // วิธีนี้ปลอดภัยกว่าการส่งผ่าน HTML string
    loadDeviceForEditWithCustomType(
        id, 
        config.name, 
        config.type, 
        config.unit || '', 
        config.bankLevel || '', 
        config.bottomLevel || '', 
        config.warningLevel || '', 
        config.thresholds || {}
    );
};


// ==========================================
// ⚙️ หัวข้อหลักที่ 7.1: renderDeviceTable - แสดงตารางอุปกรณ์
//   🔹 7.1.1: ปรับปรุงปุ่มแก้ไขให้ใช้ handleEditClick
//   🔹 7.1.2: เพิ่มคอลัมน์เกณฑ์แจ้งเตือน
//   🔹 7.1.3: เพิ่มคอลัมน์สถานะการแจ้งเตือน
// ==========================================

function renderDeviceTable() {
    const tbody = document.getElementById('deviceTableBody');
    if (!tbody) return;
    
    // กรองเฉพาะเซนเซอร์ (ไม่รวมบอร์ด)
    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');
    
    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px; color:#64748b;">📭 ยังไม่มีข้อมูลเซนเซอร์ กรุณาเพิ่มเซนเซอร์ด้านบน</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    for (const [id, config] of sensors) {
        const tr = document.createElement('tr');
        
        // แสดงชนิดเซนเซอร์ (รองรับ Custom Type)
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
        
        // แสดงค่า thresholds (เกณฑ์แจ้งเตือนแบบอิสระ)
        const thresholds = config.thresholds || {};
        let thresholdDisplay = '-';
        if (Object.keys(thresholds).length > 0) {
            thresholdDisplay = Object.entries(thresholds)
                .map(([label, val]) => `${label}: ${val}`)
                .join(', ');
        }
        
        // แสดงสถานะการแจ้งเตือน
        const alertStatus = config.alertEnabled !== false ? '🟢 เปิด' : '🔴 ปิด';
        const alertColor = config.alertEnabled !== false ? '#4caf50' : '#d32f2f';
        
        const bankVal = config.bankLevel !== undefined ? config.bankLevel : '-';
        const bottomVal = config.bottomLevel !== undefined ? config.bottomLevel : '-';
        const warningVal = config.warningLevel !== undefined ? config.warningLevel : '-';
        
        // 🔹 7.1.1: ปรับปรุงปุ่มแก้ไขให้ใช้ handleEditClick แทนการส่งค่าทั้งหมดผ่าน onclick
        tr.innerHTML = `
            <td data-label="ID"><strong style="color:#1b5e20; font-family: monospace;">${escapeHtml(id)}</strong></td>
            <td data-label="ชื่อจุดติดตั้ง"><strong>📛 ${escapeHtml(config.name)}</strong></td>
            <td data-label="ชนิดเซนเซอร์">${typeDisplay}</td>
            <td data-label="ระดับตลิ่ง/ก้น/เตือน">${bankVal}/${bottomVal}/${warningVal}</td>
            <td data-label="เกณฑ์แจ้งเตือน"><span style="background: #e8f5e9; padding: 4px 8px; border-radius: 12px; font-size: 0.75rem; color:#1b5e20;">${thresholdDisplay}</span></td>
            <td data-label="การแจ้งเตือน"><span style="color:${alertColor}; font-weight:bold;">${alertStatus}</span></td>
            <td data-label="จัดการ">
                <button class="btn-small edit-btn" 
                        style="background:#ffa726; margin-right:8px;"
                        onclick="handleEditClick('${id}')">✏️ แก้ไข</button>
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
        // บันทึกข้อมูลบอร์ดลง Firebase พร้อม type: "board"
        await window.set(window.ref(window.db, `device_configs/${deviceId}`), {
            name: "อุปกรณ์ " + deviceId,
            type: "board",
            enabled: true,
            ssid: ssid,
            status: "online",
            bankLevel: 0,
            bottomLevel: 0,
            warningLevel: 0,
            alert_count: 0,
            is_acknowledged: false,
            alertEnabled: false,
            last_alert_time: null,
            updatedAt: window.serverTimestamp()
        });
        alert("✅ ติดตั้งและบันทึกข้อมูลเรียบร้อย!");
        renderDeviceTable();
        renderBoardTable();
        renderSummaryTable(); // เพิ่มเพื่ออัปเดตตารางสรุป
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
        // ข้ามอุปกรณ์ที่เป็นบอร์ด (type === 'board') ไม่แสดงใน Sensor Grid
        if (config.type === 'board') continue;
        hasEnabledDevice = true;
        const val = currentSensorValues[id] !== undefined ? currentSensorValues[id] : '--';
        const timeStr = new Date().toLocaleTimeString();
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';
        
        // แสดงสถานะน้ำล้นตลิ่งบน Sensor Card
        const alertStatus = floodAlertStatus[id] || 'normal';
        let alertBadge = '';
        if (config.type === 'ultrasonic' && alertStatus === 'flood') {
            alertBadge = `<div class="alert-badge flood" style="background: #d32f2f; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center; animation: alertPulse 1.5s infinite;">⚠️ น้ำล้นตลิ่ง!</div>`;
        } else if (config.type === 'ultrasonic' && alertStatus === 'warning') {
            alertBadge = `<div class="alert-badge warning" style="background: #f57c00; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: bold; margin-top: 8px; text-align: center;">⚠️ ระดับน้ำใกล้ตลิ่ง</div>`;
        }
        
        // แสดงค่าระดับตลิ่งและก้นบ่อใน Sensor Card
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
    
    // 🔹 เพิ่ม: อัปเดตตารางสรุปสถานะ
    renderSummaryTable();
}

// ==========================================
// 📋 หัวข้อหลักที่ 10.4: ตารางสรุปสถานะการแจ้งเตือน (หน้าแรก)
//   🔹 10.4.1: renderSummaryTable - แสดงตารางสรุป
//   🔹 10.4.2: toggleAlertEnabled - เปิด/ปิดการแจ้งเตือนจากหน้าแรก
// ==========================================

// 🔹 10.4.1: renderSummaryTable - แสดงตารางสรุปสถานะ
function renderSummaryTable() {
    const tbody = document.getElementById('summaryTableBody');
    if (!tbody) return;
    
    const sensors = Object.entries(deviceConfigs).filter(([id, config]) => config.type !== 'board');
    
    if (sensors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">📭 ยังไม่มีอุปกรณ์ที่กำหนดค่า</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    sensors.forEach(([id, config]) => {
        const isAlertEnabled = config.alertEnabled !== false;
        const tr = document.createElement('tr');
        
        // ไอคอนตามชนิดเซนเซอร์
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';
        
        // แสดงชนิดเซนเซอร์แบบอ่านง่าย
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
                <span style="font-weight: bold; color: ${isAlertEnabled ? '#4caf50' : '#ef4444'};">
                    ${isAlertEnabled ? '🟢 เปิดใช้งาน' : '🔴 ปิดใช้งาน'}
                </span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #334155; text-align: center;">
                <button class="toggle-alert-btn ${isAlertEnabled ? 'active' : ''}"
                        onclick="toggleAlertEnabled('${id}')">
                    ${isAlertEnabled ? '🔇 ปิดการแจ้งเตือน' : '🔊 เปิดการแจ้งเตือน'}
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 🔹 10.4.2: toggleAlertEnabled - เปิด/ปิดการแจ้งเตือนจากหน้าแรก
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
            
            // รีเซ็ตสถานะการแจ้งเตือนเมื่อเปิดใช้งานอีกครั้ง
            if (newStatus) {
                await window.update(window.ref(window.db, `device_configs/${id}`), {
                    alert_count: 0,
                    is_acknowledged: false,
                    last_alert_time: null
                });
            }
            
            console.log(`✅ ${actionText}การแจ้งเตือนของอุปกรณ์ ${id} สำเร็จ`);
            
            // อัปเดต UI ทั้งหมด
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
        if (config.type === 'board') return;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const color = colors[index % colors.length];
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        datasets.push({ label: `${config.name} (${config.unit})`, data: sensorHistory.data[id], borderColor: color, backgroundColor: color + '33', tension: 0.1, fill: true });
    });
    chart.data.datasets = datasets;
    chart.update();
}

// ฟังก์ชันตรวจสอบสถานะน้ำล้นตลิ่ง
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

// processNewData - ประมวลผลข้อมูลใหม่
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
        
        // ตรวจสอบสถานะน้ำล้นตลิ่ง
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
        
        // ตรวจจับการกลับมาออนไลน์และรีเซ็ตสถานะการเตือน
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
        updateStandaloneAlertPanel();
        if (document.getElementById('deviceModal').style.display === 'flex') {
            renderDeviceTable();
            renderBoardTable();
        }
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
    
    // เรียก updateStandaloneAlertPanel ครั้งแรก
    setTimeout(() => {
        updateStandaloneAlertPanel();
    }, 1000);
}


// ==========================================
// 📋 หัวข้อหลักที่ 11: ระบบจัดการบอร์ดและเซนเซอร์แยก
//   🔹 11.1: renderBoardTable - แสดงตารางบอร์ด
//   🔹 11.2: filterBoardTable - ค้นหาบอร์ด
//   🔹 11.3: filterSensorTable - ค้นหาเซนเซอร์
// ==========================================

// 🔹 11.1: renderBoardTable - แสดงตารางบอร์ด
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
                <button onclick="deleteDevice('${escapeHtml(id)}')" 
                        class="danger" style="background:#d32f2f; color:white; 
                        border:none; padding:6px 14px; border-radius:20px; cursor:pointer;">
                    🗑️ ลบ
                </button>
            </td>
        `;
        boardTbody.appendChild(tr);
    });
}

// 🔹 11.2: filterBoardTable - ค้นหาบอร์ด
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

// 🔹 11.3: filterSensorTable - ค้นหาเซนเซอร์
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
// 💬 หัวข้อหลักที่ 12: ระบบ Telegram (Manual & Auto Text Report)
// ==========================================

// ฟังก์ชันส่งข้อความจริง (ใช้ร่วมกันทั้ง Auto และ Manual)
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

// ฟังก์ชันสำหรับ "ส่งเองทันที"
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

// ฟังก์ชันสำหรับระบบอัตโนมัติ (ส่งรายงานประจำวัน)
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

// จัดการรายชื่อผู้รับ
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

async function renderHistoryTable() {
    const snap = await window.get(window.ref(window.db, 'settings/telegram/history'));
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (snap.exists()) {
        const history = Object.entries(snap.val()).reverse();
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


// ==========================================
// 🛠️ หัวข้อหลักที่ 13: ระบบตั้งค่าการบันทึก & สำรองข้อมูล
// ==========================================

window.openSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('logInterval').value = currentIntervalMinutes;
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


// ==========================================
// 📋 หัวข้อหลักที่ 14: ระบบแจ้งเตือนอุปกรณ์ออฟไลน์อัตโนมัติ 3 ครั้ง (พร้อม alertEnabled)
//   🔹 14.1: monitorDeviceHealth - ตรวจสอบสุขภาพอุปกรณ์
//   🔹 14.2: acknowledgeAlert - รับทราบการแจ้งเตือน
//   🔹 14.3: startDeviceHealthMonitor - เริ่มต้นการตรวจสอบ
//   🔹 14.4: resetDeviceAlertStatus - รีเซ็ตสถานะการเตือน
// ==========================================

// 🔹 14.1: monitorDeviceHealth - ตรวจสอบสุขภาพอุปกรณ์
async function monitorDeviceHealth() {
    const now = Date.now();
    const devicesRef = window.ref(window.db, 'device_configs');
    const snapshot = await window.get(devicesRef);
    
    if (!snapshot.exists()) return;
    const devices = snapshot.val();

    for (const [id, config] of Object.entries(devices)) {
        // ข้ามอุปกรณ์ที่ปิดการแจ้งเตือน
        if (config.alertEnabled === false) continue;
        if (!config.enabled) continue;
        if (config.is_acknowledged === true) continue;
        if (config.type === 'board') continue;
        
        const lastSeenTime = config.lastSeen ? new Date(config.lastSeen).getTime() : 0;
        const isOffline = (now - lastSeenTime) > 180000; // 3 นาที
        
        if (isOffline) {
            const count = config.alert_count || 0;
            const lastTime = config.last_alert_time || 0;
            
            // ส่งแจ้งเตือน 3 ครั้ง
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
    
    // อัปเดต Standalone Alert Panel
    updateStandaloneAlertPanel();
}

// 🔹 14.2: acknowledgeAlert - รับทราบการแจ้งเตือน
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
        renderSummaryTable(); // เพิ่มเพื่ออัปเดตตารางสรุป
    } catch (error) {
        console.error("❌ รับทราบการแจ้งเตือนไม่สำเร็จ:", error);
        alert("❌ รับทราบการแจ้งเตือนไม่สำเร็จ: " + error.message);
    }
};

// 🔹 14.3: startDeviceHealthMonitor - เริ่มต้นการตรวจสอบอุปกรณ์
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
        } catch (error) {
            console.error("❌ deviceHealthMonitor error:", error);
        }
    }, 30000);
    
    console.log("✅ เริ่มระบบตรวจสอบสุขภาพอุปกรณ์อัตโนมัติ (ตรวจสอบทุก 30 วินาที)");
}

// 🔹 14.4: resetDeviceAlertStatus - รีเซ็ตสถานะการเตือนเมื่ออุปกรณ์กลับมาออนไลน์
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
                renderSummaryTable(); // เพิ่มเพื่ออัปเดตตารางสรุป
            }
        }
    } catch (error) {
        console.error(`❌ รีเซ็ตสถานะอุปกรณ์ ${id} ไม่สำเร็จ:`, error);
    }
}


// ==========================================
// 📋 หัวข้อหลักที่ 15: ระบบ Custom Type และเกณฑ์การแจ้งเตือนแบบอิสระ
//   🔹 15.1: updateDynamicFields - จัดการฟิลด์ Dynamic
//   🔹 15.2: updateCustomTypeVisibility - แสดง/ซ่อน Custom Type
//   🔹 15.3: saveDeviceWithCustomType - บันทึกอุปกรณ์
//   🔹 15.4: loadDeviceForEditWithCustomType - โหลดข้อมูลสำหรับแก้ไข
//   🔹 15.5: monitorDeviceHealthWithCustomThresholds - ตรวจสอบเกณฑ์ Custom
//   🔹 15.6: initCustomTypeFields - เริ่มต้นฟิลด์ Custom Type
//   🔹 15.7: integrateCustomTypeMonitor - รวมระบบตรวจสอบ
// ==========================================

// 🔹 15.1: updateDynamicFields - จัดการฟิลด์ Dynamic สำหรับเกณฑ์การแจ้งเตือนแบบอิสระ
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

// 🔹 15.2: updateCustomTypeVisibility - แสดง/ซ่อนช่องกรอกชนิดเซนเซอร์แบบกำหนดเอง
window.updateCustomTypeVisibility = function() {
    const type = document.getElementById('devType').value;
    const customContainer = document.getElementById('customTypeContainer');
    if (customContainer) {
        customContainer.style.display = (type === 'other') ? 'block' : 'none';
    }
};

// 🔹 15.3: saveDeviceWithCustomType - บันทึกอุปกรณ์พร้อมชนิดเซนเซอร์แบบกำหนดเอง
window.saveDeviceWithCustomType = async function(isEdit = false) {
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
    
    const bankLevel = parseFloat(document.getElementById('devBankLevel').value.trim()) || 0;
    const bottomLevel = parseFloat(document.getElementById('devBottomLevel').value.trim()) || 0;
    const warningLevel = parseFloat(document.getElementById('devWarningLevel').value.trim()) || 0;
    
    const alertEnabledCheckbox = document.getElementById('devAlertEnabled');
    const alertEnabled = alertEnabledCheckbox ? alertEnabledCheckbox.checked : true;
    
    const label1 = document.getElementById('thr_label_1')?.value?.trim() || '';
    const val1 = parseFloat(document.getElementById('thr_val_1')?.value) || 0;
    const label2 = document.getElementById('thr_label_2')?.value?.trim() || '';
    const val2 = parseFloat(document.getElementById('thr_val_2')?.value) || 0;
    
    const thresholds = {};
    if (label1 && val1 > 0) thresholds[label1] = val1;
    if (label2 && val2 > 0) thresholds[label2] = val2;
    
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
            bankLevel: bankLevel,
            bottomLevel: bottomLevel,
            warningLevel: warningLevel,
            thresholds: thresholds,
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
        
        const thresholdMsg = Object.keys(thresholds).length > 0 
            ? `พร้อมเกณฑ์: ${Object.keys(thresholds).join(', ')}` 
            : 'ไม่มีเกณฑ์การแจ้งเตือน';
        alert(`✅ ${isEdit ? 'อัปเดต' : 'เพิ่ม'}อุปกรณ์ ${id} สำเร็จ (ชนิด: ${type}) ${thresholdMsg} [แจ้งเตือน: ${alertEnabled ? 'เปิด' : 'ปิด'}]`);
        
        closeDeviceManager();
        renderDeviceTable();
        renderBoardTable();
        renderSensorCards();
        updateChartStructure();
        updateStandaloneAlertPanel();
        renderSummaryTable(); // เพิ่มเพื่ออัปเดตตารางสรุป
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
    }
};

// 🔹 15.4: loadDeviceForEditWithCustomType - โหลดข้อมูลอุปกรณ์สำหรับแก้ไข
window.loadDeviceForEditWithCustomType = function(id, name, type, unit, bankLevel = '', bottomLevel = '', warningLevel = '', thresholds = {}) {
    const config = deviceConfigs[id] || {};
    
    document.getElementById('devId').value = id;
    document.getElementById('devId').readOnly = true;
    document.getElementById('devName').value = name;
    document.getElementById('devUnit').value = unit;
    document.getElementById('devBankLevel').value = bankLevel;
    document.getElementById('devBottomLevel').value = bottomLevel;
    document.getElementById('devWarningLevel').value = warningLevel;
    
    const alertEnabledCheckbox = document.getElementById('devAlertEnabled');
    if (alertEnabledCheckbox) {
        alertEnabledCheckbox.checked = (config.alertEnabled !== false);
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
    
    const thresholdKeys = Object.keys(thresholds);
    if (thresholdKeys.length > 0) {
        const label1 = document.getElementById('thr_label_1');
        const val1 = document.getElementById('thr_val_1');
        const label2 = document.getElementById('thr_label_2');
        const val2 = document.getElementById('thr_val_2');
        
        if (label1 && val1 && thresholdKeys.length >= 1) {
            label1.value = thresholdKeys[0];
            val1.value = thresholds[thresholdKeys[0]];
        }
        if (label2 && val2 && thresholdKeys.length >= 2) {
            label2.value = thresholdKeys[1];
            val2.value = thresholds[thresholdKeys[1]];
        }
    }
    
    const saveBtn = document.querySelector('#deviceModal .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 อัปเดตข้อมูล';
        saveBtn.setAttribute('onclick', 'saveDeviceWithCustomType(true)');
    }
};

// 🔹 15.5: monitorDeviceHealthWithCustomThresholds - ตรวจสอบการแจ้งเตือนแบบอิสระ
async function monitorDeviceHealthWithCustomThresholds() {
    try {
        const now = Date.now();
        const devicesRef = window.ref(window.db, 'device_configs');
        const snapshot = await window.get(devicesRef);
        
        if (!snapshot.exists()) return;
        const devices = snapshot.val();
        
        for (const [id, config] of Object.entries(devices)) {
            if (config.alertEnabled === false) continue;
            if (!config.enabled) continue;
            if (config.type === 'board') continue;
            if (config.is_acknowledged === true) continue;
            
            const thresholds = config.thresholds || {};
            const currentValue = currentSensorValues[id];
            
            if (currentValue === undefined || currentValue === null) continue;
            if (Object.keys(thresholds).length === 0) continue;
            
            for (const [label, limit] of Object.entries(thresholds)) {
                if (label && !isNaN(limit) && limit > 0) {
                    if (currentValue >= limit) {
                        const count = config.alert_count || 0;
                        const lastTime = config.last_alert_time || 0;
                        
                        let shouldAlert = false;
                        if (count === 0) shouldAlert = true;
                        else if (count === 1 && (now - lastTime) >= 300000) shouldAlert = true;
                        else if (count === 2 && (now - lastTime) >= 600000) shouldAlert = true;
                        
                        if (shouldAlert && count < 3) {
                            const message = `🚨 <b>แจ้งเตือนค่าผิดปกติ!</b>\n📛 อุปกรณ์: ${config.name}\n🆔 ID: ${id}\n📊 เกณฑ์: ${label}\n📈 ค่าปัจจุบัน: ${currentValue} ${config.unit || ''}\n⚠️ ค่าเกิน: ${limit} ${config.unit || ''}\n🔢 ครั้งที่: ${count + 1}/3\n⏱️ เวลา: ${new Date().toLocaleString('th-TH')}`;
                            
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
                            
                            console.log(`🔔 ส่งการแจ้งเตือน ${id} (${label}) ครั้งที่ ${count + 1}/3`);
                        }
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error("❌ monitorDeviceHealthWithCustomThresholds error:", error);
    }
    
    updateStandaloneAlertPanel();
}

// 🔹 15.6: initCustomTypeFields - เริ่มต้นฟิลด์ Custom Type
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
        saveBtn.setAttribute('onclick', 'saveDeviceWithCustomType()');
    }
}

// 🔹 15.7: integrateCustomTypeMonitor - รวมระบบตรวจสอบ Custom Thresholds
function integrateCustomTypeMonitor() {
    const originalMonitor = window.monitorDeviceHealth;
    
    window.monitorDeviceHealth = async function() {
        try {
            if (typeof originalMonitor === 'function') {
                await originalMonitor();
            }
            await monitorDeviceHealthWithCustomThresholds();
        } catch (error) {
            console.error("❌ monitorDeviceHealth error:", error);
        }
    };
}

// 🔹 15.8: initCustomTypeSystem - เริ่มต้นระบบ Custom Type
function initCustomTypeSystem() {
    console.log("🔄 กำลังเริ่มต้นระบบ Custom Type...");
    initCustomTypeFields();
    integrateCustomTypeMonitor();
    setTimeout(() => {
        updateDynamicFields();
    }, 100);
    console.log("✅ ระบบ Custom Type เริ่มต้นเรียบร้อย");
}


// ==========================================
// 📋 หัวข้อหลักที่ 16: Standalone Alert Panel
//   🔹 16.1: updateStandaloneAlertPanel - อัปเดต Alert Panel
//   🔹 16.2: createStandaloneAlertPanelIfNotExists - สร้าง Alert Panel
// ==========================================

// 🔹 16.1: updateStandaloneAlertPanel - อัปเดต Alert Panel
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

// 🔹 16.2: createStandaloneAlertPanelIfNotExists - สร้าง Alert Panel
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
// 📋 หัวข้อหลักที่ 17: การโหลดข้อมูลเริ่มต้น (Initialization)
//   🔹 17.1: checkAutoLogin - ตรวจสอบการ login อัตโนมัติ
//   🔹 17.2: initReportTypeSelector - เริ่มต้น UI เลือกรูปแบบรายงาน
//   🔹 17.3: showReportButtonForAll - แสดงปุ่มส่งรายงาน
// ==========================================

// 🔹 17.1: checkAutoLogin - ตรวจสอบการ login อัตโนมัติจาก localStorage
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

// 🔹 17.2: initReportTypeSelector - เริ่มต้น UI สำหรับเลือกรูปแบบรายงาน
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

// 🔹 17.3: showReportButtonForAll - แสดงปุ่มส่งรายงานให้ทุกคนเห็น
function showReportButtonForAll() {
    const userActions = document.getElementById('userActions');
    if (userActions) {
        userActions.style.display = 'block';
    }
}


// ==========================================
// 🚀 หัวข้อหลักที่ 18: DOMContentLoaded - จุดเริ่มต้นหลักของระบบ
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 กำลังเริ่มต้นระบบ...");
    
    // 1. เริ่มต้นการเชื่อมต่อ Firebase
    if (window.db) {
        initFirebaseListeners();
    }
    
    // 2. เริ่มต้นการตั้งค่าการบันทึกอัตโนมัติ
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
    
    // 3. ตรวจสอบการ login อัตโนมัติ
    checkAutoLogin();
    
    // 4. เริ่มต้น UI สำหรับเลือกรูปแบบรายงาน
    initReportTypeSelector();
    
    // 5. แสดงปุ่มส่งรายงานให้ทุกคนเห็น
    showReportButtonForAll();
    
    // 6. เริ่มต้น Chart
    initChart();
    
    // 7. สร้าง Standalone Alert Panel ถ้ายังไม่มี
    createStandaloneAlertPanelIfNotExists();
    
    // 8. เริ่มต้นระบบ Custom Type
    initCustomTypeSystem();
    
    console.log("✅ ระบบพร้อมทำงาน (เวอร์ชันสมบูรณ์)");
});
// ฟังก์ชันสำหรับเปิด/ปิดตารางสรุปสถานะ
window.toggleSummaryTable = function() {
    const tableWrapper = document.getElementById('summaryTableWrapper');
    const btnText = document.getElementById('btnText');
    const btnIcon = document.getElementById('btnIcon');
    
    if (tableWrapper.style.display === 'none') {
        // กรณีซ่อนอยู่ ให้เปลี่ยนเป็นแสดง
        tableWrapper.style.display = 'block';
        btnText.textContent = 'ซ่อนตาราง';
        btnIcon.textContent = '🔼';
    } else {
        // กรณีแสดงอยู่ ให้เปลี่ยนเป็นซ่อน
        tableWrapper.style.display = 'none';
        btnText.textContent = 'แสดงตาราง';
        btnIcon.textContent = '🔽';
    }
};