import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tale, Beer, FoodItem } from '../app/types';
import {
  SectionRail,
  StatusPlate,
  PrimaryAction,
  SecondaryAction,
} from '../components/public/primitives';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';

// ================== MENU PAGE (P.28e — beer roster rebuild) ==================
// PUBLIC-v7.4B.P.28e — material rebuild of the BEERS presentation
// following the approved Beers concept:
//
//   * Tale beers   → prominent BeerRosterCard plates (framed can art,
//                    display name, serif style, real ABV/IBU, live
//                    ON TAP + unlock plates, scan/story actions).
//   * Residents/NA → secondary INVENTORY LEDGER rows (denser, no card
//                    frames — a different treatment, not a clone grid).
//   * Food         → UNCHANGED this checkpoint (P.28e checkpoint 2).
//
// Hard constraints honored (verbatim from v6.3):
//   • Routing unchanged (navToTale + nav('scan') drive Tale Detail / Scan).
//   • Badge keys, localStorage keys, and all unlock/award flows untouched.
//   • Real data sources only; ON TAP only from the live tap list (P.18).

type TabId = 'tales' | 'resident' | 'na' | 'food';

interface TabSpec { id: TabId; label: string; }
const TABS: TabSpec[] = [
  { id: 'tales',    label: 'TALES' },
  { id: 'resident', label: 'RESIDENT' },
  { id: 'na',       label: 'N/A' },
  { id: 'food',     label: 'FOOD' },
];

// ---- Tabs (railway plate rail) ----------------------------------------------
function MenuTabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="px-tabs" role="tablist" aria-label="Menu category">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`px-tab${isActive ? ' px-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Tale beer roster card ----------------------------------------------------
// P.28e beer-layout correction: strict information hierarchy —
// name → style → tagline → compact meta → status → actions. Status
// plates sit BELOW the metadata (never beside the name), actions share
// one compact row, and the can column is capped at ~31% of the card.
function BeerRosterCard({
  tale,
  unlocked,
  onTap,
  onOpen,
  onScan,
  featured = false,
}: {
  tale: Tale;
  unlocked: boolean;
  onTap: boolean;
  onOpen: () => void;
  onScan: () => void;
  /** Desktop roster composition: the unlocked pour leads the roster. */
  featured?: boolean;
}) {
  const meta = [
    tale.year ? `TALE ${tale.year}` : 'TALE',
    tale.abv ? `ABV ${tale.abv}` : null,
    tale.ibu ? `IBU ${tale.ibu}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <article
      className={`px-roster${featured ? ' px-roster--featured' : ''}`}
      aria-label={tale.style ? `${tale.name} — ${tale.style}` : tale.name}
    >
      <div className="px-roster__art" aria-hidden="true">
        {tale.image ? (
          <img
            src={tale.image}
            alt=""
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <span className="px-roster__art-fallback">{tale.abbr || tale.name}</span>
        )}
      </div>
      <div className="px-roster__body">
        <h3 className="px-roster__name">{tale.name}</h3>
        {tale.style && <div className="px-roster__style">{tale.style}</div>}
        {tale.tagline && <p className="px-roster__desc">{tale.tagline}</p>}
        <div className="px-roster__meta">{meta}</div>
        <div className="px-roster__plates">
          {onTap && <StatusPlate tone="live">ON TAP</StatusPlate>}
          <StatusPlate tone={unlocked ? 'unlocked' : 'sealed'}>
            {unlocked ? 'UNLOCKED' : 'SEALED'}
          </StatusPlate>
        </div>
        <div className="px-roster__actions">
          {unlocked ? (
            <>
              <PrimaryAction onClick={onOpen} ariaLabel={`Read the ${tale.name} tale`}>
                READ THE TALE →
              </PrimaryAction>
              <SecondaryAction onClick={onOpen} ariaLabel={`Open the ${tale.name} challenge`}>
                CHALLENGE
              </SecondaryAction>
            </>
          ) : (
            <PrimaryAction onClick={onScan} ariaLabel={`Scan to unlock ${tale.name}`}>
              SCAN TO UNLOCK
            </PrimaryAction>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- Resident / N-A inventory ledger row -------------------------------------
function InventoryRow({
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
      className="px-inv"
      role="listitem"
      aria-label={beer.style ? `${beer.name} — ${beer.style}` : beer.name}
    >
      <div className="px-inv__thumb" aria-hidden="true">
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
      <div className="px-inv__body">
        <h3 className="px-inv__name">{beer.name}</h3>
        {(beer.style || beer.tasting) && (
          <div className="px-inv__style">
            {beer.style}
            {beer.style && beer.tasting ? ' — ' : ''}
            {beer.tasting}
          </div>
        )}
      </div>
      <div className="px-inv__right">
        {onTap && <StatusPlate tone="live">ON TAP</StatusPlate>}
        {isNA && <StatusPlate>N/A</StatusPlate>}
        {stats && <span className="px-inv__stats">{stats}</span>}
      </div>
    </div>
  );
}

// ---- Food card (UNCHANGED — P.28e checkpoint 2 scope) -------------------------
const FOOD_VISUAL_META: Record<string, { sub: string; chefsPick?: boolean; glyph: string }> = {
  'Other Side Of The Pillow': { sub: 'Pierogies',          glyph: '⌬' },
  'CNJ Railyard':              { sub: 'Organic Greens Salad', glyph: '✿' },
  'Broad Street Bully':        { sub: 'Steak Sandwich',     glyph: '✦' },
  'Burger Flight':             { sub: 'Slider Trio',        glyph: '◈', chefsPick: true },
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

function FoodCard({ item }: { item: FoodItem }) {
  const meta = FOOD_VISUAL_META[item.name] || { sub: '', glyph: '◈' };
  const isChefsPick = item.isFeatured ?? meta.chefsPick ?? false;
  const price = formatFoodPrice(item.priceCents);
  const hasImage = typeof item.imageUrl === 'string' && item.imageUrl.length > 0;
  return (
    <article className="ts-food-card" aria-label={item.name}>
      <div
        className={`ts-food-card__art${hasImage ? ' ts-food-card__art--has-image' : ''}`}
        aria-hidden="true"
      >
        {hasImage ? (
          <img
            src={item.imageUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
        <span className="ts-food-card__art-glyph">{meta.glyph}</span>
      </div>
      <div className="ts-food-card__body">
        <div className="ts-food-card__name-row">
          <h3 className="ts-food-card__name">{item.name}</h3>
          <span className={`ts-food-card__badge${isChefsPick ? ' ts-food-card__badge--pick' : ''}`}>
            {isChefsPick ? "CHEF'S PICK" : 'KITCHEN'}
          </span>
        </div>
        {meta.sub && <div className="ts-food-card__sub">{meta.sub}</div>}
        {price && <div className="ts-food-card__price">{price}</div>}
        <p className="ts-food-card__desc">{item.desc}</p>
      </div>
    </article>
  );
}

// ================== MENU PAGE ROOT ==================
export function MenuPage() {
  const { state, navToTale, nav, tales, regulars, nonAlc, food, liveTapSlugs } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('tales');
  const isFood = activeTab === 'food';

  return (
    <div className="page active px-screen ts-menu-screen" id="page-beers" style={{ padding: 0, paddingBottom: '7.5rem' }}>

      <header className="px-page-head">
        <span className="px-eyebrow">Trackside Brewing</span>
        <h1 className="px-page-head__title">{isFood ? 'FOOD' : 'BEERS'}</h1>
        <p className="px-page-head__sub">
          {isFood
            ? 'From the Wooden Match kitchen — the companion to the taps.'
            : 'Tale pours, resident beers, and the story behind each can.'}
        </p>
      </header>

      <MenuTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'tales' && (
        <div className="px-wrap">
          <SectionRail label="Trackside Tales — The Roster" />
          {/* Desktop roster composition: the unlocked pour leads as the
              full-width featured card; the rest sit in a balanced row.
              With zero unlocked tales the grid falls back to an even
              three-across row (no empty quadrant, no cropped card). */}
          <div
            className={`px-stack px-roster-grid${
              tales.some((t) => state.unlocked.has(t.id)) ? '' : ' px-roster-grid--even'
            }`}
          >
            {tales.map((tale) => (
              <BeerRosterCard
                key={tale.id}
                tale={tale}
                unlocked={state.unlocked.has(tale.id)}
                featured={state.unlocked.has(tale.id)}
                // Same live-tap source + slug translation the Tale pages
                // use (P.18/P.19): ON TAP only for a genuinely live pour.
                onTap={liveTapSlugs.has(prodSlugFromAppSlug(tale.id))}
                onOpen={() => navToTale(tale)}
                onScan={() => nav('scan')}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'resident' && (
        <div className="px-wrap">
          <SectionRail label="Resident Beers" />
          <div className="px-ledger" role="list" aria-label="Resident beers">
            {regulars.map((beer) => (
              <InventoryRow
                key={beer.name}
                beer={beer}
                onTap={beer.slug !== undefined && liveTapSlugs.has(beer.slug)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'na' && (
        <div className="px-wrap">
          <SectionRail label="Non-Alcoholic" />
          <div className="px-ledger" role="list" aria-label="Non-alcoholic beers">
            {nonAlc.map((beer) => (
              <InventoryRow
                key={beer.name}
                beer={beer}
                isNA
                onTap={beer.slug !== undefined && liveTapSlugs.has(beer.slug)}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'food' && (
        <div className="px-wrap">
          <SectionRail label="Wooden Match Kitchen" />
          <div className="ts-kitchen-intro">
            <div className="ts-kitchen-intro__icon" aria-hidden="true">⌥</div>
            <div className="ts-kitchen-intro__copy">
              Food and full menu provided by <strong>The Wooden Match</strong>. Our Trackside
              Brewing partnership is beer-focused — the kitchen is a featured companion offering.
            </div>
          </div>
          <div className="ts-menu-cards">
            {food.map((item) => (
              <FoodCard key={item.name} item={item} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
