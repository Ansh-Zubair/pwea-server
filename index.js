const express = require("express");
const cors = require("cors");
const { makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");

const app = express();
app.use(cors());
app.use(express.json());

const sessions = {};

// PAIR CODE GENERATE
app.post("/pair", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.json({ success: false, error: "Phone number bhejo" });
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phone}`);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    // ✅ FIXED: Baileys v6 me makePairingCode ka sahi use
    let pairCode;
    
    if (typeof sock.requestPairingCode === "function") {
      // Newer version
      pairCode = await sock.requestPairingCode(phone);
    } else if (typeof makePairingCode === "function") {
      // Older version
      const { makePairingCode } = require("@whiskeysockets/baileys");
      pairCode = await makePairingCode(sock);
    } else {
      // Fallback: socket event se code lo
      pairCode = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject("Pair code timeout"), 30000);
        sock.ev.on("connection.update", (update) => {
          if (update.qr) {
            clearTimeout(timeout);
            resolve(update.qr);
          }
        });
      });
    }

    const qrData = await QRCode.toDataURL(pairCode);

    sessions[phone] = {
      sock,
      saveCreds,
      connected: false
    };

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
      pairCode: pairCode,
      qrCode: qrData
    });

  } catch (err) {
    console.error("Pair Error:", err);
    res.json({ success: false, error: err.message });
  }
});

// STATUS CHECK
app.get("/status/:phone", (req, res) => {
  const { phone } = req.params;
  const session = sessions[phone];

  res.json({
    phone: phone,
    connected: session ? session.connected : false
  });
});

// DISCONNECT
app.post("/disconnect", async (req, res) => {
  const { phone } = req.body;
  const session = sessions[phone];

  if (session) {
    try {
      await session.sock.logout();
      delete sessions[phone];
      res.json({ success: true, message: "Disconnected" });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  } else {
    res.json({ success: false, error: "Session nahi mili" });
  }
});

// HOME
app.get("/", (req, res) => {
  res.send("PWEA Web Pair Server Rungning ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PWEA Server on port ${PORT}`));
