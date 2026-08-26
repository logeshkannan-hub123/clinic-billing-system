import { Router } from "express";
import { Types } from "mongoose";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { BILL_STATUSES, MEDICINE_UNIT_TYPES, type BillStatus } from "../models/enums.js";
import {
  BillNotCancellableError,
  BillNotEditableError,
  BillNotFoundError,
  BillNotPayableError,
  DuplicateBillWarningError,
  InvalidPaymentAmountError,
  MedicineInactiveError,
  MedicineNotFoundError,
  OverpaymentError,
  PartialPaymentsDisabledError,
  PaymentMethodDisabledError,
  cancelBill,
  createBill,
  editBill,
  getBillWithPayments,
  listBills,
  previewBill,
  recordPayment,
  type BillInput,
  type BillItemInput,
  type RecordPaymentInput,
} from "../services/billService.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Defense-in-depth bounds only — no real bill approaches these. Without
// them, a single request has no upper limit at all (short of Express's
// default ~100kb JSON body cap), which is more permissive than any
// legitimate use needs.
const MAX_ITEMS_PER_BILL = 200;
const MAX_QUANTITY = 100_000;
const MAX_UNIT_PRICE_IN_PAISE = 100_000_000; // ₹10,00,000
const MAX_CONSULTATION_FEE_IN_PAISE = 100_000_000; // ₹10,00,000

function parseItems(rawItems: unknown): { items: BillItemInput[] } | { error: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "items must be a non-empty array" };
  }
  if (rawItems.length > MAX_ITEMS_PER_BILL) {
    return { error: `items must not exceed ${MAX_ITEMS_PER_BILL} entries` };
  }

  const parsedItems: BillItemInput[] = [];
  for (const rawItem of rawItems) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return { error: "each item must be an object" };
    }
    const { medicineId, medicineName, unitType, quantity, unitPriceInPaise } = rawItem as Record<
      string,
      unknown
    >;
    if (medicineId !== undefined && typeof medicineId !== "string") {
      return { error: "item.medicineId must be a string" };
    }
    if (typeof medicineName !== "string" || medicineName.trim().length === 0) {
      return { error: "item.medicineName is required" };
    }
    if (
      typeof unitType !== "string" ||
      !(MEDICINE_UNIT_TYPES as readonly string[]).includes(unitType)
    ) {
      return { error: "item.unitType is not a recognized medicine unit type" };
    }
    if (!(Number.isInteger(quantity) && (quantity as number) >= 1 && (quantity as number) <= MAX_QUANTITY)) {
      return { error: `item.quantity must be a positive integer of at most ${MAX_QUANTITY}` };
    }
    if (
      !(
        Number.isInteger(unitPriceInPaise) &&
        (unitPriceInPaise as number) >= 0 &&
        (unitPriceInPaise as number) <= MAX_UNIT_PRICE_IN_PAISE
      )
    ) {
      return { error: `item.unitPriceInPaise must be a non-negative integer of at most ${MAX_UNIT_PRICE_IN_PAISE}` };
    }
    parsedItems.push({
      medicineId: typeof medicineId === "string" ? medicineId : undefined,
      medicineName: medicineName.trim(),
      unitType,
      quantity: quantity as number,
      unitPriceInPaise: unitPriceInPaise as number,
    });
  }

  return { items: parsedItems };
}

function parseBillInput(body: unknown): { data: BillInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body is required" };
  }
  const { patientName, patientPhone, items, consultationFeeInPaise } = body as Record<
    string,
    unknown
  >;

  if (typeof patientName !== "string" || patientName.trim().length === 0) {
    return { error: "patientName is required" };
  }
  if (typeof patientPhone !== "string" || patientPhone.trim().length === 0) {
    return { error: "patientPhone is required" };
  }

  const parsedItems = parseItems(items);
  if ("error" in parsedItems) {
    return { error: parsedItems.error };
  }

  if (
    !(
      Number.isInteger(consultationFeeInPaise) &&
      (consultationFeeInPaise as number) >= 0 &&
      (consultationFeeInPaise as number) <= MAX_CONSULTATION_FEE_IN_PAISE
    )
  ) {
    return {
      error: `consultationFeeInPaise must be a non-negative integer of at most ${MAX_CONSULTATION_FEE_IN_PAISE}`,
    };
  }

  return {
    data: {
      patientName: patientName.trim(),
      patientPhone: patientPhone.trim(),
      items: parsedItems.items,
      consultationFeeInPaise: consultationFeeInPaise as number,
    },
  };
}

function parsePreviewInput(
  body: unknown,
): { data: { items: BillItemInput[]; consultationFeeInPaise: number } } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body is required" };
  }
  const { items, consultationFeeInPaise } = body as Record<string, unknown>;

  const parsedItems = parseItems(items);
  if ("error" in parsedItems) {
    return { error: parsedItems.error };
  }

  if (
    !(
      Number.isInteger(consultationFeeInPaise) &&
      (consultationFeeInPaise as number) >= 0 &&
      (consultationFeeInPaise as number) <= MAX_CONSULTATION_FEE_IN_PAISE
    )
  ) {
    return {
      error: `consultationFeeInPaise must be a non-negative integer of at most ${MAX_CONSULTATION_FEE_IN_PAISE}`,
    };
  }

  return {
    data: { items: parsedItems.items, consultationFeeInPaise: consultationFeeInPaise as number },
  };
}

function parsePaymentInput(body: unknown): { data: RecordPaymentInput } | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body is required" };
  }
  const { method, tenderedAmountInPaise, amountInPaise, upiReference } = body as Record<
    string,
    unknown
  >;

  if (method === "CASH") {
    if (!(Number.isInteger(tenderedAmountInPaise) && (tenderedAmountInPaise as number) > 0)) {
      return { error: "tenderedAmountInPaise must be a positive integer" };
    }
    return { data: { method: "CASH", tenderedAmountInPaise: tenderedAmountInPaise as number } };
  }

  if (method === "UPI") {
    if (!(Number.isInteger(amountInPaise) && (amountInPaise as number) > 0)) {
      return { error: "amountInPaise must be a positive integer" };
    }
    return {
      data: {
        method: "UPI",
        amountInPaise: amountInPaise as number,
        upiReference: typeof upiReference === "string" ? upiReference : undefined,
      },
    };
  }

  return { error: "method must be CASH or UPI" };
}

export function createBillsRouter(): Router {
  const router = Router();

  router.use(requireAuth, requireRole("admin", "receptionist"));

  router.post("/", async (req, res, next) => {
    try {
      const parsed = parseBillInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const body = req.body as Record<string, unknown> | undefined;
      const confirmDuplicate = body?.confirmDuplicate === true;

      const rawIdempotencyKey = body?.idempotencyKey;
      if (
        rawIdempotencyKey !== undefined &&
        (typeof rawIdempotencyKey !== "string" ||
          rawIdempotencyKey.trim().length === 0 ||
          rawIdempotencyKey.length > 200)
      ) {
        res.status(400).json({ error: "idempotencyKey must be a non-empty string of at most 200 characters" });
        return;
      }
      const idempotencyKey =
        typeof rawIdempotencyKey === "string" ? rawIdempotencyKey.trim() : undefined;

      const bill = await createBill(
        { ...parsed.data, confirmDuplicate, idempotencyKey },
        { id: new Types.ObjectId(req.user!.id) },
      );
      res.status(201).json(bill);
    } catch (error) {
      if (error instanceof DuplicateBillWarningError) {
        res.status(409).json({
          warning: "possible_duplicate",
          existingBillId: error.existingBillId,
          existingBillNumber: error.existingBillNumber,
        });
        return;
      }
      if (error instanceof MedicineNotFoundError) {
        res.status(400).json({ error: "One or more selected medicines could not be found" });
        return;
      }
      if (error instanceof MedicineInactiveError) {
        res.status(400).json({ error: "One or more selected medicines are no longer active" });
        return;
      }
      next(error);
    }
  });

  // Pure calculation, no persistence — never creates a Patient, Bill, or
  // Payment. Lets the client show a live total preview without either
  // duplicating billMath.ts's logic or prematurely creating a real bill.
  router.post("/preview", async (req, res, next) => {
    try {
      const parsed = parsePreviewInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const preview = await previewBill(parsed.data);
      res.json(preview);
    } catch (error) {
      if (error instanceof MedicineNotFoundError) {
        res.status(400).json({ error: "One or more selected medicines could not be found" });
        return;
      }
      if (error instanceof MedicineInactiveError) {
        res.status(400).json({ error: "One or more selected medicines are no longer active" });
        return;
      }
      next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const { status, date, search, limit, skip } = req.query;

      if (status !== undefined && !(BILL_STATUSES as readonly string[]).includes(status as string)) {
        res.status(400).json({ error: "invalid status filter" });
        return;
      }
      if (date !== undefined && (typeof date !== "string" || !DATE_PATTERN.test(date))) {
        res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
        return;
      }

      let parsedLimit: number | undefined;
      if (limit !== undefined) {
        if (typeof limit !== "string" || !/^\d+$/.test(limit)) {
          res.status(400).json({ error: "limit must be a non-negative integer" });
          return;
        }
        parsedLimit = Number(limit);
      }

      let parsedSkip: number | undefined;
      if (skip !== undefined) {
        if (typeof skip !== "string" || !/^\d+$/.test(skip)) {
          res.status(400).json({ error: "skip must be a non-negative integer" });
          return;
        }
        parsedSkip = Number(skip);
      }

      const result = await listBills({
        status: status as BillStatus | undefined,
        dateIso: typeof date === "string" ? date : undefined,
        search: typeof search === "string" ? search : undefined,
        limit: parsedLimit,
        skip: parsedSkip,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const result = await getBillWithPayments(req.params.id);
      if (!result) {
        res.status(404).json({ error: "Bill not found" });
        return;
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const parsed = parseBillInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const bill = await editBill(req.params.id, parsed.data, {
        id: new Types.ObjectId(req.user!.id),
      });
      res.json(bill);
    } catch (error) {
      if (error instanceof BillNotFoundError) {
        res.status(404).json({ error: "Bill not found" });
        return;
      }
      if (error instanceof BillNotEditableError) {
        res.status(409).json({ error: "Bill can only be edited while UNPAID" });
        return;
      }
      if (error instanceof MedicineNotFoundError) {
        res.status(400).json({ error: "One or more selected medicines could not be found" });
        return;
      }
      if (error instanceof MedicineInactiveError) {
        res.status(400).json({ error: "One or more selected medicines are no longer active" });
        return;
      }
      next(error);
    }
  });

  router.patch("/:id/cancel", requireRole("admin"), async (req, res, next) => {
    try {
      const bill = await cancelBill(req.params.id, { id: new Types.ObjectId(req.user!.id) });
      res.json(bill);
    } catch (error) {
      if (error instanceof BillNotFoundError) {
        res.status(404).json({ error: "Bill not found" });
        return;
      }
      if (error instanceof BillNotCancellableError) {
        res.status(409).json({ error: "Bill can only be cancelled while UNPAID" });
        return;
      }
      next(error);
    }
  });

  router.post("/:id/payments", async (req, res, next) => {
    try {
      const parsed = parsePaymentInput(req.body);
      if ("error" in parsed) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const result = await recordPayment(req.params.id, parsed.data, {
        id: new Types.ObjectId(req.user!.id),
      });
      res.status(201).json({
        payment: result.payment,
        bill: { id: result.bill._id, status: result.bill.status },
        dueAmountInPaise: result.dueAmountInPaise,
      });
    } catch (error) {
      if (error instanceof BillNotFoundError) {
        res.status(404).json({ error: "Bill not found" });
        return;
      }
      if (error instanceof BillNotPayableError) {
        res.status(409).json({ error: "Bill is not payable (already settled, or nothing due)" });
        return;
      }
      if (error instanceof OverpaymentError) {
        res.status(409).json({ error: "Payment amount exceeds the outstanding due amount" });
        return;
      }
      if (error instanceof InvalidPaymentAmountError) {
        res.status(400).json({ error: "Invalid payment amount" });
        return;
      }
      if (error instanceof PaymentMethodDisabledError) {
        res.status(400).json({ error: "This payment method is currently disabled by the clinic" });
        return;
      }
      if (error instanceof PartialPaymentsDisabledError) {
        res.status(409).json({ error: "Partial payments are currently disabled — the full due amount must be paid" });
        return;
      }
      next(error);
    }
  });

  return router;
}
