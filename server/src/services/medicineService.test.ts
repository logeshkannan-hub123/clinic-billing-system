import { Types } from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BillModel } from "../models/Bill.js";
import { clearTestDb, connectTestDb, disconnectTestDb } from "../test/testDb.js";
import {
  FluidVolumeRequiredError,
  MedicineInUseError,
  VolumeNotApplicableError,
  createMedicine,
  deleteMedicine,
  getMedicineById,
  listMedicines,
  searchMedicines,
  setMedicineStatus,
  updateMedicine,
  type MedicineInput,
} from "./medicineService.js";

const actor = { id: new Types.ObjectId() };

function tabletInput(overrides: Partial<MedicineInput> = {}): MedicineInput {
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
    ...overrides,
  };
}

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe("createMedicine", () => {
  it("creates an Active medicine", async () => {
    const medicine = await createMedicine(tabletInput(), actor);
    expect(medicine.status).toBe("ACTIVE");
    expect(medicine.name).toBe("Dolo 500");
    expect(medicine.createdBy?.toString()).toBe(actor.id.toString());
  });

  it("is always Active regardless of any status the caller might try to imply", async () => {
    const medicine = await createMedicine(tabletInput(), actor);
    expect(medicine.status).toBe("ACTIVE");
  });

  it("allows a generic/unbranded product", async () => {
    const medicine = await createMedicine(tabletInput({ brandName: null }), actor);
    expect(medicine.brandName).toBeNull();
  });

  it("rejects a Fluid without volume/volumeUnit", async () => {
    await expect(
      createMedicine(
        tabletInput({ category: "FLUID", billingUnit: "bottle", volume: null, volumeUnit: null }),
        actor,
      ),
    ).rejects.toBeInstanceOf(FluidVolumeRequiredError);
  });

  it("creates a Fluid with volume/volumeUnit", async () => {
    const medicine = await createMedicine(
      tabletInput({ category: "FLUID", billingUnit: "bottle", volume: 500, volumeUnit: "ml" }),
      actor,
    );
    expect(medicine.volume).toBe(500);
    expect(medicine.volumeUnit).toBe("ml");
  });

  it("rejects a non-Fluid with volume set", async () => {
    await expect(
      createMedicine(tabletInput({ volume: 10, volumeUnit: "ml" }), actor),
    ).rejects.toBeInstanceOf(VolumeNotApplicableError);
  });
});

describe("updateMedicine", () => {
  it("updates fields, including price", async () => {
    const created = await createMedicine(tabletInput(), actor);
    const updated = await updateMedicine(
      created._id.toString(),
      { sellingPriceInPaise: 320 },
      actor,
    );
    expect(updated?.sellingPriceInPaise).toBe(320);
    expect(updated?.updatedBy?.toString()).toBe(actor.id.toString());
  });

  it("re-validates category/volume rules against the merged result", async () => {
    const created = await createMedicine(tabletInput(), actor);
    await expect(
      updateMedicine(created._id.toString(), { volume: 10, volumeUnit: "ml" }, actor),
    ).rejects.toBeInstanceOf(VolumeNotApplicableError);
  });

  it("returns null for a nonexistent id", async () => {
    expect(await updateMedicine(new Types.ObjectId().toString(), { name: "X" }, actor)).toBeNull();
  });

  it("returns null for an undefined id (route param edge case)", async () => {
    expect(await updateMedicine(undefined, { name: "X" }, actor)).toBeNull();
  });
});

describe("setMedicineStatus", () => {
  it("toggles to INACTIVE and back to ACTIVE without deleting the document", async () => {
    const created = await createMedicine(tabletInput(), actor);
    const deactivated = await setMedicineStatus(created._id.toString(), "INACTIVE", actor);
    expect(deactivated?.status).toBe("INACTIVE");

    const stillThere = await getMedicineById(created._id.toString());
    expect(stillThere).not.toBeNull();

    const reactivated = await setMedicineStatus(created._id.toString(), "ACTIVE", actor);
    expect(reactivated?.status).toBe("ACTIVE");
  });

  it("returns null for a nonexistent id", async () => {
    expect(await setMedicineStatus(new Types.ObjectId().toString(), "INACTIVE", actor)).toBeNull();
  });
});

async function createBillReferencing(medicineId: Types.ObjectId) {
  return BillModel.create({
    billNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    patientId: new Types.ObjectId(),
    patientName: "Asha Rao",
    patientPhone: "9876543210",
    items: [
      {
        medicineId,
        medicineName: "Dolo 500",
        unitType: "tablet",
        quantity: 1,
        unitPriceInPaise: 300,
        lineTotalInPaise: 300,
      },
    ],
    consultationFeeInPaise: 0,
    subtotalInPaise: 300,
    taxEnabled: false,
    taxAmountInPaise: 0,
    roundingAdjustmentInPaise: 0,
    grandTotalInPaise: 300,
    status: "UNPAID",
    issuedAt: new Date(),
    createdBy: new Types.ObjectId(),
  });
}

describe("deleteMedicine", () => {
  it("permanently deletes a medicine with no billing history", async () => {
    const created = await createMedicine(tabletInput(), actor);
    const deleted = await deleteMedicine(created._id.toString());
    expect(deleted?._id.toString()).toBe(created._id.toString());
    expect(await getMedicineById(created._id.toString())).toBeNull();
  });

  it("throws MedicineInUseError and keeps the record when referenced by a bill", async () => {
    const created = await createMedicine(tabletInput(), actor);
    await createBillReferencing(created._id);

    await expect(deleteMedicine(created._id.toString())).rejects.toBeInstanceOf(MedicineInUseError);
    expect(await getMedicineById(created._id.toString())).not.toBeNull();
  });

  it("returns null for a nonexistent id", async () => {
    expect(await deleteMedicine(new Types.ObjectId().toString())).toBeNull();
  });

  it("returns null for an undefined id (route param edge case)", async () => {
    expect(await deleteMedicine(undefined)).toBeNull();
  });
});

describe("listMedicines", () => {
  it("includes inactive by default", async () => {
    const created = await createMedicine(tabletInput(), actor);
    await setMedicineStatus(created._id.toString(), "INACTIVE", actor);

    const all = await listMedicines();
    expect(all.some((m) => m._id.toString() === created._id.toString())).toBe(true);
  });

  it("excludes inactive when includeInactive is false", async () => {
    const created = await createMedicine(tabletInput(), actor);
    await setMedicineStatus(created._id.toString(), "INACTIVE", actor);

    const activeOnly = await listMedicines({ includeInactive: false });
    expect(activeOnly.some((m) => m._id.toString() === created._id.toString())).toBe(false);
  });

  it("filters by category", async () => {
    await createMedicine(tabletInput(), actor);
    await createMedicine(
      tabletInput({ name: "Normal Saline", category: "FLUID", billingUnit: "bottle", volume: 500, volumeUnit: "ml" }),
      actor,
    );
    const fluids = await listMedicines({ category: "FLUID" });
    expect(fluids.every((m) => m.category === "FLUID")).toBe(true);
    expect(fluids).toHaveLength(1);
  });
});

describe("searchMedicines", () => {
  it("finds by brand name (case-insensitive, partial)", async () => {
    await createMedicine(tabletInput(), actor);
    const results = await searchMedicines({ query: "dol" });
    expect(results.some((m) => m.name === "Dolo 500")).toBe(true);
  });

  it("finds by generic name / composition", async () => {
    await createMedicine(tabletInput({ name: "Calpol 500", brandName: "Calpol" }), actor);
    const results = await searchMedicines({ query: "paracetamol" });
    expect(results.some((m) => m.name === "Calpol 500")).toBe(true);
  });

  it("finds by strength", async () => {
    await createMedicine(tabletInput(), actor);
    const results = await searchMedicines({ query: "500 mg" });
    expect(results.some((m) => m.name === "Dolo 500")).toBe(true);
  });

  it("prioritizes a name/brand prefix match over a mid-string match", async () => {
    await createMedicine(tabletInput({ name: "Dolo 650", brandName: "Dolo" }), actor);
    await createMedicine(
      tabletInput({ name: "Sinarest", brandName: "Sinarest", genericName: "Paracetamol + Chlorpheniramine + Phenylephrine", composition: "Paracetamol 500mg" }),
      actor,
    );
    const results = await searchMedicines({ query: "dol" });
    expect(results[0]?.name).toBe("Dolo 650");
  });

  it("excludes inactive products", async () => {
    const created = await createMedicine(tabletInput(), actor);
    await setMedicineStatus(created._id.toString(), "INACTIVE", actor);
    const results = await searchMedicines({ query: "dol" });
    expect(results.some((m) => m._id.toString() === created._id.toString())).toBe(false);
  });

  it("returns an empty array for a blank query", async () => {
    await createMedicine(tabletInput(), actor);
    expect(await searchMedicines({ query: "   " })).toHaveLength(0);
  });

  it("filters by category", async () => {
    await createMedicine(tabletInput(), actor);
    const results = await searchMedicines({ query: "dolo", category: "FLUID" });
    expect(results).toHaveLength(0);
  });
});
