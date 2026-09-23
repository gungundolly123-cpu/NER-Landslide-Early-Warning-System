/**
 * NEXZORA — Disaster Alert Management & Push Notification Client
 * Handles browser notification permissions, device token registration,
 * multilingual alert rendering, citizen alert inbox, and admin approval queue.
 */

window.AlertSystem = (function () {
  let activeAlerts = [];
  let currentPreferences = {
    preferred_language: 'en',
    receive_push_alerts: 1,
    subscribed_district: 'Kamrup Metropolitan'
  };

  /**
   * Initialize alert system on page load
   */
  async function init() {
    setupEventListeners();
    await fetchActiveAlerts();
    if (window.Auth && window.Auth.currentUser) {
      await loadPreferences();
    }
  }

  /**
   * Request browser notification permission with explanatory prompt
   */
  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return false;
    }

    if (Notification.permission === 'granted') {
      await registerBrowserPushToken('browser-push-token-' + (window.Auth?.currentUser?.id || 'demo') + '-' + Date.now());
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await registerBrowserPushToken('browser-push-token-' + (window.Auth?.currentUser?.id || 'demo') + '-' + Date.now());
        showInAppNotice('✅ Push notifications enabled for landslide warnings.', 'success');
        return true;
      }
    }

    return false;
  }

  /**
   * Register simulated or live FCM push token with backend
   */
  async function registerBrowserPushToken(token) {
    if (!window.Auth?.currentUser) return;
    try {
      await fetch('/api/notifications/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.Auth.getAccessToken()}`
        },
        body: JSON.stringify({
          token,
          platform: 'web',
          app_version: '2.1.0',
          permission: 'granted'
        })
      });
    } catch (err) {
      console.warn('[Push Registration Error]', err);
    }
  }

  /**
   * Fetch active approved alerts for public banner & map
   */
  async function fetchActiveAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();
      activeAlerts = data.alerts || [];
      renderActiveAlertBanner();
    } catch (err) {
      console.warn('[Fetch Alerts Error]', err);
    }
  }

  /**
   * Render top emergency alert banner on HUD
   */
  function renderActiveAlertBanner() {
    const banner = document.getElementById('activeEmergencyAlertBanner');
    if (!banner) return;

    const criticalAlerts = activeAlerts.filter(a => a.alert_status === 'sent' || a.status === 'Approved');
    if (criticalAlerts.length === 0) {
      banner.classList.add('hidden');
      return;
    }

    const latest = criticalAlerts[0];
    const riskBadgeClass = (latest.risk_class || latest.severity || 'high').toLowerCase();

    banner.className = `emergency-alert-banner alert-risk-${riskBadgeClass}`;
    banner.innerHTML = `
      <div class="banner-inner">
        <div class="banner-left">
          <span class="banner-beacon">🚨</span>
          <div>
            <strong>${escapeHtml(latest.title)}</strong>
            <p>${escapeHtml(latest.target_district || 'NER Sector')} · Valid until: ${new Date(latest.valid_until || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
        <div class="banner-right">
          <button class="banner-btn" onclick="window.AlertSystem.openAlertDetail('${latest.id}')">View Warning Details →</button>
          <button class="banner-close" onclick="document.getElementById('activeEmergencyAlertBanner').classList.add('hidden')">✕</button>
        </div>
      </div>
    `;
    banner.classList.remove('hidden');
  }

  /**
   * Load user notification preferences
   */
  async function loadPreferences() {
    if (!window.Auth?.currentUser) return;
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'Authorization': `Bearer ${window.Auth.getAccessToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentPreferences = data.preferences || currentPreferences;
        populatePreferencesForm();
      }
    } catch (err) {
      console.warn('[Load Preferences Error]', err);
    }
  }

  function populatePreferencesForm() {
    const langSel = document.getElementById('notifPrefLanguage');
    const distInp = document.getElementById('notifPrefDistrict');
    const pushCheck = document.getElementById('notifPrefPush');
    const smsCheck = document.getElementById('notifPrefSms');

    if (langSel) langSel.value = currentPreferences.preferred_language || 'en';
    if (distInp) distInp.value = currentPreferences.subscribed_district || 'Kamrup Metropolitan';
    if (pushCheck) pushCheck.checked = currentPreferences.receive_push_alerts === 1;
    if (smsCheck) smsCheck.checked = currentPreferences.receive_sms_alerts === 1;
  }

  /**
   * Open Alerts Inbox Modal
   */
  async function openAlertsInbox() {
    const modal = document.getElementById('alertsInboxModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    const stream = document.getElementById('alertsInboxStream');
    if (stream) {
      stream.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">Loading disaster alerts...</p>';
    }

    try {
      const url = window.Auth?.currentUser ? '/api/alerts/my-alerts' : '/api/alerts';
      const headers = window.Auth?.currentUser ? { 'Authorization': `Bearer ${window.Auth.getAccessToken()}` } : {};
      const res = await fetch(url, { headers });
      const data = await res.json();
      const alerts = data.alerts || [];

      if (alerts.length === 0) {
        stream.innerHTML = '<p style="padding:25px;text-align:center;color:var(--muted);">No active landslide warnings in your area at this time.</p>';
        return;
      }

      stream.innerHTML = alerts.map(a => {
        const title = a.localized_title || a.title;
        const msg = a.localized_message || a.message;
        const risk = (a.risk_class || a.severity || 'High').toUpperCase();
        return `
          <div class="alert-inbox-card level-${risk.toLowerCase()}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span class="risk-badge badge-${risk.toLowerCase()}">⚠️ ${risk} RISK</span>
              <span style="font-size:11px;color:var(--muted);">${new Date(a.created_at).toLocaleDateString()} ${new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <h4 style="font-size:13px;font-weight:700;margin-bottom:4px;color:var(--text);">${escapeHtml(title)}</h4>
            <p style="font-size:11.5px;color:var(--muted);line-height:1.4;white-space:pre-line;">${escapeHtml(msg.slice(0, 200))}${msg.length > 200 ? '...' : ''}</p>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
              <span style="font-size:10.5px;color:var(--accent);">📍 ${escapeHtml(a.target_district || 'NER')}</span>
              <button class="secondary-btn compact" onclick="window.AlertSystem.openAlertDetail('${a.id}')">View Guidance →</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      if (stream) stream.innerHTML = '<p style="padding:20px;text-align:center;color:var(--danger);">Failed to load alerts.</p>';
    }
  }

  /**
   * Open single alert detail modal with language switcher
   */
  async function openAlertDetail(alertId) {
    const modal = document.getElementById('alertDetailModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    const content = document.getElementById('alertDetailContent');
    content.innerHTML = '<p style="padding:20px;text-align:center;color:var(--muted);">Loading warning details...</p>';

    try {
      const res = await fetch(`/api/alerts/${alertId}`);
      if (!res.ok) throw new Error('Alert not found');
      const data = await res.json();
      const alert = data.alert;
      const translations = alert.translations || [];

      renderAlertDetailBody(alert, translations, currentPreferences.preferred_language || 'en');
    } catch (err) {
      content.innerHTML = `<p style="padding:20px;text-align:center;color:var(--danger);">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderAlertDetailBody(alert, translations, activeLang) {
    const content = document.getElementById('alertDetailContent');
    if (!content) return;

    const transMap = {};
    translations.forEach(t => { transMap[t.language_code] = t; });
    const current = transMap[activeLang] || transMap['en'] || { title: alert.title, message: alert.message, precautions: alert.precautions };
    const risk = (alert.risk_class || alert.severity || 'High').toUpperCase();

    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span class="risk-badge badge-${risk.toLowerCase()}" style="font-size:12px;padding:4px 10px;">⚠️ ${risk} LANDSLIDE RISK</span>
        <div class="lang-switcher-pills">
          <button class="lang-tab ${activeLang === 'en' ? 'active' : ''}" onclick="window.AlertSystem.switchDetailLang('${alert.id}', 'en')">EN</button>
          <button class="lang-tab ${activeLang === 'hi' ? 'active' : ''}" onclick="window.AlertSystem.switchDetailLang('${alert.id}', 'hi')">हिन्दी</button>
          <button class="lang-tab ${activeLang === 'as' ? 'active' : ''}" onclick="window.AlertSystem.switchDetailLang('${alert.id}', 'as')">অসমীয়া</button>
          <button class="lang-tab ${activeLang === 'bn' ? 'active' : ''}" onclick="window.AlertSystem.switchDetailLang('${alert.id}', 'bn')">বাংলা</button>
        </div>
      </div>

      <h3 style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:8px;">${escapeHtml(current.title)}</h3>

      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;line-height:1.5;white-space:pre-line;">
        ${escapeHtml(current.message)}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:11px;margin-bottom:12px;background:rgba(255,255,255,0.02);padding:10px;border-radius:6px;">
        <div><strong>District:</strong> ${escapeHtml(alert.target_district || 'NER')}</div>
        <div><strong>Issued At:</strong> ${new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div><strong>Valid Until:</strong> ${new Date(alert.valid_until || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        <div><strong>Authorization:</strong> Authorized Admin Alert</div>
      </div>

      ${alert.precautions ? `
        <div style="background:rgba(0,240,255,0.06);border-left:3px solid var(--accent);padding:10px 12px;border-radius:4px;font-size:11.5px;margin-bottom:12px;">
          <strong style="color:var(--accent);">🛡️ Recommended Safety Guidance:</strong>
          <p style="margin-top:4px;color:var(--text);">${escapeHtml(current.precautions || alert.precautions)}</p>
        </div>
      ` : ''}

      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="primary-btn" style="flex:1;" onclick="window.AlertSystem.focusAlertLocation('${alert.target_district}')">🗺️ Focus on Risk Map</button>
        <button class="secondary-btn" style="flex:1;" onclick="window.ReportSystem?.openModal(); document.getElementById('alertDetailModal').classList.add('hidden');">🚨 Report Incident</button>
      </div>
    `;
  }

  function switchDetailLang(alertId, lang) {
    currentPreferences.preferred_language = lang;
    openAlertDetail(alertId);
  }

  function focusAlertLocation(district) {
    const modal = document.getElementById('alertDetailModal');
    if (modal) modal.classList.add('hidden');
    if (window.focusDistrict) {
      window.focusDistrict(district);
    }
  }

  /**
   * Admin Alert Approval Queue Loader
   */
  async function loadAdminPendingAlerts() {
    const container = document.getElementById('adminPendingAlertsList');
    if (!container) return;

    container.innerHTML = '<p style="padding:15px;color:var(--muted);text-align:center;">Loading pending alerts for review...</p>';

    try {
      const res = await fetch('/api/admin/alerts/pending', {
        headers: { 'Authorization': `Bearer ${window.Auth.getAccessToken()}` }
      });
      if (!res.ok) throw new Error('Failed to load pending alerts');
      const data = await res.json();
      const pending = data.pendingAlerts || [];

      const badge = document.getElementById('adminPendingAlertsBadge');
      if (badge) badge.textContent = pending.length;

      if (pending.length === 0) {
        container.innerHTML = '<div style="padding:25px;text-align:center;color:var(--muted);"><div style="font-size:24px;margin-bottom:6px;">✅</div>All suggested alerts have been reviewed. No pending approvals in queue.</div>';
        return;
      }

      container.innerHTML = pending.map(a => {
        const isFresh = a.data_completeness_status === 'complete';
        const recipientEst = a.recipient_estimate ? a.recipient_estimate.totalEstimated : '--';
        const risk = (a.risk_class || a.severity || 'High').toUpperCase();

        return `
          <div class="admin-alert-review-card" id="alertCard_${a.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
              <div>
                <span class="risk-badge badge-${risk.toLowerCase()}">⚠️ ${risk} RISK</span>
                <span style="font-weight:700;font-size:13px;margin-left:6px;color:var(--text);">${escapeHtml(a.title)}</span>
              </div>
              <span class="freshness-tag ${isFresh ? 'tag-fresh' : 'tag-stale'}">
                ${isFresh ? '🟢 Telemetry Fresh' : '⚠️ ' + a.data_completeness_status}
              </span>
            </div>

            <div style="font-size:11.5px;color:var(--muted);line-height:1.4;margin-bottom:8px;">
              <strong>District:</strong> ${escapeHtml(a.target_district)} · 
              <strong>Target Audience:</strong> ~${recipientEst} registered citizens/officers ·
              <strong>Model Confidence:</strong> ${Math.round((a.risk_probability || 0.85) * 100)}%
            </div>

            <p style="font-size:11.5px;background:rgba(255,255,255,0.03);padding:8px 10px;border-radius:6px;margin:6px 0;color:#cbd5e1;">
              "${escapeHtml(a.message.slice(0, 160))}${a.message.length > 160 ? '...' : ''}"
            </p>

            <div style="display:flex;gap:8px;margin-top:10px;justify-content:flex-end;flex-wrap:wrap;">
              <button class="secondary-btn compact" onclick="window.AlertSystem.openAlertDetail('${a.id}')">Preview Languages</button>
              <button class="danger-btn compact" onclick="window.AlertSystem.promptRejectAlert('${a.id}')">✕ Reject Alert</button>
              <button class="primary-btn compact" onclick="window.AlertSystem.promptApproveAlert('${a.id}', '${escapeHtml(a.target_district)}', ${recipientEst})">✓ Approve &amp; Broadcast</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `<p style="padding:15px;color:var(--danger);text-align:center;">${escapeHtml(err.message)}</p>`;
    }
  }

  /**
   * Admin Approve Prompt with Confirmation
   */
  async function promptApproveAlert(alertId, district, recipientCount) {
    const confirmMsg = `Are you sure you want to approve and send this landslide-risk emergency alert to approximately ${recipientCount} recipients in ${district}?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.Auth.getAccessToken()}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve alert');

      alert(`✅ Alert approved! Dispatched to ${data.deliverySummary ? data.deliverySummary.sentCount : recipientCount} recipients.`);
      await loadAdminPendingAlerts();
      await fetchActiveAlerts();
    } catch (err) {
      alert(`❌ Approval Error: ${err.message}`);
    }
  }

  /**
   * Admin Reject Prompt with Reason
   */
  async function promptRejectAlert(alertId) {
    const reason = prompt('Please enter the mandatory reason for rejecting this alert draft:');
    if (!reason || !reason.trim()) {
      alert('Rejection cancelled: A valid reason is required.');
      return;
    }

    try {
      const res = await fetch(`/api/admin/alerts/${alertId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.Auth.getAccessToken()}`
        },
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reject alert');

      alert('Alert draft has been rejected and logged.');
      await loadAdminPendingAlerts();
    } catch (err) {
      alert(`❌ Rejection Error: ${err.message}`);
    }
  }

  /**
   * Field Officer Recommend Alert Submission
   */
  async function submitOfficerAlertRecommendation(payload) {
    try {
      const res = await fetch('/api/field-officer/alerts/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.Auth.getAccessToken()}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit recommendation');
      return data;
    } catch (err) {
      throw err;
    }
  }

  function setupEventListeners() {
    // Open Preferences Modal
    const openPrefBtn = document.getElementById('openNotifPrefBtn');
    if (openPrefBtn) {
      openPrefBtn.addEventListener('click', () => {
        const modal = document.getElementById('notifPreferencesModal');
        if (modal) modal.classList.remove('hidden');
      });
    }

    // Close Preferences Modal
    const closePrefBtn = document.getElementById('closeNotifPrefBtn');
    if (closePrefBtn) {
      closePrefBtn.addEventListener('click', () => {
        const modal = document.getElementById('notifPreferencesModal');
        if (modal) modal.classList.add('hidden');
      });
    }

    // Save Preferences Form
    const prefForm = document.getElementById('notifPreferencesForm');
    if (prefForm) {
      prefForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const lang = document.getElementById('notifPrefLanguage')?.value || 'en';
        const dist = document.getElementById('notifPrefDistrict')?.value || 'Kamrup Metropolitan';
        const push = document.getElementById('notifPrefPush')?.checked;
        const msgEl = document.getElementById('notifPrefMessage');

        try {
          const res = await fetch('/api/notifications/preferences', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${window.Auth.getAccessToken()}`
            },
            body: JSON.stringify({
              preferred_language: lang,
              subscribed_district: dist,
              receive_push_alerts: push
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          currentPreferences = data.preferences;
          if (msgEl) {
            msgEl.className = 'submit-message success';
            msgEl.textContent = '✅ Notification preferences saved.';
          }
          if (push) {
            await requestNotificationPermission();
          }
          setTimeout(() => {
            document.getElementById('notifPreferencesModal')?.classList.add('hidden');
          }, 1000);
        } catch (err) {
          if (msgEl) {
            msgEl.className = 'submit-message error';
            msgEl.textContent = `❌ ${err.message}`;
          }
        }
      });
    }

    // Open Alerts Inbox from top button
    const openInboxBtn = document.getElementById('openAlertsInboxBtn');
    if (openInboxBtn) {
      openInboxBtn.addEventListener('click', openAlertsInbox);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showInAppNotice(msg, type = 'info') {
    const el = document.getElementById('inAppNoticeToast');
    if (el) {
      el.className = `in-app-toast toast-${type}`;
      el.textContent = msg;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 4000);
    }
  }

  return {
    init,
    requestNotificationPermission,
    fetchActiveAlerts,
    openAlertsInbox,
    openAlertDetail,
    switchDetailLang,
    focusAlertLocation,
    loadAdminPendingAlerts,
    promptApproveAlert,
    promptRejectAlert,
    submitOfficerAlertRecommendation
  };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.AlertSystem) window.AlertSystem.init();
});
