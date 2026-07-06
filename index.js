const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Home route - check karega server alive hai ya nahi
app.get("/", (req, res) => {
  res.send("PWEA Server Chal Raha Hai ✅");
});

// Pair code generate karega (abhi dummy, baad me real Baileys)
app.get("/pair", (req, res) => {
  const pairCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  res.json({ 
    success: true, 
    pairCode: pairCode,
    message: "WhatsApp me ye code daalo" 
  });
});

// Status check
app.get("/status", (req, res) => {
  res.json({ 
    connected: false, 
    message: "Abhi koi number connected nahi" 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("PWEA Server started on port " + PORT);
});
