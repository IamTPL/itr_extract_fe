# UI Redesign — ITR Extract

**Date:** 2026-05-08
**Approach:** CSS Variables + className (Option B)
**Scope:** Full visual restyle, sidebar moved left, no logic changes

---

## Goals

- Modern, minimalist aesthetic suited to an accounting tool
- Primary palette: white/black; secondary: grey
- Typography: Inter (Google Fonts)
- Left sidebar (fixed 280px) replacing current right sidebar

---

## Design Tokens

Defined as CSS custom properties in `src/index.css`. No colour magic-numbers in components.

```css
/* Palette */
--color-bg:             #ffffff;
--color-bg-subtle:      #f9f9f9;
--color-bg-sidebar:     #f4f4f5;
--color-border:         #e5e7eb;
--color-border-focus:   #a1a1aa;
--color-text:           #0a0a0a;
--color-text-secondary: #6b7280;
--color-text-muted:     #9ca3af;

/* Status */
--color-success:        #16a34a;
--color-warning:        #ca8a04;
--color-error:          #dc2626;

/* Layout */
--sidebar-w:            280px;

/* Shape */
--radius-sm:            4px;
--radius-md:            6px;
--radius-lg:            10px;

/* Typography */
--font:                 'Inter', system-ui, sans-serif;
```

Inter is loaded via a `<link>` in `index.html` (Google Fonts, weights 400/500/600/700).

---

## App Shell Layout

`App.tsx` — `AuthenticatedApp` renders:

```
┌──────────────────────────────────────────────────┐
│ SIDEBAR 280px  │  MAIN (flex:1)                  │
│                │  ┌──────────────────────────┐   │
│ [ITR Extract]  │  │ HEADER: user + sign out  │   │
│                │  └──────────────────────────┘   │
│ History (n/10) │                                  │
│ ─────────────  │  [UploadCard]                    │
│  job item      │                                  │
│  job item      │  [Status / Error / JobDetailView]│
│  ...           │                                  │
└──────────────────────────────────────────────────┘
```

- Root element: `display: grid; grid-template-columns: var(--sidebar-w) 1fr; min-height: 100vh`
- Sidebar: `background: var(--color-bg-sidebar); border-right: 1px solid var(--color-border); position: sticky; top: 0; height: 100vh; overflow-y: auto`
- Main: `background: var(--color-bg); overflow-y: auto`
- Logo "ITR Extract" lives at top of sidebar (removed from header)

---

## Section: Header

Located inside main content area, above `UploadCard`.

- Padding: `0.875rem 1.5rem`
- Border-bottom: `1px solid var(--color-border)`
- Username: `font-size: 0.82rem; color: var(--color-text-secondary)`
- Sign out button: ghost style — `border: 1px solid var(--color-border); background: transparent; border-radius: var(--radius-md); padding: 0.35rem 0.75rem; font-size: 0.8rem; color: var(--color-text-secondary)` — hover darkens border to `--color-border-focus`

---

## Section: Sidebar / JobHistory

**Logo area (top of sidebar):**
- "ITR EXTRACT": `font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted)`
- "History (n/10)": `font-size: 0.75rem; color: var(--color-text-muted)`
- Divider: `border-bottom: 1px solid var(--color-border)`

**Job item:**
- Padding: `0.6rem 1rem`
- Hover: `background: var(--color-bg-subtle)`
- Selected: `background: var(--color-border)`
- Filename: `font-size: 0.85rem; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- Delete button: icon `×`, visible only on hover (opacity: 0 → 1 transition), positioned inline right
- Reprocess (failed jobs only): small text link, not a full button

**JobStatusBadge — updated:**
- Format: `● {Label}` — coloured dot + grey label text
- Dot colours map to CSS variables: success → `--color-success`, warning → `--color-warning`, error → `--color-error`, muted → `--color-text-muted`
- Label: `font-size: 0.78rem; color: var(--color-text-secondary); font-weight: 400`

---

## Section: UploadCard

Replaces the bare `<input type="file">` with a styled drop zone.

```
┌──────────────────────────────────────────────────┐
│                                                  │
│         ↑   Drop PDF here or click to browse    │
│              Max 20 MB · PDF only               │
│                                                  │
└──────────────────────────────────────────────────┘
```

- Border: `2px dashed var(--color-border); border-radius: var(--radius-lg)`
- Background: `var(--color-bg-subtle)`
- Padding: `2.5rem; text-align: center`
- Upload icon: `↑` Unicode or inline SVG, `color: var(--color-text-muted)`
- Drag-over state: border becomes solid, background `#fff`
- Busy state: replaces icon with "Uploading…" text, `cursor: wait`
- Error: red text below card, `font-size: 0.82rem; color: var(--color-error)`
- Hidden `<input type="file">` triggered by click on zone
- Add `onDragOver` / `onDrop` event handlers to enable drag-and-drop (not in current code)

---

## Section: JobDetailView

**Title area:**
- `{taxYear} ITR — {clientName}`: `font-size: 1.1rem; font-weight: 600; color: var(--color-text)`
- Return type: `font-size: 0.82rem; color: var(--color-text-secondary)`

**Card component** (shared across all subsections):
- `background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 1.25rem 1.5rem; margin-bottom: 1.25rem`

**Section label:**
- `font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted); margin-bottom: 0.75rem`

**E-Consent form checkboxes:**
- Checkbox native + inline label, `font-size: 0.88rem`
- Form number: `font-weight: 600`
- Jurisdiction & pages: `color: var(--color-text-muted); font-size: 0.82rem`

**Actions card (To: + buttons):**
- `To:` input: full border `1px solid var(--color-border)`, radius `var(--radius-md)`, padding `0.5rem 0.75rem`, focus outline `var(--color-border-focus)`
- Primary button: `background: #0a0a0a; color: #fff; border-radius: var(--radius-md); padding: 0.55rem 1.1rem; font-weight: 600; font-size: 0.88rem; border: none`
- Ghost button: `border: 1px solid var(--color-border); background: transparent; color: var(--color-text)`
- Disabled: `opacity: 0.4; cursor: not-allowed`

**Email Preview card:**
- `contentEditable` div: `border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 1.25rem; background: var(--color-bg-subtle); min-height: 200px; outline: none`
- Focus: border transitions to `var(--color-border-focus)`

---

## Section: LoginGate

- Background: `var(--color-bg-subtle)`
- Card: `background: #fff; border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 2.5rem 2rem; width: 360px; text-align: center; margin: auto`
- Icon: 📊, `font-size: 2rem; margin-bottom: 1rem`
- Title "ITR Extract": `font-size: 1.4rem; font-weight: 700; color: var(--color-text)`
- Subtitle: `font-size: 0.88rem; color: var(--color-text-secondary); margin-bottom: 2rem`
- Sign in button: same primary style (`background: #0a0a0a`) — replaces MS blue, keeps MS logo inline

---

## Implementation Scope

| File | Changes |
|---|---|
| `index.html` | Add Inter Google Fonts `<link>` |
| `src/index.css` | Add all CSS custom properties + utility classes |
| `src/App.tsx` | Grid shell, sidebar left, header in main, inline styles → classNames |
| `src/components/JobHistory.tsx` | Left sidebar layout, hover/selected states, × delete icon |
| `src/components/JobStatusBadge.tsx` | Dot + label format |
| `src/components/UploadCard.tsx` | Drop zone UI, drag-over state |
| `src/components/JobDetailView.tsx` | Card classNames, button variants, input styles |

**Out of scope:** No changes to hooks, API client, types, constants, or business logic.
