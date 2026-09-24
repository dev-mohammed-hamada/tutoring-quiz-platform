import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Countdown } from '../src/components/Countdown';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Countdown', () => {
  it('counts down from the server-provided remaining time, ignoring a skewed device clock', () => {
    // Device clock is an hour behind the server. Remaining must still read 20:00.
    const serverNow = '2026-09-24T10:00:00Z';
    const expiresAt = '2026-09-24T10:20:00Z';
    vi.setSystemTime(new Date('2026-09-24T09:00:00Z'));
    render(<Countdown expiresAt={expiresAt} serverNow={serverNow} onExpire={() => {}} />);
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');
  });

  it('ticks down once a second', () => {
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T10:00:10Z" serverNow="2026-09-24T10:00:00Z" onExpire={() => {}} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('timer')).toHaveTextContent('00:07');
  });

  it('fires onExpire exactly once when it reaches zero', () => {
    const onExpire = vi.fn();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T10:00:02Z" serverNow="2026-09-24T10:00:00Z" onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
  });

  it('never renders a negative time', () => {
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T09:59:00Z" serverNow="2026-09-24T10:00:00Z" onExpire={() => {}} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
  });
});
