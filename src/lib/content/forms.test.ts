import { describe, expect, it } from "vitest";
import { parseContactForm, parseNewsletterForm } from "./forms";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const VALID = {
  name: "  Asha Rao ",
  email: "Asha@Example.com",
  phone: "",
  topic: "order",
  orderNo: " bv-o-000123 ",
  message: "Where is my parcel? It has been a week.",
  website: "",
};

describe("parseContactForm", () => {
  it("normalises a valid message", () => {
    expect(parseContactForm(form(VALID))).toEqual({
      ok: true,
      data: {
        name: "Asha Rao",
        email: "asha@example.com",
        phone: null,
        topic: "order",
        orderNo: "BV-O-000123",
        message: "Where is my parcel? It has been a week.",
      },
    });
  });

  it("normalises an Indian mobile number", () => {
    const result = parseContactForm(form({ ...VALID, phone: "098765 43210" }));
    expect(result).toMatchObject({ ok: true, data: { phone: "+919876543210" } });
  });

  it("reports each invalid field", () => {
    const result = parseContactForm(
      form({ ...VALID, name: "A", email: "nope", phone: "12345", topic: "spam", orderNo: "x!", message: "short" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["email", "message", "name", "orderNo", "phone", "topic"]);
  });

  it("flags bots that fill the hidden field", () => {
    expect(parseContactForm(form({ ...VALID, website: "http://spam.example" }))).toEqual({ ok: false, bot: true, errors: {} });
  });

  it("caps the message length", () => {
    expect(parseContactForm(form({ ...VALID, message: "x".repeat(2001) })).ok).toBe(false);
  });
});

describe("parseNewsletterForm", () => {
  it("accepts and lower-cases an email", () => {
    expect(parseNewsletterForm(form({ email: " News@Example.COM ", website: "" }))).toEqual({ ok: true, email: "news@example.com" });
  });

  it("rejects invalid emails and bots", () => {
    expect(parseNewsletterForm(form({ email: "not-an-email" }))).toMatchObject({ ok: false, bot: false });
    expect(parseNewsletterForm(form({ email: "a@b.co", website: "x" }))).toMatchObject({ ok: false, bot: true });
  });
});
