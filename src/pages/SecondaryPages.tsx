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

// PUBLIC-v7.4B.P.28g.4 — ALBURTIS TAVERN venue page.
//
// ROUTE COMPATIBILITY: the PageId, hash route (#/woodenmatch), element
// id, and component name are retained TEMPORARILY from the legacy
// Wooden Match era so existing links and nav contracts keep working —
// the visible page identity is ALBURTIS TAVERN. Renaming the route is
// a later gate.
//
// FACTUAL BOUNDARY: only project-established facts appear — the venue
// name, Alburtis PA, and the Trackside-concept role (community
// gathering place connecting beer, food, local history, railroad
// heritage, and the Tales). NO establishment year, construction date,
// railroad provenance, former operators, or historical claims are
// stated: no verified Alburtis historical source exists in this
// repository. Structure (hero → place narrative → identity →
// gathering philosophy → close line) is borrowed from the legacy
// Wooden Match page's architecture; none of its facts are.
// Styles: venue-page.css (`venue-` prefix, scoped `.venue-page`).
export function WoodenMatchPage() {
  const { nav } = useApp();

  return (
    <div className="page active px-screen venue-page" id="page-woodenmatch">

      {/* ── Hero — tavern signboard (typographic; no repo asset exists
             for Alburtis, and nothing is fabricated) ── */}
      <header className="venue-hero-blk">
        <div className="venue-sign">
          <span className="venue-sign-eyebrow">Alburtis, Pennsylvania</span>
          <h1 className="venue-sign-title">ALBURTIS<br />TAVERN</h1>
          <hr className="venue-sign-rule" aria-hidden="true" />
          <div className="venue-sign-brand">Home of Trackside Brewing</div>
          <p className="venue-sign-statement">
            A tavern, a table, and the stories of the Lehigh Valley.
          </p>
        </div>
      </header>

      {/* ── Our Home ── */}
      <section className="venue-section venue-section--split" aria-label="Our home">
        <div>
          <div className="venue-lintel" aria-hidden="true" />
          <span className="venue-label">Our Home</span>
          <h2 className="venue-headline">The room where the <em>concept</em> lives.</h2>
        </div>
        <div className="venue-wrap">
          <div className="venue-copy">
            <p>
              Trackside Brewing is built around a real place. Alburtis
              Tavern is where the concept comes off the page — a gathering
              place in Alburtis, Pennsylvania where the beer is brewed
              with a story, the food belongs on the same table, and the
              history of the Lehigh Valley is part of the room.
            </p>
            <p>
              The tavern is the anchor. Everything else — the Tales, the
              Passport, the roster of beers named for real people and
              places — exists to make an evening here mean a little more.
            </p>
          </div>
        </div>
      </section>

      {/* ── Where the stories meet the table ── */}
      <section className="venue-section venue-section--split" aria-label="Where the stories meet the table">
        <div>
          <div className="venue-lintel" aria-hidden="true" />
          <span className="venue-label">The Experience</span>
          <h2 className="venue-headline">Where the stories meet the <em>table</em>.</h2>
        </div>
        <div className="venue-wrap">
          <div className="venue-copy">
            <p>
              Order a Trackside Tales beer and the can carries more than a
              label. Scan it, and the story behind the pour opens — a real
              figure, a real place, a piece of the Valley you can read
              before the glass is empty. Every unlocked Tale stamps your
              Guest Passport.
            </p>
          </div>
          <div className="venue-table-row" aria-label="Order, scan, read, collect">
            <span>Order</span><span aria-hidden="true">·</span>
            <span>Scan</span><span aria-hidden="true">·</span>
            <span>Read</span><span aria-hidden="true">·</span>
            <span>Collect</span>
          </div>
        </div>
      </section>

      {/* ── A community gathering place ── */}
      <section className="venue-section venue-section--split" aria-label="A community gathering place">
        <div>
          <div className="venue-lintel" aria-hidden="true" />
          <span className="venue-label">The Gathering</span>
          <h2 className="venue-headline">Dinner, a local pour, and <em>company</em>.</h2>
        </div>
        <div className="venue-wrap">
          <div className="venue-copy">
            <p>
              A tavern earns its place by being useful to its neighbors:
              dinner worth leaving the house for, beer brewed close to
              home, and a room that holds families, regulars, and people
              just passing through. That's the standard Alburtis Tavern
              is meant to keep.
            </p>
          </div>
          <p className="venue-pull">
            The best local history is told across a table.
          </p>
        </div>
      </section>

      {/* ── Preserve the place / tell the story ── */}
      <section className="venue-section venue-section--split" aria-label="Preserve the place, tell the story">
        <div>
          <div className="venue-lintel" aria-hidden="true" />
          <span className="venue-label">The Philosophy</span>
          <h2 className="venue-headline">Add to the place. Don't <em>replace</em> it.</h2>
        </div>
        <div className="venue-wrap">
          <div className="venue-copy">
            <p>
              Trackside isn't here to rename the tavern or paper over what
              makes it itself. The venue keeps its own name and its own
              identity — Trackside Brewing lives alongside Alburtis
              Tavern, adding the beer, the Tales, and the Passport to a
              place that already knows how to gather people.
            </p>
          </div>
          <div className="venue-creed">
            <p>
              Preserve the place. Tell the story. Pour something worth
              staying for.
            </p>
          </div>
        </div>
      </section>

      {/* ── Next chapter ── */}
      <section className="venue-section" aria-label="Keep exploring">
        <div className="venue-wrap">
          <div className="venue-lintel" aria-hidden="true" />
          <span className="venue-label">The Next Chapter</span>
          <div className="venue-next">
            <button type="button" className="venue-next-link" onClick={() => nav('tales')}>
              <span className="venue-next-glyph" aria-hidden="true" />
              <span className="venue-next-title">THE TALES</span>
              <span className="venue-next-desc">The stories behind every pour.</span>
              <span className="venue-next-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="venue-next-link" onClick={() => nav('tracks')}>
              <span className="venue-next-glyph" aria-hidden="true" />
              <span className="venue-next-title">THE TRACKS</span>
              <span className="venue-next-desc">Two railroads, one valley, and the city they built.</span>
              <span className="venue-next-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="venue-next-link" onClick={() => nav('ourstory')}>
              <span className="venue-next-glyph" aria-hidden="true" />
              <span className="venue-next-title">OUR STORY</span>
              <span className="venue-next-desc">Why we pair beer with history.</span>
              <span className="venue-next-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Closing ── */}
      <footer className="venue-close">
        <p className="venue-close-line">
          Pull up a chair. <em>The Valley has stories left.</em>
        </p>
      </footer>

      <div className="venue-foot-space" />
    </div>
  );
}

// PUBLIC-v7.4B.P.28g.3 — THE TRACKS restored from the v4.3 legacy app
// (old #page-tracks, lines 4584–4644 of trackside-tales/index.html).
// Composed as a rail CORRIDOR: a continuous spine with station nodes at
// each chapter, a two-railroad river diagram, and figure rows that
// connect the recovered history to the real Tale roster. Styles:
// tracks-page.css (`tracks-` prefix, scoped under `.tracks-page`).
//
// Factual boundary: all history is recovered from the legacy source;
// only the venue-anchored FRAMING was adjusted ("the station you're
// sitting in" → "the Central Railroad's Bethlehem station", etc.) so
// the supported Lehigh Valley facts stand without presuming the reader
// is inside The Wooden Match. The only dates shown (1868, Aug 18 1967)
// are the source's own. No Alburtis content.
export function TracksPage() {
  const { nav, navToTale, tales } = useApp();

  // Figure rows deep-link to their real Tales via the existing
  // navToTale contract; if a tale id is unavailable (remote content
  // failure), fall back to the Tales hub. No data is mutated.
  const openTale = (taleId: string) => {
    const tale = tales.find((t) => t.id === taleId);
    if (tale) navToTale(tale);
    else nav('tales');
  };

  return (
    <div className="page active px-screen tracks-page" id="page-tracks">

      {/* ── Hero ── */}
      <header className="tracks-hero-blk">
        <span className="tracks-eyebrow">Bethlehem, PA · Rail History</span>
        <h1 className="tracks-hero-title">THE TRACKS</h1>
        {/* Recovered hero title line */}
        <p className="tracks-hero-sub">The tracks run through here.</p>
        {/* Recovered supporting line (venue-anchored second sentence omitted) */}
        <p className="tracks-hero-line">Every Trackside Tale is rooted in a real place.</p>
      </header>

      <div className="tracks-corridor">

        {/* ── A city made by trains ── */}
        <section className="tracks-chapter" aria-label="The age of rail in Bethlehem">
          <span className="tracks-label">The Age of Rail in Bethlehem</span>
          <h2 className="tracks-headline">A city made by trains.</h2>
          <div className="tracks-copy">
            <p>
              In the second half of the 19th century, Bethlehem ran on
              rail. Coal from the anthracite fields moved south. Iron —
              and later, steel — moved out. People, goods, and ideas moved
              in. The tracks didn't just pass through the city. They
              built it.
            </p>
            <p>
              The Central Railroad of New Jersey's Bethlehem station was
              part of that story. Constructed in 1868, it served the city
              during the height of American rail travel — and through the
              decades of industrial growth that followed.
            </p>
          </div>
          <p className="tracks-pull">
            For nearly a century, this was how the world reached Bethlehem.
          </p>
        </section>

        {/* ── Two railroads, one valley ── */}
        <section className="tracks-chapter" aria-label="Two railroads, one valley">
          <span className="tracks-label">Two Railroads, One Valley</span>
          <h2 className="tracks-headline">A rivalry across the river.</h2>
          <div className="tracks-copy">
            <p>Bethlehem didn't have one railroad. It had two.</p>
            <p>
              The Central Railroad of New Jersey, which ran through that
              1868 Bethlehem station, was one side of the story. On the
              opposite bank of the Lehigh River ran its fierce competitor
              — the Lehigh Valley Railroad, which stretched from Mauch
              Chunk down to Easton and carried much of the coal that
              fueled the industrial Northeast.
            </p>
          </div>

          <div className="tracks-river-diagram" role="img"
            aria-label="Two railroads separated by the Lehigh River: the Central Railroad of New Jersey on the north side, the Lehigh Valley Railroad on the south side">
            <div className="tracks-riverside">
              <span className="tracks-riverside-rail" aria-hidden="true" />
              <span>
                <span className="tracks-riverside-name">Central Railroad of New Jersey</span>
                <span className="tracks-riverside-note">North side · station built 1868</span>
              </span>
            </div>
            <div className="tracks-river-band">The Lehigh River</div>
            <div className="tracks-riverside">
              <span className="tracks-riverside-rail" aria-hidden="true" />
              <span>
                <span className="tracks-riverside-name">Lehigh Valley Railroad</span>
                <span className="tracks-riverside-note">South side · founded by Asa Packer</span>
              </span>
            </div>
          </div>

          <ul className="tracks-river-facts">
            <li>Two companies. Two sets of tracks. One valley.</li>
            <li>
              For decades, they competed for freight, passengers, and the
              identity of the region.
            </li>
          </ul>
        </section>

        {/* ── People on the platform ── */}
        <section className="tracks-chapter" aria-label="People on the platform">
          <span className="tracks-label">A Station That Saw History</span>
          <h2 className="tracks-headline">Presidents, workers, and everyone between.</h2>
          <div className="tracks-copy">
            <p>
              During the whistle-stop era, presidential candidates crossed
              the country by rail and spoke to voters from the back
              platforms of their train cars. Theodore Roosevelt and Harry
              S. Truman both addressed Bethlehem from the Central
              Railroad's station.
            </p>
            <p>
              But the station wasn't built for presidents. It was built
              for the thousands of ordinary passengers who used it every
              day — steelworkers, merchants, students, soldiers coming
              home, families heading out. A working stop on a working
              line.
            </p>
            <p>
              Passenger service ended at the station on August 18, 1967.
              The rails went quiet. But the building stayed.
            </p>
          </div>
          <span className="tracks-marker">
            <b>AUG 18, 1967</b> the last passenger train
          </span>
        </section>

        {/* ── The people behind the beers ── */}
        <section className="tracks-chapter tracks-chapter--terminus" aria-label="The people behind the beers">
          <span className="tracks-label">The People Behind the Beers</span>
          <h2 className="tracks-headline">Every pour has a name.</h2>
          <div className="tracks-copy">
            <p>
              These aren't invented characters. They're the people who
              built the Valley — and the Trackside Tales series is how we
              keep telling their stories.
            </p>
          </div>

          <div className="tracks-figures">
            <button type="button" className="tracks-figure" onClick={() => openTale('packer-pils')}>
              <span className="tracks-figure-head">
                <span className="tracks-figure-name">Asa Packer</span>
                <span className="tracks-figure-beer">PACKER PILSNER</span>
              </span>
              <p className="tracks-figure-rel">
                Named for the man whose Lehigh Valley Railroad ran along
                the south bank of the river.
              </p>
              <span className="tracks-figure-cta">Read the Tale →</span>
            </button>
            <button type="button" className="tracks-figure" onClick={() => openTale('wa-lager')}>
              <span className="tracks-figure-head">
                <span className="tracks-figure-name">William Allen</span>
                <span className="tracks-figure-beer">W.A. LAGER</span>
              </span>
              <p className="tracks-figure-rel">
                Honors the founder of Allentown, a few miles west.
              </p>
              <span className="tracks-figure-cta">Read the Tale →</span>
            </button>
            <button type="button" className="tracks-figure" onClick={() => openTale('wooden-match')}>
              <span className="tracks-figure-head">
                <span className="tracks-figure-name">The 1868 Station</span>
                <span className="tracks-figure-beer">WOODEN MATCH AMBER ALE</span>
              </span>
              <p className="tracks-figure-rel">
                Named for the building that pours it — an 1868 Bethlehem
                train station that became our rail-side home.
              </p>
              <span className="tracks-figure-cta">Read the Tale →</span>
            </button>
          </div>
        </section>

      </div>

      {/* ── Closing (recovered close line) ── */}
      <footer className="tracks-close">
        <p className="tracks-close-line">
          The trains moved through here for a hundred years.{' '}
          <em>The stories stayed.</em>
        </p>
        <div className="tracks-close-ctas">
          <button type="button" className="tracks-close-cta" onClick={() => nav('tales')}>
            View the Tales
          </button>
          <button type="button" className="tracks-close-cta" onClick={() => nav('ourstory')}>
            Our Story
          </button>
        </div>
      </footer>

      <div className="tracks-foot-space" />
    </div>
  );
}
