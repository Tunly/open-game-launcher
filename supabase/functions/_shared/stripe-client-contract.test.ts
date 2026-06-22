Deno.test("Stripe client pins the reviewed API version", async () => {
  const source = await Deno.readTextFile(
    new URL("./stripe.ts", import.meta.url),
  );

  assertIncludes(
    source,
    'export const STRIPE_API_VERSION = "2026-05-27.dahlia"',
  );
  assertIncludes(source, "apiVersion: STRIPE_API_VERSION");
});

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(
      `Expected stripe.ts to include ${JSON.stringify(expected)}`,
    );
  }
}
