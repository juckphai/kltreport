// Global variables
let sensorData = {
    ultrasonic: [],
    soil: [],
    rain: [],
    ph: [],
    timestamps: []
};

let chart;
let currentData = {
    ultrasonic: 0,
    soil: 0,
    rain: 0,
    ph: 0,
    timestamp: new Date()
};

let esp32IP = "http://192.168.1.100"; // 🔧 Change to your ESP32 IP address

// สถานะการเชื่อมต่อปัจจุบัน
let connectionMode = 'offline'; // 'firebase', 'local', หรือ 'offline'

// ==========================================
// 🔐 ระบบ Login และ Roles ผ่าน Firebase
// ==========================================

window.togglePassword = function() {
    const passInput = document.getElementById('password');
    if (passInput.type === 'password') {
        passInput.type = 'text';
    } else {
        passInput.type = 'password';
    }
};

window.handleLogin = async function() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;

    if (!user || !pass) {
        alert('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    // Show loading indicator
    const loginBtn = document.querySelector('.login-btn');
    const originalText = loginBtn.textContent;
    loginBtn.textContent = '⏳ กำลังเข้าสู่ระบบ...';
    loginBtn.disabled = true;

    try {
        // ตรวจสอบว่า Firebase พร้อมใช้งาน
        if (!window.db) {
            throw new Error('Firebase ยังไม่พร้อมใช้งาน กรุณารอสักครู่แล้วลองใหม่');
        }

        // ค้นหาบัญชีผู้ใช้ใน Firebase Realtime Database
        const userRef = window.ref(window.db, `users/${user}`);
        const snapshot = await window.get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.password === pass) {
                loginSuccess(userData.role, user, pass, remember);
            } else {
                alert('❌ รหัสผ่านไม่ถูกต้อง!\n\n📝 รหัสผ่านที่ถูกต้อง:\n- admin: admin123\n- user: user123');
            }
        } else {
            alert('❌ ไม่พบชื่อผู้ใช้นี้ในระบบ!\n\n📝 ชื่อผู้ใช้ที่ใช้ได้: admin หรือ user\n🔑 รหัสผ่าน: admin123 หรือ user123');
        }
    } catch (error) {
        console.error("Login Error: ", error);
        alert('❌ เกิดข้อผิดพลาด: ' + error.message + '\n\nกรุณารอสักครู่แล้วลองใหม่');
    } finally {
        loginBtn.textContent = originalText;
        loginBtn.disabled = false;
    }
};

function loginSuccess(role, user, pass, remember) {
    sessionStorage.setItem('activeRole', role);
    
    if (remember) {
        localStorage.setItem('savedUsername', user);
        localStorage.setItem('savedPassword', pass);
        localStorage.setItem('rememberMe', 'true');
    } else {
        localStorage.removeItem('savedUsername');
        localStorage.removeItem('savedPassword');
        localStorage.setItem('rememberMe', 'false');
    }

    applyRole(role);
}

function applyRole(role) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('userInfo').style.display = 'flex';
    
    const roleDisplay = document.getElementById('roleDisplay');
    const controlsSection = document.getElementById('adminControls');

    if (role === 'admin') {
        roleDisplay.textContent = 'Admin (ผู้ดูแลระบบ)';
        controlsSection.classList.remove('role-hidden');
    } else {
        roleDisplay.textContent = 'User (ผู้ใช้งานทั่วไป)';
        controlsSection.classList.add('role-hidden');
    }
}

window.logout = function() {
    if(confirm('ต้องการออกจากระบบใช่หรือไม่?')) {
        sessionStorage.removeItem('activeRole');
        document.getElementById('loginOverlay').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
        
        if(localStorage.getItem('rememberMe') !== 'true') {
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        }
    }
};

function checkInitialLogin() {
    const savedUser = localStorage.getItem('savedUsername');
    const savedPass = localStorage.getItem('savedPassword');
    const isRemembered = localStorage.getItem('rememberMe') === 'true';

    if (savedUser && savedPass) {
        document.getElementById('username').value = savedUser;
        document.getElementById('password').value = savedPass;
        document.getElementById('rememberMe').checked = isRemembered;
        
        // Auto login if remember me is true
        if (isRemembered) {
            setTimeout(() => {
                window.handleLogin();
            }, 500);
        }
    }

    const activeRole = sessionStorage.getItem('activeRole');
    if (activeRole) {
        applyRole(activeRole);
    }
}

// สร้างข้อมูลบัญชีผู้ใช้เริ่มต้น
async function initDefaultUsers() {
    try {
        // รอให้ Firebase พร้อม
        if (!window.db) {
            console.log('Waiting for Firebase...');
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (window.db) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });
        }

        const usersRef = window.ref(window.db, 'users');
        const snapshot = await window.get(usersRef);
        
        if (!snapshot.exists()) {
            console.log("Creating default users...");
            await window.set(window.ref(window.db, 'users/admin'), { 
                password: 'admin123', 
                role: 'admin',
                createdAt: new Date().toISOString()
            });
            await window.set(window.ref(window.db, 'users/user'), { 
                password: 'user123', 
                role: 'user',
                createdAt: new Date().toISOString()
            });
            console.log("✅ Created default users (admin/user)");
            
            // Update sync status
            const syncStatus = document.getElementById('syncStatus');
            if (syncStatus) {
                syncStatus.innerHTML = '✅ สร้างบัญชีผู้ใช้เริ่มต้นเรียบร้อย';
                setTimeout(() => {
                    syncStatus.innerHTML = '✅ Ready';
                }, 2000);
            }
        } else {
            console.log("✅ Users already exist in database");
        }
    } catch (e) {
        console.error("Error creating default users:", e);
    }
}

// ==========================================
// 👥 ระบบจัดการผู้ใช้งาน (สำหรับ Admin)
// ==========================================

window.openUserManager = function() {
    const role = sessionStorage.getItem('activeRole');
    if (role !== 'admin') {
        alert('เฉพาะ Admin เท่านั้นที่สามารถจัดการผู้ใช้งานได้');
        return;
    }
    document.getElementById('userModal').style.display = 'flex';
    fetchUsers();
};

window.closeUserManager = function() {
    document.getElementById('userModal').style.display = 'none';
    clearUserForm();
};

function clearUserForm() {
    document.getElementById('manageUsername').value = '';
    document.getElementById('managePassword').value = '';
    document.getElementById('manageRole').value = 'user';
}

async function fetchUsers() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">กำลังโหลดข้อมูลผู้ใช้งาน...</td></tr>';
    
    try {
        const usersRef = window.ref(window.db, 'users');
        const snapshot = await window.get(usersRef);
        
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            const users = snapshot.val();
            for (const [username, data] of Object.entries(users)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${username}</td>
                    <td>${data.password}</td>
                    <td>${data.role === 'admin' ? '👑 Admin' : '👤 User'}</td>
                    <td>
                        <button onclick="editUser('${username}', '${data.password}', '${data.role}')" class="btn-small edit-btn" style="background:#ffc107; color:#333; margin-right:5px; padding:6px 12px; font-size:0.85em; cursor:pointer; border:none; border-radius:4px;">✏️ แก้ไข</button>
                        ${username !== 'admin' ? `<button onclick="deleteUser('${username}')" class="btn-small danger" style="padding:6px 12px; font-size:0.85em; background:#f44336; color:white; border:none; border-radius:4px; cursor:pointer;">🗑️ ลบ</button>` : ''}
                    </td>
                `;
                tbody.appendChild(tr);
            }
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">ไม่พบข้อมูลผู้ใช้งาน</td></tr>';
        }
    } catch (error) {
        console.error("Fetch Users Error:", error);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">โหลดข้อมูลผิดพลาด</td></tr>';
    }
}

window.saveUser = async function() {
    const username = document.getElementById('manageUsername').value.trim();
    const password = document.getElementById('managePassword').value.trim();
    const role = document.getElementById('manageRole').value;

    if (!username || !password) {
        alert("กรุณากรอก Username และ Password ให้ครบถ้วน");
        return;
    }

    if (username.length < 3) {
        alert("Username ต้องมีความยาวอย่างน้อย 3 ตัวอักษร");
        return;
    }

    if (password.length < 4) {
        alert("Password ต้องมีความยาวอย่างน้อย 4 ตัวอักษร");
        return;
    }

    try {
        await window.set(window.ref(window.db, `users/${username}`), {
            password: password,
            role: role,
            updatedAt: new Date().toISOString()
        });
        alert(`✅ บันทึกข้อมูลผู้ใช้ "${username}" เรียบร้อยแล้ว`);
        clearUserForm();
        fetchUsers();
    } catch (error) {
        console.error("Save User Error:", error);
        alert("❌ ไม่สามารถบันทึกข้อมูลไปยังฐานข้อมูลได้");
    }
};

window.editUser = function(username, password, role) {
    document.getElementById('manageUsername').value = username;
    document.getElementById('managePassword').value = password;
    document.getElementById('manageRole').value = role;
};

window.deleteUser = async function(username) {
    if (username === 'admin') {
        alert('ไม่อนุญาตให้ลบ Admin หลักของระบบ');
        return;
    }

    if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้งาน: ${username} ?`)) {
        try {
            await window.remove(window.ref(window.db, `users/${username}`));
            alert('✅ ลบผู้ใช้งานสำเร็จ');
            fetchUsers();
        } catch (error) {
            console.error("Delete User Error:", error);
            alert("❌ ไม่สามารถทำการลบข้อมูลผู้ใช้ออกได้");
        }
    }
};

// ==========================================
// ส่วนของการจัดการ Firebase และ Chart
// ==========================================

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.db) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.db) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('Firebase timeout, but continuing...');
                resolve();
            }, 10000);
        }
    });
}

// Initialize Chart
function initChart() {
    const ctx = document.getElementById('sensorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Ultrasonic (cm)',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'Soil Moisture (%)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'Rain (%)',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    tension: 0.1,
                    fill: true
                },
                {
                    label: 'pH',
                    data: [],
                    borderColor: 'rgb(153, 102, 255)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    tension: 0.1,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Real-time Sensor Data'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Sensor Values'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            }
        }
    });
}

// Update chart with new data
function updateChart() {
    if (!chart) return;
    
    if (sensorData.timestamps.length > 0) {
        chart.data.labels = sensorData.timestamps.map(t => new Date(t).toLocaleTimeString());
        chart.data.datasets[0].data = [...sensorData.ultrasonic];
        chart.data.datasets[1].data = [...sensorData.soil];
        chart.data.datasets[2].data = [...sensorData.rain];
        chart.data.datasets[3].data = [...sensorData.ph];
        chart.update('none'); 
    }
}

// Update dashboard UI
function updateDashboard(data) {
    currentData = {
        ultrasonic: parseFloat(data.ultrasonic) || 0,
        soil: parseFloat(data.soil) || 0,
        rain: parseFloat(data.rain) || 0,
        ph: parseFloat(data.ph) || 0,
        timestamp: new Date()
    };

    document.getElementById('ultrasonicValue').textContent = currentData.ultrasonic;
    document.getElementById('soilValue').textContent = currentData.soil;
    document.getElementById('rainValue').textContent = currentData.rain;
    document.getElementById('phValue').textContent = currentData.ph.toFixed(2);

    const timeStr = new Date().toLocaleTimeString();
    ['ultrasonicTime', 'soilTime', 'rainTime', 'phTime'].forEach(id => {
        document.getElementById(id).textContent = `Last update: ${timeStr}`;
    });

    const MAX_HISTORY = 100;
    sensorData.ultrasonic.push(currentData.ultrasonic);
    sensorData.soil.push(currentData.soil);
    sensorData.rain.push(currentData.rain);
    sensorData.ph.push(currentData.ph);
    sensorData.timestamps.push(new Date().toISOString());

    if (sensorData.ultrasonic.length > MAX_HISTORY) {
        sensorData.ultrasonic.shift();
        sensorData.soil.shift();
        sensorData.rain.shift();
        sensorData.ph.shift();
        sensorData.timestamps.shift();
    }

    updateChart();
    saveToLocalStorage();
}

// Save to LocalStorage
function saveToLocalStorage() {
    const dataToSave = {
        ultrasonic: sensorData.ultrasonic,
        soil: sensorData.soil,
        rain: sensorData.rain,
        ph: sensorData.ph,
        timestamps: sensorData.timestamps,
        lastUpdate: new Date().toISOString()
    };
    localStorage.setItem('sensorData', JSON.stringify(dataToSave));
    console.log('💾 Data saved to localStorage');
}

// Load from LocalStorage
function loadFromLocalStorage() {
    const savedData = localStorage.getItem('sensorData');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            sensorData.ultrasonic = data.ultrasonic || [];
            sensorData.soil = data.soil || [];
            sensorData.rain = data.rain || [];
            sensorData.ph = data.ph || [];
            sensorData.timestamps = data.timestamps || [];
            updateChart();
            console.log('📀 Data loaded from localStorage');
        } catch (e) {
            console.error('Failed to load localStorage data:', e);
        }
    }
}

// Clear Local Data
window.clearLocalData = function() {
    if (confirm('Are you sure you want to clear all local data?')) {
        sensorData = {
            ultrasonic: [],
            soil: [],
            rain: [],
            ph: [],
            timestamps: []
        };
        localStorage.removeItem('sensorData');
        updateChart();
        const syncStatus = document.getElementById('syncStatus');
        if (syncStatus) {
            syncStatus.innerHTML = '🗑️ Local data cleared';
            setTimeout(() => {
                syncStatus.innerHTML = '✅ Ready';
            }, 2000);
        }
    }
};

// Sync to Firebase
window.syncToFirebase = async function() {
    try {
        const db = window.db;
        const ref = window.ref;
        const push = window.push;
        const serverTimestamp = window.serverTimestamp;
        
        if (!db) {
            throw new Error('Firebase not initialized');
        }
        
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.classList.add('syncing');
        syncStatus.innerHTML = '☁️ Syncing to Firebase...';
        
        const ultrasonic = parseFloat(document.getElementById('ultrasonicValue').innerText) || 0;
        const soil = parseFloat(document.getElementById('soilValue').innerText) || 0;
        const rain = parseFloat(document.getElementById('rainValue').innerText) || 0;
        const ph = parseFloat(document.getElementById('phValue').innerText) || 0;
        
        const today = new Date().toISOString().split('T')[0];
        const sensorRef = ref(db, 'sensors/' + today);
        const dataPoint = {
            ultrasonic: ultrasonic,
            soil: soil,
            rain: rain,
            ph: ph,
            timestamp: serverTimestamp(),
            localTime: new Date().toISOString()
        };
        
        await push(sensorRef, dataPoint);
        syncStatus.innerHTML = '✅ Synced to Firebase successfully!';
        
        setTimeout(() => {
            syncStatus.classList.remove('syncing');
            if (syncStatus.innerHTML === '✅ Synced to Firebase successfully!') {
                syncStatus.innerHTML = '✅ Ready';
            }
        }, 2000);
    } catch (error) {
        console.error('Firebase sync error:', error);
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.classList.remove('syncing');
        syncStatus.innerHTML = '❌ Firebase sync failed: ' + error.message;
    }
};

// Load history data from Firebase
window.loadHistoryData = async function() {
    try {
        const db = window.db;
        const ref = window.ref;
        const onValue = window.onValue;
        
        if (!db) {
            throw new Error('Firebase not initialized');
        }
        
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.innerHTML = '📥 Loading history from Firebase...';
        
        const today = new Date().toISOString().split('T')[0];
        const sensorRef = ref(db, 'sensors/' + today);
        
        onValue(sensorRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const historyData = Object.values(data);
                historyData.sort((a, b) => new Date(a.localTime) - new Date(b.localTime));
                
                sensorData.ultrasonic = historyData.map(d => d.ultrasonic);
                sensorData.soil = historyData.map(d => d.soil);
                sensorData.rain = historyData.map(d => d.rain);
                sensorData.ph = historyData.map(d => d.ph);
                sensorData.timestamps = historyData.map(d => d.localTime || new Date(d.timestamp).toISOString());
                updateChart();
                saveToLocalStorage();
                syncStatus.innerHTML = `📈 Loaded ${historyData.length} records from history`;
                setTimeout(() => {
                    syncStatus.innerHTML = '✅ Ready';
                }, 2000);
            } else {
                syncStatus.innerHTML = '📭 No history data found for today';
                setTimeout(() => {
                    syncStatus.innerHTML = '✅ Ready';
                }, 2000);
            }
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Load history error:', error);
        const syncStatus = document.getElementById('syncStatus');
        syncStatus.innerHTML = '❌ Failed to load history';
    }
};

// 1. ระบบดึงข้อมูลจาก Local ESP32
async function fetchLocalESP32() {
    if (connectionMode === 'firebase') return; 

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${esp32IP}/data`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error("HTTP error");
        const data = await response.json();
        
        connectionMode = 'local';
        const espStatus = document.getElementById('espStatus');
        espStatus.className = 'connection-status online';
        espStatus.textContent = 'Connected (Local Network)';
        
        updateDashboard(data);
    } catch (error) {
        if (connectionMode === 'local') {
            connectionMode = 'offline';
            const espStatus = document.getElementById('espStatus');
            espStatus.className = 'connection-status offline';
            espStatus.textContent = 'Disconnected';
        }
    }
}

// 2. ระบบดักฟัง Firebase
function initFirebaseListener() {
    const db = window.db;
    const ref = window.ref;
    const onValue = window.onValue;
    
    if (!db) return;

    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            connectionMode = 'firebase';
            const espStatus = document.getElementById('espStatus');
            espStatus.className = 'connection-status online';
            espStatus.textContent = 'Connected (Firebase Cloud)';
        } else {
            if (connectionMode === 'firebase') connectionMode = 'offline';
        }
    });

    const currentSensorRef = ref(db, 'sensors/current');
    onValue(currentSensorRef, (snapshot) => {
        const data = snapshot.val();
        if (data) updateDashboard(data);
    });
}

// Export to CSV
window.exportToCSV = function() {
    if (sensorData.timestamps.length === 0) {
        alert('No data to export');
        return;
    }
    
    let csvContent = "\uFEFFTimestamp,Ultrasonic(cm),Soil Moisture(%),Rain(%),pH\n";
    
    for (let i = 0; i < sensorData.timestamps.length; i++) {
        csvContent += `${sensorData.timestamps[i]},${sensorData.ultrasonic[i]},${sensorData.soil[i]},${sensorData.rain[i]},${sensorData.ph[i]}\n`;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensor_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

// Check PWA status
if (window.matchMedia('(display-mode: standalone)').matches) {
    const pwaStatus = document.getElementById('pwaStatus');
    if (pwaStatus) {
        pwaStatus.className = 'connection-status online';
        pwaStatus.textContent = 'Installed (Standalone)';
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing...');
    
    // 🔐 เช็คสถานะการเข้าสู่ระบบ
    checkInitialLogin();
    
    await waitForFirebase();
    console.log('Firebase ready, starting app...');
    
    // โหลดหรือจัดเตรียมโครงสร้าง Default ผู้ใช้งานหากจำเป็น
    await initDefaultUsers();
    
    initChart();
    loadFromLocalStorage();
    
    const syncStatus = document.getElementById('syncStatus');
    if (window.db) {
        syncStatus.innerHTML = '✅ Firebase connected';
        setTimeout(() => {
            syncStatus.innerHTML = '✅ Ready';
        }, 1500);
    }
    
    initFirebaseListener();
    setInterval(fetchLocalESP32, 3000);
});

// Export functions to window for onclick handlers
window.exportToCSV = exportToCSV;
window.clearLocalData = clearLocalData;
window.syncToFirebase = syncToFirebase;
window.loadHistoryData = loadHistoryData;
window.editUser = editUser;
window.deleteUser = deleteUser;