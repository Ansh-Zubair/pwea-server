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

    // v6.7.0 me requestPairingCode available hai
    const code = await sock.requestPairingCode(phone);
    const qrData = await QRCode.toDataURL(code);

    sessions[phone] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      const { connection } = update;
      if (connection === "open") {
        sessions[phone].connected = true;
      }
      if (connection === "close") {
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
    console.error("Error:", err.message);
    res.json({ success: false, error: err.message });
  }
});

app.get("/status/:phone", (req, res) => {
  const { phone } = req.params;
  const session = sessions[phone];
  res.json({ phone, connected: session ? session.connected : false });
});

app.get("/", (req, res) => {
  res.send("PWEA Server Running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
