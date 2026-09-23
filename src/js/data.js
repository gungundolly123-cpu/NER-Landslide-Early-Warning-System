/**
 * NEXZORA — Environmental & Geospatial Datasets for North Eastern Region (NER)
 * Contains comprehensive district-level landslide risk datasets across all 8 NE states + Darjeeling hills,
 * major regional transit corridors, weather outlooks, and cellular dead zones.
 */

// Comprehensive North Eastern Region Districts & Landslide Risk Monitoring Data
const riskData = [
  // --- SIKKIM ---
  {
    name: "Gangtok District",
    state: "Sikkim",
    lat: 27.3389,
    lng: 88.6065,
    level: "High",
    score: 84,
    rainfall: 88,
    slope: "38°",
    soil: "High Saturation",
    corridors: "NH-10, Gangtok-Nathula Highway",
    radius: 26000
  },
  {
    name: "Mangan (North Sikkim)",
    state: "Sikkim",
    lat: 27.5054,
    lng: 88.5323,
    level: "Critical",
    score: 94,
    rainfall: 112,
    slope: "46°",
    soil: "Critical Debris Flow",
    corridors: "Mangan-Chungthang Road",
    radius: 32000
  },
  {
    name: "Gyalshing (West Sikkim)",
    state: "Sikkim",
    lat: 27.2882,
    lng: 88.2355,
    level: "High",
    score: 76,
    rainfall: 82,
    slope: "34°",
    soil: "Moderate-High",
    corridors: "Pelling-Gyalshing Route",
    radius: 22000
  },
  {
    name: "Namchi (South Sikkim)",
    state: "Sikkim",
    lat: 27.1666,
    lng: 88.3500,
    level: "Medium",
    score: 64,
    rainfall: 68,
    slope: "29°",
    soil: "Moderate Saturation",
    corridors: "Jorethang-Namchi Route",
    radius: 20000
  },
  {
    name: "Pakyong District",
    state: "Sikkim",
    lat: 27.2375,
    lng: 88.5878,
    level: "High",
    score: 79,
    rainfall: 89,
    slope: "36°",
    soil: "High Vulnerability",
    corridors: "Pakyong Airport Link Road",
    radius: 22000
  },
  {
    name: "Soreng District",
    state: "Sikkim",
    lat: 27.1636,
    lng: 88.2045,
    level: "Medium",
    score: 58,
    rainfall: 64,
    slope: "28°",
    soil: "Stable Bedrock",
    corridors: "Soreng-Nayabazar Link",
    radius: 18000
  },

  // --- ARUNACHAL PRADESH ---
  {
    name: "Papum Pare (Itanagar)",
    state: "Arunachal Pradesh",
    lat: 27.0844,
    lng: 93.6053,
    level: "Critical",
    score: 91,
    rainfall: 96,
    slope: "42°",
    soil: "Gully Erosion Zone",
    corridors: "NH-415, Itanagar-Banderdewa Corridor",
    radius: 30000
  },
  {
    name: "Tawang District",
    state: "Arunachal Pradesh",
    lat: 27.5861,
    lng: 91.8594,
    level: "Critical",
    score: 89,
    rainfall: 92,
    slope: "44°",
    soil: "Steep Glacial Scree",
    corridors: "Bhalukpong-Tawang Highway (NH-13)",
    radius: 30000
  },
  {
    name: "West Kameng (Bomdila)",
    state: "Arunachal Pradesh",
    lat: 27.2645,
    lng: 92.4162,
    level: "High",
    score: 81,
    rainfall: 85,
    slope: "39°",
    soil: "High Risk Silt Layer",
    corridors: "Bomdila-Dirang Highway",
    radius: 25000
  },
  {
    name: "Lower Subansiri (Ziro)",
    state: "Arunachal Pradesh",
    lat: 27.5950,
    lng: 93.8320,
    level: "Medium",
    score: 63,
    rainfall: 71,
    slope: "31°",
    soil: "Pine Basin Slopes",
    corridors: "Ziro-Yachuli Route",
    radius: 20000
  },
  {
    name: "East Siang (Pasighat)",
    state: "Arunachal Pradesh",
    lat: 28.0667,
    lng: 95.3333,
    level: "High",
    score: 77,
    rainfall: 104,
    slope: "35°",
    soil: "Riverbank Toe Erosion",
    corridors: "Trans-Arunachal Highway",
    radius: 26000
  },
  {
    name: "Dibang Valley (Anini)",
    state: "Arunachal Pradesh",
    lat: 28.7900,
    lng: 95.9000,
    level: "Critical",
    score: 93,
    rainfall: 110,
    slope: "48°",
    soil: "Fragile Mountain Slopes",
    corridors: "Roing-Anini Highway",
    radius: 34000
  },
  {
    name: "Changlang District",
    state: "Arunachal Pradesh",
    lat: 27.1264,
    lng: 95.7369,
    level: "High",
    score: 74,
    rainfall: 79,
    slope: "33°",
    soil: "Shale-Sandstone Layers",
    corridors: "Miao-Jairampur Highway",
    radius: 22000
  },

  // --- ASSAM ---
  {
    name: "Dima Hasao (Haflong)",
    state: "Assam",
    lat: 25.1764,
    lng: 93.0178,
    level: "Critical",
    score: 95,
    rainfall: 118,
    slope: "43°",
    soil: "Extremely Fragile Hills",
    corridors: "Lumding-Badarpur Rail & NH-27 Hill Section",
    radius: 32000
  },
  {
    name: "Karbi Anglong (Diphu)",
    state: "Assam",
    lat: 25.8458,
    lng: 93.4319,
    level: "High",
    score: 73,
    rainfall: 78,
    slope: "32°",
    soil: "Moderate Clay Slopes",
    corridors: "Diphu-Manja Highway",
    radius: 24000
  },
  {
    name: "Kamrup Metro (Guwahati Hills)",
    state: "Assam",
    lat: 26.1445,
    lng: 91.7362,
    level: "Medium",
    score: 55,
    rainfall: 62,
    slope: "24°",
    soil: "Artificial Hill Cutting Zones",
    corridors: "GS Road, Naranarayan Setu Link",
    radius: 18000
  },
  {
    name: "Cachar (Silchar)",
    state: "Assam",
    lat: 24.8333,
    lng: 92.7789,
    level: "High",
    score: 76,
    rainfall: 89,
    slope: "30°",
    soil: "Alluvial Inundation & Slumping",
    corridors: "NH-37 & NH-6 Junction",
    radius: 24000
  },
  {
    name: "Karimganj District",
    state: "Assam",
    lat: 24.8647,
    lng: 92.3594,
    level: "Medium",
    score: 59,
    rainfall: 68,
    slope: "25°",
    soil: "Riverbank Inundation",
    corridors: "Badarpur-Karimganj Link",
    radius: 18000
  },

  // --- MEGHALAYA ---
  {
    name: "East Khasi Hills (Shillong)",
    state: "Meghalaya",
    lat: 25.5788,
    lng: 91.8933,
    level: "High",
    score: 78,
    rainfall: 95,
    slope: "37°",
    soil: "Saturated Red Laterite",
    corridors: "Umiam-Shillong Bypass, NH-6",
    radius: 28000
  },
  {
    name: "Ri-Bhoi (Nongpoh)",
    state: "Meghalaya",
    lat: 25.9036,
    lng: 91.8808,
    level: "High",
    score: 82,
    rainfall: 94,
    slope: "36°",
    soil: "High Cut-Slope Sinking",
    corridors: "Guwahati-Shillong 4-Lane Expressway (NH-6)",
    radius: 26000
  },
  {
    name: "East Jaintia Hills (Khliehriat)",
    state: "Meghalaya",
    lat: 25.3562,
    lng: 92.3683,
    level: "Critical",
    score: 89,
    rainfall: 122,
    slope: "41°",
    soil: "Fractured Karst & Coal Belts",
    corridors: "Sonapur Tunnel & NH-6 Lifeline",
    radius: 30000
  },
  {
    name: "West Khasi Hills (Nongstoin)",
    state: "Meghalaya",
    lat: 25.5200,
    lng: 91.2700,
    level: "High",
    score: 74,
    rainfall: 88,
    slope: "34°",
    soil: "Deep Weathered Granite",
    corridors: "Shillong-Nongstoin-Tura Highway",
    radius: 24000
  },
  {
    name: "South West Khasi Hills (Mawkyrwat)",
    state: "Meghalaya",
    lat: 25.3667,
    lng: 91.4500,
    level: "Critical",
    score: 91,
    rainfall: 135,
    slope: "44°",
    soil: "Ultra-High Rain Runoff",
    corridors: "Mawkyrwat-Ranikor Border Corridor",
    radius: 30000
  },
  {
    name: "West Garo Hills (Tura)",
    state: "Meghalaya",
    lat: 25.5144,
    lng: 90.2030,
    level: "High",
    score: 75,
    rainfall: 85,
    slope: "33°",
    soil: "Tura Peak Slopes",
    corridors: "Tura-Dalu Highway",
    radius: 24000
  },

  // --- NAGALAND ---
  {
    name: "Kohima District",
    state: "Nagaland",
    lat: 25.6751,
    lng: 94.1086,
    level: "Critical",
    score: 90,
    rainfall: 95,
    slope: "42°",
    soil: "Disang Shale Sinking Zone",
    corridors: "NH-29 Dimapur-Kohima-Imphal Lifeline",
    radius: 28000
  },
  {
    name: "Phek District",
    state: "Nagaland",
    lat: 25.6833,
    lng: 94.5000,
    level: "High",
    score: 82,
    rainfall: 88,
    slope: "39°",
    soil: "Steep Valley Slopes",
    corridors: "Kohima-Phek Road",
    radius: 24000
  },
  {
    name: "Mokokchung District",
    state: "Nagaland",
    lat: 26.3262,
    lng: 94.5209,
    level: "High",
    score: 76,
    rainfall: 82,
    slope: "36°",
    soil: "Weathered Siltstone",
    corridors: "Mokokchung-Amguri Highway",
    radius: 22000
  },
  {
    name: "Wokha District",
    state: "Nagaland",
    lat: 26.0988,
    lng: 94.2625,
    level: "High",
    score: 75,
    rainfall: 81,
    slope: "35°",
    soil: "Doyang Basin Ridge Slopes",
    corridors: "NH-2 Wokha-Kohima Section",
    radius: 22000
  },
  {
    name: "Mon District",
    state: "Nagaland",
    lat: 26.7500,
    lng: 95.0500,
    level: "Medium",
    score: 68,
    rainfall: 72,
    slope: "31°",
    soil: "Clay Sandstone Complex",
    corridors: "Mon-Sonari Link Road",
    radius: 20000
  },
  {
    name: "Dimapur District",
    state: "Nagaland",
    lat: 25.9094,
    lng: 93.7272,
    level: "Low",
    score: 35,
    rainfall: 46,
    slope: "14°",
    soil: "Plains Alluvium",
    corridors: "NH-29 Foothill Gateway",
    radius: 18000
  },

  // --- MANIPUR ---
  {
    name: "Tamenglong District",
    state: "Manipur",
    lat: 24.9869,
    lng: 93.4925,
    level: "Critical",
    score: 93,
    rainfall: 110,
    slope: "44°",
    soil: "Fragile Barail Rock Formations",
    corridors: "NH-37 Imphal-Jiribam Highway",
    radius: 30000
  },
  {
    name: "Noney District (Tupul)",
    state: "Manipur",
    lat: 24.8100,
    lng: 93.6000,
    level: "Critical",
    score: 96,
    rainfall: 120,
    slope: "47°",
    soil: "Major Saturated Mudslide Slopes",
    corridors: "Jiribam-Imphal Rail Line & NH-37",
    radius: 32000
  },
  {
    name: "Senapati District",
    state: "Manipur",
    lat: 25.2681,
    lng: 94.0197,
    level: "High",
    score: 83,
    rainfall: 87,
    slope: "38°",
    soil: "High Risk Sinking Belt",
    corridors: "NH-2 Senapati Section",
    radius: 25000
  },
  {
    name: "Ukhrul District",
    state: "Manipur",
    lat: 25.1167,
    lng: 94.3667,
    level: "High",
    score: 80,
    rainfall: 86,
    slope: "37°",
    soil: "Ophiolite Hill Formations",
    corridors: "Imphal-Ukhrul Highway",
    radius: 24000
  },
  {
    name: "Churachandpur District",
    state: "Manipur",
    lat: 24.3333,
    lng: 93.6833,
    level: "High",
    score: 77,
    rainfall: 82,
    slope: "34°",
    soil: "Clay Slopes & Stream Cutting",
    corridors: "Tedim Road (NH-102B)",
    radius: 24000
  },
  {
    name: "Imphal West (Valley)",
    state: "Manipur",
    lat: 24.8170,
    lng: 93.9368,
    level: "Low",
    score: 38,
    rainfall: 52,
    slope: "16°",
    soil: "Valley Sediment Layer",
    corridors: "Imphal Ring Road",
    radius: 18000
  },

  // --- MIZORAM ---
  {
    name: "Aizawl District",
    state: "Mizoram",
    lat: 23.7271,
    lng: 92.7176,
    level: "High",
    score: 85,
    rainfall: 93,
    slope: "41°",
    soil: "Hunthar & Ramhlun Sinking Belts",
    corridors: "NH-54 (NH-306) Lifeline Corridor",
    radius: 28000
  },
  {
    name: "Kolasib District",
    state: "Mizoram",
    lat: 24.2247,
    lng: 92.6781,
    level: "High",
    score: 82,
    rainfall: 90,
    slope: "38°",
    soil: "Steep Siltstone Cut-Slopes",
    corridors: "Vairengte-Kolasib Gateway Corridor",
    radius: 25000
  },
  {
    name: "Lunglei District",
    state: "Mizoram",
    lat: 22.8878,
    lng: 92.7369,
    level: "High",
    score: 79,
    rainfall: 86,
    slope: "37°",
    soil: "Weathered Surma Sandstone",
    corridors: "Aizawl-Lunglei World Bank Road",
    radius: 24000
  },
  {
    name: "Champhai District",
    state: "Mizoram",
    lat: 23.4750,
    lng: 93.3283,
    level: "Medium",
    score: 66,
    rainfall: 74,
    slope: "32°",
    soil: "Eastern Border Terraces",
    corridors: "Champhai-Zokhawthar Border Road",
    radius: 22000
  },
  {
    name: "Serchhip District",
    state: "Mizoram",
    lat: 23.3411,
    lng: 92.8503,
    level: "Medium",
    score: 62,
    rainfall: 68,
    slope: "30°",
    soil: "Central Ridge Slopes",
    corridors: "Serchhip-Thenzawl Road",
    radius: 20000
  },
  {
    name: "Lawngtlai District",
    state: "Mizoram",
    lat: 22.5283,
    lng: 92.8925,
    level: "High",
    score: 77,
    rainfall: 84,
    slope: "35°",
    soil: "Kaladan Valley Slopes",
    corridors: "Kaladan Multi-Modal Road Link",
    radius: 24000
  },

  // --- TRIPURA ---
  {
    name: "Dhalai District (Ambassa)",
    state: "Tripura",
    lat: 23.9167,
    lng: 91.8500,
    level: "High",
    score: 72,
    rainfall: 77,
    slope: "32°",
    soil: "Atharamura Range Hill Cuts",
    corridors: "NH-8 (Assam-Agartala Highway)",
    radius: 22000
  },
  {
    name: "North Tripura (Dharmanagar)",
    state: "Tripura",
    lat: 24.3833,
    lng: 92.1667,
    level: "Medium",
    score: 63,
    rainfall: 70,
    slope: "28°",
    soil: "Jampui Hills Ridge",
    corridors: "Dharmanagar-Kanchanpur Road",
    radius: 20000
  },
  {
    name: "West Tripura (Agartala)",
    state: "Tripura",
    lat: 23.8315,
    lng: 91.2868,
    level: "Low",
    score: 32,
    rainfall: 44,
    slope: "14°",
    soil: "Howrah Basin Lowlands",
    corridors: "Agartala Bypass & Airport Link",
    radius: 18000
  },
  {
    name: "Gomati District (Udaipur)",
    state: "Tripura",
    lat: 23.5333,
    lng: 91.4833,
    level: "Low",
    score: 39,
    rainfall: 48,
    slope: "18°",
    soil: "Gomati Valley Sediments",
    corridors: "Udaipur-Amarpur Road",
    radius: 18000
  },

  // --- WEST BENGAL (DARJEELING HILLS) ---
  {
    name: "Darjeeling Hills",
    state: "West Bengal",
    lat: 27.0410,
    lng: 88.2630,
    level: "Critical",
    score: 88,
    rainfall: 102,
    slope: "43°",
    soil: "Gneissic Debris & Tea Slopes",
    corridors: "NH-110, Hill Cart Road, Lebong Cart Road",
    radius: 28000
  },
  {
    name: "Kalimpong District",
    state: "West Bengal",
    lat: 27.0600,
    lng: 88.4700,
    level: "High",
    score: 80,
    rainfall: 88,
    slope: "38°",
    soil: "Teesta Gorge Sinking Zones",
    corridors: "NH-10 Sevoke-Teesta-Kalimpong",
    radius: 24000
  },
  {
    name: "Kurseong (Paglajhora Belt)",
    state: "West Bengal",
    lat: 26.8833,
    lng: 88.2833,
    level: "Critical",
    score: 92,
    rainfall: 108,
    slope: "45°",
    soil: "Active Paglajhora Landslide Belt",
    corridors: "NH-110 & DHR UNESCO Rail Track",
    radius: 26000
  }
];

// Major North Eastern Regional Arterial Corridors
const roadData = [
  {
    name: "NH-10: Siliguri → Sevoke → Teesta → Gangtok",
    state: "West Bengal / Sikkim",
    status: "Slow",
    coords: [[26.72, 88.42], [26.87, 88.44], [27.06, 88.47], [27.16, 88.53], [27.34, 88.61]]
  },
  {
    name: "NH-6 (GS Expressway): Guwahati → Nongpoh → Shillong",
    state: "Assam / Meghalaya",
    status: "Open",
    coords: [[26.14, 91.74], [25.90, 91.88], [25.68, 91.90], [25.58, 91.89]]
  },
  {
    name: "NH-6 Jaintia Lifeline: Shillong → Khliehriat → Silchar",
    state: "Meghalaya / Assam",
    status: "Blocked",
    coords: [[25.58, 91.89], [25.46, 92.15], [25.36, 92.37], [25.04, 92.65], [24.83, 92.78]]
  },
  {
    name: "NH-29: Dimapur → Kohima → Mao → Imphal",
    state: "Nagaland / Manipur",
    status: "Slow",
    coords: [[25.91, 93.73], [25.75, 93.92], [25.68, 94.11], [25.35, 94.12], [24.82, 93.94]]
  },
  {
    name: "NH-37 / NH-27: Lumding → Haflong → Silchar (Hill Section)",
    state: "Assam",
    status: "Blocked",
    coords: [[25.75, 93.17], [25.42, 93.08], [25.18, 93.02], [24.95, 92.88], [24.83, 92.78]]
  },
  {
    name: "NH-306 / NH-54: Silchar → Kolasib → Aizawl",
    state: "Assam / Mizoram",
    status: "Slow",
    coords: [[24.83, 92.78], [24.47, 92.75], [24.22, 92.68], [23.95, 92.70], [23.73, 92.72]]
  },
  {
    name: "NH-13 (Trans-Arunachal): Bhalukpong → Bomdila → Tawang",
    state: "Arunachal Pradesh",
    status: "Blocked",
    coords: [[27.01, 92.64], [27.26, 92.42], [27.45, 92.20], [27.59, 91.86]]
  },
  {
    name: "NH-415: Banderdewa → Naharlagun → Itanagar",
    state: "Assam / Arunachal",
    status: "Open",
    coords: [[27.13, 93.81], [27.10, 93.70], [27.08, 93.61]]
  },
  {
    name: "NH-110: Siliguri → Kurseong → Darjeeling (Hill Cart Road)",
    state: "West Bengal",
    status: "Open",
    coords: [[26.72, 88.42], [26.88, 88.28], [27.00, 88.26], [27.04, 88.26]]
  },
  {
    name: "NH-8: Silchar → Dharmanagar → Ambassa → Agartala",
    state: "Assam / Tripura",
    status: "Open",
    coords: [[24.83, 92.78], [24.38, 92.17], [23.92, 91.85], [23.83, 91.29]]
  }
];

// Rainfall-Triggered Weather Outlook Across North East India
const weatherData = [
  { name: "Mangan & Chungthang (Sikkim)", lat: 27.5054, lng: 88.5323, rain: 112, forecast: "Torrential downpour & cloudburst risk", risk: "Critical" },
  { name: "Darjeeling & Kurseong (WB)", lat: 27.0410, lng: 88.2630, rain: 102, forecast: "Heavy continuous monsoon rain", risk: "Critical" },
  { name: "Gangtok & Pakyong (Sikkim)", lat: 27.3389, lng: 88.6065, rain: 88, forecast: "Heavy rain with dense fog", risk: "High" },
  { name: "East Jaintia Hills (Meghalaya)", lat: 25.3562, lng: 92.3683, rain: 122, forecast: "Severe heavy rainfall outlook", risk: "Critical" },
  { name: "Shillong & Umiam (Meghalaya)", lat: 25.5788, lng: 91.8933, rain: 95, forecast: "Very heavy rain showers", risk: "High" },
  { name: "Mawkyrwat / Cherrapunji Belt", lat: 25.3667, lng: 91.4500, rain: 135, forecast: "Extreme tropical rainfall trigger", risk: "Critical" },
  { name: "Dima Hasao / Haflong (Assam)", lat: 25.1764, lng: 93.0178, rain: 118, forecast: "Heavy downpour causing mudslips", risk: "Critical" },
  { name: "Itanagar & Papum Pare (Arunachal)", lat: 27.0844, lng: 93.6053, rain: 96, forecast: "Intense convective rain bursts", risk: "Critical" },
  { name: "Tawang High Sector (Arunachal)", lat: 27.5861, lng: 91.8594, rain: 92, forecast: "Sleet and torrential rainfall", risk: "Critical" },
  { name: "Kohima Sinking Zone (Nagaland)", lat: 25.6751, lng: 94.1086, rain: 95, forecast: "Heavy rain triggering slope slumping", risk: "Critical" },
  { name: "Noney & Tamenglong (Manipur)", lat: 24.8100, lng: 93.6000, rain: 120, forecast: "Continuous severe monsoon showers", risk: "Critical" },
  { name: "Aizawl & Kolasib (Mizoram)", lat: 23.7271, lng: 92.7176, rain: 93, forecast: "Heavy rain causing slope instability", risk: "High" },
  { name: "Dhalai Hills (Tripura)", lat: 23.9167, lng: 91.8500, rain: 77, forecast: "Moderate to heavy rain showers", risk: "High" }
];

// Cellular Network Dead Zones (High Mountain Gorges & Remote Sectors)
const deadZoneData = [
  { name: "North Sikkim Mangan–Chungthang Belt", lat: 27.52, lng: 88.55, radius: 14000, note: "Total signal loss in deep Teesta gorge; satellite communication required" },
  { name: "Tawang–Sela Pass High Corridor", lat: 27.50, lng: 92.10, radius: 16000, note: "No cellular coverage above 11,000 ft altitude" },
  { name: "Dibang Valley Anini Mountain Belt", lat: 28.75, lng: 95.85, radius: 18000, note: "Remote trans-Himalayan dead zone; VHF radio relay in use" },
  { name: "Dima Hasao Hill Railway Canyon", lat: 25.20, lng: 93.05, radius: 13000, note: "Patchy/No cellular coverage in deep valleys during monsoon" },
  { name: "Sonapur–Khliehriat Highway Canyons", lat: 25.38, lng: 92.35, radius: 11000, note: "Signal blackouts near Sonapur tunnel during rockfall events" },
  { name: "South West Khasi Hills Gorge Sector", lat: 25.32, lng: 91.40, radius: 12000, note: "Intermittent / Zero mobile network near border canyons" },
  { name: "Noney Tupul Railway Valley", lat: 24.80, lng: 93.58, radius: 10000, note: "High mountain shadow zone; low 2G coverage only" },
  { name: "Aizawl–Kolasib Ridge Slopes", lat: 23.90, lng: 92.70, radius: 10000, note: "Frequent cellular tower power loss during severe monsoon storms" },
  { name: "Paglajhora–Tindharia Hill Sector", lat: 26.90, lng: 88.30, radius: 8000, note: "Optical fibre cable snapping risk on active landslide paths" }
];

// Layer Configurations & Legends
const layerInfo = {
  all: {
    title: "North East Monitoring Overview",
    legend: [
      ["#d56535", "High risk district"],
      ["#a92f35", "Critical risk district"],
      ["#d49a28", "Medium risk"],
      ["#3d9b68", "Low risk"],
      ["#329463", "Open corridor"],
      ["#d39a29", "Slow / Caution"],
      ["#b43a3a", "Blocked road"],
      ["#a684f2", "Dead zone"]
    ],
    alert: ["North Eastern Region AI Monitoring Active", "Live situational view across all 8 North Eastern states + Darjeeling hills."]
  },
  risk: {
    title: "District Risk Severity",
    legend: [
      ["#3d9b68", "Low (0–40)"],
      ["#d49a28", "Medium (41–70)"],
      ["#d56535", "High (71–85)"],
      ["#a92f35", "Critical (86–100)"]
    ],
    alert: ["District Risk Severity Layer", "Real-time AI risk index based on geological slope gradient, 24h rainfall trigger, and soil saturation."]
  },
  roads: {
    title: "North East Transit Corridors",
    legend: [
      ["#329463", "Open / Passable"],
      ["#d39a29", "Slow / Debris warning"],
      ["#b43a3a", "Blocked by Landslide"]
    ],
    alert: ["Arterial Road Connectivity Layer", "Monitoring key lifeline highways: NH-10, NH-6, NH-29, NH-27, NH-13, and NH-54."]
  },
  weather: {
    title: "Precipitation & Cloudburst Outlook",
    legend: [
      ["#d49a28", "Moderate rain (50–70mm)"],
      ["#d56535", "Heavy rain (71–100mm)"],
      ["#a92f35", "Torrential / Cloudburst (>100mm)"]
    ],
    alert: ["Rainfall Correlation Layer", "Monitors rainfall saturation exceeding 80mm/24h which triggers rapid slope failure in NER."]
  },
  deadzones: {
    title: "Cellular Coverage Dead Zones",
    legend: [
      ["#a684f2", "Zero / Limited Signal"]
    ],
    alert: ["Cellular Dead Zone Layer", "Hill sectors where field teams and residents must use offline alerting or satellite phones."]
  },
  reports: {
    title: "Emergency Field Reports",
    legend: [
      ["#333b43", "Citizen / Officer Geo-report"]
    ],
    alert: ["Emergency Response Layer", "Field evidence, live photos, and geo-tagged incident logs submitted from the ground."]
  }
};

function riskColor(level) {
  return {
    Low: "#3d9b68",
    Medium: "#d49a28",
    High: "#d56535",
    Critical: "#a92f35"
  }[level] || "#777";
}

function roadColor(status) {
  return {
    Open: "#329463",
    Slow: "#d39a29",
    Blocked: "#b43a3a"
  }[status] || "#777";
}

// Recent Emergency Alerts Dispatched via CAP (Common Alerting Protocol)
const alertsData = [
  {
    id: "ALT-9041",
    severity: "Critical",
    title: "Immediate Evacuation Warning: Debris Flow Imminent",
    district: "Mangan (North Sikkim)",
    state: "Sikkim",
    time: "14 mins ago",
    timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    channel: "CAP Broadcast & Sirens",
    message: "Teesta upper valley river gauge indicates debris damming upstream of Chungthang. Low-lying hillside residents must evacuate to designated relief camps immediately."
  },
  {
    id: "ALT-9038",
    severity: "Critical",
    title: "Major Landslide Blockage on NH-6 Jaintia Corridor",
    district: "East Jaintia Hills",
    state: "Meghalaya",
    time: "42 mins ago",
    timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    channel: "SMS Geo-push & SDRF Dispatch",
    message: "Active slope failure at Sonapur tunnel approach. Heavy boulder fall reported. Traffic halted in both directions. NDRF team deployed for debris clearance."
  },
  {
    id: "ALT-9032",
    severity: "Critical",
    title: "Rail & Highway Emergency: Hill Section Cut-off",
    district: "Dima Hasao (Haflong)",
    state: "Assam",
    time: "1 hr 15 mins ago",
    timestamp: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    channel: "CAP Broadcast & Police Wireless",
    message: "Multiple mudslips between Jatinga-Lumpur and New Haflong. Train operations suspended. NH-27 hill bypass operational under extreme caution."
  },
  {
    id: "ALT-9025",
    severity: "High",
    title: "Flash Flood & Slope Instability Advisory",
    district: "Papum Pare (Itanagar)",
    state: "Arunachal Pradesh",
    time: "2 hrs ago",
    timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    channel: "State Disaster Authority SMS",
    message: "Rainfall exceeds 96mm in past 18 hours. Gully erosion active along NH-415. Commuters advised to avoid nighttime mountain travel."
  },
  {
    id: "ALT-9019",
    severity: "High",
    title: "Sinking Zone Advisory: NH-29 Kohima Sector",
    district: "Kohima",
    state: "Nagaland",
    time: "3 hrs 30 mins ago",
    timestamp: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    channel: "Civil Defense Broadcast",
    message: "Disang shale formation active creep observed near Dzüdza bridge. Heavy freight vehicles restricted to single-lane convoy movement."
  },
  {
    id: "ALT-9011",
    severity: "Medium",
    title: "Precautionary Monitoring: Heavy Rainfall Forecast",
    district: "Aizawl District",
    state: "Mizoram",
    time: "5 hrs ago",
    timestamp: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
    channel: "Disaster App Push Alert",
    message: "Hunthar and Ramhlun hill sectors placed under Level-2 soil saturation surveillance. Field sensor data nominal."
  }
];

// Default Citizen & Field Reports with Status (New / Verified / Resolved)
const defaultReportsData = [
  {
    id: 17112001,
    type: "Landslide",
    priority: "Critical",
    status: "New",
    location: "Mangan-Chungthang Road, North Sikkim",
    lat: 27.512,
    lng: 88.541,
    description: "Massive mudslide blocking both lanes near mile marker 14. Large trees down across power lines.",
    files: 3,
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    reporter: "Tenzing Lepcha (Field Warden)"
  },
  {
    id: 17112002,
    type: "Road blockage",
    priority: "Critical",
    status: "Verified",
    location: "Sonapur Tunnel, NH-6, East Jaintia Hills",
    lat: 25.362,
    lng: 92.371,
    description: "Rockfall debris blocking south portal. Verified by PWD quick response team. Earthmovers on site.",
    files: 2,
    createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    reporter: "B. Marak (Civilian Commuter)"
  },
  {
    id: 17112003,
    type: "Crack / slope movement",
    priority: "High",
    status: "New",
    location: "Hunthar Veng Ridge, Aizawl",
    lat: 23.731,
    lng: 92.721,
    description: "Visible 4-inch tension crack opening up along retaining wall above main market road.",
    files: 1,
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    reporter: "Lalrindika (Resident)"
  },
  {
    id: 17112004,
    type: "Rockfall",
    priority: "High",
    status: "Verified",
    location: "Paglajhora Sinking Belt, Kurseong, Darjeeling",
    lat: 26.891,
    lng: 88.281,
    description: "Loose shale boulders continuing to roll down upper slope after heavy morning cloudburst.",
    files: 4,
    createdAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    reporter: "Subash Thapa (Field Official)"
  },
  {
    id: 17112005,
    type: "Road blockage",
    priority: "Medium",
    status: "Resolved",
    location: "NH-10 Sevoke Bridge approach",
    lat: 26.882,
    lng: 88.445,
    description: "Small mudslip on shoulder cleared by Border Roads Organisation. Both lanes restored for light traffic.",
    files: 2,
    createdAt: new Date(Date.now() - 280 * 60 * 1000).toISOString(),
    reporter: "BRO Control Room"
  },
  {
    id: 17112006,
    type: "Flooding",
    priority: "Low",
    status: "Resolved",
    location: "Silchar Medical College Road, Cachar",
    lat: 24.829,
    lng: 92.782,
    description: "Waterlogging receded after storm drain cleared. Traffic moving normally.",
    files: 1,
    createdAt: new Date(Date.now() - 400 * 60 * 1000).toISOString(),
    reporter: "Anup Das (Citizen)"
  }
];
