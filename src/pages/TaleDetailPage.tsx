import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { GameOverlay } from '../games/GameOverlay';
import { getGameConfig } from '../games/gameConfigs';
import { formatDate } from '../services/badgeService';
import { prodSlugFromAppSlug } from '../services/talePresentationPack';
import { TsIcon } from '../components/TsIcon';
import {
  IronPanel,
  SectionRail,
  StatusPlate,
  PrimaryAction,
  SecondaryAction,
} from '../components/public/primitives';

// ================== TALE DETAIL — archive dossier template ==================
// PUBLIC-v7.4B.P.28e — material rebuild of the reusable Tale template
// following the approved dossier concept: parchment archive-ticket hero
// (spine · ghost year · title · meta rule · framed can), biography
// dossier, long-form story, grid map, horizontal timeline rail with
// medallion nodes, badge + challenge plate, and the game/passport CTAs.
//
// EVERYTHING is data-driven from the Tale model — nothing is hard-coded
// to W.A. Lager. ALL logic is preserved verbatim from the previous
// implementation: preview injection (P.15c), unlock/badge/collected
// state reads, live-tap availability precedence (P.19/P.19a),
// GameOverlay wiring, and the locked-branch behavior.

// PUBLIC-v7.4B.P.12a — build the hero meta line from only the
// non-blank fragments so a Tale without pack style/ABV/IBU renders
// "Test Tale" instead of "Test Tale ·  · ABV  · IBU ".
function buildHeroMeta(tale: { name: string; style: string; abv: string; ibu: string }): string {
  const fragments: string[] = [];
  if (tale.name.trim())  fragments.push(tale.name.trim());
  if (tale.style.trim()) fragments.push(tale.style.trim());
  if (tale.abv.trim())   fragments.push(`ABV ${tale.abv.trim()}`);
  if (tale.ibu.trim())   fragments.push(`IBU ${tale.ibu.trim()}`);
  return fragments.join(' · ');
}

// CP2 correction §2 — timeline medallions use the Trackside icon
// system (platform-consistent SVG) instead of Unicode pictographs.
function timelineIcon(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('born'))         return 'station-lantern';
  if (t.includes('purchase'))     return 'survey-grid';
  if (t.includes('chief'))        return 'town-seal';
  if (t.includes('found'))        return 'map-grid';
  if (t.includes('liberty'))      return 'station-seal';
  if (t.includes('died') || t.includes('dies')) return 'crossed-spikes';
  return 'town-seal';
}

// PUBLIC-v7.4B.P.19 — Tale availability label. The LIVE tap list is the
// sole source of the operational "ON TAP" claim; tales.tap_status is
// EDITORIAL lifecycle messaging only. Precedence preserved verbatim.
function deriveTaleAvailabilityLabel(
  tale: { id: string; tapStatus: 'on-tap' | 'retired' | 'coming-soon' },
  liveTapSlugs: Set<string>,
): string | null {
  if (liveTapSlugs.has(prodSlugFromAppSlug(tale.id))) return 'ON TAP';
  if (tale.tapStatus === 'retired') return 'RETIRED TALE';
  if (tale.tapStatus === 'coming-soon') return 'COMING SOON';
  return null;
}

// PUBLIC-v7.4B.P.15c — optional preview injection (behavior unchanged).
interface TaleDetailPageProps {
  previewTale?: import('../app/types').Tale;
  previewMode?: boolean;
}

/* Shared archive-ticket hero (tier-1 artifact). Used by both the
   sealed and unlocked branches so the Tale reads as the same document
   in both states — only the plates and lower content change. */
function TicketHero({
  tale,
  plates,
  onBack,
  showCan,
}: {
  tale: import('../app/types').Tale;
  plates: React.ReactNode;
  onBack?: () => void;
  showCan: boolean;
}) {
  return (
    <section className="px-ticket" aria-label={`${tale.title.replace('\n', ' ')} — archive ticket`}>
      <div className="px-ticket__spine" aria-hidden="true">
        <span>
          {tale.year
            ? `TRACKSIDE RAILWAY ARCHIVE · №${tale.year}`
            : 'TRACKSIDE RAILWAY ARCHIVE'}
        </span>
      </div>
      <div className="px-ticket__inner">
        {tale.year && (
          <div className="px-ticket__year-ghost" aria-hidden="true">{tale.year}</div>
        )}
        <div className="px-ticket__topline">
          {onBack ? (
            <button type="button" className="px-act px-act--quiet" onClick={onBack} style={{ paddingLeft: 0 }}>
              ← BACK TO TALES
            </button>
          ) : <span />}
          <span style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {plates}
          </span>
        </div>
        <span className="px-ticket__label">{tale.chapter}</span>
        <div className="px-ticket__body">
          <div style={{ minWidth: 0 }}>
            <h1
              className="px-ticket__title"
              dangerouslySetInnerHTML={{ __html: tale.title.replace('\n', '<br>') }}
            />
          </div>
          {showCan && tale.image && (
            <div className="px-ticket__can">
              <img
                src={tale.image}
                alt={tale.name}
                onError={(e) => {
                  const parent = e.currentTarget.parentElement;
                  if (parent) parent.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
        {buildHeroMeta(tale) && (
          <div className="px-ticket__meta">{buildHeroMeta(tale)}</div>
        )}
      </div>
    </section>
  );
}

export function TaleDetailPage({ previewTale, previewMode = false }: TaleDetailPageProps = {}) {
  const { state, awardGameBadge, nav, guestId, liveTapSlugs } = useApp();
  const tale = previewTale ?? state.currentTale;
  const [showGame, setShowGame] = useState(false);

  if (!tale) return null;

  // Preview renders the unlocked layout without persisting anything.
  const isUnlocked   = previewMode || state.unlocked.has(tale.id);
  const hasScanBadge = !previewMode && state.scanBadges.has(tale.id);
  const hasGameBadge = !previewMode && state.gameBadges.has(tale.id);
  const gameConfig   = getGameConfig(tale.id);
  const collected    = previewMode ? undefined : state.collectedDates[tale.id];

  const handleBadgeAwarded = (_badgeKey: string) => awardGameBadge(tale.id);

  const availabilityLabel = deriveTaleAvailabilityLabel(tale, liveTapSlugs);
  const isLiveOnTap    = availabilityLabel === 'ON TAP';
  const editorialLabel = isLiveOnTap ? null : availabilityLabel;

  // ── Sealed state ───────────────────────────────────────────────────────
  if (!isUnlocked) {
    return (
      <div className="page active px-screen" id="page-story">
        <TicketHero
          tale={tale}
          onBack={() => nav('tales')}
          showCan={false}
          plates={
            <>
              {isLiveOnTap && <StatusPlate tone="live">ON TAP</StatusPlate>}
              <StatusPlate tone="sealed">SEALED</StatusPlate>
            </>
          }
        />
        <div className="px-wrap" style={{ marginTop: '1rem' }}>
          <IronPanel>
            <div className="px-sealed">
              <div className="px-sealed__stamp" aria-hidden="true"><TsIcon icon="locked-seal" /></div>
              <h2 className="px-sealed__title">THIS TALE IS STILL SEALED.</h2>
              <p className="px-sealed__copy">
                Scan this Trackside Tale at The Wooden Match to unlock the
                story, stamp your Passport, and play the mini-game.
              </p>
              <PrimaryAction onClick={() => nav('scan')} ariaLabel="Start scanning">
                ⌗ START SCANNING
              </PrimaryAction>
            </div>
          </IronPanel>
        </div>
      </div>
    );
  }

  // ── Unlocked state ─────────────────────────────────────────────────────
  // P.15c: the game CTA is always unavailable in preview mode.
  const gameEnabled =
    !previewMode && (
      tale.id === 'wa-lager'
      || tale.id === 'packer-pils'
      || tale.id === 'wooden-match'
    );
  const showAsEarned     = hasGameBadge;
  const showAsActive     = gameEnabled && !hasGameBadge;
  const showAsComingSoon = !gameEnabled && !hasGameBadge;
  const totalMarks       = (hasScanBadge ? 1 : 0) + (hasGameBadge ? 1 : 0);

  // Lifecycle/persistence metadata strip (editorial only — ON TAP is a
  // hero plate). Omitted entirely when empty.
  const storyMetaFragments: string[] = [];
  if (editorialLabel) storyMetaFragments.push(editorialLabel);
  if (collected) storyMetaFragments.push(`COLLECTED ${formatDate(collected).toUpperCase()}`);
  if (tale.retiredDate) storyMetaFragments.push(`RETIRED ${formatDate(tale.retiredDate).toUpperCase()}`);
  const storyMetaText = storyMetaFragments.join(' · ');

  const hasPersonHeading = tale.person.name.trim().length > 0;
  const hasPersonDates   = tale.person.dates.trim().length > 0;
  const hasPersonBio     = tale.personBio.trim().length > 0;
  const factRows = [
    { label: 'WHO',      value: tale.barSummary?.who ?? '' },
    { label: 'WHY HERE', value: tale.barSummary?.why ?? '' },
    { label: 'THE BEER', value: tale.barSummary?.beer ?? '' },
  ].filter((fact) => fact.value.trim().length > 0);
  const hasSummaryContent =
    hasPersonHeading || hasPersonBio || factRows.length > 0;

  return (
    <div className="page active px-screen" id="page-story">

      <TicketHero
        tale={tale}
        onBack={previewMode ? undefined : () => nav('tales')}
        showCan
        plates={
          <>
            {isLiveOnTap && <StatusPlate tone="live">ON TAP</StatusPlate>}
            <StatusPlate tone={hasScanBadge ? 'unlocked' : 'sealed'}>
              {hasScanBadge ? 'UNLOCKED' : 'SEALED'}
            </StatusPlate>
          </>
        }
      />

      <div className="px-wrap px-stack" style={{ marginTop: '1rem' }}>

        {/* ── Dossier ── */}
        {hasSummaryContent && (
          <IronPanel>
            <div className="px-dossier">
              <div className="px-dossier__head">
                {tale.image && (
                  <div className="px-dossier__portrait" aria-hidden="true">
                    <img src={tale.image} alt="" />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  {hasPersonHeading && (
                    <h2 className="px-dossier__name">{tale.person.name}</h2>
                  )}
                  {hasPersonDates && (
                    <div className="px-dossier__dates">{tale.person.dates}</div>
                  )}
                  {hasPersonBio && (
                    <p className="px-dossier__bio">{tale.personBio}</p>
                  )}
                </div>
              </div>
              {factRows.length > 0 && (
                <div>
                  {factRows.map((fact) => (
                    <div key={fact.label} className="px-fact">
                      <span className="px-fact__lbl">{fact.label}</span>
                      <span className="px-fact__txt">{fact.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </IronPanel>
        )}

        {/* ── Story — quiet reading band, no border-in-border ── */}
        <SectionRail label="The Story" />
        <div className="px-story-band px-reading">
          <article className="px-story" aria-label="Tale story">
            {storyMetaText && (
              <div className="px-panel__meta" style={{ marginBottom: '0.7rem' }}>
                {storyMetaText}
              </div>
            )}
            <div className="px-story__body">
              {tale.story.map((block, i) => {
                if (block.type === 'quote') {
                  return (
                    <blockquote key={i} className="px-story__quote">
                      <span>"{block.text}"</span>
                      {block.cite && <cite>{block.cite}</cite>}
                    </blockquote>
                  );
                }
                return (
                  <p key={i} dangerouslySetInnerHTML={{ __html: block.text || '' }} />
                );
              })}
            </div>
          </article>
        </div>

        {/* ── Map ── */}
        {tale.pins.length > 0 && (
          <IronPanel
            eyebrow={tale.mapTitle}
          >
            <div className="px-map" aria-label={tale.mapTitle}>
              <div className="px-map__canvas">
                {tale.pins.slice(0, 4).map((pin) => (
                  <div
                    key={pin.label}
                    className="px-map__pin"
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  >
                    <span className="px-map__pin-dot" aria-hidden="true" />
                    <span className="px-map__pin-label">{pin.label}</span>
                  </div>
                ))}
              </div>
              <div className="px-map__foot">
                {tale.year ? `${tale.year} GRID REFERENCE` : 'GRID REFERENCE'}
              </div>
            </div>
          </IronPanel>
        )}

        {/* ── Timeline rail ── */}
        {tale.timeline && tale.timeline.length > 0 && (
          <>
            <SectionRail label="A Life in the Valley" />
            <div className="px-timeline" aria-label="Historical timeline">
              <div className="px-timeline__track">
                {tale.timeline.map((ev, i) => (
                  <div
                    key={i}
                    className={`px-timeline__node${ev.major ? ' px-timeline__node--major' : ''}`}
                  >
                    <div className="px-timeline__medallion" aria-hidden="true">
                      <TsIcon icon={timelineIcon(ev.event)} />
                    </div>
                    <div className="px-timeline__year">{ev.year}</div>
                    <div className="px-timeline__event">{ev.event}</div>
                    {ev.detail && <div className="px-timeline__detail">{ev.detail}</div>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Badge + interactive challenge ── */}
        <div className="px-climax">
        <IronPanel
          featured
          eyebrow="Interactive Challenge"
          title={showAsComingSoon ? 'CHALLENGE COMING SOON' : tale.game.title}
          copy={
            showAsEarned
              ? 'Both stamps are in your Trackside Passport. This Tale is fully collected.'
              : showAsActive
                ? 'Complete the short challenge to earn the second stamp for this Tale.'
                : "This Tale's challenge is on the way."
          }
          actions={
            <>
              <PrimaryAction
                onClick={() => !showAsComingSoon && setShowGame(true)}
                disabled={showAsComingSoon}
                ariaLabel={showAsEarned ? 'Replay mini-game' : 'Play mini-game'}
              >
                {showAsEarned && '↻ REPLAY MINI-GAME'}
                {showAsActive && '▶ PLAY MINI-GAME'}
                {showAsComingSoon && 'MINI-GAME COMING SOON'}
              </PrimaryAction>
              {!previewMode && (
                <SecondaryAction onClick={() => nav('passport')} ariaLabel="View passport">
                  ◈ VIEW PASSPORT
                </SecondaryAction>
              )}
            </>
          }
        >
          <div className="px-badge-plate" style={{ marginTop: '0.8rem' }}>
            <div
              className={`px-badge-plate__medallion${hasScanBadge ? '' : ' px-badge-plate__medallion--locked'}`}
              aria-hidden="true"
            >
              <span className="glyph">◈</span>
              {tale.year && <span className="yr">{tale.year}</span>}
            </div>
            <div className="px-badge-plate__info">
              <div className="px-badge-plate__count">BADGE {totalMarks} OF 2</div>
              <h3 className="px-badge-plate__title">{tale.scanBadge.title}</h3>
            </div>
          </div>
        </IronPanel>
        </div>

      </div>

      {showGame && gameConfig && (
        <GameOverlay
          config={gameConfig}
          onClose={() => setShowGame(false)}
          onBadgeAwarded={handleBadgeAwarded}
          alreadyEarned={hasGameBadge}
          successBadgeIcon={tale.gameBadge.icon}
          successBadgeTitle={tale.gameBadge.title}
          guestId={guestId}
        />
      )}

    </div>
  );
}
