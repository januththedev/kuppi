import { describe, expect, it } from "vitest";
import { matchesRecoveryIdentity, normalizePhoneNumber } from "./kuppiAuth";

describe("Kuppi account recovery identity matching", () => {
  const student = { fullName: "Januth Nimnal", contactNumber: "+94 77 123 4567", username: "januth_n" };

  it("matches the stored full name, formatted phone number, and username", () => {
    expect(normalizePhoneNumber("+94 (77) 123-4567")).toBe("+94771234567");
    expect(matchesRecoveryIdentity(student, { fullName: "januth nimnal", contactNumber: "+94771234567", username: "JANUTH_N" })).toBe(true);
  });

  it("rejects recovery when any identity detail does not match", () => {
    expect(matchesRecoveryIdentity(student, { fullName: "Januth Nimnal", contactNumber: "+94771234568", username: "januth_n" })).toBe(false);
    expect(matchesRecoveryIdentity(student, { fullName: "Januth Nimal", contactNumber: "+94771234567", username: "januth_n" })).toBe(false);
  });
});
