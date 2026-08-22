import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { ENV } from "./_core/env";
import { getStudentById } from "./kuppiDb";

const scryptAsync = promisify(scrypt);
export const KUPPI_SESSION_COOKIE = "kuppi_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14;

function signingKey() {
  if (!ENV.cookieSecret) throw new Error("Kuppi session signing is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function readCookie(request: Request, name: string): string | null {
  const encoded = request.headers.cookie?.split(";").find((item) => item.trim().startsWith(`${name}=`));
  if (!encoded) return null;
  return decodeURIComponent(encoded.trim().slice(name.length + 1));
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function registrationValidationMessage(input: {
  fullName: string;
  contactNumber: string;
  username: string;
  password: string;
  confirmPassword: string;
}) {
  if (input.fullName.trim().length < 2) return "Enter your full name.";
  if (!/^[0-9+()\-\s]{7,32}$/.test(input.contactNumber.trim())) return "Enter a valid contact number.";
  if (!/^[a-z0-9_]{3,32}$/.test(normalizeUsername(input.username))) return "Usernames must use 3–32 lowercase letters, numbers, or underscores.";
  if (input.password.length < 8) return "Your password must be at least 8 characters.";
  if (input.password !== input.confirmPassword) return "Passwords do not match.";
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, storedKey] = storedHash.split(":");
  if (!salt || !storedKey) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(storedKey, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function setStudentSession(response: Response, student: { id: number; username: string }) {
  const token = await new SignJWT({ username: student.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(student.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(signingKey());

  response.cookie(KUPPI_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS * 1000,
  });
}

export function clearStudentSession(response: Response) {
  response.clearCookie(KUPPI_SESSION_COOKIE, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: -1,
  });
}

export async function getStudentFromRequest(request: Request) {
  const token = readCookie(request, KUPPI_SESSION_COOKIE);
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, signingKey());
    const id = Number(verified.payload.sub);
    if (!Number.isInteger(id) || id <= 0) return null;
    return await getStudentById(id);
  } catch {
    return null;
  }
}
