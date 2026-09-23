/**
 * NEXZORA — Field Officer & Admin Web Dashboard Controller
 * Handles operational KPI summaries, GIS layers, emergency priority ranking,
 * road status modifications, and Admin SMS/Push alert approval dispatches.
 */

const Dashboard = (() => {
  let activeDistrict = 'East Khasi Hills';
  let currentAlertId = null;

  async function init() {
    if (!window.Auth || !window.Auth.isLoggedIn()) return;
    const user = window.Auth.getUser();
    if (!user || !['field_officer', 'admin'].includes(user.role)) return;

    setupDistrictSelector(user);
    startHeaderClock();
    await loadAllDashboardData();
  }

  function setupDistrictSelector(user) {
    const select = document.getElementById('dashDistrictSelector');
    if (!select) return;

    if (user.role === 'field_officer') {
      const assigned = user.district || 'East Khasi Hills';
      select.innerHTML = `<option value="${assigned}">${assigned} (Assigned Jurisdiction)</option>`;
      select.disabled = true;
      activeDistrict = assigned;
    } else {
      select.disabled = false;
      select.addEventListener('change', (e) => {
        activeDistrict = e.target.value;
        loadAllDashboardData();
      });
    }
  }

  function startHeaderClock() {
    const clockEl = document.getElementById('dashHeaderClock');
    if (!clockEl) return;
    setInterval(() => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
    }, 1000);
  }

  async function loadAllDashboardData() {
    await Promise.all([
      loadSummaryKPIs(),
      loadEnvironmentalData(),
      loadEmergencyPriorities(),
      loadIncidentQueue(),
      loadRoadConnectivity()
    ]);
  }

  async function loadSummaryKPIs() {
    try {
      const res = await window.Auth.apiFetch(`/api/dashboard/summary?district=${encodeURIComponent(activeDistrict)}`);
      if (!res.success) return;

      const s = res.summary;
      setElementText('kpiHighRiskRoads', s.highRiskRoads);
      setElementText('kpiBlockedRoads', s.roadsBlocked);
      setElementText('kpiPartiallyBlockedRoads', s.roadsPartiallyBlocked);
      setElementText('kpiNewReports', s.newCitizenReports);
      setElementText('kpiPendingVerification', s.pendingVerificationReports);
      setElementText('kpiVerifiedReports', s.verifiedFieldReports);
      setElementText('kpiHeavyRainfall', s.heavyRainfallAreas);
      setElementText('kpiActiveAlerts', s.activeAlerts);
      setElementText('kpiAlertsWaitingApproval', s.alertsWaitingApproval);

      // Freshness badges
      if (res.freshness) {
        setElementText('freshnessRainfallTag', res.freshness.rainfall.text);
        setElementText('freshnessSoilTag', res.freshness.soilMoisture.text);
      }
    } catch (err) {
      console.warn('[Dashboard] Summary fetch note:', err.message);
    }
  }

  async function loadEnvironmentalData() {
    try {
      const res = await window.Auth.apiFetch(`/api/dashboard/environment?district=${encodeURIComponent(activeDistrict)}`);
      if (!res.success) return;

      const env = res.environment;
      setElementText('envStationName', env.stationName);
      setElementText('envRainRate', `${env.currentRainfallRate_mmh} mm/h`);
      setElementText('envRain1d', `${env.rainfall_1d_mm} mm`);
      setElementText('envRain3d', `${env.rainfall_3d_mm} mm`);
      setElementText('envRain7d', `${env.rainfall_7d_mm} mm`);
      setElementText('envSoilMoisture', `${env.volumetricSoilMoisturePct}% (${env.soilMoistureStatus})`);
    } catch (err) {
      console.warn('[Dashboard] Environment fetch note:', err.message);
    }
  }

  async function loadEmergencyPriorities() {
    const listEl = document.getElementById('emergencyPriorityList');
    if (!listEl) return;

    try {
      const res = await window.Auth.apiFetch(`/api/dashboard/emergency-priorities?district=${encodeURIComponent(activeDistrict)}`);
      if (!res.success || !res.priorities) return;

      if (res.priorities.length === 0) {
        listEl.innerHTML = '<div class="empty-state">No immediate high-priority hazards active in this district.</div>';
        return;
      }

      listEl.innerHTML = res.priorities.map(p => `
        <div class="priority-card priority-${p.priorityClass.toLowerCase()}">
          <div class="priority-header">
            <span class="prio-badge badge-${p.priorityClass.toLowerCase()}">${p.priorityClass.toUpperCase()} (Score: ${p.priorityScore})</span>
            <strong>${p.location}</strong>
          </div>
          <ul class="priority-factors">
            ${p.factors.map(f => `<li>• ${f}</li>`).join('')}
          </ul>
          <div class="priority-action">
            <span class="action-label">Recommended Action:</span> ${p.recommendedAction}
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('[Dashboard] Priorities fetch note:', err.message);
    }
  }

  async function loadIncidentQueue() {
    const queueEl = document.getElementById('dashIncidentQueueTable');
    if (!queueEl) return;

    try {
      const res = await window.Auth.apiFetch(`/api/field-officer/incidents?district=${encodeURIComponent(activeDistrict)}`);
      if (!res.success || !res.reports) return;

      const reports = res.reports;
      if (reports.length === 0) {
        queueEl.innerHTML = '<tr><td colspan="7" class="text-center p-4">No incident reports recorded in this district.</td></tr>';
        return;
      }

      queueEl.innerHTML = reports.slice(0, 10).map(r => `
        <tr>
          <td><code>${r.id.substring(0, 8)}</code></td>
          <td><strong>${r.type || r.incident_type || 'Landslide'}</strong></td>
          <td><span class="severity-badge badge-${(r.priority || r.severity_reported || 'medium').toLowerCase()}">${r.priority || r.severity_reported || 'Medium'}</span></td>
          <td>${r.location || r.district}</td>
          <td><span class="status-pill status-${(r.status || 'new').toLowerCase().replace(/\s+/g, '-')}">${r.status || 'Pending Verification'}</span></td>
          <td>${new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>
            <button class="btn btn-xs btn-primary" onclick="Dashboard.openVerifyModal('${r.id}')">Inspect</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.warn('[Dashboard] Incident queue fetch note:', err.message);
    }
  }

  async function loadRoadConnectivity() {
    const roadListEl = document.getElementById('dashRoadList');
    if (!roadListEl) return;

    try {
      const res = await window.Auth.apiFetch(`/api/dashboard/map-layers?district=${encodeURIComponent(activeDistrict)}`);
      if (!res.success || !res.layers || !res.layers.roads) return;

      roadListEl.innerHTML = res.layers.roads.map(rd => `
        <div class="road-item">
          <div class="road-name-row">
            <strong>${rd.name}</strong>
            <span class="road-status-tag status-${rd.status.toLowerCase().replace(/\s+/g, '-')}">${rd.status}</span>
          </div>
          <div class="road-meta">
            <span>Risk Score: <strong>${rd.risk_score}/100</strong></span>
            <span>District: ${rd.district}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('[Dashboard] Road status fetch note:', err.message);
    }
  }

  /**
   * SMS Alert Approval Modal (Feature C)
   */
  async function openSmsAlertModal(alertId) {
    currentAlertId = alertId;
    const modal = document.getElementById('smsAlertApprovalModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    try {
      const res = await window.Auth.apiFetch(`/api/admin/alerts/${alertId}/recipients`);
      if (!res.success) {
        if (typeof window.showToast === 'function') window.showToast(res.error, 'error');
        return;
      }

      setElementText('smsModalDistrict', res.district);
      setElementText('smsCountTotal', res.counts.total);
      setElementText('smsCountCitizens', res.counts.citizens);
      setElementText('smsCountOfficers', res.counts.field_officers);
      setElementText('smsCountPolice', res.counts.police);
      setElementText('smsCountPRI', res.counts.pri_representatives);
      setElementText('smsCountPWD', res.counts.pwd_teams);
      setElementText('smsCountDisaster', res.counts.disaster_offices);

      // Render Multilingual SMS Previews
      if (res.smsPreviews) {
        window._currentSmsPreviews = res.smsPreviews;
        switchSmsPreviewLanguage('en');
      }
    } catch (err) {
      console.warn('[Dashboard] SMS modal error:', err.message);
    }
  }

  function switchSmsPreviewLanguage(lang) {
    const textEl = document.getElementById('smsPreviewText');
    const charCountEl = document.getElementById('smsCharCount');
    if (!textEl || !window._currentSmsPreviews) return;

    const msg = window._currentSmsPreviews[lang] || window._currentSmsPreviews.en || '';
    textEl.textContent = msg;
    if (charCountEl) {
      charCountEl.textContent = `${msg.length} characters (1 SMS segment)`;
    }

    document.querySelectorAll('.sms-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
  }

  async function confirmSendSmsBroadcast() {
    if (!currentAlertId) return;

    const btn = document.getElementById('btnConfirmSmsBroadcast');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-small"></span> Dispatching SMS Broadcast...`;
    }

    try {
      const res = await window.Auth.apiFetch(`/api/admin/alerts/${currentAlertId}/send-sms`, {
        method: 'POST',
        body: JSON.stringify({ allow_cooldown_override: true })
      });

      if (res.success) {
        if (typeof window.showToast === 'function') {
          window.showToast(`✅ SMS Broadcast initiated: ${res.sentCount} recipients targeted (${res.provider}).`, 'success');
        }
        closeSmsAlertModal();
        loadSummaryKPIs();
      } else {
        if (typeof window.showToast === 'function') {
          window.showToast(`❌ SMS Dispatch Error: ${res.error}`, 'error');
        }
      }
    } catch (err) {
      if (typeof window.showToast === 'function') {
        window.showToast(`❌ Error: ${err.message}`, 'error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `📢 Confirm & Send SMS Broadcast`;
      }
    }
  }

  function closeSmsAlertModal() {
    const modal = document.getElementById('smsAlertApprovalModal');
    if (modal) modal.classList.add('hidden');
    currentAlertId = null;
  }

  function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text !== undefined && text !== null ? text : '-';
  }

  return {
    init,
    loadAllDashboardData,
    openSmsAlertModal,
    closeSmsAlertModal,
    switchSmsPreviewLanguage,
    confirmSendSmsBroadcast
  };
})();

window.Dashboard = Dashboard;
