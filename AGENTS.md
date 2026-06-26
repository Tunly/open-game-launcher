# Project Instructions

For all work in this repository, apply the OG Launcher visual system documented in:

`docs/PROJECT_DESIGN.md`

The required style is **Retro Manga Launcher**: aged paper background, halftone texture, thick black borders, hard offset shadows, sharp corners, red/teal accents, dense game-launcher panels, and header navigation. Do not replace it with a dark SaaS/admin dashboard style.

When editing UI:

- Keep `OG-Launcher` as the header brand.
- Keep primary navigation in the header.
- Reuse `neo-title`, `neo-copy`, `neo-dots`, and existing art placeholder classes.
- Preserve the game-launcher feel on profile/settings/social pages too.
- Run the relevant checks before finishing.

Collaboration preference:

- For substantial future prompts in this project, prefer using subagents for concrete, independent side tasks such as codebase exploration, UI implementation slices, Supabase/RLS checks, or verification.
- Do not spawn subagents for trivial status updates, single-command questions, or tightly coupled blocking edits where local work is faster and clearer.
