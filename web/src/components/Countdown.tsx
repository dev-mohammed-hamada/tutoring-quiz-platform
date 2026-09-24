import { useEffect, useRef, useState } from 'react';

/**
 * Display only. The server decides when the attempt ends; this measures elapsed
 * local time from the moment the page learned the server's clock, so a skewed
 * device clock cannot buy or lose time (spec §6).
 */
export function Countdown({ expiresAt, serverNow, onExpire }:
  { expiresAt: string; serverNow: string; onExpire: () => void }) {
  const totalMs = new Date(expiresAt).getTime() - new Date(serverNow).getTime();
  const mountedAt = useRef(Date.now());
  const fired = useRef(false);
  const [remaining, setRemaining] = useState(Math.max(0, totalMs));

  // onExpire is read through a ref so a caller that passes a fresh closure each
  // render does not tear down and restart the interval on every tick.
  const expire = useRef(onExpire);
  expire.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, totalMs - (Date.now() - mountedAt.current));
      setRemaining(left);
      if (left === 0 && !fired.current) { fired.current = true; expire.current(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [totalMs]);

  const s = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  // aria-live is off: a timer announcing itself every second would make a screen
  // reader unusable. The remaining time is on demand, and expiry is announced by
  // the page that owns it.
  return <span role="timer" aria-live="off" className="countdown">{mm}:{ss}</span>;
}
