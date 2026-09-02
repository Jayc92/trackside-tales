import React from 'react';
import { useApp } from '../app/AppContext';

// ================== SECONDARY PAGES ==================
// PUBLIC-v7.4B.P.28g.2 — OUR STORY restored from the v4.3 legacy app
// (trackside-tales/index.html: old #page-ourstory hero statement and
// the full #page-about brand narrative, pillars, and founder section),
// combined into one editorial brand-story page. Styles: story-page.css
// (`story-` prefix, scoped under `.story-page`).
//
// Route invariants preserved: PageId values unchanged; `#/about` now
// renders the same restored page via a minimal compatibility wrapper
// (no redirect machinery, old links keep working). WoodenMatchPage and
// TracksPage remain stubs — their restorations are later gates.
// Recovered legacy copy is preserved verbatim where quoted; personal
// contact details from the old About page are intentionally omitted.

export function OurStoryPage() {
  const { nav } = useApp();

  return (
    <div className="page active px-screen story-page" id="page-ourstory">

      {/* ── Hero — typographic, with one restrained atmospheric layer
             (existing neutral brand still-life; text stays dominant) ── */}
      <header className="story-hero-blk">
        <div className="story-hero-atmo" aria-hidden="true">
          <img
            src="assets/tales/tales-trackside-brewing.png"
            alt=""
            loading="eager"
            decoding="async"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="story-hero-inner">
        <span className="story-eyebrow">Trackside Brewing</span>
        <h1 className="story-hero-title">OUR STORY</h1>
        <hr className="story-rule story-rule--rail" aria-hidden="true" />
        {/* Recovered: old #page-ourstory hero subline */}
        <p className="story-hero-statement">
          The places around us are still speaking. These are some of
          those stories.
        </p>
        </div>
      </header>

      {/* ── Origin / brand narrative (recovered from old #page-about) ── */}
      <section className="story-section story-section--split" aria-label="Our origin">
        <div>
          <span className="story-label">The Brewery</span>
          <h2 className="story-headline">More than a <em>brewery</em>.</h2>
        </div>
        <div className="story-wrap">
          <div className="story-body-copy">
            <p>
              Trackside Brewing is rooted in the Lehigh Valley — its people,
              its industry, and the stories that built this corner of
              America. We believe the history of a place belongs to the
              people who live in it, and that great beer is an honest way
              to share it.
            </p>
            <p>
              We brew <strong>approachable craft beer</strong> for the
              everyday pour, <strong>a rotating Trackside Tales series</strong>{' '}
              tied to the real figures who shaped our region, and{' '}
              <strong>a full non-alcoholic lineup</strong> because everyone
              at the table deserves a beer that was made with care.
            </p>
          </div>
        </div>
      </section>

      {/* ── Core principles (recovered pillars) ── */}
      <section className="story-section story-section--split" aria-label="What we believe">
        <div>
          <span className="story-label">What We Believe</span>
          <h2 className="story-headline">How we <em>brew</em>.</h2>
        </div>
        <div className="story-wrap">
          <div className="story-principles">
            <div className="story-principle">
              <span className="story-principle-num" aria-hidden="true">01</span>
              <div>
                <h3 className="story-principle-title">Story First</h3>
                <p className="story-principle-desc">
                  Every Trackside Tales beer is tied to a real, researched
                  piece of Lehigh Valley history. No invented lore. Real
                  people, real places, real dates.
                </p>
              </div>
            </div>
            <div className="story-principle">
              <span className="story-principle-num" aria-hidden="true">02</span>
              <div>
                <h3 className="story-principle-title">Community Over Scale</h3>
                <p className="story-principle-desc">
                  We partner with local charities, donate a percentage of
                  select beer sales to Valley causes, and collaborate with
                  neighboring breweries rather than compete with them.
                </p>
              </div>
            </div>
            <div className="story-principle">
              <span className="story-principle-num" aria-hidden="true">03</span>
              <div>
                <h3 className="story-principle-title">Inclusive by Design</h3>
                <p className="story-principle-desc">
                  A full non-alcoholic program from day one — not an
                  afterthought. Our N/A beers are brewed with the same care
                  as the rest of the lineup.
                </p>
              </div>
            </div>
            <div className="story-principle">
              <span className="story-principle-num" aria-hidden="true">04</span>
              <div>
                <h3 className="story-principle-title">Honest History</h3>
                <p className="story-principle-desc">
                  We tell the Lenape story alongside the colonial one. We
                  don't simplify the history of this valley — we tell it
                  whole.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── The Tales idea (loop distilled from the legacy
             How-Trackside-Tales-Works page) ── */}
      <section className="story-section" aria-label="The Tales idea">
        <div className="story-wrap" style={{ textAlign: 'center' }}>
          <span className="story-label">The Tales Idea</span>
          <h2 className="story-headline">The beer is the ticket.</h2>
          <div className="story-route" role="list" aria-label="Beer to story to place to passport">
            <span className="story-route-stop" role="listitem">
              <span className="story-route-node" aria-hidden="true" />
              <span className="story-route-name">Beer</span>
            </span>
            <span className="story-route-stop" role="listitem">
              <span className="story-route-node" aria-hidden="true" />
              <span className="story-route-name">Story</span>
            </span>
            <span className="story-route-stop" role="listitem">
              <span className="story-route-node" aria-hidden="true" />
              <span className="story-route-name">Place</span>
            </span>
            <span className="story-route-stop story-route-stop--terminus" role="listitem">
              <span className="story-route-node" aria-hidden="true" />
              <span className="story-route-name">Passport</span>
            </span>
          </div>
          <p className="story-loop-copy">
            Scan a Trackside Tales beer and it opens a local history Tale
            tied to the beer, the place, or the people behind the Lehigh
            Valley. Every unlocked Tale earns a stamp in your Guest
            Passport — and the mini-game earns the second badge.
          </p>
        </div>
      </section>

      {/* ── Founder (recovered; contact details intentionally omitted) ── */}
      <section className="story-section story-section--split" aria-label="Founder">
        <div>
          <span className="story-label">Founder</span>
          <h2 className="story-headline">Behind the <em>concept</em>.</h2>
        </div>
        <div className="story-wrap">
          <div className="story-founder">
            <span className="story-founder-ticket" aria-hidden="true">
              <span className="story-founder-ticket-initials">JC</span>
              <span className="story-founder-ticket-label">FOUNDER</span>
            </span>
            <div>
              <h3 className="story-founder-name">Joe Carfagno</h3>
              <div className="story-founder-role">Founder · Trackside Brewing</div>
              <p className="story-founder-quote">
                "I grew up believing the Lehigh Valley was just a place you
                drove through. Then I started learning what actually
                happened here — the railroads, the steel, the founders —
                and realized every pint in this valley should carry one of
                those stories with it."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Next chapter — later destinations (existing routes only) ── */}
      <section className="story-section" aria-label="Keep reading">
        <div className="story-wrap">
          <span className="story-label">The Next Chapter</span>
          <div className="story-next">
            <button
              type="button"
              className="story-next-link"
              onClick={() => nav('tracks')}
            >
              <span className="story-next-glyph" aria-hidden="true" />
              <span className="story-next-title">THE TRACKS</span>
              <span className="story-next-desc">
                Two railroads, one valley, and the city they built.
              </span>
              <span className="story-next-arrow" aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              className="story-next-link"
              onClick={() => nav('woodenmatch')}
            >
              <span className="story-next-glyph" aria-hidden="true" />
              <span className="story-next-title">OUR HOME</span>
              <span className="story-next-desc">
                The station that stayed — our rail-side gathering place.
              </span>
              <span className="story-next-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <div className="story-foot-space" />
    </div>
  );
}

// P.28g.2 — `#/about` compatibility: the old About content now lives in
// the restored Our Story page, so this wrapper renders it directly.
// The PageId and route are unchanged; old links keep working.
export function AboutPage() {
  return <OurStoryPage />;
}

export function WoodenMatchPage() {
  return (
    <div className="page active" id="page-woodenmatch">
      <div className="woodenmatch-hero">
        <h2>THE WOODEN MATCH</h2>
        <p>An 1868 train station. Your table is waiting.</p>
      </div>
      {/* TODO Phase 5: extract full Wooden Match content from index-v4_6_1-golden.html */}
    </div>
  );
}

export function TracksPage() {
  return (
    <div className="page active" id="page-tracks">
      <div className="tracks-hero">
        <h2>THE TRACKS</h2>
        <p>The industrial corridor that shaped the Lehigh Valley.</p>
      </div>
      {/* TODO Phase 5: extract full Tracks content from index-v4_6_1-golden.html */}
    </div>
  );
}
