import { describe, expect, it, vi } from "vitest";
import { listSchema, validate } from "../../src/modules/payroll/payroll.validators.js";

describe("payroll list query validation on Express 5", () => {
  it("stores parsed query values without assigning to Express's getter-only req.query", () => {
    const request = Object.create({
      get query() {
        return { page: "2", limit: "50", search: "Engineering" };
      },
    });
    const response = {};
    const next = vi.fn();

    expect(() => validate(listSchema, "query")(request, response, next)).not.toThrow();
    expect(request.validatedQuery).toEqual({
      page: 2,
      limit: 50,
      search: "Engineering",
    });
    expect(next).toHaveBeenCalledOnce();
  });

  it("reports invalid list parameters through the validation response", () => {
    const request = Object.create({ get query() { return { page: "0", limit: "999" }; } });
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    validate(listSchema, "query")(request, response, next);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(next).not.toHaveBeenCalled();
  });
});
