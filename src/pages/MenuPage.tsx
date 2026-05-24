import React, { useCallback } from 'react';
import { useApp } from '../app/AppContext';
import { LOCAL_REGULARS, LOCAL_NON_ALC, LOCAL_FOOD } from '../data/menu';
import { Tale, Beer, FoodItem } from '../app/types';

// ================== MENU PAGE (== golden #page-beers — THE TAP LIST) ==================
// Mirrors the golden v4.6.1 #page-beers structure exactly:
//   .beers-page-hero  (eyebrow + title + sub)
//   .menu-jump-strip  with .menu-jump-tab links + .menu-jump-sep separators
//   .section-label    (.section-label-text + .section-count) anchors
//   .beer-list        with .beer-card.tales (for Tales) and .beer-card (for resident/NA)
//   Each card: .beer-icon → .beer-info → .beer-action — populated by
//   beerIconMarkup / renderBeerList in the golden file.
// All sections render at once; the jump strip scrolls to each anchor (matches golden).

const ANCHOR_TALES    = 'beers-tales-anchor';
const ANCHOR_RESIDENT = 'beers-resident-anchor';
const ANCHOR_NA       = 'beers-na-anchor';
const ANCHOR_FOOD     = 'beers-food-anchor';

function BeerIcon({ image, label }: { image: string; label: string }) {
  // Mirrors beerIconMarkup() in the golden. Image is appended only when present;
  // .has-image is added on load so the rim/mark/label hide once the can image shows.
  return (
    <div className="beer-icon">
      {image ? (
        <img
          className="beer-icon-img"
          src={image}
          alt={`${label} can`}
          onLoad={(e) => {
            e.currentTarget.classList.add('loaded');
            e.currentTarget.parentElement?.classList.add('has-image');
          }}
          onError={(e) => {
            e.currentTarget.remove();
          }}
        />
      ) : null}
      <span className="beer-icon-label">{label}</span>
      <span className="beer-icon-mark">◈</span>
      <span className="beer-icon-rim" />
    </div>
  );
}

interface TaleCardProps {
  tale: Tale;
  unlocked: boolean;
  scanBadge: boolean;
  gameBadge: boolean;
  onOpen: () => void;
}

function TaleBeerCard({ tale, unlocked, scanBadge, gameBadge, onOpen }: TaleCardProps) {
  return (
    <div
      className={`beer-card tales${unlocked ? ' collected' : ''}`}
      data-tale-tag={unlocked ? 'TALE' : 'SCAN STORY'}
      onClick={onOpen}
      role="button"
      aria-label={`${tale.name} — ${tale.style}`}
    >
      <BeerIcon image={tale.image} label={tale.abbr || tale.name} />
      <div className="beer-info">
        <div className="beer-name">
          {tale.name}
          <span className="tales-badge">TALES · {tale.year}</span>
        </div>
        <div className="beer-style">{tale.style}</div>
        <div className="beer-detail">{tale.tagline}</div>
        <div className="beer-abv">ABV {tale.abv} · IBU {tale.ibu}</div>
      </div>
      <div className="beer-action">
        <div className={`scan-indicator${unlocked ? ' collected' : ''}`}>
          {unlocked ? 'UNLOCKED' : 'SCAN STORY'}
        </div>
        {unlocked && (
          <div className="beer-badges">
            <span className={`beer-badge-chip${scanBadge ? ' earned' : ''}`}>STORY {scanBadge ? '✓' : '○'}</span>
            <span className={`beer-badge-chip${gameBadge ? ' earned' : ''}`}>GAME {gameBadge ? '✓' : '○'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResidentBeerCard({ beer }: { beer: Beer }) {
  return (
    <div className="beer-card">
      <BeerIcon image={beer.image} label={beer.abbr || beer.name} />
      <div className="beer-info">
        <div className="beer-name">{beer.name}</div>
        <div className="beer-style">{beer.style}</div>
        {beer.tasting && <div className="beer-detail">{beer.tasting}</div>}
        <div className="beer-abv">ABV {beer.abv} · IBU {beer.ibu}</div>
      </div>
    </div>
  );
}

function FoodRow({ item }: { item: FoodItem }) {
  return (
    <div className="food-item">
      <div className="food-info">
        <div className="food-name">{item.name}</div>
        <div className="food-desc">{item.desc}</div>
      </div>
    </div>
  );
}

export function MenuPage() {
  const { state, navToTale, tales } = useApp();

  const scrollToAnchor = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="page active" id="page-beers">

      <div className="beers-page-hero">
        <div className="beers-page-eyebrow">BETHLEHEM, PA · NOW POURING</div>
        <div className="beers-page-title">THE TAP LIST</div>
        <div className="beers-page-sub">
          Trackside pours, resident beers, zero-proof options, and Wooden Match food highlights.
        </div>
      </div>

      <div className="menu-jump-strip">
        <button className="menu-jump-tab" onClick={() => scrollToAnchor(ANCHOR_TALES)}>TALES</button>
        <span className="menu-jump-sep">·</span>
        <button className="menu-jump-tab" onClick={() => scrollToAnchor(ANCHOR_RESIDENT)}>RESIDENT</button>
        <span className="menu-jump-sep">·</span>
        <button className="menu-jump-tab" onClick={() => scrollToAnchor(ANCHOR_NA)}>N/A</button>
        <span className="menu-jump-sep">·</span>
        <button className="menu-jump-tab" onClick={() => scrollToAnchor(ANCHOR_FOOD)}>FOOD</button>
      </div>

      <div className="section-label" id={ANCHOR_TALES}>
        <div className="section-label-text">TRACKSIDE TALES</div>
        <div className="section-count">{tales.length} ON TAP</div>
      </div>
      <div className="beer-list" id="tales-list-beers">
        {tales.map((tale) => (
          <TaleBeerCard
            key={tale.id}
            tale={tale}
            unlocked={state.unlocked.has(tale.id)}
            scanBadge={state.scanBadges.has(tale.id)}
            gameBadge={state.gameBadges.has(tale.id)}
            onOpen={() => navToTale(tale)}
          />
        ))}
      </div>

      <div className="section-label" id={ANCHOR_RESIDENT}>
        <div className="section-label-text">RESIDENT BEERS</div>
        <div className="section-count">{LOCAL_REGULARS.length} ON TAP</div>
      </div>
      <div className="beer-list" id="regular-list">
        {LOCAL_REGULARS.map((beer) => <ResidentBeerCard key={beer.name} beer={beer} />)}
      </div>

      <div className="section-label" id={ANCHOR_NA}>
        <div className="section-label-text">NON-ALCOHOLIC</div>
        <div className="section-count">{LOCAL_NON_ALC.length} ON TAP</div>
      </div>
      <div className="beer-list" id="na-list">
        {LOCAL_NON_ALC.map((beer) => <ResidentBeerCard key={beer.name} beer={beer} />)}
      </div>

      <div className="section-label" id={ANCHOR_FOOD}>
        <div className="section-label-text">WOODEN MATCH KITCHEN</div>
        <div className="section-count">MENU</div>
      </div>
      <div
        style={{
          margin: '0 0.9rem 0.75rem',
          border: '1px solid rgba(201,130,63,0.22)',
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--iron-2)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(201,130,63,0.45) 40%, transparent)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />
        <div
          className="food-note"
          style={{ borderBottom: '1px solid rgba(201,130,63,0.1)', margin: 0, padding: '0.65rem 0.85rem' }}
        >
          <div className="food-note-inner">
            Food and full menu provided by <strong>The Wooden Match</strong>. Trackside Brewing's
            partnership is beer-focused — their kitchen is exceptional on its own.
          </div>
        </div>
        <div id="food-list">
          {LOCAL_FOOD.map((item) => <FoodRow key={item.name} item={item} />)}
        </div>
      </div>

    </div>
  );
}
