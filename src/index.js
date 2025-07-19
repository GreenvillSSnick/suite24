const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require("express");
const fetch = require("node-fetch");

const port = process.env.PORT || 3000;

const app = express();
app.use(express.static("public"));

http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading HTML');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    }
  });
}).listen(3000, () => {
  console.log('Server running');
});

app.get("/api/aircraft", async (req, res) => {
  try {
    const response = await fetch("https://24data.ptfs.app/acft-data", {
      headers: { "User-Agent": "ATC24Radar/1.0" }
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Fetch failed:", err);
    res.status(500).send("Error fetching aircraft data");
  }
});

app.listen(3000, () => {
  console.log("ATC24Radar running at http://localhost:3000");
});

app.get('/ff', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ff.html'));
});
