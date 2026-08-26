// Shared validators for ClinicSettings' non-money fields (money validators live
// in money.ts, kept separate since they're a distinct, already-established
// domain). Every validator here follows the same {validator, message} shape
// Mongoose expects, matching the existing convention in money.ts.

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function maxLengthValidator(max: number) {
  return {
    validator: (value: string | null | undefined) => value == null || value.length <= max,
    message: `{PATH} must be at most ${max} characters`,
  };
}

export const nullableHttpUrlValidator = {
  validator: (value: string | null | undefined) =>
    value == null || value === "" || HTTP_URL_PATTERN.test(value),
  message: "{PATH} must be a valid http:// or https:// URL",
};

export const nullableEmailValidator = {
  validator: (value: string | null | undefined) =>
    value == null || value === "" || EMAIL_PATTERN.test(value),
  message: "{PATH} must be a valid email address",
};

export const invoicePrefixValidator = {
  validator: (value: string) => /^[A-Z0-9]{1,10}$/.test(value),
  message: "{PATH} must be 1-10 uppercase letters/digits",
};

export function integerRangeValidator(min: number, max: number) {
  return {
    validator: (value: number) => Number.isInteger(value) && value >= min && value <= max,
    message: `{PATH} must be an integer between ${min} and ${max}`,
  };
}
