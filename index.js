const WebSocket = require('ws');
const express = require('express');
const path = require('path');

const app = express();
const PORT = 80;

let aircraftData = {};
let flightPlans = {};

app.use(express.static(path.join(__dirname, '/public')));

// Expose API for HTML files to get data
app.get('/api/acft-data', (req, res) => {
  res.json({ aircraftData });
});

app.get('/api/flight-plan', (req, res) => {
  res.json({ flightPlans });
});

app.listen(PORT, () => {
  console.log(`running at http://localhost:${PORT}`);
});

const ws = new WebSocket('wss://24data.ptfs.app/wss', {
  headers: {
    Origin: ''
  }
});

ws.on('open', () => {
  console.log('connected');
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data);
    if (msg.t === 'ACFT_DATA' || msg.t === 'EVENT_ACFT_DATA') {
      aircraftData = msg.d;
    } else if (msg.t === 'FLIGHT_PLAN') {
      flightPlans = msg.d;
    }
  } catch (e) {
    console.error('Invalid JSON:', e);
  }
});

ws.on('close', () => {
  console.log('WebSocket closed');
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});