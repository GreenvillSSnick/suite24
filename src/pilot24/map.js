const imageWidth = 14453;
const imageHeight = 13800;
const imageBounds = [[0, 0], [imageHeight, imageWidth]];

// Leaflet map setup
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -5,
  maxZoom: 4,
  zoomSnap: 0.25,
  attributionControl: false,
  zoomControl: false
});

// map
L.imageOverlay('images/ptfsmapfullres.png', imageBounds).addTo(map);

// center
map.setView([imageHeight / 2, imageWidth / 2], 0);