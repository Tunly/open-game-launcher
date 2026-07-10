// deno-lint-ignore-file no-import-prefix
import {
  assert,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import { isStripeSignatureVerificationError } from "./signature-error.ts";

Deno.test("Stripe signature errors are classified without a Stripe client", () => {
  assert(
    isStripeSignatureVerificationError({
      message: "No signatures found matching the expected signature",
      type: "StripeSignatureVerificationError",
    }),
  );
  assert(
    isStripeSignatureVerificationError({
      name: "StripeSignatureVerificationError",
    }),
  );

  assertFalse(isStripeSignatureVerificationError(new Error("missing secret")));
  assertFalse(isStripeSignatureVerificationError(null));
  assertFalse(isStripeSignatureVerificationError("invalid signature"));
});
