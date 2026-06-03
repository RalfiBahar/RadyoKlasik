jest.mock("../config/database", () => ({
  sequelize: { authenticate: jest.fn() },
}));
jest.mock("../services/healthChecks", () => ({
  checkTcp: jest.fn(),
}));

const { sequelize } = require("../config/database");
const { checkTcp } = require("../services/healthChecks");
const { health } = require("../controllers/healthController");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("GET /api/v1/health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 200 + status ok when all services are up", async () => {
    sequelize.authenticate.mockResolvedValue();
    checkTcp.mockResolvedValue(true);

    const res = mockRes();
    await health({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      services: { db: "up", icecast: "up", liquidsoap: "up" },
    });
  });

  test("reports icecast/liquidsoap down but stays 200/ok when only DB is up", async () => {
    sequelize.authenticate.mockResolvedValue();
    checkTcp.mockResolvedValue(false);

    const res = mockRes();
    await health({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.services).toEqual({
      db: "up",
      icecast: "down",
      liquidsoap: "down",
    });
  });

  test("returns 503 + degraded when the database is unreachable", async () => {
    sequelize.authenticate.mockRejectedValue(new Error("no db"));
    checkTcp.mockResolvedValue(true);

    const res = mockRes();
    await health({}, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.services.db).toBe("down");
    expect(res.body.services.icecast).toBe("up");
  });
});
