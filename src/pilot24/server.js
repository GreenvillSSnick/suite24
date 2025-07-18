const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.static("public"));

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


//setting up ff + other subdomains
app.get('/ff', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ff.html'));
});