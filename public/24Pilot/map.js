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

L.imageOverlay("/unified/images/map/ptfsmapfullres.png", imageBounds).addTo(map);
map.setView([imageHeight / 2, imageWidth / 2], 0);

function apiPositionToLatLng(apiX, apiY) {
  const dx = apiX - ptfsCenter.x;
  const dy = apiY - ptfsCenter.y;
  const mapX = (imageWidth / 2) + dx * scale;
  const mapY = (imageHeight / 2) - dy * scale;
  return [mapY, mapX];
}

// For waypoints: px/py are top-left-relative pixel coordinates
function waypointPositionToLatLng(px, py) {
  // Flip py so 0 is top, imageHeight is bottom
  return [imageHeight - py, px];
}

let cachedFlightPlans = {};
const aircraftMarkers = new Map();
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

async function fetchAircraftPath(callsign) {
  const response = await fetch(`/api/paths/${callsign}`);
  if (!response.ok) {
    console.error(`Failed to fetch path for ${callsign}:`, response.statusText);
    return null;
  }
  const points = await response.json();
  return points.map(p => apiPositionToLatLng(p.x, p.y));
}

async function saveAircraftPath(callsign, points) {
  const response = await fetch(`/api/paths/${callsign}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(points)
  });
  if (!response.ok) {
    console.error(`Failed to save path for ${callsign}:`, response.statusText);
    return false;
  }
  return true;
}

async function deleteAircraftPath(callsign) {
  const response = await fetch(`/api/paths/${callsign}`, {
    method: 'DELETE'
  });
  if (!response.ok) {
    console.error(`Failed to delete path for ${callsign}:`, response.statusText);
    return false;
  }
  return true;
}

async function getOrInitAircraftPath(callsign) {
  let path = await fetchAircraftPath(callsign);
  if (!path) {
    path = [];
    await updateAircraftPath(callsign, path);
  }
  return path;
}

async function fetchAircraftData() {
  const res = await fetch('/api/acft-data');
  const json = await res.json();
  const aircraft = json.aircraftData;

  const first = Object.values(aircraft)[0];
  const windStr = first?.wind;
  let windText = "Wind data unavailable";
  if (windStr && /^\d{1,3}\/\d{1,3}$/.test(windStr)) {
    const [dir, spd] = windStr.split("/").map(Number);
    windText = `${dir}° @ ${spd}kts`;
  }
  document.getElementById("wind-info").textContent = windText;

  plotAircraft(aircraft);
}

async function updateVisibleAircraftTrails() {
  for (const [callsign, visible] of aircraftTrailVisible.entries()) {
    if (visible) {
      const polyline = aircraftTrailLayers.get(callsign);
      if (polyline) {
        // Fetch the latest path points from your API or local cache
        const newPath = await fetchAircraftPath(callsign);
        if (newPath && newPath.length) {
          polyline.setLatLngs(newPath);
        }
      }
    }
  }
}

setInterval(fetchAircraftData, 500);
setInterval(updateVisibleAircraftTrails, 500);

async function plotAircraft(data) {
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
      await deleteAircraftPath(oldCallsign);
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
        html: `<img src="/unified/icons/aircraft/default/testaircraft.png" style="transform: rotate(${heading}deg); width: 32px; height: 32px;">`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([lat, lng], { icon }).addTo(map);

      marker.on("click", async (e) => {
        L.DomEvent.stopPropagation(e);
        const sidebar = document.getElementById("aircraft-sidebar");
        sidebar.classList.remove("hidden");
        sidebar.style.left = "150px";
        sidebar.style.right = "auto";
        document.getElementById("aircraft-image").src = ac.imageUrl || "/unified/images/plane/vulcanlong.png";
        document.getElementById("callsign").textContent = callsign || "N/A";
        document.getElementById("aircraft-type").textContent = ac.aircraftTypeFull || ac.aircraftType || "N/A";
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

        const path = await fetchAircraftPath(callsign);
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

    await getOrInitAircraftPath(callsign);
    const path = await fetchAircraftPath(callsign);
    const lastPos = path[path.length - 1];
    if (!lastPos || lastPos[0] !== lat || lastPos[1] !== lng) path.push([lat, lng]);
  }
}

function updateUTCClock() {
  const now = new Date();
  const utcHours = String(now.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
  document.getElementById("utc-time").textContent = `${utcHours}:${utcMinutes}:${utcSeconds} UTC`;
}

setInterval(updateUTCClock, 1000);

const Waypoints = [

  // Waypoints relative to the top left of the map image

  // Top left corner
  { name: "TOPLEFT", px: -14453*2, py: -13800*2, size: 64 }, // top left

  // Center of map
  { name: "CENTER", px: imageWidth / 2, py: imageHeight / 2, size: 64 }, // center

  // Bottom right corner
  { name: "BOTTOMRIGHT", px: imageWidth, py: imageHeight, size: 64 }, // bottom right

  // Example: 100px right, 200px down from top left
  { name: "EXAMPLE1", px: 100, py: 200, size: 64 },

  // Grindavik
  { name: "BULLY", px: 0, py: 0, size: 64 }, //bully
  { name: "FROOT", px: 0, py: 0, size: 64 }, //fruit
  { name: "EURAD", px: 0, py: 0, size: 64 }, //Yurad
  { name: "BOBOS", px: 0, py: 0, size: 64 }, //bowbows?
  { name: "THENR", px: 0, py: 0, size: 64 }, //thenner
  { name: "BLANK", px: 0, py: 0, size: 64 }, //blank
  { name: "ACRES", px: 0, py: 0, size: 64 }, //acres
  { name: "YOUTH", px: 0, py: 0, size: 64 }, //youth
  { name: "UWAIS", px: 0, py: 0, size: 64 }, //Eww Wais
  { name: "FRANK", px: 0, py: 0, size: 64 }, //Frank
  { name: "CELAR", px: 0, py: 0, size: 64 }, //Sellar
  { name: "EZYDB", px: 0, py: 0, size: 64 }, //EasyDub
  { name: "THACC", px: 0, py: 0, size: 64 }, //Thack
  { name: "SHREK", px: 0, py: 0, size: 64 }, //Shrek
  { name: "SPACE", px: 0, py: 0, size: 64 }, //Space

  // Sauthemptona
  { name: "HACKE", px: 0, py: 0, size: 64 }, //Hack
  { name: "HECKS", px: 0, py: 0, size: 64 }, //Hecks
  { name: "GEORG", px: 0, py: 0, size: 64 }, //George
  { name: "SEEKS", px: 0, py: 0, size: 64 }, //Seeks
  { name: "PACKT", px: 0, py: 0, size: 64 }, //Packet
  { name: "ALDER", px: 0, py: 0, size: 64 }, //Alder
  { name: "STACK", px: 0, py: 0, size: 64 }, //Stack
  { name: "WASTE", px: 0, py: 0, size: 64 }, //Waste
  { name: "HOGGS", px: 0, py: 0, size: 64 }, //Hoggs
  { name: "ROBUX", px: 0, py: 0, size: 64 }, //Robux

  // Rockford
  { name: "ENDER", px: 0, py: 0, size: 64 }, //Ender
  { name: "SUNST", px: 0, py: 0, size: 64 }, //Sunset
  { name: "BUCFA", px: 0, py: 0, size: 64 }, //Buckfuh
  { name: "KENED", px: 0, py: 0, size: 64 }, //Keneddy? kened?
  { name: "SETHR", px: 0, py: 0, size: 64 }, //Sether
  { name: "KUNAV", px: 0, py: 0, size: 64 }, //Kunnov
  { name: "HAWFA", px: 0, py: 0, size: 64 }, //Haw Fuh
  { name: "SAWPE", px: 0, py: 0, size: 64 }, //Saw pee
  { name: "BEANS", px: 0, py: 0, size: 64 }, //Beans
  { name: "LOGAN", px: 0, py: 0, size: 64 }, //Logan

  // Larnaca
  { name: "RENTS", px: 0, py: 0, size: 64 }, //Rents
  { name: "GRASS", px: 0, py: 0, size: 64 }, //Grass
  { name: "AQWRT", px: 0, py: 0, size: 64 }, //Aquirt
  { name: "FORIA", px: 0, py: 0, size: 64 }, //Forya
  { name: "FORCE", px: 0, py: 0, size: 64 }, //Force
  { name: "MASEV", px: 0, py: 0, size: 64 }, //Masiv
  { name: "ALTRS", px: 0, py: 0, size: 64 }, //Alters
  { name: "MUONE", px: 0, py: 0, size: 64 }, //Mew Own
  { name: "JAZZR", px: 0, py: 0, size: 64 }, //Jazzer
  { name: "NUBER", px: 0, py: 0, size: 64 }, //New ber
  { name: "BOBUX", px: 0, py: 0, size: 64 }, //Bobux
  { name: "DEBUG", px: 0, py: 0, size: 64 }, //Debug
  { name: "JACKI", px: 0, py: 0, size: 64 }, //Jacky

  // Skopelos
  { name: "CAWZE", px: 0, py: 0, size: 64 }, //Cawz ey
  { name: "ANYMS", px: 0, py: 0, size: 64 }, //Ay nims

  // Izolirani
  { name: "CAMEL", px: 0, py: 0, size: 64 }, //Camel
  { name: "CYRIL", px: 0, py: 0, size: 64 }, //S eye ril, sir il
  { name: "DUNKS", px: 0, py: 0, size: 64 }, //Dunks
  { name: "DOGGO", px: 0, py: 0, size: 64 }, //Dog Oh
  { name: "JUSTY", px: 0, py: 0, size: 64 }, //Justy
  { name: "CHAIN", px: 0, py: 0, size: 64 }, //Chain
  { name: "BILLO", px: 0, py: 0, size: 64 }, //Bill oh
  { name: "ABSRS", px: 0, py: 0, size: 64 }, //Abserse
  { name: "MORRD", px: 0, py: 0, size: 64 }, //Mord
  { name: "LLIME", px: 0, py: 0, size: 64 }, //Lime
  { name: "UDMUG", px: 0, py: 0, size: 64 }, //Uhd mug
  { name: "ROSMO", px: 0, py: 0, size: 64 }, //Ros moh

    // Saint Barts
  { name: "PROBE", px: 0, py: 0, size: 64 }, //Probe
  { name: "DINER", px: 0, py: 0, size: 64 }, //Diner
  { name: "INDEX", px: 0, py: 0, size: 64 }, //Index
  { name: "GAVIN", px: 0, py: 0, size: 64 }, //Gavin
  { name: "SILVA", px: 0, py: 0, size: 64 }, //Silva
  { name: "OCEEN", px: 0, py: 0, size: 64 }, //Oceen?

  // Perth
  { name: "CRAZY", px: 0, py: 0, size: 64 }, //crazy
  { name: "WOTAN", px: 0, py: 0, size: 64 }, //woah ton
  { name: "WAGON", px: 0, py: 0, size: 64 }, //wagon
  { name: "WELLS", px: 0, py: 0, size: 64 }, //wells
  { name: "SQUID", px: 0, py: 0, size: 64 }, //squid
  { name: "KELLA", px: 0, py: 0, size: 64 }, //kell uh
  { name: "ZESTA", px: 0, py: 0, size: 64 }, //zest uh
  { name: "NOONU", px: 0, py: 0, size: 64 }, //Newnew
  { name: "SISTA", px: 0, py: 0, size: 64 }, //Sistuh
  { name: "TALIS", px: 0, py: 0, size: 64 }, //Talis
  { name: "STRAX", px: 0, py: 0, size: 64 }, //Strax
  { name: "TINDR", px: 0, py: 0, size: 64 }, //Tinder

  // Tokyo
  { name: "SHELL", px: 0, py: 0, size: 64 }, //Shell
  { name: "NIKON", px: 0, py: 0, size: 64 }, //neekon
  { name: "CHILY", px: 0, py: 0, size: 64 }, //chilly
  { name: "SHIBA", px: 0, py: 0, size: 64 }, //shee buh
  { name: "LETSE", px: 0, py: 0, size: 64 }, //lets see
  { name: "HONDA", px: 0, py: 0, size: 64 }, //Honda
  { name: "ASTRO", px: 5192.92, py: 2293.68, size: 64 }, //Astro
  { name: "GULEG", px: 0, py: 0, size: 64 }, //goo leg
  { name: "PIPER", px: 0, py: 0, size: 64 }, //Piper
  { name: "TUDEP", px: 0, py: 0, size: 64 }, //too dep
  { name: "ALLRY", px: 0, py: 0, size: 64 }, //all rey
  { name: "ONDER", px: 0, py: 0, size: 64 }, //Onder
  { name: "KNIFE", px: 0, py: 0, size: 64 }, //Knife

  //SMALL WAYPOINTS
];

function renderWaypoints(list) {
  list.forEach(({ name, px, py, size }) => {
    const [lat, lng] = waypointPositionToLatLng(px, py);
    const icon = L.divIcon({
      className: "waypoint-icon",
      html: `
        <div class="waypoint-wrapper" style="width:${size}px; height:${size}px;">
          <div class="waypoint-label">${name}</div>
          <img src="/unified/icons/map/fix.RNAVFlyOver.png" style="width:${size}px; height:${size}px;">
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
    const section = button.parentElement;
    const content = button.nextElementSibling;
    const isOpen = section.classList.contains('active');
    document.querySelectorAll('.section').forEach(s => {
      s.classList.remove('active');
      s.querySelector('.section-toggle').classList.remove('open');
    });
    if (!isOpen) {
      section.classList.add('active');
      button.classList.add('open');
    }
  });
});

// SID/STAR definitions
const SIDS_STARS = [
  {
    name: "GRINDAVIK1A",
    type: "SID",
    airport: "GRINDAVIK",
    waypoints: ["BULLY", "FROOT", "EURAD", "BOBOS", "THENR"]
  },
  {
    name: "ROCKFORD2B",
    type: "STAR",
    airport: "ROCKFORD",
    waypoints: ["ENDER", "SUNST", "BUCFA", "KENED", "SETHR"]
  },
  // Add more SIDs/STARs here...
];

// Get waypoint objects for a SID/STAR by name
function getSidStarWaypoints(sidStarName) {
  const sidStar = SIDS_STARS.find(s => s.name === sidStarName);
  if (!sidStar) return [];
  return sidStar.waypoints.map(wpName => Waypoints.find(wp => wp.name === wpName)).filter(Boolean);
}

// Render SID/STAR route on map
function renderSidStarRoute(sidStarName, options = {}) {
  const waypoints = getSidStarWaypoints(sidStarName);
  if (waypoints.length < 2) return null;
  const latLngs = waypoints.map(wp => apiPositionToLatLng(wp.px, wp.py));
  const polyline = L.polyline(latLngs, {
    color: options.color || 'orange',
    weight: options.weight || 3,
    dashArray: options.dashArray || '8,8',
    opacity: options.opacity || 0.8
  }).addTo(map);
  return polyline;
}