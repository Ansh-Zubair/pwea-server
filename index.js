const express = require("express");
const cors = require("cors");
const pino = require("pino");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

let makeWASocket, useMultiFileAuthState, makePairingCode, DisconnectReason;

async function init() {
  const Baileys = await import("@whiskeysockets/baileys");
  makeWASocket = Baileys.default || Baileys.makeWASocket;
  useMultiFileAuthState = Baileys.useMultiFileAuthState;
  makePairingCode = Baileys.makePairingCode;
  DisconnectReason = Baileys.DisconnectReason;
  console.log("✅ Baileys Ready");
}
init();

const sessions = {};

// ✅ PAIR CODE
app.post("/baileys/pair", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, error: "Phone required" });
  if (!makeWASocket) return res.json({ success: false, error: "Baileys loading... wait 10s" });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
    
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["PWEA", "Chrome", "1.0.0"],
      printQRInTerminal: false
    });

    const code = await makePairingCode(sock);
    
    sessions[phone] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      const { connection } = update;
      if (connection === "open") sessions[phone].connected = true;
      if (connection === "close") delete sessions[phone];
    });
    sock.ev.on("creds.update", saveCreds);

    res.json({ success: true, pairCode: code });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ✅ QR CODE
app.post("/baileys/qr", async (req, res) => {
  if (!makeWASocket) return res.json({ success: false, error: "Baileys loading..." });

  try {
    const sessionId = "qr_" + Date.now();
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${sessionId}`);
    
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["PWEA", "Chrome", "1.0.0"],
      printQRInTerminal: false
    });

    const qrCode = await new Promise((resolve) => {
      sock.ev.on("connection.update", (update) => {
        if (update.qr) resolve(update.qr);
      });
    });

    sessions[sessionId] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      if (update.connection === "open") sessions[sessionId].connected = true;
      if (update.connection === "close") delete sessions[sessionId];
    });
    sock.ev.on("creds.update", saveCreds);

    res.json({ success: true, qrCode });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ✅ STATUS
app.get("/baileys/status/:phone", (req, res) => {
  const session = sessions[req.params.phone];
  res.json({ connected: session?.connected || false });
});

// ✅ SEND VERIFICATION
app.post("/baileys/send-verification", async (req, res) => {
  const { sender, receiver, message } = req.body;
  const session = Object.values(sessions).find(s => s.connected);

  if (!session) return res.json({ success: false, error: "No active session" });

  try {
    const chatId = receiver + "@s.whatsapp.net";
    await session.sock.sendMessage(chatId, { text: message });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ✅ DISCONNECT
app.post("/baileys/disconnect", async (req, res) => {
  const { phone } = req.body;
  const session = sessions[phone];
  if (session) {
    try { await session.sock.logout(); } catch (e) {}
    delete sessions[phone];
  }
  res.json({ success: true });
});

app.get("/", (req, res) => res.send("PWEA Baileys ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
