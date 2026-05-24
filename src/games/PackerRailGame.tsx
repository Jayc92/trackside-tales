import React, { useCallback, useEffect, useRef, useState } from 'react';

// ================== PACKER RAIL SPIKE GAME ==================
// Tap each spike as it slides across before it leaves the rail.
// Land 8 of 12 to complete.
// v4.6.1 guards preserved: completed, winFired, quizShowing.

const TOTAL_SPIKES  = 12;
const NEEDED_SPIKES = 8;
const SPIKE_DURATION_MS = 2000;  // time each spike is on screen
const SPIKE_INTERVAL_MS = 1800;  // time between spike appearances

interface Spike {
  id: number;
  position: number;  // 0-100 start position percentage
  hit: boolean;
  missed: boolean;
}

interface PackerRailGameProps {
  onWin: () => void;
  onLose: () => void;
  quizShowing: boolean;
}

export function PackerRailGame({ onWin, onLose, quizShowing }: PackerRailGameProps) {
  const [spikes, setSpikes] = useState<Spike[]>([]);
  const [hit, setHit]       = useState(0);
  const [missed, setMissed] = useState(0);
  const [total, setTotal]   = useState(0);

  const completedRef = useRef(false);
  const winFiredRef  = useRef(false);
  const spikeIdRef   = useRef(0);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const triggerWin = useCallback(() => {
    if (winFiredRef.current) return;
    winFiredRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onWin();
  }, [onWin]);

  const triggerLose = useCallback(() => {
    if (completedRef.current || quizShowing || winFiredRef.current) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onLose();
  }, [quizShowing, onLose]);

  const spawnSpike = useCallback(() => {
    if (completedRef.current || winFiredRef.current || quizShowing) return;
    const id = ++spikeIdRef.current;
    const newSpike: Spike = { id, position: 0, hit: false, missed: false };
    setSpikes((prev) => [...prev.slice(-5), newSpike]);
    setTotal((t) => {
      const next = t + 1;
      // Schedule auto-miss
      setTimeout(() => {
        if (completedRef.current || winFiredRef.current) return;
        setSpikes((prev) => prev.map((s) => s.id === id ? { ...s, missed: true } : s));
        setMissed((m) => {
          const newMissed = m + 1;
          const hitCount = TOTAL_SPIKES - next - newMissed; // estimate
          // If mathematically impossible to reach NEEDED_SPIKES
          if (next >= TOTAL_SPIKES) {
            const remaining = TOTAL_SPIKES - next;
            // Actually check after we know this spike was missed
          }
          return newMissed;
        });
      }, SPIKE_DURATION_MS);
      return next;
    });
  }, [quizShowing]);

  // Check win/lose after each hit or miss
  useEffect(() => {
    if (completedRef.current || winFiredRef.current) return;
    if (hit >= NEEDED_SPIKES) {
      completedRef.current = true;
      triggerWin();
    } else if (total >= TOTAL_SPIKES) {
      // All spikes shown — check final result
      setTimeout(() => {
        if (hit < NEEDED_SPIKES) triggerLose();
      }, SPIKE_DURATION_MS + 200);
    }
  }, [hit, missed, total, triggerWin, triggerLose]);

  // Spawn spikes on an interval
  useEffect(() => {
    intervalRef.current = setInterval(spawnSpike, SPIKE_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [spawnSpike]);

  const handleSpikeHit = useCallback((id: number) => {
    if (completedRef.current || winFiredRef.current || quizShowing) return;
    setSpikes((prev) => prev.map((s) => s.id === id ? { ...s, hit: true } : s));
    setHit((h) => h + 1);
  }, [quizShowing]);

  return (
    <div className="game-content game-packer">
      <div className="packer-score">
        <span className="packer-hit">{hit}</span>
        <span className="packer-sep">/</span>
        <span className="packer-need">{NEEDED_SPIKES}</span>
        <span className="packer-label"> spikes driven</span>
      </div>

      <div className="packer-rail-track" aria-label="Rail spike track">
        <div className="packer-rail packer-rail-top" />
        <div className="packer-rail packer-rail-bottom" />

        {spikes.map((spike) => (
          !spike.hit && !spike.missed && (
            <button
              key={spike.id}
              className="packer-spike"
              onClick={() => handleSpikeHit(spike.id)}
              aria-label="Drive spike"
              style={{
                animation: `spike-slide ${SPIKE_DURATION_MS}ms linear forwards`,
              }}
            />
          )
        ))}
      </div>

      <div className="packer-progress">
        {Array.from({ length: TOTAL_SPIKES }, (_, i) => (
          <div
            key={i}
            className={[
              'packer-pip',
              i < hit    ? 'hit'    : '',
              i < missed ? 'missed' : '',
            ].filter(Boolean).join(' ')}
          />
        ))}
      </div>
    </div>
  );
}
