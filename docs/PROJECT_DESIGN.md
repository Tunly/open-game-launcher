# OG Launcher Project Design

This is the fixed visual direction for OG Launcher. Apply it to every new page, component, modal, form, and profile/game surface unless a task explicitly says otherwise.

## Design Name

**Retro Manga Launcher**

The app should feel like a cyberpunk game launcher printed in a 90s manga magazine: aged paper, heavy ink, hard shadows, dense panels, technical labels, and aggressive game art. It must not look like a generic SaaS dashboard.

## Core Rules

- Keep the header-first layout: brand on the left, navigation in the header, notifications/profile on the right.
- Use the current brand text: `OG-Launcher`.
- Use page backgrounds based on warm paper plus halftone dots.
- Use thick black borders on containers and controls.
- Use hard offset shadows, never soft blurred shadows.
- Use sharp corners. Avoid rounded cards, pills, glassmorphism, gradients, and soft pastel UI.
- Keep pages compact and information-rich.
- Use game-launcher language and layout, not admin-dashboard wording.
- Prefer visual game panels, cover art placeholders, badges, activity panels, and technical readouts.

## Colors

Use these as the project palette:

| Token | Hex | Usage |
| --- | --- | --- |
| Paper | `#fff9ed` / `#f5eedf` | App background, panels |
| Paper Dim | `#f6edd8` / `#efe6d4` | Inputs, inactive panels |
| Ink | `#171411` / `#1f1c0f` | Borders, text, hard shadows |
| Red | `#b7102a` / `#c20b2f` | Brand, primary actions, alerts |
| Teal | `#007166` / `#087d6d` | Active nav, secondary actions, online state |
| Cyan | `#8cf5e4` | Small highlights and hover accents |
| Muted Text | `#5b403f` / `#655f58` | Metadata and descriptions |

Avoid introducing new dominant colors. If a feature needs a state color, map it back to red, teal, ink, paper, or muted gray.

## Typography

Use the existing classes:

- `neo-title` for brand, page titles, large card titles, and dramatic headings.
- `neo-copy` for labels, metadata, buttons, counters, nav items, and technical readouts.

Rules:

- Headings are uppercase, bold, and tight.
- Labels and metadata are uppercase with letter spacing.
- Body text can be normal case, but should stay compact.
- Do not use viewport-scaled font sizes inside buttons, cards, sidebars, or forms.

## Layout

- Header height should stay close to the current 80px band with a thick bottom border.
- Main content uses `neo-dots`.
- Content width should generally stay around `max-w-[1220px]`.
- Page sections should use strong manga-panel composition.
- Use grid layouts for library/store/profile panels.
- Do not add a left sidebar unless explicitly requested; navigation belongs in the header.
- Do not add marketing hero layouts. The first screen should be the app itself.

## Components

### Buttons

- Border: `border-2` or `border-[3px] border-black`
- Shadow: hard offset like `shadow-[3px_3px_0_#1f1c0f]`
- Primary: red background with white text
- Active/secondary: teal background with white text
- Hover: small translate up plus hard shadow or teal/red fill change

### Panels/Cards

- Use paper backgrounds.
- Use thick black borders.
- Use hard offset shadows for elevated panels.
- Use black or red header strips for important labels.
- Avoid rounded corners.

### Inputs

- Paper-dim background.
- Thick black border or strong bottom border.
- Monospace label via `neo-copy`.
- Keep the punched-in print feel.

### Badges

- Small rectangular blocks.
- Use red for update/warning, teal for active/online/technical tags, paper for neutral tags.
- Keep them uppercase.

### Profile Pages

Profile UI must follow the same Retro Manga Launcher style:

- Paper background, thick borders, hard shadows.
- Avatar and banner should look like collectible player-card assets, not generic SaaS profile blocks.
- Showcases should be manga panels.
- Privacy/settings forms should still look like launcher settings, not plain admin forms.

## Existing CSS Anchors

Preserve and reuse these classes from `launcher/src/index.css`:

- `neo-title`
- `neo-copy`
- `neo-dots`
- `hero-art`
- `card-art-drift`
- `card-art-crash`
- `card-art-blood`
- `library-art-tokyo`
- `library-art-mech`
- `library-art-phantom`

When adding new art placeholders, build them with CSS patterns that match the current print/halftone style.

## Anti-Patterns

Do not add:

- Dark-blue SaaS dashboards.
- Glass cards.
- Rounded modern app cards.
- Purple/blue gradients.
- Floating orb/bokeh backgrounds.
- Large empty marketing sections.
- Generic Tailwind admin panels.
- Soft shadows or blur-heavy elevation.

## Verification Checklist

Before finishing UI work:

- Header still uses `OG-Launcher`.
- Header nav still includes Store, Library, Community, Downloads.
- Background is warm paper with print/halftone feel.
- Borders and shadows are hard, black, and visible.
- No rounded/glass/SaaS look was introduced.
- Mobile still wraps without text overlap.
- `pnpm typecheck`, `pnpm lint`, and for meaningful UI changes `pnpm build` pass.
