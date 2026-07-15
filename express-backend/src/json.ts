const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);

export function serializeBigIntForJson(value: bigint): number | string {
  if (value >= MIN_SAFE_INTEGER && value <= MAX_SAFE_INTEGER) {
    return Number(value);
  }
  return value.toString();
}

export function bigIntToJson(this: bigint): number | string {
  return serializeBigIntForJson(this.valueOf());
}
