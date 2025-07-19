function updateMapLayout(showAircraftSidebar) {
  const mapDiv = document.getElementById("map");
  if (mapDiv) {
    mapDiv.style.left = showAircraftSidebar ? "430px" : "150px";
    mapDiv.style.width = showAircraftSidebar ? "calc(100% - 430px)" : "calc(100% - 150px)";
  }
}

window.onload = function () {
  const imageWidth = 5396;
  const imageHeight = 3959;
  const bounds = [[0, 0], [imageHeight, imageWidth]];

  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomControl: false,
    attributionControl: false
  });

  L.imageOverlay("basicairspaceupgraded.png", bounds).addTo(map);
  map.fitBounds(bounds);

  const ptfsOrigin = { x: -46040, y: 27767 };
  const pixelOrigin = { x: 3024, y: 1096 };
  const studsPerPixelX = 18.1;
  const studsPerPixelY = 23.2;

  function convertPTFSCoords(x, y) {
    const deltaX = x - ptfsOrigin.x;
    const deltaY = y - ptfsOrigin.y;
    const pixelX = pixelOrigin.x + deltaX / studsPerPixelX;
    const pixelY = pixelOrigin.y - deltaY / studsPerPixelY;
    return [pixelY, pixelX];
  }

  const aircraftMarkers = {};

  async function fetchAircraft() {
    try {
      const response = await fetch("https://24controllerdata.devp1234567891.workers.dev/");
      if (!response.ok) {
        console.error("API error:", response.status);
        return;
      }

      const data = await response.json();

      Object.entries(data).forEach(([id, acft]) => {
        if (!acft.position || typeof acft.position.x !== "number" || typeof acft.position.y !== "number") return;

        const [y, x] = convertPTFSCoords(acft.position.x, acft.position.y);
        if (x < 0 || x > imageWidth || y < 0 || y > imageHeight) return;

        const latlng = [y, x];

        if (aircraftMarkers[id]) {
          aircraftMarkers[id].setLatLng(latlng);
        } else {
          const aircraftIcon = L.divIcon({
  className: 'rotated-aircraft-icon',
  html: `<img src="icons/aircraft/default/testaircrafticon.png" 
              style="transform: rotate(${(acft.heading - 90 + 360) % 360}deg); width: 32px; height: 32px;">`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const marker = L.marker(latlng, { icon: aircraftIcon }).addTo(map);

          marker.on("click", () => {
            document.getElementById("aircraft-sidebar").classList.remove("hidden");
            updateMapLayout(true);

            document.getElementById("aircraft-callsign").textContent = id;
            document.getElementById("aircraft-type").textContent = acft.aircraftType || "Unknown";
            document.getElementById("livery-airline").textContent = acft.airline || "N/A";
            document.getElementById("aircraft-image").src = acft.imageUrl || "images/default-plane.png";
            document.getElementById("dep-airport").textContent = acft.departure?.airport || "N/A";
            document.getElementById("dep-timezone").textContent = acft.departure?.timezone || "N/A";
            document.getElementById("dep-time").textContent = acft.departure?.scheduledTime || "N/A";
            document.getElementById("arr-airport").textContent = acft.arrival?.airport || "N/A";
            document.getElementById("arr-timezone").textContent = acft.arrival?.timezone || "N/A";
            document.getElementById("arr-time").textContent = acft.arrival?.scheduledTime || "N/A";
            document.querySelector(".distance-time-covered").textContent = acft.distanceCovered || "N/A";
            document.querySelector(".estimated-distance-time-left").textContent = acft.estimatedRemaining || "N/A";
            document.getElementById("aircraft-type-full").textContent = acft.aircraftTypeFull || "N/A";
            document.getElementById("Pilot").textContent = acft.playerName || "N/A";
            document.getElementById("Squawk").textContent = acft.squawk || "N/A";
            document.getElementById("Discord-Flightplan-Link").textContent = acft.flightplanLink || "N/A";
            document.getElementById("altitude").textContent = `${acft.altitude || 0} ft`;
            document.getElementById("vertical speed").textContent = `${acft.verticalSpeed || 0} ft/min`;
            document.getElementById("coordinates").textContent = `(${acft.position?.x}, ${acft.position?.y})`;
            document.getElementById("speed").textContent = `${acft.speed || 0} kt`;
            document.getElementById("groundspeed").textContent = `${acft.groundSpeed || 0} kt`;
            document.getElementById("FIR-UIR").textContent = acft.fir || "N/A";
            document.getElementById("track").textContent = `${acft.heading || 0}°`;
          });

          aircraftMarkers[id] = marker;
        }
      });
    } catch (err) {
      console.error("Failed to fetch aircraft:", err);
    }
  }

  fetchAircraft();
  setInterval(fetchAircraft, 1000);

  document.getElementById("close-aircraft-sidebar").addEventListener("click", () => {
    document.getElementById("aircraft-sidebar").classList.add("hidden");
    updateMapLayout(false);
  });
};

function parseWindString(windStr) {
  const match = /^(\d{1,3})\/(\d{1,3})$/.exec(windStr);
  if (!match) return null;
  return {
    direction: parseInt(match[1], 10),
    speed: parseInt(match[2], 10)
  };
}

async function updateWindDisplay() {
  try {
    const response = await fetch("https://24controllerdata.devp1234567891.workers.dev/");
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();

    const aircraftList = Object.values(data);
    const windRaw = aircraftList[0]?.wind;
    const wind = parseWindString(windRaw);

    const windInfoEl = document.getElementById("wind-info");
    if (windInfoEl) {
      if (wind) {
        windInfoEl.textContent = `${wind.direction}° @ ${wind.speed}kts`;
      } else {
        windInfoEl.textContent = "Wind data unavailable";
      }
    }
  } catch (err) {
    console.error("Failed to fetch wind data:", err);
    const windInfoEl = document.getElementById("wind-info");
    if (windInfoEl) {
      windInfoEl.textContent = "Wind data unavailable";
    }
  }
}

updateWindDisplay();
setInterval(updateWindDisplay, 5000);

function updateUTCClock() {
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById("utc-time").textContent = `${utcHours}:${utcMinutes}:${utcSeconds} UTC`;
}

setInterval(updateUTCClock, 1000);