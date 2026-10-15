// Adds performance indexes for visit dashboards, scheduling, credentials, outbox, audit, and notifications hot paths.

const indexes = [
  ["visits", ["status", "office_id", "scheduled_start"], "idx_visits_status_office_start"],
  ["visits", ["status", "sla_deadline_at"], "idx_visits_sla_enforcement", { where: { status: "PENDING" } }],
  ["visits", ["status", "scheduled_end"], "idx_visits_noshow_detection", { where: { status: "APPROVED" } }],
  ["visits", ["office_id", "status", "created_at"], "idx_visits_dashboard_stats"],
  ["visits", ["guest_id", "status"], "idx_visits_guest_status"],
  ["visits", ["assigned_host_id", "status", "scheduled_start"], "idx_visits_host_dashboard"],
  ["visits", ["time_slot_id"], "idx_visits_time_slot"],
  ["time_slots", ["host_id", "slot_state", "start_time", "end_time"], "idx_time_slots_availability"],
  ["time_slots", ["service_id", "slot_state", "start_time"], "idx_time_slots_service_date"],
  ["access_credentials", ["qr_code"], "idx_credentials_qr_code"],
  ["access_credentials", ["status", "valid_until"], "idx_credentials_expiry", { where: { status: "ACTIVE" } }],
  ["access_credentials", ["visit_id"], "idx_credentials_visit"],
  ["outbox_events", ["status", "created_at"], "idx_outbox_pending_events", { where: { status: "PENDING" } }],
  ["audit_logs", ["entity_type", "entity_id", "created_at"], "idx_audit_logs_entity"],
  ["audit_logs", ["actor_id", "created_at"], "idx_audit_logs_actor"],
  ["notifications", ["user_id", "is_read", "created_at"], "idx_notifications_user_unread"],
  ["visit_assignments", ["visit_id", "created_at"], "idx_visit_assignments_visit"],
];

module.exports = {
  async up(queryInterface) {
    const tableColumnsCache = new Map();
    const getTableColumns = async (table) => {
      if (!tableColumnsCache.has(table)) {
        tableColumnsCache.set(table, await queryInterface.describeTable(table));
      }
      return tableColumnsCache.get(table);
    };

    for (const [table, fields, name, options = {}] of indexes) {
      const tableColumns = await getTableColumns(table);
      const missingField = fields.find((field) => !tableColumns[field]);
      if (missingField) {
        continue;
      }

      try {
        await queryInterface.addIndex(table, fields, {
          name,
          ...options,
        });
      } catch (error) {
        if (!String(error?.message ?? "").includes("already exists")) {
          throw error;
        }
      }
    }
  },

  async down(queryInterface) {
    for (const [table, _fields, name] of indexes.slice().reverse()) {
      try {
        await queryInterface.removeIndex(table, name);
      } catch (error) {
        if (!String(error?.message ?? "").includes("does not exist")) {
          throw error;
        }
      }
    }
  },
};
