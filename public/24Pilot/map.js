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
  hideWaypoints();
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
  // { name: "TOPLEFT", px: -14453*2, py: -13800*2, size: 64 }, // top left

  // Center of map
  // { name: "CENTER", px: imageWidth / 2, py: imageHeight / 2, size: 64 }, // center

  // Bottom right corner
  // { name: "BOTTOMRIGHT", px: imageWidth, py: imageHeight, size: 64 }, // bottom right

  // Example: 100px right, 200px down from top left
  // { name: "EXAMPLE1", px: 100, py: 200, size: 64 },

  // Grindavik
  { name: "BULLY", px: 2456.09, py: 2417.97, size: 64 }, //bully
  { name: "FROOT", px: 1503.71, py: 3544.37, size: 64 }, //fruit
  { name: "EURAD", px: 3402.95, py: 3875.30, size: 64 }, //Yurad
  { name: "BOBOS", px: 543.59, py: 4476.87, size: 64 }, //bowbows?
  { name: "THENR", px: 1496.88, py: 4987.5, size: 64 }, //thenner
  { name: "BLANK", px: 3790.63, py: 4756.25, size: 64 }, //blank
  { name: "ACRES", px: -146.88, py: 5275, size: 64 }, //acres
  { name: "YOUTH", px: 2587.5, py: 5571.88, size: 64 }, //youth
  { name: "UWAIS", px: -893.75, py: 6028.13, size: 64 }, //Eww Wais
  { name: "FRANK", px: -815.63, py: 7182.81, size: 64 }, //Frank
  { name: "CELAR", px: 1856.16, py: 7658.85, size: 64 }, //Sellar
  { name: "EZYDB", px: 3848.21, py: 6238.01, size: 64 }, //EasyDub
  { name: "THACC", px: -826.43, py: 8455.45, size: 64 }, //Thack
  { name: "SHREK", px: 513.28, py: 8585.94, size: 64 }, //Shrek
  { name: "SPACE", px: 1915.82, py: 8843.25, size: 64 }, //Space

  // Sauthemptona
  { name: "HACKE", px: -642.19, py: 9934.38, size: 64 }, //Hackee
  { name: "HECKS", px: -950.78, py: 11425.78, size: 64 }, //Hecks
  { name: "GEORG", px: 610.94, py: 10313.28, size: 64 }, //George
  { name: "SEEKS", px: 1923.44, py: 10763.28, size: 64 }, //Seeks
  { name: "PACKT", px: 117.19, py: 11721.88, size: 64 }, //Packet
  { name: "ALDER", px: 3212.92, py: 11899.28, size: 64 }, //Alder
  { name: "STACK", px: 1506.25, py: 12237.5, size: 64 }, //Stack
  { name: "WASTE", px: 23.44, py: 12975, size: 64 }, //Waste
  { name: "HOGGS", px: 3000.78, py: 12844.48, size: 64 }, //Hoggs
  { name: "ROBUX", px: 2358.86, py: 14075.84, size: 64 }, //Robux

  // Rockford
  { name: "ENDER", px: 4415, py: 7000.36, size: 64 }, //Ender
  { name: "SUNST", px: 3621.71, py: 7665.48, size: 64 }, //Sunset
  { name: "BUCFA", px: 4481.29, py: 8200.23, size: 64 }, //Buckfuh
  { name: "KENED", px: 5683.37, py: 7442.3, size: 64 }, //Keneddy? kened?
  { name: "SETHR", px: 7901.92, py: 8038.92, size: 64 }, //Sether
  { name: "KUNAV", px: 5685.58, py: 8315.13, size: 64 }, //Kunnov
  { name: "HAWFA", px: 6220.33, py: 8606.82, size: 64 }, //Haw Fuh
  { name: "SAWPE", px: 3277.34, py: 8505.47, size: 64 }, //Saw pee
  { name: "BEANS", px: 3355.44, py: 9736.53, size: 64 }, //Beans
  { name: "LOGAN", px: 4395.31, py: 9970.31, size: 64 }, //Logan
  { name: "EXMOR", px: 4577.41, py: 10896.63, size: 64 },
  { name: "QUEEN", px: 7062.23, py: 9241, size: 64 },
  { name: "MOGTA", px: 5718.73, py: 10398.89, size: 64 },
  { name: "LAVNO", px: 7721.88, py: 9537.1, size: 64 },
  { name: "ICTAM", px: 5409.37, py: 8757.08, size: 64 }, //ichtham
  { name: "ATPEV", px: 8186.97, py: 9353.7, size: 64 },
  { name: "JAMSI", px: 8702.94, py: 10251.94, size: 64 },
  { name: "GODLU", px: 7897.5, py: 10994.41, size: 64 },
  { name: "LAZER", px: 8599.08, py: 11282.77, size: 64 },
  { name: "PEPUL", px: 6128.63, py: 11217.59, size: 64 },
  { name: "EMJAY", px: 5184.38, py: 12296.88, size: 64 },
  { name: "ODOKU", px: 6843.75, py: 12306.25, size: 64 },
  { name: "REAPR", px: 7192.6, py: 13494.69, size: 64 },
  { name: "TRELN", px: 5875.62, py: 13722.29, size: 64 },
  { name: "DEATH", px: 4556.42, py: 14033.86, size: 64 },

  // Larnaca
  { name: "RENTS", px: 11320.34, py: 10213.27, size: 64 }, //Rents
  { name: "GRASS", px: 10182.34, py: 10739.18, size: 64 }, //Grass
  { name: "AQWRT", px: 9766.91, py: 12330.17, size: 64 }, //Aquirt
  { name: "FORIA", px: 8449.93, py: 13218.48, size: 64 }, //Forya
  { name: "FORCE", px: 10469.6, py: 14239.36, size: 64 }, //Force
  { name: "MASEV", px: 11592.13, py: 14279.14, size: 64 }, //Masiv
  { name: "ALTRS", px: 12811.89, py: 14252.62, size: 64 }, //Alters
  { name: "MUONE", px: 13267.09, py: 13214.06, size: 64 }, //Mew Own
  { name: "JAZZR", px: 14539.88, py: 13227.32, size: 64 }, //Jazzer
  { name: "NUBER", px: 15755.22, py: 12414.14, size: 64 }, //New ber
  { name: "BOBUX", px: 13457.13, py: 12188.75, size: 64 }, //Bobux
  { name: "DEBUG", px: 14557.56, py: 11318.13, size: 64 }, //Debug
  { name: "JACKI", px: 12599.76, py: 11304.87, size: 64 }, //Jacky

  // Skopelos
  { name: "CAWZE", px: 10343.65, py: 8030.08, size: 64 }, //Cawz ey
  { name: "ANYMS", px: 9669.69, py: 9644.53, size: 64 }, //Ay nims

  // Izolirani
  { name: "CAMEL", px: 10703.83, py: 5979.47, size: 64 }, //Camel
  { name: "CYRIL", px: 11512.58, py: 6995.94, size: 64 }, //S eye ril, sir il
  { name: "DUNKS", px: 11768.91, py: 6028.09, size: 64 }, //Dunks
  { name: "DOGGO", px: 12909.12, py: 8012.4, size: 64 }, //Dog Oh
  { name: "JUSTY", px: 13262.67, py: 9333.81, size: 64 }, //Justy
  { name: "CHAIN", px: 15764.06, py: 9766.91, size: 64 }, //Chain
  { name: "BILLO", px: 14557.56, py: 8586.93, size: 64 }, //Bill oh
  { name: "ABSRS", px: 15768.48, py: 7919.6, size: 64 }, //Abserse
  { name: "MORRD", px: 15087.89, py: 6624.71, size: 64 }, //Mord
  { name: "LLIME", px: 15538.67, py: 5670.11, size: 64 }, //Lime
  { name: "UDMUG", px: 15083.47, py: 4808.33, size: 64 }, //Uhd mug
  { name: "ROSMO", px: 13474.8, py: 5484.5, size: 64 }, //Ros moh

  // Saint Barts
  { name: "PROBE", px: 6306.51, py: 5351.91, size: 64 }, //Probe
  { name: "DINER", px: 8012.4, py: 5427.04, size: 64 }, //Diner
  { name: "INDEX", px: 6505.38, py: 6819.16, size: 64 }, //Index
  { name: "GAVIN", px: 8361.54, py: 7141.78, size: 64 }, //Gavin
  { name: "SILVA", px: 10018.82, py: 7159.46, size: 64 }, //Silva
  { name: "OCEEN", px: 9143.77, py: 7716.3, size: 64 }, //Oceen?
  { name: "GERLD", px: 5077.91, py: 4605.03, size: 64 }, //?
  { name: "RENDR", px: 5687.79, py: 4772.97, size: 64 }, //?
  { name: "WELSH", px: 5687.79, py: 6249.06, size: 64 }, //?
  { name: "JOOPY", px: 7115.26, py: 4631.55, size: 64 }, //?

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

// Initial render (now Waypoints is defined)
renderWaypoints(Waypoints);

// --- SID/STAR definitions with altitudes/speeds ---
const SIDS_STARS = [
  {
    name: "GRINDAVIK1A",
    type: "SID",
    airport: "GRINDAVIK",
    waypoints: [
      { name: "BULLY", altitude: 2000, speed: 220 },
      { name: "FROOT", altitude: 3000, speed: 230 },
      { name: "EURAD", altitude: 4000, speed: 240 },
      { name: "BOBOS", altitude: 5000, speed: 250 },
      { name: "THENR", altitude: 6000, speed: 260 }
    ]
  },
  {
    name: "ROCKFORD2B",
    type: "STAR",
    airport: "ROCKFORD",
    waypoints: [
      { name: "ENDER", altitude: 7000, speed: 210 },
      { name: "SUNST", altitude: 6000, speed: 200 },
      { name: "BUCFA", altitude: 5000, speed: 190 },
      { name: "KENED", altitude: 4000, speed: 180 },
      { name: "SETHR", altitude: 3000, speed: 170 }
    ]
  },
  // ...add more SIDs/STARs here...
];

// --- Waypoint Toggle ---
let waypointsEnabled = true;
let waypointMarkers = [];

function hideWaypoints() {
  waypointMarkers.forEach(marker => map.removeLayer(marker));
  waypointMarkers = [];
}

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

// Listen for toggle from settings
document.getElementById("toggle-waypoints").addEventListener("change", (e) => {
  waypointsEnabled = e.target.checked;
  if (waypointsEnabled) {
    renderWaypoints(Waypoints);
  } else {
    hideWaypoints();
  }
});

// Get waypoint objects for a SID/STAR by name
function getSidStarWaypoints(sidStarName) {
  const sidStar = SIDS_STARS.find(s => s.name === sidStarName);
  if (!sidStar) return [];
  // Merge waypoint info with coordinates from Waypoints array
  return sidStar.waypoints.map(wp => {
    const base = Waypoints.find(w => w.name === wp.name);
    return base ? { ...base, ...wp } : null;
  }).filter(Boolean);
}

// Render SID/STAR route on map, with alt/speed popups
function renderSidStarRoute(sidStarName, options = {}) {
  const waypoints = getSidStarWaypoints(sidStarName);
  if (waypoints.length < 2) return null;
  const latLngs = waypoints.map(wp => waypointPositionToLatLng(wp.px, wp.py));
  const polyline = L.polyline(latLngs, {
    color: options.color || 'orange',
    weight: options.weight || 3,
    dashArray: options.dashArray || '8,8',
    opacity: options.opacity || 0.8
  }).addTo(map);

  for (let i = 0; i < waypoints.length - 1; i++) {
    const wpA = waypoints[i];
    const wpB = waypoints[i + 1];
    const midLat = (waypointPositionToLatLng(wpA.px, wpA.py)[0] + waypointPositionToLatLng(wpB.px, wpB.py)[0]) / 2;
    const midLng = (waypointPositionToLatLng(wpA.px, wpA.py)[1] + waypointPositionToLatLng(wpB.px, wpB.py)[1]) / 2;
    const label = L.popup({
      closeButton: false,
      autoClose: false,
      className: "sidstar-leg-popup"
    })
      .setLatLng([midLat, midLng])
      .setContent(`Alt: ${wpB.altitude} ft<br>Spd: ${wpB.speed} kt`)
      .addTo(map);
  }
  return polyline;
}

renderWaypoints(Waypoints);

map.on("zoomend", () => {
  const zoom = map.getZoom();
  document.querySelectorAll(".waypoint-wrapper img").forEach(img => {
    const baseSize = 64;
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