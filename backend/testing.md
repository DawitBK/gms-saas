

Comments on the GMS Enterprise System

1. Duration Field

   * The duration is currently displayed in minutes. Additionally, the value *"0"* remains visible and cannot be removed, even after clearing the browser cache.
2. *Phone Number Validation*

   * When creating a *Host, Guest, or Admin* user, the *Phone Number* field should accept only numeric values and should not allow alphabetic characters or special symbols.
3. *Host Availability View*

   * When a Host logs in and navigates to the *Availability* tab, the *Primary Board Host* field should display only the name of the currently logged-in host and should not show other hosts.
4. *Automatic Population of Availability Details*

   * While setting a slot, the *Pattern Type, **Availability Date, and **Availability Time* should be automatically populated by the system instead of requiring manual entry by the user or host.
5. *Host Leave Management*

   * In cases where a Host is on unexpected leave, clarification is required on how the system manages the host's availability. Specifically:

     * How is the host's availability updated during the leave period?
     * Who is responsible for marking the host as inactive?
6. *Guest Visibility*

   * On the *Host* page, a host should only be able to view guests who are assigned to them. Guests assigned to other hosts should not be visible.
7. *Rate Limiting*

   * Increase the system's rate-limiting threshold to enhance security and prevent excessive or unauthorized requests.
8. *Role-Based Data Access*

   * Review and enforce role-based access controls to ensure users can only access information relevant to their assigned roles and responsibilities.
9. *Input Validation and Data Integrity*

   * Implement additional validation checks across all user input fields to improve data accuracy and prevent invalid data entry.
10. *Audit and Monitoring*

    * Consider enabling detailed audit logs for critical actions such as user creation, host availability updates, and role changes to improve traceability and system monitoring.





Hi Kalkidan, thanks for the detailed feedback, it's useful.

A few things first. The findings you listed were from the training session, not from a test pass on the updated build. The system has changed since then, so most of these need to be checked again on what's live now, not assumed to still be broken or still be fixed.

Also, this round only covered a small part of the system. For the next pass, here's what needs to be covered so we get a full picture:

1. Every role, checked separately. The system has 7 roles: guest, host, super host, reception, super reception, admin, and super admin. Each one needs its own login and its own check, not one general pass. For each role, confirm the dashboard loads correctly, every button and menu item actually works, and the role only sees the data it should see. For example a host should not see another host's guests, and a regular host should not have the same access as a super host.
2. A visit taken through every stage. Create a visit and follow it through booking, approval or decline, check in, and check out, and confirm it shows correctly to each role along the way. Right now we only confirmed a visit can be created, not that it behaves correctly through the whole process.
3. Both doors, both floors. Book a visit, get the access credential issued, and confirm the door actually opens on both the 6th floor and the 7th floor, using both the QR code and the PIN. Please test both methods on both floors separately.
4. A written test trail. For each test, note what you tested, which role you were logged in as, and whether it passed or failed, with a screenshot if something looks off. That way we have a record to go back to instead of relying on memory.

On the original list, here's where things stand:

1. Duration field showing minutes and a stuck zero value, needs to be rechecked on the current build.
2. Phone number validation on Host, Guest, and Admin forms, needs to be rechecked.
3. Host Availability showing other hosts, needs to be rechecked, this should now be locked to the logged in host only.
4. Pattern Type, Date, and Time not filling in automatically when setting a slot, needs to be rechecked.
5. Host on unexpected leave, this one needs a decision rather than a retest. Can you confirm with the team who is expected to mark a host inactive, and what should happen to that host's open slots when they do.
6. Host seeing guests assigned to other hosts, needs to be rechecked.
7. Rate limiting threshold, we need an actual number here before this can be marked resolved. If you have a suggested threshold in mind let me know.
8. Role based access, this is now covered by testing each role separately as described above, rather than as its own item.
9. Input validation across fields, same as above, this is part of testing each role's forms rather than a separate check.
   A few extra things worth checking that weren't on the list:

- Logging out and logging back in as a different role, to make sure nothing from the previous session carries over.
- Trying to open another role's page directly by typing the URL, to confirm it gets blocked.
- Two people trying to book the same host's same time slot at the same time.
- Checking the system on a phone or tablet, since reception and host desks may end up using one.

If it's easier, I can put this into a simple checklist you can fill in role by role as you go, so nothing gets missed and we have a clean trail at the end. Let me know and I'll send it over.






























There are two different kinds of "logs" in GMS, and neither has a UI page right now, so you'd be looking in two different places depending on which one you mean:

**1. Audit trail (user actions — approvals, role changes, user creation, etc.)**
This lives in the database, in the `audit_logs` table, written by `logAudit()` in `shared/services/audit.service.ts`.

> **Update (2026-07-13):** this is no longer DB-query-only. There is now an admin page, `/admin/audit-log`, backed by a read-only `GET /operations/audit-logs` endpoint (admin-only; filter by entity/action/actor/date range, paginated, expandable before/after per row). The direct SQL query below still works and is useful for ad-hoc digging, but testers/support no longer need DB access just to "check the audit log."

```sql
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50;
```

Each row has `action`, `entity`, `entity_id`, `user_id`, `request_id`, and a `metadata` JSON column with the before/after state. That `request_id` is the same trace ID that shows up in the app logs below, so you can cross-reference an audit entry with the exact log lines from that request.

**2. Application / runtime logs (errors, request traces, SLA breaches, email send attempts, etc.)**
These come from the `logger` (pino) and go to different places depending on environment:

* In production: written to files, `backend/logs/gms.log` (everything info and above) and `backend/logs/error.log` (errors only)
* In development: printed straight to the console where the server is running, not written to a file

If you're running this through PM2, `pm2 logs` will tail whichever of those it's writing to.

Worth flagging back to the tester: since there's no UI for the audit trail, "check the audit log" in the checklist means asking you or someone with DB access to pull the relevant rows, not something they can verify on their own through the app. Want me to add a note to that effect in the checklist, or split those audit-log items into a separate "needs dev support" column so the tester knows which ones they can't self-serve?
