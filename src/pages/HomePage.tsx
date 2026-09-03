import React from 'react';
import { useApp } from '../app/AppContext';

// ================== HOME — the front door ==================
// PUBLIC-v7.4B.P.28g.10 — curated entry into the finished public app.
// Home synthesizes the established surfaces (Our Story = brand, Tracks
// = history, Alburtis Tavern = place, Tales = archive, Scan = gate,
// Passport = collection, Menu = pour board) into four sections:
//
//   1. Lead — concept identity (BEER. HISTORY. PLACE.) with the two
//      strongest actions: THE TAP LIST and THE TALES.
//   2. Our Home — a preview of place: ALBURTIS TAVERN, Alburtis PA.
//      Project-established facts only — no EST dates, no provenance
//      (the old Wooden Match plaque and its 1868/CNJ/Bethlehem chrome
//      are gone; Wooden Match remains only inside Tale DATA).
//   3. Trackside Tales — the product loop (find → scan → read → play
//      → collect) and the two-stamp Passport callout.
//   4. The Deeper Cuts — quiet editorial index into Our Story and
//      The Tracks.
//
// All navigation uses the existing nav() contract — no routing,
// unlock, data, or storage changes. No live-state preview is rendered
// here: current pours need the remote beers surface, so Home links to
// the Tap List instead of fabricating a board.

export function HomePage() {
  const { nav } = useApp();

  return (
    <div className="page active px-screen home-page" id="page-menu">

      {/* ── 1. Lead — the concept in one screen ── */}
      <header className="home-lead">
        <div className="home-lead-atmo" aria-hidden="true">
          <img
            src="assets/tales/tales-scan-unlock.png"
            alt=""
            loading="eager"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="home-lead-inner">
          <span className="home-eyebrow">Trackside Brewing · Alburtis Tavern</span>
          <h1 className="home-title">BEER.<br />HISTORY.<br />PLACE.</h1>
          <hr className="home-rule" aria-hidden="true" />
          <p className="home-statement">
            Local beer with Lehigh Valley rail stories inside — poured at
            Alburtis Tavern, unlocked by a scan, kept in your Passport.
          </p>
          <div className="home-actions">
            <button
              type="button"
              className="home-action home-action--primary"
              onClick={() => nav('menu')}
              aria-label="View the tap list"
            >
              VIEW THE TAP LIST
            </button>
            <button
              type="button"
              className="home-action"
              onClick={() => nav('tales')}
              aria-label="Explore the Tales"
            >
              EXPLORE THE TALES
            </button>
          </div>
        </div>
      </header>

      <div className="home-wrap">

        {/* ── 2. Our Home — preview of place ── */}
        <section className="home-section" aria-label="Alburtis Tavern">
          <div className="home-section-head">
            <span className="home-label">Our Home</span>
          </div>
          <div className="home-place">
            <div className="home-place-sign" aria-hidden="true">
              <span className="home-place-sign-title">ALBURTIS<br />TAVERN</span>
              <span className="home-place-sign-sub">ALBURTIS, PA</span>
            </div>
            <div className="home-place-body">
              <h2 className="home-headline">
                A tavern, a table, and <em>the stories of the Valley.</em>
              </h2>
              <p className="home-copy">
                Alburtis Tavern is where Trackside Brewing lives — order a
                Tale at the bar, and the story of the Lehigh Valley comes
                to the table with it.
              </p>
              <button
                type="button"
                className="home-link"
                onClick={() => nav('woodenmatch')}
              >
                VISIT OUR HOME <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </section>

        {/* ── 3. Trackside Tales — the product loop ── */}
        <section className="home-section" aria-label="How Trackside Tales works">
          <div className="home-section-head">
            <span className="home-label">Trackside Tales</span>
          </div>
          <h2 className="home-headline">The beer is <em>the ticket.</em></h2>
          <p className="home-copy">
            Every Trackside Tale can carries a real Lehigh Valley story.
            Scan the can and the story opens; finish its challenge and the
            second stamp is yours.
          </p>
          {/* the loop — presentation only, matching the real product flow */}
          <ol className="home-loop" aria-label="The Trackside loop">
            <li className="home-loop-stop">FIND A TALE</li>
            <li className="home-loop-stop">SCAN</li>
            <li className="home-loop-stop">READ</li>
            <li className="home-loop-stop">PLAY</li>
            <li className="home-loop-stop home-loop-stop--terminus">COLLECT</li>
          </ol>
          <p className="home-copy home-copy--quiet">
            Two stamps per Tale — one for the scan, one for the challenge —
            collected in your Trackside Passport.
          </p>
          <div className="home-subactions">
            <button
              type="button"
              className="home-link"
              onClick={() => nav('scan')}
            >
              SCAN A CAN <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="home-link"
              onClick={() => nav('passport')}
            >
              VIEW PASSPORT <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        {/* ── 4. The deeper cuts — brand + history depth ── */}
        <section className="home-section" aria-label="Brand and history">
          <div className="home-section-head">
            <span className="home-label">The Deeper Cuts</span>
          </div>
          <div className="home-next">
            <button type="button" className="home-next-link" onClick={() => nav('ourstory')}>
              <span className="home-next-glyph" aria-hidden="true" />
              <span className="home-next-title">OUR STORY</span>
              <span className="home-next-desc">Why the beer is the ticket.</span>
              <span className="home-next-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="home-next-link" onClick={() => nav('tracks')}>
              <span className="home-next-glyph" aria-hidden="true" />
              <span className="home-next-title">THE TRACKS</span>
              <span className="home-next-desc">The rail history behind the Tales.</span>
              <span className="home-next-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="home-foot-space" />
      </div>
    </div>
  );
}
