/**
 * NEXZORA — Client Authentication & RBAC State Manager
 * Handles user session persistence, API communication with JWT tokens,
 * role authorization checks, and reactive UI subscriber events.
 */

const Auth = {
  user: null,
  token: null,
  listeners: [],

  // Initialize and check current session
  async init() {
    this.token = localStorage.getItem('nexzora_access_token');
    const storedUser = localStorage.getItem('nexzora_user');
    if (storedUser) {
      try {
        this.user = JSON.parse(storedUser);
      } catch {
        this.user = null;
      }
    }

    if (this.token) {
      try {
        const res = await this.apiFetch('/api/auth/me');
        if (res.success && res.user) {
          this.user = res.user;
          localStorage.setItem('nexzora_user', JSON.stringify(this.user));
        }
      } catch (err) {
        console.warn('[Auth] Session check failed, clearing token:', err.message);
        this.logout(false);
      }
    }

    this.notify();
    return this.user;
  },

  subscribe(listener) {
    this.listeners.push(listener);
    listener(this.user);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notify() {
    this.listeners.forEach(fn => fn(this.user));
  },

  isLoggedIn() {
    return !!this.user && this.user.account_status !== 'suspended';
  },

  getRole() {
    return this.user ? this.user.role : 'guest';
  },

  hasRole(...roles) {
    if (!this.user) return false;
    return roles.includes(this.user.role);
  },

  isActive() {
    return this.user && this.user.account_status === 'active';
  },

  isPendingOfficer() {
    return this.user && this.user.role === 'field_officer' && this.user.account_status === 'pending_verification';
  },

  can(action) {
    if (!this.user) return false;
    const role = this.user.role;
    const active = this.user.account_status === 'active';

    switch (action) {
      case 'report_incident':
      case 'view_map':
      case 'view_alerts':
      case 'view_my_reports':
        return active;

      case 'verify_reports':
      case 'update_road_status':
      case 'view_field_dashboard':
        return (role === 'field_officer' || role === 'admin') && active;

      case 'manage_users':
      case 'approve_officers':
      case 'assign_districts':
      case 'approve_alerts':
      case 'view_audit_logs':
      case 'manage_system':
        return role === 'admin' && active;

      default:
        return false;
    }
  },

  async apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers
    });

    const data = await res.json().catch(() => ({ success: false, error: 'Network response error' }));

    if (res.status === 401) {
      // If token expired, clear and notify
      if (this.token) {
        this.token = null;
        this.user = null;
        localStorage.removeItem('nexzora_access_token');
        localStorage.removeItem('nexzora_user');
        this.notify();
      }
    }

    if (!res.ok && !data.error) {
      data.error = `HTTP Error ${res.status}`;
    }

    return data;
  },

  async login(identifier, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw data;
    }

    this.token = data.tokens.accessToken;
    this.user = data.user;
    localStorage.setItem('nexzora_access_token', this.token);
    localStorage.setItem('nexzora_user', JSON.stringify(this.user));
    if (data.tokens.refreshToken) {
      localStorage.setItem('nexzora_refresh_token', data.tokens.refreshToken);
    }

    this.notify();
    return data;
  },

  async register(formData) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw data;
    }
    return data;
  },

  async verifyOtp(mobileNumber, otpCode) {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile_number: mobileNumber, otp_code: otpCode })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw data;
    }

    if (data.tokens && data.user) {
      this.token = data.tokens.accessToken;
      this.user = data.user;
      localStorage.setItem('nexzora_access_token', this.token);
      localStorage.setItem('nexzora_user', JSON.stringify(this.user));
      this.notify();
    }
    return data;
  },

  async resendOtp(mobileNumber) {
    const res = await fetch('/api/auth/resend-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile_number: mobileNumber })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw data;
    return data;
  },

  async logout(callBackend = true) {
    if (callBackend && this.token) {
      try {
        await this.apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore logout errors
      }
    }

    this.token = null;
    this.user = null;
    localStorage.removeItem('nexzora_access_token');
    localStorage.removeItem('nexzora_user');
    localStorage.removeItem('nexzora_refresh_token');
    this.notify();
  },

  async forgotPassword(identifier) {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw data;
    return data;
  },

  async resetPassword(payload) {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw data;
    return data;
  },

  async updateProfile(fields) {
    const res = await this.apiFetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(fields)
    });
    if (res.success && res.user) {
      this.user = { ...this.user, ...res.user };
      localStorage.setItem('nexzora_user', JSON.stringify(this.user));
      this.notify();
    }
    return res;
  },

  async changePassword(currentPassword, newPassword, confirmPassword) {
    return await this.apiFetch('/api/users/me/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });
  }
};

window.Auth = Auth;
