# Nirantar design system

One theme for every screen. Tokens live in `src/styles/tokens.css`; `src/styles/theme.css` maps them onto components and layout. The look follows the reference clinic site the client chose: a warm grey page, navy ink, teal actions, rounded cards and pill buttons.

## Tokens

| Group | Token | Value | Use |
|---|---|---|---|
| Surface | `--canvas` | #F3F3F0 | page background |
| | `--card` | #FFFFFF | cards, forms |
| | `--teal-pale` / `--teal-soft` / `--warm-grey` | #E6F1EE / #C9E4DE / #E8E6E1 | tinted blocks, counters |
| Ink | `--ink` / `--navy` | #1E3A4C | headings, body, dark buttons |
| | `--muted`, `--ink-soft` | #55666F, #3A5260 | secondary text (AA on white) |
| Action | `--teal` | #4FA8A0 | primary button fill (dark text `--button-ink` #173140) |
| | `--teal-deep` / `--cerulean` | #357F78 | links, focus ring, source chips |
| Status | `--sage` (verified), `--terracotta` (attention) | #2E7D5B, #B4472B | chips and notes, always with words, never colour alone |
| Line | `--divider`, `--line` | #DCE2E1, #E4E9E8 | borders |
| Type | `--font-display` | Manrope 700/800 | headings, numbers |
| | `--font-body` | Public Sans 400/500/600 | text; IBM Plex Sans Devanagari as the Hindi fallback |
| Shape | `--radius`, `--radius-lg` | 10px, 16px | controls, cards; buttons and chips are pills |

## Components

| Component | Where | Variants and states |
|---|---|---|
| Header (`TopBar`) | `pages/Chrome.tsx` | brand, jump links (chips under 1024px), language, profile menu with photo |
| `Avatar` | `pages/Chrome.tsx` | photo or initial; photo is a 256px JPEG kept per tester space |
| Button | `ui/primitives.tsx` | primary (teal), secondary (outline), ghost, sm/icon; disabled |
| Card + `CardHead` | `ui/primitives.tsx` | titled card; no coloured top strip |
| Hero | `theme.css` `.hero` | boxed, corner marks, picture on the right from 1024px |
| Counter (`.kpi`) | `pages/Homes.tsx` | value plus the sentence saying where it was counted |
| `ScopeNote` | `ui/ScopeNote.tsx` | `demo` (made-up content) and `future` (not built yet) |
| `SourceChip`, `SourceNote` | `ui/primitives.tsx`, `pages/ReceivedDashboard.tsx` | opens the slip a number came from, or names who entered it |
| How it works strip | `pages/Purpose.tsx` | four steps, each a real jump button |

## Rules

1. Every number on screen shows its evidence: a source chip that opens the slip, or a plain statement of who entered it and where it was counted. A number with neither is a bug.
2. Anything made up or unbuilt carries a `ScopeNote`. Made-up content never feeds a count, a waiting time or a record.
3. One page per role. Parts are reached by jump links, not hidden behind tabs or menus.
4. Focus is a 3px teal ring. Controls are at least 40px tall. Status is never colour alone.
5. Laptop is two columns with a hero picture; phone is one column with chips under the header.

## Audit (this round)

| Check | Result |
|---|---|
| Tokens used | 534 `var(--…)` uses |
| Hard-coded hex in components | 120 in legacy CSS files, 8 in TypeScript (chart strokes, logo) |
| Dead CSS | 313 rules for screens that no longer exist were removed (checked by a script that keeps any class the code can build at run time, and by before/after screenshots) |
| Duplicate naming | `terracotta`, `sage`, `cerulean` are token names kept from the old palette; their values are now alert red-orange, green and teal |

Priority actions: move the remaining hex values in `components.css` onto tokens; rename the three legacy token names to `alert`, `ok` and `link`.

## Pictures

`public/img/clinic.jpg` is an original illustration made for this project, shown only on the sign-in screen. Nothing inside the app uses pictures. Replace it with a licensed photograph if you want one; keep 4:3 and under 150 KB.

## Hospital-system patterns (added)

| Pattern | Where | Rule |
|---|---|---|
| Facility strip | `.his-strip`, top of every signed-in page | Hospital, department and the signed-in person, so a screenshot always says whose screen it is |
| Ruled rows | `.xlist`, `.table` | Dense rows with a hairline and an alternate tint, like a register, never cards inside cards |
| Risk flags | `.riskflag`, `.chk .is-alert` | HIV, HCV and a past heart attack are written in red, only when recorded. Red is used for nothing else |
| Source on every number | `SourceChip`, `SourceNote` | Unchanged: no number without its source |
| Blank canvas | `BlankCanvas` in `UploadDocument.tsx` | A page for a stylus, iPad pen or finger. It becomes a PNG and goes through the same reading as a scan |
| Demo and future-scope notes | `ScopeNote` | Unchanged. Demo patients also carry "(demo)" in their name |
