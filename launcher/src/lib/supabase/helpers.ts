export type UnknownRecord = Record<string, unknown>;

export type SupabaseErrorLike = {
  code?: string;
  message: string;
};

export function rowString(row: UnknownRecord, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

export function rowNullableString(row: UnknownRecord, key: string) {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

export function rowNumber(row: UnknownRecord, key: string, fallback = 0) {
  const value = row[key];
  return typeof value === "number" ? value : fallback;
}

export function rowBoolean(row: UnknownRecord, key: string, fallback = false) {
  const value = row[key];
  return typeof value === "boolean" ? value : fallback;
}

export function rowConfig(row: UnknownRecord, key: string) {
  const value = row[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function assertSingle<T>(data: T | null, message: string): T {
  if (!data) {
    throw new Error(message);
  }
  return data;
}

export function handleError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

export function isMissingSchemaError(error: SupabaseErrorLike | null) {
  if (!error) {
    return false;
  }
  return (
    isMissingSchemaMessage(error.message) ||
    error.code === "42703" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "PGRST202"
  );
}

export function isMissingSchemaMessage(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("does not exist") || normalizedMessage.includes("schema cache");
}
