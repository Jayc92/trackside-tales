import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { LS_HOW_DISMISSED, LS_PASSPORT_PAGE } from '../app/types';
import { TsIcon } from '../components/TsIcon';
// PASS.1F — EventBoard is the Arcade's LIVE event board (its reward line
// composes "REPLAY/COMPLETE TO EARN" claim copy, exactly the actionable
// language a historical record must not show — see games/EventBoard.tsx).
// Passport reads passportModel.specialRuns directly instead and renders
// its own status-only historical card; EventBoard stays untouched and
// keeps its other call site (ArcadePage.tsx).
import { formatEventDateRange, type GameEventDefinition } from '../games/events';
import { buildPassportModel, type PassportArtifactModel } from '../games/passportModel';

// ================== PASSPORT — personal travel document ==================
// PUBLIC-v7.4B.P.28g.7 — presentation/structural refinement of the
// Passport as the payoff surface of the family (Tales = archive, Tale
// Detail = opened dossier, Passport = the guest's own document): a
// travel-document identity head, a derived collection summary, and a
// STAMP LEDGER listing every Tale with its two stamp wells.
//
// All collection logic is preserved: the same useApp() data sources
// (state.unlocked / scanBadges / gameBadges / user / lastEarnedGame)
// and the same handlers (setUser, resetDemo, nav, clearLastEarned).
// Badge keys, unlock semantics, and routes are untouched. The one
// structural change: the previous single-spread stamp BOOK pagination
// (a purely-visual UI layer) is replaced by the full ledger, so the
// LS_PASSPORT_PAGE book-page index is no longer read while browsing
// (reset still clears it). The lastEarnedGame celebration contract is
// kept — arriving with a fresh game badge highlights that Tale's
// ledger entry, then clears the flag exactly as before.
//
// PUBLIC-v7.4B.PASS.1D — Stamp Ledger vs. Challenge Mastery. The Tale
// record answers "did I discover/complete this Tale" (SCAN + CHLG
// only); it no longer carries a mastery or Engineer's Mark endorsement.
// Arcade skill lives in its own CHALLENGE MASTERY section, one row per
// registered game from passportModel.challengeMastery — which keys off
// the CHALLENGE stamp, not Tale completion, so a persisted tier (e.g.
// a legacy Gold run) stays visible even when that Tale's scan is
// missing. Both sections read the same reviewed model; no mastery is
// computed here.

// PASS.1F — Special Runs status vocabulary. 'expired' reads ENDED here
// (a durable history section), distinct from the Arcade's live board.
const SPECIAL_RUN_STATUS_LABEL: Record<string, string> = {
  upcoming: 'UPCOMING',
  active: 'ACTIVE',
  expired: 'ENDED',
};

/* One stamp well — earned wells carry the seal, empty wells stay open. */
function StampWell({
  label,
  earned,
  icon,
}: {
  label: string;
  earned: boolean;
  icon: string;
}) {
  return (
    <span
      className={`passport-well${earned ? ' passport-well--earned' : ''}`}
      role="img"
      aria-label={`${label} stamp — ${earned ? 'earned' : 'not yet earned'}`}
    >
      <span className="passport-well-ring" aria-hidden="true">
        {earned ? <TsIcon icon={icon} /> : null}
      </span>
      <span className="passport-well-lbl" aria-hidden="true">{label}</span>
    </span>
  );
}

/* PASS.1E — one standalone Artifact Case card (First Ticket, Inaugural
   Run Pass). shortDescription is the registry's own already-reviewed
   requirement copy — never invented here. */
function ArtifactCard({ artifact }: { artifact: PassportArtifactModel }) {
  const stateWord = artifact.owned ? 'earned' : 'not yet earned';
  return (
    <article
      className={'passport-artifact-card' + (artifact.owned ? ' passport-artifact-card--earned' : '')}
      aria-label={
        `${artifact.name} — ${artifact.rarityLabel}, ${stateWord}`
        + (artifact.owned ? '' : `. ${artifact.shortDescription}`)
      }
    >
      <div className="passport-artifact-card-head">
        <h3 className="passport-artifact-card-name">{artifact.name}</h3>
        <span className="passport-artifact-rarity">{artifact.rarityLabel}</span>
      </div>
      <p className="passport-artifact-card-desc">{artifact.shortDescription}</p>
      <span className="passport-artifact-card-state">
        {artifact.owned ? 'EARNED' : 'NOT YET EARNED'}
      </span>
    </article>
  );
}

export function PassportPage() {
  const { state, tales, setUser, resetDemo, nav, clearLastEarned } = useApp();

  // PASS.1C — one explicit render instant, shared by the event board and
  // the Passport model (only event status in the model depends on time).
  const renderNow = new Date();
  const { identity, serviceRecord, taleRecords, challengeMastery, artifacts, summary, specialRuns, serviceLog } =
    buildPassportModel({ ...state, tales }, renderNow);
  const nickname = identity.displayName ?? 'Trackside Guest';
  const initial  = identity.monogram ?? 'T';

  // PASS.1E — Artifact Case grouping (presentation-only; ownership truth
  // is passportModel.artifacts throughout). Registry order already puts
  // the three marks together and Full Line → Master → Yardmaster in
  // ladder order, so filtering by group is enough — no re-sorting.
  const ticketArtifact = artifacts.find((a) => a.group === 'ticket');
  const markArtifacts  = artifacts.filter((a) => a.group === 'engineers-mark');
  const lineArtifacts  = artifacts.filter((a) => a.group === 'line');
  const eventArtifacts = artifacts.filter((a) => a.group === 'event');
  const gameTitleByGameId = Object.fromEntries(
    challengeMastery.map((row) => [row.gameId, row.title]),
  );

  const talesUnlocked = state.unlocked.size;
  const stampsEarned  = state.scanBadges.size;
  const gamesDone     = state.gameBadges.size;
  const completedTales = tales.filter(
    (t) => state.scanBadges.has(t.id) && state.gameBadges.has(t.id),
  ).length;
  // ---- Identity inputs ----------------------------------------------------
  const [nicknameInput, setNicknameInput] = useState(
    nickname === 'Trackside Guest' ? '' : nickname,
  );
  // ---- Personalize panel's own name buffer (separate from the header's,
  // same underlying save action) ---------------------------------------------
  const [personalizeName, setPersonalizeName] = useState(state.user?.name || '');

  // ---- lastEarnedGame celebration (contract preserved) ---------------------
  // A fresh game badge highlights that Tale's ledger entry and scrolls it
  // into view, then the flag is cleared exactly as the book version did.
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const ledgerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!state.lastEarnedGame) return;
    const id = state.lastEarnedGame;
    if (tales.some((t) => t.id === id)) {
      setCelebrateId(id);
      requestAnimationFrame(() => {
        ledgerRef.current
          ?.querySelector(`[data-tale-entry="${id}"]`)
          ?.scrollIntoView({ block: 'center' });
      });
    }
    clearLastEarned();
  }, [state.lastEarnedGame, tales, clearLastEarned]);

  // ---- Handlers -----------------------------------------------------------
  // PASS.1G — the header's SAVE and Personalize's SAVE performed the exact
  // same action under two names (setUser, preserving any existing email);
  // one shared helper makes that explicit instead of two near-duplicates.
  const saveDisplayName = (rawName: string) => {
    const value = rawName.trim();
    if (!value) return;
    setUser({ name: value, email: state.user?.email });
  };
  const handleSaveNickname = () => saveDisplayName(nicknameInput);
  const handleReset = () => {
    if (!confirm('Reset Passport? This clears all unlocked Tales and earned Marks.')) return;
    resetDemo();
    try { localStorage.removeItem(LS_HOW_DISMISSED); } catch (_) { /* ignore */ }
    try { localStorage.removeItem(LS_PASSPORT_PAGE); } catch (_) { /* ignore */ }
    setCelebrateId(null);
  };

  return (
    <div className="page active px-screen passport-page" id="page-profile">

      {/* ── Document head — the holder's passport ── */}
      <header className="passport-head">
        <div className="passport-head-frame">
          <span className="passport-eyebrow">Trackside Tales · Travel Document</span>
          <h1 className="passport-title">TRACKSIDE<br />PASSPORT</h1>
          <hr className="passport-rule" aria-hidden="true" />
          <div className="passport-holder">
            <span className="passport-monogram" aria-hidden="true">{initial}</span>
            <span className="passport-holder-id">
              <span className="passport-holder-name">{nickname}</span>
              <span className="passport-holder-role">PREVIEW GUEST · TRACKSIDE TALES</span>
            </span>
          </div>
          <div className="passport-name-row">
            <input
              className="passport-input"
              id="nickname-field"
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="Enter your name…"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNickname(); }}
            />
            <button className="passport-save" onClick={handleSaveNickname} type="button">
              SAVE
            </button>
          </div>
        </div>
      </header>

      <div className="passport-wrap">

        {/* GAME.12 — compact SERVICE RECORD row: rank + XP endorsement
            (no bar, no duplicate plaque; the Arcade owns the full
            treatment). */}
        <div
          className="service-record service-record--compact"
          aria-label={`Service record: ${serviceRecord.rankName}, ${serviceRecord.totalXp.toLocaleString('en-US')} XP`}
        >
          <span className="service-record-label">Service Record</span>
          <span className="service-record-rank">{serviceRecord.rankName}</span>
          <span className="service-record-xp">
            {serviceRecord.totalXp.toLocaleString('en-US')} XP
            <span className="service-record-xp-sep" aria-hidden="true">·</span>
            {serviceRecord.isMaxRank
              ? 'TERMINAL RANK · LINE COMPLETE'
              : `NEXT ${serviceRecord.nextRankName} · ${serviceRecord.remainingXp.toLocaleString('en-US')} XP`}
          </span>
        </div>

        {/* ── Collection summary — derived from current state only ── */}
        <div className="passport-summary" role="status">
          <span className="passport-summary-item">
            <b>{talesUnlocked}</b>/{tales.length} TALES
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{stampsEarned}</b> SCAN
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{gamesDone}</b> CHALLENGE
          </span>
          <span className="passport-summary-tick" aria-hidden="true" />
          <span className="passport-summary-item">
            <b>{completedTales}</b> COMPLETE
          </span>
        </div>

        {/* ── Stamp ledger — every Tale is a page of the document ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Stamp Ledger</span>
            <span className="passport-flow" aria-hidden="true">
              SCAN <span>→</span> CHALLENGE <span>→</span> COMPLETE
            </span>
          </div>

          {talesUnlocked === 0 && (
            <p className="passport-first">
              Your passport is waiting for its first stamp. Scan any
              Trackside Tale can to open a page.
            </p>
          )}

          <div className="passport-ledger" ref={ledgerRef}>
            {taleRecords.map((record) => {
              const status = !record.unlocked
                ? 'Sealed — scan a Trackside can to open this page.'
                : record.complete
                  ? 'Both stamps earned. This Tale is fully collected.'
                  : record.scanComplete && !record.challengeComplete
                    ? 'Challenge stamp remaining — play the mini-game.'
                    : 'Unlocked. Earn the Scan and Challenge stamps to complete the page.';
              return (
                <article
                  key={record.taleId}
                  data-tale-entry={record.taleId}
                  className={
                    'passport-record'
                    + (record.complete ? ' passport-record--complete' : '')
                    + (!record.unlocked ? ' passport-record--sealed' : '')
                    + (celebrateId === record.taleId ? ' passport-record--celebrate' : '')
                  }
                >
                  <div className="passport-record-year" aria-hidden="true">
                    {record.year || '—'}
                  </div>
                  <div className="passport-record-main">
                    <span className="passport-record-chapter">{record.chapter}</span>
                    <h3 className="passport-record-title">{record.name}</h3>
                    <p className="passport-record-status">{status}</p>
                  </div>
                  <div className="passport-record-wells">
                    <StampWell label="SCAN" earned={record.scanComplete} icon="station-seal" />
                    <StampWell label="CHLG" earned={record.challengeComplete} icon="town-seal" />
                  </div>
                  {record.complete && (
                    <span className="passport-record-collected" aria-label="Fully collected">
                      COLLECTED
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ── Challenge Mastery — Arcade performance, one row per
            registered game (passportModel.challengeMastery). Separate
            from Tale completion above: keyed off the CHALLENGE stamp,
            so a persisted tier stays visible even without the Tale's
            scan. The tier/mark pills reuse the .passport-mastery /
            .passport-artifact treatment verbatim. */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Challenge Mastery</span>
            <span className="passport-flow" aria-hidden="true">ARCADE PERFORMANCE</span>
          </div>
          <div className="passport-ledger">
            {challengeMastery.map((row) => (
              <article
                key={row.gameId}
                className="passport-challenge"
                aria-label={
                  `${row.title} — mastery ${row.displayTierLabel ?? 'not yet ranked'}`
                  + (row.engineersMark
                    ? `, Engineer's Mark ${row.engineersMark.owned ? 'earned' : 'not yet earned'}`
                    : '')
                }
              >
                <h3 className="passport-challenge-title">{row.title}</h3>
                <span className={`passport-mastery passport-mastery--${row.displayTier ?? 'none'}`}>
                  <span className="passport-mastery-lbl">Mastery</span>
                  <span className="passport-mastery-seal">
                    {row.displayTierLabel ?? 'NOT YET RANKED'}
                  </span>
                </span>
                {row.engineersMark && (
                  <span className={'passport-artifact' + (row.engineersMark.owned ? '' : ' passport-artifact--locked')}>
                    <span className="passport-artifact-lbl">Engineer's Mark</span>
                    <span className="passport-artifact-name">
                      {row.engineersMark.owned ? 'EARNED' : 'NOT YET EARNED'}
                    </span>
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ── Artifact Case — the complete registry-driven collection
            (passportModel.artifacts). Replaces the old owned-only
            Archive Artifact strip: every artifact renders, owned or
            not, so a fresh player sees the whole case rather than an
            empty shelf. First Ticket and Inaugural Run Pass are plain
            cards; the three Engineer's Marks and the Full Line → Master
            → Yardmaster ladder are grouped for legibility. Ownership
            truth is read straight from the model — no collectible
            lookup happens on this page. */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Artifact Case</span>
            <span className="passport-tally">
              ARTIFACTS · {summary.artifactsOwned} OF {summary.artifactsTotal}
            </span>
          </div>

          <div className="passport-ledger">
            {ticketArtifact && <ArtifactCard artifact={ticketArtifact} />}

            <div className="passport-artifact-group">
              <span className="passport-artifact-group-lbl">Engineer's Marks</span>
              <div className="passport-mark-row">
                {markArtifacts.map((a) => {
                  const stateWord = a.owned ? 'earned' : 'not yet earned';
                  return (
                    <div
                      key={a.collectibleId}
                      className={'passport-mark-slot' + (a.owned ? ' passport-mark-slot--earned' : '')}
                      role="img"
                      aria-label={
                        `${a.name} — ${a.rarityLabel}, for ${gameTitleByGameId[a.gameId ?? ''] ?? 'its Tale'}, ${stateWord}`
                        + (a.owned ? '' : `. ${a.shortDescription}`)
                      }
                    >
                      <span className="passport-mark-slot-game" aria-hidden="true">
                        {gameTitleByGameId[a.gameId ?? ''] ?? ''}
                      </span>
                      <span className="passport-mark-slot-name" aria-hidden="true">{a.name}</span>
                      <span className="passport-artifact-rarity" aria-hidden="true">{a.rarityLabel}</span>
                      <span className="passport-mark-slot-state" aria-hidden="true">
                        {a.owned ? 'EARNED' : 'NOT YET EARNED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="passport-artifact-group">
              <span className="passport-artifact-group-lbl">
                The Line — Full Line → Master of the Line → Yardmaster's Seal
              </span>
              <div className="passport-ladder">
                {lineArtifacts.map((a, i) => {
                  const stateWord = a.owned ? 'earned' : 'not yet earned';
                  return (
                    <div
                      key={a.collectibleId}
                      className={'passport-ladder-step' + (a.owned ? ' passport-ladder-step--earned' : '')}
                      role="img"
                      aria-label={
                        `Step ${i + 1}: ${a.name} — ${a.rarityLabel}, ${stateWord}`
                        + (a.owned ? '' : `. ${a.shortDescription}`)
                      }
                    >
                      <span className="passport-ladder-step-num" aria-hidden="true">{i + 1}</span>
                      <span className="passport-ladder-step-body" aria-hidden="true">
                        <span className="passport-ladder-step-name">{a.name}</span>
                        <span className="passport-artifact-rarity">{a.rarityLabel}</span>
                        <p className="passport-ladder-step-desc">{a.shortDescription}</p>
                      </span>
                      <span className="passport-ladder-step-state" aria-hidden="true">
                        {a.owned ? 'EARNED' : 'NOT YET EARNED'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {eventArtifacts.map((a) => <ArtifactCard key={a.collectibleId} artifact={a} />)}
          </div>
        </section>

        {/* ── Special Runs — durable event history (passportModel.specialRuns).
            Status-only: no claim/replay copy, no live task board — that is
            the Arcade's EventBoard, a different surface entirely. Renders
            nothing with zero registered events, matching EventBoard's own
            zero-event contract. */}
        {specialRuns.length > 0 && (
          <section className="passport-block">
            <div className="passport-block-head">
              <span className="passport-heading">Special Runs</span>
              <span className="passport-flow" aria-hidden="true">TIMETABLE HISTORY</span>
            </div>
            <div className="passport-ledger">
              {specialRuns.map((run) => {
                const progress = run.complete
                  ? 'COMPLETE'
                  : `${run.completedCount} OF ${run.requiredCount} `
                    + `${run.requiredCount === 1 ? 'CHALLENGE' : 'CHALLENGES'} `
                    + (run.status === 'expired' ? 'COMPLETED' : 'COMPLETE');
                return (
                  <article
                    key={run.eventId}
                    className={`passport-special-run passport-special-run--${run.status}`}
                    aria-label={
                      `${run.name} — ${SPECIAL_RUN_STATUS_LABEL[run.status]}, ${progress}`
                      + (run.reward ? `, ${run.reward.name} ${run.reward.owned ? 'earned' : 'not yet earned'}` : '')
                    }
                  >
                    <div className="passport-special-run-top">
                      <h3 className="passport-special-run-name">{run.name}</h3>
                      <span className={`passport-special-run-status passport-special-run-status--${run.status}`}>
                        {SPECIAL_RUN_STATUS_LABEL[run.status]}
                      </span>
                    </div>
                    <p className="passport-special-run-dates">
                      {formatEventDateRange({ startsAt: run.startsAt, endsAt: run.endsAt } as GameEventDefinition)}
                    </p>
                    <p className="passport-special-run-progress">{progress}</p>
                    {run.reward && (
                      <p className="passport-special-run-reward">
                        {run.reward.name} · {run.reward.owned ? 'EARNED' : 'NOT YET EARNED'}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Service Log — durable lifetime counts (passportModel.serviceLog).
            No live objective, no current Weekly Dispatch/quest detail —
            those stay Arcade-only. weeklyDispatchesCleared is OMITTED
            entirely (not shown as 0) while order authority is suspended,
            so a future-version store is never misread as zero history. */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Service Log</span>
          </div>
          <dl className="passport-service-log">
            <div className="passport-service-log-row">
              <dt>Train Orders Completed</dt>
              <dd>{serviceLog.questsCompleted}</dd>
            </div>
            {serviceLog.weeklyDispatchesCleared !== null && (
              <div className="passport-service-log-row">
                <dt>Weekly Dispatches Cleared</dt>
                <dd>{serviceLog.weeklyDispatchesCleared}</dd>
              </div>
            )}
            <div className="passport-service-log-row">
              <dt>Special Runs Completed</dt>
              <dd>{serviceLog.eventsCompleted}</dd>
            </div>
            <div className="passport-service-log-row">
              <dt>Artifacts Collected</dt>
              <dd>{serviceLog.artifactsOwned}</dd>
            </div>
          </dl>
        </section>

        {/* ── Core actions ── */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Keep Collecting</span>
          </div>
          <div className="passport-actions">
            <button
              type="button"
              className="passport-action passport-action--primary"
              onClick={() => nav('scan')}
              aria-label="Scan a can"
            >
              ⌗ SCAN A CAN
            </button>
            <button
              type="button"
              className="passport-action"
              onClick={() => nav('tales')}
              aria-label="Browse the Tale archive"
            >
              ◈ THE TALE ARCHIVE
            </button>
            {/* GAME.5 — the Arcade holds this passport's unlocked
                challenges; existing nav contract, no new state. */}
            <button
              type="button"
              className="passport-action"
              onClick={() => nav('arcade')}
              aria-label="View the Trackside Arcade"
            >
              ▶ TRACKSIDE ARCADE
            </button>
          </div>
        </section>

        {/* ── Personalize — local display-name only; no signup, no account
            promise. JOIN TRACKSIDE/email/"Maybe later" removed in PASS.1G:
            they wrote the same setUser({name}) the header SAVE already
            performs, and email had zero live consumer anywhere in the app. */}
        <section className="passport-block">
          <div className="passport-block-head">
            <span className="passport-heading">Personalize Your Passport</span>
          </div>
          <p className="passport-personalize-copy">
            Your preview progress is saved on this device.
          </p>
          <div className="passport-personalize-inputs">
            <div className="passport-input-wrap">
              <span className="passport-input-icon" aria-hidden="true"><TsIcon icon="guest-profile" /></span>
              <input
                className="passport-input passport-input--with-icon"
                type="text"
                value={personalizeName}
                onChange={(e) => setPersonalizeName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          </div>
          <button
            type="button"
            className="passport-action passport-action--primary"
            onClick={() => saveDisplayName(personalizeName)}
          >
            SAVE
          </button>
          <button type="button" className="passport-reset" onClick={handleReset}>
            RESET PREVIEW
          </button>
        </section>

        <div className="passport-foot-space" />
      </div>
    </div>
  );
}
