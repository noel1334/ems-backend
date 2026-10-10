import {
    describe,
    expect,
    it,
} from "vitest";

import {
    differenceInMinutes,
} from "date-fns";

describe("Attendance calculations", () => {
    it("calculates worked minutes excluding breaks", () => {
        const checkIn =
            new Date(
                "2026-09-14T08:00:00",
            );

        const checkOut =
            new Date(
                "2026-09-14T17:00:00",
            );

        const breakMinutes = 60;

        const gross =
            differenceInMinutes(
                checkOut,
                checkIn,
            );

        const worked =
            gross - breakMinutes;

        expect(gross).toBe(540);
        expect(worked).toBe(480);
    });

    it("calculates late minutes after grace period", () => {
        const scheduled =
            new Date(
                "2026-09-14T08:00:00",
            );

        const checkIn =
            new Date(
                "2026-09-14T08:25:00",
            );

        const grace = 15;

        const effectiveStart =
            new Date(scheduled);

        effectiveStart.setMinutes(
            effectiveStart.getMinutes() +
            grace,
        );

        const late =
            differenceInMinutes(
                checkIn,
                effectiveStart,
            );

        expect(late).toBe(10);
    });

    it("does not mark an employee late within grace period", () => {
        const scheduled =
            new Date(
                "2026-09-14T08:00:00",
            );

        const checkIn =
            new Date(
                "2026-09-14T08:12:00",
            );

        const grace = 15;

        const effectiveStart =
            new Date(scheduled);

        effectiveStart.setMinutes(
            effectiveStart.getMinutes() +
            grace,
        );

        const late =
            Math.max(
                0,
                differenceInMinutes(
                    checkIn,
                    effectiveStart,
                ),
            );

        expect(late).toBe(0);
    });

    it("calculates overnight shift duration", () => {
        const checkIn =
            new Date(
                "2026-09-14T22:00:00",
            );

        const checkOut =
            new Date(
                "2026-09-15T06:00:00",
            );

        const worked =
            differenceInMinutes(
                checkOut,
                checkIn,
            );

        expect(worked).toBe(480);
    });

    it("calculates multiple breaks", () => {
        const breaks = [
            {
                start: new Date(
                    "2026-09-14T10:00:00",
                ),
                end: new Date(
                    "2026-09-14T10:15:00",
                ),
            },
            {
                start: new Date(
                    "2026-09-14T13:00:00",
                ),
                end: new Date(
                    "2026-09-14T13:45:00",
                ),
            },
        ];

        const total = breaks.reduce(
            (sum, item) =>
                sum +
                differenceInMinutes(
                    item.end,
                    item.start,
                ),
            0,
        );

        expect(total).toBe(60);
    });
});
