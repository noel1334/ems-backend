import { describe, expect, it } from "vitest";
import {
  componentSchema,
  componentUpdateSchema,
  structureSchema,
  structureUpdateSchema,
} from "../../src/modules/payroll/payroll.validators.js";

const fixedComponent = {
  name: "Meal allowance",
  code: "meal",
  type: "EARNING",
  calculation: "FIXED",
  amount: 25000,
  percentage: null,
  isTaxable: true,
  isPensionable: false,
  isActive: true,
};

describe("payroll structure validation", () => {
  it("normalises structure and component codes and accepts an atomic template payload", () => {
    const parsed = structureSchema.safeParse({
      name: "Contract staff",
      code: "contract",
      description: "Example structure",
      components: [fixedComponent],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe("CONTRACT");
      expect(parsed.data.components[0].code).toBe("MEAL");
      expect(parsed.data.isActive).toBe(true);
    }
  });

  it("rejects duplicate component codes within a structure", () => {
    const parsed = structureSchema.safeParse({
      name: "Contract staff",
      code: "CONTRACT",
      components: [fixedComponent, { ...fixedComponent, name: "Different label" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a percentage for percentage-based components", () => {
    const parsed = componentSchema.safeParse({
      name: "Housing allowance",
      code: "HOUSING",
      type: "EARNING",
      calculation: "PERCENTAGE_OF_BASIC",
      amount: 0,
      isTaxable: true,
      isPensionable: false,
      isActive: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("allows an active flag-only component update", () => {
    expect(componentUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("allows structure deactivation through the update schema", () => {
    expect(structureUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});
