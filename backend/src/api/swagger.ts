import { appConfig } from "../config/app.config";
import {
  OPERATOR_VISIT_STATUSES,
  STORED_VISIT_STATUSES,
} from "../modules/visits/visit-statuses";

export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "GMS Enterprise API",
    version: "1.0.0",
    description:
      "Production-grade multi-office Guest Management System. " +
      "All endpoints require JWT bearer authentication unless noted.",
  },
  servers: [{ url: appConfig.api.basePath, description: "Versioned API" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      refreshTokenCookie: {
        type: "apiKey",
        in: "cookie",
        name: "gms_refresh_token",
      },
      csrfHeader: {
        type: "apiKey",
        in: "header",
        name: "X-CSRF-Token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "UNAUTHORIZED" },
              message: { type: "string" },
              details: {
                type: "array",
                items: { type: "object" },
                nullable: true,
              },
              request_id: { type: "string", format: "uuid", nullable: true },
            },
          },
        },
      },
      Meta: {
        type: "object",
        properties: {
          total: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
          totalPages: { type: "integer" },
          summary: { type: "object", nullable: true },
          request_id: { type: "string", format: "uuid", nullable: true },
        },
      },
      PaginatedMeta: {
        $ref: "#/components/schemas/Meta",
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          full_name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          office_id: { type: "integer", nullable: true },
          department_id: { type: "integer", nullable: true },
          status: { type: "string" },
          presence: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          company: { type: "string", nullable: true },
          government_id: { type: "string", nullable: true },
          document_url: { type: "string", nullable: true },
          office_name: { type: "string", nullable: true },
          department_name: { type: "string", nullable: true },
        },
      },
      CreateUserRequest: {
        type: "object",
        required: ["full_name", "email", "password", "roles"],
        properties: {
          full_name: { type: "string", minLength: 2 },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          password: { type: "string", minLength: 6 },
          roles: { type: "array", minItems: 1, items: { type: "string" } },
          office_id: { type: "integer", nullable: true },
          department_id: { type: "integer", nullable: true },
          company: { type: "string" },
          government_id: { type: "string" },
        },
        description:
          "Host users require office_id and department_id. Reception users require office_id.",
      },
      SetRolesRequest: {
        type: "object",
        required: ["roles"],
        properties: {
          roles: { type: "array", minItems: 1, items: { type: "string" } },
        },
        description:
          "Assigning host requires an existing host profile. Assigning reception requires an office assignment.",
      },
      CreateVisitRequest: {
        type: "object",
        required: ["office_id", "time_slot_id"],
        properties: {
          service_id: { type: "integer", nullable: true },
          department_id: { type: "integer", nullable: true },
          office_id: { type: "integer" },
          host_id: { type: "integer" },
          time_slot_id: { type: "integer" },
          guest_id: { type: "integer" },
          guest_payload: {
            type: "object",
            properties: {
              full_name: { type: "string" },
              email: { type: "string", format: "email" },
              phone: { type: "string" },
              company: { type: "string", nullable: true },
              government_id: { type: "string", nullable: true },
            },
          },
          purpose: { type: "string" },
        },
      },
      UpdateVisitStatusRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: [...STORED_VISIT_STATUSES],
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Auth", description: "Authentication & token management" },
    { name: "Users", description: "User management (admin)" },
    { name: "Offices", description: "Office configuration" },
    { name: "Visits", description: "Guest visit booking lifecycle" },
    {
      name: "Check-in",
      description: "QR verification and arrival processing",
    },
    { name: "Operations", description: "System metrics, reports, and bulk imports" },
    { name: "Integrations", description: "UniFi and external service links" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        security: [],
        responses: {
          200: {
            description: "API is operational",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: {
                          type: "string",
                          example: "API is operational",
                        },
                      },
                    },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and receive JWT tokens",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    example: "admin@gms.io",
                  },
                  password: {
                    type: "string",
                    minLength: 6,
                    example: "secret123",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        user: { type: "object" },
                        accessToken: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          401: {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new guest account and trigger OTP verification",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  full_name: { type: "string", example: "John Doe" },
                  email: { type: "string", format: "email" },
                  phone: { type: "string", example: "+1555911223344" },
                  password: { type: "string", minLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description:
              "Account created successfully; OTP verification still required",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        message: {
                          type: "string",
                          example:
                            "Registration successful. Please check your email for the verification code.",
                        },
                        email: { type: "string", format: "email" },
                      },
                    },
                  },
                },
              },
            },
          },
          409: {
            description: "Email already in use",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/auth/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify the registration OTP and start the first session",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "otp"],
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    example: "guest@example.com",
                  },
                  otp: {
                    type: "string",
                    minLength: 6,
                    maxLength: 6,
                    example: "123456",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Verification successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "object",
                      properties: {
                        user: { type: "object" },
                        accessToken: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Invalid or expired verification code",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          404: {
            description: "Account not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Check whether the current refresh session is still valid",
        security: [{ refreshTokenCookie: [] }],
        responses: {
          200: { description: "Refresh session is still valid" },
          401: { description: "Refresh session is missing or invalid" },
        },
      },
    },
    "/offices": {
      get: {
        tags: ["Offices"],
        summary: "List all active offices",
        responses: {
          200: { description: "Office list returned" },
        },
      },
      post: {
        tags: ["Offices"],
        summary: "Create a new office (admin only)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "address", "city", "country", "timezone"],
                properties: {
                  name: { type: "string" },
                  address: { type: "string" },
                  city: { type: "string" },
                  country: { type: "string" },
                  timezone: { type: "string", example: "UTC" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Office created" },
          403: { description: "Admin role required" },
        },
      },
    },
    "/offices/{id}": {
      get: {
        tags: ["Offices"],
        summary: "Get office by ID",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          200: { description: "Office found" },
          404: { description: "Not found" },
        },
      },
    },
    "/visits": {
      get: {
        tags: ["Visits"],
        summary: "List visits (paginated)",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: { type: "integer", default: 1 },
          },
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", default: 20 },
          },
          {
            in: "query",
            name: "status",
            schema: { type: "string", enum: [...OPERATOR_VISIT_STATUSES] },
          },
        ],
        responses: {
          200: {
            description: "Paginated visit list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { type: "object" } },
                    meta: { $ref: "#/components/schemas/PaginatedMeta" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Visits"],
        summary: "Book a new visit (idempotent)",
        description: "Supports `Idempotency-Key` header for safe retries.",
        parameters: [
          {
            in: "header",
            name: "Idempotency-Key",
            schema: { type: "string" },
            description: "Unique key to prevent duplicate bookings",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateVisitRequest",
              },
            },
          },
        },
        responses: {
          201: { description: "Visit booked successfully" },
          409: {
            description: "Slot already booked (SLOT_LOCKED)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/visits/{id}": {
      get: {
        tags: ["Visits"],
        summary: "Get visit by ID",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          200: { description: "Visit details" },
          404: { description: "Visit not found" },
        },
      },
    },
    "/visits/{id}/regenerate-qr": {
      post: {
        tags: ["Visits"],
        summary: "Regenerate access credentials for a visit",
        description: "Invalidates the old QR/PIN and issues a new one. Required when guest loses access.",
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "integer" } }
        ],
        responses: {
          200: { description: "New credentials issued" },
          404: { description: "Visit not found" }
        }
      }
    },
    "/visits/{id}/status": {
      patch: {
        tags: ["Visits"],
        summary: "Update visit status (admin, host, reception)",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateVisitStatusRequest",
              },
            },
          },
        },
        responses: {
          200: { description: "Status updated" },
          400: { description: "Invalid transition (terminal state)" },
        },
      },
    },
    "/checkin": {
      post: {
        tags: ["Check-in"],
        summary: "Verify a visit QR code or force a manual check-in override",
        description:
          "By default, this endpoint verifies an APPROVED visit QR code and leaves the visit in APPROVED until UniFi Access confirms the credential at the access device. " +
          "Privileged staff may set manual_override to true to force CHECKED_IN when UniFi confirmation is unavailable.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["qr_code"],
                properties: {
                  qr_code: {
                    type: "string",
                    minLength: 1,
                    example: "550e8400-e29b-41d4-a716-446655440000",
                    description:
                      "Any non-empty QR identifier. System-generated codes are UUID-like but the endpoint accepts any non-empty string.",
                  },
                  manual_override: {
                    type: "boolean",
                    example: false,
                    description:
                      "When true, privileged staff can force CHECKED_IN without waiting for the UniFi confirmation event.",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "QR verified or visit manually checked in" },
          400: { description: "QR invalid or visit is not in APPROVED state" },
          403: { description: "Admin, reception, or host role required" },
          404: { description: "Visit not found for QR code" },
        },
      },
    },
    "/users/profile": {
      get: {
        tags: ["Users"],
        summary: "Get own profile",
        responses: { 200: { description: "Current user profile" } },
      },
    },
    "/users": {
      get: {
        tags: ["Users"],
        summary: "List all users (admin only)",
        parameters: [
          { in: "query", name: "page", schema: { type: "integer" } },
          { in: "query", name: "limit", schema: { type: "integer" } },
        ],
        responses: {
          200: { description: "Paginated user list" },
          403: { description: "Admin required" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a user (admin only)",
        description:
          "Creates the user plus any required role-backed profile records. Host users require office and department provisioning. Reception users require office provisioning.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserRequest" },
            },
          },
        },
        responses: {
          201: { description: "User created" },
          400: { description: "Provisioning requirements were not met" },
          403: { description: "Admin required" },
          409: { description: "Email already in use" },
        },
      },
    },
    "/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get user by ID (admin, reception)",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          200: { description: "User found" },
          404: { description: "Not found" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Soft-delete a user (admin only)",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          200: { description: "User deleted" },
          403: { description: "Admin required" },
        },
      },
    },
    "/users/{id}/roles": {
      post: {
        tags: ["Users"],
        summary: "Set user roles (admin only)",
        description:
          "Assigning host requires a backing host profile. Assigning reception requires an office-scoped user.",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SetRolesRequest" },
            },
          },
        },
        responses: {
          200: { description: "Roles updated" },
          400: { description: "Provisioning requirements were not met" },
          403: { description: "Admin required" },
          404: { description: "User not found" },
        },
      },
    },
    "/metrics": {
      get: {
        tags: ["System"],
        summary: "Prometheus metrics endpoint",
        security: [],
        responses: {
          200: {
            description: "Metrics in Prometheus format",
            content: { "text/plain": { schema: { type: "string" } } },
          },
          404: { description: "Metrics disabled" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh session using refresh cookie",
        security: [{ refreshTokenCookie: [] }],
        responses: {
          200: { description: "Session refreshed" },
          401: { description: "Invalid or missing refresh token" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout (clear refresh cookie)",
        security: [{ refreshTokenCookie: [] }],
        responses: { 200: { description: "Logged out" } },
      },
    },
    "/visits/{id}/messages": {
      get: {
        tags: ["Visits"],
        summary: "List messages for a visit",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: { 200: { description: "Messages list" } },
      },
      post: {
        tags: ["Visits"],
        summary: "Post a message to a visit",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { content: { type: "string" } },
              },
            },
          },
        },
        responses: { 201: { description: "Message created" } },
      },
    },
    "/visits/{id}/qr.png": {
      get: {
        tags: ["Visits"],
        summary: "Download QR image for visit",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": {
            description: "PNG image",
            content: {
              "image/png": { schema: { type: "string", format: "binary" } },
            },
          },
          404: { description: "QR code unavailable" },
        },
      },
    },
    "/integrations/unifi/webhooks/access": {
      post: {
        tags: ["Integrations"],
        summary: "UniFi Access webhook receiver",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "Webhook processed" },
          400: { description: "Invalid payload" },
        },
      },
    },
    "/operations/bulk-template": {
      get: {
        tags: ["Operations"],
        summary: "Download organizational Excel template",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Excel file buffer",
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" }
              }
            }
          }
        }
      }
    },
    "/operations/bulk-import-org": {
      post: {
        tags: ["Operations"],
        summary: "Import organizational data from Excel JSON",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  offices: { type: "array", items: { type: "object" } },
                  departments: { type: "array", items: { type: "object" } },
                  services: { type: "array", items: { type: "object" } },
                  hosts: { type: "array", items: { type: "object" } }
                }
              }
            }
          }
        },
        responses: {
          200: { description: "Import results with row-level success/failure" }
        }
      }
    },
    "/operations/dashboard": {
      get: {
        tags: ["Operations"],
        summary: "Get system-wide or office-scoped metrics dashboard",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Dashboard stats and alerts" }
        }
      }
    },
    "/operations/reports": {
      get: {
        tags: ["Operations"],
        summary: "Get detailed visit reports and analytics",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "query", name: "startDate", schema: { type: "string", format: "date" } },
          { in: "query", name: "endDate", schema: { type: "string", format: "date" } },
          { in: "query", name: "officeId", schema: { type: "integer" } },
          { in: "query", name: "departmentId", schema: { type: "integer" } },
          { in: "query", name: "hostId", schema: { type: "integer" } },
          { in: "query", name: "status", schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Report metrics and trend data" }
        }
      }
    }
  },
};

Object.assign(swaggerSpec.paths, {
  "/license/status": {
    get: {
      tags: ["System"],
      summary: "Platform licence status (state, expiry, seats, enabled modules)",
      description:
        "Any authenticated user. state is one of unconfigured | unknown | active | expiring | grace | expired; readOnly is true only for expired under LICENSE_ENFORCEMENT=enforce. See docs/operations/PLATFORM-LICENSING.md.",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Licence status (adds required, licensed, reason, deployment: PLATFORM-LICENSING.md section 9)" } },
    },
  },
  "/license/install": {
    post: {
      tags: ["System"],
      summary: "Install a signed licence token",
      description:
        "Unauthenticated and rate-limited: the token's signature is the authority. Body {token}. Verified against the trusted licence keys like a token SSO served; never lowers the stored version. 400 INVALID_INPUT when rejected, 429 when rate-limited. See docs/operations/PLATFORM-LICENSING.md section 9.",
      responses: { 200: { description: "Install outcome (installed | unchanged | ignored_older)" } },
    },
  },
  "/availability/time_slots/{id}": {
    delete: { tags: ["Availability"], summary: "Delete a generated time slot", security: [{ bearerAuth: [] }] },
  },
  "/hosts/{id}/services": {
    put: { tags: ["Hosts"], summary: "Replace host service assignments", security: [{ bearerAuth: [] }] },
    delete: { tags: ["Hosts"], summary: "Remove service assignments from a host", security: [{ bearerAuth: [] }] },
  },
  "/hosts/{id}/services/add": {
    post: { tags: ["Hosts"], summary: "Add service assignments to a host", security: [{ bearerAuth: [] }] },
  },
  "/hosts/{id}/services/{serviceId}": {
    delete: { tags: ["Hosts"], summary: "Remove one service assignment from a host", security: [{ bearerAuth: [] }] },
  },
  "/notifications/vapid-public-key": {
    get: { tags: ["Notifications"], summary: "Get the Web Push VAPID public key", security: [{ bearerAuth: [] }] },
  },
  "/notifications/push-subscription": {
    post: { tags: ["Notifications"], summary: "Save current-user Web Push subscription", security: [{ bearerAuth: [] }] },
    delete: { tags: ["Notifications"], summary: "Delete current-user Web Push subscription", security: [{ bearerAuth: [] }] },
  },
  "/services/{id}/hosts": {
    post: { tags: ["Services"], summary: "Add hosts to a service", security: [{ bearerAuth: [] }] },
  },
  "/services/{id}/hosts/{hostId}": {
    delete: { tags: ["Services"], summary: "Remove one host from a service", security: [{ bearerAuth: [] }] },
  },
  "/visits/{id}/extend": {
    post: { tags: ["Visits"], summary: "Extend a checked-in or in-progress visit", security: [{ bearerAuth: [] }] },
  },
  "/visits/{id}/feedback": {
    post: { tags: ["Visits"], summary: "Submit guest feedback for a visit", security: [{ bearerAuth: [] }] },
  },
  "/visits/{id}/restore": {
    post: { tags: ["Visits"], summary: "Restore an archived visit", security: [{ bearerAuth: [] }] },
  },
  "/guests/{id}": {
    get: { tags: ["Guests"], summary: "Get a managed guest profile", security: [{ bearerAuth: [] }] },
    patch: { tags: ["Guests"], summary: "Update a managed guest profile", security: [{ bearerAuth: [] }] },
  },
  "/guests/bulk-import": {
    post: { tags: ["Guests"], summary: "Bulk import guests", security: [{ bearerAuth: [] }] },
  },
  "/users/bulk-import": {
    post: { tags: ["Users"], summary: "Bulk import users", security: [{ bearerAuth: [] }] },
  },
  "/auth/forgot-password": {
    post: { tags: ["Auth"], summary: "Start password reset flow", security: [] },
  },
  "/auth/reset-password": {
    post: { tags: ["Auth"], summary: "Complete password reset flow", security: [] },
  },
  "/auth/verify-2fa": {
    post: { tags: ["Auth"], summary: "Verify a two-factor authentication code", security: [] },
  },
  "/auth/change-password": {
    post: { tags: ["Auth"], summary: "Change current-user password", security: [{ bearerAuth: [] }] },
  },
  "/auth/toggle-2fa": {
    post: { tags: ["Auth"], summary: "Enable or disable two-factor authentication", security: [{ bearerAuth: [] }] },
  },
  "/auth/verify-password": {
    post: { tags: ["Auth"], summary: "Verify current-user password", security: [{ bearerAuth: [] }] },
  },
  "/checkin/manual": {
    post: { tags: ["Check-in"], summary: "Manually check in a visit when UniFi confirmation is unavailable", security: [{ bearerAuth: [] }] },
  },
  "/credentials/visit/{visitId}/fallback-qr": {
    post: { tags: ["Credentials"], summary: "Issue an internal fallback QR credential for a visit", security: [{ bearerAuth: [] }] },
  },
  "/operations/seed": {
    post: { tags: ["Operations"], summary: "Start the system seed workflow (refused with 403 in production and on the mirror)", security: [{ bearerAuth: [] }] },
  },
  "/operations/seed/{runId}": {
    get: { tags: ["Operations"], summary: "Get system seed workflow status", security: [{ bearerAuth: [] }] },
  },
  "/ocr/scan": {
    post: { tags: ["OCR"], summary: "Scan an identity document image", security: [{ bearerAuth: [] }] },
  },
  "/simulation/start": {
    post: { tags: ["Simulation"], summary: "Start the development simulation engine", security: [{ bearerAuth: [] }] },
  },
  "/simulation/stop": {
    post: { tags: ["Simulation"], summary: "Stop the development simulation engine", security: [{ bearerAuth: [] }] },
  },
  "/simulation/status": {
    get: { tags: ["Simulation"], summary: "Get simulation engine status", security: [{ bearerAuth: [] }] },
  },
});

(swaggerSpec.paths as Record<string, any>)["/users/{id}"].patch = {
  tags: ["Users"],
  summary: "Update a user",
  security: [{ bearerAuth: [] }],
};

(swaggerSpec.paths as Record<string, any>)["/visits/{id}"].delete = {
  tags: ["Visits"],
  summary: "Archive a visit",
  security: [{ bearerAuth: [] }],
};
