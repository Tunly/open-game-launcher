# Feature-Implementation-Pläne

Dieses Verzeichnis enthält Pläne zur Implementierung der im Feature-Plan (`C:\Users\Danie\Desktop\FEATURE_PLAN.md`) versprochenen Features, die im aktuellen Code fehlen.

## Dateien

| Datei | Inhalt | Priorität |
|---|---|---|
| `00-master-plan-missing-features.md` | Master-Plan: Übersicht, Conventions, Prioritäten, Reihenfolge | — |
| `01-cross-play-and-smart-join.md` | S1: Cross-Play DB + Smart-Join-UI + Badges | Hoch |
| `02-family-sharing.md` | S2: Family Groups + Parental Controls + `/settings/family` | Hoch |
| `03-own-store-backend.md` | S3: Store Backend (Products/Cart/Orders/Licenses/Reviews) | Hoch |
| `04-in-game-overlay.md` | S4: In-Game Overlay + Anti-Cheat-Detection | Mittel |
| `05-performance-monitor.md` | S5: FPS/CPU/GPU/RAM-Monitor + Charts | Mittel |
| `06-cloud-save-e2e-encryption.md` | S6: AES-256-GCM Cloud-Save-Verschlüsselung | Hoch |
| `07-os-keychain-tokens.md` | S7: OS-Keychain für Auth-Tokens (kleinster Plan) | Hoch |
| `08-categories-tags-news-screenshots-prices.md` | S8: Sammelplan (4 kleine Features) | Mittel |

## Empfohlene Ausführungs-Reihenfolge

```
Phase 1 (Quick Wins, 1-2 Tage):
  S7 → S6

Phase 2 (Foundation, 3-4 Tage):
  S1 → S2

Phase 3 (Big Build, 5-7 Tage):
  S3

Phase 4 (Windows-Specific, 2-3 Tage):
  S4 → S5

Phase 5 (Sammelplan, 2-3 Tage):
  S8

Total: ~14-20 Tage Vollzeit
```

## Status-Tracking

Setze in der jeweiligen Datei den Status oben:

- `[ ]` Nicht begonnen
- `[~]` In Arbeit
- `[x]` Abgeschlossen

## Sub-Plan-Format

Jeder Sub-Plan folgt diesem Schema:

1. **Goal & Architecture** (warum, wie)
2. **Phasen** (0 bis N) mit bite-sized Tasks
3. Jeder Task hat: Files, Steps, Build/Test-Schritt, Commit-Message
4. **Done-Definition** als Checkliste am Ende
5. **Nächste Pläne** Verweis

## Conventions

Alle Pläne halten sich strikt an die im Master-Plan dokumentierten Projekt-Conventions:
- SQL: UUID-PK, RLS, updated_at-Trigger, Grants, Comments
- TypeScript: camelCase, `string | null`, separate `lib/supabase/<domain>.ts` Dateien
- Rust: `#[tauri::command]`, `Result<T, String>`, im `commands/`-Modul
- Design: Paper/Ink/Red/Teal, hard offset shadows, 3 px black borders, kein rounded
- Migration-Dateinamen: `NNNN_<feature>.sql` mit aufsteigender Nummer

## Erstellt

Mit Hermes / minimax-m3. Stand: 02.06.2026.
