const socket = new WebSocket('wss://24data.ptfs.app/wss');

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

L.imageOverlay("/src/unified/images/map/ptfsmapfullres.png", imageBounds).addTo(map);
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

map.on("click", () => {
  document.getElementById("aircraft-sidebar").classList.add("hidden");
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

document.querySelector(".settings-btn").addEventListener("click", () => {
  document.getElementById("settings-sidebar").classList.remove("hidden");
});

document.getElementById("close-settings-sidebar").addEventListener("click", () => {
  document.getElementById("settings-sidebar").classList.add("hidden");
});

function parseWindString(windStr) {
  const match = /^\d{1,3}\/\d{1,3}$/.exec(windStr);
  if (!match) return null;
  const [dir, spd] = windStr.split("/").map(Number);
  return { direction: dir, speed: spd };
}

function updateWindDisplay(data) {
  const first = Object.values(data)[0];
  const wind = parseWindString(first?.wind);
  const el = document.getElementById("wind-info");
  el.textContent = wind ? `${wind.direction}° @ ${wind.speed}kts` : "Wind data unavailable";
}

function plotAircraft(data) {
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
    // Debug: log each aircraft's callsign and computed map position
    console.log(`Aircraft: ${callsign}, PTFS: (${ac.position.x}, ${ac.position.y}), Map: (${lat}, ${lng})`);
    const heading = ac.heading || 0;

    if (aircraftMarkers.has(callsign)) {
      const marker = aircraftMarkers.get(callsign);
      marker.setLatLng([lat, lng]);
      const iconImg = marker.getElement()?.querySelector("img");
      if (iconImg) iconImg.style.transform = `rotate(${heading}deg)`;
    } else {
      const icon = L.divIcon({
        className: "aircraft-icon",
        html: `<img src="/src/unified/icons/aircraft/default/testaircraft.png" style="transform: rotate(${heading}deg); width: 32px; height: 32px;">`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        const sidebar = document.getElementById("aircraft-sidebar");
        sidebar.classList.remove("hidden");
        sidebar.style.left = "150px";
        sidebar.style.right = "auto";
        document.getElementById("aircraft-image").src = ac.imageUrl || "images/default-plane.png";
        document.getElementById("callsign").textContent = callsign || "N/A";
        document.getElementById("aircraft-type").textContent = ac.aircraftTypeFull || ac.aircraftType || "N/A";
        document.getElementById("route-label").textContent = `${ac.departure?.airport || "?"} → ${ac.arrival?.airport || "?"}`;
        document.getElementById("aircraft-type-full").textContent = ac.aircraftTypeFull || "N/A";
        document.getElementById("Pilot").textContent = ac.playerName || "N/A";
        document.getElementById("Squawk").textContent = ac.squawk || "N/A";
        document.getElementById("Discord-Flightplan-Link").textContent = ac.flightplanLink || "N/A";
        document.getElementById("altitude").textContent = ac.altitude ? `${ac.altitude} ft` : "0 ft";
        document.getElementById("vertical speed").textContent = ac.verticalSpeed ? `${ac.verticalSpeed} ft/min` : "0 ft/min";
        document.getElementById("coordinates").textContent = ac.position?.x !== undefined && ac.position?.y !== undefined
          ? `(${ac.position.x}, ${ac.position.y})` : "(?, ?)";
        document.getElementById("speed").textContent = ac.speed ? `${ac.speed} kt` : "0 kt";
        document.getElementById("groundspeed").textContent = ac.groundSpeed ? `${ac.groundSpeed} kt` : "0 kt";
        document.getElementById("FIR-UIR").textContent = ac.fir || "N/A";
        document.getElementById("track").textContent = `${ac.heading || 0}°`;
        document.getElementById("Radar").textContent = ac.playerName || "N/A";
        document.getElementById("flight-rules").textContent = ac.status || "N/A";
        document.getElementById("Route").textContent = ac.route || ac.routePath || "N/A";
        document.getElementById("FlightTime").textContent = ac.flightTime || "N/A";

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
  }
}

socket.addEventListener('message', (event) => {
  try {
    console.log("WebSocket message:", event.data);
    let data = JSON.parse(event.data);
    if (data && typeof data === "object" && data.t !== undefined) {
      return;
    }
    if (Array.isArray(data)) {
      const obj = {};
      for (const ac of data) {
        if (ac.callsign) obj[ac.callsign] = ac;
      }
      data = obj;
    }
    if (data && typeof data === "object" && Object.keys(data).length > 0) {
      console.log("Parsed aircraft data to plot:", data);
      updateWindDisplay(data);
      plotAircraft(data);
    } else {
      console.warn("WebSocket: Unexpected data format", data);
    }
  } catch (err) {
    console.error("WebSocket radar data error:", err);
    document.getElementById("wind-info").textContent = "Wind data unavailable";
  }
});

socket.addEventListener('open', () => {
  console.log("WebSocket connection opened");
  // Example: socket.send(JSON.stringify({type: "auth", token: "YOUR_TOKEN"}));
});
socket.addEventListener('close', (event) => {
  console.log("WebSocket connection closed", event);
  if (event.code || event.reason) {
    console.log("Close code:", event.code, "Reason:", event.reason);
  }
});
socket.addEventListener('error', (e) => {
  console.error("WebSocket error", e);
});

function updateUTCClock() {
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById("utc-time").textContent = `${utcHours}:${utcMinutes}:${utcSeconds} UTC`;
}
setInterval(updateUTCClock, 1000);

const Waypoints = [
  // Grindavik
  { name: "BULLY", px: 3240, py: 1520, size: 64 }, //bully
  { name: "FROOT", px: 3785, py: 1490, size: 64 }, //fruit
  { name: "EURAD", px: 4030, py: 1732, size: 64 }, //Yurad
  { name: "BOBOS", px: 3620, py: 1915, size: 64 }, //bowbows?
  { name: "THENR", px: 3910, py: 2032, size: 64 }, //thenner
  { name: "BLANK", px: 4194, py: 1526, size: 64 }, //blank
  { name: "ACRES", px: 4435, py: 1672, size: 64 }, //acres
  { name: "YOUTH", px: 4580, py: 1920, size: 64 }, //youth
  { name: "UWAIS", px: 4785, py: 2048, size: 64 }, //Eww Wais
  { name: "FRANK", px: 5032, py: 1715, size: 64 }, //Frank
  { name: "CELAR", px: 5201, py: 1843, size: 64 }, //Sellar
  { name: "EZYDB", px: 5442, py: 1964, size: 64 }, //EasyDub
  { name: "THACC", px: 5580, py: 1710, size: 64 }, //Thack
  { name: "SHREK", px: 5784, py: 1830, size: 64 }, //Shrek
  { name: "SPACE", px: 6031, py: 2000, size: 64 }, //Space

  // Sauthemptona
  { name: "HACKE", px: 6543, py: 2125, size: 64 }, //Hack
  { name: "HECKS", px: 6715, py: 2260, size: 64 }, //Hecks
  { name: "GEORG", px: 6891, py: 2503, size: 64 }, //George
  { name: "SEEKS", px: 7002, py: 2780, size: 64 }, //Seeks
  { name: "PACKT", px: 7150, py: 3015, size: 64 }, //Packet
  { name: "ALDER", px: 7341, py: 3250, size: 64 }, //Alder
  { name: "STACK", px: 7555, py: 3422, size: 64 }, //Stack
  { name: "WASTE", px: 7721, py: 3650, size: 64 }, //Waste
  { name: "HOGGS", px: 7880, py: 3870, size: 64 }, //Hoggs
  { name: "ROBUX", px: 8100, py: 4085, size: 64 }, //Robux

  // Rockford
  { name: "ENDER", px: 8405, py: 4290, size: 64 }, //Ender
  { name: "SUNST", px: 8622, py: 4408, size: 64 }, //Sunset
  { name: "BUCFA", px: 8811, py: 4642, size: 64 }, //Buckfuh
  { name: "KENED", px: 8940, py: 4860, size: 64 }, //Keneddy? kened?
  { name: "SETHR", px: 9122, py: 5055, size: 64 }, //Sether
  { name: "KUNAV", px: 9312, py: 5192, size: 64 }, //Kunnov
  { name: "HAWFA", px: 9515, py: 5320, size: 64 }, //Haw Fuh
  { name: "SAWPE", px: 9684, py: 5535, size: 64 }, //Saw pee
  { name: "BEANS", px: 9880, py: 5742, size: 64 }, //Beans
  { name: "LOGAN", px: 10050, py: 5883, size: 64 }, //Logan

  // Larnaca
  { name: "RENTS", px: 10212, py: 6042, size: 64 }, //Rents
  { name: "GRASS", px: 10345, py: 6210, size: 64 }, //Grass
  { name: "AQWRT", px: 10492, py: 6395, size: 64 }, //Aquirt
  { name: "FORIA", px: 10650, py: 6548, size: 64 }, //Forya
  { name: "FORCE", px: 10822, py: 6705, size: 64 }, //Force
  { name: "MASEV", px: 11004, py: 6832, size: 64 }, //Masiv
  { name: "ALTRS", px: 11180, py: 6972, size: 64 }, //Alters
  { name: "MUONE", px: 11342, py: 7112, size: 64 }, //Mew Own
  { name: "JAZZR", px: 11482, py: 7268, size: 64 }, //Jazzer
  { name: "NUBER", px: 11630, py: 7410, size: 64 }, //New ber
  { name: "BOBUX", px: 11755, py: 7554, size: 64 }, //Bobux
  { name: "DEBUG", px: 11884, py: 7692, size: 64 }, //Debug
  { name: "JACKI", px: 12045, py: 7820, size: 64 }, //Jacky

  // Skopelos
  { name: "CAWZE", px: 12202, py: 7958, size: 64 }, //Cawz ey
  { name: "ANYMS", px: 12345, py: 8092, size: 64 }, //Ay nims

  // Izolirani
  { name: "CAMEL", px: 12501, py: 8220, size: 64 }, //Camel
  { name: "CYRIL", px: 12632, py: 8355, size: 64 }, //S eye ril, sir il
  { name: "DUNKS", px: 12794, py: 8490, size: 64 }, //Dunks
  { name: "DOGGO", px: 12922, py: 8620, size: 64 }, //Dog Oh
  { name: "JUSTY", px: 13071, py: 8742, size: 64 }, //Justy
  { name: "CHAIN", px: 13215, py: 8860, size: 64 }, //Chain
  { name: "BILLO", px: 13342, py: 8992, size: 64 }, //Bill oh
  { name: "ABSRS", px: 13494, py: 9121, size: 64 }, //Abserse
  { name: "MORRD", px: 13655, py: 9240, size: 64 }, //Mord
  { name: "LLIME", px: 13802, py: 9360, size: 64 }, //Lime
  { name: "UDMUG", px: 13940, py: 9492, size: 64 }, //Uhd mug
  { name: "ROSMO", px: 14091, py: 9625, size: 64 }, //Ros moh

    // Saint Barts (continued)
  { name: "PROBE", px: 14800, py: 10315, size: 64 }, //Probe
  { name: "DINER", px: 14942, py: 10460, size: 64 }, //Diner
  { name: "INDEX", px: 15105, py: 10610, size: 64 }, //Index
  { name: "GAVIN", px: 15242, py: 10762, size: 64 }, //Gavin
  { name: "SILVA", px: 15405, py: 10895, size: 64 }, //Silva
  { name: "OCEEN", px: 15562, py: 11048, size: 64 }, //Oceen?

  // Perth
  { name: "CRAZY", px: 15710, py: 11192, size: 64 }, //crazy
  { name: "WOTAN", px: 15845, py: 11342, size: 64 }, //woah ton
  { name: "WAGON", px: 16002, py: 11485, size: 64 }, //wagon
  { name: "WELLS", px: 16140, py: 11642, size: 64 }, //wells
  { name: "SQUID", px: 16282, py: 11788, size: 64 }, //squid
  { name: "KELLA", px: 16432, py: 11945, size: 64 }, //kell uh
  { name: "ZESTA", px: 16575, py: 12095, size: 64 }, //zest uh
  { name: "NOONU", px: 16728, py: 12242, size: 64 }, //Newnew
  { name: "SISTA", px: 16880, py: 12388, size: 64 }, //Sistuh
  { name: "TALIS", px: 17015, py: 12530, size: 64 }, //Talis
  { name: "STRAX", px: 17164, py: 12682, size: 64 }, //Strax
  { name: "TINDR", px: 17310, py: 12830, size: 64 }, //Tinder

  // Tokyo
  { name: "SHELL", px: 17462, py: 12980, size: 64 }, //Shell
  { name: "NIKON", px: 17602, py: 13122, size: 64 }, //neekon
  { name: "CHILY", px: 17745, py: 13265, size: 64 }, //chilly
  { name: "SHIBA", px: 17892, py: 13405, size: 64 }, //shee buh
  { name: "LETSE", px: 18031, py: 13552, size: 64 }, //lets see
  { name: "HONDA", px: 18175, py: 13702, size: 64 }, //Honda
  { name: "ASTRO", px: 18320, py: 13842, size: 64 }, //Astro
  { name: "GULEG", px: 18480, py: 13988, size: 64 }, //goo leg
  { name: "PIPER", px: 18615, py: 14140, size: 64 }, //Piper
  { name: "TUDEP", px: 18760, py: 14285, size: 64 }, //too dep
  { name: "ALLRY", px: 18902, py: 14430, size: 64 }, //all rey
  { name: "ONDER", px: 19052, py: 14585, size: 64 }, //Onder
  { name: "KNIFE", px: 19205, py: 14732, size: 64 }, //Knife
];

function renderWaypoints(list) {
  list.forEach(({ name, px, py, size }) => {
    const [lat, lng] = apiPositionToLatLng(px, py);
    const icon = L.divIcon({
      className: "waypoint-icon",
      html: `
        <div class="waypoint-wrapper" style="width:${size}px; height:${size}px;">
          <div class="waypoint-label">${name}</div>
          <img src="/src/unified/icons/map/fix.RNAVFlyOver.png" style="width:${size}px; height:${size}px;">
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
    L.marker([lat, lng], { icon }).addTo(map);
  });
}

renderWaypoints(Waypoints);

map.on("zoomend", () => {
  const zoom = map.getZoom();
  document.querySelectorAll(".waypoint-wrapper img").forEach(img => {
    const baseSize = 64; // your full size at zoom level 0
    const adjustedSize = baseSize * Math.pow(0.85, Math.abs(zoom));
    img.style.width = `${adjustedSize}px`;
    img.style.height = `${adjustedSize}px`;
  });
});

const getSizeForZoom = (zoom) => {
  if (zoom >= 2) return 128;
  if (zoom >= 0) return 96;
  if (zoom >= -2) return 64;
  return 48;
};

let wHeld = false;
let startPoint = null;
let tempLine = null;
let infoLabel = null;

// Approximate conversion: 1 pixel ≈ 0.00053996 nm (based on 1 pixel ≈ 1 meter)
const pixelToNM = 1 / 1852;

function calculateAngle(p1, p2) {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  let angleDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (angleDeg < 0) angleDeg += 360;
  return angleDeg.toFixed(1);
}

function calculateDistanceNM(p1, p2) {
  // PTFS bounds in studs
  const ptfsWidthStuds = 47132.9 - (-49222.1);
  const ptfsHeightStuds = 46139.2 - (-45890.8);

  // Image dimensions in pixels
  const imageWidth = 14453;
  const imageHeight = 13800;

  // Average studs per pixel
  const studsPerPixelX = ptfsWidthStuds / imageWidth;
  const studsPerPixelY = ptfsHeightStuds / imageHeight;
  const studsPerPixel = (studsPerPixelX + studsPerPixelY) / 2;

  // Conversion: 1 stud = 0.56 meters → meters per stud ÷ meters per nm
  const nmPerStud = 0.56 / 1852;

  // Pixel distance between points
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);

  // Final distance in nautical miles
  const distanceNM = pixelDistance * studsPerPixel * nmPerStud;
  return distanceNM.toFixed(2);
}

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "w") {
    wHeld = true;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "w") {
    wHeld = false;
    if (tempLine) {
      map.removeLayer(tempLine);
      tempLine = null;
    }
    if (infoLabel) {
      map.removeLayer(infoLabel);
      infoLabel = null;
    }
    startPoint = null;
  }
});

map.on("click", (e) => {
  if (!wHeld) return;
  startPoint = e.latlng;
});

map.on("mousemove", (e) => {
  if (!wHeld || !startPoint) return;

  const endPoint = e.latlng;
  const points = [startPoint, endPoint];

  if (tempLine) {
    tempLine.setLatLngs(points);
  } else {
    tempLine = L.polyline(points, {
      color: 'red',
      weight: 2,
      opacity: 0.8,
      dashArray: "4,6"
    }).addTo(map);
  }

  const angle = calculateAngle(startPoint, endPoint);
  const distance = calculateDistanceNM(startPoint, endPoint);

  if (infoLabel) {
    infoLabel.setLatLng(endPoint);
    infoLabel.setContent(`🧭 ${angle}°<br>📏 ${distance} nm`);
  } else {
    infoLabel = L.popup({
      closeButton: false,
      autoClose: false,
      className: "line-info-popup"
    })
      .setLatLng(endPoint)
      .setContent(`🧭 ${angle}°<br>📏 ${distance} nm`)
      .addTo(map);
  }
});

document.querySelectorAll('.section-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const content = button.nextElementSibling;
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
    button.textContent = button.textContent.includes('▲') ?
      button.textContent.replace('▲', '▼') :
      button.textContent.replace('▼', '▲');
  });
});