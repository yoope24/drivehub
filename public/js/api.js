/**
 * DriveHub API Client
 * Centralized fetch wrapper with authentication handling and error normalization
 */

const API = {
  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    const token = localStorage.getItem('drivehub_token');
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(endpoint, config);

      if (response.status === 401) {
        // Unauthorized
        if (!window.location.pathname.endsWith('login.html')) {
          localStorage.removeItem('drivehub_token');
          localStorage.removeItem('drivehub_user');
          window.location.href = '/login.html';
        }
        throw new Error('Please log in to continue.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'An error occurred during request.');
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Auth Endpoints
  async login(username, password) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });
    if (data.token) {
      localStorage.setItem('drivehub_token', data.token);
      localStorage.setItem('drivehub_user', JSON.stringify(data.user));
    }
    return data;
  },

  async logout() {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore logout network errors
    }
    localStorage.removeItem('drivehub_token');
    localStorage.removeItem('drivehub_user');
    window.location.href = '/login.html';
  },

  async getMe() {
    return await this.request('/api/auth/me', { method: 'GET' });
  },

  async register(userData) {
    const data = await this.request('/api/auth/register', {
      method: 'POST',
      body: userData
    });
    if (data.token) {
      localStorage.setItem('drivehub_token', data.token);
      localStorage.setItem('drivehub_user', JSON.stringify(data.user));
    }
    return data;
  },

  // Folder Endpoints
  async getFolders() {
    return await this.request('/api/folders', { method: 'GET' });
  },

  async getFolder(id) {
    return await this.request(`/api/folders/${id}`, { method: 'GET' });
  },

  async createFolder(folderData) {
    return await this.request('/api/folders', {
      method: 'POST',
      body: folderData
    });
  },

  async updateFolder(id, folderData) {
    return await this.request(`/api/folders/${id}`, {
      method: 'PUT',
      body: folderData
    });
  },

  async deleteFolder(id) {
    return await this.request(`/api/folders/${id}`, {
      method: 'DELETE'
    });
  },

  // Card Endpoints
  async getCards(params = {}) {
    const searchParams = new URLSearchParams();
    if (params.folder_id) searchParams.append('folder_id', params.folder_id);
    if (params.search) searchParams.append('search', params.search);
    if (params.starred) searchParams.append('starred', params.starred);
    if (params.type && params.type !== 'all') searchParams.append('type', params.type);

    const qs = searchParams.toString();
    const url = `/api/cards${qs ? `?${qs}` : ''}`;
    return await this.request(url, { method: 'GET' });
  },

  async getCard(id) {
    return await this.request(`/api/cards/${id}`, { method: 'GET' });
  },

  async createCard(cardData) {
    return await this.request('/api/cards', {
      method: 'POST',
      body: cardData
    });
  },

  async updateCard(id, cardData) {
    return await this.request(`/api/cards/${id}`, {
      method: 'PUT',
      body: cardData
    });
  },

  async deleteCard(id) {
    return await this.request(`/api/cards/${id}`, {
      method: 'DELETE'
    });
  },

  async toggleStar(id) {
    return await this.request(`/api/cards/${id}/star`, {
      method: 'PATCH'
    });
  },

  // Stats
  async getStats() {
    return await this.request('/api/stats', { method: 'GET' });
  },

  // User Management (Admin)
  async getUsers() {
    return await this.request('/api/users', { method: 'GET' });
  },

  async createUser(userData) {
    return await this.request('/api/users', {
      method: 'POST',
      body: userData
    });
  },

  async updateUser(id, userData) {
    return await this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: userData
    });
  },

  async deleteUser(id) {
    return await this.request(`/api/users/${id}`, {
      method: 'DELETE'
    });
  }
};
