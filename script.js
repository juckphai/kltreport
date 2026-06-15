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

// ==========================================
// 🏷️ หัวข้อหลักที่ 2: ระบบจัดการชื่อโครงการ (Project Title Management) - เพิ่มจากไฟล์ 17
// ==========================================

/**
 * หัวข้อย่อย 2.1: ฟังก์ชันดึงชื่อโครงการจาก Firebase และแสดงผล
 * ทำงานร่วมกับ Firebase Real-time Database ที่ path: settings/project_title
 */
function initTitleListener() {
    if (!window.db) return;
    
    const titleRef = window.ref(window.db, 'settings/project_title');
    window.onValue(titleRef, (snapshot) => {
        const titleEl = document.getElementById('projectTitle');
        if (!titleEl) return;
        
        const title = snapshot.exists() ? snapshot.val() : "หน้าจอจัดการและรายงานโครงการ(น้องโค้ก)";
        titleEl.textContent = title;
        
        // แสดงปุ่มแก้ไขเฉพาะ Admin (อ่านค่าจาก sessionStorage)
        const activeRole = sessionStorage.getItem('activeRole');
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) {
            editBtn.style.display = (activeRole === 'admin') ? 'block' : 'none';
        }
    });
}

/**
 * หัวข้อย่อย 2.2: ฟังก์ชันเปิด Modal สำหรับแก้ไขชื่อโครงการ
 */
window.openTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    const titleEl = document.getElementById('projectTitle');
    const inputField = document.getElementById('newProjectTitle');
    
    if (modal && titleEl && inputField) {
        modal.style.display = 'flex';
        inputField.value = titleEl.textContent;
    }
};

/**
 * หัวข้อย่อย 2.3: ฟังก์ชันปิด Modal แก้ไขชื่อโครงการ
 */
window.closeTitleEditor = function() {
    const modal = document.getElementById('titleModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * หัวข้อย่อย 2.4: ฟังก์ชันบันทึกชื่อโครงการลง Firebase
 */
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

/**
 * หัวข้อย่อย 2.5: ฟังก์ชันลบชื่อโครงการ (ตั้งค่าเป็นค่าว่าง หรือค่าเริ่มต้น)
 */
window.deleteProjectTitle = async function() {
    if (confirm("ยืนยันการลบชื่อโครงการ? (จะกลับสู่ค่าเริ่มต้น)")) {
        try {
            // ลบข้อมูลออกจาก Firebase
            await window.remove(window.ref(window.db, 'settings/project_title'));
            closeTitleEditor();
            alert("✅ ลบชื่อโครงการสำเร็จ (กลับสู่ค่าเริ่มต้น)");
        } catch (e) {
            alert("❌ ลบไม่สำเร็จ: " + e.message);
        }
    }
};

// ==========================================
// 👥 หัวข้อหลักที่ 3: ระบบ Presence (แสดงรายชื่อผู้ใช้ที่ออนไลน์) - เพิ่มจากไฟล์ 17
// ==========================================

/**
 * หัวข้อย่อย 3.1: ฟังก์ชันอัปเดตสถานะออนไลน์ของผู้ใช้
 * @param {string} username - ชื่อผู้ใช้
 * @param {string} role - สิทธิ์ของผู้ใช้ (admin/user)
 */
/**
 * หัวข้อย่อย 3.1: ฟังก์ชันอัปเดตสถานะออนไลน์ของผู้ใช้
 * เพิ่ม setInterval เพื่ออัปเดต lastSeen ทุก 30 วินาที
 */
function updatePresence(username, role) {
    if (!window.db || !username) return;
    
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    
    // ตั้งค่าสถานะเริ่มต้น
    window.set(presenceRef, {
        role: role,
        loginAt: window.serverTimestamp(),
        lastSeen: new Date().toISOString()
    }).catch(err => console.warn("⚠️ updatePresence set error:", err));

    // ฟังสถานะการเชื่อมต่อ Firebase
    window.onValue(window.ref(window.db, '.info/connected'), (snap) => {
        if (snap.val() === true) {
            // ใช้ onDisconnect เพื่อลบข้อมูลเมื่อผู้ใช้ปิดหน้าเว็บหรือเน็ตตัด
            const onDisconnectRef = window.ref(window.db, 'online_users/' + username);
            onDisconnectRef.onDisconnect().remove().catch(err => console.warn("⚠️ onDisconnect error:", err));
        }
    });

    // 🚀 เพิ่มฟังก์ชันอัปเดต lastSeen ทุก 30 วินาที เพื่อป้องกันสถานะค้าง
    setInterval(() => {
        window.update(presenceRef, {
            lastSeen: new Date().toISOString()
        }).catch(err => console.warn("⚠️ lastSeen update error:", err));
    }, 30000); 
}

/**
 * หัวข้อย่อย 3.2: ฟังก์ชันลบสถานะออนไลน์เมื่อออกจากระบบ
 * @param {string} username - ชื่อผู้ใช้
 */
function removePresence(username) {
    if (!window.db || !username) return;
    const presenceRef = window.ref(window.db, 'online_users/' + username);
    window.remove(presenceRef).catch(err => console.warn("⚠️ removePresence error:", err));
}

 /**
 * หัวข้อย่อย 3.3: ฟังก์ชันแสดงรายชื่อผู้ใช้ที่ออนไลน์อยู่
 */
function initPresenceListener() {
    if (!window.db) return;
    
    const listRef = window.ref(window.db, 'online_users');
    window.onValue(listRef, (snapshot) => {
        const listEl = document.getElementById('onlineUsersList');
        if (!listEl) return;
        
        if (snapshot.exists()) {
            const users = snapshot.val();
            let html = '';
            let userCount = 0;
            const now = new Date().getTime();
            
            Object.keys(users).forEach(u => {
                // ตรวจสอบว่า lastSeen มีการอัปเดตล่าสุดไม่เกิน 2 นาที (120,000 ms) 
                // ถ้าเกินนี้ถือว่าค้างให้ข้ามไป
                const lastSeen = new Date(users[u].lastSeen).getTime();
                if (now - lastSeen < 120000) {
                    const roleIcon = users[u].role === 'admin' ? '👑' : '👤';
                    html += `<span style="display: inline-block; margin-right: 12px; margin-bottom: 5px;">🟢 ${roleIcon} ${u}</span>`;
                    userCount++;
                }
            });
            
            if (userCount > 0) {
                listEl.innerHTML = html;
                const badgeEl = document.getElementById('onlineCountBadge');
                if (badgeEl) badgeEl.textContent = ` (${userCount})`;
            } else {
                listEl.innerHTML = '<span style="font-size: 0.9em; opacity: 0.7;">ไม่มีผู้ใช้งานท่านอื่น</span>';
                const badgeEl = document.getElementById('onlineCountBadge');
                if (badgeEl) badgeEl.textContent = '';
            }
        } else {
            listEl.innerHTML = '<span style="font-size: 0.9em; opacity: 0.7;">ไม่มีผู้ใช้งานท่านอื่น</span>';
            const badgeEl = document.getElementById('onlineCountBadge');
            if (badgeEl) badgeEl.textContent = '';
        }
    });
}

// ==========================================
// 🔐 หัวข้อหลักที่ 4: ระบบ Login (ตรวจสอบจาก Firebase)
// ==========================================

/**
 * หัวข้อย่อย 4.1: สลับการแสดงรหัสผ่าน
 */
window.togglePassword = function() {
    const passInput = document.getElementById('password');
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
};

/**
 * หัวข้อย่อย 4.2: จัดการการเข้าสู่ระบบ (ตรวจสอบกับ Firebase)
 */
window.handleLogin = async function() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    const remember = document.getElementById('rememberMe').checked;

    if (!user || !pass) return alert('กรุณากรอกข้อมูลให้ครบ');

    try {
        if (!window.db) throw new Error('Firebase ไม่พร้อมใช้งาน');
        
        // ดึงข้อมูลผู้ใช้รายนี้จาก Firebase
        const userRef = window.ref(window.db, `users/${user}`);
        const snapshot = await window.get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            // ตรวจสอบรหัสผ่าน
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

/**
 * หัวข้อย่อย 4.3: เมื่อเข้าสู่ระบบสำเร็จ
 */
function loginSuccess(role, user, pass, remember) {
    sessionStorage.setItem('activeRole', role);
    sessionStorage.setItem('currentUser', user); 
    
    // จัดการ Remember Me
    if (remember) {
        localStorage.setItem('savedUsername', user);
        localStorage.setItem('savedPassword', pass);
        localStorage.setItem('rememberMe', 'true');
    } else {
        localStorage.removeItem('savedUsername');
        localStorage.removeItem('savedPassword');
        localStorage.removeItem('rememberMe');
    }
    
    applyRole(role);
    
    // เรียกใช้งานฟังก์ชันที่เกี่ยวข้อง
    updatePresence(user, role);
    initPresenceListener();
    initTitleListener();
}

/**
 * หัวข้อย่อย 4.4: กำหนดสิทธิ์และแสดง UI ตาม Role
 */
function applyRole(role) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('roleDisplay').textContent = role === 'admin' ? 'Admin' : 'User';
    
    if (role === 'admin') {
        document.getElementById('adminControls').classList.remove('role-hidden');
        // ✅ แสดงปุ่มแก้ไขชื่อโครงการ
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) editBtn.style.display = 'block';
    } else {
        document.getElementById('adminControls').classList.add('role-hidden');
        // ✅ ซ่อนปุ่มแก้ไขชื่อโครงการ
        const editBtn = document.getElementById('editTitleBtn');
        if (editBtn) editBtn.style.display = 'none';
    }
    
    // ✅ เพิ่มส่วนแสดงรายชื่อผู้ใช้ออนไลน์ลงในหน้า (ถ้ายังไม่มี)
    addOnlineUsersBox();
}

/**
 * หัวข้อย่อย 4.5: เพิ่มกล่องแสดงรายชื่อผู้ใช้ออนไลน์ลงในหน้า
 */
function addOnlineUsersBox() {
    // ตรวจสอบว่ามีอยู่แล้วหรือไม่
    if (document.getElementById('onlineUsersBox')) return;
    
    const container = document.querySelector('.container');
    if (!container) return;
    
    // หาตำแหน่งที่จะแทรก (อยู่ใต้ status-bar)
    const statusBar = document.querySelector('.status-bar');
    const onlineBox = document.createElement('div');
    onlineBox.id = 'onlineUsersBox';
    onlineBox.className = 'online-users-box';
    onlineBox.style.cssText = `
        background: rgba(0,0,0,0.3);
        border-radius: 12px;
        padding: 10px 15px;
        margin: 10px 0 20px 0;
        backdrop-filter: blur(5px);
    `;
    onlineBox.innerHTML = `
        <div class="online-users-container">
            <small style="color: #ddd;">🟢 ออนไลน์อยู่ตอนนี้<span id="onlineCountBadge"></span>:</small>
            <div id="onlineUsersList" style="margin-top: 8px; color: #fff; display: flex; flex-wrap: wrap; gap: 5px;">
                <span style="font-size: 0.9em; opacity: 0.7;">กำลังตรวจสอบสถานะ...</span>
            </div>
        </div>
    `;
    
    // แทรกใต้ status-bar
    if (statusBar && statusBar.parentNode) {
        statusBar.insertAdjacentElement('afterend', onlineBox);
    } else {
        container.insertBefore(onlineBox, container.firstChild);
    }
}

// ==========================================
// 🚪 หัวข้อหลักที่ 5: ระบบ Logout (พร้อมลบ Presence)
// ==========================================

/**
 * หัวข้อย่อย 5.1: ออกจากระบบ
 */
window.logout = async function() {
    const currentUser = sessionStorage.getItem('currentUser');
    
    // เคลียร์ข้อมูลในเครื่องทันที เพื่อป้องกันการล็อกอินซ้ำอัตโนมัติก่อนลบเสร็จ
    localStorage.removeItem('savedUsername');
    localStorage.removeItem('savedPassword');
    localStorage.removeItem('rememberMe');
    sessionStorage.clear();

    if (currentUser && window.db) {
        try {
            const presenceRef = window.ref(window.db, 'online_users/' + currentUser);
            
            // 1. ยกเลิก onDisconnect เพื่อไม่ให้มันทำงานค้างไว้
            await presenceRef.onDisconnect().cancel();
            
            // 2. ลบสถานะออนไลน์
            await window.remove(presenceRef);
            console.log("✅ ลบสถานะออนไลน์เรียบร้อย");
            
        } catch (err) {
            console.error("❌ ลบสถานะออนไลน์ไม่สำเร็จ:", err);
        }
    }
    
    // 3. รีโหลดหน้าเว็บเพื่อให้กลับสู่หน้า Login
    window.location.reload();
};

// ==========================================
// 👥 หัวข้อหลักที่ 6: ระบบจัดการผู้ใช้งาน (User Manager) พร้อมฟังก์ชันแก้ไข
// ==========================================

/**
 * หัวข้อย่อย 6.1: เปิด Modal จัดการผู้ใช้
 */
window.openUserManager = async function() {
    document.getElementById('userModal').style.display = 'flex';
    await renderUserTable();
};

/**
 * หัวข้อย่อย 6.2: ปิด Modal จัดการผู้ใช้
 */
window.closeUserManager = function() {
    document.getElementById('userModal').style.display = 'none';
    document.getElementById('manageUsername').value = '';
    document.getElementById('managePassword').value = '';
    document.getElementById('manageRole').value = 'user';
    // รีเซ็ตปุ่มกลับสู่สถานะปกติ
    const saveBtn = document.querySelector('.user-management-form .save-btn');
    if (saveBtn) {
        saveBtn.textContent = '💾 บันทึก';
        saveBtn.setAttribute('onclick', 'saveUser()');
    }
    document.getElementById('manageUsername').readOnly = false;
};

/**
 * หัวข้อย่อย 6.3: แก้ไขข้อมูลผู้ใช้
 */
window.editUser = function(username, password, role) {
    const userField = document.getElementById('manageUsername');
    userField.value = username;
    userField.readOnly = true; // ล็อกไม่ให้แก้ไขชื่อผู้ใช้
    
    document.getElementById('managePassword').value = password;
    document.getElementById('manageRole').value = role;
    
    // เปลี่ยนปุ่มเป็นโหมดอัปเดต
    const saveBtn = document.querySelector('.user-management-form .save-btn');
    saveBtn.textContent = '💾 อัปเดต';
    // ส่งค่า true เพื่อให้ทราบว่าเป็นโหมดอัปเดต
    saveBtn.setAttribute('onclick', 'saveUser(true)'); 
};

/**
 * หัวข้อย่อย 6.4: บันทึกหรืออัปเดตผู้ใช้
 */
window.saveUser = async function(isEdit = false) {
    const username = document.getElementById('manageUsername').value.trim();
    const password = document.getElementById('managePassword').value.trim();
    const role = document.getElementById('manageRole').value;

    if (!username || !password) return alert("กรุณากรอก Username และ Password");

    try {
        // ใช้การ update เพื่อเขียนทับเฉพาะข้อมูลที่ต้องการแก้ไข
        await window.update(window.ref(window.db, `users/${username}`), {
            password: password,
            role: role,
            updatedAt: new Date().toISOString()
        });
        
        alert(`✅ ${isEdit ? 'อัปเดต' : 'บันทึก'}ผู้ใช้ ${username} สำเร็จ`);
        
        // ปิด Modal และล้างฟอร์ม
        closeUserManager();
        // โหลดตารางใหม่
        await renderUserTable();
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกได้: " + error.message);
    }
};

/**
 * หัวข้อย่อย 6.5: ลบผู้ใช้
 */
window.deleteUser = async function(username) {
    if (confirm(`ลบผู้ใช้ ${username} ออกจากระบบ?`)) {
        try {
            // ✅ ถ้าลบผู้ใช้ ให้ลบสถานะออนไลน์ด้วย
            await window.remove(window.ref(window.db, `online_users/${username}`));
            await window.remove(window.ref(window.db, `users/${username}`));
            alert(`✅ ลบผู้ใช้ ${username} สำเร็จ`);
            await renderUserTable();
        } catch (error) {
            alert("❌ ลบไม่สำเร็จ: " + error.message);
        }
    }
};

/**
 * หัวข้อย่อย 6.6: แสดงตารางผู้ใช้
 */
async function renderUserTable() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">กำลังโหลด...</td></tr>';
    
    try {
        const snapshot = await window.get(window.ref(window.db, 'users'));
        if (snapshot.exists()) {
            const users = snapshot.val();
            tbody.innerHTML = '';
            for (const [username, userData] of Object.entries(users)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${username}</td>
                    <td>${userData.password || '****'}</td>
                    <td><span class="role-badge ${userData.role === 'admin' ? 'role-admin' : 'role-user'}">${userData.role === 'admin' ? '👑 Admin' : '👤 User'}</span></td>
                    <td>
                        <button onclick="editUser('${username}', '${userData.password}', '${userData.role}')" class="btn-small edit-btn" style="background:#2196F3; color:white; margin-right:5px;">✏️ แก้ไข</button>
                        <button onclick="deleteUser('${username}')" class="btn-small danger">🗑️ ลบ</button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">ไม่มีข้อมูลผู้ใช้</td></tr>';
        }
    } catch (error) {
        console.error("Error loading users:", error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">โหลดข้อมูลล้มเหลว</td></tr>';
    }
}

// ==========================================
// ⚙️ หัวข้อหลักที่ 7: ระบบจัดการอุปกรณ์เซนเซอร์ (Device Manager)
// ==========================================

/**
 * หัวข้อย่อย 7.1: เปิด Modal จัดการอุปกรณ์
 */
window.openDeviceManager = function() {
    document.getElementById('deviceModal').style.display = 'flex';
    renderDeviceTable();
};

/**
 * หัวข้อย่อย 7.2: ปิด Modal จัดการอุปกรณ์
 */
window.closeDeviceManager = function() {
    document.getElementById('deviceModal').style.display = 'none';
    document.getElementById('devId').value = '';
    document.getElementById('devName').value = '';
    document.getElementById('devUnit').value = '';
};

/**
 * หัวข้อย่อย 7.3: บันทึกอุปกรณ์เซนเซอร์
 */
window.saveDevice = async function() {
    const id = document.getElementById('devId').value.trim();
    const name = document.getElementById('devName').value.trim();
    const type = document.getElementById('devType').value;
    const unit = document.getElementById('devUnit').value.trim();

    if (!id || !name) return alert("กรุณากรอก ID และ ชื่อจุดติดตั้ง");
    // อัปเดตลง Firebase โดยค่าเริ่มต้นตั้งเป็น enabled: true
    try {
        await window.set(window.ref(window.db, `device_configs/${id}`), {
            name: name,
            type: type,
            unit: unit,
            enabled: true,
            updatedAt: new Date().toISOString()
        });
        alert(`✅ เพิ่มอุปกรณ์ ${id} สำเร็จ`);
        closeDeviceManager();
    } catch (error) {
        alert("❌ ไม่สามารถบันทึกอุปกรณ์ได้: " + error.message);
    }
};

/**
 * หัวข้อย่อย 7.4: สลับสถานะการทำงานของอุปกรณ์
 */
window.toggleDevice = async function(id, currentStatus) {
    try {
        await window.update(window.ref(window.db, `device_configs/${id}`), {
            enabled: !currentStatus
        });
    } catch(e) {
        console.error(e);
    }
};

/**
 * หัวข้อย่อย 7.5: ลบอุปกรณ์
 */
window.deleteDevice = async function(id) {
    if(confirm(`ลบอุปกรณ์ ${id} ออกจากระบบ? (ประวัติข้อมูลของอุปกรณ์นี้อาจแสดงผลผิดพลาดได้)`)) {
        try {
            await window.remove(window.ref(window.db, `device_configs/${id}`));
        } catch(e) {
            console.error(e);
        }
    }
};

/**
 * หัวข้อย่อย 7.6: แสดงตารางอุปกรณ์
 */
function renderDeviceTable() {
    const tbody = document.getElementById('deviceTableBody');
    tbody.innerHTML = '';
    
    if(Object.keys(deviceConfigs).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">ไม่มีข้อมูลอุปกรณ์</td></tr>';
        return;
    }

    for (const [id, config] of Object.entries(deviceConfigs)) {
        const tr = document.createElement('tr');
        const statusBadge = config.enabled 
            ? `<span class="status-badge status-on">เปิดใช้งาน</span>` 
            : `<span class="status-badge status-off">ปิดใช้งาน</span>`;
            
        const toggleBtnText = config.enabled ? 'ปิดการทำงาน' : 'เปิดการทำงาน';
        const toggleBtnClass = config.enabled ? 'btn-small danger' : 'btn-small edit-btn';

        tr.innerHTML = `
            <td><b>${id}</b></td>
            <td>${config.name}</td>
            <td>${config.type} <small>(${config.unit})</small></td>
            <td>${statusBadge}</td>
            <td>
                <button onclick="toggleDevice('${id}', ${config.enabled})" class="${toggleBtnClass}">${toggleBtnText}</button>
                <button onclick="deleteDevice('${id}')" class="btn-small danger" style="margin-left:5px;">🗑️</button>
             </td>
        `;
        tbody.appendChild(tr);
    }
}

// ==========================================
// 🔌 หัวข้อหลักที่ 8: ระบบ Provisioning ติดตั้งบอร์ดผ่าน USB (เพิ่มจากไฟล์ 18)
// ==========================================

/**
 * หัวข้อย่อย 8.1: ฟังก์ชันหลักที่รวมการเชื่อมต่อ USB และการบันทึกลง Firebase ไว้ด้วยกัน
 * ขั้นตอนการทำงาน:
 * 1. ค้นหาบอร์ดผ่าน Web Serial API
 * 2. รับข้อมูลจากผู้ใช้ (deviceId, WiFi SSID, Password)
 * 3. ส่งข้อมูล JSON ให้ ESP32 ผ่านสาย USB
 * 4. บันทึกอุปกรณ์ลง Firebase
 */
window.startProvisioningProcess = async function() {
    // 1. ตรวจสอบว่าเบราว์เซอร์รองรับ Web Serial API หรือไม่ (บังคับ HTTPS เท่านั้น)
    if (!("serial" in navigator)) {
        alert("❌ เบราว์เซอร์ของคุณไม่รองรับการติดตั้งผ่าน USB\nกรุณาใช้ Google Chrome หรือ Microsoft Edge และต้องใช้งานผ่าน HTTPS เท่านั้น");
        return;
    }

    try {
        // 2. ขออนุญาตเข้าถึงพอร์ต USB
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        // 3. แจ้งเตือนสถานะให้ผู้ใช้ทราบว่าเชื่อมต่อสำเร็จแล้ว
        alert("เชื่อมต่อสำเร็จ! กำลังเตรียมส่งข้อมูล WiFi ให้บอร์ด...");

        // 4. รับข้อมูลจากผู้ใช้
        const deviceId = prompt("ใส่ ID อุปกรณ์ (เช่น pond01):");
        const ssid = prompt("ชื่อ WiFi (SSID):");
        const pass = prompt("รหัสผ่าน WiFi:");

        if (!deviceId || !ssid) {
            alert("⚠️ ยกเลิกการติดตั้ง: ข้อมูล ID หรือ WiFi ไม่ครบถ้วน");
            await port.close();
            return;
        }

        // 5. ส่งข้อมูล JSON ให้ ESP32
        const writer = port.writable.getWriter();
        const configData = { device_id: deviceId, ssid: ssid, password: pass };
        
        // ส่งข้อมูลเป็น String พร้อมขึ้นบรรทัดใหม่
        const encoder = new TextEncoder();
        await writer.write(encoder.encode(JSON.stringify(configData) + "\n"));
        
        writer.releaseLock();
        await port.close();

        // 6. บันทึกลง Firebase
        await window.set(window.ref(window.db, `device_configs/${deviceId}`), {
            name: "อุปกรณ์ " + deviceId,
            type: "ultrasonic",
            enabled: true,
            ssid: ssid,
            status: "online",
            updatedAt: window.serverTimestamp()
        });

        alert("✅ ติดตั้งและบันทึกข้อมูลเรียบร้อย!");
        
        // โหลดตารางใหม่ใน Modal
        if (typeof renderDeviceTable === 'function') {
            renderDeviceTable();
        }

    } catch (error) {
        console.error("Provisioning Error:", error);
        
        if (error.name === 'NotFoundError') {
            alert("❌ ไม่พบพอร์ต USB: กรุณาตรวจสอบว่าเสียบสายและเลือกบอร์ดแล้ว");
        } else if (error.name === 'SecurityError') {
            alert("❌ สิทธิ์ไม่เพียงพอ: โปรดตรวจสอบว่าเว็บไซต์เป็น HTTPS");
        } else {
            alert("❌ การติดตั้งล้มเหลว: " + error.message);
        }
    }
};
// ==========================================
// 📊 หัวข้อหลักที่ 9: UI และ Chart Dynamic Rendering
// ==========================================

/**
 * หัวข้อย่อย 9.1: แสดงการ์ดเซนเซอร์
 */
function renderSensorCards() {
    const container = document.getElementById('sensorGridContainer');
    container.innerHTML = ''; 
    
    let hasEnabledDevice = false;

    for (const [id, config] of Object.entries(deviceConfigs)) {
        if (!config.enabled) continue; // ข้ามตัวที่ปิดใช้งาน
        hasEnabledDevice = true;

        const val = currentSensorValues[id] !== undefined ? currentSensorValues[id] : '--';
        const timeStr = new Date().toLocaleTimeString();

        // Icon ชั่วคราวตามประเภท
        const iconMap = { ultrasonic: '📡', soil: '🌱', rain: '🌧️', ph: '🧪', temp: '🌡️' };
        const icon = iconMap[config.type] || '🔍';

        const cardHTML = `
            <div class="sensor-card" id="card_${id}">
                <div class="sensor-title">${icon} ${config.name}</div>
                <div class="sensor-value">
                    <span id="val_${id}">${val}</span>
                    <span class="sensor-unit">${config.unit}</span>
                </div>
                <div class="timestamp" id="time_${id}">อัปเดต: ${val !== '--' ? timeStr : 'รอข้อมูล...'}</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    }

    if (!hasEnabledDevice) {
        container.innerHTML = '<div style="width:100%; text-align:center; color:#fff; grid-column: 1 / -1;">ไม่มีเซนเซอร์ที่เปิดใช้งาน กรุณาตั้งค่าใน "จัดการเซนเซอร์"</div>';
    }
}

/**
 * หัวข้อย่อย 9.2: เริ่มต้นกราฟ
 */
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

/**
 * หัวข้อย่อย 9.3: สร้างชุดข้อมูลของกราฟใหม่เมื่อมีการตั้งค่าอุปกรณ์เปลี่ยนไป
 */
function updateChartStructure() {
    if (!chart) return;
    const datasets = [];
    
    // สร้างเส้นกราฟเฉพาะเซนเซอร์ที่ Enable อยู่
    Object.keys(deviceConfigs).forEach((id, index) => {
        const config = deviceConfigs[id];
        if(!config.enabled) return;

        // สุ่มสี (หรือใช้สีประจำลำดับ)
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        const color = colors[index % colors.length];

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

/**
 * หัวข้อย่อย 9.4: อัปเดตข้อมูลลงกราฟและกล่องเมื่อมีค่าใหม่เข้ามา
 */
function processNewData(dataObj) {
    const timeNow = new Date();
    currentSensorValues = dataObj; // อัปเดตค่าปัจจุบันทั้งหมด
    
    sensorHistory.timestamps.push(timeNow.toLocaleTimeString());
    if(sensorHistory.timestamps.length > 100) sensorHistory.timestamps.shift();

    Object.keys(deviceConfigs).forEach(id => {
        if (!deviceConfigs[id].enabled) return;

        // วาด Card
        const valEl = document.getElementById(`val_${id}`);
        const timeEl = document.getElementById(`time_${id}`);
        if(valEl) valEl.textContent = dataObj[id] !== undefined ? dataObj[id] : 0;
        if(timeEl) timeEl.textContent = `อัปเดต: ${timeNow.toLocaleTimeString()}`;

        // จัดการ History สำหรับกราฟ
        if (!sensorHistory.data[id]) sensorHistory.data[id] = [];
        sensorHistory.data[id].push(dataObj[id] !== undefined ? dataObj[id] : 0);
        if(sensorHistory.data[id].length > 100) sensorHistory.data[id].shift();
    });

    if(chart) {
        chart.data.labels = sensorHistory.timestamps;
        chart.update('none'); // อัปเดตแบบไม่ให้กระตุก
    }
}

// ==========================================
// 📡 หัวข้อหลักที่ 10: การเชื่อมต่อและดักฟัง Firebase
// ==========================================

/**
 * หัวข้อย่อย 10.1: เริ่มต้นการฟังข้อมูลจาก Firebase ทั้งหมด
 */
function initFirebaseListeners() {
    if (!window.db) return;

    // 0. ✅ ดักฟังการเปลี่ยนแปลงชื่อโครงการ (Project Title)
    initTitleListener();

    // 1. ดักฟังการตั้งค่า (Device Configs)
    const configRef = window.ref(window.db, 'device_configs');
    window.onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            deviceConfigs = snapshot.val();
        } else {
            deviceConfigs = {};
        }
        renderSensorCards();
        updateChartStructure();
        if(document.getElementById('deviceModal').style.display === 'flex') {
            renderDeviceTable();
        }
    });

    // 2. ดักฟังข้อมูลปัจจุบันที่ส่งมาจาก ESP32
    const currentRef = window.ref(window.db, 'sensors/current');
    window.onValue(currentRef, (snapshot) => {
        if (snapshot.exists()) {
            processNewData(snapshot.val());
        }
    });

    // เช็คสถานะเชื่อมต่อ
    window.onValue(window.ref(window.db, ".info/connected"), (snap) => {
        const statusEl = document.getElementById('espStatus');
        if (snap.val() === true) {
            statusEl.className = 'connection-status online';
            statusEl.textContent = 'Connected (Firebase)';
        } else {
            statusEl.className = 'connection-status offline';
            statusEl.textContent = 'Disconnected';
        }
    });
    
    // 3. ✅ เริ่มฟังการเปลี่ยนแปลงรายชื่อผู้ใช้ออนไลน์
    initPresenceListener();
}

// ==========================================
// 🚀 หัวข้อหลักที่ 11: เริ่มต้นทำงาน (ปรับปรุง Auto Login ตามไฟล์ 17)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // เพิ่มเงื่อนไขเช็คว่าถ้าเคย Logout ไปแล้ว (sessionStorage ว่าง) ให้ข้ามการ Auto Login
    const savedUser = localStorage.getItem('savedUsername');
    const isLoggedOut = sessionStorage.getItem('activeRole') === null; 

    if (savedUser && isLoggedOut) {
        // ถ้ามี savedUser แต่ยังไม่ได้ล็อกอินใน Session นี้ ให้ทำ Auto Login
        document.getElementById('username').value = savedUser;
        document.getElementById('password').value = localStorage.getItem('savedPassword');
        document.getElementById('rememberMe').checked = true;
        setTimeout(() => window.handleLogin(), 500);
    }
    
    // รอ Firebase โหลด
    const checkFirebase = setInterval(() => {
        if (window.db) {
            clearInterval(checkFirebase);
            initChart();
            initFirebaseListeners();
        }
    }, 100);
});

// ==========================================
// 🧹 หัวข้อหลักที่ 12: เคลียร์กราฟและข้อมูลในหน้าจอ
// ==========================================

/**
 * หัวข้อย่อย 12.1: เคลียร์ข้อมูลกราฟ
 */
window.clearLocalData = function() {
    sensorHistory = { timestamps: [], data: {} };
    if(chart) {
        chart.data.labels = [];
        chart.data.datasets.forEach(ds => ds.data = []);
        chart.update();
    }
    alert('เคลียร์ข้อมูลกราฟบนหน้าจอเรียบร้อย');
};

// ==========================================
// 🛠️ หัวข้อหลักที่ 13: ระบบตั้งค่าการบันทึก & สำรองข้อมูล (Logging & Backup)
// ==========================================

let autoLogIntervalId = null;
let currentIntervalMinutes = 15; // ค่าเริ่มต้น 15 นาที

/**
 * หัวข้อย่อย 13.1: เปิด Modal ตั้งค่าระบบ
 */
window.openSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'flex';
    document.getElementById('logInterval').value = currentIntervalMinutes;
};

/**
 * หัวข้อย่อย 13.2: ปิด Modal ตั้งค่าระบบ
 */
window.closeSettingsManager = function() {
    document.getElementById('settingsModal').style.display = 'none';
};

/**
 * หัวข้อย่อย 13.3: บันทึกความถี่ลง Firebase เพื่อให้ตรงกันทุกเครื่อง
 */
window.saveLogInterval = async function() {
    const min = parseInt(document.getElementById('logInterval').value);
    if (isNaN(min) || min < 1) return alert("กรุณากรอกตัวเลขมากกว่า 0");
    
    try {
        await window.set(window.ref(window.db, `settings/log_interval`), min);
        alert(`✅ บันทึกความถี่เป็น ${min} นาที สำเร็จ`);
    } catch (e) {
        alert("❌ บันทึกไม่สำเร็จ: " + e.message);
    }
};

/**
 * หัวข้อย่อย 13.4: เริ่มต้นระบบนับเวลาถอยหลังเพื่อบันทึกข้อมูล
 */
function startAutoLogging(minutes) {
    if (autoLogIntervalId) clearInterval(autoLogIntervalId);
    currentIntervalMinutes = minutes;
    const ms = minutes * 60 * 1000;
    
    console.log(`⏱️ เริ่มการบันทึกข้อมูลอัตโนมัติทุกๆ ${minutes} นาที`);
    
    autoLogIntervalId = setInterval(async () => {
        // เช็คว่ามีข้อมูลปัจจุบันหรือไม่
        if (Object.keys(currentSensorValues).length === 0) return;
        
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        
        const path = `sensor_history/${dateStr}/${timeStr}`;
        
        try {
            // เพิ่ม Timestamp เข้าไปในข้อมูลที่จะบันทึก
            const dataToSave = { ...currentSensorValues, savedAt: now.toISOString() };
            await window.set(window.ref(window.db, path), dataToSave);
            console.log(`📝 บันทึกข้อมูลสถิติลง Firebase สำเร็จ (${timeStr})`);
        } catch (e) {
            console.error("❌ บันทึกสถิติไม่สำเร็จ:", e);
        }
    }, ms);
}

/**
 * หัวข้อย่อย 13.5: ระบบสำรองข้อมูล Offline (Export JSON)
 */
window.exportDataOffline = function() {
    if (sensorHistory.timestamps.length === 0) {
        return alert("ไม่มีข้อมูลในระบบให้สำรองครับ");
    }
    
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

/**
 * หัวข้อย่อย 13.6: ระบบกู้คืนข้อมูล Offline (Import JSON)
 */
window.importDataOffline = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // ตรวจสอบโครงสร้างไฟล์คราวๆ
            if (importedData.timestamps && importedData.data) {
                sensorHistory = importedData; // แทนที่ข้อมูลในระบบ
                
                // สั่งให้กราฟอัปเดตข้อมูลใหม่
                if (chart) {
                    chart.data.labels = sensorHistory.timestamps;
                    // ดึง dataset กลับเข้ามา
                    chart.data.datasets.forEach(ds => {
                        // ค้นหา id เซนเซอร์จากชื่อใน label
                        const matchedId = Object.keys(deviceConfigs).find(id => ds.label.includes(deviceConfigs[id].name));
                        if(matchedId && sensorHistory.data[matchedId]) {
                            ds.data = sensorHistory.data[matchedId];
                        }
                    });
                    chart.update();
                }
                alert("✅ โหลดข้อมูลจากไฟล์ Backup สำเร็จ กราฟอัปเดตแล้ว");
                closeSettingsManager();
            } else {
                throw new Error("โครงสร้างไฟล์ไม่ถูกต้อง");
            }
        } catch (err) {
            alert("❌ ไฟล์ไม่ถูกต้อง หรือเกิดข้อผิดพลาดในการอ่านไฟล์");
            console.error(err);
        }
        // ล้างค่า input เพื่อให้โหลดไฟล์เดิมซ้ำได้ถ้าต้องการ
        event.target.value = '';
    };
    reader.readAsText(file);
};

// ==========================================
// 🚀 หัวข้อหลักที่ 14: เริ่มต้นระบบ Auto-Logging ทันทีที่ Firebase โหลดเสร็จ
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const checkDbInterval = setInterval(() => {
        if (window.db) {
            clearInterval(checkDbInterval);
            const settingsRef = window.ref(window.db, 'settings/log_interval');
            window.onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) {
                    startAutoLogging(snapshot.val());
                } else {
                    startAutoLogging(15); // ถ้ายังไม่เคยตั้งค่า ให้เป็น 15 นาที
                }
            });
        }
    }, 500);
});