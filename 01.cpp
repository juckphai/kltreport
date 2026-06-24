#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <time.h> 

// --- การตั้งค่า (Settings) ---
#define WIFI_SSID "Maeket_2.4G"
#define WIFI_PASSWORD "06092536"
#define FIREBASE_HOST "kltreport-default-rtdb.asia-southeast1.firebasedatabase.app"
#define API_KEY "AIzaSyCZlNcwakBAlUPVfyaBsRasbYv6kOV4Ec4"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long sendDataPrevMillis = 0;
unsigned long sendSensorPrevMillis = 0;
bool isFirstConnection = true;

void setup() {
  Serial.begin(115200);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to Wi-Fi!");

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov"); 
  
  config.api_key = API_KEY;
  config.database_url = FIREBASE_HOST;
  config.signer.test_mode = true; 

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true); 
  
  Serial.println("System Ready.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
      delay(5000);
      return;
  }

  if (Firebase.ready()) {
    
    // --- 1. ระบบ Heartbeat (อัปเดตสถานะ online ทุกรอบ) ---
    if (isFirstConnection) {
      FirebaseJson initJson;
      initJson.set("status", "online");
      initJson.set("type", "board");       
      initJson.set("name", "ESP32 Node 01");
      initJson.set("enabled", true);
      initJson.set("onlineSince/.sv", "timestamp");
      initJson.set("lastSeen/.sv", "timestamp");
      initJson.set("wifi_rssi", WiFi.RSSI());
      
      if (Firebase.RTDB.updateNode(&fbdo, "/device_configs/esp32_node_01", &initJson)) {
        Serial.println("✅ Initialized Board Identity");
        isFirstConnection = false;
      }
    } 
    else if (millis() - sendDataPrevMillis > 20000 || sendDataPrevMillis == 0) {
      sendDataPrevMillis = millis();
      
      FirebaseJson json;
      json.set("status", "online");   // ⭐ ส่งสถานะ online ทุกรอบ
      json.set("lastSeen/.sv", "timestamp");
      json.set("wifi_rssi", WiFi.RSSI());
      
      if (Firebase.RTDB.updateNode(&fbdo, "/device_configs/esp32_node_01", &json)) {
        Serial.print("🟢 Heartbeat Sent (status:online) | RSSI: ");
        Serial.println(WiFi.RSSI());
      } else {
        Serial.println("❌ Heartbeat failed: " + fbdo.errorReason());
      }
    }

    // --- 2. ระบบใหม่: ส่งข้อมูลเซนเซอร์เข้า /sensors/current ---
    if (millis() - sendSensorPrevMillis > 10000) { // ส่งทุก 10 วินาที
      sendSensorPrevMillis = millis();

      // --- [แก้ไขตรงนี้] ใส่โค้ดอ่านเซนเซอร์จริงของคุณที่นี่ ---
      float distanceValue = 120.5; // ตัวอย่างค่าจาก Ultrasonic
      float soilValue = 65.0;      // ตัวอย่างค่าจาก Soil Moisture
      // ----------------------------------------------------

      FirebaseJson sensorJson;
      sensorJson.set("us_01", distanceValue);
      sensorJson.set("soil_01", soilValue);
      
      if (Firebase.RTDB.updateNode(&fbdo, "/sensors/current", &sensorJson)) {
        Serial.println("📊 Sensor data sent to /sensors/current");
      } else {
        Serial.println("❌ Send failed: " + fbdo.errorReason());
      }
    }
  }
}