import { describe, expect, it } from "vitest";
import { hashPassword, normalizeUsername, registrationValidationMessage, verifyPassword } from "./kuppiAuth";

describe("Kuppi credentials", () => {
  it("normalizes usernames and rejects incomplete registration details", () => {
    expect(normalizeUsername("  Kuppi_Student ")).toBe("kuppi_student");
    expect(registrationValidationMessage({ fullName: "A", contactNumber: "0771234567", username: "student", password: "password123", confirmPassword: "password123" })).toBe("Enter your full name.");
    expect(registrationValidationMessage({ fullName: "Nadee Perera", contactNumber: "0771234567", username: "student", password: "password123", confirmPassword: "password123" })).toBeNull();
  });

  it("hashes passwords with a unique salt and verifies without exposing plaintext", async () => {
    const hash = await hashPassword("safepassword123");
    expect(hash).not.toContain("safepassword123");
    await expect(verifyPassword("safepassword123", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect", hash)).resolves.toBe(false);
  });
});
