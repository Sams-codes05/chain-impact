import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

// Donations API
export const donationsAPI = {
  create: (formData) => api.post('/donations', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  
  getAll: (params) => api.get('/donations', { params }),
  
  getById: (id) => api.get(`/donations/${id}`),
  
  update: (id, data) => api.put(`/donations/${id}`, data),
  
  downloadReceipt: (id) => api.get(`/donations/${id}/receipt`, {
    responseType: 'blob',
  }),
};

// Analytics API
export const analyticsAPI = {
  getSummary: () => api.get('/analytics/summary'),
  
  getTrends: (days = 30) => api.get('/analytics/trends', {
    params: { days },
  }),
  
  getCampaigns: () => api.get('/analytics/campaigns'),
};

// Blockchain API
export const blockchainAPI = {
  getStatus: () => api.get('/blockchain/status'),
  
  verify: (identifier) => api.get(`/blockchain/verify/${encodeURIComponent(identifier)}`),
};

// Campaigns API
export const campaignsAPI = {
  getAll: () => api.get('/campaigns'),
  
  create: (data) => api.post('/campaigns', data),
};

// Health Check
export const healthCheck = () => api.get('/health');

export default api;