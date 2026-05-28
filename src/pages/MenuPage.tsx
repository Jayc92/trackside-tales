import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tale, Beer, FoodItem } from '../app/types';
// ADMIN-v6.4: beer/food arrays now flow through useApp() so the
// Menu page renders whichever source is active (local fallback or
// remote-hydrated). Render markup unchanged.

// ================== MENU PAGE (v6.3 — Structured Design Pass) ==================
// Visual rewrite to match v6.0 reference: large display title (BEERS / FOOD),
// premium segmented tab control, and brass-framed dark cards for both beers
// and food. Tab state is local UI only — no schema, route, badge, or scan-
// logic changes.
//
// Hard constraints honored:
//   • Routing unchanged (navToTale + nav('scan') still drive Tale Detail / Scan).
//   • Badge keys, localStorage keys, and all unlock/award flows untouched.
//   • Real data sources only (LOCAL_REGULARS / LOCAL_NON_ALC / LOCAL_FOOD /
//     useApp().tales / state.unlocked).
//   • Section-scoped under .ts-menu-screen so legacy classes can't bleed in.

type TabId = 'tales' | 'resident' | 'na' | 'food';

interface TabSpec { id: TabId; label: string; }
const TABS: TabSpec[] = [
  { id: 'tales',    label: 'TALES' },
  { id: 'resident', label: 'RESIDENT' },
  { id: 'na',       label: 'N/A' },
  { id: 'food',     label: 'FOOD' },
];

// ---- Menu Tabs --------------------------------------------------------------
function MenuTabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="ts-menu-tabs" role="tablist" aria-label="Menu category">
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`ts-menu-tab${isActive ? ' ts-menu-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Page title block -------------------------------------------------------
function MenuTitleBlock({ activeTab }: { activeTab: TabId }) {
  const isFood = activeTab === 'food';
  return (
    <div className="ts-menu-title-block">
      <h1 className="ts-menu-title-block__title">
        {isFood ? 'FOOD' : 'BEERS'}
      </h1>
      <div className="ts-menu-title-block__sub">
        {isFood
          ? 'Crafted flavors. Perfectly paired.'
          : 'Explore our craft, on tap and beyond.'}
      </div>
    </div>
  );
}

// ---- Section header (brass hairlines + label) -------------------------------
function MenuSectionHeader({ text, glyph }: { text: string; glyph?: string }) {
  return (
    <div className="ts-menu-section-header" role="presentation">
      <span className="ts-menu-section-header__rule" aria-hidden="true" />
      <span className="ts-menu-section-header__text">
        {glyph && <span className="ts-menu-section-header__glyph" aria-hidden="true">{glyph}</span>}
        {text}
      </span>
      <span className="ts-menu-section-header__rule" aria-hidden="true" />
    </div>
  );
}

// ---- Beer art well (shared image-or-fallback) -------------------------------
function BeerArt({ image, label }: { image: string; label: string }) {
  return (
    <div className="ts-beer-card__art">
      {image ? (
        <img
          src={image}
          alt=""
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = 'none';
          }}
        />
      ) : (
        <span className="ts-beer-card__art-fallback">{label}</span>
      )}
    </div>
  );
}

// ---- Tale beer card ---------------------------------------------------------
interface TaleCardProps {
  tale: Tale;
  unlocked: boolean;
  onOpen: () => void;
  onScan: () => void;
}
function TaleBeerCard({ tale, unlocked, onOpen, onScan }: TaleCardProps) {
  return (
    <article
      className={`ts-beer-card ts-beer-card--clickable`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${tale.name} — ${tale.style}`}
    >
      <BeerArt image={tale.image} label={tale.abbr || tale.name} />
      <div className="ts-beer-card__body">
        <div className="ts-beer-card__name-row">
          <h3 className="ts-beer-card__name">{tale.name}</h3>
          <span className="ts-beer-card__tag">TALES · {tale.year}</span>
        </div>
        <div className="ts-beer-card__style">{tale.style}</div>
        <p className="ts-beer-card__desc">{tale.tagline}</p>
        <div className="ts-beer-card__meta">
          <span className="ts-beer-card__meta-dot" aria-hidden="true" />
          ABV {tale.abv} · IBU {tale.ibu}
        </div>
        <div className="ts-beer-card__actions">
          {unlocked ? (
            <>
              <span className="ts-beer-card__status ts-beer-card__status--unlocked">
                ✓ UNLOCKED
              </span>
              <button
                type="button"
                className="ts-beer-card__secondary"
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
              >
                STORY
              </button>
              <button
                type="button"
                className="ts-beer-card__secondary"
                onClick={(e) => { e.stopPropagation(); onOpen(); }}
              >
                GAME
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ts-beer-card__primary"
              onClick={(e) => { e.stopPropagation(); onScan(); }}
            >
              SCAN STORY
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ---- Resident / N-A beer card ----------------------------------------------
function ResidentBeerCard({ beer, isNA = false }: { beer: Beer; isNA?: boolean }) {
  return (
    <article className="ts-beer-card" aria-label={`${beer.name} — ${beer.style}`}>
      <BeerArt image={beer.image} label={beer.abbr || beer.name} />
      <div className="ts-beer-card__body">
        <div className="ts-beer-card__name-row">
          <h3 className="ts-beer-card__name">{beer.name}</h3>
          {isNA && (
            <span className="ts-beer-card__tag ts-beer-card__tag--na">N/A</span>
          )}
        </div>
        <div className="ts-beer-card__style">{beer.style}</div>
        {beer.tasting && <p className="ts-beer-card__desc">{beer.tasting}</p>}
        <div className="ts-beer-card__meta">
          <span className="ts-beer-card__meta-dot" aria-hidden="true" />
          ABV {beer.abv} · IBU {beer.ibu}
        </div>
      </div>
    </article>
  );
}

// ---- Food card --------------------------------------------------------------
// Pure visual sub-info: derives a subtitle and a "chef's pick" flag from the
// existing FoodItem data so we don't change the data schema. The mapping is
// keyed by item.name so it stays in sync if the menu data is reordered.
const FOOD_VISUAL_META: Record<string, { sub: string; chefsPick?: boolean; glyph: string }> = {
  'Other Side Of The Pillow': { sub: 'Pierogies',          glyph: '⌬' },
  'CNJ Railyard':              { sub: 'Organic Greens Salad', glyph: '✿' },
  'Broad Street Bully':        { sub: 'Steak Sandwich',     glyph: '✦' },
  'Burger Flight':             { sub: 'Slider Trio',        glyph: '◈', chefsPick: true },
};

function FoodCard({ item }: { item: FoodItem }) {
  const meta = FOOD_VISUAL_META[item.name] || { sub: '', glyph: '◈' };
  return (
    <article className="ts-food-card" aria-label={item.name}>
      <div className="ts-food-card__art" aria-hidden="true">
        <span className="ts-food-card__art-glyph">{meta.glyph}</span>
      </div>
      <div className="ts-food-card__body">
        <div className="ts-food-card__name-row">
          <h3 className="ts-food-card__name">{item.name}</h3>
          <span className={`ts-food-card__badge${meta.chefsPick ? ' ts-food-card__badge--pick' : ''}`}>
            {meta.chefsPick ? "CHEF'S PICK" : 'KITCHEN'}
          </span>
        </div>
        {meta.sub && <div className="ts-food-card__sub">{meta.sub}</div>}
        <p className="ts-food-card__desc">{item.desc}</p>
      </div>
    </article>
  );
}

// ================== MENU PAGE ROOT ==================
export function MenuPage() {
  const { state, navToTale, nav, tales, regulars, nonAlc, food } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('tales');

  return (
    <div className="page active ts-menu-screen" id="page-beers">

      {/* ============== 1. PAGE TITLE ============== */}
      <MenuTitleBlock activeTab={activeTab} />

      {/* ============== 2. SEGMENTED TABS ============== */}
      <MenuTabs active={activeTab} onChange={setActiveTab} />

      {/* ============== 3. ACTIVE TAB CONTENT ============== */}
      {activeTab === 'tales' && (
        <>
          <MenuSectionHeader text="TRACKSIDE TALES — ON TAP" glyph="◈" />
          <div className="ts-menu-cards">
            {tales.map((tale) => (
              <TaleBeerCard
                key={tale.id}
                tale={tale}
                unlocked={state.unlocked.has(tale.id)}
                onOpen={() => navToTale(tale)}
                onScan={() => nav('scan')}
              />
            ))}
          </div>
        </>
      )}

      {activeTab === 'resident' && (
        <>
          <MenuSectionHeader text="RESIDENT BEERS" glyph="◈" />
          <div className="ts-menu-cards">
            {regulars.map((beer) => (
              <ResidentBeerCard key={beer.name} beer={beer} />
            ))}
          </div>
        </>
      )}

      {activeTab === 'na' && (
        <>
          <MenuSectionHeader text="NON-ALCOHOLIC" glyph="◈" />
          <div className="ts-menu-cards">
            {nonAlc.map((beer) => (
              <ResidentBeerCard key={beer.name} beer={beer} isNA />
            ))}
          </div>
        </>
      )}

      {activeTab === 'food' && (
        <>
          <MenuSectionHeader text="WOODEN MATCH KITCHEN" glyph="✦" />
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
        </>
      )}

    </div>
  );
}
