import { sequelize } from "../sequelize";
import { User } from "./User";
import { AuthSession } from "./AuthSession";
import { Role } from "./Role";
import { UserRole } from "./UserRole";
import { GuestProfile } from "./GuestProfile";
import { Office } from "./Office";
import { Department } from "./Department";
import { Service } from "./Service";
import { Host } from "./Host";
import { ServiceHost } from "./ServiceHost";
import { HostProfile } from "./HostProfile";
import { RecurringAvailability } from "./RecurringAvailability";
import { TimeSlot } from "./TimeSlot";
import { Visit } from "./Visit";
import { VisitAssignment } from "./VisitAssignment";
import { Message } from "./Message";
import { Pin } from "./Pin";
import { Approval } from "./Approval";
import { AccessCredential } from "./AccessCredential";
import { ExternalWebhookEvent } from "./ExternalWebhookEvent";
import { OutboxEvent } from "./OutboxEvent";
import { AuditLog } from "./auditLog.model";
import { IdempotencyKey } from "./idempotencyKey.model";
import { Notification } from "./Notification";

// Associations
Office.hasMany(Department, { foreignKey: "office_id" });
Department.belongsTo(Office, { foreignKey: "office_id" });
Office.hasMany(User, { as: "users", foreignKey: "office_id" });
User.belongsTo(Office, { as: "office", foreignKey: "office_id" });

Office.hasMany(Service, { foreignKey: "office_id" });
Service.belongsTo(Office, { foreignKey: "office_id" });

Department.hasMany(Service, { foreignKey: "department_id" });
Service.belongsTo(Department, { foreignKey: "department_id" });

// Service-Host Many-to-Many
Service.belongsToMany(Host, {
  through: ServiceHost,
  as: "hosts",
  foreignKey: "service_id",
  otherKey: "host_id",
});
Host.belongsToMany(Service, {
  through: ServiceHost,
  as: "services",
  foreignKey: "host_id",
  otherKey: "service_id",
});

// RBAC
User.belongsToMany(Role, {
  through: UserRole,
  as: "roles",
  foreignKey: "user_id",
});
Role.belongsToMany(User, {
  through: UserRole,
  as: "users",
  foreignKey: "role_id",
});
User.hasMany(AuthSession, { as: "sessions", foreignKey: "user_id" });
AuthSession.belongsTo(User, { foreignKey: "user_id" });
User.hasOne(GuestProfile, { as: "guestProfile", foreignKey: "user_id" });
GuestProfile.belongsTo(User, { as: "user", foreignKey: "user_id" });

// Hosts
Host.belongsTo(User, { as: "user", foreignKey: "user_id" });
User.hasOne(Host, { as: "host", foreignKey: "user_id" });
User.hasOne(HostProfile, { as: "hostProfile", foreignKey: "user_id" });
HostProfile.belongsTo(User, { as: "user", foreignKey: "user_id" });
Host.belongsTo(Office, { as: "office", foreignKey: "office_id" });
Host.belongsTo(Department, { as: "department", foreignKey: "department_id" });
Host.hasMany(RecurringAvailability, {
  as: "availabilityRules",
  foreignKey: "host_id",
});
RecurringAvailability.belongsTo(Host, { as: "host", foreignKey: "host_id" });

// Visits and TimeSlots
Host.hasMany(TimeSlot, { foreignKey: "host_id" });
TimeSlot.belongsTo(Host, { foreignKey: "host_id" });
TimeSlot.hasMany(Visit, { as: "visits", foreignKey: "time_slot_id" });
RecurringAvailability.hasMany(TimeSlot, {
  as: "generatedSlots",
  foreignKey: "availability_rule_id",
});
TimeSlot.belongsTo(RecurringAvailability, {
  as: "availabilityRule",
  foreignKey: "availability_rule_id",
});

Visit.belongsTo(User, { as: "guest", foreignKey: "guest_id" });
User.hasMany(Visit, { as: "visitsAsGuest", foreignKey: "guest_id" });
Visit.belongsTo(TimeSlot, { foreignKey: "time_slot_id" });
Visit.belongsTo(Service, { as: "service", foreignKey: "service_id" });
Visit.belongsTo(Department, { as: "department", foreignKey: "department_id" });
Visit.belongsTo(Office, { as: "office", foreignKey: "office_id" });
Visit.belongsTo(Host, { as: "assignedHost", foreignKey: "assigned_host_id" });
Host.hasMany(Visit, { as: "visits", foreignKey: "assigned_host_id" });
Visit.belongsTo(User, { as: "escalatedBy", foreignKey: "escalated_by_id" });
Visit.hasMany(Approval, { as: "approvals", foreignKey: "visit_id" });
Approval.belongsTo(Visit, { foreignKey: "visit_id" });
Approval.belongsTo(User, { as: "approver", foreignKey: "approver_id" });

Visit.hasMany(Pin, { as: "pins", foreignKey: "visit_id" });
Pin.belongsTo(Visit, { foreignKey: "visit_id" });

Visit.hasMany(AccessCredential, { as: "credentials", foreignKey: "visit_id" });
AccessCredential.belongsTo(Visit, { foreignKey: "visit_id" });
AccessCredential.belongsTo(Pin, { as: "pin", foreignKey: "pin_id" });

// Visit assignments (host assignment audit trail)
Visit.hasMany(VisitAssignment, { as: "assignments", foreignKey: "visit_id" });
VisitAssignment.belongsTo(Visit, { foreignKey: "visit_id" });
VisitAssignment.belongsTo(Host, { as: "host", foreignKey: "host_id" });
VisitAssignment.belongsTo(User, {
  as: "assignedBy",
  foreignKey: "assigned_by_id",
});

// Messages (visit chat — deferred feature, associations wired for future use)
Visit.hasMany(Message, { as: "messages", foreignKey: "visit_id" });
Message.belongsTo(Visit, { foreignKey: "visit_id" });
Message.belongsTo(User, { as: "sender", foreignKey: "sender_id" });

// Audit Logs
Visit.hasMany(AuditLog, {
  as: "auditLogs",
  foreignKey: "entity_id",
  constraints: false,
  scope: { entity: "VISIT" },
});
AuditLog.belongsTo(User, { as: "user", foreignKey: "user_id" });

export {
  sequelize,
  User,
  AuthSession,
  Role,
  UserRole,
  GuestProfile,
  Office,
  Department,
  Service,
  Host,
  HostProfile,
  RecurringAvailability,
  TimeSlot,
  Visit,
  VisitAssignment,
  Message,
  Pin,
  Approval,
  AccessCredential,
  ExternalWebhookEvent,
  OutboxEvent,
  AuditLog,
  IdempotencyKey,
  Notification,
  ServiceHost,
};
