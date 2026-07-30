---
name: Kinetic Ether Light
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3c4a45'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6c7a75'
  outline-variant: '#bbcac3'
  surface-tint: '#006b57'
  primary: '#006b57'
  on-primary: '#ffffff'
  primary-container: '#00c2a0'
  on-primary-container: '#00493b'
  inverse-primary: '#41deba'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#505f76'
  on-tertiary: '#ffffff'
  tertiary-container: '#9dadc6'
  on-tertiary-container: '#314156'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#65fbd6'
  primary-fixed-dim: '#41deba'
  on-primary-fixed: '#002019'
  on-primary-fixed-variant: '#005141'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
---

## Brand & Style

This design system is a high-energy, precision-focused framework designed for modern technology and developer-centric interfaces. The brand personality is efficient, luminous, and forward-looking. By pivoting to a light-mode foundation, the "Kinetic" aspect is expressed through high-velocity accents against a sterile, high-clarity backdrop, while "Ether" is represented by subtle depth and expansive whitespace.

The aesthetic blends **Minimalism** with **Modern Corporate** sensibilities. It prioritizes extreme legibility and a sense of "digital air." The goal is to evoke a feeling of organized speed—where complex data feels lightweight and actionable.

## Colors

The palette is anchored by a vibrant teal primary accent, which serves as the "kinetic" pulse of the interface. This is set against a spectrum of clean whites and cool grays to maintain a clinical, professional atmosphere.

- **Primary (#00c2a0):** Used for critical actions, active states, and progress indicators.
- **Secondary (#0f172a):** A deep slate used for high-contrast headings and primary text to ensure maximum readability.
- **Tertiary (#64748b):** A muted slate for secondary information, icons, and borders.
- **Neutral (#f8fafc):** The base surface color, providing a crisp, bright environment that feels expansive.

Success, warning, and error states should utilize the primary teal's vibrancy, paired with standard functional red and amber tones, adjusted for high-contrast visibility on white backgrounds.

## Typography

The design system exclusively utilizes **Geist**, a typeface engineered for precision and developer-centric aesthetics. The typographic hierarchy relies on purposeful weight distribution rather than excessive size shifts.

Headlines use a bold weight with tighter letter-spacing to create a "locked-in" technical feel. Body text maintains a generous line height to ensure clarity against the bright white surfaces. Labels are occasionally used in uppercase with slight tracking to differentiate metadata from prose.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model with strict 4px increments (the "Base" unit). This ensures mathematical harmony across all components.

- **Desktop:** 12-column grid, 64px side margins, 24px gutters.
- **Tablet:** 8-column grid, 32px side margins, 16px gutters.
- **Mobile:** 4-column grid, 16px side margins, 16px gutters.

The system emphasizes "breathing room," using large `xl` spacing blocks to separate major sections, reinforcing the "Ether" narrative of openness.

## Elevation & Depth

Depth in this design system is achieved through **Tonal Layers** and **Low-contrast outlines**. Unlike traditional shadow-heavy designs, this system stays flat and fast.

1.  **Level 0 (Base):** `#f8fafc` (Neutral). The main canvas.
2.  **Level 1 (Surface):** `#ffffff`. Used for cards and primary containers. These are distinguished by a subtle 1px border in `#e2e8f0`.
3.  **Level 2 (Overlay):** Soft, ambient shadows are reserved exclusively for floating elements like dropdowns or modals. Shadows should use the secondary color at 5% opacity with a large (20px+) blur to feel atmospheric rather than structural.

Interactive elements use a "lift" effect where the border color transitions to the primary teal upon hover, rather than increasing shadow depth.

## Shapes

The shape language is "Soft-Tech." While the grid is rigid and precise, the components feature moderate rounding to feel approachable and modern.

- **Standard (0.5rem):** Used for buttons, input fields, and small cards.
- **Large (1rem):** Used for main content containers and feature sections.
- **Extra Large (1.5rem):** Used for modal containers and large promotional banners.

This roundedness balances the "coldness" of the Geist typeface, ensuring the UI feels like a premium consumer product even if the content is technical.

## Components

- **Buttons:** Primary buttons are solid Teal (`#00c2a0`) with white text. Secondary buttons use a transparent background with a 1px slate border. All buttons use the `label-md` type style.
- **Input Fields:** Use a white background with a light gray border. On focus, the border shifts to Teal with a soft 2px Teal outer glow (0.2 opacity).
- **Cards:** White surfaces with a subtle border. Titles should be `headline-md` in the Secondary slate color.
- **Chips/Badges:** Use a light tint of the primary color (Teal at 10% opacity) with Teal text for active states, and light gray for neutral states.
- **Lists:** Clean rows separated by thin `1px` lines in `#f1f5f9`. Interactive list items should have a subtle `#f8fafc` hover state.
- **Checkboxes/Radios:** Small, precise Teal accents. When unchecked, they utilize a thin slate border to maintain high contrast against white backgrounds.