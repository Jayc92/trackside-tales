// ================== PUBLIC-v7.4B.P.28e — composition primitives ==================
// The rebuilt public presentation system. Each primitive owns its structure,
// spacing, typography, responsive behavior, interaction states, and ornament
// budget (styles in src/styles/p28e.css — hierarchy tiers documented there).
//
// These are PRESENTATION components only: they accept real data and real
// handlers from the pages; no routing, unlock, QR, or storage logic lives
// here. All interactive primitives render native <button> elements.

import React from 'react';

/* ── Tier 1 — IndustrialHero ─────────────────────────────────────────────
   Atmospheric image + HTML type. The image is decorative (empty alt);
   the message is always real text. */
export function IndustrialHero({
  image,
  eyebrow,
  title,
  sub,
  actions,
  short = false,
}: {
  image?: string;
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  short?: boolean;
}) {
  return (
    <section className={`px-hero${short ? ' px-hero--short' : ''}`}>
      {image && (
        <img
          className="px-hero__img"
          src={image}
          alt=""
          loading="eager"
          decoding="async"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="px-hero__content">
        <span className="px-eyebrow">{eyebrow}</span>
        <h1 className="px-hero__title">{title}</h1>
        <div className="px-hero__divider" aria-hidden="true" />
        {sub && <p className="px-hero__sub">{sub}</p>}
        {actions && <div className="px-hero__actions">{actions}</div>}
      </div>
    </section>
  );
}

/* ── Tier 2 — IronPanel ──────────────────────────────────────────────────
   The one operational surface. `featured` adds the rivet treatment —
   budget: at most one featured panel per view. `media` renders a
   darkened image band (top on mobile, right column ≥640px via `split`). */
export function IronPanel({
  eyebrow,
  title,
  meta,
  copy,
  media,
  mediaAlt = '',
  actions,
  featured = false,
  split = false,
  children,
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  copy?: React.ReactNode;
  media?: string;
  mediaAlt?: string;
  actions?: React.ReactNode;
  featured?: boolean;
  split?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section
      className={`px-panel${featured ? ' px-panel--featured' : ''}${split ? ' px-panel--split' : ''}`}
    >
      {media && (
        <div className="px-panel__media">
          <img src={media} alt={mediaAlt} loading="lazy" decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      )}
      <div className="px-panel__body">
        {eyebrow && <span className="px-eyebrow">{eyebrow}</span>}
        {title && (
          <h2 className="px-panel__title" role="heading" aria-level={2}>
            {title}
          </h2>
        )}
        {meta && <div className="px-panel__meta">{meta}</div>}
        {copy && <p className="px-panel__copy">{copy}</p>}
        {children}
        {actions && <div className="px-panel__actions">{actions}</div>}
      </div>
    </section>
  );
}

/* ── SectionRail — rule · label · rule ─────────────────────────────────── */
export function SectionRail({ label }: { label: string }) {
  return (
    <div className="px-rail-head" role="heading" aria-level={2}>
      <span>{label}</span>
    </div>
  );
}

/* ── Actions ────────────────────────────────────────────────────────────── */
export function PrimaryAction({
  children,
  onClick,
  disabled = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className="px-act"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export function SecondaryAction({
  children,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button type="button" className="px-act px-act--secondary" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/* ── StatusPlate — stamped state chips ──────────────────────────────────
   Tone drives the treatment; the text always carries the state (never
   color alone). */
export type PlateTone = 'live' | 'unlocked' | 'sealed' | 'neutral' | 'danger';

export function StatusPlate({ tone = 'neutral', children }: { tone?: PlateTone; children: React.ReactNode }) {
  const toneClass =
    tone === 'live' ? ' px-plate--live'
    : tone === 'unlocked' ? ' px-plate--unlocked'
    : tone === 'sealed' ? ' px-plate--sealed'
    : tone === 'danger' ? ' px-plate--danger'
    : '';
  return <span className={`px-plate${toneClass}`}>{children}</span>;
}
