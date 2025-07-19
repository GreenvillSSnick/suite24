const aircraftListContainer = document.getElementById('aircraft-list');

// Maps for DOM and path tracking
const aircraftDOMMap = new Map();      // callsign -> DOM element
const aircraftPaths = new Map();       // callsign -> [ [x, y], [x, y], ... ]

async function fetchAircraftData() {
  try {
    const response = await fetch('https://24controllerdata.devp1234567891.workers.dev/');
    const data = await response.json();
    const callsignsInData = new Set(Object.keys(data));

    for (const callsign of callsignsInData) {
      const ac = data[callsign];
      const { x, y } = ac.position ?? {};

      // Track paths
      if (x != null && y != null) {
        if (!aircraftPaths.has(callsign)) aircraftPaths.set(callsign, []);
        const path = aircraftPaths.get(callsign);
        const last = path[path.length - 1];
        if (!last || last[0] !== x || last[1] !== y) {
          path.push([x, y]);
          if (path.length > 100) path.shift(); // limit to last 100 points
        }
      }

      // Update or create DOM element
      if (aircraftDOMMap.has(callsign)) {
        updateAircraftEntry(aircraftDOMMap.get(callsign), ac, callsign);
      } else {
        const entry = createAircraftEntry(ac, callsign);
        aircraftListContainer.appendChild(entry);
        aircraftDOMMap.set(callsign, entry);
      }
    }

    // Remove aircraft that disappeared
    for (const oldCallsign of aircraftDOMMap.keys()) {
      if (!callsignsInData.has(oldCallsign)) {
        aircraftDOMMap.get(oldCallsign).remove();
        aircraftDOMMap.delete(oldCallsign);
        aircraftPaths.delete(oldCallsign);
      }
    }
  } catch (err) {
    console.error('Error fetching aircraft:', err);
    aircraftListContainer.textContent = 'Failed to load aircraft data.';
  }
}

// Create a new aircraft DOM entry
function createAircraftEntry(ac, callsign) {
  const div = document.createElement('div');
  div.className = 'aircraft-entry';
  div.dataset.callsign = callsign;
  updateAircraftEntry(div, ac, callsign);
  return div;
}

// Update aircraft DOM element
function updateAircraftEntry(div, ac, callsign) {
  const altitude = ac.altitude ?? 'N/A';
  const speed = ac.speed ?? 'N/A';
  const heading = ac.heading ?? 'N/A';
  const type = ac.aircraftType ?? 'Unknown';
  const player = ac.playerName ?? 'N/A';
  const onGround = ac.isOnGround ? '🟢 Ground' : '🛫 Air';

  div.textContent = `${callsign} (${type}) — Pilot: ${player} — Alt: ${altitude} ft, Spd: ${speed} kts, HDG: ${heading}°, ${onGround}`;

  // Optional: highlight on update
  div.style.backgroundColor = '#e0f4ff';
  setTimeout(() => {
    div.style.backgroundColor = '';
  }, 300);
}

// Start fetching every 5s
fetchAircraftData();
setInterval(fetchAircraftData, 5000);