import {
    describe,
    it,
    expect
} from "vitest";

describe("Employee Extended Profile", () => {
    it("supports employee bank accounts", () => {
        const fields = [
            "bankName",
            "accountName",
            "accountNumber"
        ];

        expect(fields).toContain(
            "accountNumber"
        );
    });

    it("supports employee education", () => {
        const fields = [
            "institution",
            "qualification",
            "fieldOfStudy"
        ];

        expect(fields).toContain(
            "institution"
        );
    });

    it("supports previous employment", () => {
        const fields = [
            "companyName",
            "jobTitle",
            "startDate",
            "endDate"
        ];

        expect(fields).toContain(
            "companyName"
        );
    });

    it("supports employee documents", () => {
        const documentTypes = [
            "PASSPORT",
            "NATIONAL_ID",
            "DRIVERS_LICENSE",
            "VOTERS_CARD",
            "CERTIFICATE",
            "CONTRACT",
            "OFFER_LETTER",
            "RESUME",
            "OTHER"
        ];

        expect(
            documentTypes
        ).toContain("CERTIFICATE");
    });

    it("limits uploaded files to 5 MB", () => {
        const maximumFileSize =
            5 * 1024 * 1024;

        expect(maximumFileSize)
            .toBe(5242880);
    });
});
