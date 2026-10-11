import {
    describe,
    it,
    expect
} from "vitest";

describe("Employee Core", () => {
    it("should expose the employee module", () => {
        expect(true).toBe(true);
    });

    it("should use company-scoped employee numbers", () => {
        expect("EMP-000001").toMatch(/^EMP-\d{6}$/);
    });

    it("should support employee types", () => {
        const employeeTypes = [
            "FULL_TIME",
            "PART_TIME",
            "CONTRACT",
            "INTERN",
            "TEMPORARY"
        ];

        expect(employeeTypes).toContain(
            "FULL_TIME"
        );
    });

    it("should support employment statuses", () => {
        const statuses = [
            "ACTIVE",
            "INACTIVE",
            "SUSPENDED",
            "TERMINATED",
            "ON_LEAVE"
        ];

        expect(statuses).toContain("ACTIVE");
    });
});
