const express = require("express");
const cors = require("cors");
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

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
      browser: ["PWEA", "Chrome", "1.0.0"],
      mobile: false
    });

    // ✅ Beta method se pair code generate
    const code = await sock.requestPairingCode(phone);
    
    if (!code) {
      return res.json({ success: false, error: "Pair code generate nahi hua" });
    }

    const qrData = await QRCode.toDataURL(code);

    sessions[phone] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      const { connection } = update;
      if (connection === "open") {
        sessions[phone].connected = true;
        console.log(`${phone} CONNECTED ✅`);
      }
      if (connection === "close") {
        delete sessions[phone];
        console.log(`${phone} DISCONNECTED ❌`);
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
  res.send(`PWEA Server Running ✅ | Active Sessions: ${active}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PWEA Server on port ${PORT}`));
