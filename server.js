const express = require('express');
const cors = require('cors');
const { 
    initializeSession, 
    getSessionStatus, 
    sendBaileysMessage, 
    destroySession 
} = require('./index.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable wide cors matching Render deployment security metrics
app.use(cors({ origin: '*' }));
app.use(express.json());

// Basic Server Health Check Root Node
app.get('/', (req, res) => {
    res.status(200).json({ status: "active", message: "PWEA Baileys session node running." });
});

// Endpoint: Generate Baileys Pairing Code
app.get('/api/connect/pair-code', async (req, res) => {
    const { phone, appType } = req.query;

    if (!phone) {
        return res.status(400).json({ error: "Phone parameter is required." });
    }

    try {
        const pairingCode = await initializeSession(phone.replace('+', ''), appType === 'Business');
        res.status(200).json({ success: true, code: pairingCode });
    } catch (error) {
        console.error(`[Error] Pairing code generation failed:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint: Check Device Authorization Status
app.get('/api/status', (req, res) => {
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ error: "Phone parameter is required." });
    }

    const cleanPhone = phone.replace('+', '');
    const status = getSessionStatus(cleanPhone);

    res.status(200).json({ phone: cleanPhone, status });
});

// Endpoint: Deliver verification SMS payload matching C88zz clone hardware test
app.post('/api/send-message', async (req, res) => {
    const { phone, to, text } = req.body;

    if (!phone || !to || !text) {
        return res.status(400).json({ error: "Parameters phone, to, and text are required." });
    }

    try {
        const cleanSender = phone.replace('+', '');
        const cleanReceiver = to.replace('+', '');
        
        const success = await sendBaileysMessage(cleanSender, cleanReceiver, text);
        if (success) {
            res.status(200).json({ success: true, message: "Security payload delivered." });
        } else {
            res.status(400).json({ success: false, error: "Sender session not active or authorized." });
        }
    } catch (error) {
        console.error(`[Error] Dispatch failure:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint: Terminate Session
app.post('/api/disconnect', async (req, res) => {
    const { phone } = req.query;

    if (!phone) {
        return res.status(400).json({ error: "Phone parameter is required." });
    }

    const cleanPhone = phone.replace('+', '');
    try {
        await destroySession(cleanPhone);
        res.status(200).json({ success: true, message: `Session ${cleanPhone} destroyed.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Express Server Bound to Port
app.listen(PORT, () => {
    console.log(`[PWEA Backend] HTTP Server started securely on port: ${PORT}`);
});
