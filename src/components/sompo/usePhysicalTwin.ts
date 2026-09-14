import { useEffect, useMemo, useRef, useState } from 'react';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { currentSompoTelemetry } from '../../../shared/sompo-telemetry.js';
import { appendPhysicalFrame, physicalInteractionState, physicalReplayFrame, SOMPO_CARGO_LIMITS, type PhysicalFrame, type SompoCargoLimits } from '../../../shared/sompo-physical-interactions.js';

export interface PhysicalEvent { id: number; label: string; frames: PhysicalFrame[]; at: number }
export function usePhysicalTwin(telemetry: SompoTelemetrySnapshot | null | undefined, enabled: boolean) {
  const [limits, setLimits] = useState<SompoCargoLimits>({ ...SOMPO_CARGO_LIMITS });
  const [cargoView, setCargoView] = useState(false);
  const [motion, setMotion] = useState(true);
  const [events, setEvents] = useState<PhysicalEvent[]>([]);
  const [recording, setRecording] = useState(false);
  const [replay, setReplay] = useState<PhysicalEvent | null>(null);
  const [offset, setOffset] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const history = useRef<PhysicalFrame[]>([]);
  const latest = useRef<PhysicalFrame | null>(null);
  const pending = useRef<PhysicalEvent | null>(null);
  const identity = useRef('');
  const lastTrigger = useRef(-Infinity);
  const liveTelemetry = useMemo(() => currentSompoTelemetry(telemetry, clock), [telemetry, clock]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => setClock(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !telemetry) return;
    const key = `${telemetry.tractorId}:${telemetry.deviceTimestamp}:${telemetry.changedAt}`;
    if (identity.current === key) return;
    identity.current = key;
    const now = Date.now();
    if (latest.current && (latest.current.snapshot.tractorId !== telemetry.tractorId
      || (telemetry.deviceTimestamp ?? 0) < (latest.current.snapshot.deviceTimestamp ?? 0))) {
      history.current = []; latest.current = null; pending.current = null;
      setEvents([]); setReplay(null); setRecording(false);
    }
    const effects = physicalInteractionState(currentSompoTelemetry(telemetry, now), latest.current?.snapshot, limits);
    if (!effects.live) return;
    const frame = { at: now, snapshot: telemetry, effects };
    const previousLabels = latest.current?.effects.labels ?? [];
    history.current = appendPhysicalFrame(history.current, frame);
    latest.current = frame;
    const entered = effects.labels.filter(label => !previousLabels.includes(label));
    if (entered.length && !pending.current && now - lastTrigger.current >= 5000) {
      pending.current = { id: now, at: now, label: entered.join(' · '), frames: history.current.filter(item => item.at >= now - 8000) };
      lastTrigger.current = now;
      setRecording(true);
    } else if (pending.current) {
      pending.current.frames.push(frame);
    }
  }, [enabled, telemetry, limits]);

  useEffect(() => {
    const event = pending.current;
    if (!event || clock < event.at + 4000) return;
    setEvents(previous => [event, ...previous].slice(0, 5));
    pending.current = null;
    setRecording(false);
  }, [clock]);

  const duration = replay ? Math.max(0, replay.frames[replay.frames.length - 1].at - replay.frames[0].at) : 0;
  useEffect(() => {
    if (!replay || !playing) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = document.hidden ? 0 : Math.min(250, now - previous) * 0.5;
      previous = now;
      setOffset(value => Math.min(duration, value + elapsed));
    }, 50);
    return () => window.clearInterval(timer);
  }, [replay, playing, duration]);
  useEffect(() => { if (replay && offset >= duration) setPlaying(false); }, [offset, duration, replay]);

  const frame = replay ? physicalReplayFrame(replay.frames, offset) : null;
  const effects = frame?.effects ?? physicalInteractionState(liveTelemetry, null, limits);
  // Keep a measured impulse briefly visible, but never repeat it for a stale feed.
  if (!frame && effects.live && latest.current && clock - latest.current.at < 650) {
    effects.shock = latest.current.effects.shock;
    if (effects.shock > .15) {
      effects.labels.push('Movimento brusco');
      if (effects.severity === 'clear') effects.severity = 'attention';
    }
  }
  const visual = useRef({ effects, cargoView, motion, replay: false, replayTime: 0, replayId: 0 });
  visual.current = { effects, cargoView, motion, replay: !!replay, replayTime: offset, replayId: replay?.id ?? 0 };
  return { snapshot: frame?.snapshot ?? liveTelemetry, effects, visual, limits, setLimits,
    cargoView, setCargoView, motion, setMotion, events, recording, replay, offset, duration, playing,
    startReplay(event: PhysicalEvent) { setReplay(event); setOffset(0); setPlaying(true); },
    toggleReplay() { if (offset >= duration) setOffset(0); setPlaying(value => !value); },
    exitReplay() { setReplay(null); setPlaying(false); setOffset(0); },
  };
}
export type PhysicalTwin = ReturnType<typeof usePhysicalTwin>;
