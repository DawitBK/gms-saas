'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const [services] = await queryInterface.sequelize.query(`
      SELECT id, name, office_id FROM services WHERE department_id IS NULL
    `);

    if (!services.length) {
      console.log('⚡ No services require department backfill');
      return;
    }

    for (const s of services) {
      const tokens = (s.name || '').split(/\s+/).map(t => t.replace(/[^a-zA-Z]/g, '')).filter(Boolean);
      let deptId = null;

      // Try to match a department by name token in the same office
      for (const token of tokens) {
        const esc = queryInterface.sequelize.escape(`%${token.toLowerCase()}%`);
        const [rows] = await queryInterface.sequelize.query(`
          SELECT id FROM departments WHERE office_id = ${s.office_id} AND LOWER(name) LIKE ${esc} LIMIT 1
        `);
        if (rows.length) {
          deptId = rows[0].id;
          break;
        }
      }

      // Fallback: pick any department in the same office
      if (!deptId) {
        const [rows] = await queryInterface.sequelize.query(`
          SELECT id FROM departments WHERE office_id = ${s.office_id} LIMIT 1
        `);
        if (rows.length) deptId = rows[0].id;
      }

      if (deptId) {
        await queryInterface.sequelize.query(`UPDATE services SET department_id = ${deptId} WHERE id = ${s.id}`);
        console.log(`✅ Backfilled service ${s.id} (${s.name}) -> department ${deptId}`);
      } else {
        console.warn(`⚠️ Could not determine department for service ${s.id} (${s.name})`);
      }
    }
  },

  async down() {
    // irreversible: we don't unset department_id values created by this migration
  }
};
