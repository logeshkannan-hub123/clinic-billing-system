import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { MedicineModel } from "./Medicine.js";

function validMedicineData() {
  return {
    category: "MEDICINE",
    name: "Dolo 500",
    brandName: "Dolo",
    genericName: "Paracetamol",
    composition: "Paracetamol 500 mg",
    strength: "500 mg",
    billingUnit: "tablet",
    mrpInPaise: 350,
    sellingPriceInPaise: 300,
    createdBy: new Types.ObjectId(),
  };
}

describe("Medicine model", () => {
  it("passes validation with valid data", () => {
    const medicine = new MedicineModel(validMedicineData());
    expect(medicine.validateSync()).toBeUndefined();
  });

  it("defaults status to ACTIVE", () => {
    const medicine = new MedicineModel(validMedicineData());
    expect(medicine.status).toBe("ACTIVE");
  });

  it("allows an unbranded/generic medicine (brandName omitted)", () => {
    const data = validMedicineData();
    (data as Record<string, unknown>).brandName = undefined;
    const medicine = new MedicineModel(data);
    expect(medicine.validateSync()).toBeUndefined();
    expect(medicine.brandName).toBeNull();
  });

  it("rejects an invalid category", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), category: "TABLET" });
    const error = medicine.validateSync();
    expect(error?.errors.category).toBeDefined();
  });

  it("rejects a missing genericName", () => {
    const data = validMedicineData();
    (data as Record<string, unknown>).genericName = undefined;
    const medicine = new MedicineModel(data);
    const error = medicine.validateSync();
    expect(error?.errors.genericName).toBeDefined();
  });

  it("rejects a missing composition", () => {
    const data = validMedicineData();
    (data as Record<string, unknown>).composition = undefined;
    const medicine = new MedicineModel(data);
    const error = medicine.validateSync();
    expect(error?.errors.composition).toBeDefined();
  });

  it("rejects an unrecognized billingUnit", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), billingUnit: "kg" });
    const error = medicine.validateSync();
    expect(error?.errors.billingUnit).toBeDefined();
  });

  it("accepts the newly added unit types (vial, ampoule, piece)", () => {
    for (const unit of ["vial", "ampoule", "piece"]) {
      const medicine = new MedicineModel({ ...validMedicineData(), billingUnit: unit });
      expect(medicine.validateSync()).toBeUndefined();
    }
  });

  it("rejects a non-integer mrpInPaise", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), mrpInPaise: 3.5 });
    const error = medicine.validateSync();
    expect(error?.errors.mrpInPaise).toBeDefined();
  });

  it("rejects a negative sellingPriceInPaise", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), sellingPriceInPaise: -1 });
    const error = medicine.validateSync();
    expect(error?.errors.sellingPriceInPaise).toBeDefined();
  });

  it("rejects an invalid status", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), status: "DELETED" });
    const error = medicine.validateSync();
    expect(error?.errors.status).toBeDefined();
  });

  it("accepts a Fluid product with volume and volumeUnit", () => {
    const medicine = new MedicineModel({
      category: "FLUID",
      name: "Normal Saline",
      genericName: "Sodium Chloride",
      composition: "Sodium Chloride 0.9%",
      billingUnit: "bottle",
      volume: 500,
      volumeUnit: "ml",
      mrpInPaise: 15000,
      sellingPriceInPaise: 12000,
      createdBy: new Types.ObjectId(),
    });
    expect(medicine.validateSync()).toBeUndefined();
  });

  it("rejects a non-positive volume", () => {
    const medicine = new MedicineModel({ ...validMedicineData(), volume: -5 });
    const error = medicine.validateSync();
    expect(error?.errors.volume).toBeDefined();
  });
});
