const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('fs');

// Global cache objects in memory tracking running socket clients
const activeSessions = {};

// Clean up database storage paths
const SESSIONS_DIR = './sessions';
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Initializes, registers, and tracks individual device instances
 * @param {string} phone - Alphanumeric pure dialing format sender (e.g. 923001234567)
 * @param {boolean} isBusiness - Identifies business client headers
 * @returns {Promise<string>} returns generated active pairing code from Baileys
 */
async function initializeSession(phone, isBusiness = false) {
    const sessionPath = `${SESSIONS_DIR}/${phone}`;

    // Clean start auth payload instances
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const logger = pino({ level: 'silent' });

    // WASocket configuration matching browser headers
    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: [isBusiness ? "WhatsApp Business" : "WhatsApp Messenger", "Chrome", "macOS"],
        markOnlineOnConnect: true
    });

    activeSessions[phone] = {
        socket,
        status: "pending"
    };

    return new Promise(async (resolve, reject) => {
        // Event Connection update cycle monitor loop
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'open') {
                console.log(`[Baileys-Node] Session is authenticated and connected for client: ${phone}`);
                activeSessions[phone].status = "connected";
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`[Baileys-Node] Connection terminated for phone: ${phone}. Reconnect match: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    // Recurse setup to bypass network drops
                    initializeSession(phone, isBusiness).catch(() => {});
                } else {
                    await destroySession(phone);
                }
            }
        });

        // Save credential variables continuously on disk
        socket.ev.on('creds.update', saveCreds);

        // Pairing Code generation timeout
        await delay(3000);
        if (!socket.authState.creds.registered) {
            try {
                // Fetch dynamic pair key directly from Baileys core instances
                const pairingCode = await socket.requestPairingCode(phone);
                resolve(pairingCode);
            } catch (error) {
                reject(new Error("Unable to retrieve pairing credentials from Baileys. Try again later."));
            }
        } else {
            activeSessions[phone].status = "connected";
            resolve("ALREADY_CONNECTED");
        }
    });
}

/**
 * Gets the current connection status of a session
 * @param {string} phone 
 * @returns {string} connected | pending | disconnected
 */
function getSessionStatus(phone) {
    if (activeSessions[phone]) {
        return activeSessions[phone].status;
    }
    // Check if session directory exists but session object is not in memory
    const sessionPath = `${SESSIONS_DIR}/${phone}`;
    if (fs.existsSync(sessionPath)) {
        return "disconnected"; // Needs authorization trigger execution
    }
    return "disconnected";
}

/**
 * Dispatches verified message string out of specified user node
 * @param {string} senderPhone 
 * @param {string} receiverPhone 
 * @param {string} messageText 
 * @returns {Promise<boolean>} returns true on successfully sent message packet
 */
async function sendBaileysMessage(senderPhone, receiverPhone, messageText) {
    const session = activeSessions[senderPhone];
    if (!session || session.status !== "connected") {
        console.warn(`[Send Failure] Session ${senderPhone} not found or connection not active.`);
        return false;
    }

    try {
        const socket = session.socket;
        const targetId = `${receiverPhone}@s.whatsapp.net`;
        
        await socket.sendMessage(targetId, { text: messageText });
        console.log(`[Success] Baileys packet sent from ${senderPhone} to ${receiverPhone}`);
        return true;
    } catch (error) {
        console.error(`[Baileys Error] Send message execution failed:`, error.message);
        return false;
    }
}

/**
 * Destroys session instance in memory and deletes credential files on disk
 * @param {string} phone 
 */
async function destroySession(phone) {
    if (activeSessions[phone]) {
        try {
            activeSessions[phone].socket.logout();
        } catch (e) {}
        delete activeSessions[phone];
    }

    const sessionPath = `${SESSIONS_DIR}/${phone}`;
    if (fs.existsSync(sessionPath)) {
        try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[Disk Cleanup] State folder removed for client phone ID: ${phone}`);
        } catch (err) {
            console.warn(`[Disk Warning] Credentials deletion retry error:`, err.message);
        }
    }
}

module.exports = {
    initializeSession,
    getSessionStatus,
    sendBaileysMessage,
    destroySession
};
