export const integerValidator = {
  validator: Number.isInteger,
  message: "{PATH} must be an integer",
};

export const nullableNonNegativeIntegerValidator = {
  validator: (value: number | null | undefined) =>
    value === null || value === undefined || (Number.isInteger(value) && value >= 0),
  message: "{PATH} must be a non-negative integer",
};

export const nullableBasisPointsValidator = {
  validator: (value: number | null | undefined) =>
    value === null ||
    value === undefined ||
    (Number.isInteger(value) && value >= 0 && value <= 10000),
  message: "{PATH} must be an integer between 0 and 10000 basis points (0-100%)",
};
