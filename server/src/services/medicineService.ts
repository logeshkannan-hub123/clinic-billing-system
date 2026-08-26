import { Types } from "mongoose";
import { BillModel } from "../models/Bill.js";
import type { MedicineCategory, MedicineStatus } from "../models/enums.js";
import { MedicineModel, type MedicineHydratedDoc } from "../models/Medicine.js";

export class FluidVolumeRequiredError extends Error {}
export class VolumeNotApplicableError extends Error {}
export class MedicineInUseError extends Error {}

export interface MedicineInput {
  category: MedicineCategory;
  name: string;
  brandName?: string | null;
  genericName: string;
  composition: string;
  strength?: string | null;
  billingUnit: string;
  volume?: number | null;
  volumeUnit?: string | null;
  mrpInPaise: number;
  sellingPriceInPaise: number;
}

export type MedicineUpdateInput = Partial<MedicineInput>;

export interface Actor {
  id: Types.ObjectId;
}

/** FLUID requires volume+volumeUnit; every other category must leave both
 * unset — cross-field business rule, kept in the service layer rather than
 * a schema-level document-wide validator, matching this codebase's existing
 * convention (see clinicSettingsService's payment-methods check). */
function assertCategoryVolumeRules(input: Pick<MedicineInput, "category" | "volume" | "volumeUnit">) {
  if (input.category === "FLUID") {
    if (input.volume == null || !input.volumeUnit) {
      throw new FluidVolumeRequiredError();
    }
  } else if (input.volume != null || input.volumeUnit) {
    throw new VolumeNotApplicableError();
  }
}

export async function createMedicine(input: MedicineInput, actor: Actor): Promise<MedicineHydratedDoc> {
  assertCategoryVolumeRules(input);
  return MedicineModel.create({
    category: input.category,
    name: input.name.trim(),
    brandName: input.brandName?.trim() || null,
    genericName: input.genericName.trim(),
    composition: input.composition.trim(),
    strength: input.strength?.trim() || null,
    billingUnit: input.billingUnit,
    volume: input.volume ?? null,
    volumeUnit: input.volumeUnit?.trim() || null,
    mrpInPaise: input.mrpInPaise,
    sellingPriceInPaise: input.sellingPriceInPaise,
    // Always Active on create — no approval workflow, whether the creator is
    // an Admin or a Receptionist.
    status: "ACTIVE",
    createdBy: actor.id,
  });
}

export async function updateMedicine(
  id: string | undefined,
  patch: MedicineUpdateInput,
  actor: Actor,
): Promise<MedicineHydratedDoc | null> {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  const existing = await MedicineModel.findById(id);
  if (!existing) return null;

  const merged: MedicineInput = {
    category: patch.category ?? existing.category,
    name: patch.name ?? existing.name,
    brandName: patch.brandName !== undefined ? patch.brandName : existing.brandName,
    genericName: patch.genericName ?? existing.genericName,
    composition: patch.composition ?? existing.composition,
    strength: patch.strength !== undefined ? patch.strength : existing.strength,
    billingUnit: patch.billingUnit ?? existing.billingUnit,
    volume: patch.volume !== undefined ? patch.volume : existing.volume,
    volumeUnit: patch.volumeUnit !== undefined ? patch.volumeUnit : existing.volumeUnit,
    mrpInPaise: patch.mrpInPaise ?? existing.mrpInPaise,
    sellingPriceInPaise: patch.sellingPriceInPaise ?? existing.sellingPriceInPaise,
  };
  assertCategoryVolumeRules(merged);

  existing.set({
    category: merged.category,
    name: merged.name.trim(),
    brandName: merged.brandName?.trim() || null,
    genericName: merged.genericName.trim(),
    composition: merged.composition.trim(),
    strength: merged.strength?.trim() || null,
    billingUnit: merged.billingUnit,
    volume: merged.volume ?? null,
    volumeUnit: merged.volumeUnit?.trim() || null,
    mrpInPaise: merged.mrpInPaise,
    sellingPriceInPaise: merged.sellingPriceInPaise,
    updatedBy: actor.id,
  });
  await existing.save();
  return existing;
}

/** Status only ever toggles Active/Inactive — medicines are never hard
 * deleted, so historical bill references and the audit trail stay intact. */
export async function setMedicineStatus(
  id: string | undefined,
  status: MedicineStatus,
  actor: Actor,
): Promise<MedicineHydratedDoc | null> {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return MedicineModel.findOneAndUpdate({ _id: id }, { status, updatedBy: actor.id }, { new: true });
}

/** True hard delete — but only when the medicine has never appeared on any
 * bill. If it has, deleting it would leave a dangling `medicineId` on that
 * bill's items and (worse) break re-saving that bill while it's still
 * UNPAID, since every save re-resolves each item against its live catalog
 * record. Disabling (see `setMedicineStatus`) remains the only option once
 * a medicine has real billing history — this preserves that guarantee
 * rather than only enforcing it by convention. */
export async function deleteMedicine(id: string | undefined): Promise<MedicineHydratedDoc | null> {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  const existing = await MedicineModel.findById(id);
  if (!existing) return null;

  const referencedByBill = await BillModel.exists({ "items.medicineId": existing._id });
  if (referencedByBill) {
    throw new MedicineInUseError();
  }

  await MedicineModel.deleteOne({ _id: existing._id });
  return existing;
}

export async function getMedicineById(id: string): Promise<MedicineHydratedDoc | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  return MedicineModel.findById(id);
}

export interface ListMedicinesFilters {
  category?: MedicineCategory;
  includeInactive?: boolean;
}

/** Full catalog, incl. inactive by default — the management page needs to
 * show and re-activate disabled products, not just hide them. */
export async function listMedicines(filters: ListMedicinesFilters = {}): Promise<MedicineHydratedDoc[]> {
  const query: Record<string, unknown> = {};
  if (filters.category) query.category = filters.category;
  const includeInactive = filters.includeInactive ?? true;
  if (!includeInactive) query.status = "ACTIVE";
  return MedicineModel.find(query).sort({ name: 1 });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SearchMedicinesFilters {
  query: string;
  category?: MedicineCategory;
  limit?: number;
}

/** Active-only, case-insensitive partial match across brand/generic/
 * composition/strength — same escaped-regex `$or` shape already used by
 * `listBills`'s patient search, not a text index/collation, matching this
 * project's existing scale and precedent. Results are then re-sorted so a
 * name/brand prefix match (e.g. "dol" -> "Dolo 500") ranks above a match
 * that only occurs mid-string, using a small in-memory sort rather than
 * new search infrastructure. */
export async function searchMedicines(filters: SearchMedicinesFilters): Promise<MedicineHydratedDoc[]> {
  const trimmed = filters.query.trim();
  if (!trimmed) return [];

  const pattern = new RegExp(escapeRegex(trimmed), "i");
  const mongoQuery: Record<string, unknown> = {
    status: "ACTIVE",
    $or: [
      { name: pattern },
      { brandName: pattern },
      { genericName: pattern },
      { composition: pattern },
      { strength: pattern },
    ],
  };
  if (filters.category) mongoQuery.category = filters.category;

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
  const candidates = await MedicineModel.find(mongoQuery).limit(limit * 3);

  const lowerQuery = trimmed.toLowerCase();
  const startsWithQuery = (value: string | null | undefined) =>
    Boolean(value && value.toLowerCase().startsWith(lowerQuery));

  const sorted = [...candidates].sort((a, b) => {
    const aRank = startsWithQuery(a.name) || startsWithQuery(a.brandName) ? 0 : 1;
    const bRank = startsWithQuery(b.name) || startsWithQuery(b.brandName) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name);
  });

  return sorted.slice(0, limit);
}
