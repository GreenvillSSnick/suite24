const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./acft-db');
const cors = require('cors');

const app = express();
const PORT = 3000;

let aircraftData = {};
let eventAircraftData = {};
let flightPlans = new Map();
let eventFlightPlans = new Map();
let controllers = {};

const allowedOrigins = ['https://24flight.tristan-industries.org', 'http://localhost:3000/api/flight-plan', 'http://localhost:3000/24Pilot'];

app.use(express.static(path.join(__dirname, '/public')));
app.use(express.json())

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
    if (msg.t === 'ACFT_DATA') {
      aircraftData = msg.d;

      for (const [callsign, data] of Object.entries(aircraftData)) {
        const x = data.position?.x;
        const y = data.position?.y;
        if (x != null && y != null) {
          storeAircraftUpdate(callsign, x, y);
        }
      }
    } else if (msg.t === 'FLIGHT_PLAN') {
      for (const [robloxName, newPlan] of Object.entries(msg.d)) {
        if (flightPlans.has(robloxName)) {
          flightPlans.delete(robloxName);
        }
        flightPlans.set(robloxName, newPlan);
      }

      console.log('Flight plans updated');
    } else if (msg.t === 'EVENT_ACFT_DATA') {
      eventAircraftData = msg.d;
    } else if (msg.t === 'EVENT_FLIGHT_PLAN') {
      eventFlightPlans.clear();
      for (const [robloxName, plan] of Object.entries(msg.d)) {
        eventFlightPlans.set(robloxName, plan);
      }
    } else if (msg.t === 'CONTROLLERS') {
      controllers = msg.d;
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

function storeAircraftUpdate(callsign, x, y) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO aircraft_paths (callsign, x, y, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(callsign, x, y, now);
  stmt.finalize();
}

const DAY_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - DAY_MS;
  db.run(`DELETE FROM aircraft_paths WHERE timestamp < ?`, cutoff);
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [robloxName, plan] of flightPlans.entries()) {
    if (now - plan.timestamp > 24 * 60 * 60 * 1000) {
      flightPlans.delete(robloxName);
    }
  }
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [robloxName, plan] of eventFlightPlans.entries()) {
    if (now - plan.timestamp > 24 * 60 * 60 * 1000) {
      eventFlightPlans.delete(robloxName);
    }
  }
}, 60 * 1000);

app.use(cors({
  origin: allowedOrigins, 
  methods: ['GET', 'POST', 'DELETE'], 
  credentials: false
}));

app.get('/api/acft-data', (req, res) => {
  res.json({ aircraftData });

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});

app.get('/api/acft-data/event', (req, res) => {
  res.json({ eventAircraftData });

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});

app.get('/api/flight-plans', (req, res) => {
  const wrappedPlans = Object.fromEntries(
    Array.from(flightPlans.entries()).map(([key, value]) => [key, { flightPlan: value }])
  );
  res.json(wrappedPlans);
});

app.get('/api/flight-plans/event', (req, res) => {
  const allPlans = Object.fromEntries(eventFlightPlans.entries());
  res.json(allPlans);
});

app.get('/api/acft-data', (req, res) => {
  res.json({ controllers });

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});
// get = read
app.get('/api/paths/:callsign', (req, res) => {
  const callsign = req.params.callsign;

  db.all(
    `SELECT x, y, timestamp FROM aircraft_paths WHERE callsign = ? ORDER BY timestamp`,
    [callsign],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});

// post = add/update
app.post('/api/paths/:callsign', (req, res) => {
  const callsign = req.params.callsign;
  const points = req.body.points;

  if (!Array.isArray(points)) {
    return res.status(400).json({ error: 'Points must be an array' });
  }

  const now = Date.now();
  const stmt = db.prepare('INSERT INTO aircraft_paths (callsign, x, y, timestamp) VALUES (?, ?, ?, ?)');

  db.run('DELETE FROM aircraft_paths WHERE callsign = ?', [callsign], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }

    for (const [x, y] of points) {
      stmt.run(callsign, x, y, now);
    }
    stmt.finalize();

    res.json({ success: true, inserted: points.length });
  });

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});

// delete = delete
app.delete('/api/paths/:callsign', (req, res) => {
  const callsign = req.params.callsign;
  db.run('DELETE FROM aircraft_paths WHERE callsign = ?', [callsign], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ deleted: this.changes });
  });

  // log stuff
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    params: req.params,
    query: req.query,
    headers: req.headers,
  };

  fs.appendFile('api_requests.txt', JSON.stringify(logEntry) + '\n', (err) => {
    if (err) console.error(err);
  });
});