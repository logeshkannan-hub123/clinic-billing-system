import { describe, expect, it } from "vitest";
import { PatientModel } from "./Patient.js";

describe("Patient model", () => {
  it("passes validation with valid data", () => {
    const patient = new PatientModel({ name: "Asha Rao", nameKey: "asha rao", phone: "9876543210" });
    expect(patient.validateSync()).toBeUndefined();
  });

  it("requires name, nameKey, and phone", () => {
    const patient = new PatientModel({});
    const error = patient.validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.nameKey).toBeDefined();
    expect(error?.errors.phone).toBeDefined();
  });
});
