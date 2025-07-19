//getting acft data from the api and organizing it
async function fetchAircraftData() {
  try {
    const response = await fetch('https://24controllerdata.devp1234567891.workers.dev/');
    const data = await response.json(); // <- It's an object, not an array

    const container = document.getElementById('aircraft-list');
    container.innerHTML = '';

    const keys = Object.keys(data);

    if (keys.length > 0) {
      keys.forEach(callsign => {
        const ac = data[callsign];

        const entry = document.createElement('div');
        entry.className = 'aircraft-entry';

        const altitude = ac.altitude ?? 'N/A';
        const speed = ac.speed ?? 'N/A';
        const heading = ac.heading ?? 'N/A';
        const type = ac.aircraftType ?? 'Unknown';
        const player = ac.playerName ?? 'N/A';

        entry.textContent = `${callsign} (${type}) — Pilot: ${player} — Alt: ${altitude} ft, Spd: ${speed} kts, HDG: ${heading}°`;
        container.appendChild(entry);
      });
    } else {
      container.innerHTML = 'No aircraft currently.';
    }
  } catch (err) {
    console.error('Error fetching aircraft:', err);
    document.getElementById('aircraft-list').textContent = 'Failed to load aircraft data.';
  }
}

// Fetch immediately and every 5 seconds
fetchAircraftData();
setInterval(fetchAircraftData, 5000);