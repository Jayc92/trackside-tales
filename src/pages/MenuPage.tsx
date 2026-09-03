import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tale, Beer, FoodItem } from '../app/types';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';

// ================== MENU — the current pour board ==================
// PUBLIC-v7.4B.P.28g.9 — presentation/structural rebuild of the Menu as
// the venue surface of the family (Tales = archive, Scan = gate,
// Passport = document, Menu = the pour board at Alburtis Tavern).
//
// All menu logic is preserved verbatim:
//   • Tab set and switching (TALES / RESIDENT / N/A / FOOD).
//   • Real data sources only (tales / regulars / nonAlc / food).
//   • ON TAP only from the live tap list (P.18) via the same slug
//     translation the Tale pages use (P.19) — never fabricated.
//   • navToTale / nav('scan') routing contracts unchanged.
//   • TapBoard renders ONLY while genuinely live pours exist; with no
//     live data it renders nothing (absence is the only always-truthful
//     claim). Still exported for isolated visual review.
//   • Food price formatting (P.9), image gating, and CHEF'S PICK
//     derivation (isFeatured ?? visual-meta fallback) unchanged.
//
// VENUE IDENTITY (P.28g.9 §5/§16): page chrome now reads Alburtis
// Tavern / Trackside Brewing. Stale Wooden Match VENUE wording was
// neutralized (board head, kitchen label/note, food subline). Wooden
// Match strings inside Tale/beer DATA are content, not chrome, and are
// untouched.

type TabId = 'tales' | 'resident' | 'na' | 'food';

interface TabSpec { id: TabId; label: string; }
const TABS: TabSpec[] = [
  { id: 'tales',    label: 'TALES' },
  { id: 'resident', label: 'RESIDENT' },
  { id: 'na',       label: 'N/A' },
  { id: 'food',     label: 'FOOD' },
];

// ---- State chips (menu-local, same truthful semantics) ----------------------
function MenuChip({
  tone,
  children,
}: {
  tone: 'live' | 'unlocked' | 'sealed' | 'na';
  children: React.ReactNode;
}) {
  return (
    <span className={`menu-chip menu-chip--${tone}`}>
      {tone === 'live' && <span className="menu-chip-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

// ---- Tab rail ----------------------------------------------------------------
function MenuTabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="menu-tabs" role="tablist" aria-label="Menu category">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`menu-tab${isActive ? ' menu-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Tale pour row -------------------------------------------------------------
// The menu's own object language (deliberately NOT the archive ticket):
// a tap-board ledger row — can column · beer identity column · status/
// action rail. Hierarchy: name → style → tagline → meta → state → action.
function TalePourRow({
  tale,
  unlocked,
  onTap,
  onOpen,
  onScan,
}: {
  tale: Tale;
  unlocked: boolean;
  onTap: boolean;
  onOpen: () => void;
  onScan: () => void;
}) {
  const meta = [
    tale.year ? `TALE ${tale.year}` : 'TALE',
    tale.abv ? `ABV ${tale.abv}` : null,
    tale.ibu ? `IBU ${tale.ibu}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <article
      className={
        'menu-pour'
        + (unlocked ? ' menu-pour--unlocked' : '')
        + (onTap ? ' menu-pour--live' : '')
      }
      aria-label={tale.style ? `${tale.name} — ${tale.style}` : tale.name}
    >
      <div className="menu-pour-art" aria-hidden="true">
        {tale.image ? (
          <img
            src={tale.image}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="menu-pour-art-fallback">{tale.abbr || tale.name}</span>
        )}
      </div>
      <div className="menu-pour-body">
        <div className="menu-pour-chips">
          {onTap && <MenuChip tone="live">ON TAP</MenuChip>}
          <MenuChip tone={unlocked ? 'unlocked' : 'sealed'}>
            {unlocked ? 'STORY UNLOCKED' : 'STORY SEALED'}
          </MenuChip>
        </div>
        <h3 className="menu-pour-name">{tale.name}</h3>
        {tale.style && <div className="menu-pour-style">{tale.style}</div>}
        {tale.tagline && <p className="menu-pour-desc">{tale.tagline}</p>}
        <div className="menu-pour-meta">{meta}</div>
        <div className="menu-pour-actions">
          {unlocked ? (
            <>
              <button
                type="button"
                className="menu-action menu-action--primary"
                onClick={onOpen}
                aria-label={`Read the ${tale.name} tale`}
              >
                READ THE TALE <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={onOpen}
                aria-label={`Open the ${tale.name} challenge`}
              >
                CHALLENGE
              </button>
            </>
          ) : (
            <button
              type="button"
              className="menu-action menu-action--primary"
              onClick={onScan}
              aria-label={`Scan to unlock ${tale.name}`}
            >
              SCAN TO UNLOCK
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- Resident / N-A house rows -------------------------------------------------
function HouseRow({
  beer,
  isNA = false,
  onTap = false,
}: {
  beer: Beer;
  isNA?: boolean;
  /** PUBLIC-v7.4B.P.18 — true only when a LIVE tap_list pour exists. */
  onTap?: boolean;
}) {
  const stats = [
    beer.abv ? `ABV ${beer.abv}` : null,
    beer.ibu ? `IBU ${beer.ibu}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div
      className="menu-house"
      role="listitem"
      aria-label={beer.style ? `${beer.name} — ${beer.style}` : beer.name}
    >
      <div className="menu-house-thumb" aria-hidden="true">
        {beer.image ? (
          <img
            src={beer.image}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span>{beer.abbr || '—'}</span>
        )}
      </div>
      <div className="menu-house-body">
        <div className="menu-house-line">
          <h3 className="menu-house-name">{beer.name}</h3>
          {onTap && <MenuChip tone="live">ON TAP</MenuChip>}
          {isNA && <MenuChip tone="na">N/A</MenuChip>}
        </div>
        {(beer.style || beer.tasting) && (
          <div className="menu-house-style">
            {beer.style}
            {beer.style && beer.tasting ? ' — ' : ''}
            {beer.tasting}
          </div>
        )}
      </div>
      {stats && <span className="menu-house-stats">{stats}</span>}
    </div>
  );
}

// ---- Food board (kitchen presentation) ------------------------------------------
// Visual metadata only — dish names/descriptions come from real data.
const FOOD_VISUAL_META: Record<string, { sub: string; chefsPick?: boolean }> = {
  'Other Side Of The Pillow': { sub: 'Pierogies' },
  'CNJ Railyard':              { sub: 'Organic Greens Salad' },
  'Broad Street Bully':        { sub: 'Steak Sandwich' },
  'Burger Flight':             { sub: 'Slider Trio', chefsPick: true },
};

/**
 * Format integer cents to a display price (PUBLIC-v7.4B.P.9).
 * 1250 → "$12.50". Returns null when there is no price to show.
 */
function formatFoodPrice(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  if (!Number.isFinite(cents) || cents < 0) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function FoodDishRow({ item }: { item: FoodItem }) {
  const meta = FOOD_VISUAL_META[item.name] || { sub: '' };
  const isChefsPick = item.isFeatured ?? meta.chefsPick ?? false;
  const price = formatFoodPrice(item.priceCents);
  const hasImage = typeof item.imageUrl === 'string' && item.imageUrl.length > 0;
  return (
    <article className="menu-dish" aria-label={item.name}>
      {hasImage && (
        <div className="menu-dish-photo" aria-hidden="true">
          <img
            src={item.imageUrl}
            alt=""
            loading="lazy"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="menu-dish-body">
        <div className="menu-dish-row">
          <h3 className="menu-dish-name">{item.name}</h3>
          <span className="menu-dish-leader" aria-hidden="true" />
          {price && <span className="menu-dish-price">{price}</span>}
        </div>
        <div className="menu-dish-subrow">
          {meta.sub && <span className="menu-dish-sub">{meta.sub}</span>}
          {isChefsPick && <MenuChip tone="live">CHEF'S PICK</MenuChip>}
        </div>
        <p className="menu-dish-desc">{item.desc}</p>
      </div>
    </article>
  );
}

// ---- Live tap board (P.28e checkpoint 2 — logic unchanged) -----------------------
// Driven exclusively by the live tap list (P.18): a beer appears here
// only while a genuinely live pour exists for its slug. With no live
// data the board renders NOTHING. Exported so the live-state
// presentation can be exercised in isolation during visual review.
export function TapBoard({
  beers,
  liveTapSlugs,
}: {
  beers: Beer[];
  liveTapSlugs: Set<string>;
}) {
  const pouring = beers.filter((b) => b.slug !== undefined && liveTapSlugs.has(b.slug));
  if (pouring.length === 0) return null;
  return (
    <section className="menu-tapboard" aria-label="Now pouring">
      <div className="menu-tapboard-head">
        <span className="menu-chip-dot" aria-hidden="true" />
        NOW POURING · ALBURTIS TAVERN
      </div>
      <div role="list">
        {pouring.map((beer) => (
          <div key={beer.slug} className="menu-tapboard-row" role="listitem">
            <span className="menu-tapboard-name">{beer.name}</span>
            <span className="menu-tapboard-leader" aria-hidden="true" />
            <span className="menu-tapboard-meta">
              {[beer.style, beer.abv ? `ABV ${beer.abv}` : null].filter(Boolean).join(' · ')}
            </span>
            <MenuChip tone="live">LIVE</MenuChip>
          </div>
        ))}
      </div>
    </section>
  );
}

// ================== MENU PAGE ROOT ==================
export function MenuPage() {
  const { state, navToTale, nav, tales, regulars, nonAlc, food, liveTapSlugs } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('tales');
  const isFood = activeTab === 'food';

  return (
    <div className="page active px-screen menu-page" id="page-beers">

      {/* ── Head — the venue board ── */}
      <header className="menu-head">
        <span className="menu-eyebrow">Alburtis Tavern · Alburtis, PA</span>
        <h1 className="menu-heading">{isFood ? 'THE KITCHEN' : 'THE TAP LIST'}</h1>
        <div className="menu-brand">TRACKSIDE BREWING</div>
        <hr className="menu-rule" aria-hidden="true" />
        <p className="menu-sub">
          {isFood
            ? 'From the Alburtis Tavern kitchen — the companion to the taps.'
            : 'Tale pours, resident beers, zero-proof options — and the story behind each can.'}
        </p>
      </header>

      <MenuTabs active={activeTab} onChange={setActiveTab} />

      <div className="menu-wrap">

        {activeTab === 'tales' && (
          <section className="menu-pane">
            {/* Live departure board — renders only while real pours are live. */}
            <TapBoard beers={[...regulars, ...nonAlc]} liveTapSlugs={liveTapSlugs} />
            <div className="menu-pane-head">
              <span className="menu-label">Trackside Tales · The Roster</span>
            </div>
            <div className="menu-pour-list">
              {tales.map((tale) => (
                <TalePourRow
                  key={tale.id}
                  tale={tale}
                  unlocked={state.unlocked.has(tale.id)}
                  // Same live-tap source + slug translation the Tale pages
                  // use (P.18/P.19): ON TAP only for a genuinely live pour.
                  onTap={liveTapSlugs.has(prodSlugFromAppSlug(tale.id))}
                  onOpen={() => navToTale(tale)}
                  onScan={() => nav('scan')}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === 'resident' && (
          <section className="menu-pane">
            <div className="menu-pane-head">
              <span className="menu-label">Resident Beers</span>
            </div>
            <div className="menu-house-list" role="list" aria-label="Resident beers">
              {regulars.map((beer) => (
                <HouseRow
                  key={beer.name}
                  beer={beer}
                  onTap={beer.slug !== undefined && liveTapSlugs.has(beer.slug)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === 'na' && (
          <section className="menu-pane">
            <div className="menu-pane-head">
              <span className="menu-label">Zero Proof</span>
            </div>
            <div className="menu-house-list" role="list" aria-label="Non-alcoholic beers">
              {nonAlc.map((beer) => (
                <HouseRow
                  key={beer.name}
                  beer={beer}
                  isNA
                  onTap={beer.slug !== undefined && liveTapSlugs.has(beer.slug)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === 'food' && (
          <section className="menu-pane">
            <div className="menu-pane-head">
              <span className="menu-label">From the Kitchen</span>
            </div>
            <p className="menu-kitchen-note">
              Food from the <strong>Alburtis Tavern</strong> kitchen —
              built to pair with the Trackside pours.
            </p>
            <div className="menu-dish-list" role="list" aria-label="Kitchen menu">
              {food.map((item) => (
                <FoodDishRow key={item.name} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ── Quiet index — secondary to the menu itself ── */}
        <section className="menu-next">
          <button type="button" className="menu-next-link" onClick={() => nav('woodenmatch')}>
            <span className="menu-next-glyph" aria-hidden="true" />
            <span className="menu-next-title">OUR HOME</span>
            <span className="menu-next-desc">Alburtis Tavern, where the stories pour.</span>
            <span className="menu-next-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="menu-next-link" onClick={() => nav('tracks')}>
            <span className="menu-next-glyph" aria-hidden="true" />
            <span className="menu-next-title">THE TRACKS</span>
            <span className="menu-next-desc">The rail history behind the Tales.</span>
            <span className="menu-next-arrow" aria-hidden="true">→</span>
          </button>
          <button type="button" className="menu-next-link" onClick={() => nav('ourstory')}>
            <span className="menu-next-glyph" aria-hidden="true" />
            <span className="menu-next-title">OUR STORY</span>
            <span className="menu-next-desc">Why the beer is the ticket.</span>
            <span className="menu-next-arrow" aria-hidden="true">→</span>
          </button>
        </section>

        <div className="menu-foot-space" />
      </div>
    </div>
  );
}
