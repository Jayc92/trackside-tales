import React from 'react';
import { useApp } from '../app/AppContext';
import {
  IndustrialHero,
  SectionRail,
  PrimaryAction,
  SecondaryAction,
} from '../components/public/primitives';

// ================== HOME — "Stories From the Track" landing ==================
// PUBLIC-v7.4B.P.28e (checkpoint-1 revision) — each section now has a
// distinct compositional role instead of a stack of look-alike cards:
//
//   1. Atmospheric railroad hero (tier-1 artifact).
//   2. PARTNER VENUE — an engraved typographic PLAQUE. No photograph:
//      the available venue art is concept illustration, and a plaque
//      must not present invented imagery as the real building (§10).
//      The 1868 CNJ-station date is the venue's real founding fact.
//   3. THE TRACKSIDE CONCEPT — quiet editorial band directly on the
//      canvas (no card, no border).
//   4. SCAN → UNLOCK → COLLECT — a track-line progress system: three
//      station nodes joined by a rail, then the Passport action.
//
// Alburtis is not referenced (P.30 boundary). All navigation uses the
// existing nav() contract — no routing, unlock, or storage changes.

export function HomePage() {
  const { nav } = useApp();

  return (
    <div className="page active px-screen" id="page-menu">

      <IndustrialHero
        image="assets/tales/tales-scan-unlock.png"
        eyebrow="Trackside Tales"
        title={<>STORIES FROM<br />THE TRACK</>}
        sub="History, heritage, beer, and the people who built and traveled the Lehigh Valley."
        actions={
          <PrimaryAction onClick={() => nav('tales')} ariaLabel="Explore the Tales">
            EXPLORE THE TALES →
          </PrimaryAction>
        }
      />

      <div className="px-wrap">

        {/* ── Venue plaque ── */}
        <SectionRail label="Our Home Station" />
        <section className="px-plaque" aria-label="Partner venue">
          <span className="px-eyebrow">Partner Venue</span>
          <h2 className="px-plaque__title" role="heading" aria-level={2}>
            THE WOODEN MATCH
          </h2>
          <div className="px-plaque__band" aria-hidden="true" />
          <div className="px-plaque__meta">EST. 1868 · CNJ STATION · BETHLEHEM, PA</div>
          <p className="px-plaque__copy">
            Our rail-side home and gathering place, built inside a preserved
            piece of Lehigh Valley rail history — great beer, hearty fare,
            and stories that go back generations.
          </p>
          <div className="px-plaque__actions">
            <PrimaryAction onClick={() => nav('woodenmatch')} ariaLabel="Read the Wooden Match story">
              VISIT THE STATION →
            </PrimaryAction>
          </div>
        </section>

        {/* ── Concept editorial ── */}
        <SectionRail label="The Trackside Concept" />
        <section className="px-editorial" aria-label="The Trackside concept">
          <h2 className="px-editorial__title" role="heading" aria-level={2}>
            BEER. RAILROAD. COMMUNITY.
          </h2>
          <p className="px-editorial__copy">
            Trackside Brewing was built around local history, railroad
            heritage, and craft beer worth collecting. Every brew has a tale
            — the beer is the ticket, the history is the destination.
          </p>
          <div className="px-editorial__actions">
            <SecondaryAction onClick={() => nav('ourstory')} ariaLabel="Read our story">
              OUR STORY →
            </SecondaryAction>
          </div>
        </section>

        {/* ── Passport progress line ── */}
        <SectionRail label="Scan · Unlock · Collect" />
        <section aria-label="How Trackside Tales works">
          <div className="px-track">
            <div className="px-step">
              <span className="px-step__glyph" aria-hidden="true">⌗</span>
              <span className="px-step__name">SCAN</span>
              <span className="px-step__desc">Find Tales in the real world.</span>
            </div>
            <div className="px-step">
              <span className="px-step__glyph" aria-hidden="true">✦</span>
              <span className="px-step__name">UNLOCK</span>
              <span className="px-step__desc">Read, play, and earn stamps.</span>
            </div>
            <div className="px-step">
              <span className="px-step__glyph" aria-hidden="true">◈</span>
              <span className="px-step__name">COLLECT</span>
              <span className="px-step__desc">Complete Tales, earn badges.</span>
            </div>
          </div>
          <div className="px-editorial__actions" style={{ marginTop: '1.3rem' }}>
            <PrimaryAction onClick={() => nav('passport')} ariaLabel="View your passport">
              VIEW YOUR PASSPORT →
            </PrimaryAction>
          </div>
        </section>

        <div style={{ height: '1rem' }} />
      </div>
    </div>
  );
}
