import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tale } from '../app/types';
import { GameOverlay } from '../games/GameOverlay';
import { GameDefinition, getAllGameDefinitions } from '../games/registry';
import { GameType } from '../games/gameConfigs';

// ================== TRACKSIDE ARCADE — the games of the archive ==================
// PUBLIC-v7.4B.GAME.5 — the first player-facing platform surface on the
// GAME.2-4 registry. REAL data only: the catalog is
// getAllGameDefinitions(), Tale association resolves through
// definition.taleId against the existing Tale data, and every visible
// state derives from the authoritative app state:
//
//   SEALED   — the associated Tale is not unlocked (the game cannot
//              launch; the card routes to the Tale's sealed page).
//   PLAYABLE — Tale unlocked, game badge not yet earned.
//   COMPLETE — existing game badge earned (state.gameBadges holds TALE
//              ids — the frozen legacy contract; never GameIds).
//
// Launching reuses the shared production GameOverlay path (GAME.4):
// definition prop, lazy runtime chunk, legacy badge funnel — badge
// award mirrors TaleDetailPage exactly (awardGameBadge(taleId)).
// No score persistence, no mastery/XP/leaderboards (later gates);
// onResult is intentionally not passed until GAME.6.

// Restrained public descriptors for the frozen internal GameType
// strings (never shown raw). Derived from what each game actually is.
const TYPE_LABELS: Record<GameType, string> = {
  grid:  'PLANNING CHALLENGE',
  spike: 'ROUTE CHALLENGE',
  match: 'PRESERVATION CHALLENGE',
};

type CabinetState = 'sealed' | 'playable' | 'complete';

export function ArcadePage() {
  const { state, tales, nav, navToTale, awardGameBadge, guestId } = useApp();
  const [activeGame, setActiveGame] = useState<GameDefinition | null>(null);

  // Catalog: registry definitions joined to their Tales. Fail closed —
  // a definition without a resolvable Tale association renders nothing
  // (no fabricated fallback content).
  const catalog = getAllGameDefinitions()
    .map((def) => {
      const tale = def.taleId ? tales.find((t) => t.id === def.taleId) : undefined;
      return tale ? { def, tale } : null;
    })
    .filter((entry): entry is { def: GameDefinition; tale: Tale } => entry !== null);

  const stateFor = (tale: Tale): CabinetState => {
    if (!state.unlocked.has(tale.id)) return 'sealed';
    if (state.gameBadges.has(tale.id)) return 'complete';
    return 'playable';
  };

  const counts = catalog.reduce(
    (acc, { tale }) => {
      acc[stateFor(tale)] += 1;
      return acc;
    },
    { sealed: 0, playable: 0, complete: 0 },
  );

  const activeTale = activeGame?.taleId
    ? tales.find((t) => t.id === activeGame.taleId)
    : undefined;

  return (
    <div className="page active px-screen arcade-page" id="page-arcade">

      {/* ── Head — the arcade marquee ── */}
      <header className="arcade-head">
        <span className="arcade-eyebrow">Trackside Brewing</span>
        <h1 className="arcade-title">TRACKSIDE<br />ARCADE</h1>
        <div className="arcade-brand">THE GAMES OF THE ARCHIVE</div>
        <hr className="arcade-rule" aria-hidden="true" />
        <p className="arcade-sub">
          Every Trackside Tale can unlock a playable challenge. Discover
          the Tale, play its game — and come back to replay it any time.
        </p>
        {/* summary — real registry + state counts only */}
        <div className="arcade-summary" role="status">
          <span className="arcade-summary-item"><b>{counts.playable}</b> PLAYABLE</span>
          <span className="arcade-summary-tick" aria-hidden="true" />
          <span className="arcade-summary-item"><b>{counts.complete}</b> COMPLETE</span>
          <span className="arcade-summary-tick" aria-hidden="true" />
          <span className="arcade-summary-item"><b>{counts.sealed}</b> SEALED</span>
        </div>
      </header>

      <div className="arcade-wrap">

        {/* ── The cabinets ── */}
        <section className="arcade-section" aria-label="Game catalog">
          <div className="arcade-section-head">
            <span className="arcade-label">The Cabinets</span>
          </div>
          <div className="arcade-cabinets">
            {catalog.map(({ def, tale }) => {
              const cab = stateFor(tale);
              return (
                <article
                  key={def.gameId}
                  className={`arcade-cab arcade-cab--${cab}`}
                  aria-label={`${def.title} — ${cab === 'sealed' ? 'sealed' : cab === 'complete' ? 'complete' : 'playable'}`}
                >
                  <div className="arcade-cab-marquee">
                    <span className="arcade-cab-type">{TYPE_LABELS[def.type]}</span>
                    <span className={`arcade-chip arcade-chip--${cab}`}>
                      {cab === 'sealed' ? 'SEALED' : cab === 'complete' ? 'COMPLETE' : 'PLAYABLE'}
                    </span>
                  </div>
                  <h3 className="arcade-cab-title">{def.title}</h3>
                  <p className="arcade-cab-tale">
                    From the Tale: <em>{tale.title.replace('\n', ' ')}</em>
                  </p>
                  {cab === 'sealed' ? (
                    <>
                      <p className="arcade-cab-note">
                        This challenge belongs to a Tale you haven't
                        discovered yet.
                      </p>
                      <button
                        type="button"
                        className="arcade-action"
                        onClick={() => navToTale(tale)}
                      >
                        FIND THE TALE <span aria-hidden="true">→</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="arcade-action arcade-action--primary"
                      onClick={() => setActiveGame(def)}
                    >
                      {cab === 'complete' ? '↻ REPLAY' : '▶ PLAY'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Quiet index back into the system ── */}
        <section className="arcade-section">
          <div className="arcade-section-head">
            <span className="arcade-label">Keep Collecting</span>
          </div>
          <div className="arcade-next">
            <button type="button" className="arcade-next-link" onClick={() => nav('tales')}>
              <span className="arcade-next-glyph" aria-hidden="true" />
              <span className="arcade-next-title">THE TALE ARCHIVE</span>
              <span className="arcade-next-desc">Find the Tales behind the games.</span>
              <span className="arcade-next-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" className="arcade-next-link" onClick={() => nav('passport')}>
              <span className="arcade-next-glyph" aria-hidden="true" />
              <span className="arcade-next-title">VIEW PASSPORT</span>
              <span className="arcade-next-desc">Your stamps and completed challenges.</span>
              <span className="arcade-next-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <div className="arcade-foot-space" />
      </div>

      {/* ── Shared production game shell (GAME.4 path) ── */}
      {activeGame && activeTale && (
        <GameOverlay
          definition={activeGame}
          onClose={() => setActiveGame(null)}
          // Badge award mirrors TaleDetailPage exactly: ownership stays
          // the TALE id (frozen tb_game_badges contract), never GameId.
          onBadgeAwarded={() => awardGameBadge(activeTale.id)}
          alreadyEarned={state.gameBadges.has(activeTale.id)}
          successBadgeIcon={activeTale.gameBadge.icon}
          successBadgeTitle={activeTale.gameBadge.title}
          guestId={guestId}
        />
      )}
    </div>
  );
}
