Deno.test(
  "social link visibility migration adds per-link privacy",
  async () => {
    const migration = normalizeSql(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260614130000_social_link_visibility.sql",
          import.meta.url,
        ),
      ),
    );

    assertIncludes(
      migration,
      "alter table public.user_social_links add column if not exists visibility text not null default 'public'",
    );
    assertIncludes(
      migration,
      "constraint user_social_links_visibility_check check (visibility in ('public', 'friends_only', 'private'))",
    );
    assertGuardedSelectPolicy(migration, {
      policyName: "social_link_visibility_select_visible",
      tableName: "user_social_links",
      profileGuard: "public.can_view_profile(auth.uid(), user_id)",
      visibilityGuard:
        "public.can_view_visibility(auth.uid(), user_id, visibility)",
    });
  },
);

Deno.test(
  "social link visibility keeps owner writes command-scoped",
  async () => {
    const migration = normalizeSql(
      await Deno.readTextFile(
        new URL(
          "../../migrations/20260614130000_social_link_visibility.sql",
          import.meta.url,
        ),
      ),
    );

    assertIncludes(
      migration,
      "drop policy if exists profile_system_social_links_crud_own on public.user_social_links",
    );
    assertCommandScopedOwnerWrites(migration, "user_social_links", "user_id");
    assertNotIncludes(migration, "for all to authenticated");
  },
);

function assertGuardedSelectPolicy(
  source: string,
  policy: {
    policyName: string;
    tableName: string;
    profileGuard: string;
    visibilityGuard: string;
  },
) {
  const block = policyBlock(source, policy.policyName, policy.tableName);

  assertIncludes(block, "for select to anon, authenticated");
  assertIncludes(block, policy.profileGuard);
  assertIncludes(block, policy.visibilityGuard);
}

function assertCommandScopedOwnerWrites(
  source: string,
  tableName: string,
  ownerColumn: string,
) {
  const insertPolicy = policyBlock(
    source,
    "social_link_visibility_insert_own",
    tableName,
  );
  assertIncludes(insertPolicy, "for insert to authenticated");
  assertIncludes(insertPolicy, `with check (auth.uid() = ${ownerColumn})`);

  const updatePolicy = policyBlock(
    source,
    "social_link_visibility_update_own",
    tableName,
  );
  assertIncludes(updatePolicy, "for update to authenticated");
  assertIncludes(updatePolicy, `using (auth.uid() = ${ownerColumn})`);
  assertIncludes(updatePolicy, `with check (auth.uid() = ${ownerColumn})`);

  const deletePolicy = policyBlock(
    source,
    "social_link_visibility_delete_own",
    tableName,
  );
  assertIncludes(deletePolicy, "for delete to authenticated");
  assertIncludes(deletePolicy, `using (auth.uid() = ${ownerColumn})`);
}

function policyBlock(source: string, policyName: string, tableName: string) {
  const start = source.indexOf(
    `create policy ${policyName} on public.${tableName} `,
  );
  if (start === -1) {
    throw new Error(
      `Expected migration to create policy ${policyName} on ${tableName}`,
    );
  }

  const end = source.indexOf(";", start);
  if (end === -1) {
    throw new Error(`Expected policy ${policyName} to end with a semicolon`);
  }

  return source.slice(start, end);
}

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

function assertIncludes(source: string, expected: string) {
  if (!source.includes(expected)) {
    throw new Error(`Expected SQL to include ${JSON.stringify(expected)}`);
  }
}

function assertNotIncludes(source: string, expected: string) {
  if (source.includes(expected)) {
    throw new Error(`Expected SQL not to include ${JSON.stringify(expected)}`);
  }
}
