const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./aircraft.db');

// Create the table to store path updates
db.run(`
  CREATE TABLE IF NOT EXISTS aircraft_paths (
    callsign TEXT,
    x INTEGER,
    y INTEGER,
    timestamp INTEGER
  )
`);

module.exports = db;
