const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');

// Set up clean browser-like VM context to evaluate data.js and services.js
const context = {
  console,
  fetch,
  Math,
  Array,
  Map,
  Set,
  JSON,
  RegExp,
  encodeURIComponent,
  parseFloat,
  parseInt,
  Date,
  setTimeout,
  clearTimeout
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

// Load data.js and services.js
const dataCode = fs.readFileSync('./src/js/data.js', 'utf8');
const servicesCode = fs.readFileSync('./src/js/services.js', 'utf8');
vm.runInContext(dataCode, context);
vm.runInContext(servicesCode, context);

test('NEXZORA Safe Routing & Disaster Evasion Engine Suite', async (t) => {
  const engine = context.SafeRoutingEngine;

  await t.test('1. Hazard Aggregator consolidates active landslide zones and road closures', () => {
    const hazards = engine.getAllHazardNodes();
    assert.ok(Array.isArray(hazards), 'Hazards should be an array');
    assert.ok(hazards.length >= 20, 'Should aggregate at least 20 danger zones from riskData and roadData');

    const blockedRoads = hazards.filter(h => h.status === 'Blocked');
    assert.ok(blockedRoads.length > 0, 'Should include blocked road segments like NH-6 Sonapur tunnel');
  });

  await t.test('2. Evaluate Route Hazards flags intersected danger perimeters and road closures', () => {
    const hazards = engine.getAllHazardNodes();
    // Synthetic route through Darjeeling / Kurseong
    const riskyCoords = [
      [26.72, 88.42], // Siliguri
      [26.88, 88.28], // Kurseong Paglajhora
      [27.04, 88.26]  // Darjeeling Hills
    ];

    const analysis = engine.evaluateRouteHazards(riskyCoords, hazards);
    assert.strictEqual(analysis.isClear, false, 'Route through Kurseong should be flagged as hazardous');
    assert.ok(analysis.hazardCount >= 1, 'Should detect at least 1 hazard intersection');
    assert.ok(analysis.maxRiskScore >= 80, 'Max risk score should be in high/critical tier');
  });

  await t.test('3. Shimla -> Gangtok computes realistic highway route with Teesta gorge hazard bypass', async () => {
    const result = await engine.calculateSafeAndShortestRoute('shimla', 'gangtok');

    assert.ok(result.safestRoute, 'Should compute safest route');
    assert.ok(result.directRoute, 'Should retain direct route for risk comparison');
    assert.ok(parseFloat(result.safestRoute.distanceKm) > 1500, 'Distance should reflect real-life highway geometry (~1800km)');
    assert.ok(result.safestRoute.googleMapsUrl.includes('travelmode=driving'), 'Should provide Google Maps driving URL');
    assert.ok(result.safestRoute.googleMapsUrl.includes('destination=27.3389%2C88.6065'), 'Destination should match Gangtok coordinates');
  });

  await t.test('4. Shillong -> Silchar bypasses blocked NH-6 corridor in favor of open NH-27 axis', async () => {
    const result = await engine.calculateSafeAndShortestRoute('shillong', 'silchar');

    assert.ok(result.isHazardBypassed, 'Should actively trigger safe bypass for blocked highway');
    assert.ok(result.directRoute.blockedRoadCount > 0, 'Direct route should detect physical road blockage on NH-6');
    assert.strictEqual(result.safestRoute.blockedRoadCount, 0, 'Safest route must contain zero physical road closures');
    assert.ok(result.safestRoute.name.includes('NH-27'), 'Safest route should utilize NH-27 all-weather corridor');
  });

  await t.test('5. External Google Maps Navigation URL embeds origin, destination, and evasive waypoints', () => {
    const origin = { lat: 26.7271, lng: 88.3953 };
    const destination = { lat: 27.3389, lng: 88.6065 };
    const waypoints = [
      { lat: 26.8833, lng: 88.7212 },
      { lat: 27.0864, lng: 88.6631 }
    ];

    const url = engine.generateGoogleMapsUrl(origin, destination, waypoints);
    assert.ok(url.startsWith('https://www.google.com/maps/dir/'), 'Must start with Google Maps directions endpoint');
    assert.ok(url.includes('origin=26.7271%2C88.3953'), 'Must encode origin');
    assert.ok(url.includes('destination=27.3389%2C88.6065'), 'Must encode destination');
    assert.ok(url.includes('waypoints=26.8833%2C88.7212%7C27.0864%2C88.6631'), 'Must pipe-delimit waypoints');
  });
});
