# Liquid Glass UI Governance Rule

## Mandatory Standing Rule

> **Every new or modified UI element, page, component, or section MUST use the Liquid Glass design system primitives and tokens. Never write ad-hoc or non-glass styles. If a needed component does not exist, create it as a new glass primitive first, document it, then use it.**

## Enforcement Checklist
1. **Primitives First**: Import and use `GlassSurface`, `GlassCard`, `GlassButton`, `GlassInput`, `GlassSelect`, `GlassTextarea`, `GlassBadge`, `GlassModal`, `GlassTabs`, `GlassTable`, `GlassToggle`, `GlassDropdown`, and `GlassTooltip` from `web-app/src/components/glass`.
2. **Utility Classes**: For layout wrappers and inline elements, use `.liquid-glass-subtle`, `.liquid-glass-base`, `.liquid-glass-elevated`, `.liquid-glass-modal`, `.liquid-glass-card`, `.liquid-glass-input`, `.liquid-sheen`, and `.liquid-press` defined in `web-app/src/index.css`.
3. **Prohibited Patterns**:
   - Never use flat opaque `bg-white`, `bg-slate-50`, `bg-gray-100`, or `dark:bg-slate-900` on cards, modals, navbars, inputs, or tables.
   - Never introduce un-tokenized box-shadows or hard borders when a glass token (`--glass-shadow-*`, `--glass-border`) applies.
4. **Accessibility & Performance**:
   - Maintain WCAG AA contrast (`4.5:1`) in both light and dark modes.
   - Keep visible `:focus-visible` keyboard outlines on all interactive controls.
   - Respect `@media (prefers-reduced-motion: reduce)` and `@supports not (backdrop-filter: blur(1px))`.
   - Reference [`DESIGN_SYSTEM.md`](file:///g:/My%20Drive/New%20folder/DESIGN_SYSTEM.md) for full documentation.
