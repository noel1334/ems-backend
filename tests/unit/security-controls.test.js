import { describe, expect, it } from "vitest";
import { generateRandomToken, hashToken } from "../../src/common/utils/crypto.js";
import { validateUploadedFileContent } from "../../src/middleware/upload.middleware.js";

describe("security controls", () => {
  it("generates non-reversible token hashes", () => {
    const token = generateRandomToken(32);
    expect(token).toHaveLength(64);
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toBe(token);
  });

  it("rejects mismatched uploaded file signatures", () => {
    const fakePng = { mimetype: "image/png", buffer: Buffer.from("not-a-png") };
    expect(validateUploadedFileContent(fakePng)).toBe(false);
  });

  it("accepts valid PDF magic bytes", () => {
    const pdf = { mimetype: "application/pdf", buffer: Buffer.from("%PDF-1.7 test") };
    expect(validateUploadedFileContent(pdf)).toBe(true);
  });
});
