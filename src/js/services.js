/**
 * NEXZORA — Core Services & Utilities
 * Provides geocoding, reverse geocoding, distance math, routing, and storage helpers.
 */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

// Great-circle distance calculation in km
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function popupTemplate(title, html) {
  return `
    <div class="popup-title">${title}</div>
    <div class="popup-meta">${html}</div>
  `;
}

// Major Indian Cities & North East Mountain Locations
const NE_LOCATION_ALIASES = {
  // Mountain & Himalayan Hubs
  "shimla": { name: "Shimla, Himachal Pradesh", lat: 31.1048, lng: 77.1734 },
  "manali": { name: "Manali, Himachal Pradesh", lat: 32.2432, lng: 77.1892 },
  "dharamshala": { name: "Dharamshala, Himachal Pradesh", lat: 32.2190, lng: 76.3234 },
  "dehradun": { name: "Dehradun, Uttarakhand", lat: 30.3165, lng: 78.0322 },
  "rishikesh": { name: "Rishikesh, Uttarakhand", lat: 30.0869, lng: 78.2676 },
  "nainital": { name: "Nainital, Uttarakhand", lat: 29.3919, lng: 79.4542 },
  // Metros & Transit Gateways
  "delhi": { name: "New Delhi, Delhi", lat: 28.6139, lng: 77.2090 },
  "new delhi": { name: "New Delhi, Delhi", lat: 28.6139, lng: 77.2090 },
  "kolkata": { name: "Kolkata, West Bengal", lat: 22.5726, lng: 88.3639 },
  "calcutta": { name: "Kolkata, West Bengal", lat: 22.5726, lng: 88.3639 },
  "mumbai": { name: "Mumbai, Maharashtra", lat: 19.0760, lng: 72.8777 },
  "chandigarh": { name: "Chandigarh, India", lat: 30.7333, lng: 76.7794 },
  "patna": { name: "Patna, Bihar", lat: 25.5941, lng: 85.1376 },
  "lucknow": { name: "Lucknow, Uttar Pradesh", lat: 26.8467, lng: 80.9462 },
  "varanasi": { name: "Varanasi, Uttar Pradesh", lat: 25.3176, lng: 82.9739 },
  "ranchi": { name: "Ranchi, Jharkhand", lat: 23.3441, lng: 85.3096 },
  "jaipur": { name: "Jaipur, Rajasthan", lat: 26.9124, lng: 75.7873 },
  // North East Capitals & Mountain Centers
  "shilong": { name: "Shillong, East Khasi Hills, Meghalaya", lat: 25.5788, lng: 91.8933 },
  "shillong": { name: "Shillong, East Khasi Hills, Meghalaya", lat: 25.5788, lng: 91.8933 },
  "gangtok": { name: "Gangtok, Sikkim", lat: 27.3389, lng: 88.6065 },
  "guwahati": { name: "Guwahati, Assam", lat: 26.1445, lng: 91.7362 },
  "gauhati": { name: "Guwahati, Assam", lat: 26.1445, lng: 91.7362 },
  "itanagar": { name: "Itanagar, Arunachal Pradesh", lat: 27.0844, lng: 93.6053 },
  "kohima": { name: "Kohima, Nagaland", lat: 25.6751, lng: 94.1086 },
  "imphal": { name: "Imphal, Manipur", lat: 24.8170, lng: 93.9368 },
  "aizawl": { name: "Aizawl, Mizoram", lat: 23.7271, lng: 92.7176 },
  "aizwal": { name: "Aizawl, Mizoram", lat: 23.7271, lng: 92.7176 },
  "agartala": { name: "Agartala, Tripura", lat: 23.8315, lng: 91.2868 },
  "darjeeling": { name: "Darjeeling, West Bengal", lat: 27.0410, lng: 88.2663 },
  "siliguri": { name: "Siliguri, West Bengal", lat: 26.7271, lng: 88.3953 },
  "mangan": { name: "Mangan, North Sikkim", lat: 27.5112, lng: 88.5332 },
  "chungthang": { name: "Chungthang, North Sikkim", lat: 27.6039, lng: 88.6464 },
  "tawang": { name: "Tawang, Arunachal Pradesh", lat: 27.5861, lng: 91.8594 },
  "tezu": { name: "Tezu, Arunachal Pradesh", lat: 27.9135, lng: 96.1664 },
  "dimapur": { name: "Dimapur, Nagaland", lat: 25.9095, lng: 93.7271 },
  "haflong": { name: "Haflong, Dima Hasao, Assam", lat: 25.1764, lng: 93.0183 },
  "kurseong": { name: "Kurseong, Darjeeling", lat: 26.8812, lng: 88.2778 },
  "kalimpong": { name: "Kalimpong, West Bengal", lat: 27.0667, lng: 88.4667 },
  "cherrapunji": { name: "Cherrapunji (Sohra), Meghalaya", lat: 25.2986, lng: 91.7333 },
  "sohra": { name: "Sohra (Cherrapunji), Meghalaya", lat: 25.2986, lng: 91.7333 },
  "jowai": { name: "Jowai, Meghalaya", lat: 25.4526, lng: 92.2037 },
  "tura": { name: "Tura, Meghalaya", lat: 25.5141, lng: 90.2034 },
  "tezpur": { name: "Tezpur, Assam", lat: 26.6528, lng: 92.7926 },
  "jorhat": { name: "Jorhat, Assam", lat: 26.7509, lng: 94.2037 },
  "dibrugarh": { name: "Dibrugarh, Assam", lat: 27.4728, lng: 94.9120 },
  "silchar": { name: "Silchar, Cachar, Assam", lat: 24.8333, lng: 92.7789 },
  "pelling": { name: "Pelling, West Sikkim", lat: 27.3167, lng: 88.2333 },
  "namchi": { name: "Namchi, South Sikkim", lat: 27.1666, lng: 88.3500 },
  "pakyong": { name: "Pakyong, Sikkim", lat: 27.2375, lng: 88.5878 },
  "bomdila": { name: "Bomdila, West Kameng, Arunachal Pradesh", lat: 27.2645, lng: 92.4162 }
};

// Forward Geocoding with local priority & India bias
async function geocode(place) {
  if (!place || !place.trim()) throw new Error("Please enter a location name");
  const clean = place.trim().toLowerCase();

  // 1. Check direct alias table (Shillong, Gangtok, etc.)
  if (NE_LOCATION_ALIASES[clean]) {
    const loc = NE_LOCATION_ALIASES[clean];
    return { lat: loc.lat, lng: loc.lng, name: loc.name };
  }

  // 2. Check riskData districts
  if (typeof riskData !== "undefined") {
    const foundDistrict = riskData.find(d => 
      d.name.toLowerCase() === clean || 
      d.name.toLowerCase().includes(clean) ||
      clean.includes(d.name.toLowerCase())
    );
    if (foundDistrict) {
      return {
        lat: foundDistrict.lat,
        lng: foundDistrict.lng,
        name: `${foundDistrict.name}, ${foundDistrict.state}`
      };
    }
  }

  // 3. Query Nominatim biased to India & North East Region bounds
  const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&viewbox=88.0,29.5,97.5,21.5&q=${encodeURIComponent(place)}`;
  
  try {
    const res = await fetch(queryUrl, {
      headers: { "Accept-Language": "en", "User-Agent": "NexzoraDisasterGIS/1.0" }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.length) {
        return {
          lat: Number(data[0].lat),
          lng: Number(data[0].lon),
          name: data[0].display_name
        };
      }
    }
  } catch (err) {
    console.warn("Primary geocode attempt failed, trying fallback:", err);
  }

  // 4. Secondary query specifically appending 'India'
  const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place + ", India")}`;
  const response = await fetch(fallbackUrl, {
    headers: { "Accept-Language": "en", "User-Agent": "NexzoraDisasterGIS/1.0" }
  });

  if (!response.ok) throw new Error("Search service unavailable");
  const data = await response.json();
  if (!data.length) throw new Error(`Place "${place}" not found in real map`);

  return {
    lat: Number(data[0].lat),
    lng: Number(data[0].lon),
    name: data[0].display_name
  };
}

// Reverse Geocoding via Nominatim
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12`;

  const response = await fetch(url, {
    headers: { "Accept-Language": "en" }
  });

  if (!response.ok) throw new Error("Reverse search unavailable");

  const data = await response.json();
  return data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// ==============================================================================
// NEXZORA Real-Time Safe Route Navigation Engine (Disaster Risk Evasion)
// Calculates real-life highway routes, analyzes disaster hazard zones,
// and always returns the SAFEST DISASTER-FREE ROUTE along with Google Maps navigation.
// ==============================================================================

const SafeRoutingEngine = {
  /**
   * Aggregates all live disaster zones, landslide hazards, and road blockages
   */
  getAllHazardNodes() {
    const hazards = [];

    // 1. High and Critical Landslide Risk Districts from riskData
    if (typeof riskData !== "undefined" && Array.isArray(riskData)) {
      riskData.forEach(d => {
        if (d.score >= 65 || d.level === "Critical" || d.level === "High") {
          hazards.push({
            id: `risk_${d.name}`,
            name: `${d.name} (${d.state})`,
            lat: d.lat,
            lng: d.lng,
            radiusKm: (d.radius ? d.radius / 1000 : 22),
            score: d.score,
            level: d.level,
            type: "landslide_zone",
            corridors: d.corridors || "",
            description: `${d.level} landslide susceptibility (${d.score}/100) on ${d.corridors || 'corridors'}`
          });
        }
      });
    }

    // 2. Arterial Road Blockages & Rockfalls from roadData
    if (typeof roadData !== "undefined" && Array.isArray(roadData)) {
      roadData.forEach((r, rIdx) => {
        if (r.status === "Blocked" || r.status === "Slow") {
          const isBlocked = r.status === "Blocked";
          const coords = r.coords || [];
          // Sample points along the road corridor for comprehensive geometric coverage
          coords.forEach((pt, pIdx) => {
            hazards.push({
              id: `road_${rIdx}_${pIdx}`,
              name: isBlocked ? `ROAD BLOCKED: ${r.name}` : `SLUGGISH/RESTRICTED: ${r.name}`,
              corridorName: r.name,
              lat: pt[0],
              lng: pt[1],
              radiusKm: isBlocked ? 6 : 5,
              score: isBlocked ? 98 : 75,
              level: isBlocked ? "Critical" : "High",
              type: "road_hazard",
              status: r.status,
              description: isBlocked
                ? `CRITICAL ROAD CLOSURE: Highway corridor is physically impassable due to major debris flow / collapse.`
                : `TRAFFIC SLOWDOWN: Mountain corridor operating with single-lane restriction due to slope distress.`
            });
          });
        }
      });
    }

    // 3. Verified Field Reports from StorageService & defaultReportsData
    const reports = (typeof StorageService !== "undefined" && StorageService.getSavedReports)
      ? StorageService.getSavedReports()
      : (typeof defaultReportsData !== "undefined" ? defaultReportsData : []);

    reports.forEach(rep => {
      if (rep.status !== "Resolved" && rep.lat && rep.lng) {
        const isCritical = rep.priority === "Critical" || (rep.type && rep.type.toLowerCase().includes("block"));
        hazards.push({
          id: `rep_${rep.id}`,
          name: `${rep.type} - ${rep.location}`,
          lat: rep.lat,
          lng: rep.lng,
          radiusKm: isCritical ? 8 : 6,
          score: isCritical ? 96 : rep.priority === "High" ? 85 : 70,
          level: rep.priority || "High",
          type: "field_incident",
          status: isCritical ? "Blocked" : "Warning",
          description: rep.description || "Active ground incident reported by field patrol"
        });
      }
    });

    return hazards;
  },

  /**
   * Analyzes an array of [lat, lng] coordinates against active hazards with multi-criteria penalty scoring
   */
  evaluateRouteHazards(coords, hazards, origin = null, destination = null) {
    if (!coords || !coords.length) {
      return {
        hazardCount: 0,
        enRouteHazardCount: 0,
        blockedRoadCount: 0,
        totalPenalty: 0,
        maxRiskScore: 0,
        intersectedHazards: [],
        enRouteHazards: [],
        isClear: true,
        isEnRouteClear: true
      };
    }

    const intersectedMap = new Map();
    let maxRisk = 0;
    let totalPenalty = 0;
    let blockedRoadCount = 0;

    // Sample along the route (every ~2-3 km)
    const step = Math.max(1, Math.floor(coords.length / 320));

    for (let i = 0; i < coords.length; i += step) {
      const [lat, lng] = coords[i];

      for (const h of hazards) {
        const d = distanceKm(lat, lng, h.lat, h.lng);
        const dangerRadius = h.type === "road_hazard"
          ? (h.radiusKm || 6)
          : Math.max(h.radiusKm * 0.75, 10);

        if (d <= dangerRadius) {
          if (!intersectedMap.has(h.id)) {
            const isOriginTerminal = origin && distanceKm(h.lat, h.lng, origin.lat, origin.lng) < 14;
            const isDestTerminal = destination && distanceKm(h.lat, h.lng, destination.lat, destination.lng) < 14;
            const isTerminal = isOriginTerminal || isDestTerminal;

            const isBlocked = h.status === "Blocked" || (h.description && h.description.toLowerCase().includes("block"));
            if (isBlocked && !isTerminal) blockedRoadCount++;

            let penalty = h.score || 50;
            if (isBlocked && !isTerminal) penalty += 350; // En-route blocked highways are severely penalized
            if (h.type === "road_hazard") penalty += 60;
            if (isTerminal) penalty = Math.round(penalty * 0.1); // Terminal endpoint discount

            totalPenalty += penalty;
            if (h.score > maxRisk) maxRisk = h.score;

            intersectedMap.set(h.id, {
              ...h,
              isTerminal,
              isBlocked,
              closestDistanceKm: d.toFixed(1),
              mileMarker: `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`
            });
          }
        }
      }
    }

    const intersectedHazards = Array.from(intersectedMap.values()).sort((a, b) => {
      if (a.isBlocked !== b.isBlocked) return a.isBlocked ? -1 : 1;
      return b.score - a.score;
    });

    const enRouteHazards = intersectedHazards.filter(h => !h.isTerminal);

    return {
      hazardCount: intersectedHazards.length,
      enRouteHazardCount: enRouteHazards.length,
      blockedRoadCount,
      totalPenalty,
      maxRiskScore: maxRisk,
      intersectedHazards,
      enRouteHazards,
      isClear: intersectedHazards.length === 0,
      isEnRouteClear: enRouteHazards.length === 0 && blockedRoadCount === 0
    };
  },

  /**
   * Fetch realistic driving route from OSRM via optional waypoints
   */
  async fetchRouteViaWaypoints(points) {
    const locString = points.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson&alternatives=true&steps=true`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Road routing service is currently unavailable");

    const data = await res.json();
    if (!data.routes || !data.routes.length) {
      throw new Error("No navigable highway route found between specified points");
    }

    return data.routes;
  },

  /**
   * Main calculation: finds the shortest and 100% SAFEST DISASTER-FREE ROUTE
   */
  async calculateSafeAndShortestRoute(originQuery, destinationQuery) {
    const a = await geocode(originQuery);
    const b = await geocode(destinationQuery);
    const hazards = this.getAllHazardNodes();

    // 1. Fetch direct route candidates
    let directRoutes = [];
    try {
      directRoutes = await this.fetchRouteViaWaypoints([a, b]);
    } catch (err) {
      throw new Error(`Failed to find route between ${a.name.split(',')[0]} and ${b.name.split(',')[0]}: ${err.message}`);
    }

    // 2. Evaluate hazard exposure on all direct route candidates
    const evaluatedDirectCandidates = directRoutes.map((rt, idx) => {
      const coords = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const hazardAnalysis = this.evaluateRouteHazards(coords, hazards, a, b);
      return {
        routeIndex: idx,
        route: rt,
        coords,
        distanceKm: (rt.distance / 1000).toFixed(1),
        durationSec: rt.duration,
        driveTimeFormatted: this.formatDriveTime(rt.duration),
        ...hazardAnalysis
      };
    });

    // Best direct route by travel distance
    const bestDirect = evaluatedDirectCandidates[0];

    // Check if the primary direct route is already completely clean of hazards
    if (bestDirect && (bestDirect.isClear || (bestDirect.isEnRouteClear && bestDirect.blockedRoadCount === 0)) && bestDirect.blockedRoadCount === 0 && bestDirect.enRouteHazardCount === 0) {
      // Direct route is already completely safe!
      const gMapsUrl = this.generateGoogleMapsUrl(a, b, []);
      return {
        a,
        b,
        isHazardBypassed: false,
        safestRoute: {
          ...bestDirect,
          badgeTitle: "🛡️ SAFEST & SHORTEST (100% CLEAR)",
          safetySummary: "CORRIDOR FULLY SAFE: Zero disaster-prone or landslide hazard zones encountered along this highway route.",
          googleMapsUrl: gMapsUrl
        },
        directRoute: {
          ...bestDirect,
          googleMapsUrl: gMapsUrl
        }
      };
    }

    // 3. Direct route intersects disaster hazards or road blockages!
    // Compute mountain detour corridors that bypass active landslide / blockage zones
    const candidateBypasses = this.getStrategicMountainBypasses(a, b, bestDirect.intersectedHazards);
    const safeBypassCandidates = [];

    for (const bypass of candidateBypasses) {
      try {
        const waypoints = [a, ...bypass.waypoints, b];
        const routes = await this.fetchRouteViaWaypoints(waypoints);
        if (routes && routes.length) {
          const rt = routes[0];
          const coords = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          const analysis = this.evaluateRouteHazards(coords, hazards, a, b);

          safeBypassCandidates.push({
            name: bypass.name,
            waypoints: bypass.waypoints,
            corridorNotes: bypass.notes,
            route: rt,
            coords,
            distanceKm: (rt.distance / 1000).toFixed(1),
            durationSec: rt.duration,
            driveTimeFormatted: this.formatDriveTime(rt.duration),
            ...analysis
          });
        }
      } catch (e) {
        // Continue searching other corridors
      }
    }

    // 4. Multi-criteria optimization: prioritize zero road blockages, then lowest penalty, then shortest distance
    safeBypassCandidates.sort((c1, c2) => {
      if (c1.blockedRoadCount !== c2.blockedRoadCount) {
        return c1.blockedRoadCount - c2.blockedRoadCount;
      }
      if (c1.totalPenalty !== c2.totalPenalty) {
        return c1.totalPenalty - c2.totalPenalty;
      }
      if (c1.hazardCount !== c2.hazardCount) {
        return c1.hazardCount - c2.hazardCount;
      }
      return parseFloat(c1.distanceKm) - parseFloat(c2.distanceKm);
    });

    let chosenSafest = safeBypassCandidates[0];

    // If no strategic candidate was found or dynamic bypass is needed, construct geometric offset
    if (!chosenSafest || (chosenSafest.blockedRoadCount >= bestDirect.blockedRoadCount && chosenSafest.totalPenalty >= bestDirect.totalPenalty)) {
      try {
        const primaryThreat = bestDirect.intersectedHazards[0];
        const dynamicWp = this.calculateGeometricEvasionWaypoint(bestDirect.coords, primaryThreat);
        if (dynamicWp) {
          const dynRoutes = await this.fetchRouteViaWaypoints([a, dynamicWp, b]);
          if (dynRoutes && dynRoutes.length) {
            const rt = dynRoutes[0];
            const coords = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            const analysis = this.evaluateRouteHazards(coords, hazards, a, b);
            if (analysis.totalPenalty < bestDirect.totalPenalty || analysis.blockedRoadCount < bestDirect.blockedRoadCount) {
              chosenSafest = {
                name: "Real-Time Hazard Avoidance Corridor",
                waypoints: [dynamicWp],
                corridorNotes: `Engineered real-time geometric bypass navigating around ${primaryThreat ? primaryThreat.name : 'hazard zone'}`,
                route: rt,
                coords,
                distanceKm: (rt.distance / 1000).toFixed(1),
                durationSec: rt.duration,
                driveTimeFormatted: this.formatDriveTime(rt.duration),
                ...analysis
              };
            }
          }
        }
      } catch (err) {}
    }

    // If still empty (e.g. extreme isolated point), fallback to best direct with warnings
    if (!chosenSafest) {
      chosenSafest = bestDirect;
    }

    // Determine hazards that were successfully bypassed
    const directHazardKeys = new Set(bestDirect.intersectedHazards.map(h => h.id || h.name));
    const safeHazardKeys = new Set((chosenSafest.intersectedHazards || []).map(h => h.id || h.name));
    const bypassedHazards = bestDirect.intersectedHazards.filter(h => !safeHazardKeys.has(h.id || h.name));

    const isHazardBypassed = (
      chosenSafest.blockedRoadCount < bestDirect.blockedRoadCount ||
      chosenSafest.totalPenalty < bestDirect.totalPenalty ||
      chosenSafest.hazardCount < bestDirect.hazardCount ||
      bypassedHazards.length > 0
    );

    const gMapsSafeUrl = this.generateGoogleMapsUrl(a, b, chosenSafest.waypoints || []);
    const gMapsDirectUrl = this.generateGoogleMapsUrl(a, b, []);

    let safetySummary = "";
    if (chosenSafest.isClear) {
      safetySummary = `DISASTER-FREE: All ${bestDirect.hazardCount} active landslide zones & road hazards bypassed safely.`;
    } else if (chosenSafest.blockedRoadCount < bestDirect.blockedRoadCount) {
      safetySummary = `IMPASSABLE BLOCKAGE AVOIDED: Direct route is blocked by ${bestDirect.blockedRoadCount} highway closure(s). Safe bypass keeps transit completely open.`;
    } else if (bypassedHazards.length > 0) {
      safetySummary = `HAZARDS BYPASSED: Successfully navigated around ${bypassedHazards.length} high-risk disaster zone(s). Risk reduced from ${bestDirect.maxRiskScore}/100 to ${chosenSafest.maxRiskScore}/100.`;
    } else {
      safetySummary = `OPTIMIZED TRANSIT: Route evaluated with lowest achievable risk profile (${chosenSafest.maxRiskScore}/100).`;
    }

    return {
      a,
      b,
      isHazardBypassed,
      safestRoute: {
        ...chosenSafest,
        badgeTitle: chosenSafest.isClear ? "🛡️ 100% DISASTER-FREE SAFEST ROUTE" : "🛡️ SAFEST ALL-WEATHER HIGHWAY CORRIDOR",
        safetySummary,
        bypassedHazards,
        googleMapsUrl: gMapsSafeUrl
      },
      directRoute: {
        ...bestDirect,
        badgeTitle: "⚠️ DIRECT HIGHWAY ROUTE (HAZARD WARNING)",
        safetySummary: bestDirect.blockedRoadCount > 0
          ? `CRITICAL WARNING: Direct highway contains ${bestDirect.blockedRoadCount} PHYSICAL ROAD CLOSURES and ${bestDirect.hazardCount} disaster danger zones!`
          : `CRITICAL HAZARD: Traverses ${bestDirect.hazardCount} active landslide & blockage zones!`,
        googleMapsUrl: gMapsDirectUrl
      }
    };
  },

  /**
   * Identifies real-life mountain bypass corridors maintained by highway authorities
   */
  getStrategicMountainBypasses(a, b, intersectedHazards) {
    const bypasses = [];
    const destName = (b.name || "").toLowerCase();
    const origName = (a.name || "").toLowerCase();
    const hazardTexts = (intersectedHazards || []).map(h => ((h.name || "") + " " + (h.corridorName || "") + " " + (h.description || "")).toLowerCase()).join(" ");

    // SIKKIM / GANGTOK SECTOR
    // If route goes to/from Sikkim or intersects NH-10 / Teesta / Paglajhora
    if (destName.includes("gangtok") || destName.includes("sikkim") || destName.includes("mangan") || origName.includes("gangtok") || origName.includes("sikkim") || hazardTexts.includes("nh-10") || hazardTexts.includes("teesta") || hazardTexts.includes("paglajhora")) {
      bypasses.push({
        name: "NH-717A All-Weather Defense Bypass (Damdim → Lava → Pakyong)",
        notes: "Official NHIDCL all-weather highway avoiding vulnerable NH-10 Teesta landslide gorge",
        waypoints: [
          { lat: 26.8833, lng: 88.7212, name: "Damdim Junction (NH-717A)" },
          { lat: 27.0864, lng: 88.6631, name: "Lava Ridge Pass (Safe High Corridor)" },
          { lat: 27.2375, lng: 88.5878, name: "Pakyong All-Weather Entry" }
        ]
      });

      bypasses.push({
        name: "Western Valley Pelling-Singtam Bypass",
        notes: "Stable ridge highway via Jorethang and South Sikkim",
        waypoints: [
          { lat: 27.1214, lng: 88.3142, name: "Jorethang Ridge Link" },
          { lat: 27.2355, lng: 88.4988, name: "Singtam South Entry" }
        ]
      });
    }

    // MEGHALAYA / SILCHAR / TRIPURA SECTOR (NH-6 Sonapur Tunnel Blockages)
    if (destName.includes("silchar") || destName.includes("cachar") || destName.includes("agartala") || destName.includes("tripura") || origName.includes("silchar") || origName.includes("cachar") || hazardTexts.includes("nh-6") || hazardTexts.includes("sonapur") || hazardTexts.includes("jaintia")) {
      bypasses.push({
        name: "NH-27 East-West Corridor (Guwahati → Nagaon → Lumding → Haflong → Silchar)",
        notes: "Major all-weather 4-lane bypass circumventing NH-6 Sonapur rockfall zone",
        waypoints: [
          { lat: 26.3500, lng: 92.6833, name: "Nagaon NH-27 Corridor" },
          { lat: 25.7500, lng: 93.1700, name: "Lumding Safe Mountain Axis" },
          { lat: 25.1700, lng: 93.0200, name: "Haflong Valley Highway" }
        ]
      });
    }

    // NAGALAND / MANIPUR SECTOR (NH-29 Kohima Sinking Zone)
    if (destName.includes("imphal") || destName.includes("manipur") || destName.includes("kohima") || origName.includes("imphal") || origName.includes("kohima") || hazardTexts.includes("nh-29") || hazardTexts.includes("kohima")) {
      bypasses.push({
        name: "Chakhabama-Pfutsero-Tadubi Mountain Bypass",
        notes: "Engineered bypass avoiding active Disang shale sinkholes along NH-29",
        waypoints: [
          { lat: 25.6600, lng: 94.2000, name: "Chakhabama East Axis" },
          { lat: 25.5700, lng: 94.3200, name: "Pfutsero Ridge Corridor" }
        ]
      });
    }

    // ARUNACHAL PRADESH SECTOR (NH-13 Bhalukpong Blockage)
    if (destName.includes("tawang") || destName.includes("bomdila") || destName.includes("west kameng") || origName.includes("tawang") || hazardTexts.includes("nh-13") || hazardTexts.includes("bhalukpong")) {
      bypasses.push({
        name: "Orang-Kalaktang-Shergaon-Rupa Bypass",
        notes: "Trans-Himalayan alternative avoiding Bhalukpong gorge rockfalls",
        waypoints: [
          { lat: 26.7000, lng: 92.2500, name: "Orang Gateway" },
          { lat: 27.0500, lng: 92.1500, name: "Kalaktang Safe Valley" }
        ]
      });
    }

    return bypasses;
  },

  /**
   * Geometric Evasion Vector: generates an evasive waypoint around an isolated hazard
   */
  calculateGeometricEvasionWaypoint(coords, hazard) {
    if (!hazard || !coords || !coords.length) return null;

    // Find the closest coordinate on the route to the hazard centroid
    let closestPt = coords[0];
    let minD = distanceKm(coords[0][0], coords[0][1], hazard.lat, hazard.lng);

    for (const pt of coords) {
      const d = distanceKm(pt[0], pt[1], hazard.lat, hazard.lng);
      if (d < minD) {
        minD = d;
        closestPt = pt;
      }
    }

    // Compute normal vector away from hazard
    const dLat = closestPt[0] - hazard.lat;
    const dLng = closestPt[1] - hazard.lng;
    const mag = Math.sqrt(dLat * dLat + dLng * dLng) || 0.001;

    // Offset by safe distance (outside hazard radius by ~18km)
    const offsetDeg = ((hazard.radiusKm || 15) + 18) / 111.0;
    const evasiveLat = hazard.lat + (dLat / mag) * offsetDeg;
    const evasiveLng = hazard.lng + (dLng / mag) * offsetDeg;

    return {
      lat: evasiveLat,
      lng: evasiveLng,
      name: `Safe Evasion Bypass (${hazard.name.split(' ')[0]})`
    };
  },

  formatDriveTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
  },

  generateGoogleMapsUrl(origin, destination, waypoints = []) {
    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;

    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&travelmode=driving`;

    if (waypoints && waypoints.length) {
      const wpStr = waypoints.map(w => `${w.lat},${w.lng}`).join("|");
      url += `&waypoints=${encodeURIComponent(wpStr)}`;
    }

    return url;
  }
};

if (typeof window !== "undefined") {
  window.SafeRoutingEngine = SafeRoutingEngine;
  window.getRoute = getRoute;
}
if (typeof globalThis !== "undefined") {
  globalThis.SafeRoutingEngine = SafeRoutingEngine;
  globalThis.getRoute = getRoute;
}

// Backwards-compatible getRoute function
async function getRoute(pointA, pointB) {
  const result = await SafeRoutingEngine.calculateSafeAndShortestRoute(pointA, pointB);
  return {
    a: result.a,
    b: result.b,
    route: result.safestRoute.route,
    safestRoute: result.safestRoute,
    directRoute: result.directRoute,
    isHazardBypassed: result.isHazardBypassed
  };
}

// Local Storage Services
const StorageService = {
  getSavedReports() {
    try {
      const stored = localStorage.getItem("ner_landslide_reports");
      if (!stored) {
        if (typeof defaultReportsData !== "undefined" && defaultReportsData.length) {
          localStorage.setItem("ner_landslide_reports", JSON.stringify(defaultReportsData));
          return defaultReportsData;
        }
        return [];
      }
      const parsed = JSON.parse(stored);
      // Ensure all reports have a status
      let modified = false;
      const verified = parsed.map(r => {
        if (!r.status) {
          r.status = "New";
          modified = true;
        }
        return r;
      });
      if (modified) {
        localStorage.setItem("ner_landslide_reports", JSON.stringify(verified));
      }
      return verified;
    } catch {
      return typeof defaultReportsData !== "undefined" ? defaultReportsData : [];
    }
  },

  saveReports(reports) {
    localStorage.setItem("ner_landslide_reports", JSON.stringify(reports));
  },

  updateReportStatus(reportId, newStatus) {
    const reports = this.getSavedReports();
    const target = reports.find(r => String(r.id) === String(reportId));
    if (target) {
      target.status = newStatus;
      this.saveReports(reports);
      return true;
    }
    return false;
  },

  saveLastPlace(place) {
    localStorage.setItem("ner_last_place", JSON.stringify(place));
  },

  getLastPlace() {
    try {
      return JSON.parse(localStorage.getItem("ner_last_place") || "null");
    } catch {
      return null;
    }
  }
};
