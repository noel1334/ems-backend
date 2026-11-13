import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("axios", () => ({
  default: {
    create: () => ({
      interceptors: { request: { use: vi.fn() } },
      post,
    }),
  },
}));

import { initializeFlutterwaveTransaction } from "../../src/modules/payments/flutterwave/flutterwave.client.js";

describe("Flutterwave company subaccount collection allocation", () => {
  beforeEach(() => post.mockReset());

  it("sets the platform flat commission to zero so the company subaccount receives the settlement remainder", async () => {
    post.mockResolvedValue({ data: { status: "success", data: { link: "https://checkout.flutterwave.com/test" } } });
    await initializeFlutterwaveTransaction({
      email: "finance@example.com",
      amount: "50000.00",
      reference: "PAY-123",
      callbackUrl: "https://ems.example/app/wallet",
      subaccountId: "RS_COMPANY123456",
    });
    const payload = post.mock.calls[0][1];
    expect(payload.subaccounts).toEqual([{
      id: "RS_COMPANY123456",
      transaction_charge_type: "flat",
      transaction_charge: 0,
    }]);
  });

  it("does not add a split when no company subaccount is configured", async () => {
    post.mockResolvedValue({ data: { status: "success" } });
    await initializeFlutterwaveTransaction({
      email: "finance@example.com",
      amount: "50000.00",
      reference: "PAY-124",
      callbackUrl: "https://ems.example/app/wallet",
    });
    expect(post.mock.calls[0][1]).not.toHaveProperty("subaccounts");
  });
});
