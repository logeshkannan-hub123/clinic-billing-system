import { PatientModel, type PatientHydratedDoc } from "../models/Patient.js";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Concurrency-safe lookup-or-create: the same exact (name, phone) pair always
 * resolves to one Patient, even under simultaneous requests. Safety comes
 * from the compound unique index on (nameKey, phone) in the Patient model,
 * not from application-level check-then-insert logic (which would still
 * race). If two requests race to create the same new patient, MongoDB's
 * unique index lets exactly one insert win; the other gets a duplicate-key
 * error here and re-fetches the winner's document instead of failing.
 */
export async function findOrCreatePatient(
  name: string,
  phone: string,
): Promise<PatientHydratedDoc> {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  // Collapses repeated internal whitespace ("Asha  Rao" -> "asha rao") so a
  // stray double space doesn't defeat dedup against the same person's
  // normally-typed name — matching is on `nameKey` only; the originally
  // typed `trimmedName` (outer whitespace trimmed, internal spacing as
  // typed) is still what's stored/displayed.
  const nameKey = trimmedName.toLowerCase().replace(/\s+/g, " ");

  try {
    return await PatientModel.findOneAndUpdate(
      { nameKey, phone: trimmedPhone },
      { $setOnInsert: { name: trimmedName, nameKey, phone: trimmedPhone } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await PatientModel.findOne({ nameKey, phone: trimmedPhone });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}
