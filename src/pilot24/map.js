const imageWidth = 14453;
const imageHeight = 13800;
const imageBounds = [[0, 0], [imageHeight, imageWidth]];

const ptfsBounds = {
  top_left:     { x: -49222.1, y: -45890.8 },
  bottom_right: { x:  47132.9, y:  46139.2 }
};

const ptfsCenter = {
  x: (ptfsBounds.top_left.x + ptfsBounds.bottom_right.x) / 2,
  y: (ptfsBounds.top_left.y + ptfsBounds.bottom_right.y) / 2
};

const ptfsWidth = ptfsBounds.bottom_right.x - ptfsBounds.top_left.x;
const ptfsHeight = ptfsBounds.bottom_right.y - ptfsBounds.top_left.y;

const scaleX = imageWidth / ptfsWidth;
const scaleY = imageHeight / ptfsHeight;
const scale = Math.min(scaleX, scaleY);

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 4,
  zoomSnap: 0.25,
  attributionControl: false,
  zoomControl: false
});

L.imageOverlay('images/ptfsmapfullres.png', imageBounds).addTo(map);
map.setView([imageHeight / 2, imageWidth / 2], 0);

function apiPositionToLatLng(apiX, apiY) {
  const dx = apiX - ptfsCenter.x;
  const dy = apiY - ptfsCenter.y;
  const mapX = (imageWidth / 2) + dx * scale;
  const mapY = (imageHeight / 2) - dy * scale;
  return [mapY, mapX];
}

const aircraftMarkers = new Map();

async function fetchAndPlotAircraft() {
  try {
    const response = await fetch('https://24controllerdata.devp1234567891.workers.dev/');
    const data = await response.json();
    const callsigns = Object.keys(data);
    const activeSet = new Set(callsigns);

    for (const oldCallsign of aircraftMarkers.keys()) {
      if (!activeSet.has(oldCallsign)) {
        map.removeLayer(aircraftMarkers.get(oldCallsign));
        aircraftMarkers.delete(oldCallsign);
      }
    }

    for (const callsign of callsigns) {
      const ac = data[callsign];
      if (!ac.position) continue;
      const [lat, lng] = apiPositionToLatLng(ac.position.x, ac.position.y);
      const heading = ac.heading || 0;

      if (aircraftMarkers.has(callsign)) {
        const marker = aircraftMarkers.get(callsign);
        marker.setLatLng([lat, lng]);
        const iconImg = marker.getElement()?.querySelector('img');
        if (iconImg) iconImg.style.transform = `rotate(${heading}deg)`;
      } else {
        const icon = L.divIcon({
          className: 'aircraft-icon',
          html: `<img src="src/pilot24/icons/aircraft/default/testaircraft.png" style="transform: rotate(${heading}deg); width: 32px; height: 32px;">`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);

        marker.bindPopup(`
          <b>${callsign}</b><br>
          Type: ${ac.aircraftType}<br>
          Pilot: ${ac.playerName}<br>
          Altitude: ${ac.altitude} ft<br>
          Speed: ${ac.speed} kts<br>
          Heading: ${ac.heading}°
        `);

        aircraftMarkers.set(callsign, marker);
      }
    }
  } catch (err) {
    console.error('Error fetching aircraft data:', err);
  }
}

fetchAndPlotAircraft();
setInterval(fetchAndPlotAircraft, 5000);