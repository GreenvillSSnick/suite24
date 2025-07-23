const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./acft-db');
const cors = require('cors');

const app = express();
const PORT = 3000;

const allowedOrigins = ['https://24flight.tristan-industries.org', 'http://localhost:3000/api/flight-plan', 'http://localhost:3000/24Pilot'];
const FLIGHT_PLAN_FILE = path.join(__dirname, 'flightPlans.json');
const EVENT_FLIGHT_PLAN_FILE = path.join(__dirname, 'eventFlightPlans.json');

let aircraftData = {};
let eventAircraftData = {};
let flightPlans = loadFlightPlans();
let eventFlightPlans = eventLoadFlightPlans();
let controllers = {};

app.use(express.static(path.join(__dirname, '/public')));
app.use(express.json())

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
      handleNewPlans(msg.d);
    } else if (msg.t === 'EVENT_ACFT_DATA') {
      eventAircraftData = msg.d;
    } else if (msg.t === 'EVENT_FLIGHT_PLAN') {
      eventHandleNewPlans(msg.d);
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

function loadFlightPlans() {
  if (!fs.existsSync(FLIGHT_PLAN_FILE)) return [];
  try {
    const data = fs.readFileSync(FLIGHT_PLAN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading flight plan file:', e);
    return [];
  }
}

// regular fpl

function saveFlightPlans() {
  fs.writeFileSync(FLIGHT_PLAN_FILE, JSON.stringify(flightPlans, null, 2));
}

function addFlightPlan(newPlan) {
  // Remove expired (older than 24h)
  const now = Date.now();
  flightPlans = flightPlans.filter(p => now - p.timestamp < 24 * 60 * 60 * 1000);

  // Remove previous plan for same robloxName
  flightPlans = flightPlans.filter(p => p.robloxName !== newPlan.robloxName);

  // Add with timestamp
  flightPlans.push({ ...newPlan, timestamp: now });

  saveFlightPlans();
}

function handleNewPlans(data) {
  if (typeof data === 'object' && data.robloxName && typeof data.robloxName === 'string') {
    addFlightPlan({ ...data });
    return;
  }
  for (const [robloxName, plan] of Object.entries(data)) {
    if (typeof plan === 'object') {
      addFlightPlan({ robloxName, ...plan });
    }
  }
}

function storeAircraftUpdate(callsign, x, y) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO aircraft_paths (callsign, x, y, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(callsign, x, y, now);
  stmt.finalize();
}

//event fpl

function eventLoadFlightPlans() {
  if (!fs.existsSync(EVENT_FLIGHT_PLAN_FILE)) return [];
  try {
    const data = fs.readFileSync(EVENT_FLIGHT_PLAN_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading flight plan file:', e);
    return [];
  }
}

function eventSaveFlightPlans() {
  fs.writeFileSync(EVENT_FLIGHT_PLAN_FILE, JSON.stringify(eventFlightPlans, null, 2));
}

function eventAddFlightPlan(newPlan) {
  // Remove expired (older than 24h)
  const now = Date.now();
  eventFlightPlans = eventFlightPlans.filter(p => now - p.timestamp < 24 * 60 * 60 * 1000);

  // Remove previous plan for same robloxName
  eventFlightPlans = eventFlightPlans.filter(p => p.robloxName !== newPlan.robloxName);

  // Add with timestamp
  eventFlightPlans.push({ ...newPlan, timestamp: now });

  eventSaveFlightPlans();
}

function eventHandleNewPlans(data) {
  if (typeof data === 'object' && data.robloxName && typeof data.robloxName === 'string') {
    eventAddFlightPlan({ ...data });
    return;
  }
  for (const [robloxName, plan] of Object.entries(data)) {
    if (typeof plan === 'object') {
      eventAddFlightPlan({ robloxName, ...plan });
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - DAY_MS;
  db.run(`DELETE FROM aircraft_paths WHERE timestamp < ?`, cutoff);
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  flightPlans = flightPlans.filter(plan => now - plan.timestamp < 24 * 60 * 60 * 1000);
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();
  eventFlightPlans = eventFlightPlans.filter(plan => now - plan.timestamp < 24 * 60 * 60 * 1000);
}, 60 * 1000);

setInterval(() => {
  const now = Date.now();

  flightPlans = flightPlans.filter(plan => now - plan.timestamp < 24 * 60 * 60 * 1000);
  eventFlightPlans = eventFlightPlans.filter(plan => now - plan.timestamp < 24 * 60 * 60 * 1000);

  try {
    const data = fs.readFileSync(FLIGHT_PLAN_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) flightPlans = parsed;
  } catch (err) {
    console.error('[FLIGHT_PLAN_FILE] Reload failed:', err.message);
  }

  try {
    const data = fs.readFileSync(EVENT_FLIGHT_PLAN_FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) eventFlightPlans = parsed;
  } catch (err) {
    console.error('[EVENT_FLIGHT_PLAN_FILE] Reload failed:', err.message);
  }

  try {
    fs.writeFileSync(FLIGHT_PLAN_FILE, JSON.stringify(flightPlans, null, 2));
  } catch (err) {
    console.error('[FLIGHT_PLAN_FILE] Save failed:', err.message);
  }

  try {
    fs.writeFileSync(EVENT_FLIGHT_PLAN_FILE, JSON.stringify(eventFlightPlans, null, 2));
  } catch (err) {
    console.error('[EVENT_FLIGHT_PLAN_FILE] Save failed:', err.message);
  }

}, 15000);

app.use(cors({
  origin: allowedOrigins, 
  methods: ['GET', 'POST', 'DELETE'], 
  credentials: false
}));


app.get('/api/', (req, res) => {
  res.json = "{API is ok!}"
});

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

  fs.appendFile('api_requests.log', JSON.stringify(logEntry) + '\n', (err) => {
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
  const eventWrappedPlans = Object.fromEntries(
    Array.from(eventFlightPlans.entries()).map(([key, value]) => [key, { flightPlan: value }])
  );
  res.json(eventWrappedPlans);
});

app.get('/api/controllers', (req, res) => {
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

  fs.appendFile('api_requests.log', JSON.stringify(logEntry) + '\n', (err) => {
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

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'error.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).sendFile(path.join(__dirname, 'public', 'error.html'));
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`running at http://localhost:${PORT}`);
});