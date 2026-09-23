/**
 * NEXZORA — Ground Incident Reporting, Media Geotagging & Offline Sync
 * Comprehensive client module managing mobile-first incident submission,
 * interactive mini-map pin placement, media previews, My Reports timeline,
 * and live notification streams.
 */

(() => {
  // Modal Elements
  const reportModal = document.getElementById('reportModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const reportModalBackdrop = document.getElementById('reportModalBackdrop');
  const reportForm = document.getElementById('reportForm');
  const submitBtn = document.getElementById('submitIncidentBtn');
  const submitMessage = document.getElementById('submitMessage');

  // Input Elements
  const incidentTypeInput = document.getElementById('incidentType');
  const incidentTypeCards = document.querySelectorAll('.type-card');
  const descTextarea = document.getElementById('reportDescription');
  const charCounter = document.getElementById('charCounter');
  // Location UI Elements
  const reportGpsBtn = document.getElementById('reportGpsBtn');
  const refreshGpsBtn = document.getElementById('refreshGpsBtn');
  const chooseMapPinBtn = document.getElementById('chooseMapPinBtn');
  const clearLocationBtn = document.getElementById('clearLocationBtn');
  const gpsStatus = document.getElementById('gpsStatus');
  const gpsStatusBar = document.getElementById('gpsStatusBar');
  const gpsStatusIcon = document.getElementById('gpsStatusIcon');
  const gpsQualityAlert = document.getElementById('gpsQualityAlert');
  const gpsQualityAlertText = document.getElementById('gpsQualityAlertText');
  const outsideStudyAreaNotice = document.getElementById('outsideStudyAreaNotice');
  const locationSummaryCard = document.getElementById('locationSummaryCard');
  const locationQualityBadge = document.getElementById('locationQualityBadge');
  const sumLat = document.getElementById('sumLat');
  const sumLng = document.getElementById('sumLng');
  const sumAcc = document.getElementById('sumAcc');
  const sumAlt = document.getElementById('sumAlt');
  const sumTz = document.getElementById('sumTz');
  const sumTime = document.getElementById('sumTime');
  const sumSource = document.getElementById('sumSource');

  const reportState = document.getElementById('reportState');
  const reportDistrict = document.getElementById('reportDistrict');
  const reportVillage = document.getElementById('reportVillage');
  const reportRoad = document.getElementById('reportRoad');
  const reportLandmark = document.getElementById('reportLandmark');
  const evidenceInput = document.getElementById('evidenceInput');
  const chooseFileBtn = document.getElementById('chooseFileBtn');
  const dropZone = document.getElementById('dropZone');
  const mediaPreviewList = document.getElementById('mediaPreviewList');

  // My Reports & Notifications Elements
  const myReportsModal = document.getElementById('myReportsModal');
  const closeMyReportsBtn = document.getElementById('closeMyReportsBtn');
  const myReportsBackdrop = document.getElementById('myReportsModalBackdrop');
  const openMyReportsBtn = document.getElementById('openMyReportsBtn');
  const myReportsStream = document.getElementById('myReportsStream');

  const notificationsModal = document.getElementById('notificationsModal');
  const closeNotifBtn = document.getElementById('closeNotifModalBtn');
  const notifBackdrop = document.getElementById('notificationsBackdrop');
  const openNotifBtn = document.getElementById('openNotifBtn');
  const notifBadge = document.getElementById('notifBadge');
  const notificationsList = document.getElementById('notificationsList');

  const incidentDetailModal = document.getElementById('incidentDetailModal');
  const closeIncidentDetailBtn = document.getElementById('closeIncidentDetailBtn');
  const incidentDetailBackdrop = document.getElementById('incidentDetailBackdrop');

  const editIncidentModal = document.getElementById('editIncidentModal');
  const closeEditIncidentBtn = document.getElementById('closeEditIncidentBtn');
  const editIncidentForm = document.getElementById('editIncidentForm');

  // Comprehensive Location State
  let locationState = {
    captured: false,
    latitude: null,
    longitude: null,
    gps_accuracy_m: null,
    altitude_m: null,
    altitude_accuracy_m: null,
    heading_deg: null,
    speed_mps: null,
    location_source: null, // 'gps' | 'manual_map_pin' | 'device_last_known_location'
    location_captured_at: null,
    device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    location_permission_status: 'prompt', // 'granted' | 'denied' | 'prompt' | 'unavailable'
    location_quality: 'unknown', // 'high' | 'medium' | 'low' | 'unknown'
    outside_study_area: false,
    reverse_geocoded_address: null
  };

  let selectedMediaFiles = [];
  let miniMap = null;
  let miniMarker = null;

  // NER Boundary helper (Lat 21.8 - 29.5 N, Lng 88.0 - 97.5 E)
  function isInsideNER(lat, lng) {
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return false;
    return lat >= 21.8 && lat <= 29.5 && lng >= 88.0 && lng <= 97.5;
  }

  // Initialize Mini Map for Pin Placement
  function initMiniPinMap() {
    const container = document.getElementById('miniPinMap');
    if (!container || miniMap) return;

    const defaultLat = locationState.latitude || 25.5788;
    const defaultLng = locationState.longitude || 91.8933;

    miniMap = L.map('miniPinMap', {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 18
    }).setView([defaultLat, defaultLng], 12);

    L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
      subdomains: '0123',
      maxZoom: 19,
      attribution: '&copy; Google'
    }).addTo(miniMap);

    miniMarker = L.marker([defaultLat, defaultLng], {
      draggable: true
    }).addTo(miniMap);

    miniMarker.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      setManualLocation(pos.lat, pos.lng);
    });

    miniMap.on('click', (e) => {
      const pos = e.latlng;
      if (miniMarker) miniMarker.setLatLng(pos);
      setManualLocation(pos.lat, pos.lng);
    });
  }

  // Request Automatic GPS Location with High Accuracy & Timeout
  function requestGpsLocation(isRefresh = false) {
    if (!navigator.geolocation) {
      updateGpsStatus('error', '❌ Geolocation is not supported by this browser. Please place pin on the map.');
      locationState.location_permission_status = 'unavailable';
      return;
    }

    updateGpsStatus('loading', isRefresh ? '🔄 Refreshing GPS fix (high accuracy)...' : '📡 Requesting GPS permission & acquiring high-accuracy fix...');

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || null;
        const alt = pos.coords.altitude || null;
        const altAcc = pos.coords.altitudeAccuracy || null;
        const heading = pos.coords.heading || null;
        const speed = pos.coords.speed || null;
        const capturedAt = new Date(pos.timestamp || Date.now()).toISOString();

        locationState = {
          captured: true,
          latitude: lat,
          longitude: lng,
          gps_accuracy_m: acc,
          altitude_m: alt,
          altitude_accuracy_m: altAcc,
          heading_deg: heading,
          speed_mps: speed,
          location_source: 'gps',
          location_captured_at: capturedAt,
          device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
          location_permission_status: 'granted',
          location_quality: acc ? (acc <= 50 ? 'high' : acc <= 200 ? 'medium' : 'low') : 'unknown',
          outside_study_area: !isInsideNER(lat, lng),
          reverse_geocoded_address: null
        };

        renderLocationState();
      },
      (err) => {
        console.warn('[GPS Error]', err.code, err.message);
        if (err.code === 1) {
          locationState.location_permission_status = 'denied';
          updateGpsStatus('error', '🚫 Location permission denied. Please allow GPS access or place the pin manually on the map.');
        } else if (err.code === 2) {
          locationState.location_permission_status = 'unavailable';
          updateGpsStatus('warning', '⚠️ GPS signal unavailable. Please select incident position manually on the map.');
        } else if (err.code === 3) {
          updateGpsStatus('warning', '⏱️ Location detection timed out. Please retry or place pin on the map.');
        } else {
          updateGpsStatus('error', `⚠️ Location error: ${err.message}. Place pin manually.`);
        }
      },
      geoOptions
    );
  }

  // Set Manual Location via Mini-Map Drag/Click
  function setManualLocation(lat, lng) {
    const numericLat = parseFloat(lat);
    const numericLng = parseFloat(lng);
    const now = new Date().toISOString();

    locationState = {
      captured: true,
      latitude: numericLat,
      longitude: numericLng,
      gps_accuracy_m: null,
      altitude_m: null,
      altitude_accuracy_m: null,
      heading_deg: null,
      speed_mps: null,
      location_source: 'manual_map_pin',
      location_captured_at: now,
      device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      location_permission_status: 'prompt',
      location_quality: 'medium',
      outside_study_area: !isInsideNER(numericLat, numericLng),
      reverse_geocoded_address: null
    };

    renderLocationState();
  }

  // Clear Location
  function clearLocation() {
    locationState = {
      captured: false,
      latitude: null,
      longitude: null,
      gps_accuracy_m: null,
      altitude_m: null,
      altitude_accuracy_m: null,
      heading_deg: null,
      speed_mps: null,
      location_source: null,
      location_captured_at: null,
      device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
      location_permission_status: 'prompt',
      location_quality: 'unknown',
      outside_study_area: false,
      reverse_geocoded_address: null
    };

    if (locationSummaryCard) locationSummaryCard.classList.add('hidden');
    if (gpsQualityAlert) gpsQualityAlert.classList.add('hidden');
    if (outsideStudyAreaNotice) outsideStudyAreaNotice.classList.add('hidden');
    if (refreshGpsBtn) refreshGpsBtn.classList.add('hidden');
    if (clearLocationBtn) clearLocationBtn.classList.add('hidden');

    updateGpsStatus('normal', 'Location not captured. Click "Use My Current Location" or place pin on map.');
  }

  // Helper: Update GPS Status Bar
  function updateGpsStatus(type, message) {
    if (!gpsStatus) return;
    gpsStatus.innerHTML = message;

    if (gpsStatusBar) {
      gpsStatusBar.classList.remove('captured', 'error', 'warning');
      if (type === 'captured') gpsStatusBar.classList.add('captured');
      else if (type === 'error') gpsStatusBar.classList.add('error');
      else if (type === 'warning') gpsStatusBar.classList.add('warning');
    }

    if (gpsStatusIcon) {
      if (type === 'loading') gpsStatusIcon.textContent = '⏳';
      else if (type === 'captured') gpsStatusIcon.textContent = '✅';
      else if (type === 'error') gpsStatusIcon.textContent = '❌';
      else if (type === 'warning') gpsStatusIcon.textContent = '⚠️';
      else gpsStatusIcon.textContent = '📡';
    }
  }

  // Render Captured Location State to UI
  function renderLocationState() {
    if (!locationState.captured || locationState.latitude === null || locationState.longitude === null) {
      return;
    }

    const lat = locationState.latitude;
    const lng = locationState.longitude;
    const isGps = locationState.location_source === 'gps';
    const acc = locationState.gps_accuracy_m;

    // 1. Update Map & Marker
    if (miniMarker) {
      miniMarker.setLatLng([lat, lng]);
    }
    if (miniMap) {
      miniMap.panTo([lat, lng]);
    }

    // 2. Update Status Bar
    if (isGps) {
      const accText = acc ? `(±${Math.round(acc)}m accuracy)` : '';
      updateGpsStatus('captured', `<strong>Location captured accurately via GPS:</strong> ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E ${accText}`);
    } else {
      updateGpsStatus('captured', `<strong>Manual Location Selected on Map:</strong> ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`);
    }

    // 3. Show Action Buttons
    if (refreshGpsBtn) refreshGpsBtn.classList.remove('hidden');
    if (clearLocationBtn) clearLocationBtn.classList.remove('hidden');

    // 4. Update Telemetry Summary Card
    if (locationSummaryCard) {
      locationSummaryCard.classList.remove('hidden');
      if (sumLat) sumLat.textContent = `${lat.toFixed(5)}° N`;
      if (sumLng) sumLng.textContent = `${lng.toFixed(5)}° E`;
      if (sumAcc) sumAcc.textContent = acc ? `${Math.round(acc)} metres` : 'N/A (Manual Pin)';
      if (sumAlt) sumAlt.textContent = locationState.altitude_m ? `${Math.round(locationState.altitude_m)} m` : 'Unavailable';
      if (sumTz) sumTz.textContent = locationState.device_timezone || 'Asia/Kolkata';
      if (sumTime) sumTime.textContent = new Date(locationState.location_captured_at || Date.now()).toLocaleTimeString();
      if (sumSource) sumSource.textContent = isGps ? 'GPS Sensor (Device)' : 'Manual Map Pin';

      if (locationQualityBadge) {
        locationQualityBadge.className = `quality-chip quality-${locationState.location_quality}`;
        locationQualityBadge.textContent = `${locationState.location_quality.toUpperCase()} QUALITY`;
      }
    }

    // 5. Accuracy Quality Alerts
    if (gpsQualityAlert && gpsQualityAlertText) {
      if (isGps && acc && acc > 200) {
        gpsQualityAlert.className = 'gps-quality-alert severe';
        gpsQualityAlert.classList.remove('hidden');
        gpsQualityAlertText.innerHTML = `⚠️ <strong>Low GPS Accuracy Alert:</strong> Location reading is approximate by ±${Math.round(acc)}m. Please verify or drag the map pin to the exact location.`;
      } else if (isGps && acc && acc > 50) {
        gpsQualityAlert.className = 'gps-quality-alert';
        gpsQualityAlert.classList.remove('hidden');
        gpsQualityAlertText.innerHTML = `ℹ️ <strong>Moderate Accuracy:</strong> GPS accuracy is ±${Math.round(acc)}m. Adjust pin if needed.`;
      } else {
        gpsQualityAlert.classList.add('hidden');
      }
    }

    // 6. Outside Study Area Warning
    if (outsideStudyAreaNotice) {
      outsideStudyAreaNotice.classList.toggle('hidden', !locationState.outside_study_area);
    }

    // 7. Trigger Reverse Geocoding
    if (typeof window.reverseGeocode === 'function') {
      window.reverseGeocode(lat, lng).then(placeName => {
        if (!placeName) return;
        locationState.reverse_geocoded_address = placeName;
        const parts = placeName.split(',').map(s => s.trim());
        if (parts.length >= 2 && reportDistrict && !reportDistrict.value) {
          reportDistrict.value = parts[parts.length - 3] || parts[0];
        }
        if (reportVillage && !reportVillage.value) {
          reportVillage.value = parts.slice(0, 2).join(', ');
        }
      }).catch(() => {});
    }
  }

  // Open Report Modal
  function openReportModal() {
    if (window.Auth && !window.Auth.isLoggedIn()) {
      if (typeof window.openAuthModal === 'function') {
        window.openAuthModal('signin');
        return;
      }
    }

    if (reportModal) {
      reportModal.classList.remove('hidden');
      setTimeout(() => {
        initMiniPinMap();
        if (miniMap) miniMap.invalidateSize();
      }, 150);

      // Populate user district default
      if (window.Auth && window.Auth.user) {
        if (reportState && window.Auth.user.state) reportState.value = window.Auth.user.state;
        if (reportDistrict && window.Auth.user.district) reportDistrict.value = window.Auth.user.district;
      }

      // Check online status
      const offlineNotice = document.getElementById('formOfflineStatus');
      if (offlineNotice) {
        offlineNotice.classList.toggle('hidden', navigator.onLine);
      }
    }
  }

  function closeReportModal() {
    if (reportModal) reportModal.classList.add('hidden');
  }

  // Incident Type Selection Grid
  incidentTypeCards.forEach(card => {
    card.addEventListener('click', () => {
      incidentTypeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const val = card.dataset.type;
      if (incidentTypeInput) incidentTypeInput.value = val;
    });
  });

  // Severity Radio Cards Styling
  const sevCards = [
    { el: document.getElementById('sevCardLow'), val: 'Low' },
    { el: document.getElementById('sevCardMed'), val: 'Medium' },
    { el: document.getElementById('sevCardHigh'), val: 'High' }
  ];

  sevCards.forEach(item => {
    if (item.el) {
      item.el.addEventListener('click', () => {
        sevCards.forEach(x => x.el?.classList.remove('active'));
        item.el.classList.add('active');
      });
    }
  });

  // Live Character Counter
  if (descTextarea && charCounter) {
    descTextarea.addEventListener('input', () => {
      const len = descTextarea.value.length;
      charCounter.textContent = `${len} / 1000`;
      charCounter.style.color = len < 10 ? 'var(--danger)' : len > 950 ? 'var(--warning)' : 'var(--muted)';
    });
  }

  // Attach Location Action Button Listeners
  if (reportGpsBtn) {
    reportGpsBtn.addEventListener('click', () => requestGpsLocation(false));
  }
  if (refreshGpsBtn) {
    refreshGpsBtn.addEventListener('click', () => requestGpsLocation(true));
  }
  if (chooseMapPinBtn) {
    chooseMapPinBtn.addEventListener('click', () => {
      const container = document.getElementById('miniPinMap');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        container.style.boxShadow = '0 0 0 2px var(--accent)';
        setTimeout(() => container.style.boxShadow = 'none', 1500);
      }
      if (!locationState.captured) {
        setManualLocation(25.5788, 91.8933);
      }
    });
  }
  if (clearLocationBtn) {
    clearLocationBtn.addEventListener('click', clearLocation);
  }

  // Media File Handling (Photos: max 10MB, Videos: max 50MB)
  if (chooseFileBtn && evidenceInput) {
    chooseFileBtn.addEventListener('click', () => evidenceInput.click());
    evidenceInput.addEventListener('change', (e) => {
      handleMediaSelection(Array.from(e.target.files));
    });
  }

  if (dropZone) {
    ['dragenter', 'dragover'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-active');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files) {
        handleMediaSelection(Array.from(e.dataTransfer.files));
      }
    });
  }

  function handleMediaSelection(files) {
    for (const file of files) {
      const isPhoto = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isPhoto && !isVideo) {
        alert(`Unsupported file type '${file.name}'. Please upload JPEG, PNG, WEBP, MP4, or MOV.`);
        continue;
      }

      const maxSize = isPhoto ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(`File '${file.name}' exceeds the maximum allowed size of ${isPhoto ? '10 MB' : '50 MB'}.`);
        continue;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        selectedMediaFiles.push({
          name: file.name,
          type: isPhoto ? 'photo' : 'video',
          sizeBytes: file.size,
          dataUrl: evt.target.result,
          capturedAt: new Date().toISOString()
        });
        renderMediaPreviews();
      };
      reader.readAsDataURL(file);
    }
  }

  function renderMediaPreviews() {
    if (!mediaPreviewList) return;
    mediaPreviewList.innerHTML = '';

    selectedMediaFiles.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'media-preview-card';

      if (item.type === 'photo') {
        card.innerHTML = `
          <img src="${item.dataUrl}" alt="${item.name}" />
          <button type="button" class="remove-media-btn" title="Remove" data-index="${index}">×</button>
          <span class="media-type-tag">PHOTO</span>
        `;
      } else {
        card.innerHTML = `
          <div class="video-placeholder">🎬 ${item.name}</div>
          <button type="button" class="remove-media-btn" title="Remove" data-index="${index}">×</button>
          <span class="media-type-tag">VIDEO</span>
        `;
      }

      card.querySelector('.remove-media-btn').addEventListener('click', () => {
        selectedMediaFiles.splice(index, 1);
        renderMediaPreviews();
      });

      mediaPreviewList.appendChild(card);
    });
  }

  // Form Submit Handler
  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (window.Auth && !window.Auth.isLoggedIn()) {
        if (typeof window.openAuthModal === 'function') {
          window.openAuthModal('signin');
        }
        return;
      }

      const incidentType = incidentTypeInput ? incidentTypeInput.value : 'Minor Landslide';
      const severity = document.querySelector('input[name="priority"]:checked')?.value || 'Medium';
      const description = descTextarea ? descTextarea.value.trim() : '';
      const state = reportState ? reportState.value : 'Meghalaya';
      const district = reportDistrict ? reportDistrict.value.trim() : 'East Khasi Hills';
      const village = reportVillage ? reportVillage.value.trim() : '';
      const road = reportRoad ? reportRoad.value.trim() : '';
      const landmark = reportLandmark ? reportLandmark.value.trim() : '';
      const consentChecked = document.getElementById('reportConsentCheck')?.checked;
      const allowDuplicate = document.getElementById('allowDuplicateCheckbox')?.checked || false;

      if (!incidentType) {
        showSubmitError('Please select an incident type.');
        return;
      }

      if (description.length < 10) {
        showSubmitError('Description must be at least 10 characters long.');
        return;
      }

      if (!locationState.captured || locationState.latitude === null || locationState.longitude === null) {
        showSubmitError('Location is required before submitting. Please click "Use My Current Location" or place a pin on the map.');
        return;
      }

      if (!consentChecked) {
        showSubmitError('Please confirm the observation consent checkbox.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Processing Submission...';
      }

      const clientReportId = `client_rep_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const locationText = `${village ? village + ', ' : ''}${district}, ${state}`;

      const reportPayload = {
        client_report_id: clientReportId,
        incident_type: incidentType,
        type: incidentType,
        severity_reported: severity,
        priority: severity,
        description,
        latitude: locationState.latitude,
        longitude: locationState.longitude,
        lat: locationState.latitude,
        lng: locationState.longitude,
        gps_accuracy_m: locationState.gps_accuracy_m,
        altitude_m: locationState.altitude_m,
        altitude_accuracy_m: locationState.altitude_accuracy_m,
        heading_deg: locationState.heading_deg,
        speed_mps: locationState.speed_mps,
        location_source: locationState.location_source || 'gps',
        location_captured_at: locationState.location_captured_at || new Date().toISOString(),
        device_timezone: locationState.device_timezone || 'Asia/Kolkata',
        location_permission_status: locationState.location_permission_status || 'granted',
        location_quality: locationState.location_quality || 'medium',
        reverse_geocoded_address: locationState.reverse_geocoded_address,
        state,
        district,
        village_or_town: village,
        road_name: road,
        landmark,
        location: locationText,
        allow_duplicate: allowDuplicate,
        media: selectedMediaFiles.map(m => ({
          name: m.name,
          type: m.type,
          dataUrl: m.dataUrl,
          capturedAt: m.capturedAt
        }))
      };

      let submittedSuccessfully = false;

      // Check if Online
      if (navigator.onLine && window.Auth && window.Auth.isLoggedIn()) {
        try {
          const res = await window.Auth.apiFetch('/api/incidents', {
            method: 'POST',
            body: JSON.stringify(reportPayload)
          });

          if (res.success && (res.report || res.incident)) {
            submittedSuccessfully = true;
            handleSuccessfulSubmission(res.report || res.incident, false);
          } else if (res.code === 'DUPLICATE_REPORT_DETECTED') {
            const dupBox = document.getElementById('duplicateWarningBanner');
            const dupText = document.getElementById('duplicateWarningText');
            if (dupBox && dupText) {
              dupBox.classList.remove('hidden');
              dupText.textContent = res.warning || 'A similar report was recently filed in this vicinity.';
            }
            showSubmitError(res.warning || 'Potential duplicate report detected.');
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = '🚀 Submit Incident Report';
            }
            return;
          } else {
            throw new Error(res.error || 'Server rejected incident submission.');
          }
        } catch (err) {
          console.warn('[Incident Report] Online submit failed, storing offline:', err.message);
        }
      }

      // Offline fallback
      if (!submittedSuccessfully) {
        if (window.OfflineStore) {
          const offlineReport = await window.OfflineStore.saveOfflineReport(reportPayload);
          handleSuccessfulSubmission(offlineReport, true);
        } else {
          showSubmitError('Failed to submit report and offline storage is unavailable.');
        }
      }
    });
  }

  function handleSuccessfulSubmission(report, isOffline) {
    if (submitMessage) {
      if (isOffline) {
        submitMessage.innerHTML = '📶 <strong>Saved Offline:</strong> Report saved safely on your device. It will automatically sync when network returns.';
        submitMessage.style.color = 'var(--warning)';
      } else {
        submitMessage.innerHTML = '✅ <strong>Submitted Successfully:</strong> Incident report queued for field officer verification.';
        submitMessage.style.color = 'var(--accent)';
      }
    }

    // Add marker to live Leaflet Map
    if (report.latitude && report.longitude && typeof window.addReportMarker === 'function') {
      window.addReportMarker(report);
    }

    // Refresh Panels
    if (typeof window.refreshCitizenReportsPanel === 'function') {
      window.refreshCitizenReportsPanel();
    }
    fetchNotifications();

    setTimeout(() => {
      closeReportModal();
      reportForm?.reset();
      clearLocation();
      selectedMediaFiles = [];
      renderMediaPreviews();
      if (submitMessage) submitMessage.innerHTML = '';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '🚀 Submit Incident Report';
      }
      const dupBox = document.getElementById('duplicateWarningBanner');
      if (dupBox) dupBox.classList.add('hidden');
    }, 1800);
  }

  function showSubmitError(msg) {
    if (submitMessage) {
      submitMessage.textContent = msg;
      submitMessage.style.color = 'var(--danger)';
    }
  }

  // =========================================================================
  // MY REPORTS MODAL & FEED
  // =========================================================================
  async function loadMyReports(statusFilter = 'all') {
    if (!myReportsStream) return;
    if (!window.Auth || !window.Auth.isLoggedIn()) {
      myReportsStream.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">Please sign in to view your reports.</p>';
      return;
    }

    myReportsStream.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">Fetching your reports...</p>';

    try {
      const query = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await window.Auth.apiFetch(`/api/incidents/my-reports${query}`);

      // Also get offline drafts
      const offlineDrafts = window.OfflineStore ? await window.OfflineStore.getOfflineReports() : [];

      const onlineReports = res.success ? (res.reports || []) : [];
      const allReports = [...offlineDrafts, ...onlineReports];

      // Update counters
      const counts = { all: allReports.length, pending: 0, review: 0, verified: 0, resolved: 0 };
      allReports.forEach(r => {
        const s = (r.status || r.report_status || '').toLowerCase();
        if (s.includes('pending') || s.includes('new')) counts.pending++;
        else if (s.includes('review')) counts.review++;
        else if (s.includes('verified')) counts.verified++;
        else if (s.includes('resolved')) counts.resolved++;
      });

      const cAll = document.getElementById('myRepCountAll');
      const cPend = document.getElementById('myRepCountPending');
      const cRev = document.getElementById('myRepCountReview');
      const cVer = document.getElementById('myRepCountVerified');
      const cRes = document.getElementById('myRepCountResolved');

      if (cAll) cAll.textContent = counts.all;
      if (cPend) cPend.textContent = counts.pending;
      if (cRev) cRev.textContent = counts.review;
      if (cVer) cVer.textContent = counts.verified;
      if (cRes) cRes.textContent = counts.resolved;

      if (allReports.length === 0) {
        myReportsStream.innerHTML = `
          <div style="text-align:center;padding:30px;color:var(--muted);">
            <div style="font-size:32px;margin-bottom:8px;">📋</div>
            <p>You haven't submitted any incident reports yet.</p>
            <button class="primary-btn compact" style="margin-top:12px;" onclick="document.getElementById('closeMyReportsBtn').click();window.openIncidentReportModal();">
              Report an Incident
            </button>
          </div>
        `;
        return;
      }

      myReportsStream.innerHTML = allReports.map(r => {
        const isOffline = r.sync_status === 'pending_sync';
        const statusClass = getStatusClass(r.status);
        const formattedDate = new Date(r.created_at).toLocaleString();
        const mediaCount = r.media?.length || r.media_count || r.files || 0;

        return `
          <div class="my-report-card" data-id="${r.id || r.client_report_id}" onclick="window.openIncidentDetail('${r.id || r.client_report_id}')">
            <div class="my-report-header">
              <span class="report-type-badge">${escapeHtml(r.incident_type || r.type || 'Incident')}</span>
              <span class="status-pill ${statusClass}">${escapeHtml(r.status || 'Pending Verification')}</span>
            </div>
            <p class="my-report-desc">${escapeHtml(r.description || '')}</p>
            <div class="my-report-meta">
              <span>📍 ${escapeHtml(r.district || '')}, ${escapeHtml(r.state || '')}</span>
              <span>🕒 ${formattedDate}</span>
              <span>📸 ${mediaCount} file(s)</span>
              ${r.ai_risk_class ? `<span class="ai-risk-tag">AI: ${r.ai_risk_class}</span>` : ''}
              ${isOffline ? '<span class="offline-tag">⚠️ Offline Draft</span>' : ''}
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      myReportsStream.innerHTML = `<p style="padding:20px;text-align:center;color:var(--danger);">${err.message}</p>`;
    }
  }

  function getStatusClass(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('verified')) return 'status-verified';
    if (s.includes('review')) return 'status-review';
    if (s.includes('resolved')) return 'status-resolved';
    if (s.includes('rejected')) return 'status-rejected';
    if (s.includes('duplicate')) return 'status-duplicate';
    if (s.includes('offline')) return 'status-offline';
    return 'status-pending';
  }

  // Open Detailed View
  window.openIncidentDetail = async (reportId) => {
    if (!incidentDetailModal) return;

    const content = document.getElementById('incidentDetailContent');
    const subtitle = document.getElementById('incidentDetailSubtitle');
    if (subtitle) subtitle.textContent = `Report ID: ${reportId}`;
    if (content) content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--muted);">Loading details...</p>';

    incidentDetailModal.classList.remove('hidden');

    try {
      const res = await window.Auth.apiFetch(`/api/incidents/${reportId}`);
      if (!res.success || !res.report) {
        if (content) content.innerHTML = '<p style="color:var(--danger);">Report details unavailable.</p>';
        return;
      }

      const r = res.report;
      const mediaList = r.media || [];
      const historyList = r.status_history || [];
      const isOwner = window.Auth && window.Auth.user && window.Auth.user.id === r.reporter_user_id;
      const canEdit = isOwner && (r.status === 'Pending Verification' || r.status === 'New' || r.report_status === 'pending_verification');

      content.innerHTML = `
        <div class="incident-detail-grid">
          <div>
            <span class="small-label">STATUS</span>
            <div style="margin-top:4px;"><span class="status-pill ${getStatusClass(r.status)}">${escapeHtml(r.status)}</span></div>
          </div>
          <div>
            <span class="small-label">SEVERITY REPORTED</span>
            <div style="font-weight:700;margin-top:4px;">${escapeHtml(r.severity_reported || r.priority || 'Medium')}</div>
          </div>
          <div>
            <span class="small-label">AI ENVIRONMENTAL RISK</span>
            <div style="margin-top:4px;">
              ${r.ai_risk_class ? `<strong>${r.ai_risk_class}</strong> (${Math.round((r.ai_risk_probability || 0) * 100)}%)` : '<em style="color:var(--muted);">AI risk data unavailable</em>'}
            </div>
          </div>
          <div>
            <span class="small-label">LOCATION</span>
            <div style="font-size:12px;margin-top:4px;">${escapeHtml(r.location || '')}</div>
          </div>
        </div>

        <div style="margin-top:14px;padding:12px;background:var(--surface-2);border-radius:8px;">
          <span class="small-label">DESCRIPTION</span>
          <p style="margin-top:6px;font-size:13px;line-height:1.5;">${escapeHtml(r.description || '')}</p>
        </div>

        ${r.verification_note ? `
          <div style="margin-top:12px;padding:12px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);border-radius:8px;">
            <span class="small-label" style="color:var(--accent);">OFFICIAL FIELD INSPECTION NOTE</span>
            <p style="margin-top:6px;font-size:12px;">${escapeHtml(r.verification_note)}</p>
          </div>
        ` : ''}

        <!-- Media Gallery -->
        <div style="margin-top:16px;">
          <span class="small-label">ATTACHED EVIDENCE (${mediaList.length})</span>
          <div class="detail-media-gallery" style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
            ${mediaList.map(m => `
              <a href="${m.storage_url}" target="_blank" rel="noopener" class="detail-media-thumb">
                ${m.media_type === 'photo' ? `<img src="${m.storage_url}" alt="${m.original_filename}" />` : `<div class="video-thumb">🎬 Video</div>`}
              </a>
            `).join('')}
            ${mediaList.length === 0 ? '<p style="font-size:12px;color:var(--muted);">No media attached.</p>' : ''}
          </div>
        </div>

        <!-- Status History Timeline -->
        <div style="margin-top:20px;">
          <span class="small-label">STATUS TIMELINE</span>
          <div class="timeline-stream" style="margin-top:10px;">
            ${historyList.map(h => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <strong>${escapeHtml(h.new_status)}</strong>
                  <p style="font-size:11px;color:var(--muted);">${escapeHtml(h.change_note || '')} · <small>${new Date(h.created_at).toLocaleString()}</small></p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        ${canEdit ? `
          <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px;">
            <button class="secondary-btn full" onclick="window.openEditIncident('${r.id}', '${escapeHtml(r.description || '')}')">✏️ Edit Report Details</button>
          </div>
        ` : ''}
      `;
    } catch (err) {
      if (content) content.innerHTML = `<p style="color:var(--danger);">${err.message}</p>`;
    }
  };

  // In-App Notifications Feed
  async function fetchNotifications() {
    if (!window.Auth || !window.Auth.isLoggedIn()) return;

    try {
      const res = await window.Auth.apiFetch('/api/incidents/notifications');
      if (res.success) {
        if (notifBadge) {
          notifBadge.textContent = res.unreadCount;
          notifBadge.classList.toggle('hidden', res.unreadCount === 0);
        }

        if (notificationsList) {
          if (res.notifications.length === 0) {
            notificationsList.innerHTML = '<p style="padding:15px;color:var(--muted);text-align:center;">No notifications yet.</p>';
          } else {
            notificationsList.innerHTML = res.notifications.map(n => `
              <div class="notif-item ${n.is_read ? 'read' : 'unread'}" onclick="window.markNotifAsRead('${n.id}')">
                <div class="notif-title"><strong>${escapeHtml(n.title)}</strong></div>
                <div class="notif-msg">${escapeHtml(n.message)}</div>
                <div class="notif-time">${new Date(n.created_at).toLocaleString()}</div>
              </div>
            `).join('');
          }
        }
      }
    } catch {}
  }

  window.markNotifAsRead = async (id) => {
    if (!window.Auth) return;
    await window.Auth.apiFetch(`/api/incidents/notifications/${id}/read`, { method: 'PATCH' });
    fetchNotifications();
  };

  // Setup Event Listeners
  const openReportBtn = document.getElementById('openReportBtn');
  if (openReportBtn) openReportBtn.addEventListener('click', openReportModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeReportModal);
  if (reportModalBackdrop) reportModalBackdrop.addEventListener('click', closeReportModal);

  if (openMyReportsBtn) {
    openMyReportsBtn.addEventListener('click', () => {
      if (myReportsModal) {
        myReportsModal.classList.remove('hidden');
        loadMyReports('all');
      }
    });
  }

  if (closeMyReportsBtn && myReportsModal) {
    closeMyReportsBtn.addEventListener('click', () => myReportsModal.classList.add('hidden'));
    myReportsBackdrop?.addEventListener('click', () => myReportsModal.classList.add('hidden'));
  }

  if (openNotifBtn && notificationsModal) {
    openNotifBtn.addEventListener('click', () => {
      notificationsModal.classList.remove('hidden');
      fetchNotifications();
    });
  }

  if (closeNotifBtn && notificationsModal) {
    closeNotifBtn.addEventListener('click', () => notificationsModal.classList.add('hidden'));
    notifBackdrop?.addEventListener('click', () => notificationsModal.classList.add('hidden'));
  }

  if (closeIncidentDetailBtn && incidentDetailModal) {
    closeIncidentDetailBtn.addEventListener('click', () => incidentDetailModal.classList.add('hidden'));
    incidentDetailBackdrop?.addEventListener('click', () => incidentDetailModal.classList.add('hidden'));
  }

  // Filter tabs for My Reports
  const myReportFilterTabs = document.querySelectorAll('#myReportsFilterBar .status-filter-tab');
  myReportFilterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      myReportFilterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadMyReports(tab.dataset.filter);
    });
  });

  // Manual Retry Sync Button
  const retrySyncBtn = document.getElementById('retrySyncBtn');
  if (retrySyncBtn && window.OfflineStore) {
    retrySyncBtn.addEventListener('click', async () => {
      retrySyncBtn.disabled = true;
      retrySyncBtn.textContent = 'Syncing...';
      await window.OfflineStore.syncAllOfflineReports();
      retrySyncBtn.disabled = false;
      retrySyncBtn.textContent = 'Sync Now';
    });
  }

  // Global triggers
  window.openIncidentReportModal = openReportModal;
  window.refreshCitizenReportsPanel = () => {
    loadMyReports();
    fetchNotifications();
  };

  // Initial load
  fetchNotifications();
  if (window.OfflineStore) window.OfflineStore.notifySubscribers();
})();
