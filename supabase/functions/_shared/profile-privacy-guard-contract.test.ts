Deno.test("profile privacy guard pins public profile lane select policies", async () => {
  const migration = normalizeSql(
    await Deno.readTextFile(
      new URL(
        "../../migrations/20260614123000_profile_privacy_guard.sql",
        import.meta.url,
      ),
    ),
  );

  for (
    const policy of [
      ["profile_system_showcases_select_visible", "profile_showcases"],
      ["profile_system_comments_select_visible", "profile_comments"],
      ["profile_system_library_select_visible", "user_library"],
      ["profile_system_game_stats_select_visible", "user_game_stats"],
      ["profile_system_user_achievements_select_visible", "user_achievements"],
      ["profile_system_wishlist_select_visible", "user_wishlist"],
      ["profile_system_activity_select_visible", "user_activity"],
      ["profile_system_hardware_select_visible", "user_hardware"],
      ["user_library_select_own", "user_library"],
      ["user_game_stats_select_visible", "user_game_stats"],
      ["user_achievements_select_visible", "user_achievements"],
      ["user_wishlist_select_own", "user_wishlist"],
      ["user_activity_select_own", "user_activity"],
      ["user_activity_select_public", "user_activity"],
      ["user_activity_select_friends", "user_activity"],
    ] as const
  ) {
    assertIncludes(
      migration,
      `drop policy if exists ${policy[0]} on public.${policy[1]};`,
    );
  }

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_showcases_select_visible",
    tableName: "profile_showcases",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, visibility)",
    extraGuard: "is_enabled",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_comments_select_visible",
    tableName: "profile_comments",
    profileGuard: "public.can_view_profile(auth.uid(), profile_user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), profile_user_id, p.comments_visibility)",
    extraGuard: "is_deleted = false",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_library_select_visible",
    tableName: "user_library",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, p.library_visibility)",
    extraGuard: "status in ('active', 'hidden')",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_game_stats_select_visible",
    tableName: "user_game_stats",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, p.game_activity_visibility)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_user_achievements_select_visible",
    tableName: "user_achievements",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, p.achievement_visibility)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_wishlist_select_visible",
    tableName: "user_wishlist",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, p.wishlist_visibility)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_activity_select_visible",
    tableName: "user_activity",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, visibility)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_hardware_select_visible",
    tableName: "user_hardware",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, visibility)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_showcases_select_own",
    tableName: "profile_showcases",
    selectTarget: "authenticated",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, visibility)",
    extraGuard: "auth.uid() = user_id",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_comments_select_author_or_owner",
    tableName: "profile_comments",
    selectTarget: "authenticated",
    profileGuard: "public.can_view_profile(auth.uid(), profile_user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), profile_user_id, p.comments_visibility)",
    extraGuard: "(auth.uid() = profile_user_id or auth.uid() = author_id)",
  });

  assertGuardedSelectPolicy(migration, {
    policyName: "profile_privacy_guard_library_select_own",
    tableName: "user_library",
    selectTarget: "authenticated",
    profileGuard: "public.can_view_profile(auth.uid(), user_id)",
    visibilityGuard:
      "public.can_view_visibility(auth.uid(), user_id, p.library_visibility)",
    extraGuard: "auth.uid() = user_id",
  });

  for (const block of selectPolicyBlocks(migration)) {
    assertIncludes(block, "public.can_view_profile(auth.uid(),");
    assertIncludes(block, "public.can_view_visibility(auth.uid(),");
  }
});

Deno.test("profile privacy guard keeps owner writes command-scoped", async () => {
  const migration = normalizeSql(
    await Deno.readTextFile(
      new URL(
        "../../migrations/20260614123000_profile_privacy_guard.sql",
        import.meta.url,
      ),
    ),
  );

  for (
    const policy of [
      ["profile_system_showcases_crud_own", "profile_showcases", "user_id"],
      ["profile_system_wishlist_crud_own", "user_wishlist", "user_id"],
      ["profile_system_hardware_crud_own", "user_hardware", "user_id"],
    ] as const
  ) {
    assertIncludes(
      migration,
      `drop policy if exists ${policy[0]} on public.${policy[1]};`,
    );
    assertCommandScopedOwnerWrites(migration, policy[1], policy[2]);
  }

  assertNotIncludes(migration, "for all to authenticated");
});

function assertGuardedSelectPolicy(
  source: string,
  policy: {
    policyName: string;
    tableName: string;
    selectTarget?: string;
    profileGuard: string;
    visibilityGuard: string;
    extraGuard?: string;
  },
) {
  const block = policyBlock(source, policy.policyName, policy.tableName);

  assertIncludes(
    block,
    `for select to ${policy.selectTarget ?? "anon, authenticated"}`,
  );
  assertIncludes(block, policy.profileGuard);
  assertIncludes(block, policy.visibilityGuard);
  if (policy.extraGuard) {
    assertIncludes(block, policy.extraGuard);
  }
}

function assertCommandScopedOwnerWrites(
  source: string,
  tableName: string,
  ownerColumn: string,
) {
  const insertPolicy = policyBlock(
    source,
    `profile_privacy_guard_${tableName}_insert_own`,
    tableName,
  );
  assertIncludes(insertPolicy, "for insert to authenticated");
  assertIncludes(insertPolicy, `with check (auth.uid() = ${ownerColumn})`);

  const updatePolicy = policyBlock(
    source,
    `profile_privacy_guard_${tableName}_update_own`,
    tableName,
  );
  assertIncludes(updatePolicy, "for update to authenticated");
  assertIncludes(updatePolicy, `using (auth.uid() = ${ownerColumn})`);
  assertIncludes(updatePolicy, `with check (auth.uid() = ${ownerColumn})`);

  const deletePolicy = policyBlock(
    source,
    `profile_privacy_guard_${tableName}_delete_own`,
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

function selectPolicyBlocks(source: string) {
  const blocks: string[] = [];
  let start = 0;

  while (true) {
    const policyStart = source.indexOf("create policy ", start);
    if (policyStart === -1) {
      break;
    }

    const policyEnd = source.indexOf(";", policyStart);
    if (policyEnd === -1) {
      throw new Error("Expected every policy to end with a semicolon");
    }

    const block = source.slice(policyStart, policyEnd);
    if (block.includes(" for select ")) {
      blocks.push(block);
    }

    start = policyEnd + 1;
  }

  return blocks;
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
