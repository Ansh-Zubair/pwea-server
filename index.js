const express = require("express");
const cors = require("cors");
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
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
      browser: ["PWEA", "Chrome", "1.0.0"],
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000
    });

    const code = await sock.requestPairingCode(phone);

    if (!code) {
      return res.json({ success: false, error: "Code generate nahi hua" });
    }

    const qrData = await QRCode.toDataURL(code);

    sessions[phone] = { sock, saveCreds, connected: false };

    // Connection handler with reconnection
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        sessions[phone].connected = true;
        console.log(`${phone} CONNECTED ✅`);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        
        if (statusCode === DisconnectReason.loggedOut) {
          delete sessions[phone];
          console.log(`${phone} LOGGED OUT ❌`);
        } else if (statusCode === DisconnectReason.connectionClosed) {
          console.log(`${phone} Connection closed — user ne pair kiya hoga`);
          // Keep session, status check se pata chalega
        } else {
          console.log(`${phone} Closed: ${statusCode}`);
        }
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

// STATUS CHECK — most important
app.get("/status/:phone", async (req, res) => {
  const { phone } = req.params;

  try {
    const { state } = await useMultiFileAuthState(`./sessions/${phone}`);
    const creds = state?.creds;

    // Check if session file exists and has valid creds
    if (creds?.me?.id) {
      // Try reconnect to check
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["PWEA", "Chrome", "1.0.0"],
        connectTimeoutMs: 10000
      });

      const connected = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        
        sock.ev.on("connection.update", (update) => {
          const { connection } = update;
          if (connection === "open") {
            clearTimeout(timeout);
            sock.end();
            resolve(true);
          }
          if (connection === "close") {
            clearTimeout(timeout);
            resolve(false);
          }
        });
      });

      res.json({ phone, connected });
    } else {
      res.json({ phone, connected: false });
    }
  } catch (e) {
    res.json({ phone, connected: false });
  }
});

app.get("/", (req, res) => {
  const count = Object.keys(sessions).length;
  res.send(`PWEA Server ✅ | Active: ${count}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
