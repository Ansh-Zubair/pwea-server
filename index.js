const express = require("express");
const cors = require("cors");
const pino = require("pino");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

let Baileys;
async function init() {
  Baileys = await import("@whiskeysockets/baileys");
  console.log("✅ Baileys Ready");
}
init();

const sessions = {};

// PAIR CODE ONLY
app.post("/pair", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ success: false, error: "Phone required" });

  if (!Baileys) return res.json({ success: false, error: "Server loading, wait 10s" });

  try {
    const { state, saveCreds } = await Baileys.useMultiFileAuthState(`./sessions/${phone}`);

    const sock = Baileys.default({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["PWEA", "Chrome", "1.0.0"],
      printQRInTerminal: false
    });

    const code = await Baileys.makePairingCode(sock);

    if (!code) return res.json({ success: false, error: "Code not generated, retry" });

    sessions[phone] = { sock, saveCreds, connected: false };

    sock.ev.on("connection.update", (update) => {
      if (update.connection === "open") {
        sessions[phone].connected = true;
      }
      if (update.connection === "close") {
        delete sessions[phone];
      }
    });

    sock.ev.on("creds.update", saveCreds);

    res.json({
      success: true,
      pairCode: code
    });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// STATUS CHECK
app.get("/status/:phone", async (req, res) => {
  const { phone } = req.params;
  try {
    const { state } = await Baileys.useMultiFileAuthState(`./sessions/${phone}`);
    res.json({ connected: state?.creds?.me?.id ? true : false });
  } catch (e) {
    res.json({ connected: false });
  }
});

app.get("/", (req, res) => res.send("PWEA ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
