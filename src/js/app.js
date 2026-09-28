/**
 * NEXZORA — Main Application Orchestrator for North Eastern Region (NER)
 * Connects UI interactions, district selector, geolocation, route calculation, and layer controls.
 */

// UI Element References
const searchInput = document.getElementById("placeSearch");
const searchBtn = document.getElementById("searchBtn");
const lastLocationName = document.getElementById("lastLocationName");
const locateBtn = document.getElementById("locateBtn");
const resetViewBtn = document.getElementById("resetViewBtn");
const districtSelect = document.getElementById("districtSelect");
const routeBtn = document.getElementById("routeBtn");

// Populate District Dropdown with Grouped States
function populateDistrictSelector() {
  if (!districtSelect) return;

  // Group districts by state
  const states = {};
  riskData.forEach(item => {
    if (!states[item.state]) states[item.state] = [];
    states[item.state].push(item);
  });

  districtSelect.innerHTML = `<option value="">-- Jump to North East District --</option>`;

  Object.keys(states).sort().forEach(stateName => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = stateName;

    states[stateName].forEach(district => {
      const option = document.createElement("option");
      option.value = district.name;
      option.textContent = `${district.name} (${district.level} Risk · ${district.score}/100)`;
      optgroup.appendChild(option);
    });

    districtSelect.appendChild(optgroup);
  });

  districtSelect.addEventListener("change", (e) => {
    if (e.target.value) {
      focusDistrict(e.target.value);
    } else {
      resetToNorthEast();
    }
  });
}

// Search / Geocoding Controller
let searchBeacon = null;
async function searchPlace(placeText) {
  if (!placeText.trim()) return;

  // 1. Check if search matches one of our North East districts directly
  const directMatch = riskData.find(d => 
    d.name.toLowerCase() === placeText.trim().toLowerCase() ||
    d.name.toLowerCase().includes(placeText.trim().toLowerCase())
  );

  if (directMatch) {
    focusDistrict(directMatch.name);
    if (districtSelect) districtSelect.value = directMatch.name;
    return;
  }

  if (lastLocationName) lastLocationName.textContent = "Searching real map...";

  try {
    const place = await geocode(placeText);

    map.setView([place.lat, place.lng], 11, { animate: true });

    if (searchBeacon) {
      map.removeLayer(searchBeacon);
    }

    const beaconHtml = `
      <div class="inspection-ping-beacon">
        <div class="ping-sonar"></div>
        <div class="ping-dot">🔍</div>
      </div>
    `;

    searchBeacon = L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        className: "custom-search-beacon",
        html: beaconHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      }),
      zIndexOffset: 1500
    }).addTo(map);

    const displayName = place.name.split(",").slice(0, 3).join(",");
    searchBeacon.bindPopup(popupTemplate("📍 Real Map Location", `
      <strong style="color:#00f0ff;">${escapeHtml(displayName)}</strong><br>
      <span style="font-size:11px;color:#8892b0;">GPS: ${place.lat.toFixed(4)}°N, ${place.lng.toFixed(4)}°E</span>
    `)).openPopup();

    if (lastLocationName) {
      lastLocationName.textContent = displayName;
    }
    StorageService.saveLastPlace(place);
    updateRiskForLocation(place.lat, place.lng);
  } catch (error) {
    if (lastLocationName) lastLocationName.textContent = error.message;
  }
}

// Current Geolocation Controller (Only when explicitly clicked by user)
function useCurrentLocation() {
  if (!navigator.geolocation) {
    if (lastLocationName) lastLocationName.textContent = "GPS is not supported by this browser.";
    return;
  }

  if (lastLocationName) lastLocationName.textContent = "Getting GPS location...";

  navigator.geolocation.getCurrentPosition(async position => {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    map.setView([lat, lng], 12, { animate: true });

    const locationMarker = L.marker([lat, lng]).addTo(map);
    locationMarker.bindPopup(popupTemplate("Your current location", "Browser GPS position")).openPopup();

    try {
      const name = await reverseGeocode(lat, lng);
      if (lastLocationName) lastLocationName.textContent = name.split(",").slice(0, 2).join(",");
      StorageService.saveLastPlace({ lat, lng, name });
    } catch {
      if (lastLocationName) lastLocationName.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      StorageService.saveLastPlace({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
    }

    updateRiskForLocation(lat, lng);
  }, () => {
    if (lastLocationName) lastLocationName.textContent = "Location permission unavailable";
  });
}

// Active Route State & Dual-Route Display Orchestrator
window.activeRouteData = null;
window.activeRouteMode = "safest"; // "safest" | "direct"

window.switchRouteDisplay = function(mode) {
  window.activeRouteMode = mode;
  renderRouteOnMap(mode);
  renderRouteDetails(mode);
};

function renderRouteOnMap(mode = "safest") {
  if (!window.activeRouteData) return;
  const data = window.activeRouteData;
  routeLayer.clearLayers();

  const isSafest = mode === "safest";
  const primaryRoute = isSafest ? data.safestRoute : data.directRoute;
  const secondaryRoute = isSafest ? data.directRoute : data.safestRoute;

  // 1. If hazard was bypassed and viewing safest, draw the Direct Route as a cautionary dashed reference
  if (data.isHazardBypassed && isSafest && secondaryRoute && secondaryRoute.coords) {
    L.polyline(secondaryRoute.coords, {
      color: "#ff3860",
      weight: 3.5,
      opacity: 0.65,
      dashArray: "6, 9"
    }).addTo(routeLayer)
      .bindTooltip(`⚠️ Avoided Direct Highway (Traverses ${secondaryRoute.hazardCount} disaster hazard zones)`, { sticky: true });
  }

  // 2. Draw the Primary Selected Route
  if (primaryRoute && primaryRoute.coords) {
    if (isSafest) {
      // Outer neon glow
      L.polyline(primaryRoute.coords, {
        color: "#0052cc",
        weight: 9,
        opacity: 0.8
      }).addTo(routeLayer);

      // Inner vibrant cyan/emerald line
      L.polyline(primaryRoute.coords, {
        color: "#00f5d4",
        weight: 5,
        opacity: 1
      }).addTo(routeLayer);
    } else {
      // Direct Route displayed as primary (warning style)
      L.polyline(primaryRoute.coords, {
        color: "#ff3860",
        weight: 6,
        opacity: 0.95
      }).addTo(routeLayer);
    }
  }

  // 3. Tactical Start and End Markers
  const startName = data.a.name.split(",")[0];
  const endName = data.b.name.split(",")[0];

  const iconA = L.divIcon({
    className: "custom-route-marker",
    html: `<div style="background:#00e5ff;color:#0a1014;font-weight:700;font-size:11px;padding:3px 9px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.6);white-space:nowrap;">🟢 START: ${escapeHtml(startName)}</div>`,
    iconSize: [120, 24],
    iconAnchor: [60, 24]
  });

  const iconB = L.divIcon({
    className: "custom-route-marker",
    html: `<div style="background:#ff3860;color:#ffffff;font-weight:700;font-size:11px;padding:3px 9px;border-radius:12px;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.6);white-space:nowrap;">🏁 DEST: ${escapeHtml(endName)}</div>`,
    iconSize: [120, 24],
    iconAnchor: [60, 24]
  });

  L.marker([data.a.lat, data.a.lng], { icon: iconA }).addTo(routeLayer)
    .bindPopup(popupTemplate("Route Origin", `<strong>${escapeHtml(data.a.name)}</strong>`));

  L.marker([data.b.lat, data.b.lng], { icon: iconB }).addTo(routeLayer)
    .bindPopup(popupTemplate("Route Destination", `<strong>${escapeHtml(data.b.name)}</strong>`));

  // 4. Mark Safe Bypass Waypoints on the Map
  if (isSafest && primaryRoute.waypoints && primaryRoute.waypoints.length) {
    primaryRoute.waypoints.forEach(wp => {
      const iconShield = L.divIcon({
        className: "custom-route-marker",
        html: `<div style="background:#00f5d4;color:#0b1120;font-weight:800;font-size:10px;padding:2px 8px;border-radius:10px;border:1.5px solid #ffffff;box-shadow:0 2px 10px rgba(0,245,212,0.5);white-space:nowrap;">🛡️ SAFE BYPASS: ${escapeHtml(wp.name || 'Corridor')}</div>`,
        iconSize: [140, 20],
        iconAnchor: [70, 20]
      });
      L.marker([wp.lat, wp.lng], { icon: iconShield }).addTo(routeLayer)
        .bindPopup(popupTemplate("All-Weather Safe Corridor", `<strong>${escapeHtml(wp.name)}</strong><br>Engineered highway alignment circumventing high landslide danger zones.`));
    });
  }

  // 5. Mark avoided hazards on the map with glowing hazard badges
  if (data.isHazardBypassed && isSafest && data.safestRoute.bypassedHazards) {
    data.safestRoute.bypassedHazards.forEach(hz => {
      const hazardIcon = L.divIcon({
        className: "custom-route-marker",
        html: `<div style="background:rgba(255,56,96,0.9);color:#ffffff;font-weight:700;font-size:9.5px;padding:2px 6px;border-radius:8px;border:1px solid #ffccd5;box-shadow:0 0 10px rgba(255,56,96,0.6);white-space:nowrap;">⚠️ AVOIDED: ${escapeHtml(hz.name.slice(0, 18))}</div>`,
        iconSize: [110, 18],
        iconAnchor: [55, 18]
      });
      L.marker([hz.lat, hz.lng], { icon: hazardIcon }).addTo(routeLayer)
        .bindPopup(popupTemplate("Active Hazard (Safely Bypassed)", `<strong>${escapeHtml(hz.name)}</strong><br>Status: <span style="color:#ff3860;">${escapeHtml(hz.level || hz.status || 'Active')}</span> (Risk: ${hz.score}/100)<br>${escapeHtml(hz.description || '')}`));
    });
  }

  // Zoom map to encompass the route
  const bounds = L.latLngBounds(primaryRoute.coords);
  if (secondaryRoute && secondaryRoute.coords) {
    bounds.extend(L.latLngBounds(secondaryRoute.coords));
  }
  map.fitBounds(bounds, { padding: [50, 50] });
}

function renderRouteDetails(mode = "safest") {
  if (!window.activeRouteData) return;
  const data = window.activeRouteData;
  const isSafest = mode === "safest";
  const rt = isSafest ? data.safestRoute : data.directRoute;
  const viewEl = document.getElementById("routeDetailsView");
  const gMapsBtn = document.getElementById("btnGoogleMapsNav");

  // Update tabs active state
  const btnSafe = document.getElementById("btnShowSafestRoute");
  const btnDirect = document.getElementById("btnShowDirectRoute");
  if (btnSafe) {
    btnSafe.className = `route-tab-pill pill-safe ${isSafest ? 'active' : ''}`;
  }
  if (btnDirect) {
    btnDirect.className = `route-tab-pill pill-danger ${!isSafest ? 'active' : ''}`;
  }

  if (gMapsBtn) {
    gMapsBtn.href = rt.googleMapsUrl;
  }

  if (!viewEl) return;

  if (isSafest) {
    const isClean = rt.isClear;
    const statusClass = isClean ? "status-safe" : "status-safe";
    const statusText = isClean
      ? "🛡️ 100% DISASTER-FREE SAFEST ROUTE"
      : `🛡️ SAFEST HIGHWAY CORRIDOR (MINIMAL RISK)`;

    const bypassedHazardsHtml = (rt.bypassedHazards && rt.bypassedHazards.length)
      ? `
        <div class="route-safe-box">
          <strong style="color:#00f5d4;">✓ Real Hazard Avoidance Active:</strong><br>
          ${rt.bypassedHazards.map(h => `• Bypassed: <strong>${escapeHtml(h.name)}</strong> (${h.level || h.status} • Risk: ${h.score}/100)`).join("<br>")}
        </div>
      ` : "";

    viewEl.innerHTML = `
      <div class="route-status-pill ${statusClass}">${statusText}</div>

      <div class="route-metrics-grid">
        <div class="route-metric-item">
          <span class="route-metric-label">Distance</span>
          <span class="route-metric-value" style="color:#00f5d4;">${rt.distanceKm} km</span>
        </div>
        <div class="route-metric-item">
          <span class="route-metric-label">Drive Time</span>
          <span class="route-metric-value">${rt.driveTimeFormatted}</span>
        </div>
        <div class="route-metric-item">
          <span class="route-metric-label">Risk Index</span>
          <span class="route-metric-value" style="color:#00f5d4;">${rt.maxRiskScore}/100</span>
        </div>
      </div>

      <p style="font-size:11px;color:var(--text);margin:6px 0;line-height:1.4;">
        ${escapeHtml(rt.safetySummary || '')}
      </p>

      ${rt.corridorNotes ? `<small style="display:block;color:var(--muted);font-size:10px;margin-top:4px;">🛣️ <strong>Alignment:</strong> ${escapeHtml(rt.name || '')} — ${escapeHtml(rt.corridorNotes)}</small>` : ''}
      ${bypassedHazardsHtml}
    `;
  } else {
    // Direct Route Details
    const hazardsHtml = (rt.intersectedHazards && rt.intersectedHazards.length)
      ? `
        <div class="route-hazards-box">
          <strong style="color:#ff3860;">⚠️ Traversed Disaster Danger Zones:</strong><br>
          ${rt.intersectedHazards.map(h => `• <strong>${escapeHtml(h.name)}</strong> (${h.level || h.status} • Risk ${h.score}/100) — <span style="font-size:10px;">${escapeHtml(h.description || '')}</span>`).join("<br>")}
        </div>
      ` : "";

    viewEl.innerHTML = `
      <div class="route-status-pill status-danger">⚠️ DIRECT HIGHWAY (DISASTER DANGER)</div>

      <div class="route-metrics-grid">
        <div class="route-metric-item">
          <span class="route-metric-label">Distance</span>
          <span class="route-metric-value" style="color:#ff4d6d;">${rt.distanceKm} km</span>
        </div>
        <div class="route-metric-item">
          <span class="route-metric-label">Drive Time</span>
          <span class="route-metric-value">${rt.driveTimeFormatted}</span>
        </div>
        <div class="route-metric-item">
          <span class="route-metric-label">Risk Index</span>
          <span class="route-metric-value" style="color:#ff4d6d;">${rt.maxRiskScore}/100</span>
        </div>
      </div>

      <p style="font-size:11px;color:#ff8597;margin:6px 0;line-height:1.4;">
        ⚠️ <strong>TRANSIT DANGER:</strong> Direct path crosses into active landslide blockages and unstable mountain terrain. Travel on this corridor is not recommended.
      </p>

      ${hazardsHtml}
    `;
  }
}

// Point A → Point B Route Controller
async function handleRouteCalculation() {
  const pointA = document.getElementById("pointA")?.value;
  const pointB = document.getElementById("pointB")?.value;
  const result = document.getElementById("routeResult");
  const button = document.getElementById("routeBtn");

  if (!pointA || !pointB) {
    if (result) {
      result.classList.remove("hidden");
      result.textContent = "Please enter both Point A and Point B.";
    }
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "Analyzing Disaster Risks & Computing...";
  }
  if (result) {
    result.classList.remove("hidden");
    result.innerHTML = `<span style="color:var(--accent);">🔍 Calculating real-time safest route & scanning landslide hazard zones...</span>`;
  }

  try {
    const data = await SafeRoutingEngine.calculateSafeAndShortestRoute(pointA, pointB);
    window.activeRouteData = data;
    window.activeRouteMode = "safest";

    const switcherHtml = data.isHazardBypassed ? `
      <div class="route-mode-switcher">
        <button class="route-tab-pill active pill-safe" id="btnShowSafestRoute" onclick="window.switchRouteDisplay('safest')">
          🛡️ Safest Route (Clear)
        </button>
        <button class="route-tab-pill pill-danger" id="btnShowDirectRoute" onclick="window.switchRouteDisplay('direct')">
          ⚠️ Direct Route (${data.directRoute.hazardCount} Hazards)
        </button>
      </div>
    ` : "";

    result.innerHTML = `
      <div class="safe-route-card">
        ${switcherHtml}
        <div id="routeDetailsView"></div>
        <a id="btnGoogleMapsNav" href="${data.safestRoute.googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="google-maps-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#FFFFFF"/>
          </svg>
          <span>Open Live Route in Google Maps ↗</span>
        </a>
      </div>
    `;

    renderRouteDetails("safest");
    renderRouteOnMap("safest");
  } catch (error) {
    if (result) {
      result.classList.remove("hidden");
      result.innerHTML = `<span style="color:var(--danger);">${escapeHtml(error.message)}</span>`;
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Check road route";
    }
  }
}

// Live Time Status
function updateTime() {
  const timeEl = document.getElementById("updatedTime");
  if (!timeEl) return;
  const now = new Date();
  timeEl.textContent = `Updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

// Initialize UI Bindings
function initApp() {
  // Populate districts dropdown
  populateDistrictSelector();

  // Layer Switchers
  const layerButtons = document.querySelectorAll(".layer-btn");
  layerButtons.forEach(btn => {
    btn.addEventListener("click", () => activateLayer(btn.dataset.layer));
  });
  renderLegend("all");

  // Search event listeners
  if (searchBtn && searchInput) {
    searchBtn.addEventListener("click", () => searchPlace(searchInput.value));
    searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") searchPlace(searchInput.value);
    });
  }

  // Location button
  if (locateBtn) {
    locateBtn.addEventListener("click", useCurrentLocation);
  }

  // Reset to North East View button
  if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
      resetToNorthEast();
      if (districtSelect) districtSelect.value = "";
    });
  }

  // Route button
  if (routeBtn) {
    routeBtn.addEventListener("click", handleRouteCalculation);
  }

  // Disaster HUD Quick Filter Pills
  const hudPills = document.querySelectorAll(".hud-pill");
  hudPills.forEach(pill => {
    pill.addEventListener("click", () => {
      hudPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      const filter = pill.dataset.filter;

      if (filter === "blocked") {
        activateLayer("roads");
      } else {
        activateLayer("all");
        filterDisasterNodes(filter);
      }
    });
  });

  // View Switcher (Live Map vs Operations Dashboard)
  const tabMapView = document.getElementById("tabMapView");
  const tabDashboardView = document.getElementById("tabDashboardView");
  const mapView = document.getElementById("mapView");
  const dashboardView = document.getElementById("dashboardView");

  function switchToMapView() {
    if (!tabMapView || !mapView) return;
    tabMapView.classList.add("active");
    tabMapView.setAttribute("aria-selected", "true");
    if (tabDashboardView) {
      tabDashboardView.classList.remove("active");
      tabDashboardView.setAttribute("aria-selected", "false");
    }
    mapView.classList.remove("hidden");
    if (dashboardView) dashboardView.classList.add("hidden");

    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }

  function switchToDashboardView() {
    if (!tabDashboardView || !dashboardView) return;
    tabDashboardView.classList.add("active");
    tabDashboardView.setAttribute("aria-selected", "true");
    if (tabMapView) {
      tabMapView.classList.remove("active");
      tabMapView.setAttribute("aria-selected", "false");
    }
    dashboardView.classList.remove("hidden");
    if (mapView) mapView.classList.add("hidden");

    refreshDashboardPanels();
  }

  if (tabMapView) tabMapView.addEventListener("click", switchToMapView);
  if (tabDashboardView) tabDashboardView.addEventListener("click", switchToDashboardView);

  // Expose global switcher for action buttons
  window.switchToMapView = switchToMapView;
  window.switchToDashboardView = switchToDashboardView;

  // Initialize Operations Dashboard Panels
  initOperationsDashboard();

  // On application launch, ALWAYS show the North Eastern Region
  resetToNorthEast();

  // Live timer update
  updateTime();
  setInterval(updateTime, 60000);
}

/* ==========================================================================
   Operations Dashboard 4 Core Simple Panels Logic
   ========================================================================== */

let activeReportFilter = "all";

function initOperationsDashboard() {
  const dashStateFilter = document.getElementById("dashStateFilter");
  const dashDistrictSearch = document.getElementById("dashDistrictSearch");
  const statusTabs = document.querySelectorAll(".status-filter-tab");

  if (dashStateFilter) {
    dashStateFilter.addEventListener("change", () => {
      renderDistrictSeverityPanel(dashStateFilter.value, dashDistrictSearch ? dashDistrictSearch.value : "");
    });
  }

  if (dashDistrictSearch) {
    dashDistrictSearch.addEventListener("input", () => {
      renderDistrictSeverityPanel(dashStateFilter ? dashStateFilter.value : "all", dashDistrictSearch.value);
    });
  }

  statusTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      statusTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeReportFilter = tab.dataset.filter;
      renderCitizenReportsPanel(activeReportFilter);
    });
  });

  // Initial render
  refreshDashboardPanels();
}

function refreshDashboardPanels() {
  renderDistrictSeverityPanel();
  renderRoadSegmentsPanel();
  renderRecentAlertsPanel();
  renderCitizenReportsPanel(activeReportFilter);
  updateDashboardSummaryCounters();
}

// --------------------------------------------------------------------------
// PANEL 1: Risk Severity by District
// --------------------------------------------------------------------------
function renderDistrictSeverityPanel(stateFilter = "all", searchQuery = "") {
  const listEl = document.getElementById("districtSeverityList");
  if (!listEl) return;

  let filtered = [...riskData];

  if (stateFilter && stateFilter !== "all") {
    filtered = filtered.filter(d => d.state.toLowerCase() === stateFilter.toLowerCase());
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(d => d.name.toLowerCase().includes(q) || d.state.toLowerCase().includes(q));
  }

  // Sort by risk score descending
  filtered.sort((a, b) => b.score - a.score);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state" style="text-align:center;padding:30px;color:var(--muted);font-size:11px;">No districts matched your search filter.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(d => {
    const color = riskColor(d.level);
    return `
      <div class="district-row">
        <div class="district-name-cell">
          <strong>${escapeHtml(d.name)}</strong>
          <small>${escapeHtml(d.state)}</small>
        </div>
        <div style="font-weight:700;color:var(--text);">${d.rainfall} mm</div>
        <div style="color:var(--muted);">${d.slope}</div>
        <div class="risk-meter-cell">
          <div class="risk-bar-bg">
            <div class="risk-bar-fill" style="width:${d.score}%;background:${color};"></div>
          </div>
          <span class="risk-score-val" style="color:${color};">${d.score}/100</span>
          <span class="risk-pill level-${d.level.toLowerCase()}">${d.level}</span>
        </div>
        <div>
          <button class="btn-view-map" type="button" onclick="focusDistrictFromDashboard('${escapeHtml(d.name)}')">📍 Map</button>
        </div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// PANEL 2: Number of High-Risk Road Segments
// --------------------------------------------------------------------------
function renderRoadSegmentsPanel() {
  const listEl = document.getElementById("roadSegmentsList");
  const blockedEl = document.getElementById("pillCountBlocked");
  const slowEl = document.getElementById("pillCountSlow");
  const openEl = document.getElementById("pillCountOpen");

  let blockedCount = 0;
  let slowCount = 0;
  let openCount = 0;

  roadData.forEach(r => {
    if (r.status === "Blocked") blockedCount++;
    else if (r.status === "Slow") slowCount++;
    else if (r.status === "Open") openCount++;
  });

  if (blockedEl) blockedEl.textContent = blockedCount;
  if (slowEl) slowEl.textContent = slowCount;
  if (openEl) openEl.textContent = openCount;

  const totalHighRisk = blockedCount + slowCount;
  const dashCountBlockedRoads = document.getElementById("dashCountBlockedRoads");
  if (dashCountBlockedRoads) dashCountBlockedRoads.textContent = `${totalHighRisk}`;

  if (!listEl) return;

  // Sort roads so Blocked and Slow come first
  const sortedRoads = [...roadData].sort((a, b) => {
    const rank = { Blocked: 0, Slow: 1, Open: 2 };
    return rank[a.status] - rank[b.status];
  });

  listEl.innerHTML = sortedRoads.map((r, idx) => {
    const isBlocked = r.status === "Blocked";
    const isSlow = r.status === "Slow";
    const statusClass = isBlocked ? "status-blocked" : isSlow ? "status-slow" : "status-open";
    const color = roadColor(r.status);
    const advisory = isBlocked 
      ? "⛔ Critical Blockage: Landslide debris across road width. PWD & BRO clearance teams dispatched. Heavy detour in place."
      : isSlow
      ? "⚠️ Sinking zone / slow single-lane crawl: Active slope movement observed. Avoid night driving."
      : "🟢 Corridor Passable: Traffic flowing under normal mountain speed guidelines.";

    return `
      <div class="road-segment-card ${statusClass}">
        <div class="road-card-top">
          <div>
            <strong>${escapeHtml(r.name)}</strong>
            <small>Sector: ${escapeHtml(r.state)}</small>
          </div>
          <span class="road-status-tag" style="background:${color}25;color:${color};border:1px solid ${color}60;">${r.status}</span>
        </div>
        <div style="font-size:10px;color:var(--muted);line-height:1.4;">${advisory}</div>
        <div class="road-card-meta">
          <span>Telemetry: Sensors Active · Update 10m ago</span>
          <button class="btn-view-map" type="button" onclick="focusRoadFromDashboard(${idx})">📍 Inspect on Map</button>
        </div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// PANEL 3: Recent Alerts Sent
// --------------------------------------------------------------------------
function renderRecentAlertsPanel() {
  const listEl = document.getElementById("recentAlertsList");
  const countEl = document.getElementById("dashCountAlerts");
  if (countEl && typeof alertsData !== "undefined") {
    countEl.textContent = alertsData.length;
  }

  if (!listEl || typeof alertsData === "undefined") return;

  listEl.innerHTML = alertsData.map(alert => {
    const sevClass = `severity-${alert.severity.toLowerCase()}`;
    const sevColor = riskColor(alert.severity);

    return `
      <div class="alert-item-card ${sevClass}">
        <div class="alert-item-header">
          <span class="alert-id-tag">${escapeHtml(alert.id)}</span>
          <span class="risk-pill level-${alert.severity.toLowerCase()}">${escapeHtml(alert.severity)}</span>
          <span class="alert-time">🕒 ${escapeHtml(alert.time)}</span>
        </div>
        <div class="alert-title-text">${escapeHtml(alert.title)}</div>
        <div class="alert-message-text">${escapeHtml(alert.message)}</div>
        <div class="alert-footer-meta">
          <span>Target: <strong>${escapeHtml(alert.district)}</strong> (${escapeHtml(alert.state)})</span>
          <span style="color:var(--muted);background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;">📡 ${escapeHtml(alert.channel)}</span>
        </div>
      </div>
    `;
  }).join("");
}

// --------------------------------------------------------------------------
// PANEL 4: List of Citizen Reports with Status (New / Verified / Resolved)
// --------------------------------------------------------------------------
function renderCitizenReportsPanel(filterStatus = "all") {
  const listEl = document.getElementById("citizenReportsList");
  const reports = StorageService.getSavedReports();

  let countAll = reports.length;
  let countNew = 0;
  let countVerified = 0;
  let countResolved = 0;

  reports.forEach(r => {
    const s = (r.status || "New").toLowerCase();
    if (s === "new") countNew++;
    else if (s === "verified") countVerified++;
    else if (s === "resolved") countResolved++;
  });

  // Update counter badges
  const elAll = document.getElementById("countReportAll");
  const elNew = document.getElementById("countReportNew");
  const elVer = document.getElementById("countReportVerified");
  const elRes = document.getElementById("countReportResolved");
  const elHeaderNew = document.getElementById("dashCountNewReportsHeader");
  const elHeaderTotal = document.getElementById("dashCountReportsTotal");

  if (elAll) elAll.textContent = countAll;
  if (elNew) elNew.textContent = countNew;
  if (elVer) elVer.textContent = countVerified;
  if (elRes) elRes.textContent = countResolved;
  if (elHeaderNew) elHeaderNew.textContent = countNew;
  if (elHeaderTotal) elHeaderTotal.textContent = countAll;

  if (!listEl) return;

  let filtered = [...reports];
  if (filterStatus && filterStatus !== "all") {
    filtered = filtered.filter(r => (r.status || "New").toLowerCase() === filterStatus.toLowerCase());
  }

  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state" style="text-align:center;padding:30px;color:var(--muted);font-size:11px;">No reports with status "${escapeHtml(filterStatus)}".</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(r => {
    const st = r.status || "New";
    const borderClass = `border-${st.toLowerCase()}`;
    const valClass = `val-${st.toLowerCase()}`;
    const timeFormatted = r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recent";

    return `
      <div class="citizen-report-card ${borderClass}" id="reportCard-${r.id}">
        <div class="report-card-header">
          <span class="report-type-badge">
            <span>⚠️</span> ${escapeHtml(r.type || "Incident")}
            <span class="risk-pill level-${(r.priority || "Medium").toLowerCase()}">${escapeHtml(r.priority || "Medium")}</span>
          </span>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:8.5px;color:var(--muted);text-transform:uppercase;font-weight:700;">Status:</label>
            <select class="report-status-select ${valClass}" onchange="handleReportStatusChange('${r.id}', this.value)">
              <option value="New" ${st === "New" ? "selected" : ""}>🟡 New</option>
              <option value="Verified" ${st === "Verified" ? "selected" : ""}>🔵 Verified</option>
              <option value="Resolved" ${st === "Resolved" ? "selected" : ""}>🟢 Resolved</option>
            </select>
          </div>
        </div>

        <div style="font-size:11px;font-weight:700;color:var(--text);">📍 ${escapeHtml(r.location || "North Eastern Sector")}</div>
        <div class="report-desc-text">${escapeHtml(r.description || "No description attached.")}</div>

        <div class="report-card-footer">
          <div class="report-meta-chips">
            <span class="meta-evidence-chip">📸 ${r.files || 0} files</span>
            <span>By: ${escapeHtml(r.reporter || "Citizen")}</span>
            <span>🕒 ${timeFormatted}</span>
          </div>
          ${r.lat && r.lng ? `<button class="btn-view-map" type="button" onclick="focusReportFromDashboard(${r.lat}, ${r.lng}, '${escapeHtml(r.type)}')">📍 View on Map</button>` : `<span style="font-size:8.5px;color:var(--muted);">No GPS</span>`}
        </div>
      </div>
    `;
  }).join("");
}

// Status change handler for Citizen Reports
window.handleReportStatusChange = function(reportId, newStatus) {
  const success = StorageService.updateReportStatus(reportId, newStatus);
  if (success) {
    renderCitizenReportsPanel(activeReportFilter);
  }
};

window.refreshCitizenReportsPanel = function() {
  renderCitizenReportsPanel(activeReportFilter);
};

// Summary Counters
function updateDashboardSummaryCounters() {
  let criticalCount = 0;
  let highCount = 0;

  riskData.forEach(d => {
    if (d.level === "Critical") criticalCount++;
    else if (d.level === "High") highCount++;
  });

  const elCrit = document.getElementById("dashCountCritical");
  const elHigh = document.getElementById("dashCountHigh");
  if (elCrit) elCrit.textContent = criticalCount;
  if (elHigh) elHigh.textContent = highCount;
}

// Navigation helpers from Dashboard to Map
window.focusDistrictFromDashboard = function(districtName) {
  switchToMapView();
  setTimeout(() => {
    focusDistrict(districtName);
  }, 100);
};

window.focusRoadFromDashboard = function(roadIndex) {
  switchToMapView();
  setTimeout(() => {
    activateLayer("roads");
    const r = roadData[roadIndex];
    if (r && r.coords && r.coords.length) {
      map.fitBounds(L.latLngBounds(r.coords), { padding: [60, 60] });
    }
  }, 100);
};

window.focusReportFromDashboard = function(lat, lng, type) {
  switchToMapView();
  setTimeout(() => {
    activateLayer("reports");
    map.setView([lat, lng], 13, { animate: true });
  }, 100);
};

// ==========================================================================
// NEXZORA RBAC & Auth UI Orchestrator
// ==========================================================================

const tabMapView = document.getElementById("tabMapView");
const tabDashboardView = document.getElementById("tabDashboardView");
const tabOfficerView = document.getElementById("tabOfficerView");
const tabAdminView = document.getElementById("tabAdminView");

const mapViewEl = document.getElementById("mapView");
const dashboardViewEl = document.getElementById("dashboardView");
const officerViewEl = document.getElementById("officerView");
const adminViewEl = document.getElementById("adminView");
const pendingViewEl = document.getElementById("pendingView");
const accessDeniedViewEl = document.getElementById("accessDeniedView");

function hideAllViews() {
  [mapViewEl, dashboardViewEl, officerViewEl, adminViewEl, pendingViewEl, accessDeniedViewEl].forEach(el => {
    if (el) el.classList.add("hidden");
  });
  [tabMapView, tabDashboardView, tabOfficerView, tabAdminView].forEach(t => {
    if (t) {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    }
  });
}

function switchToMapView() {
  hideAllViews();
  if (mapViewEl) mapViewEl.classList.remove("hidden");
  if (tabMapView) {
    tabMapView.classList.add("active");
    tabMapView.setAttribute("aria-selected", "true");
  }
  if (map) setTimeout(() => map.invalidateSize(), 150);
}

function switchToDashboardView() {
  hideAllViews();
  if (dashboardViewEl) dashboardViewEl.classList.remove("hidden");
  if (tabDashboardView) {
    tabDashboardView.classList.add("active");
    tabDashboardView.setAttribute("aria-selected", "true");
  }
  renderDistrictSeverityPanel();
  renderRoadSegmentsPanel();
  renderRecentAlertsPanel();
  renderCitizenReportsPanel(activeReportFilter);
}

function switchToOfficerView() {
  if (!window.Auth || !window.Auth.isLoggedIn()) {
    openAuthModal('signin');
    return;
  }
  if (window.Auth.isPendingOfficer()) {
    switchToPendingView();
    return;
  }
  if (!window.Auth.hasRole('field_officer', 'admin')) {
    switchToAccessDeniedView();
    return;
  }

  hideAllViews();
  if (officerViewEl) officerViewEl.classList.remove("hidden");
  if (tabOfficerView) {
    tabOfficerView.classList.add("active");
    tabOfficerView.setAttribute("aria-selected", "true");
  }
  loadOfficerDashboard();
}

function switchToAdminView() {
  if (!window.Auth || !window.Auth.isLoggedIn()) {
    openAuthModal('signin');
    return;
  }
  if (!window.Auth.hasRole('admin')) {
    switchToAccessDeniedView();
    return;
  }

  hideAllViews();
  if (adminViewEl) adminViewEl.classList.remove("hidden");
  if (tabAdminView) {
    tabAdminView.classList.add("active");
    tabAdminView.setAttribute("aria-selected", "true");
  }
  loadAdminDashboard();
}

function switchToPendingView() {
  hideAllViews();
  if (pendingViewEl) {
    pendingViewEl.classList.remove("hidden");
    const locEl = document.getElementById("pendingUserLocation");
    if (locEl && window.Auth.user) {
      locEl.textContent = `${window.Auth.user.district || 'General'}, ${window.Auth.user.state || 'NER'}`;
    }
  }
}

function switchToAccessDeniedView() {
  hideAllViews();
  if (accessDeniedViewEl) accessDeniedViewEl.classList.remove("hidden");
}

// Wire Topbar Navigation
if (tabMapView) tabMapView.addEventListener("click", switchToMapView);
if (tabDashboardView) tabDashboardView.addEventListener("click", switchToDashboardView);
if (tabOfficerView) tabOfficerView.addEventListener("click", switchToOfficerView);
if (tabAdminView) tabAdminView.addEventListener("click", switchToAdminView);

const accessHomeBtn = document.getElementById("accessDeniedHomeBtn");
if (accessHomeBtn) accessHomeBtn.addEventListener("click", switchToMapView);

const pendingCheckBtn = document.getElementById("pendingCheckStatusBtn");
if (pendingCheckBtn) {
  pendingCheckBtn.addEventListener("click", async () => {
    await window.Auth.init();
    if (window.Auth.isActive()) {
      alert("Congratulations! Your Field Officer account has been approved and activated.");
      switchToOfficerView();
    } else {
      alert("Your account is still pending administrator approval.");
    }
  });
}

const pendingLogoutBtn = document.getElementById("pendingLogoutBtn");
if (pendingLogoutBtn) pendingLogoutBtn.addEventListener("click", () => {
  window.Auth.logout();
  switchToMapView();
});

// ==========================================================================
// Auth State Subscriber: Topbar & Role Visibility
// ==========================================================================

const loggedOutButtons = document.getElementById("loggedOutButtons");
const loggedInUserSection = document.getElementById("loggedInUserSection");
const topbarUserName = document.getElementById("topbarUserName");
const topbarRoleBadge = document.getElementById("topbarRoleBadge");
const userAvatarMark = document.getElementById("userAvatarMark");

if (window.Auth) {
  window.Auth.subscribe(user => {
    if (user && user.account_status !== 'suspended') {
      if (loggedOutButtons) loggedOutButtons.classList.add("hidden");
      if (loggedInUserSection) loggedInUserSection.classList.remove("hidden");

      if (topbarUserName) topbarUserName.textContent = user.full_name || "User";
      if (userAvatarMark) {
        const initials = (user.full_name || "U").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
        userAvatarMark.textContent = initials;
      }

      if (topbarRoleBadge) {
        topbarRoleBadge.className = `role-badge role-${user.role}`;
        let label = "Citizen";
        if (user.role === "field_officer") label = "Field Officer";
        else if (user.role === "admin") label = "Administrator";
        topbarRoleBadge.textContent = label;
      }

      // Role Tabs Visibility
      if (tabOfficerView) {
        if (user.role === "field_officer" || user.role === "admin") {
          tabOfficerView.classList.remove("hidden");
        } else {
          tabOfficerView.classList.add("hidden");
        }
      }

      if (tabAdminView) {
        if (user.role === "admin") {
          tabAdminView.classList.remove("hidden");
        } else {
          tabAdminView.classList.add("hidden");
        }
      }
    } else {
      if (loggedOutButtons) loggedOutButtons.classList.remove("hidden");
      if (loggedInUserSection) loggedInUserSection.classList.add("hidden");
      if (tabOfficerView) tabOfficerView.classList.add("hidden");
      if (tabAdminView) tabAdminView.classList.add("hidden");
    }
  });
}

// ==========================================================================
// Auth Modal & Registration Wizard Logic
// ==========================================================================

const authModal = document.getElementById("authModal");
const authBackdrop = document.getElementById("authModalBackdrop");
const closeAuthModalBtn = document.getElementById("closeAuthModalBtn");

const tabSignIn = document.getElementById("tabSignIn");
const tabRegister = document.getElementById("tabRegister");
const loginFormWrap = document.getElementById("loginFormWrap");
const registerFormWrap = document.getElementById("registerFormWrap");
const forgotPassWrap = document.getElementById("forgotPassWrap");
const resetPassWrap = document.getElementById("resetPassWrap");

window.openAuthModal = function(mode = 'signin') {
  if (authModal) authModal.classList.remove("hidden");
  if (mode === 'signin') showSignInTab();
  else if (mode === 'register') showRegisterTab();
  else if (mode === 'forgot') showForgotTab();
};

window.closeAuthModal = function() {
  if (authModal) authModal.classList.add("hidden");
};

if (closeAuthModalBtn) closeAuthModalBtn.addEventListener("click", closeAuthModal);
if (authBackdrop) authBackdrop.addEventListener("click", closeAuthModal);

const openLoginBtn = document.getElementById("openLoginBtn");
if (openLoginBtn) openLoginBtn.addEventListener("click", () => openAuthModal('signin'));

const openRegisterBtn = document.getElementById("openRegisterBtn");
if (openRegisterBtn) openRegisterBtn.addEventListener("click", () => openAuthModal('register'));

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) logoutBtn.addEventListener("click", () => {
  window.Auth.logout();
  switchToMapView();
});

function showSignInTab() {
  if (tabSignIn) tabSignIn.classList.add("active");
  if (tabRegister) tabRegister.classList.remove("active");
  if (loginFormWrap) loginFormWrap.classList.remove("hidden");
  if (registerFormWrap) registerFormWrap.classList.add("hidden");
  if (forgotPassWrap) forgotPassWrap.classList.add("hidden");
  if (resetPassWrap) resetPassWrap.classList.add("hidden");
}

function showRegisterTab() {
  if (tabSignIn) tabSignIn.classList.remove("active");
  if (tabRegister) tabRegister.classList.add("active");
  if (loginFormWrap) loginFormWrap.classList.add("hidden");
  if (registerFormWrap) registerFormWrap.classList.remove("hidden");
  if (forgotPassWrap) forgotPassWrap.classList.add("hidden");
  if (resetPassWrap) resetPassWrap.classList.add("hidden");
  goToRegStep(1);
}

function showForgotTab() {
  if (loginFormWrap) loginFormWrap.classList.add("hidden");
  if (registerFormWrap) registerFormWrap.classList.add("hidden");
  if (forgotPassWrap) forgotPassWrap.classList.remove("hidden");
  if (resetPassWrap) resetPassWrap.classList.add("hidden");
}

function showResetTab() {
  if (loginFormWrap) loginFormWrap.classList.add("hidden");
  if (registerFormWrap) registerFormWrap.classList.add("hidden");
  if (forgotPassWrap) forgotPassWrap.classList.add("hidden");
  if (resetPassWrap) resetPassWrap.classList.remove("hidden");
}

if (tabSignIn) tabSignIn.addEventListener("click", showSignInTab);
if (tabRegister) tabRegister.addEventListener("click", showRegisterTab);

const linkForgotPassword = document.getElementById("linkForgotPassword");
if (linkForgotPassword) linkForgotPassword.addEventListener("click", (e) => {
  e.preventDefault();
  showForgotTab();
});

const forgotBackBtn = document.getElementById("forgotBackToLoginBtn");
if (forgotBackBtn) forgotBackBtn.addEventListener("click", showSignInTab);

const resetBackBtn = document.getElementById("resetBackToLoginBtn");
if (resetBackBtn) resetBackBtn.addEventListener("click", showSignInTab);

// Forgot Password Form Handler
let currentResetIdentifier = '';
const forgotPassForm = document.getElementById("forgotPassForm");
if (forgotPassForm) {
  forgotPassForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const idInput = document.getElementById("forgotIdentifier");
    const identifier = idInput ? idInput.value.trim() : "";
    const msg = document.getElementById("forgotMessage");
    const btn = document.getElementById("forgotSubmitBtn");

    if (!identifier) {
      if (msg) { msg.textContent = "Please enter your email address or mobile number."; msg.style.color = "var(--danger)"; }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending Recovery Code via SMTP...";
    }
    if (msg) {
      msg.textContent = "";
      msg.style.color = "var(--muted)";
    }

    try {
      const res = await window.Auth.forgotPassword(identifier);
      currentResetIdentifier = identifier;

      if (msg) {
        msg.textContent = res.message || "A recovery code has been sent via SMTP to your email.";
        msg.style.color = "var(--accent)";
      }

      const resetSub = document.getElementById("resetPassSubtitle");
      if (resetSub) {
        const dest = res.email || identifier;
        resetSub.innerHTML = `Enter the 6-digit code sent via SMTP to <strong>${escapeHtml(dest)}</strong>.`;
      }

      if (res.devCode) {
        const devPill = document.getElementById("resetDevPillWrap");
        const devCodeEl = document.getElementById("resetDevOtpCode");
        if (devPill) devPill.classList.remove("hidden");
        if (devCodeEl) devCodeEl.textContent = res.devCode;
        const resetOtpInp = document.getElementById("resetOtpCode");
        if (resetOtpInp && !resetOtpInp.value) resetOtpInp.value = res.devCode;
      }

      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Send Recovery Code";
        }
        showResetTab();
      }, 700);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Send Recovery Code";
      }
      if (msg) {
        msg.textContent = err.error || "Failed to process recovery request. Please try again.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// Reset Password Form Handler
const resetPassForm = document.getElementById("resetPassForm");
if (resetPassForm) {
  resetPassForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("resetOtpCode").value.trim();
    const newPass = document.getElementById("resetNewPass").value;
    const confirmPass = document.getElementById("resetConfirmPass").value;
    const msg = document.getElementById("resetMessage");
    const btn = document.getElementById("resetSubmitBtn");

    if (!code || code.length !== 6) {
      if (msg) { msg.textContent = "Please enter the valid 6-digit OTP code."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (!newPass || newPass.length < 8) {
      if (msg) { msg.textContent = "Password must be at least 8 characters long."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (newPass !== confirmPass) {
      if (msg) { msg.textContent = "Passwords do not match."; msg.style.color = "var(--danger)"; }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Updating Password...";
    }
    if (msg) msg.textContent = "";

    try {
      const res = await window.Auth.resetPassword({
        identifier: currentResetIdentifier,
        otp_code: code,
        new_password: newPass,
        confirm_password: confirmPass
      });

      if (msg) {
        msg.textContent = res.message || "Password updated successfully!";
        msg.style.color = "var(--accent)";
      }

      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Update Password";
        }
        resetPassForm.reset();
        showSignInTab();
        const loginId = document.getElementById("loginIdentifier");
        if (loginId && currentResetIdentifier) {
          loginId.value = currentResetIdentifier;
        }
        const loginMsg = document.getElementById("loginMessage");
        if (loginMsg) {
          loginMsg.textContent = "Password reset! You can now sign in with your new password.";
          loginMsg.style.color = "var(--accent)";
        }
      }, 1200);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Update Password";
      }
      if (msg) {
        msg.textContent = err.error || "Password reset failed. Invalid or expired code.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// Quick Test Accounts Autofill (Development Helper)
window.fillTestAccount = function(type) {
  const idInput = document.getElementById("loginIdentifier");
  const passInput = document.getElementById("loginPassword");
  if (!idInput || !passInput) return;

  if (type === 'admin') {
    idInput.value = '9876543210';
    passInput.value = 'Admin@Nexzora2026!';
  } else if (type === 'officer_active') {
    idInput.value = '9876543211';
    passInput.value = 'Officer@Nexzora2026!';
  } else if (type === 'officer_pending') {
    idInput.value = '9876543212';
    passInput.value = 'Officer@Nexzora2026!';
  } else if (type === 'citizen') {
    idInput.value = '9876543213';
    passInput.value = 'Citizen@Nexzora2026!';
  }
};

// Toggle Password Visibility
const togglePassBtn = document.getElementById("toggleLoginPasswordBtn");
if (togglePassBtn) {
  togglePassBtn.addEventListener("click", () => {
    const input = document.getElementById("loginPassword");
    if (!input) return;
    if (input.type === "password") {
      input.type = "text";
      togglePassBtn.textContent = "Hide";
    } else {
      input.type = "password";
      togglePassBtn.textContent = "Show";
    }
  });
}

// Handle Login Form Submit
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("loginIdentifier").value.trim();
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMessage");
    const submitBtn = document.getElementById("loginSubmitBtn");

    if (msg) {
      msg.textContent = "";
      msg.style.color = "var(--muted)";
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing In...";
    }

    try {
      const data = await window.Auth.login(identifier, password);
      if (msg) {
        msg.textContent = data.message;
        msg.style.color = "var(--accent)";
      }
      setTimeout(() => {
        closeAuthModal();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Sign In";
        }
        if (data.redirectUrl === '/admin/dashboard') switchToAdminView();
        else if (data.redirectUrl === '/field-officer/dashboard') switchToOfficerView();
        else if (data.redirectUrl === '/account-pending') switchToPendingView();
        else switchToMapView();
      }, 700);
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
      if (msg) {
        msg.textContent = err.error || "Login failed. Please check your credentials.";
        msg.style.color = "var(--danger)";
      }

      if (err.code === 'ACCOUNT_UNVERIFIED' && err.mobileNumber) {
        // Switch to OTP verification
        showRegisterTab();
        document.getElementById("regMobile").value = err.mobileNumber;
        document.getElementById("otpTargetMobile").textContent = `+91 ${err.mobileNumber}`;
        if (err.devCode) {
          const devPill = document.getElementById("otpDevPillWrap");
          const devCodeEl = document.getElementById("devOtpCode");
          if (devPill) devPill.classList.remove("hidden");
          if (devCodeEl) devCodeEl.textContent = err.devCode;
        }
        goToRegStep(4);
      }
    }
  });
}

// Registration Wizard Step Controls
let currentRegStep = 1;
function goToRegStep(step) {
  currentRegStep = step;
  [1, 2, 3, 4].forEach(s => {
    const el = document.getElementById(`regStep${s}`);
    const ind = document.getElementById(`stepIndicator${s}`);
    if (el) {
      if (s === step) el.classList.remove("hidden");
      else el.classList.add("hidden");
    }
    if (ind) {
      if (s < step) {
        ind.className = "wizard-step completed";
      } else if (s === step) {
        ind.className = "wizard-step active";
      } else {
        ind.className = "wizard-step";
      }
    }
  });
}

// Step 1 -> Step 2
const regNextStep1 = document.getElementById("regNextStep1");
if (regNextStep1) {
  regNextStep1.addEventListener("click", () => {
    const name = document.getElementById("regFullName").value.trim();
    const mobile = document.getElementById("regMobile").value.trim();
    const email = document.getElementById("regEmail") ? document.getElementById("regEmail").value.trim() : "";
    const msg = document.getElementById("registerMessage");
    if (!name) {
      if (msg) { msg.textContent = "Please enter your full name."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (!mobile || mobile.length !== 10) {
      if (msg) { msg.textContent = "Please enter a valid 10-digit mobile number."; msg.style.color = "var(--danger)"; }
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      if (msg) {
        msg.textContent = "Please enter a valid email address for receiving your verification OTP via SMTP.";
        msg.style.color = "var(--danger)";
      }
      return;
    }
    if (msg) msg.textContent = "";
    goToRegStep(2);
  });
}

// State / District selector for registration
const regState = document.getElementById("regState");
const regDistrict = document.getElementById("regDistrict");

const NER_DISTRICT_MAP = {
  "Assam": ["Kamrup Metropolitan", "Kamrup", "Jorhat", "Dima Hasao", "Cachar", "Dibrugarh", "Karbi Anglong", "Sonitpur"],
  "Arunachal Pradesh": ["Tawang", "West Kameng", "Papum Pare", "East Siang", "Lohit", "Changlang", "Lower Subansiri"],
  "Meghalaya": ["East Khasi Hills", "West Khasi Hills", "Ri Bhoi", "West Garo Hills", "East Jaintia Hills"],
  "Manipur": ["Imphal West", "Imphal East", "Churachandpur", "Ukhrul", "Chandel", "Tamenglong"],
  "Mizoram": ["Aizawl", "Lunglei", "Champhai", "Kolasib", "Serchhip"],
  "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Tuensang", "Wokha", "Phek"],
  "Sikkim": ["Gangtok", "Mangan", "Namchi", "Gyalshing", "Pakyong", "Soreng"],
  "Tripura": ["West Tripura", "Dhalai", "North Tripura", "South Tripura", "Gomati"]
};

if (regState && regDistrict) {
  regState.addEventListener("change", (e) => {
    const st = e.target.value;
    regDistrict.innerHTML = '<option value="">Select District</option>';
    if (NER_DISTRICT_MAP[st]) {
      NER_DISTRICT_MAP[st].forEach(d => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        regDistrict.appendChild(opt);
      });
    }
  });
}

window.selectRegRole = function(role) {
  const cardCitizen = document.getElementById("roleCardCitizen");
  const cardOfficer = document.getElementById("roleCardOfficer");
  const roleInput = document.getElementById("regRole");
  const notice = document.getElementById("officerRoleNotice");

  if (roleInput) roleInput.value = role;

  if (role === 'citizen') {
    if (cardCitizen) cardCitizen.classList.add("active");
    if (cardOfficer) cardOfficer.classList.remove("active");
    if (notice) notice.classList.add("hidden");
  } else {
    if (cardCitizen) cardCitizen.classList.remove("active");
    if (cardOfficer) cardOfficer.classList.add("active");
    if (notice) notice.classList.remove("hidden");
  }
};

const regBackStep2 = document.getElementById("regBackStep2");
if (regBackStep2) regBackStep2.addEventListener("click", () => goToRegStep(1));

const regNextStep2 = document.getElementById("regNextStep2");
if (regNextStep2) {
  regNextStep2.addEventListener("click", () => {
    const st = document.getElementById("regState").value;
    const dist = document.getElementById("regDistrict").value;
    const vill = document.getElementById("regVillage").value.trim();
    const msg = document.getElementById("registerMessage");

    if (!st || !dist || !vill) {
      if (msg) { msg.textContent = "Please select state, district, and town/village."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (msg) msg.textContent = "";
    goToRegStep(3);
  });
}

const regBackStep3 = document.getElementById("regBackStep3");
if (regBackStep3) regBackStep3.addEventListener("click", () => goToRegStep(2));

// Step 3 Submit Registration & Request OTP
const regSubmitStep3 = document.getElementById("regSubmitStep3");
if (regSubmitStep3) {
  regSubmitStep3.addEventListener("click", async () => {
    const fullName = document.getElementById("regFullName").value.trim();
    const mobile = document.getElementById("regMobile").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const language = document.getElementById("regLanguage").value;
    const state = document.getElementById("regState").value;
    const district = document.getElementById("regDistrict").value;
    const village = document.getElementById("regVillage").value.trim();
    const role = document.getElementById("regRole").value;
    const password = document.getElementById("regPassword").value;
    const confirmPass = document.getElementById("regConfirmPassword").value;
    const consent = document.getElementById("regConsent").checked;
    const msg = document.getElementById("registerMessage");

    if (!password || password.length < 8) {
      if (msg) { msg.textContent = "Password must be at least 8 characters."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (password !== confirmPass) {
      if (msg) { msg.textContent = "Passwords do not match."; msg.style.color = "var(--danger)"; }
      return;
    }
    if (!consent) {
      if (msg) { msg.textContent = "Disaster management consent is mandatory."; msg.style.color = "var(--danger)"; }
      return;
    }

    regSubmitStep3.disabled = true;
    regSubmitStep3.textContent = "Sending OTP...";

    try {
      const payload = {
        full_name: fullName,
        mobile_number: mobile,
        email: email || undefined,
        preferred_language: language,
        state,
        district,
        village_town: village,
        role,
        password,
        confirm_password: confirmPass,
        consent_accepted: true
      };

      const res = await window.Auth.register(payload);
      regSubmitStep3.disabled = false;
      regSubmitStep3.textContent = "Create Account & Send OTP →";

      const targetEmailEl = document.getElementById("otpTargetEmail");
      if (targetEmailEl) targetEmailEl.textContent = email || `+91 ${mobile}`;
      const mobileNoticeEl = document.getElementById("otpTargetMobileNotice");
      if (mobileNoticeEl) {
        mobileNoticeEl.textContent = mobile ? `(Also backup SMS sent to +91 ${mobile})` : '';
      }
      if (res.devCode) {
        const devPill = document.getElementById("otpDevPillWrap");
        const devCodeEl = document.getElementById("devOtpCode");
        if (devPill) devPill.classList.remove("hidden");
        if (devCodeEl) devCodeEl.textContent = res.devCode;
        // Autofill digits in dev mode
        const codeStr = String(res.devCode);
        otpInputs.forEach((inp, idx) => {
          if (inp && codeStr[idx]) inp.value = codeStr[idx];
        });
      }
      if (msg) msg.textContent = "";
      goToRegStep(4);
      startOtpTimer();
    } catch (err) {
      regSubmitStep3.disabled = false;
      regSubmitStep3.textContent = "Create Account & Send OTP →";
      if (msg) {
        msg.textContent = err.error || "Registration failed. Please check your details.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// OTP Auto Advance on input
const otpInputs = [1, 2, 3, 4, 5, 6].map(i => document.getElementById(`otp${i}`)).filter(Boolean);
otpInputs.forEach((inp, idx) => {
  inp.addEventListener("input", (e) => {
    if (e.target.value.length === 1 && idx < otpInputs.length - 1) {
      otpInputs[idx + 1].focus();
    }
  });
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !e.target.value && idx > 0) {
      otpInputs[idx - 1].focus();
    }
  });
});

let otpInterval = null;
function startOtpTimer() {
  let seconds = 600;
  const timerEl = document.getElementById("otpTimer");
  if (otpInterval) clearInterval(otpInterval);
  otpInterval = setInterval(() => {
    seconds--;
    if (seconds <= 0) {
      clearInterval(otpInterval);
      if (timerEl) timerEl.textContent = "00:00 (Expired)";
      return;
    }
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

// Verify OTP Button
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
if (verifyOtpBtn) {
  verifyOtpBtn.addEventListener("click", async () => {
    const mobile = document.getElementById("regMobile").value.trim();
    const email = document.getElementById("regEmail") ? document.getElementById("regEmail").value.trim() : "";
    const otpCode = otpInputs.map(i => i.value).join("");
    const msg = document.getElementById("registerMessage");

    if (otpCode.length !== 6) {
      if (msg) { msg.textContent = "Please enter the full 6-digit OTP code."; msg.style.color = "var(--danger)"; }
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = "Verifying...";

    try {
      const res = await window.Auth.verifyOtp(email || mobile, otpCode);
      if (msg) {
        msg.textContent = res.message;
        msg.style.color = "var(--accent)";
      }
      setTimeout(() => {
        closeAuthModal();
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = "Verify & Complete Registration";
        if (res.redirectUrl === '/admin/dashboard') switchToAdminView();
        else if (res.redirectUrl === '/field-officer/dashboard') switchToOfficerView();
        else if (res.redirectUrl === '/account-pending') switchToPendingView();
        else switchToMapView();
      }, 1000);
    } catch (err) {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = "Verify & Complete Registration";
      if (msg) {
        msg.textContent = err.error || "Invalid or expired OTP.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// Resend OTP Button
const resendOtpBtn = document.getElementById("resendOtpBtn");
if (resendOtpBtn) {
  resendOtpBtn.addEventListener("click", async () => {
    const mobile = document.getElementById("regMobile").value.trim();
    const email = document.getElementById("regEmail") ? document.getElementById("regEmail").value.trim() : "";
    const msg = document.getElementById("registerMessage");
    try {
      const res = await window.Auth.resendOtp(email || mobile);
      if (res.devCode) {
        const devPill = document.getElementById("otpDevPillWrap");
        const devCodeEl = document.getElementById("devOtpCode");
        if (devPill) devPill.classList.remove("hidden");
        if (devCodeEl) devCodeEl.textContent = res.devCode;
        const codeStr = String(res.devCode);
        otpInputs.forEach((inp, idx) => {
          if (inp && codeStr[idx]) inp.value = codeStr[idx];
        });
      }
      if (msg) { msg.textContent = res.message || "A new verification code has been dispatched."; msg.style.color = "var(--accent)"; }
      startOtpTimer();
    } catch (err) {
      if (msg) { msg.textContent = err.error || "Could not resend OTP."; msg.style.color = "var(--danger)"; }
    }
  });
}

// ==========================================================================
// User Profile Modal Handlers
// ==========================================================================

const profileModal = document.getElementById("profileModal");
const userProfileBtn = document.getElementById("userProfileBtn");
const closeProfileModalBtn = document.getElementById("closeProfileModalBtn");
const profileModalBackdrop = document.getElementById("profileModalBackdrop");

window.openProfileModal = function() {
  if (!window.Auth || !window.Auth.user) return;
  const u = window.Auth.user;

  const nameInp = document.getElementById("profFullName");
  const emailInp = document.getElementById("profEmail");
  const stateInp = document.getElementById("profState");
  const distInp = document.getElementById("profDistrict");
  const villInp = document.getElementById("profVillage");
  const langInp = document.getElementById("profLanguage");
  const roleText = document.getElementById("profileUserRoleText");

  if (nameInp) nameInp.value = u.full_name || "";
  if (emailInp) emailInp.value = u.email || "";
  if (stateInp) stateInp.value = u.state || "Assam";
  if (distInp) distInp.value = u.district || "";
  if (villInp) villInp.value = u.village_town || "";
  if (langInp) langInp.value = u.preferred_language || "English";
  if (roleText) {
    roleText.innerHTML = `Role: <span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span>`;
  }

  if (profileModal) profileModal.classList.remove("hidden");
};

window.closeProfileModal = function() {
  if (profileModal) profileModal.classList.add("hidden");
};

if (userProfileBtn) userProfileBtn.addEventListener("click", openProfileModal);
if (closeProfileModalBtn) closeProfileModalBtn.addEventListener("click", closeProfileModal);
if (profileModalBackdrop) profileModalBackdrop.addEventListener("click", closeProfileModal);

const profileForm = document.getElementById("profileForm");
if (profileForm) {
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("profileMessage");
    const fields = {
      full_name: document.getElementById("profFullName").value.trim(),
      email: document.getElementById("profEmail").value.trim() || null,
      state: document.getElementById("profState").value,
      district: document.getElementById("profDistrict").value.trim(),
      village_town: document.getElementById("profVillage").value.trim(),
      preferred_language: document.getElementById("profLanguage").value
    };

    try {
      const res = await window.Auth.updateProfile(fields);
      if (msg) {
        msg.textContent = res.message || "Profile saved!";
        msg.style.color = "var(--accent)";
      }
      setTimeout(closeProfileModal, 1200);
    } catch (err) {
      if (msg) {
        msg.textContent = err.error || "Failed to update profile.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

const changePasswordForm = document.getElementById("changePasswordForm");
if (changePasswordForm) {
  changePasswordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const curr = document.getElementById("profCurrentPass").value;
    const next = document.getElementById("profNewPass").value;
    const conf = document.getElementById("profConfirmPass").value;
    const msg = document.getElementById("changePassMessage");

    try {
      const res = await window.Auth.changePassword(curr, next, conf);
      if (msg) {
        msg.textContent = res.message || "Password updated successfully!";
        msg.style.color = "var(--accent)";
      }
      changePasswordForm.reset();
    } catch (err) {
      if (msg) {
        msg.textContent = err.error || "Failed to update password.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// ==========================================================================
// Field Officer Console Orchestration
// ==========================================================================

async function loadOfficerDashboard() {
  const header = document.getElementById("officerAssignedDistrictsHeader");
  const list = document.getElementById("officerReportsList");
  const roadsList = document.getElementById("officerRoadsList");

  if (header && window.Auth.user) {
    const districts = (window.Auth.user.assignedDistricts || []).map(d => `${d.district} (${d.state})`).join(", ");
    header.textContent = districts || `${window.Auth.user.district} (Default Jurisdiction)`;
  }

  // 1. Fetch assigned reports & incidents with priority scoring
  try {
    const res = await window.Auth.apiFetch('/api/field-officer/incidents');
    if (res.success && list) {
      const incidents = res.incidents || [];
      if (incidents.length === 0) {
        list.innerHTML = '<p style="padding:20px;color:var(--muted);text-align:center;">No pending incident reports in your assigned districts.</p>';
      } else {
        list.innerHTML = incidents.map(r => {
          const priority = r.priority_score ? (r.priority_score.level || "MEDIUM") : "MEDIUM";
          const priorityClass = `priority-${priority.toLowerCase()}`;
          const aiClass = r.ai_risk_class ? `${r.ai_risk_class} (${Math.round((r.ai_risk_probability || 0) * 100)}%)` : "N/A";
          return `
          <div class="dash-district-card" style="margin-bottom:10px;padding:12px;background:var(--surface-2);border-radius:8px;border:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${escapeHtml(r.incident_type || r.type)} · ${escapeHtml(r.district || 'NER')}</strong>
                <span class="priority-chip ${priorityClass}" style="margin-left:6px;">${priority}</span>
              </div>
              <span class="status-tag tag-${(r.report_status || r.status || 'pending_verification').toLowerCase()}">${(r.report_status || r.status || 'Pending').replace(/_/g, ' ')}</span>
            </div>
            <p style="font-size:11.5px;color:var(--muted);margin:6px 0;">
              ${escapeHtml(r.village_or_town || r.location || '')} ${r.road_name ? `(Road: ${escapeHtml(r.road_name)})` : ''} — "${escapeHtml((r.description || '').slice(0, 100))}"
            </p>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11px;">
              <span style="color:var(--muted);">AI Risk: <strong style="color:#00f0ff;">${escapeHtml(aiClass)}</strong> | Sev: <strong>${r.severity_reported || 'Medium'}</strong></span>
              <button class="primary-btn compact" type="button" onclick="if(window.ReportSystem) { window.ReportSystem.openDetail(${r.id}); } else { openVerifyReportModal('${r.id}', '${escapeHtml(r.incident_type || r.type)}', '${escapeHtml(r.district)}'); }">Inspect & Verify →</button>
            </div>
          </div>
        `;
        }).join("");
      }
    }
  } catch (err) {
    if (list) list.innerHTML = `<p style="color:var(--danger);padding:15px;">Failed to load assigned reports: ${err.message}</p>`;
  }

  // 2. Fetch roads
  try {
    const roadRes = await window.Auth.apiFetch('/api/roads');
    if (roadRes.success && roadsList) {
      roadsList.innerHTML = roadRes.roads.map(rd => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid rgba(255,255,255,0.05);">
          <div>
            <strong>${escapeHtml(rd.name)}</strong><br>
            <small style="color:var(--muted);">${rd.district}, ${rd.state} (Risk: ${rd.risk_score}/100)</small>
          </div>
          <div>
            <select class="panel-select" style="font-size:11px;" onchange="updateOfficerRoadStatus('${rd.id}', this.value)">
              <option value="Open" ${rd.status === 'Open' ? 'selected' : ''}>🟢 Open</option>
              <option value="At Risk" ${rd.status === 'At Risk' ? 'selected' : ''}>⚠️ At Risk</option>
              <option value="Partially Blocked" ${rd.status === 'Partially Blocked' ? 'selected' : ''}>⛔ Partially Blocked</option>
              <option value="Fully Blocked" ${rd.status === 'Fully Blocked' ? 'selected' : ''}>🚫 Fully Blocked</option>
              <option value="Cleared" ${rd.status === 'Cleared' ? 'selected' : ''}>✅ Cleared</option>
            </select>
          </div>
        </div>
      `).join("");
    }
  } catch {
    // Roads fallback
  }
}

const officerRefreshBtn = document.getElementById("officerRefreshBtn");
if (officerRefreshBtn) officerRefreshBtn.addEventListener("click", loadOfficerDashboard);

window.updateOfficerRoadStatus = async function(roadId, newStatus) {
  try {
    const res = await window.Auth.apiFetch(`/api/field-officer/roads/${roadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.success) {
      alert(`Road status updated to '${newStatus}'`);
    } else {
      alert(`Error: ${res.error}`);
    }
  } catch (err) {
    alert(`Could not update road: ${err.message}`);
  }
};

// Report Verification Modal
const verifyModal = document.getElementById("verifyReportModal");
const verifyBackdrop = document.getElementById("verifyModalBackdrop");
const closeVerifyModalBtn = document.getElementById("closeVerifyModalBtn");

window.openVerifyReportModal = function(reportId, type, district) {
  document.getElementById("verifyReportId").value = reportId;
  document.getElementById("verifyReportMeta").textContent = `Report #${reportId} (${type} in ${district})`;
  if (verifyModal) verifyModal.classList.remove("hidden");
};

window.closeVerifyReportModal = function() {
  if (verifyModal) verifyModal.classList.add("hidden");
};

if (closeVerifyModalBtn) closeVerifyModalBtn.addEventListener("click", closeVerifyReportModal);
if (verifyBackdrop) verifyBackdrop.addEventListener("click", closeVerifyReportModal);

const verifyReportForm = document.getElementById("verifyReportForm");
if (verifyReportForm) {
  verifyReportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const reportId = document.getElementById("verifyReportId").value;
    const status = document.getElementById("verifyActionStatus").value;
    const notes = document.getElementById("verifyNotes").value.trim();
    const msg = document.getElementById("verifyMessage");

    try {
      const res = await window.Auth.apiFetch(`/api/field-officer/reports/${reportId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status, verification_notes: notes })
      });
      if (msg) {
        msg.textContent = res.message || "Report verified!";
        msg.style.color = "var(--accent)";
      }
      setTimeout(() => {
        closeVerifyReportModal();
        verifyReportForm.reset();
        loadOfficerDashboard();
      }, 1000);
    } catch (err) {
      if (msg) {
        msg.textContent = err.error || "Verification failed.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// Propose Emergency Alert Modal
const suggestAlertModal = document.getElementById("suggestAlertModal");
const suggestAlertBtn = document.getElementById("officerSuggestAlertBtn");
const closeSuggestAlertBtn = document.getElementById("closeSuggestAlertBtn");
const suggestAlertBackdrop = document.getElementById("suggestAlertBackdrop");

if (suggestAlertBtn) suggestAlertBtn.addEventListener("click", () => {
  if (suggestAlertModal) suggestAlertModal.classList.remove("hidden");
});
if (closeSuggestAlertBtn) closeSuggestAlertBtn.addEventListener("click", () => {
  if (suggestAlertModal) suggestAlertModal.classList.add("hidden");
});
if (suggestAlertBackdrop) suggestAlertBackdrop.addEventListener("click", () => {
  if (suggestAlertModal) suggestAlertModal.classList.add("hidden");
});

const suggestAlertForm = document.getElementById("suggestAlertForm");
if (suggestAlertForm) {
  suggestAlertForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("sugAlertTitle").value.trim();
    const severity = document.getElementById("sugAlertSeverity").value;
    const districts = document.getElementById("sugAlertDistricts").value.split(",").map(d => d.trim()).filter(Boolean);
    const message = document.getElementById("sugAlertMessage").value.trim();
    const msgEl = document.getElementById("suggestAlertMessage");

    try {
      const res = await window.Auth.apiFetch('/api/field-officer/suggest-alert', {
        method: 'POST',
        body: JSON.stringify({ title, severity, target_districts: districts, message })
      });
      if (msgEl) {
        msgEl.textContent = res.message || "Alert proposed to Administrator.";
        msgEl.style.color = "var(--accent)";
      }
      setTimeout(() => {
        if (suggestAlertModal) suggestAlertModal.classList.add("hidden");
        suggestAlertForm.reset();
      }, 1200);
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.error || "Failed to submit proposal.";
        msgEl.style.color = "var(--danger)";
      }
    }
  });
}

// ==========================================================================
// Admin Control Room Orchestration
// ==========================================================================

const admTabUsers = document.getElementById("admTabUsers");
const admTabAlerts = document.getElementById("admTabAlerts");
const admTabIncidents = document.getElementById("admTabIncidents");
const admTabAudit = document.getElementById("admTabAudit");

const admUsersPanel = document.getElementById("admUsersPanel");
const admAlertsPanel = document.getElementById("admAlertsPanel");
const admIncidentsPanel = document.getElementById("admIncidentsPanel");
const admAuditPanel = document.getElementById("admAuditPanel");

function resetAdminTabs() {
  [admTabUsers, admTabAlerts, admTabIncidents, admTabAudit].forEach(t => t && t.classList.remove("active"));
  [admUsersPanel, admAlertsPanel, admIncidentsPanel, admAuditPanel].forEach(p => p && p.classList.add("hidden"));
}

if (admTabUsers) admTabUsers.addEventListener("click", () => {
  resetAdminTabs();
  admTabUsers.classList.add("active");
  if (admUsersPanel) admUsersPanel.classList.remove("hidden");
});

if (admTabAlerts) admTabAlerts.addEventListener("click", () => {
  resetAdminTabs();
  admTabAlerts.classList.add("active");
  if (admAlertsPanel) admAlertsPanel.classList.remove("hidden");
  loadAdminAlertsQueue();
});

if (admTabIncidents) admTabIncidents.addEventListener("click", () => {
  resetAdminTabs();
  admTabIncidents.classList.add("active");
  if (admIncidentsPanel) admIncidentsPanel.classList.remove("hidden");
  loadAdminIncidents();
});

if (admTabAudit) admTabAudit.addEventListener("click", () => {
  resetAdminTabs();
  admTabAudit.classList.add("active");
  if (admAuditPanel) admAuditPanel.classList.remove("hidden");
  loadAdminAuditLogs();
});

async function loadAdminIncidents() {
  const tbody = document.getElementById("admIncidentsTbody");
  if (!tbody) return;
  try {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted);">Loading incidents across all districts...</td></tr>';
    const res = await window.Auth.apiFetch('/api/admin/incidents');
    if (res.success && res.incidents) {
      if (res.incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--muted);">No ground incidents found.</td></tr>';
        return;
      }

      tbody.innerHTML = res.incidents.map(inc => {
        const priority = inc.priority_score ? inc.priority_score.level : "MEDIUM";
        const priorityClass = `priority-${priority.toLowerCase()}`;
        return `
          <tr>
            <td>
              <strong>#${inc.id} · ${escapeHtml(inc.incident_type)}</strong><br>
              <small style="color:var(--muted);">${new Date(inc.created_at).toLocaleString()}</small>
            </td>
            <td>
              <span class="status-tag tag-${(inc.report_status || 'pending_verification').toLowerCase()}">${(inc.report_status || 'Pending').replace(/_/g, ' ')}</span>
            </td>
            <td>
              <span class="priority-chip ${priorityClass}">${priority}</span>
            </td>
            <td>
              <strong>${escapeHtml(inc.district || 'NER')}</strong><br>
              <small style="color:var(--muted);">${escapeHtml(inc.village_or_town || inc.road_name || 'Coordinates')}</small>
            </td>
            <td>
              ${escapeHtml(inc.reporter_name || 'Citizen')} (${escapeHtml(inc.reporter_role || 'citizen')})
            </td>
            <td>
              ${inc.media_count || 0} file(s)
            </td>
            <td>
              <div style="display:flex;gap:4px;">
                <button class="primary-btn compact" type="button" onclick="if(window.ReportSystem) window.ReportSystem.openDetail(${inc.id});">Inspect</button>
                <button class="ghost-btn compact" type="button" onclick="promptMarkDuplicate(${inc.id})" style="font-size:10px;padding:2px 6px;">Duplicate</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger);padding:20px;">Error: ${err.message}</td></tr>`;
  }
}

window.promptMarkDuplicate = async function(incidentId) {
  const originalId = prompt(`Enter Original Incident ID that Report #${incidentId} duplicates:`);
  if (!originalId || !originalId.trim()) return;
  const reason = prompt("Enter reason for marking duplicate (optional):", "Duplicate incident reported for same site");
  try {
    const res = await window.Auth.apiFetch(`/api/admin/incidents/${incidentId}/mark-duplicate`, {
      method: 'PATCH',
      body: JSON.stringify({ duplicate_of_report_id: parseInt(originalId), reason: reason })
    });
    if (res.success) {
      alert(res.message);
      loadAdminIncidents();
      if (window.refreshMapIncidents) window.refreshMapIncidents();
    } else {
      alert(res.error || "Failed to mark duplicate");
    }
  } catch (err) {
    alert(err.message);
  }
};

async function loadAdminDashboard() {
  // 1. Fetch Stats
  try {
    const res = await window.Auth.apiFetch('/api/admin/stats');
    if (res.success && res.stats) {
      document.getElementById("admCountTotalUsers").textContent = res.stats.totalUsers;
      document.getElementById("admCountCitizens").textContent = res.stats.activeCitizens;
      document.getElementById("admCountPendingOfficers").textContent = res.stats.pendingOfficers;
      document.getElementById("admCountActiveOfficers").textContent = res.stats.activeOfficers;
    }
  } catch {}

  // 2. Fetch Users
  loadAdminUsersList();
}

const adminRefreshBtn = document.getElementById("adminRefreshBtn");
if (adminRefreshBtn) adminRefreshBtn.addEventListener("click", loadAdminDashboard);

async function loadAdminUsersList() {
  const tbody = document.getElementById("admUsersTbody");
  const role = document.getElementById("admRoleFilter")?.value || "all";
  const status = document.getElementById("admStatusFilter")?.value || "all";
  const search = document.getElementById("admUserSearch")?.value || "";

  let url = `/api/admin/users?role=${role}&status=${status}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await window.Auth.apiFetch(url);
    if (res.success && tbody) {
      if (!res.users || res.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted);">No users match this filter.</td></tr>';
        return;
      }

      tbody.innerHTML = res.users.map(u => {
        const assignmentsStr = (u.assignments || []).map(a => `${a.district} (${a.state})`).join(", ") || "None";
        return `
          <tr>
            <td>
              <strong>${escapeHtml(u.full_name)}</strong><br>
              <small style="color:var(--muted);">📱 +91 ${u.mobile_number} ${u.email ? `| ✉️ ${escapeHtml(u.email)}` : ''}</small>
            </td>
            <td><span class="role-badge role-${u.role}">${u.role.toUpperCase()}</span></td>
            <td><span class="status-tag tag-${u.account_status}">${u.account_status.replace('_', ' ')}</span></td>
            <td>${escapeHtml(u.district)}, ${escapeHtml(u.state)}</td>
            <td><small>${escapeHtml(assignmentsStr)}</small></td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${u.role === 'field_officer' ? `<button class="secondary-btn compact" style="font-size:10px;" onclick="openAssignOfficerModal('${u.id}', '${escapeHtml(u.full_name)}')">📍 Assign Area</button>` : ''}
                ${u.account_status === 'pending_verification' ? `<button class="primary-btn compact" style="font-size:10px;" onclick="adminChangeUserStatus('${u.id}', 'active')">Approve</button>` : ''}
                ${u.account_status === 'active' && u.id !== window.Auth.user?.id ? `<button class="secondary-btn compact" style="font-size:10px;color:var(--danger);" onclick="adminChangeUserStatus('${u.id}', 'suspended')">Suspend</button>` : ''}
                ${u.account_status === 'suspended' ? `<button class="primary-btn compact" style="font-size:10px;" onclick="adminChangeUserStatus('${u.id}', 'active')">Restore</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:15px;">Error loading users: ${err.message}</td></tr>`;
  }
}

const admUserSearch = document.getElementById("admUserSearch");
const admRoleFilter = document.getElementById("admRoleFilter");
const admStatusFilter = document.getElementById("admStatusFilter");

if (admUserSearch) admUserSearch.addEventListener("input", debounce(loadAdminUsersList, 300));
if (admRoleFilter) admRoleFilter.addEventListener("change", loadAdminUsersList);
if (admStatusFilter) admStatusFilter.addEventListener("change", loadAdminUsersList);

function debounce(fn, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

window.adminChangeUserStatus = async function(userId, status) {
  if (!confirm(`Are you sure you want to set this user status to '${status}'?`)) return;
  try {
    const res = await window.Auth.apiFetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    if (res.success) {
      loadAdminUsersList();
    } else {
      alert(res.error);
    }
  } catch (err) {
    alert(err.message);
  }
};

// Assign Officer Modal
const assignModal = document.getElementById("assignOfficerModal");
const assignBackdrop = document.getElementById("assignModalBackdrop");
const closeAssignModalBtn = document.getElementById("closeAssignModalBtn");

window.openAssignOfficerModal = function(officerId, name) {
  document.getElementById("assignOfficerId").value = officerId;
  document.getElementById("assignOfficerName").textContent = name;
  if (assignModal) assignModal.classList.remove("hidden");
};

window.closeAssignOfficerModal = function() {
  if (assignModal) assignModal.classList.add("hidden");
};

if (closeAssignModalBtn) closeAssignModalBtn.addEventListener("click", closeAssignOfficerModal);
if (assignBackdrop) assignBackdrop.addEventListener("click", closeAssignOfficerModal);

const assignOfficerForm = document.getElementById("assignOfficerForm");
if (assignOfficerForm) {
  assignOfficerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const officerId = document.getElementById("assignOfficerId").value;
    const state = document.getElementById("assignState").value;
    const district = document.getElementById("assignDistrict").value.trim();
    const msg = document.getElementById("assignMessage");

    try {
      const res = await window.Auth.apiFetch(`/api/admin/field-officers/${officerId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ state, district })
      });
      if (msg) {
        msg.textContent = res.message || "Officer assigned!";
        msg.style.color = "var(--accent)";
      }
      setTimeout(() => {
        closeAssignOfficerModal();
        loadAdminUsersList();
      }, 1000);
    } catch (err) {
      if (msg) {
        msg.textContent = err.error || "Failed to create assignment.";
        msg.style.color = "var(--danger)";
      }
    }
  });
}

// Load Alerts in Admin Queue
async function loadAdminAlertsQueue() {
  const container = document.getElementById("admAlertsList");
  try {
    const res = await window.Auth.apiFetch('/api/alerts');
    if (res.success && container) {
      if (!res.alerts || res.alerts.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);padding:15px;">No alerts in system.</p>';
        return;
      }

      container.innerHTML = res.alerts.map(a => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${escapeHtml(a.title)}</strong>
            <span class="status-tag tag-${a.status.toLowerCase()}">${a.status}</span>
          </div>
          <p style="font-size:12px;color:var(--muted);margin:8px 0;">${escapeHtml(a.message)}</p>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;">
            <span>Target: <strong>${escapeHtml(a.target_districts)}</strong> | Severity: <strong>${a.severity}</strong></span>
            ${a.status === 'Pending_Approval' ? `
              <div style="display:flex;gap:8px;">
                <button class="primary-btn compact" onclick="adminApproveAlert('${a.id}')">Approve &amp; Broadcast</button>
                <button class="secondary-btn compact" onclick="adminRejectAlert('${a.id}')">Reject</button>
              </div>
            ` : `<small style="color:var(--muted);">Broadcast: ${a.broadcast_at ? new Date(a.broadcast_at).toLocaleString() : 'N/A'}</small>`}
          </div>
        </div>
      `).join("");
    }
  } catch (err) {
    if (container) container.innerHTML = `<p style="color:var(--danger);">Error loading alerts: ${err.message}</p>`;
  }
}

window.adminApproveAlert = async function(alertId) {
  try {
    const res = await window.Auth.apiFetch(`/api/admin/alerts/${alertId}/approve`, { method: 'POST' });
    if (res.success) {
      alert(res.message);
      loadAdminAlertsQueue();
    }
  } catch (err) {
    alert(err.message);
  }
};

window.adminRejectAlert = async function(alertId) {
  try {
    const res = await window.Auth.apiFetch(`/api/admin/alerts/${alertId}/reject`, { method: 'POST' });
    if (res.success) {
      alert(res.message);
      loadAdminAlertsQueue();
    }
  } catch (err) {
    alert(err.message);
  }
};

// Load Audit Logs in Admin Trail
async function loadAdminAuditLogs() {
  const container = document.getElementById("admAuditLogsStream");
  try {
    const res = await window.Auth.apiFetch('/api/admin/audit-logs');
    if (res.success && container) {
      if (!res.logs || res.logs.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);padding:15px;">No audit events recorded yet.</p>';
        return;
      }

      container.innerHTML = res.logs.map(log => `
        <div class="audit-entry">
          <div class="audit-entry-header">
            <span><strong class="audit-action-name">${escapeHtml(log.action_type)}</strong> by <strong>${escapeHtml(log.actor_name || 'System')}</strong> (${escapeHtml(log.actor_role || 'system')})</span>
            <span>${new Date(log.created_at).toLocaleString()}</span>
          </div>
          <div style="color:var(--muted);font-size:10.5px;">
            Entity: <strong>${log.entity_type} (${log.entity_id})</strong> | IP: ${log.ip_address || '127.0.0.1'}
          </div>
          ${log.new_value_summary ? `<div style="font-family:monospace;font-size:10px;margin-top:4px;color:var(--soft-accent-text);">${escapeHtml(log.new_value_summary)}</div>` : ''}
        </div>
      `).join("");
    }
  } catch (err) {
    if (container) container.innerHTML = `<p style="color:var(--danger);">Error loading audit logs: ${err.message}</p>`;
  }
}

// Initialize Application & Auth
document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth) {
    window.Auth.init();
  }
});

// Boot core application
initApp();

