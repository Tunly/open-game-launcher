const realtimeInFilterLimit = 100;
const safeFilterValuePattern = /^[a-z0-9_-]+$/i;

export function buildRealtimeInFilters(column: string, values: string[]) {
  const uniqueValues = Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => safeFilterValuePattern.test(value)),
    ),
  );
  const filters: string[] = [];

  for (let index = 0; index < uniqueValues.length; index += realtimeInFilterLimit) {
    const chunk = uniqueValues.slice(index, index + realtimeInFilterLimit);
    filters.push(`${column}=in.(${chunk.join(",")})`);
  }

  return filters;
}
