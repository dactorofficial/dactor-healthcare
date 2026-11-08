# Dactor Liquid Glass Design System (`DESIGN_SYSTEM.md`)

## ⚠️ MANDATORY STANDING GOVERNANCE RULE

> **Every new or modified UI element, page, component, or section MUST use the Liquid Glass design system primitives and tokens. Never write ad-hoc or non-glass styles. If a needed component does not exist, create it as a new glass primitive first, document it, then use it.**

---

## 1. Overview & Philosophy

The **Dactor Liquid Glass Design System** establishes an Apple-inspired glassmorphism architecture featuring:
- **Optical Refraction & Depth**: Layered frosted surfaces (`backdrop-filter: blur() saturate()`) combined with a subtle SVG turbulence displacement filter (`#liquid-refraction`) on hero, navigation, and modal surfaces.
- **Specular Edge Highlights**: Top-edge inset specular reflections (`inset 0 1px 0`) paired with soft inner luminosity and multi-layered ambient shadows.
- **Living Aurora Background**: Slow-drifting ambient color orbs (`LiquidAuroraBackground`) providing rich chromatic depth behind translucent glass layers.
- **Adaptive Light & Dark Mode**: Automatic and manual (`dark` class / `prefers-color-scheme`) token switching with guaranteed WCAG AA text contrast and `@supports not (backdrop-filter)` solid semi-opaque fallbacks.

---

## 2. Design Tokens (Single Source of Truth)

All design tokens live in [`web-app/src/index.css`](file:///g:/My%20Drive/New%20folder/web-app/src/index.css) and are mapped into [`web-app/tailwind.config.js`](file:///g:/My%20Drive/New%20folder/web-app/tailwind.config.js).

### 2.1 Surface Fill Tokens
| Token | Light Mode Value | Dark Mode Value | Purpose |
| :--- | :--- | :--- | :--- |
| `--glass-fill-subtle` | `rgba(255, 255, 255, 0.45)` | `rgba(15, 23, 42, 0.48)` | Nested wells, secondary containers, subtle strips |
| `--glass-fill-base` | `rgba(255, 255, 255, 0.58)` | `rgba(15, 23, 42, 0.62)` | Standard cards, tables, form sections |
| `--glass-fill-elevated` | `rgba(255, 255, 255, 0.72)` | `rgba(30, 41, 59, 0.74)` | Sticky navbars, interactive cards, floating bars |
| `--glass-fill-modal` | `rgba(255, 255, 255, 0.84)` | `rgba(15, 23, 42, 0.86)` | Dialogs, drawers, popovers, notifications |
| `--glass-fill-input` | `rgba(255, 255, 255, 0.52)` | `rgba(15, 23, 42, 0.55)` | Inputs, selects, textareas |
| `--glass-fill-input-focus` | `rgba(255, 255, 255, 0.82)` | `rgba(30, 41, 59, 0.85)` | Focused form controls |

### 2.2 Blur & Saturation Tokens
| Token | Value | Usage |
| :--- | :--- | :--- |
| `--glass-blur-sm` | `16px` | Subtle inner panels, badges, inputs |
| `--glass-blur-md` | `22px` | Standard `GlassCard` and `liquid-glass-base` surfaces |
| `--glass-blur-lg` | `28px` | Elevated cards, sticky navbars (`liquid-glass-elevated`) |
| `--glass-blur-xl` | `32px` | Modals, drawers, overlays (`liquid-glass-modal`) |
| `--glass-saturate` | `165%` (Light) / `175%` (Dark) | Optical vibrancy multiplier |

### 2.3 Borders, Specular Highlights & Shadows
| Token | Light Mode Value | Dark Mode Value |
| :--- | :--- | :--- |
| `--glass-border` | `rgba(255, 255, 255, 0.65)` | `rgba(255, 255, 255, 0.14)` |
| `--glass-border-strong` | `rgba(255, 255, 255, 0.88)` | `rgba(255, 255, 255, 0.24)` |
| `--glass-specular` | `inset 0 1px 0 0 rgba(255, 255, 255, 0.85), inset 0 0 18px rgba(255, 255, 255, 0.28)` | `inset 0 1px 0 0 rgba(255, 255, 255, 0.22), inset 0 0 20px rgba(255, 255, 255, 0.04)` |
| `--glass-shadow-sm` | `0 4px 16px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.04)` | `0 4px 20px -2px rgba(0, 0, 0, 0.35), 0 2px 6px -1px rgba(0, 0, 0, 0.25)` |
| `--glass-shadow-md` | `0 8px 32px -4px rgba(15, 23, 42, 0.09), 0 2px 8px -2px rgba(15, 23, 42, 0.05)` | `0 10px 36px -4px rgba(0, 0, 0, 0.48), 0 4px 12px -2px rgba(0, 0, 0, 0.3)` |
| `--glass-shadow-lg` | `0 16px 48px -8px rgba(15, 23, 42, 0.14), 0 4px 14px -2px rgba(15, 23, 42, 0.07)` | `0 20px 52px -8px rgba(0, 0, 0, 0.62), 0 6px 18px -2px rgba(0, 0, 0, 0.4)` |

### 2.4 Radii & Motion Scale
- **Radii**:
  - `--glass-radius-sm`: `12px` (`rounded-xl` / `rounded-glass-sm`)
  - `--glass-radius-md`: `16px` (`rounded-2xl` / `rounded-glass-md`)
  - `--glass-radius-lg`: `24px` (`rounded-3xl` / `rounded-glass-lg`)
  - `--glass-radius-xl`: `32px` (`rounded-[2rem]` / `rounded-glass-xl`)
  - `--glass-radius-pill`: `9999px` (`rounded-full`)
- **Motion**:
  - `--glass-ease-spring`: `cubic-bezier(0.22, 1, 0.36, 1)`
  - `--glass-ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`
  - `--glass-duration-fast`: `180ms`
  - `--glass-duration-base`: `280ms`
  - `--glass-duration-slow`: `420ms`

---

## 3. Core CSS Utility Classes

Available globally in [`web-app/src/index.css`](file:///g:/My%20Drive/New%20folder/web-app/src/index.css):

| Class | Description |
| :--- | :--- |
| `.liquid-glass-subtle` | Low-elevation translucent well (`16px` blur) for nested containers and secondary panels |
| `.liquid-glass-base` | Standard glass surface (`22px` blur) with specular top edge and ambient shadow |
| `.liquid-glass-elevated` | High-elevation glass surface (`28px` blur) for navbars, sticky headers, and featured panels |
| `.liquid-glass-modal` | Deep-frosted overlay surface (`32px` blur) for modals, drawers, and popovers |
| `.liquid-glass-card` | Interactive or static glass card with specular border and optional `.liquid-glass-card-interactive` hover lift |
| `.liquid-glass-input` | Translucent form input/select/textarea with focus glow ring and specular inset |
| `.liquid-sheen` | Adds an animated diagonal specular light sweep on hover |
| `.liquid-press` | Applies smooth spring press-down scaling (`scale(0.97)`) on active click/tap |
| `.liquid-refract-backdrop` | Applies the `#liquid-refraction` SVG displacement filter to a surface's backdrop |

---

## 4. Reusable Glass Primitives (`web-app/src/components/glass/`)

Import primitives from the barrel file [`web-app/src/components/glass/index.ts`](file:///g:/My%20Drive/New%20folder/web-app/src/components/glass/index.ts):

```tsx
import {
  LiquidAuroraBackground,
  GlassSurface,
  GlassCard,
  GlassButton,
  GlassInput,
  GlassSelect,
  GlassTextarea,
  GlassBadge,
  GlassModal,
  GlassTabs,
  GlassTable,
  GlassToggle,
  GlassDropdown,
  GlassTooltip,
} from '../components/glass';
```

### 4.1 `LiquidAuroraBackground`
Renders the fixed ambient mesh/aurora orbs and mounts the global hidden `<svg>` containing `<filter id="liquid-refraction">` (`feTurbulence` + `feDisplacementMap`). Mounted once at the root in [`App.tsx`](file:///g:/My%20Drive/New%20folder/web-app/src/App.tsx).

### 4.2 `GlassSurface`
Low-level polymorphic container supporting `intensity="subtle" | "base" | "elevated" | "modal"`, `radius="sm" | "md" | "lg" | "xl" | "pill"`, `refract={boolean}`, and `interactive={boolean}`.

### 4.3 `GlassCard`
Primary card container used across all pages and portals.
```tsx
<GlassCard intensity="base" radius="lg" padding="md" interactive sheen>
  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Clinic Overview</h3>
  <p className="text-sm text-slate-600 dark:text-slate-300">Live queue status and metrics.</p>
</GlassCard>
```

### 4.4 `GlassButton`
Supports `variant="primary" | "secondary" | "ghost" | "destructive" | "emerald"` and `size="sm" | "md" | "lg" | "pill"`. Includes `.liquid-sheen` and `.liquid-press` (`active:scale-[0.97]`).
```tsx
<GlassButton variant="primary" size="md" leftIcon={<Check className="w-4 h-4" />}>
  Confirm Booking
</GlassButton>
```

### 4.5 `GlassInput`, `GlassSelect`, `GlassTextarea`
Form controls with optional `label`, `error`, `hint`, `leftIcon`, and `rightElement`.

### 4.6 `GlassBadge`
Status and metadata pills supporting `variant="default" | "brand" | "emerald" | "amber" | "rose" | "indigo" | "purple"` and optional animated status dot (`dot={true}`, `pulse={true}`).

### 4.7 `GlassModal`
Accessible modal dialog with deep backdrop blur, Escape key handling, scroll locking, and `#liquid-refraction` support.

### 4.8 `GlassTabs`, `GlassTable`, `GlassToggle`, `GlassDropdown`, `GlassTooltip`
Standardized primitives for segmented tab bars, translucent data tables, iOS-style glass switches, floating menus, and contextual tooltips.

---

## 5. Do / Don't Guidelines

### ✅ DO
- **DO** use `GlassCard`, `GlassSurface`, `GlassButton`, `GlassBadge`, and `.liquid-glass-*` classes for all UI elements.
- **DO** establish hierarchy via glass intensity (`subtle` inside `base`, `elevated` for sticky bars, `modal` for overlays).
- **DO** maintain high-contrast typography (`text-slate-900 dark:text-white` for headings, `text-slate-600 dark:text-slate-300` for body copy).
- **DO** test every layout in both Light and Dark mode across `320px` (mobile), `768px` (tablet), and `1280px+` (desktop).

### ❌ DON'T
- **DON'T** use flat opaque backgrounds (`bg-white`, `bg-slate-50`, `bg-gray-100`, `dark:bg-slate-900`) on cards, modals, navbars, or inputs.
- **DON'T** nest more than 2 layers of `backdrop-filter: blur()` directly on top of each other (use `.liquid-glass-subtle` or `bg-white/40 dark:bg-slate-800/40` for deeply nested micro-elements to preserve 60fps GPU scrolling).
- **DON'T** apply `#liquid-refraction` directly to text nodes—always apply it only to backdrop layers or container surfaces.
- **DON'T** introduce harsh neon borders or unapproved accent palettes outside the Dactor brand sky/indigo/emerald/amber/rose spectrum.

---

## 6. Accessibility & Performance Requirements (Non-Negotiable)

1. **WCAG AA Contrast**: All text on glass surfaces must maintain at least `4.5:1` contrast (normal text) and `3:1` (large text) against both light and dark aurora backdrops.
2. **Keyboard Focus Visibility**: Every interactive element (`button`, `a`, `input`, `select`, `textarea`) must show a visible focus ring (`:focus-visible` with `outline: 2px solid rgba(14, 165, 233, 0.75)`).
3. **Browser Fallback (`@supports not (backdrop-filter)`)**: Automatically falls back to high-opacity semi-solid surfaces (`rgba(255, 255, 255, 0.94)` light / `rgba(15, 23, 42, 0.95)` dark) on legacy/low-power browsers.
4. **Reduced Motion (`prefers-reduced-motion: reduce`)**: Disables ambient aurora orb drift and hover sheen sweeps automatically.

---

## 7. Lint & Code-Review Checklist

Before merging any UI change or pull request, verify every item below:

- [ ] **No raw opaque surfaces**: Search diff for `bg-white`, `bg-slate-50`, `bg-gray-50`, `dark:bg-slate-900`, `dark:bg-slate-950`—ensure none are used without translucency or `.liquid-glass-*` / `GlassCard` primitives.
- [ ] **No ad-hoc shadows or borders**: Ensure cards and modals use `--glass-shadow-*` / `shadow-glass-*` and translucent borders (`border-white/50 dark:border-slate-700/50`).
- [ ] **Interactive states**: All buttons include press feedback (`.liquid-press` or `active:scale-[0.97]`) and keyboard `:focus-visible` rings.
- [ ] **Dark mode parity**: Every text, border, and badge color has an explicit `dark:` counterpart tested against the dark aurora backdrop.
- [ ] **Responsive check**: Verified at `320px`, `768px`, and `1440px` viewports with zero horizontal overflow.
