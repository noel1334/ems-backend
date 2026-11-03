export function padNumber(value, length = 6) {
  if (!Number.isInteger(Number(value)) || Number(value) < 0) throw new TypeError("value must be a non-negative integer");
  return String(value).padStart(length, "0");
}

export function generateNumber(prefix, sequence, length = 6) {
  if (!prefix || !/^[A-Za-z0-9_-]+$/.test(prefix)) throw new TypeError("prefix must be alphanumeric");
  if (!Number.isInteger(Number(sequence)) || Number(sequence) < 1) throw new TypeError("sequence must be a positive integer");
  return `${prefix}-${padNumber(sequence, length)}`;
}
