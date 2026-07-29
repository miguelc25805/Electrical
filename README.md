# GF Field Command

Labor planning, manpower dispatch, material procurement, phase scheduling and
forecasting for union electrical general foremen.

Built for the field: it runs in a browser, installs to a home screen, and works
with **no signal at all** — basements, shafts, yards, the back of a gang box at
5:30am. There is no account, no server, and no monthly bill. A job lives on the
device, and moves between people as a file, the same way drawings already do.

---

## What it does

| Screen | The question it answers |
|---|---|
| **Dashboard** | What could hurt me today? |
| **Work Matrix** | Where is every phase, in every area, right now? |
| **Manpower** | How many hands, of what classification, in what week — and who do I call? |
| **Field Entry** | Reporting today's production in under a minute, one thumb, offline. |
| **Timeline & Lookahead** | What's coming in three weeks, what's in the way, and did we keep last week's promises? |
| **Forecast** | Where does this job land, how far off the estimate, and what would it take to fix? |
| **Materials** | What is the last day I can still submit this without moving the schedule? |
| **Daily Log & T&M** | The paper that wins change orders. |
| **Compliance** | Am I on the apprentice ratio, and are the DAS notices out? |
| **Settings & Rules** | Every agreement rule and wage figure, editable. |

### The things it does that a spreadsheet doesn't

- **Manpower curve → dispatch request.** Budgeted hours get spread across each
  activity's run using the shape you pick for it, divided by hours per hand, and
  turned into a week-by-week call-and-release list. Supervision comes off the
  top per the agreement; apprentices are staffed toward the state ratio.
- **Ratio guards that fire while there's still time.** The California 1:5
  apprentice ratio is judged over the life of the project, so a shortfall found
  at closeout is unfixable. It runs as a live gauge instead.
- **Backward-scheduled procurement.** With 2026 lead times — medium-voltage
  switchgear at 40–80 weeks, pad-mount transformers at 110–130 — every date is
  worked backward from when the gear must be on site. The number that matters is
  the last day you can still submit.
- **Earned value in man-hours.** Percent complete comes from what is physically
  in place, never from hours burned — otherwise the production factor reads 1.00
  forever and hides the exact problem it exists to find.
- **Overtime priced correctly.** Flat fringes don't scale with overtime;
  percentage-of-base fringes (NEBF at 3%, AMF at 0.5%) are factored at the
  overtime multiplier. A single blended rate gets this wrong and understates
  what overtime actually costs.

---

## Running it

```bash
npm install
npm run dev        # development server
npm test           # calculation engine test suite
npm run build      # production build into dist/
npm run preview    # serve the production build
```

`dist/` is plain static files with a relative base — host it on GitHub Pages, a
shop intranet folder, or open it from a laptop in the trailer. No server-side
rewrite rules to configure.

### Installing on a phone or tablet

Open the page, then use the browser's **Add to Home Screen** / **Install**
option. It then launches like any other app and runs offline.

---

## Adopting it in another local

Everything about the agreement is data, not code. Open **Settings ▸ Agreement**
and **Settings ▸ Classifications** and change:

- foreman required at crew size, workers per foreman, general foreman trigger
- journeyman hours per apprentice hour, and the on-the-job crew ratio
- workweek (4×10, 5×8), overtime thresholds and multipliers, shift premiums
- every classification's percent of the journeyman rate, whether it counts as
  journey-level for ratio purposes, and whether it counts as an apprenticeship
  graduate for Skilled & Trained Workforce
- the wage package: base rate, each fringe, its basis (flat vs percent of base),
  and whether it is factored at overtime

The app ships pre-filled with a Southern California / IBEW Local 11 structure as
a **starting point only**. It shows a reminder on the dashboard until you
confirm the wage figures against your own wage sheet.

> Compliance features are a planning aid, not legal advice. Confirm the
> thresholds and deadlines that apply to your contract with your office.

---

## How it's built

```
src/
  engine/      pure, unit-tested calculation — the heart of the product
    curve.ts         spread activity hours across weeks (uniform / bell / front / back)
    crew.ts          hours → headcount by classification; call-and-release deltas
    ratios.ts        CA 1:5 apprentice, foreman/GF supervision, STWF 60%
    earnedValue.ts   earned hours, production factor, EAC, TCPI, S-curve
    wages.ts         composite rate incl. OT-factored percentage fringes
    procurement.ts   backward scheduling from the on-site date
    schedule.ts      lookahead windows, readiness, Percent Plan Complete
  domain/      types, seeded templates, worked example
  store/       Zustand state persisted to IndexedDB, plus derived selectors
  components/  design-system primitives, hand-rolled SVG charts, icons
  screens/     one file per screen
```

The engine is pure functions with no React or storage dependency, and it is
tested first — ratio math, earned value and composite wage rates are where being
wrong actually costs money.

**Stack:** Vite · React · TypeScript · Zustand + IndexedDB · Tailwind · Vitest ·
vite-plugin-pwa. Charts are hand-rolled SVG so the bundle stays small enough to
cache for offline use.

### Design notes

- Nothing interactive is smaller than 48px — this gets used with gloves on.
- Status is never color alone. Every indicator carries a glyph and a word, since
  roughly one in twelve men has a color vision deficiency.
- The work matrix encodes progress with a single-hue sequential ramp. Phase
  identity is carried by the code in text, because eleven hues nobody can tell
  apart is decoration, not information.
- Dark by default (electrical rooms, night shift); a bright mode exists for
  direct sun on a tablet.
- Every report prints to clean white paper. The trailer runs on paper.

---

## Your data

It lives in this browser's IndexedDB on this device. Nothing is uploaded
anywhere. That means:

- **Back it up.** Settings ▸ Backup exports the whole job — hours, quantities,
  materials, constraints, logs and tickets — as one file. Email it to yourself
  weekly, keep it on a drive, or hand it to the foreman taking over.
- Clearing browser data for the site deletes the job. Export first.
- Opening a project file brings it in as a separate copy, so restoring a backup
  never overwrites what you're working on.
