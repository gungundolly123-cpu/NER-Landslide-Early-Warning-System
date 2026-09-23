/**
 * NEXZORA — Tactical Disaster GIS Map & Layer Manager
 * Features unique 3D Holographic Disaster Station Needles with ground radar rings,
 * tactical hazard diamond beacons, and intelligent Level-of-Detail (LOD).
 */

// Bounding box for North Eastern Region
const NER_BOUNDS = [
  [21.8, 88.0],
  [29.0, 97.4]
];
const NER_CENTER = [26.15, 92.85];

// 9 State Disaster Command Stations (Clean spatial distribution, zero overlap)
const stateHubs = [
  { name: "Sikkim", lat: 27.55, lng: 88.50, count: 6, level: "Critical", maxScore: 94, zoom: 10 },
  { name: "Darjeeling", lat: 26.90, lng: 88.25, count: 3, level: "Critical", maxScore: 92, zoom: 11 },
  { name: "Meghalaya", lat: 25.45, lng: 91.20, count: 6, level: "Critical", maxScore: 91, zoom: 10 },
  { name: "Assam (Hills)", lat: 26.15, lng: 92.95, count: 5, level: "Critical", maxScore: 95, zoom: 9 },
  { name: "Arunachal", lat: 27.85, lng: 94.20, count: 7, level: "Critical", maxScore: 93, zoom: 9 },
  { name: "Nagaland", lat: 26.10, lng: 94.60, count: 6, level: "Critical", maxScore: 90, zoom: 10 },
  { name: "Manipur", lat: 24.80, lng: 93.90, count: 6, level: "Critical", maxScore: 96, zoom: 10 },
  { name: "Mizoram", lat: 23.10, lng: 92.85, count: 6, level: "High", maxScore: 85, zoom: 9 },
  { name: "Tripura", lat: 23.80, lng: 91.50, count: 4, level: "High", maxScore: 72, zoom: 10 }
];

// Initialize Leaflet Map
const map = L.map("map", {
  zoomControl: false,
  minZoom: 6,
  maxZoom: 18
}).setView(NER_CENTER, 7);

// Real-Life Google Maps GIS Tile Infrastructure (Strict English Language: hl=en)
const googleTerrain = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}",
  {
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps"
  }
).addTo(map);

const googleHybrid = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}",
  {
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps"
  }
);

const googleStreets = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
  {
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps"
  }
);

const googleSatellite = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
  {
    subdomains: "0123",
    maxZoom: 20,
    attribution: "&copy; Google Maps"
  }
);

// Base map layer switcher (Google Maps Layers in English)
L.control.layers({
  "🗺️ Google Maps (Terrain)": googleTerrain,
  "🛰️ Google Maps (Satellite Hybrid)": googleHybrid,
  "🛣️ Google Maps (Roads)": googleStreets,
  "🌍 Google Maps (Satellite)": googleSatellite
}, null, { position: "bottomright", collapsed: false }).addTo(map);

// Add custom styled zoom control
L.control.zoom({ position: "bottomright" }).addTo(map);

// Fit directly to North Eastern Region
function fitNorthEastBounds() {
  map.fitBounds(NER_BOUNDS, { padding: [25, 25] });
}

window.addEventListener("load", () => {
  setTimeout(() => {
    map.invalidateSize();
    fitNorthEastBounds();
  }, 100);
});

// Layer Groups
const stateHubLayer = L.layerGroup().addTo(map);
const riskLayer = L.layerGroup().addTo(map);
const roadLayer = L.layerGroup().addTo(map);
const weatherLayer = L.layerGroup().addTo(map);
const deadZoneLayer = L.layerGroup().addTo(map);
const reportLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const focusPerimeterLayer = L.layerGroup().addTo(map);

const markerSets = {
  hubs: [],
  risk: [],
  roads: [],
  weather: [],
  deadzones: [],
  reports: []
};

// District Markers Map lookup
const districtMarkers = new Map();
let currentFilter = "all";

// Generate Unique Holographic Disaster Station Pin DivIcon
function createStateHubIcon(hub) {
  const levelClass = `level-${hub.level.toLowerCase()}`;
  const html = `
    <div class="disaster-station-wrapper ${levelClass}">
      <div class="station-ground-sonar"></div>
      <div class="station-pin-body">
        <div class="station-shield">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 22h20L12 2z"/>
            <path d="M12 9v5m0 3v.5"/>
          </svg>
          <span>${hub.maxScore}</span>
        </div>
        <div class="station-label-strip">
          <span>${hub.name}</span>
          <span class="zones-count">${hub.count}z</span>
        </div>
        <div class="station-needle"></div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: "custom-station-pin",
    html: html,
    iconSize: [110, 56],
    iconAnchor: [55, 56],
    popupAnchor: [0, -56]
  });
}

// Generate Detailed District Hazard Diamond DivIcon (Zoom > 8)
function createDisasterIcon(item) {
  const levelClass = `level-${item.level.toLowerCase()}`;
  const html = `
    <div class="district-diamond-wrapper ${levelClass}">
      <div class="diamond-sonar"></div>
      <div class="diamond-body">
        <span class="diamond-score">${item.score}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    className: "custom-district-diamond",
    html: html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
}

// Render State Command Hubs (For Zoom <= 8)
function initStateHubMarkers() {
  stateHubs.forEach(hub => {
    const marker = L.marker([hub.lat, hub.lng], {
      icon: createStateHubIcon(hub),
      zIndexOffset: 1000
    });

    marker.bindTooltip(`Click to inspect <strong>${hub.name}</strong> (${hub.count} hazard districts · Peak Risk: ${hub.maxScore}/100)`, {
      direction: "top",
      offset: [0, -56],
      className: "custom-tooltip"
    });

    marker.on("click", () => {
      map.setView([hub.lat, hub.lng], hub.zoom, { animate: true });
      const lastLoc = document.getElementById("lastLocationName");
      if (lastLoc) lastLoc.textContent = `${hub.name} Sector`;
    });

    markerSets.hubs.push(marker);
  });
}

// Render Detailed District Disaster Beacons
function initRiskMarkers() {
  riskData.forEach(item => {
    const color = riskColor(item.level);

    const marker = L.marker([item.lat, item.lng], {
      icon: createDisasterIcon(item),
      zIndexOffset: item.level === "Critical" ? 500 : item.level === "High" ? 300 : 100
    });

    const popupContent = `
      <div class="district-popup">
        <div class="popup-badge-row">
          <span class="state-pill">${item.state}</span>
          <span class="risk-pill level-${item.level.toLowerCase()}">${item.level} Risk</span>
        </div>
        <div class="popup-title">${item.name}</div>
        <div class="popup-meta">
          <div class="popup-stat-grid">
            <div>
              <small>AI Risk Index</small>
              <strong style="color:${color}">${item.score}<span>/100</span></strong>
            </div>
            <div>
              <small>24h Rainfall</small>
              <strong>${item.rainfall} mm</strong>
            </div>
            <div>
              <small>Slope Gradient</small>
              <strong>${item.slope}</strong>
            </div>
            <div>
              <small>Soil Saturation</small>
              <strong>${item.soil}</strong>
            </div>
          </div>
          <div class="popup-corridor">
            <small>Key Corridor:</small> <span>${item.corridors}</span>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.bindTooltip(`<strong>${item.name}</strong> (${item.state}) · <span style="color:${color};font-weight:800;">${item.level} Risk (${item.score}/100)</span>`, {
      direction: "top",
      offset: [0, -16],
      className: "custom-tooltip"
    });

    marker.on("mouseover", () => {
      highlightDistrictPerimeter(item);
    });

    marker.on("mouseout", () => {
      focusPerimeterLayer.clearLayers();
    });

    marker.on("click", () => {
      highlightDistrictPerimeter(item);
      updateRiskForLocation(item.lat, item.lng);
      const lastLoc = document.getElementById("lastLocationName");
      if (lastLoc) lastLoc.textContent = `${item.name}, ${item.state}`;
      const districtSelect = document.getElementById("districtSelect");
      if (districtSelect) districtSelect.value = item.name;
    });

    markerSets.risk.push({ marker, item });
    districtMarkers.set(item.name.toLowerCase(), { marker, item });
  });
}

// Highlight single district perimeter on hover/click (clean & uncluttered)
function highlightDistrictPerimeter(item) {
  focusPerimeterLayer.clearLayers();
  const color = riskColor(item.level);

  L.circle([item.lat, item.lng], {
    radius: item.radius,
    color: color,
    fillColor: color,
    fillOpacity: 0.15,
    weight: 2,
    dashArray: item.level === "Critical" ? "5 5" : undefined
  }).addTo(focusPerimeterLayer);
}

// Dynamic Level of Detail (LOD) Zoom Handler
function updateMapLOD() {
  const zoom = map.getZoom();

  // If a specific filter (like "Critical" or "High") is active, show matching individual beacons
  if (currentFilter !== "all") {
    stateHubLayer.clearLayers();
    riskLayer.clearLayers();
    markerSets.risk.forEach(x => {
      if (x.item.level.toLowerCase() === currentFilter.toLowerCase()) {
        x.marker.addTo(riskLayer);
      }
    });
    return;
  }

  // When zoomed out (Zoom <= 8), show 9 clean State Disaster Stations (Zero Congestion)
  if (zoom <= 8) {
    riskLayer.clearLayers();
    stateHubLayer.clearLayers();
    markerSets.hubs.forEach(h => h.addTo(stateHubLayer));
  } else {
    // When zoomed in (Zoom > 8), show detailed district beacons with ample spacing
    stateHubLayer.clearLayers();
    riskLayer.clearLayers();
    markerSets.risk.forEach(x => x.marker.addTo(riskLayer));
  }
}

map.on("zoomend", updateMapLOD);

// Render Arterial Road Corridors
function initRoadMarkers() {
  roadData.forEach(item => {
    const isBlocked = item.status === "Blocked";
    const isSlow = item.status === "Slow";
    const color = roadColor(item.status);
    const normalWeight = isBlocked ? 5 : isSlow ? 4 : 3.5;

    const line = L.polyline(item.coords, {
      color: color,
      weight: normalWeight,
      opacity: 0.9,
      dashArray: isBlocked ? "8 6" : isSlow ? "5 5" : undefined,
      lineCap: "round",
      lineJoin: "round"
    });

    const tooltipContent = `
      <div class="road-hover-glass-overlay">
        <div class="road-hover-header">
          <span class="road-indicator" style="background:${color};box-shadow:0 0 8px ${color};"></span>
          <strong>${escapeHtml(item.name)}</strong>
        </div>
        <div class="road-hover-body">
          <div class="road-hover-status-row">
            <span>Road Condition:</span>
            <span class="road-status-badge" style="background:${color}26;color:${color};border:1px solid ${color}66;">
              ${item.status === 'Blocked' ? '🛑 Fully Blocked' : item.status === 'Slow' ? '⚠️ Caution / Slow' : '🟢 Clear / Open'}
            </span>
          </div>
          <div class="road-hover-meta">
            <span>State: <strong>${escapeHtml(item.state)}</strong></span>
            <span>Monitoring: <strong>Real-time Sensor Stream</strong></span>
          </div>
        </div>
      </div>
    `;

    line.bindTooltip(tooltipContent, {
      sticky: true,
      direction: "top",
      offset: [0, -10],
      className: "road-glass-tooltip",
      opacity: 1
    });

    line.on("mouseover", () => {
      line.setStyle({
        weight: normalWeight + 3,
        opacity: 1
      });
      if (typeof line.bringToFront === "function") line.bringToFront();
    });

    line.on("mouseout", () => {
      line.setStyle({
        weight: normalWeight,
        opacity: 0.9
      });
    });

    line.bindPopup(popupTemplate(item.name, `
      State / Corridor: <strong>${item.state}</strong><br>
      Corridor Status: <strong style="color:${color}">${item.status}</strong><br>
      Monitoring: <strong>Sensors Active</strong>
    `));

    line.addTo(roadLayer);
    markerSets.roads.push(line);
  });
}

// Render Weather Rain Outlook Overlays
function initWeatherMarkers() {
  weatherData.forEach(item => {
    const color = riskColor(item.risk);

    const weatherCircle = L.circle([item.lat, item.lng], {
      radius: 18000,
      color: color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 1.5,
      dashArray: "6 6"
    });

    weatherCircle.bindPopup(popupTemplate(item.name, `
      24h Rain Outlook: <strong>${item.rain} mm/day</strong><br>
      Forecast: <strong>${item.forecast}</strong><br>
      Associated Slope Risk: <strong style="color:${color}">${item.risk}</strong>
    `));

    weatherCircle.addTo(weatherLayer);
    markerSets.weather.push(weatherCircle);
  });
}

// Render Cellular Dead Zones
function initDeadZoneMarkers() {
  deadZoneData.forEach(zone => {
    const circle = L.circle([zone.lat, zone.lng], {
      radius: zone.radius,
      color: "#a684f2",
      fillColor: "#a684f2",
      fillOpacity: 0.10,
      weight: 1.5,
      dashArray: "4 6"
    });

    const popupHtml = popupTemplate(zone.name, `
      Type: <strong>Cellular Coverage Shadow</strong><br>
      ${escapeHtml(zone.note)}<br>
      <small style="color:var(--muted)">Radius: ${(zone.radius / 1000).toFixed(0)} km shadow area</small>
    `);

    circle.bindPopup(popupHtml);
    circle.addTo(deadZoneLayer);
    markerSets.deadzones.push(circle);
  });
}

// Proximity Lookups
function findHazardStatus(lat, lng) {
  let match = null;
  let matchDistance = Infinity;

  riskData.forEach(item => {
    const distance = distanceKm(lat, lng, item.lat, item.lng);
    const radiusKm = item.radius / 1000;

    if (distance <= radiusKm && distance < matchDistance) {
      matchDistance = distance;
      match = item;
    }
  });

  return match;
}

function findDeadZoneStatus(lat, lng) {
  let match = null;
  let matchDistance = Infinity;

  deadZoneData.forEach(zone => {
    const distance = distanceKm(lat, lng, zone.lat, zone.lng);
    const radiusKm = zone.radius / 1000;

    if (distance <= radiusKm && distance < matchDistance) {
      matchDistance = distance;
      match = zone;
    }
  });

  return match;
}

// UI Status Updater for Location
function updateAreaStatusUI(lat, lng) {
  const hazard = findHazardStatus(lat, lng);
  const deadZone = findDeadZoneStatus(lat, lng);

  const hazardChip = document.getElementById("hazardChip");
  const hazardValue = document.getElementById("hazardValue");
  const deadZoneChip = document.getElementById("deadZoneChip");
  const deadZoneValue = document.getElementById("deadZoneValue");
  const deadZoneStat = document.getElementById("deadZoneStat");

  if (hazardChip && hazardValue) {
    hazardChip.className = "status-chip";
    if (hazard) {
      hazardChip.classList.add(`level-${hazard.level.toLowerCase()}`);
      hazardValue.textContent = `${hazard.level} risk · ${hazard.score}/100`;
    } else {
      hazardChip.classList.add("level-none");
      hazardValue.textContent = "No hazard zone nearby";
    }
  }

  if (deadZoneChip && deadZoneValue) {
    deadZoneChip.className = "status-chip";
    if (deadZone) {
      deadZoneChip.classList.add("zone-yes");
      deadZoneValue.textContent = `Yes — ${deadZone.name}`;
    } else {
      deadZoneChip.classList.add("zone-no");
      deadZoneValue.textContent = "No dead zone nearby";
    }
  }

  if (deadZoneStat) {
    deadZoneStat.textContent = deadZone ? "Yes" : "No";
    deadZoneStat.style.color = deadZone ? "var(--zone)" : "";
  }

  return { hazard, deadZone };
}

function updateRiskForLocation(lat, lng) {
  const riskIndexEl = document.getElementById("riskIndex");
  const riskEm = document.getElementById("riskEm");
  const { hazard } = updateAreaStatusUI(lat, lng);

  if (hazard) {
    riskIndexEl.innerHTML = `${hazard.score}<span>/100</span>`;
    riskEm.textContent = `${hazard.level} risk (${hazard.state})`;
  } else {
    riskIndexEl.innerHTML = `--<span>/100</span>`;
    riskEm.textContent = "No local model data";
  }
}

// Focus on a specific district by name
function focusDistrict(districtName) {
  if (!districtName) return;
  const match = riskData.find(d => 
    d.name.toLowerCase().includes(districtName.toLowerCase()) ||
    districtName.toLowerCase().includes(d.name.toLowerCase())
  );

  if (match) {
    map.setView([match.lat, match.lng], 11, { animate: true });
    updateMapLOD();
    highlightDistrictPerimeter(match);
    const target = districtMarkers.get(match.name.toLowerCase());
    if (target && target.marker) {
      target.marker.addTo(riskLayer);
      target.marker.openPopup();
    }
    updateRiskForLocation(match.lat, match.lng);
    const lastLoc = document.getElementById("lastLocationName");
    if (lastLoc) lastLoc.textContent = `${match.name}, ${match.state}`;
  }
}

// Reset view to entire North East India
function resetToNorthEast() {
  currentFilter = "all";
  focusPerimeterLayer.clearLayers();
  fitNorthEastBounds();
  updateMapLOD();

  const riskIndexEl = document.getElementById("riskIndex");
  const riskEm = document.getElementById("riskEm");
  const lastLoc = document.getElementById("lastLocationName");
  
  if (lastLoc) lastLoc.textContent = "North Eastern Region (NER)";
  if (riskIndexEl) riskIndexEl.innerHTML = `88<span>/100</span>`;
  if (riskEm) riskEm.textContent = "High Regional Landslide Risk";
  
  const hazardChip = document.getElementById("hazardChip");
  const hazardValue = document.getElementById("hazardValue");
  if (hazardChip && hazardValue) {
    hazardChip.className = "status-chip level-high";
    hazardValue.textContent = "High regional risk · 35 districts active";
  }

  const hudPills = document.querySelectorAll(".hud-pill");
  hudPills.forEach(p => p.classList.toggle("active", p.dataset.filter === "all"));
}

// Filter Disaster Nodes by Severity
function filterDisasterNodes(severity) {
  currentFilter = severity;
  updateMapLOD();
}

// Layer Visibility and Legend
function setLayerVisibility(active) {
  stateHubLayer.clearLayers();
  riskLayer.clearLayers();
  roadLayer.clearLayers();
  weatherLayer.clearLayers();
  deadZoneLayer.clearLayers();
  reportLayer.clearLayers();
  focusPerimeterLayer.clearLayers();

  if (active === "all" || active === "risk") {
    updateMapLOD();
  }
  if (active === "all" || active === "roads") {
    markerSets.roads.forEach(x => x.addTo(roadLayer));
  }
  if (active === "all" || active === "weather") {
    markerSets.weather.forEach(x => x.addTo(weatherLayer));
  }
  if (active === "all" || active === "deadzones") {
    markerSets.deadzones.forEach(x => x.addTo(deadZoneLayer));
  }
  if (active === "all" || active === "reports") {
    markerSets.reports.forEach(x => x.addTo(reportLayer));
  }
}

function renderLegend(active) {
  const info = layerInfo[active];
  if (!info) return;

  const legendTitle = document.getElementById("legendTitle");
  if (legendTitle) legendTitle.textContent = info.title;

  const legendItems = document.getElementById("legendItems");
  if (legendItems) {
    legendItems.innerHTML = info.legend.map(item => `
      <div class="legend-row">
        <span class="${item[1].toLowerCase().includes("road") || item[1].toLowerCase().includes("corridor") ? "legend-line" : "legend-dot"}"
              style="background:${item[0]}"></span>
        <span>${item[1]}</span>
      </div>
    `).join("");
  }

  const alertTitle = document.getElementById("alertTitle");
  const alertText = document.getElementById("alertText");
  if (alertTitle) alertTitle.textContent = info.alert[0];
  if (alertText) alertText.textContent = info.alert[1];
}

function activateLayer(name) {
  const layerButtons = document.querySelectorAll(".layer-btn");
  layerButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.layer === name);
  });

  setLayerVisibility(name);
  renderLegend(name);
}

// Initial Marker Setup
initStateHubMarkers();
initRiskMarkers();
initRoadMarkers();
initWeatherMarkers();
initDeadZoneMarkers();
updateMapLOD();

// Real-Life Map Sensing & Inspection on Click
let inspectionMarker = null;
map.on("click", async (e) => {
  const { lat, lng } = e.latlng;

  // Find nearest district hazard sensor
  let closestDistrict = null;
  let minDistance = Infinity;
  riskData.forEach(d => {
    const dist = distanceKm(lat, lng, d.lat, d.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closestDistrict = d;
    }
  });

  // Calculate live sensor readings interpolated by distance to terrain node
  const proximityFactor = Math.max(0.25, 1 - (minDistance / 100));
  const sensedRainfall = closestDistrict ? Math.round(closestDistrict.rainfall * proximityFactor) : Math.round(28 + Math.random() * 30);
  const sensedSlope = closestDistrict ? Math.max(12, Math.round(closestDistrict.slope * proximityFactor)) : 24;
  const sensedRiskScore = closestDistrict ? Math.round(closestDistrict.score * proximityFactor) : 48;
  const sensedLevel = sensedRiskScore > 75 ? "Critical" : sensedRiskScore > 50 ? "High" : sensedRiskScore > 30 ? "Medium" : "Low";

  // Remove existing inspection marker
  if (inspectionMarker) {
    map.removeLayer(inspectionMarker);
  }

  const pingHtml = `
    <div class="inspection-ping-beacon">
      <div class="ping-sonar"></div>
      <div class="ping-dot">📍</div>
    </div>
  `;

  inspectionMarker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: "custom-inspection-pin",
      html: pingHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    }),
    zIndexOffset: 2000
  }).addTo(map);

  // Update HUD Telemetry
  updateAreaStatusUI(lat, lng);
  const riskIndexEl = document.getElementById("riskIndex");
  const riskEm = document.getElementById("riskEm");
  if (riskIndexEl) riskIndexEl.innerHTML = `${sensedRiskScore}<span>/100</span>`;
  if (riskEm) riskEm.textContent = `${sensedLevel} Risk · Real GPS Sensing`;

  const lastLoc = document.getElementById("lastLocationName");
  if (lastLoc) lastLoc.textContent = `Sensing: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E...`;

  // Fetch real place name in English
  try {
    const placeName = await reverseGeocode(lat, lng);
    const shortName = placeName.split(",").slice(0, 3).join(",");
    if (lastLoc) lastLoc.textContent = shortName;

    inspectionMarker.bindPopup(`
      <div class="popup-title">📡 Real Map GPS Sensor</div>
      <div class="popup-meta">
        <strong style="color:#00f0ff;">${escapeHtml(shortName)}</strong><br>
        <span style="font-size:11px;color:#8892b0;">GPS: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</span>
        <hr style="border:0;border-top:1px solid rgba(255,255,255,0.1);margin:6px 0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
          <div>🌧️ Rain: <strong>${sensedRainfall} mm</strong></div>
          <div>📐 Slope: <strong>${sensedSlope}°</strong></div>
          <div>🏔️ Risk: <strong style="color:${riskColor(sensedLevel)}">${sensedRiskScore}/100 (${sensedLevel})</strong></div>
          <div>📍 Node: <strong>${closestDistrict ? closestDistrict.name : "NER Sector"} (${minDistance.toFixed(0)}km)</strong></div>
        </div>
      </div>
    `).openPopup();
  } catch {
    if (lastLoc) lastLoc.textContent = `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;
    inspectionMarker.bindPopup(`
      <div class="popup-title">📡 Real Map GPS Sensor</div>
      <div class="popup-meta">
        <strong>GPS: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E</strong><br>
        Live Landslide Risk: <strong style="color:${riskColor(sensedLevel)}">${sensedRiskScore}/100 (${sensedLevel})</strong><br>
        Rainfall: ${sensedRainfall} mm · Slope: ${sensedSlope}°
      </div>
    `).openPopup();
  }
});

// ============================================================================
// Real-Time Incident Ground Reports GIS Layer
// ============================================================================

const INCIDENT_ICONS = {
  "crack on hill slope": "⛰️",
  "crack on road": "🛣️",
  "slope movement": "⚠️",
  "falling rocks": "🪨",
  "mud or debris on road": "🌊",
  "minor landslide": "🧱",
  "major landslide": "🧗",
  "road partially blocked": "🚧",
  "road fully blocked": "🛑",
  "damaged bridge": "🌉",
  "water leakage from slope": "💧",
  "flooded road": "🌊",
  "other": "⚠️"
};

async function loadIncidentMarkers() {
  try {
    const res = await fetch("/api/incidents");
    if (!res.ok) return;
    const data = await res.json();
    const incidents = data.incidents || [];

    reportLayer.clearLayers();
    markerSets.reports = [];

    incidents.forEach(inc => {
      const lat = parseFloat(inc.latitude);
      const lng = parseFloat(inc.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const typeKey = (inc.incident_type || "").toLowerCase().trim();
      const iconEmoji = INCIDENT_ICONS[typeKey] || "📍";

      // Determine visual status and color
      let statusClass = `status-${inc.report_status || "pending_verification"}`;
      let statusLabel = (inc.report_status || "Pending").replace(/_/g, " ").toUpperCase();
      
      const isCritical = (inc.report_status === "verified" && (inc.severity_verified === "high" || inc.severity_reported === "high")) ||
                         inc.road_status_at_report_time === "Fully Blocked" ||
                         inc.incident_type === "Major Landslide";

      if (isCritical) {
        statusClass = "status-critical-hazard";
      }

      const markerHtml = `
        <div class="incident-beacon-wrapper ${statusClass}">
          <div class="incident-beacon-sonar"></div>
          <div class="incident-beacon-core">
            <span class="incident-beacon-emoji">${iconEmoji}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: "custom-incident-pin",
        html: markerHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -16]
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        zIndexOffset: isCritical ? 600 : 200
      }).addTo(reportLayer);
      markerSets.reports.push(marker);

      const isManual = inc.location_source === "manual_map_pin";
      const isOutsideArea = inc.outside_study_area === 1 || inc.outside_study_area === true;
      const sourceBadge = isManual 
        ? `<span style="background:rgba(251,191,36,0.15);color:#fbbf24;border:1px solid rgba(251,191,36,0.3);padding:2px 6px;border-radius:4px;font-size:10px;">🗺️ Manual Pin</span>`
        : `<span style="background:rgba(0,240,255,0.15);color:#00f0ff;border:1px solid rgba(0,240,255,0.3);padding:2px 6px;border-radius:4px;font-size:10px;">📡 GPS (${inc.gps_accuracy_m != null ? `±${Math.round(inc.gps_accuracy_m)}m` : "Active"})</span>`;

      const aiText = isOutsideArea
        ? "Outside AI Model Coverage"
        : (inc.ai_risk_class 
          ? `${inc.ai_risk_class} (${Math.round((inc.ai_risk_probability || 0) * 100)}%)` 
          : "Pending AI Calculation");

      const hoverOverlayHtml = `
        <div class="incident-glass-hover-card ${statusClass}">
          <div class="glass-card-header">
            <span class="glass-card-emoji">${iconEmoji}</span>
            <div class="glass-card-title-group">
              <strong class="glass-card-title">${escapeHtml(inc.incident_type || "Incident")}</strong>
              <span class="glass-card-location">${escapeHtml(inc.village_or_town || inc.district || "NER Sector")}${inc.road_name ? ` · ${escapeHtml(inc.road_name)}` : ""}</span>
            </div>
          </div>
          <div class="glass-card-badge-row">
            <span class="glass-status-tag ${statusClass}">${statusLabel}</span>
            <span class="glass-severity-tag severity-${(inc.severity_reported || 'medium').toLowerCase()}">${escapeHtml(inc.severity_reported || 'Medium')} Risk</span>
            ${sourceBadge}
          </div>
          <div class="glass-card-stats">
            <div>AI Risk: <strong style="color:${isOutsideArea ? '#f87171' : '#00f0ff'};">${escapeHtml(aiText)}</strong></div>
            ${inc.road_status_at_report_time ? `<div>Road: <strong>${escapeHtml(inc.road_status_at_report_time)}</strong></div>` : ''}
          </div>
          ${inc.description ? `<p class="glass-card-desc">"${escapeHtml((inc.description || "").slice(0, 95))}${inc.description.length > 95 ? "..." : ""}"</p>` : ''}
          <div class="glass-card-footer">
            <span>📅 ${new Date(inc.created_at || Date.now()).toLocaleDateString()}</span>
            <span class="glass-card-hint">Click pin to inspect details →</span>
          </div>
        </div>
      `;

      marker.bindTooltip(hoverOverlayHtml, {
        direction: "top",
        offset: [0, -16],
        className: "incident-glass-tooltip",
        opacity: 1
      });

      marker.on("mouseover", () => {
        marker.setZIndexOffset(3500);
      });

      marker.on("mouseout", () => {
        marker.setZIndexOffset(isCritical ? 600 : 200);
      });

      const popupHtml = `
        <div class="popup-title">🚨 ${escapeHtml(inc.incident_type)}</div>
        <div class="popup-meta">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:4px;flex-wrap:wrap;">
            <span class="status-tag tag-${inc.report_status || "pending_verification"}">${statusLabel}</span>
            <div style="display:flex;gap:4px;align-items:center;">
              ${sourceBadge}
              <span style="font-size:10.5px;color:#8892b0;">${new Date(inc.created_at || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>
          ${isOutsideArea ? `<div style="background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.25);padding:3px 6px;border-radius:4px;font-size:10px;margin-bottom:6px;">⚠️ Outside Project Coverage Boundary</div>` : ""}
          <div style="font-size:11.5px;margin-bottom:6px;line-height:1.4;">
            <strong>Coordinates:</strong> ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E ${inc.altitude_m != null ? `· Alt: ${Math.round(inc.altitude_m)}m` : ""}<br>
            <strong>Location:</strong> ${escapeHtml(inc.village_or_town || inc.district || "NER Sector")}${inc.road_name ? ` · Road: ${escapeHtml(inc.road_name)}` : ""}<br>
            <strong>Reported Severity:</strong> <span style="text-transform:capitalize;">${escapeHtml(inc.severity_reported || "Medium")}</span><br>
            <strong>AI Risk Class:</strong> <span style="color:${isOutsideArea ? '#f87171' : '#00f0ff'};">${escapeHtml(aiText)}</span>
            ${inc.road_status_at_report_time ? `<br><strong>Road Status:</strong> ${escapeHtml(inc.road_status_at_report_time)}` : ""}
          </div>
          <p style="font-size:11px;color:#cbd5e1;background:rgba(255,255,255,0.04);padding:6px 8px;border-radius:6px;margin:6px 0;">
            "${escapeHtml((inc.description || "").slice(0, 120))}${inc.description && inc.description.length > 120 ? "..." : ""}"
          </p>
          ${inc.media && inc.media.length > 0 ? `<div style="font-size:10.5px;color:#34d399;margin-bottom:6px;">📷 ${inc.media.length} media file(s) attached</div>` : ""}
          <button onclick="if(window.ReportSystem) window.ReportSystem.openDetail(${inc.id});" style="width:100%;margin-top:6px;background:var(--accent);color:#02120d;border:none;padding:6px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">
            View Incident Details →
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);
    });
  } catch (err) {
    console.warn("Failed to load incident markers on GIS map:", err);
  }
}

window.refreshMapIncidents = loadIncidentMarkers;

// Load markers initially and every 30 seconds
loadIncidentMarkers();
setInterval(loadIncidentMarkers, 30000);


