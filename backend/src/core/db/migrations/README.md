# Database Migrations

Migrations run in filename sort order through Sequelize CLI. Numbered migrations define the core schema and Phase 2 additions; timestamped migrations are production repair/enhancement migrations that remain valid in sort order.

**Note on `007-*`:** there are two files sharing the `007` prefix
(`007-add-timestamps-to-services.js` and `007-create-hosts.js` below). They
sort correctly today only because `add-` alphabetically precedes `create-` —
this works by accident, not by design. Do not add a third `007-*` file, and
do not renumber the existing pair (Sequelize CLI tracks applied migrations by
filename — renaming an already-applied file makes it look unapplied on any
environment where it already ran). Going forward, number new migrations
starting at `056-...` regardless of any gaps, rather than continuing to rely
on alphabetical tie-breaks within a shared prefix.

## Current Files

- `001-create-offices.js`: create offices.
- `002-create-roles.js`: create roles.
- `003-create-users.js`: create users.
- `004-create-user-roles.js`: create user roles.
- `005-create-departments.js`: create departments.
- `006-create-services.js`: create services.
- `007-add-timestamps-to-services.js`: add timestamps to services.
- `007-create-hosts.js`: create hosts.
- `008-create-recurring-availability.js`: create recurring availability.
- `009-create-time-slots.js`: create time slots.
- `010-create-visits.js`: create visits.
- `011-create-visit-assignments.js`: create visit assignments.
- `012-create-pins.js`: create pins.
- `013-create-messages.js`: create messages.
- `014-create-notifications.js`: create notifications.
- `015-create-audit-logs.js`: create audit logs.
- `016-create-idempotency-keys.js`: create idempotency keys.
- `017-add-soft-deletes-and-indexes.js`: add soft deletes and indexes.
- `018-add-exclude-constraint-visits.js`: add exclude constraint visits.
- `019-add-time-slot-to-visits.js`: add time slot to visits.
- `020-create-approvals.js`: create approvals.
- `021-create-access-credentials.js`: create access credentials.
- `022-create-auth-sessions.js`: create auth sessions.
- `023-create-guest-profiles.js`: create guest profiles.
- `024-create-external-webhook-events.js`: create external webhook events.
- `030-backfill-service-departments.js`: backfill service departments.
- `031-fix-visit-booking-constraints.js`: fix visit booking constraints.
- `032-expand-availability-and-visit-routing.js`: expand availability and visit routing.
- `033-create-outbox-events.js`: create outbox events.
- `034-add-outbox-dead-letter-status.js`: add outbox dead letter status.
- `035-add-service-host-ids.js`: add service host ids.
- `036-make-visit-service-nullable.js`: make visit service nullable.
- `037-repair-visit-service-nullable.js`: repair visit service nullable.
- `038-add-user-office-scope.js`: add user office scope.
- `039-visit-workflow-enhancements.js`: visit workflow enhancements.
- `040-add-document-url-guest-profile.js`: add document url guest profile.
- `041-add-deleted-at-departments.js`: add deleted at departments.
- `042-user-phone-unique.js`: user phone unique.
- `043-create-host-profiles.js`: create host profiles.
- `044-role-scope-and-availability-normalization.js`: role scope and availability normalization.
- `045-add-daily-sequence-to-visits.js`: add daily sequence to visits.
- `046-change-document-url-to-text.js`: change document url to text.
- `047-add-registration-otp-and-ocr-text.js`: add registration otp and ocr text.
- `048-fix-active-visit-index.js`: fix active visit index.
- `049-add-latitude-longitude-to-offices.js`: add latitude longitude to offices.
- `050-add-assigned-by-to-visit-assignments.js`: add assigned by to visit assignments.
- `051-add-check-in-out-timestamps.js`: add check in out timestamps.
- `052-add-missing-timestamps.js`: add missing timestamps.
- `053-create-service-hosts.js`: create service hosts.
- `054-add-performance-indexes.js`: add performance indexes.
- `055-create-push-subscriptions.js`: create push subscriptions.
- `20260501203849-add-strict-organizational-constraints.js`: add strict organizational constraints.
- `20260501212357-add-sla-fields-to-visits.js`: add sla fields to visits.
- `20260502150500-add-request-id-to-audit-logs.js`: add request id to audit logs.
- `20260502154000-add-reassigned-statuses.js`: add reassigned statuses.
- `20260502160400-add-reception-sla-deadline.js`: add reception sla deadline.
- `20260502174500-add-vip-rating-and-extension-fields.js`: add vip rating and extension fields.
- `20260504195758-add-security-features.js`: add security features.
- `20260505000000-fix-user-email-unique-constraint.js`: fix user email unique constraint.
- `20260507090000-add-unique-active-pending-credential-per-visit.js`: add unique active pending credential per visit.
- `20260513154800-add-requires-password-change-to-users.js`: add requires password change to users.
