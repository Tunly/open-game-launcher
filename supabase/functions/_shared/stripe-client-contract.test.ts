Deno.test("Stripe client pins the reviewed API version", async () => {
  const source = await Deno.readTextFile(
    new URL("./stripe.ts", import.meta.url),
  );

  assertIncludes(
    source,
    'export const STRIPE_API_VERSION = "2026-05-27.dahlia"',
  );
  assertIncludes(source, "apiVersion: STRIPE_API_VERSION");
  assertIncludes(source, "export function getStripeClient(): Stripe");
  assertIncludes(source, "export const stripe = new Proxy");
  assertNotIncludes(
    source,
    'const STRIPE_SECRET_KEY = requireEnv("STRIPE_SECRET_KEY")',
  );
});

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(
      `Expected stripe.ts to include ${JSON.stringify(expected)}`,
    );
  }
}

function assertNotIncludes(source: string, unexpected: string) {
  if (source.includes(unexpected)) {
    throw new Error(
      `Expected stripe.ts not to include ${JSON.stringify(unexpected)}`,
    );
  }
}
