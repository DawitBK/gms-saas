import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { EventEmitter } from "events";
import { idempotencyMiddleware } from "../shared/middleware/idempotency.middleware";
import { IdempotencyKey } from "../infrastructure/database/models/idempotencyKey.model";
import { AppError } from "../core/errors/AppError";
import { ErrorCodes } from "../core/errors/errorCodes";

jest.mock("../infrastructure/database/models/idempotencyKey.model", () => ({
  IdempotencyKey: {
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock("../core/logger/logger", () => ({
  logger: {
    error: jest.fn(),
  },
}));

type MockRes = EventEmitter & {
  statusCode: number;
  writableEnded: boolean;
  status: (code: number) => MockRes;
  json: (body: unknown) => unknown;
  send: (body?: unknown) => unknown;
};

const mockedIdempotencyKey = IdempotencyKey as unknown as {
  findByPk: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  destroy: jest.Mock;
};

const createReq = (key?: string) =>
  ({
    headers: key ? { "idempotency-key": key } : {},
  }) as any;

const createRes = (): MockRes => {
  const emitter = new EventEmitter() as MockRes;
  emitter.statusCode = 200;
  emitter.writableEnded = false;
  emitter.status = ((code: number) => {
    emitter.statusCode = code;
    return emitter;
  }) as any;
  emitter.json = ((body: unknown) => body) as any;
  emitter.send = ((body?: unknown) => body ?? null) as any;
  return emitter;
};

describe("idempotencyMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns conflict when an idempotency key is still processing", async () => {
    (mockedIdempotencyKey.findByPk as any).mockResolvedValue({
      response: null,
    });
    const req = createReq("same-key");
    const res = createRes();
    const next = jest.fn();

    await idempotencyMiddleware(req, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    const arg = next.mock.calls[0][0] as AppError;
    expect(arg).toBeInstanceOf(AppError);
    expect(arg.statusCode).toBe(409);
    expect(arg.code).toBe(ErrorCodes.INVALID_INPUT);
  });

  it("persists a response when the route sends json and replays from cache", async () => {
    (mockedIdempotencyKey.findByPk as any).mockResolvedValue(null);
    (mockedIdempotencyKey.create as any).mockResolvedValue({ key: "json-key" });
    (mockedIdempotencyKey.update as any).mockResolvedValue([1]);
    const req = createReq("json-key");
    const res = createRes();
    const next = jest.fn();

    await idempotencyMiddleware(req, res as any, next as any);
    res.statusCode = 201;
    res.json({ ok: true });

    expect(next).toHaveBeenCalledWith();
    expect(mockedIdempotencyKey.update).toHaveBeenCalledWith(
      { response: { status: 201, body: { ok: true } } },
      { where: { key: "json-key" } },
    );
  });

  it("releases a stale processing lock when connection closes before a response is persisted", async () => {
    (mockedIdempotencyKey.findByPk as any).mockResolvedValue(null);
    (mockedIdempotencyKey.create as any).mockResolvedValue({
      key: "close-key",
    });
    (mockedIdempotencyKey.destroy as any).mockResolvedValue(1);

    const req = createReq("close-key");
    const res = createRes();
    const next = jest.fn();

    await idempotencyMiddleware(req, res as any, next as any);
    next(new Error("route failed"));
    res.emit("close");

    expect(mockedIdempotencyKey.destroy).toHaveBeenCalledWith({
      where: { key: "close-key", response: null },
    });
  });
});
