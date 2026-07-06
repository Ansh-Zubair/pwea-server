const express = require("express");
const cors = require("cors");
const { makeWASocket, useMultiFileAuthState, makePairingCode } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");

const app = express();
app.use(cors());
app.use(express.json());

// Sessions store (memory me)
const sessions = {};

// Pair Code Generate ✅
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

    const code = await makePairingCode(sock);
    const qrData = await QRCode.toDataURL(code);

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
      pairCode: code,
      qrCode: qrData
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Status Check ✅
app.get("/status/:phone", (req, res) => {
  const { phone } = req.params;
  const session = sessions[phone];

  res.json({
    phone: phone,
    connected: session ? session.connected : false
  });
});

// Disconnect ✅
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

// List Active Numbers ✅
app.get("/sessions", (req, res) => {
  const list = Object.entries(sessions).map(([phone, data]) => ({
    phone,
    connected: data.connected
  }));
  res.json({ success: true, sessions: list });
});

// Home
app.get("/", (req, res) => {
  res.send("PWEA Web Pair Server Running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PWEA Server on port ${PORT}`));
