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

// North East Known Locations & Common Typo Aliases
const NE_LOCATION_ALIASES = {
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
  "dibrugarh": { name: "Dibrugarh, Assam", lat: 27.4728, lng: 94.9120 }
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

// Road Routing via OSRM
async function getRoute(pointA, pointB) {
  const a = await geocode(pointA);
  const b = await geocode(pointB);

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${a.lng},${a.lat};${b.lng},${b.lat}` +
    `?overview=full&geometries=geojson`;

  const response = await fetch(url);

  if (!response.ok) throw new Error("Route service unavailable");

  const data = await response.json();

  if (!data.routes || !data.routes.length) {
    throw new Error("No road route found");
  }

  return {
    a,
    b,
    route: data.routes[0]
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
