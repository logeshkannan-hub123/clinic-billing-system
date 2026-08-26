import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PatientModel } from "../models/Patient.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import { findOrCreatePatient } from "./patientService.js";

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("findOrCreatePatient", () => {
  it("creates a new patient when none matches", async () => {
    const patient = await findOrCreatePatient("Asha Rao", "9876543210");
    expect(patient.name).toBe("Asha Rao");
    expect(patient.phone).toBe("9876543210");
  });

  it("reuses the existing patient for an exact name+phone match", async () => {
    const first = await findOrCreatePatient("Asha Rao", "9876543210");
    const second = await findOrCreatePatient("Asha Rao", "9876543210");
    expect(second._id.toString()).toBe(first._id.toString());

    const count = await PatientModel.countDocuments();
    expect(count).toBe(1);
  });

  it("matches case-insensitively and trims whitespace", async () => {
    const first = await findOrCreatePatient("Asha Rao", "9876543210");
    const second = await findOrCreatePatient("  ASHA RAO  ", "  9876543210  ");
    expect(second._id.toString()).toBe(first._id.toString());
  });

  it("creates a separate patient for a different name sharing the same phone", async () => {
    const first = await findOrCreatePatient("Asha Rao", "9876543210");
    const second = await findOrCreatePatient("Kiran Rao", "9876543210");
    expect(second._id.toString()).not.toBe(first._id.toString());

    const count = await PatientModel.countDocuments();
    expect(count).toBe(2);
  });

  it("creates a separate patient for the same name with a different phone", async () => {
    const first = await findOrCreatePatient("Asha Rao", "9876543210");
    const second = await findOrCreatePatient("Asha Rao", "9999999999");
    expect(second._id.toString()).not.toBe(first._id.toString());
  });

  it("never creates duplicates under concurrent requests for the same person", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => findOrCreatePatient("Asha Rao", "9876543210")),
    );

    const uniqueIds = new Set(results.map((patient) => patient._id.toString()));
    expect(uniqueIds.size).toBe(1);

    const count = await PatientModel.countDocuments();
    expect(count).toBe(1);
  });
});
