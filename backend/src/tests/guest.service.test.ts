import { describe, expect, it, jest } from "@jest/globals";
import { GuestService } from "../modules/guests/guest.service";

describe("GuestService own profile updates", () => {
  it("strips vip changes from self-service profile updates", async () => {
    const service = new GuestService();
    const repository = {
      updateProfile: jest.fn(async () => ({
        id: 17,
        user_id: 7,
        company: "Acme Plc",
        government_id: null,
        notes: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        preferred_notification_channel: "EMAIL",
        is_vip: false,
        document_url: null,
        ocr_text: null,
        user: {
          full_name: "Guest One",
          email: "guest1@example.com",
          phone: "+1555911000001",
        },
      })),
      getVisitStats: jest.fn(async () => ({
        visits_count: 0,
        last_visit_at: null,
        next_visit_at: null,
        status_breakdown: {},
        upcoming_count: 0,
      })),
    };

    (service as any).repository = repository;

    const result = await service.updateOwnProfile(7, {
      company: "Acme Plc",
      is_vip: true,
    });

    expect(repository.updateProfile.mock.calls[0]).toEqual([
      7,
      {
        company: "Acme Plc",
      },
    ]);
    expect(result.is_vip).toBe(false);
  });
});
