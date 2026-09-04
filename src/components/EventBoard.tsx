import React from 'react';
import {
  EventPresentationModel,
  GameEventStatus,
  formatEventDateRange,
  isEventComplete,
} from '../games/events';
import { GameId, getGameDefinition } from '../games/registry';

// ================== EVENT BOARD — special timetable notices ==================
// PUBLIC-v7.4B.GAME.10B — the ONE presentation surface for seasonal /
// limited-time events, styled as archival dispatch-board notices (not
// promotional banners). PRESENTATION-ONLY: props in, DOM out — no
// storage access, no AppContext mutation, no result processing, no
// interactive controls, no timers. Status/completion/date logic comes
// from the shared events.ts helpers; game titles come from the
// registry (raw GameIds are never rendered).
//
// ZERO-EVENT CONTRACT (G10B §20): with an empty model list the
// component renders NOTHING — no container, no heading, no spacing —
// so the production app (whose event registry is empty) carries zero
// event DOM.
//
// Neutral status language only: UPCOMING / ACTIVE / ENDED (never
// EXPIRED/LOCKED/MISSED OUT), and completion is status only — no
// reward, prize, or claim language exists here.

const STATUS_LABELS: Record<GameEventStatus, string> = {
  upcoming: 'UPCOMING',
  active: 'ACTIVE',
  expired: 'ENDED',
};

/** Targeted-challenge line: canonical registry titles for small sets,
 *  a plain count for larger ones. */
function challengeLine(gameIds: readonly GameId[]): string {
  if (gameIds.length <= 3) {
    return gameIds.map((id) => getGameDefinition(id).title).join(' · ');
  }
  return `${gameIds.length} CHALLENGES`;
}

/** Progress line per state (G10B §11–§14): upcoming shows none;
 *  active shows X OF N … COMPLETE (or COMPLETE when done); ended
 *  shows the final neutral state (… COMPLETED / COMPLETE). */
function progressLine(model: EventPresentationModel): string | null {
  if (model.status === 'upcoming') return null;
  if (isEventComplete(model)) return 'COMPLETE';
  const done = model.progress?.completedGameIds.length ?? 0;
  const total = model.definition.gameIds.length;
  const noun = total === 1 ? 'CHALLENGE' : 'CHALLENGES';
  const verb = model.status === 'expired' ? 'COMPLETED' : 'COMPLETE';
  return `${done} OF ${total} ${noun} ${verb}`;
}

export function EventBoard({ models }: { models: EventPresentationModel[] }) {
  if (models.length === 0) return null;
  return (
    <section className="event-board" aria-labelledby="event-board-heading">
      <div className="event-board-head">
        <span className="event-board-label" id="event-board-heading">
          Special Timetable
        </span>
      </div>
      <ul className="event-board-list">
        {models.map((model) => {
          const progress = progressLine(model);
          return (
            <li
              key={model.definition.eventId}
              className={`event-notice event-notice--${model.status}`}
            >
              <article
                aria-label={`${model.definition.name} — ${STATUS_LABELS[model.status]}`}
              >
                <div className="event-notice-top">
                  <h3 className="event-notice-name">{model.definition.name}</h3>
                  <span className={`event-notice-status event-notice-status--${model.status}`}>
                    {STATUS_LABELS[model.status]}
                  </span>
                </div>
                <p className="event-notice-dates">
                  {formatEventDateRange(model.definition)}
                </p>
                <p className="event-notice-games">
                  {challengeLine(model.definition.gameIds)}
                </p>
                {progress && (
                  <p className="event-notice-progress">{progress}</p>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
