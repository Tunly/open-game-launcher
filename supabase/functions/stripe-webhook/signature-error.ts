interface StripeErrorShape {
  name?: unknown;
  type?: unknown;
}

const STRIPE_SIGNATURE_ERROR_TYPE = "StripeSignatureVerificationError";

// Do not inspect stripe.errors here. `stripe` is a lazy proxy, so touching that
// property would require STRIPE_SECRET_KEY while classifying an error caused by
// a missing secret in the first place.
export function isStripeSignatureVerificationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as StripeErrorShape;
  return candidate.type === STRIPE_SIGNATURE_ERROR_TYPE ||
    candidate.name === STRIPE_SIGNATURE_ERROR_TYPE;
}
