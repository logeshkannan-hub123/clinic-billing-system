import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  MEDICINE_CATEGORIES,
  MEDICINE_STATUSES,
  MEDICINE_UNIT_TYPES,
  type MedicineCategory,
  type MedicineStatus,
} from "../models/enums.js";
import { recordAuditEvent } from "../services/auditLog.js";
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
  type MedicineUpdateInput,
} from "../services/medicineService.js";

function isValidCategory(value: unknown): value is MedicineCategory {
  return typeof value === "string" && (MEDICINE_CATEGORIES as readonly string[]).includes(value);
}

function isValidUnit(value: unknown): value is string {
  return typeof value === "string" && (MEDICINE_UNIT_TYPES as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseMedicineInput(body: unknown): { data: MedicineInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body is required" };
  }
  const {
    category,
    name,
    brandName,
    genericName,
    composition,
    strength,
    billingUnit,
    volume,
    volumeUnit,
    mrpInPaise,
    sellingPriceInPaise,
  } = body as Record<string, unknown>;

  if (!isValidCategory(category)) {
    return { error: "category must be one of MEDICINE, INJECTION, FLUID" };
  }
  if (!isNonEmptyString(name)) {
    return { error: "name is required" };
  }
  if (brandName !== undefined && brandName !== null && typeof brandName !== "string") {
    return { error: "brandName must be a string" };
  }
  if (!isNonEmptyString(genericName)) {
    return { error: "genericName is required" };
  }
  if (!isNonEmptyString(composition)) {
    return { error: "composition is required" };
  }
  if (strength !== undefined && strength !== null && typeof strength !== "string") {
    return { error: "strength must be a string" };
  }
  if (!isValidUnit(billingUnit)) {
    return { error: "billingUnit is not a recognized medicine unit type" };
  }
  if (volume !== undefined && volume !== null && !isPositiveFiniteNumber(volume)) {
    return { error: "volume must be a positive number" };
  }
  if (volumeUnit !== undefined && volumeUnit !== null && typeof volumeUnit !== "string") {
    return { error: "volumeUnit must be a string" };
  }
  if (!isNonNegativeInteger(mrpInPaise)) {
    return { error: "mrpInPaise must be a non-negative integer" };
  }
  if (!isNonNegativeInteger(sellingPriceInPaise)) {
    return { error: "sellingPriceInPaise must be a non-negative integer" };
  }

  return {
    data: {
      category,
      name: name.trim(),
      brandName: typeof brandName === "string" ? brandName.trim() : null,
      genericName: genericName.trim(),
      composition: composition.trim(),
      strength: typeof strength === "string" ? strength.trim() : null,
      billingUnit,
      volume: typeof volume === "number" ? volume : null,
      volumeUnit: typeof volumeUnit === "string" ? volumeUnit.trim() : null,
      mrpInPaise,
      sellingPriceInPaise,
    },
  };
}

/** Same field set as create, but every key is optional and only included in
 * the result if the caller actually sent it — a true partial patch, never a
 * blind `req.body` spread into Mongo. */
function parseMedicineUpdateInput(body: unknown): { data: MedicineUpdateInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body is required" };
  }
  const raw = body as Record<string, unknown>;
  const data: MedicineUpdateInput = {};

  if ("category" in raw) {
    if (!isValidCategory(raw.category)) return { error: "category must be one of MEDICINE, INJECTION, FLUID" };
    data.category = raw.category;
  }
  if ("name" in raw) {
    if (!isNonEmptyString(raw.name)) return { error: "name must be a non-empty string" };
    data.name = raw.name.trim();
  }
  if ("brandName" in raw) {
    if (raw.brandName !== null && typeof raw.brandName !== "string") {
      return { error: "brandName must be a string or null" };
    }
    data.brandName = typeof raw.brandName === "string" ? raw.brandName.trim() : null;
  }
  if ("genericName" in raw) {
    if (!isNonEmptyString(raw.genericName)) return { error: "genericName must be a non-empty string" };
    data.genericName = raw.genericName.trim();
  }
  if ("composition" in raw) {
    if (!isNonEmptyString(raw.composition)) return { error: "composition must be a non-empty string" };
    data.composition = raw.composition.trim();
  }
  if ("strength" in raw) {
    if (raw.strength !== null && typeof raw.strength !== "string") {
      return { error: "strength must be a string or null" };
    }
    data.strength = typeof raw.strength === "string" ? raw.strength.trim() : null;
  }
  if ("billingUnit" in raw) {
    if (!isValidUnit(raw.billingUnit)) return { error: "billingUnit is not a recognized medicine unit type" };
    data.billingUnit = raw.billingUnit;
  }
  if ("volume" in raw) {
    if (raw.volume !== null && !isPositiveFiniteNumber(raw.volume)) {
      return { error: "volume must be a positive number or null" };
    }
    data.volume = typeof raw.volume === "number" ? raw.volume : null;
  }
  if ("volumeUnit" in raw) {
    if (raw.volumeUnit !== null && typeof raw.volumeUnit !== "string") {
      return { error: "volumeUnit must be a string or null" };
    }
    data.volumeUnit = typeof raw.volumeUnit === "string" ? raw.volumeUnit.trim() : null;
  }
  if ("mrpInPaise" in raw) {
    if (!isNonNegativeInteger(raw.mrpInPaise)) return { error: "mrpInPaise must be a non-negative integer" };
    data.mrpInPaise = raw.mrpInPaise;
  }
  if ("sellingPriceInPaise" in raw) {
    if (!isNonNegativeInteger(raw.sellingPriceInPaise)) {
      return { error: "sellingPriceInPaise must be a non-negative integer" };
    }
    data.sellingPriceInPaise = raw.sellingPriceInPaise;
  }

  return { data };
}

function handleVolumeErrors(error: unknown, res: import("express").Response): boolean {
  if (error instanceof FluidVolumeRequiredError) {
    res.status(400).json({ error: "Fluid products require volume and volumeUnit" });
    return true;
  }
  if (error instanceof VolumeNotApplicableError) {
    res.status(400).json({ error: "volume/volumeUnit are only applicable to Fluid products" });
    return true;
  }
  return false;
}

// Mixed-role router (not under /api/admin/*, which is fully admin-gated) —
// mirrors bills.ts: both roles pass the top-level gate, admin-only routes
// add requireRole("admin") inline, same shape as bills.ts's
// PATCH /:id/cancel.
export function createMedicinesRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin", "receptionist"));

  // Narrowest response of the router — active-only, and excludes
  // mrpInPaise/createdBy/updatedBy, which billing doesn't need. Registered
  // before "/:id" so "search" is never captured as an :id param.
  router.get("/search", async (req, res, next) => {
    try {
      const { q, category } = req.query;
      if (category !== undefined && !isValidCategory(category)) {
        res.status(400).json({ error: "invalid category filter" });
        return;
      }
      const results = await searchMedicines({
        query: typeof q === "string" ? q : "",
        category: category as MedicineCategory | undefined,
      });
      res.json(
        results.map((medicine) => ({
          id: medicine._id,
          category: medicine.category,
          name: medicine.name,
          brandName: medicine.brandName,
          genericName: medicine.genericName,
          composition: medicine.composition,
          strength: medicine.strength,
          billingUnit: medicine.billingUnit,
          volume: medicine.volume,
          volumeUnit: medicine.volumeUnit,
          sellingPriceInPaise: medicine.sellingPriceInPaise,
        })),
      );
    } catch (error) {
      next(error);
    }
  });

  // Full catalog incl. inactive by default — the management page needs to
  // see (and re-activate) disabled products, not just hide them.
  router.get("/", async (req, res, next) => {
    try {
      const { category, includeInactive } = req.query;
      if (category !== undefined && !isValidCategory(category)) {
        res.status(400).json({ error: "invalid category filter" });
        return;
      }
      // Whitelist the two real values rather than `!== "false"`, which would
      // silently treat any other value ("0", "False", a typo) as "include" —
      // the more permissive, less obviously-correct branch of this flag.
      if (
        includeInactive !== undefined &&
        includeInactive !== "true" &&
        includeInactive !== "false"
      ) {
        res.status(400).json({ error: "includeInactive must be \"true\" or \"false\"" });
        return;
      }
      const results = await listMedicines({
        category: category as MedicineCategory | undefined,
        includeInactive: includeInactive !== "false",
      });
      res.json(results);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const medicine = await getMedicineById(req.params.id);
      if (!medicine) {
        res.status(404).json({ error: "Medicine not found" });
        return;
      }
      res.json(medicine);
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const parsed = parseMedicineInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const medicine = await createMedicine(parsed.data, { id: new Types.ObjectId(req.user!.id) });
      await recordAuditEvent("medicine_created", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { medicineId: medicine._id, name: medicine.name, category: medicine.category },
      });
      res.status(201).json(medicine);
    } catch (error) {
      if (handleVolumeErrors(error, res)) return;
      next(error);
    }
  });

  router.patch("/:id", requireRole("admin"), async (req, res, next) => {
    try {
      const parsed = parseMedicineUpdateInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const medicine = await updateMedicine(req.params.id, parsed.data, {
        id: new Types.ObjectId(req.user!.id),
      });
      if (!medicine) {
        res.status(404).json({ error: "Medicine not found" });
        return;
      }
      await recordAuditEvent("medicine_updated", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { medicineId: medicine._id, name: medicine.name },
      });
      res.json(medicine);
    } catch (error) {
      if (handleVolumeErrors(error, res)) return;
      next(error);
    }
  });

  router.patch("/:id/status", requireRole("admin"), async (req, res, next) => {
    try {
      const { status } = req.body ?? {};
      if (typeof status !== "string" || !(MEDICINE_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
        return;
      }

      const medicine = await setMedicineStatus(req.params.id, status as MedicineStatus, {
        id: new Types.ObjectId(req.user!.id),
      });
      if (!medicine) {
        res.status(404).json({ error: "Medicine not found" });
        return;
      }
      await recordAuditEvent("medicine_status_changed", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { medicineId: medicine._id, name: medicine.name, status: medicine.status },
      });
      res.json(medicine);
    } catch (error) {
      next(error);
    }
  });

  // Admin-only, and only succeeds when the medicine has no billing history —
  // see deleteMedicine's own comment. Everything else must go through
  // PATCH /:id/status instead.
  router.delete("/:id", requireRole("admin"), async (req, res, next) => {
    try {
      const medicine = await deleteMedicine(req.params.id);
      if (!medicine) {
        res.status(404).json({ error: "Medicine not found" });
        return;
      }
      await recordAuditEvent("medicine_deleted", {
        actorUserId: new Types.ObjectId(req.user!.id),
        payload: { medicineId: medicine._id, name: medicine.name, category: medicine.category },
      });
      res.status(204).end();
    } catch (error) {
      if (error instanceof MedicineInUseError) {
        res.status(409).json({
          error: "This medicine has been used in at least one bill and cannot be deleted. Disable it instead.",
        });
        return;
      }
      next(error);
    }
  });

  return router;
}
