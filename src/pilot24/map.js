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

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 4,
  zoomSnap: 0.25,
  attributionControl: false,
  zoomControl: false
});

L.imageOverlay("images/ptfsmapfullres.png", imageBounds).addTo(map);
map.setView([imageHeight / 2, imageWidth / 2], 0);

function apiPositionToLatLng(apiX, apiY) {
  const dx = apiX - ptfsCenter.x;
  const dy = apiY - ptfsCenter.y;
  const mapX = (imageWidth / 2) + dx * scale;
  const mapY = (imageHeight / 2) - dy * scale;
  return [mapY, mapX];
}

const aircraftMarkers = new Map();
const aircraftPaths = new Map();
const aircraftTrailLayers = new Map();
const aircraftTrailVisible = new Map();

map.on("click", (e) => {
  // Hide the sidebar
  document.getElementById("aircraft-sidebar").classList.add("hidden");

  // Hide all aircraft trails
  for (const [callsign, polyline] of aircraftTrailLayers.entries()) {
    if (map.hasLayer(polyline)) {
      map.removeLayer(polyline);
    }
    aircraftTrailVisible.set(callsign, false);
  }
});

document.getElementById("close-aircraft-sidebar").addEventListener("click", () => {
  document.getElementById("aircraft-sidebar").classList.add("hidden");
});

async function fetchAndPlotAircraft() {
  try {
    const response = await fetch("https://24controllerdata.devp1234567891.workers.dev/");
    const data = await response.json();
    const callsigns = Object.keys(data);
    const activeSet = new Set(callsigns);

    for (const oldCallsign of aircraftMarkers.keys()) {
      if (!activeSet.has(oldCallsign)) {
        map.removeLayer(aircraftMarkers.get(oldCallsign));
        aircraftMarkers.delete(oldCallsign);
        if (aircraftTrailLayers.has(oldCallsign)) {
          map.removeLayer(aircraftTrailLayers.get(oldCallsign));
          aircraftTrailLayers.delete(oldCallsign);
        }
        aircraftPaths.delete(oldCallsign);
        aircraftTrailVisible.delete(oldCallsign);
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
        const iconImg = marker.getElement()?.querySelector("img");
        if (iconImg) iconImg.style.transform = `rotate(${heading}deg)`;
      } else {
        const icon = L.divIcon({
          className: "aircraft-icon",
          html: `<img src="icons/aircraft/default/testaircraft.png" style="transform: rotate(${heading}deg); width: 32px; height: 32px;">`,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          document.getElementById("aircraft-sidebar").classList.remove("hidden");
          document.getElementById("aircraft-sidebar").style.left = "150px";
          document.getElementById("aircraft-sidebar").style.right = "auto";

          document.getElementById("aircraft-callsign").textContent = callsign;
          document.getElementById("aircraft-type").textContent = ac.aircraftType || "N/A";
          document.getElementById("livery-airline").textContent = ac.airline || "N/A";
          document.getElementById("aircraft-image").src = ac.imageUrl || "images/default-plane.png";
          document.getElementById("dep-airport").textContent = ac.departure?.airport || "N/A";
          document.getElementById("dep-timezone").textContent = ac.departure?.timezone || "N/A";
          document.getElementById("dep-time").textContent = ac.departure?.scheduledTime || "N/A";
          document.getElementById("arr-airport").textContent = ac.arrival?.airport || "N/A";
          document.getElementById("arr-timezone").textContent = ac.arrival?.timezone || "N/A";
          document.getElementById("arr-time").textContent = ac.arrival?.scheduledTime || "N/A";
          document.querySelector(".distance-time-covered").textContent = ac.distanceCovered || "N/A";
          document.querySelector(".estimated-distance-time-left").textContent = ac.estimatedRemaining || "N/A";
          document.getElementById("aircraft-type-full").textContent = ac.aircraftTypeFull || "N/A";
          document.getElementById("Pilot").textContent = ac.playerName || "N/A";
          document.getElementById("Squawk").textContent = ac.squawk || "N/A";
          document.getElementById("Discord-Flightplan-Link").textContent = ac.flightplanLink || "N/A";
          document.getElementById("altitude").textContent = `${ac.altitude || 0} ft`;
          document.getElementById("vertical speed").textContent = `${ac.verticalSpeed || 0} ft/min`;
          document.getElementById("coordinates").textContent = `(${ac.position.x}, ${ac.position.y})`;
          document.getElementById("speed").textContent = `${ac.speed || 0} kt`;
          document.getElementById("groundspeed").textContent = `${ac.groundSpeed || 0} kt`;
          document.getElementById("FIR-UIR").textContent = ac.fir || "N/A";
          document.getElementById("track").textContent = `${ac.heading || 0}°`;

          const path = aircraftPaths.get(callsign);
          const trailShown = aircraftTrailVisible.get(callsign) || false;

          for (const [otherCallsign, polyline] of aircraftTrailLayers.entries()) {
            map.removeLayer(polyline);
            aircraftTrailVisible.set(otherCallsign, false);
          }

          if (!trailShown && path) {
            const polyline = L.polyline(path, {
              color: 'blue',
              weight: 2,
              opacity: 0.7,
              smoothFactor: 1
            }).addTo(map);
            aircraftTrailLayers.set(callsign, polyline);
            aircraftTrailVisible.set(callsign, true);
          } else {
            aircraftTrailVisible.set(callsign, false);
          }
        });

        aircraftTrailVisible.set(callsign, false);
        aircraftMarkers.set(callsign, marker);
      }

      if (!aircraftPaths.has(callsign)) aircraftPaths.set(callsign, []);
      const path = aircraftPaths.get(callsign);
      const lastPos = path[path.length - 1];
      if (!lastPos || lastPos[0] !== lat || lastPos[1] !== lng) path.push([lat, lng]);

      if (aircraftTrailVisible.get(callsign)) {
        if (aircraftTrailLayers.has(callsign)) {
          map.removeLayer(aircraftTrailLayers.get(callsign));
        }
        const updatedPolyline = L.polyline(path, {
          color: 'blue',
          weight: 2,
          opacity: 0.7,
          smoothFactor: 1
        }).addTo(map);
        aircraftTrailLayers.set(callsign, updatedPolyline);
      }
    }
  } catch (err) {
    console.error("Error fetching aircraft data:", err);
  }
}

fetchAndPlotAircraft();
setInterval(fetchAndPlotAircraft, 5000);

function updateUTCClock() {
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById("utc-time").textContent = `${utcHours}:${utcMinutes}:${utcSeconds} UTC`;
}
setInterval(updateUTCClock, 1000);

function parseWindString(windStr) {
  const match = /^\d{1,3}\/\d{1,3}$/.exec(windStr);
  if (!match) return null;
  const [dir, spd] = windStr.split("/").map(Number);
  return { direction: dir, speed: spd };
}

async function updateWindDisplay() {
  try {
    const response = await fetch("https://24controllerdata.devp1234567891.workers.dev/");
    const data = await response.json();
    const first = Object.values(data)[0];
    const wind = parseWindString(first?.wind);
    const el = document.getElementById("wind-info");
    if (wind) {
      el.textContent = `${wind.direction}° @ ${wind.speed}kts`;
    } else {
      el.textContent = "Wind data unavailable";
    }
  } catch (e) {
    document.getElementById("wind-info").textContent = "Wind data unavailable";
  }
}

updateWindDisplay();
setInterval(updateWindDisplay, 5000);

const windDisplay = document.getElementById("wind-display");
if (windDisplay) {
  windDisplay.style.left = "auto";
  windDisplay.style.right = "5px";
}