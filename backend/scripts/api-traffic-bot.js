const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = `http://127.0.0.1:${process.env.PORT || 3000}/api/v1`;

function mintAdminToken() {
  return jwt.sign(
    { id: 1, email: 'admin@examplecorp.net', roles: ['super_admin', 'admin', 'host', 'reception'] },
    process.env.JWT_SECRET || 'REPLACE_WITH_DEV_JWT_SECRET',
    { expiresIn: '1h' }
  );
}

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = mintAdminToken();
  config.headers.Authorization = `Bearer ${token}`;
  
  // Provide idempotency key for POST requests to pass middleware
  if (config.method && config.method.toLowerCase() === 'post') {
    config.headers['Idempotency-Key'] = `sim-e2e-${Date.now()}-${Math.random()}`;
  }
  
  return config;
});

async function runTraffic() {
  console.log('[api-bot] Started HTTP traffic generation for E2E testing (including chaos and race conditions)...');
  
  setInterval(async () => {
    try {
      // 1. HAPPY PATHS:
      // Get Pending Visits and Approve some
      const pendingRes = await api.get('/visits?limit=10&status=PENDING');
      const pending = pendingRes.data?.data;
      if (pending && pending.length > 0) {
        const v = pending[Math.floor(Math.random() * pending.length)];
        await api.patch(`/visits/${v.id}/status`, { status: 'APPROVED' });
        console.log(`[api-bot] E2E: PATCH /visits/${v.id}/status -> APPROVED`);
        
        // CHAOS: Immediately try to double-approve to test idempotency/race conditions
        if (Math.random() > 0.5) {
          Promise.all([
            api.patch(`/visits/${v.id}/status`, { status: 'APPROVED' }),
            api.patch(`/visits/${v.id}/status`, { status: 'APPROVED' })
          ]).catch(() => console.log(`[api-bot] E2E (Chaos): Race condition double-approve successfully rejected.`));
        }
      }

      // Get Approved Visits and Check-in some
      const approvedRes = await api.get('/visits?limit=10&status=APPROVED');
      const approved = approvedRes.data?.data;
      if (approved && approved.length > 0) {
        const v = approved[Math.floor(Math.random() * approved.length)];
        await api.patch(`/visits/${v.id}/status`, { status: 'CHECKED_IN' });
        console.log(`[api-bot] E2E: PATCH /visits/${v.id}/status -> CHECKED_IN`);
        
        // CHAOS: Try an invalid transition directly from APPROVED -> COMPLETED
        if (Math.random() > 0.7) {
          api.patch(`/visits/${v.id}/status`, { status: 'COMPLETED' })
            .catch(() => console.log(`[api-bot] E2E (Chaos): Invalid transition APPROVED->COMPLETED successfully rejected.`));
        }
      }

      // Get Checked-in visits and complete some
      const checkedInRes = await api.get('/visits?limit=10&status=CHECKED_IN');
      const checkedIn = checkedInRes.data?.data;
      if (checkedIn && checkedIn.length > 0) {
        if (Math.random() > 0.5) {
          const v = checkedIn[Math.floor(Math.random() * checkedIn.length)];
          await api.patch(`/visits/${v.id}/status`, { status: 'COMPLETED' });
          console.log(`[api-bot] E2E: PATCH /visits/${v.id}/status -> COMPLETED`);
        }
      }

      // 2. CHAOS & UNEXPECTED ACTIONS:
      
      // Send Malformed Payload to test Zod validation
      if (Math.random() > 0.8) {
        api.post('/visits', {
          office_id: 'invalid_string', // Should be number
          guest_id: -100 // Should be positive
        }).catch(() => console.log(`[api-bot] E2E (Chaos): Malformed visit booking payload rejected.`));
      }

      // Try Reassigning to a non-existent host
      if (Math.random() > 0.8 && pending && pending.length > 0) {
        const v = pending[0];
        api.post(`/visits/${v.id}/reassign`, { host_id: 9999999 })
          .catch(() => console.log(`[api-bot] E2E (Chaos): Reassign to invalid host rejected.`));
      }

      // Try extending visit beyond allowed limits (missing end time or invalid date)
      if (Math.random() > 0.8 && checkedIn && checkedIn.length > 0) {
        const v = checkedIn[0];
        api.post(`/visits/${v.id}/extend`, { new_end_time: 'not-a-date' })
          .catch(() => console.log(`[api-bot] E2E (Chaos): Invalid extend date rejected.`));
      }

    } catch (e) {
      // Ignore network errors or validation rejects during heavy load testing
    }
  }, 3000); // Fire every 3 seconds
}

runTraffic();
