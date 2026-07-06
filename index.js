const express = require("express");
const cors = require("cors");
const { makeWASocket, useMultiFileAuthState, makePairingCode, DisconnectReason } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// Sessions folder create if not exists
if (!fs.existsSync("./sessions")) {
  fs.mkdirSync("./sessions");
}

const sessions = {};

// PAIR CODE GENERATE
app.post("/pair", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.json({ success: false, error: "Phone number required" });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["PWEA", "Chrome", "1.0.0"]
    });

    // Generate pair code
    const code = await makePairingCode(sock);
    const qrData = await QRCode.toDataURL(code);

    sessions[phone] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === "open") {
        sessions[phone].connected = true;
        console.log(`${phone} CONNECTED ✅`);
      }
      
      if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`${phone} CLOSED - Reason: ${reason}`);
        delete sessions[phone];
      }
    });

    sock.ev.on("creds.update", saveCreds);

    res.json({
      success: true,
      pairCode: code,
      qrCode: qrData
    });

  } catch (err) {
    console.error("Pair Error:", err.message);
    res.json({ success: false, error: err.message });
  }
});

// STATUS CHECK
app.get("/status/:phone", (req, res) => {
  const { phone } = req.params;
  const session = sessions[phone];
  res.json({ phone, connected: session ? session.connected : false });
});

// HOME
app.get("/", (req, res) => {
  const active = Object.keys(sessions).length;
  res.send(`PWEA Server Running ✅ | Active: ${active}`);
});

// Keep alive self ping
setInterval(() => {
  console.log("Server alive - Active sessions:", Object.keys(sessions).length);
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PWEA on port ${PORT}`));
