import { describe, expect, it } from "vitest";
import {
  assertSingle,
  handleError,
  isMissingSchemaError,
  isMissingSchemaMessage,
  rowBoolean,
  rowConfig,
  rowNullableString,
  rowNumber,
  rowString,
} from "../helpers";

describe("rowString", () => {
  it("returns the string value when present", () => {
    expect(rowString({ id: "abc" }, "id")).toBe("abc");
  });

  it("returns the fallback for non-string values", () => {
    expect(rowString({ id: 42 }, "id", "fallback")).toBe("fallback");
    expect(rowString({ id: null }, "id", "fallback")).toBe("fallback");
    expect(rowString({ id: undefined }, "id", "fallback")).toBe("fallback");
  });

  it("returns the default fallback when key is missing", () => {
    expect(rowString({}, "id")).toBe("");
  });
});

describe("rowNullableString", () => {
  it("returns the string value when present", () => {
    expect(rowNullableString({ bio: "hi" }, "bio")).toBe("hi");
  });

  it("returns null for non-string values", () => {
    expect(rowNullableString({ bio: 42 }, "bio")).toBeNull();
    expect(rowNullableString({ bio: null }, "bio")).toBeNull();
  });
});

describe("rowNumber", () => {
  it("returns the numeric value", () => {
    expect(rowNumber({ count: 5 }, "count")).toBe(5);
  });

  it("returns the fallback for non-numeric values", () => {
    expect(rowNumber({ count: "5" }, "count", 10)).toBe(10);
    expect(rowNumber({ count: null }, "count", 0)).toBe(0);
  });
});

describe("rowBoolean", () => {
  it("returns the boolean value", () => {
    expect(rowBoolean({ flag: true }, "flag")).toBe(true);
  });

  it("returns the fallback for non-boolean values", () => {
    expect(rowBoolean({ flag: 1 }, "flag", false)).toBe(false);
    expect(rowBoolean({ flag: "true" }, "flag", true)).toBe(true);
  });

  it("defaults to true when the fallback is set to true", () => {
    expect(rowBoolean({}, "missing", true)).toBe(true);
  });
});

describe("rowConfig", () => {
  it("returns the object value", () => {
    expect(rowConfig({ cfg: { a: 1 } }, "cfg")).toEqual({ a: 1 });
  });

  it("returns an empty object for non-object values", () => {
    expect(rowConfig({ cfg: "string" }, "cfg")).toEqual({});
    expect(rowConfig({ cfg: 42 }, "cfg")).toEqual({});
    expect(rowConfig({ cfg: null }, "cfg")).toEqual({});
    expect(rowConfig({ cfg: [1, 2] }, "cfg")).toEqual({});
  });
});

describe("assertSingle", () => {
  it("returns the value when present", () => {
    expect(assertSingle("value", "missing")).toBe("value");
  });

  it("throws with the provided message when null", () => {
    expect(() => assertSingle(null, "missing")).toThrow("missing");
  });
});

describe("handleError", () => {
  it("throws on error", () => {
    expect(() => handleError({ message: "boom" })).toThrow("boom");
  });

  it("returns undefined on null", () => {
    expect(handleError(null)).toBeUndefined();
  });
});

describe("isMissingSchemaError", () => {
  it("returns false on null", () => {
    expect(isMissingSchemaError(null)).toBe(false);
  });

  it("returns true for column-not-exist (42703)", () => {
    expect(isMissingSchemaError({ code: "42703", message: "column does not exist" })).toBe(true);
  });

  it("returns true for relation-not-exist (42P01)", () => {
    expect(isMissingSchemaError({ code: "42P01", message: "relation does not exist" })).toBe(true);
  });

  it("returns true when the message contains 'schema cache'", () => {
    expect(isMissingSchemaError({ message: "Could not find the table in the schema cache" })).toBe(true);
  });

  it("returns true when the message contains 'does not exist'", () => {
    expect(isMissingSchemaError({ message: "relation \"foo\" does not exist" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingSchemaError({ code: "PGRST116", message: "row not found" })).toBe(false);
  });
});

describe("isMissingSchemaMessage", () => {
  it("matches 'does not exist' (case-insensitive)", () => {
    expect(isMissingSchemaMessage("Column Does Not Exist")).toBe(true);
  });

  it("matches 'schema cache'", () => {
    expect(isMissingSchemaMessage("error from schema cache lookup")).toBe(true);
  });

  it("does not match unrelated messages", () => {
    expect(isMissingSchemaMessage("row not found")).toBe(false);
  });
});
