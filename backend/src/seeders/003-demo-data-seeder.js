'use strict';
/**
 * GMS Enterprise — Demo Data Seeder (Sequelize CLI format)
 * =========================================================
 * Populates the DB with realistic, evenly distributed test data:
 *   4 offices | 11 departments/office | services per dept | 12 staff | 20 guests | 40 visits
 *
 * Usage: npm run seed:demo
 * Requires: npm run seed:passwords to have been run first.
 */

const { seedPasswordHash, seedPasswordNotice } = require('./seed-password');
const { randomUUID } = require('crypto');

const OFFICES = [
  { name: 'Head Office 6th Floor', address: 'Example Corp HQ, 6th Floor', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Head Office 7th Floor', address: 'Example Corp HQ, 7th Floor', city: 'Example City', country: 'Exampleland', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Bahir Dar Regional',    address: 'Main Lake Road',            city: 'Bahir Dar',   country: 'Exampleland', latitude: 11.59,  longitude: 37.39   },
  { name: 'Dire Dawa Hub',         address: 'Industrial Zone',           city: 'Dire Dawa',   country: 'Exampleland', latitude: 40.7128,   longitude: 41.86   },
];

const DEPARTMENTS = [
  'Executive', 'IT & Digital', 'Finance', 'Operations',
  'Logistics', 'Legal', 'HR', 'Marketing', 'Security', 'Farm', 'Transport Department',
];

const DEPT_SERVICES = {
  'Executive':            [{ name: 'Executive Meeting', dur: 60 }, { name: 'VIP Guest Reception', dur: 45 }, { name: 'Strategic Briefing', dur: 90 }],
  'IT & Digital':         [{ name: 'Technical Support', dur: 30 }, { name: 'System Access Request', dur: 20 }, { name: 'Software Demo', dur: 45 }, { name: 'IT Security Audit', dur: 60 }],
  'Finance':              [{ name: 'Budget Review Meeting', dur: 60 }, { name: 'Accounts Payable Consultation', dur: 30 }, { name: 'Financial Advisory', dur: 45 }, { name: 'Tax & Compliance Meeting', dur: 60 }],
  'Operations':           [{ name: 'Operations Review', dur: 45 }, { name: 'Coffee Quality Inspection', dur: 30 }, { name: 'Production Planning', dur: 60 }, { name: 'Quality Control Walkthrough', dur: 45 }],
  'Logistics':            [{ name: 'Freight Consultation', dur: 30 }, { name: 'Cargo Inspection', dur: 45 }, { name: 'Warehouse Tour', dur: 60 }],
  'Legal':                [{ name: 'Legal Advisory', dur: 45 }, { name: 'Contract Review', dur: 60 }, { name: 'Compliance Audit', dur: 90 }],
  'HR':                   [{ name: 'Job Interview', dur: 45 }, { name: 'HR Advisory', dur: 30 }, { name: 'Employee Onboarding', dur: 120 }, { name: 'Training Session', dur: 90 }],
  'Marketing':            [{ name: 'Marketing Campaign Review', dur: 60 }, { name: 'Brand Consultation', dur: 45 }, { name: 'Media Briefing', dur: 30 }],
  'Security':             [{ name: 'Security Clearance', dur: 30 }, { name: 'Incident Report Review', dur: 45 }, { name: 'Safety Briefing', dur: 20 }],
  'Farm':                 [{ name: 'Farm Inspection', dur: 60 }, { name: 'Agricultural Advisory', dur: 45 }, { name: 'Harvest Review', dur: 30 }],
  'Transport Department': [{ name: 'Vehicle Inspection', dur: 30 }, { name: 'Route Planning Session', dur: 45 }, { name: 'Fleet Maintenance Review', dur: 60 }],
};

const GUEST_NAMES = [
  ['Abebe', 'Kebede'], ['Tigist', 'Alemu'], ['Daniel', 'Haile'], ['Selamawit', 'Tesfaye'],
  ['Yohannes', 'Girma'], ['Hiwot', 'Mengesha'], ['Bereket', 'Tadesse'], ['Marta', 'Worku'],
  ['Solomon', 'Bekele'], ['Eyob', 'Getachew'], ['Rahel', 'Assefa'], ['Tewodros', 'Asfaw'],
  ['Bezawit', 'Demissie'], ['Henok', 'Fekadu'], ['Almaz', 'Shiferaw'], ['Mikias', 'Negash'],
  ['Sara', 'Tilahun'], ['Kaleb', 'Zeleke'], ['Eden', 'Tsegay'], ['Natnael', 'Hailu'],
];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(rnd(8, 16), rnd(0, 3) * 15, 0, 0);
  return d;
}

function futureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(rnd(8, 16), rnd(0, 3) * 15, 0, 0);
  return d;
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const sq = queryInterface.sequelize;
    const passwordHash = await seedPasswordHash();
    console.log('\n[demo] Starting demo data seeding...');

    // ── Fetch existing roles ──────────────────────────────────────────────────
    const [roles] = await sq.query(`SELECT id, name FROM roles`);
    const roleMap = Object.fromEntries(roles.map(r => [r.name, r.id]));
    if (!roleMap['host']) throw new Error('Roles not seeded. Run seed:passwords first.');

    // ── Step 1: Offices ───────────────────────────────────────────────────────
    console.log('[demo] Inserting offices...');
    const officeIds = {};
    for (const o of OFFICES) {
      const [[existing]] = await sq.query(
        `SELECT id FROM offices WHERE name = :name LIMIT 1`, { replacements: { name: o.name } }
      );
      if (existing) {
        officeIds[o.name] = existing.id;
      } else {
        const [[ins]] = await sq.query(
          `INSERT INTO offices (name, address, city, country, latitude, longitude, created_at, updated_at)
           VALUES (:name, :address, :city, :country, :lat, :lng, NOW(), NOW()) RETURNING id`,
          { replacements: { name: o.name, address: o.address, city: o.city, country: o.country, lat: o.latitude, lng: o.longitude } }
        );
        officeIds[o.name] = ins.id;
      }
      console.log(`  ✔ Office: ${o.name} (id=${officeIds[o.name]})`);
    }

    // ── Step 2: Departments ───────────────────────────────────────────────────
    console.log('[demo] Inserting departments...');
    const deptIds = {};  // "OfficeName|DeptName" → id
    for (const officeName of Object.keys(officeIds)) {
      const officeId = officeIds[officeName];
      for (const deptName of DEPARTMENTS) {
        const [[existing]] = await sq.query(
          `SELECT id FROM departments WHERE name = :name AND office_id = :oid LIMIT 1`,
          { replacements: { name: deptName, oid: officeId } }
        );
        let deptId;
        if (existing) {
          deptId = existing.id;
        } else {
          const [[ins]] = await sq.query(
            `INSERT INTO departments (name, office_id, created_at, updated_at)
             VALUES (:name, :oid, NOW(), NOW()) RETURNING id`,
            { replacements: { name: deptName, oid: officeId } }
          );
          deptId = ins.id;
        }
        deptIds[`${officeName}|${deptName}`] = deptId;
      }
      console.log(`  ✔ ${DEPARTMENTS.length} departments for ${officeName}`);
    }

    // ── Step 3: Services ──────────────────────────────────────────────────────
    console.log('[demo] Inserting services...');
    const serviceIds = {};  // "OfficeName|DeptName|SvcName" → id
    let svcCount = 0;
    for (const officeName of Object.keys(officeIds)) {
      const officeId = officeIds[officeName];
      for (const [deptName, svcs] of Object.entries(DEPT_SERVICES)) {
        const deptKey = `${officeName}|${deptName}`;
        const deptId = deptIds[deptKey];
        if (!deptId) continue;
        for (const svc of svcs) {
          const [[existing]] = await sq.query(
            `SELECT id FROM services WHERE name = :name AND department_id = :did LIMIT 1`,
            { replacements: { name: svc.name, did: deptId } }
          );
          let svcId;
          if (existing) {
            svcId = existing.id;
          } else {
            const [[ins]] = await sq.query(
              `INSERT INTO services (name, department_id, office_id, duration_minutes, created_at, updated_at)
               VALUES (:name, :did, :oid, :dur, NOW(), NOW()) RETURNING id`,
              { replacements: { name: svc.name, did: deptId, oid: officeId, dur: svc.dur } }
            );
            svcId = ins.id;
            svcCount++;
          }
          serviceIds[`${officeName}|${deptName}|${svc.name}`] = svcId;
        }
      }
    }
    console.log(`  ✔ ${svcCount} services created`);

    // ── Step 4: Staff users (admin, reception, host per office) ───────────────
    console.log('[demo] Inserting staff users...');
    const hostTableIds = []; // Stores { hostId, officeId, officeName } where hostId is from 'hosts' table
    for (const officeName of Object.keys(officeIds)) {
      const officeId = officeIds[officeName];
      const shortTag = officeName.split(' ').map(w => w[0].toLowerCase()).join('');
      const staff = [
        { full_name: `Admin ${officeName}`,     email: `admin.${shortTag}@examplecorp.com`,     role: 'admin' },
        { full_name: `Reception ${officeName}`, email: `reception.${shortTag}@examplecorp.com`, role: 'reception' },
        { full_name: `Host ${officeName}`,      email: `host.${shortTag}@examplecorp.com`,      role: 'host' },
      ];
      for (const s of staff) {
        const [[existUser]] = await sq.query(
          `SELECT id FROM users WHERE email = :email LIMIT 1`, { replacements: { email: s.email } }
        );
        let userId = existUser?.id;
        if (!userId) {
          const [[ins]] = await sq.query(
            `INSERT INTO users (full_name, email, password_hash, status, office_id, created_at, updated_at)
             VALUES (:fn, :email, :ph, 'ACTIVE', :oid, NOW(), NOW()) RETURNING id`,
            { replacements: { fn: s.full_name, email: s.email, ph: passwordHash, oid: officeId } }
          );
          userId = ins.id;
        }
        const roleId = roleMap[s.role];
        if (roleId) {
          await sq.query(
            `INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
             VALUES (:uid, :rid, NOW(), NOW()) ON CONFLICT DO NOTHING`,
            { replacements: { uid: userId, rid: roleId } }
          );
        }

        if (s.role === 'host') {
          // 1. Insert into 'hosts' table (required for visits)
          const [[existHost]] = await sq.query(
            `SELECT id FROM hosts WHERE user_id = :uid LIMIT 1`, { replacements: { uid: userId } }
          );
          let hostId = existHost?.id;
          if (!hostId) {
            const [[hIns]] = await sq.query(
              `INSERT INTO hosts (user_id, office_id, active)
               VALUES (:uid, :oid, true) RETURNING id`,
              { replacements: { uid: userId, oid: officeId } }
            );
            hostId = hIns.id;
          }

          // 2. Insert into 'host_profiles' table (metadata)
          const [[existHp]] = await sq.query(
            `SELECT id FROM host_profiles WHERE user_id = :uid LIMIT 1`, { replacements: { uid: userId } }
          );
          if (!existHp) {
            await sq.query(
              `INSERT INTO host_profiles (user_id, job_title, created_at, updated_at)
               VALUES (:uid, :title, NOW(), NOW())`,
              { replacements: { uid: userId, title: `Host Officer – ${officeName}` } }
            );
          }
          hostTableIds.push({ hostId, officeId, officeName });
        }
      }
      console.log(`  ✔ 3 staff (admin/reception/host) for ${officeName}`);
    }

    // ── Step 5: Guests (Users + GuestProfiles) ──────────────────────────────
    console.log('[demo] Inserting guests...');
    const guestUserIds = [];
    const companies = ['Ethio Telecom', 'CBE', 'Examplelandn Airlines', 'Safaricom ET', 'Awash Bank', null, null];
    const guestRoleId = roleMap['guest'];

    for (let gi = 0; gi < GUEST_NAMES.length; gi++) {
      const [fn, ln] = GUEST_NAMES[gi];
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${gi}@guestmail.et`;
      const phone = `+155591${String(1000000 + gi).slice(1)}`;

      // 1. User
      const [[existUser]] = await sq.query(
        `SELECT id FROM users WHERE email = :email LIMIT 1`, { replacements: { email } }
      );
      let userId = existUser?.id;
      if (!userId) {
        const [[ins]] = await sq.query(
          `INSERT INTO users (full_name, email, phone, status, created_at, updated_at)
           VALUES (:fn, :email, :phone, 'ACTIVE', NOW(), NOW()) RETURNING id`,
          { replacements: { fn: `${fn} ${ln}`, email, phone } }
        );
        userId = ins.id;
      }

      // 2. Role
      if (guestRoleId) {
        await sq.query(
          `INSERT INTO user_roles (user_id, role_id, created_at, updated_at)
           VALUES (:uid, :rid, NOW(), NOW()) ON CONFLICT DO NOTHING`,
          { replacements: { uid: userId, rid: guestRoleId } }
        );
      }

      // 3. Guest Profile
      const [[existGp]] = await sq.query(
        `SELECT id FROM guest_profiles WHERE user_id = :uid LIMIT 1`, { replacements: { uid: userId } }
      );
      if (!existGp) {
        await sq.query(
          `INSERT INTO guest_profiles (user_id, company, created_at, updated_at)
           VALUES (:uid, :company, NOW(), NOW())`,
          { replacements: { uid: userId, company: pick(companies) } }
        );
      }
      guestUserIds.push(userId);
    }
    console.log(`  ✔ ${guestUserIds.length} guest users created`);

    // ── Step 6: Visits ────────────────────────────────────────────────────────
    console.log('[demo] Inserting visits...');
    const officeNames = Object.keys(officeIds);
    let visitCount = 0;

    for (let vi = 0; vi < 40; vi++) {
      const officeName = officeNames[vi % officeNames.length];
      const officeId = officeIds[officeName];
      const deptName = pick(DEPARTMENTS);
      const deptId = deptIds[`${officeName}|${deptName}`];
      if (!deptId) continue;

      const svcsInDept = DEPT_SERVICES[deptName] || [];
      if (!svcsInDept.length) continue;
      const chosenSvc = pick(svcsInDept);
      const svcKey = `${officeName}|${deptName}|${chosenSvc.name}`;
      const svcId = serviceIds[svcKey] || null;

      const isPast = vi < 28;
      const scheduledStart = isPast ? pastDate(rnd(1, 45)) : futureDate(rnd(1, 14));
      const scheduledEnd = new Date(scheduledStart.getTime() + (chosenSvc.dur || 30) * 60000);

      let status;
      if (!isPast) {
        status = pick(['PENDING', 'PENDING', 'APPROVED']);
      } else {
        status = pick(['COMPLETED', 'COMPLETED', 'CHECKED_IN', 'NO_SHOW', 'CANCELLED', 'DECLINED']);
      }

      const checkedInAt = ['CHECKED_IN', 'COMPLETED'].includes(status) ? scheduledStart : null;
      const checkedOutAt = status === 'COMPLETED' ? scheduledEnd : null;
      const guestId = guestUserIds[vi % guestUserIds.length];

      const officeHosts = hostTableIds.filter(h => h.officeId === officeId);
      const assignedHostId = officeHosts.length ? pick(officeHosts).hostId : null;

      try {
        await sq.query(
          `INSERT INTO visits
             (guest_id, office_id, department_id, service_id, assigned_host_id, purpose, status,
              scheduled_start, scheduled_end, checked_in_at, checked_out_at, qr_code,
              escalated_to_reception, created_at, updated_at)
           VALUES
             (:gid, :oid, :did, :sid, :hid, :purpose, :status,
              :ss, :se, :ci, :co, :qr,
              :esc, :created, NOW())`,
          {
            replacements: {
              gid: guestId, oid: officeId, did: deptId, sid: svcId, hid: assignedHostId,
              purpose: `Meeting for ${chosenSvc.name}`,
              status,
              ss: scheduledStart, se: scheduledEnd, ci: checkedInAt, co: checkedOutAt,
              qr: randomUUID(),
              esc: status === 'DECLINED',
              created: pastDate(rnd(1, 90)),
            }
          }
        );
        visitCount++;
      } catch (err) {
        process.stdout.write(`  ✗ visit ${vi + 1}: ${err.message}\n`);
      }
    }
    console.log(`  ✔ ${visitCount} visits created`);

    console.log('\n══════════════════════════════════════════════════════');
    console.log('  ✅  Demo data seeded successfully!');
    console.log(`      Offices: ${OFFICES.length} | Departments: ${OFFICES.length * DEPARTMENTS.length}`);
    console.log(`      Guests: ${guestUserIds.length} | Visits: ${visitCount}`);
    console.log('');
    console.log(`  Staff accounts (all use ${seedPasswordNotice()}):`);
    Object.keys(officeIds).forEach(o => {
      const t = o.split(' ').map(w => w[0].toLowerCase()).join('');
      console.log(`    admin.${t}@examplecorp.com | reception.${t}@examplecorp.com | host.${t}@examplecorp.com`);
    });
    console.log('══════════════════════════════════════════════════════\n');
  },

  async down(queryInterface) {
    const sq = queryInterface.sequelize;
    // 1. Cleanup visits associated with demo guests
    await sq.query(`
      DELETE FROM visits WHERE guest_id IN (
        SELECT id FROM users WHERE email LIKE '%@guestmail.et'
      )
    `);
    
    // 2. Cleanup demo guest profiles
    await sq.query(`
      DELETE FROM guest_profiles WHERE user_id IN (
        SELECT id FROM users WHERE email LIKE '%@guestmail.et'
      )
    `);

    // 3. Cleanup demo guest users
    await sq.query(`DELETE FROM users WHERE email LIKE '%@guestmail.et'`);

    // 4. Cleanup demo staff users
    await sq.query(`DELETE FROM users WHERE email LIKE '%.%@examplecorp.com' AND email NOT LIKE '%@examplecorp.com'`);
    
    console.log('[demo] Demo data rolled back.');
  },
};
