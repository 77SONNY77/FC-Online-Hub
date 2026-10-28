'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { mutationResponse, stateSchema, type PlaygroundState } from '@/contracts/playground';

type Pending = { path: string; key: string; body: Record<string, unknown> };
type Context = {
  state: PlaygroundState | null; busy: boolean; error: string | null;
  refresh: () => Promise<void>;
  apply: (value: PlaygroundState) => void;
  run: (path: string, input: Record<string, unknown>) => Promise<boolean>;
};
const PlaygroundContext = createContext<Context | null>(null);
const PENDING_KEY = 'fclab-pending-request';
let bootstrapFlight: Promise<PlaygroundState> | null = null;
async function bootstrap() {
  if (!bootstrapFlight) {
    const start = async () => {
      const response = await fetch('/api/playground', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('보유 FC를 불러오지 못했습니다.');
      const raw = await response.json();
      if (raw.fresh) { try { sessionStorage.removeItem(PENDING_KEY); } catch {} }
      return stateSchema.parse(raw);
    };
    bootstrapFlight = (async () => {
      if (navigator.locks) return await navigator.locks.request('fclab-initialize', start);
      return start();
    })().finally(() => { bootstrapFlight = null; });
  }
  return bootstrapFlight;
}
export function PlaygroundProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlaygroundState | null>(null);
  const stateRef = useRef<PlaygroundState | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef<Pending | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const channel = useRef<BroadcastChannel | null>(null);
  const apply = useCallback((value: PlaygroundState) => {
    if (!stateRef.current || value.revision >= stateRef.current.revision) { stateRef.current = value; setState(value); }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/wallet', { cache: 'no-store' });
      if (response.status === 419) {
        pending.current = null; setUncertain(false);
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
        const value = await bootstrap();
        stateRef.current = value; setState(value);
      } else {
        if (!response.ok) throw new Error('보유 FC를 불러오지 못했습니다.');
        apply(stateSchema.parse(await response.json()));
      }
      setError(null);
    } catch { setError('보유 FC를 불러오지 못했습니다. 다시 시도해 주세요.'); }
  }, [apply]);
  useEffect(() => {
    let live = true;
    void bootstrap().then(value => {
      if (!live) return;
      apply(value);
      try {
        const saved = sessionStorage.getItem(PENDING_KEY);
        if (saved) {
          const data = JSON.parse(saved) as Pending;
          if (['/api/fc/charges', '/api/purchases', '/api/playground/reset'].includes(data.path) && typeof data.key === 'string' && data.body) { pending.current = data; setUncertain(true); setError('완료 여부를 확인하지 못한 요청이 있습니다. 같은 요청의 결과를 확인해 주세요.'); }
        }
      } catch { try { sessionStorage.removeItem(PENDING_KEY); } catch {} }
    }).catch(() => { if (live) setError('보유 FC를 불러오지 못했습니다. 다시 시도해 주세요.'); });
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fclab-balance') : null;
    channel.current = bc;
    if (bc) bc.onmessage = () => { void refresh(); };
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { live = false; bc?.close(); channel.current = null; window.removeEventListener('focus', onFocus); };
  }, [apply, refresh]);
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 4500);
    return () => clearTimeout(timer);
  }, [feedback]);
  const send = async (request: Pending): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(null);
    pending.current = request;
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(request)); } catch { /* Cookie + server persistence still work when browser storage is unavailable. */ }
    try {
      const response = await fetch(request.path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': request.key }, body: JSON.stringify(request.body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw new Error('UNCERTAIN');
        pending.current = null; try { sessionStorage.removeItem(PENDING_KEY); } catch {} setUncertain(false);
        await refresh();
        setError(data.error?.message ?? '요청을 처리하지 못했습니다.');
        return false;
      }
      const result = mutationResponse.parse(data);
      apply(result.state);
      pending.current = null; try { sessionStorage.removeItem(PENDING_KEY); } catch {} setUncertain(false);
      channel.current?.postMessage('updated');
      const amount = BigInt(result.receipt.amount).toLocaleString('ko-KR');
      setFeedback(result.replayed ? '이미 처리된 요청을 확인했습니다. 중복 지급되지 않았습니다.' : result.receipt.kind === 'CHARGE' ? `${amount} FC가 충전되었습니다.` : result.receipt.kind === 'PURCHASE' ? '구매 완료! 구성품을 인벤토리에 지급했습니다.' : 'FC와 인벤토리를 초기화했습니다.');
      return true;
    } catch {
      setUncertain(true);
      setError('처리 결과를 확인하지 못했습니다. 아래에서 같은 요청의 결과를 확인해 주세요.');
      return false;
    } finally {
      // Keep the control disabled through the second event of a rapid double-click.
      await new Promise(resolve => setTimeout(resolve, 300));
      busyRef.current = false; setBusy(false);
    }
  };
  const run = async (path: string, input: Record<string, unknown>) => {
    if (!stateRef.current || busyRef.current || pending.current) return false;
    return send({ path, key: crypto.randomUUID(), body: { ...input, epoch: stateRef.current.epoch } });
  };
  return <PlaygroundContext.Provider value={{ state, busy: busy || uncertain, error, refresh, apply, run }}>
    {children}
    {(error || uncertain) && <div className="play-error" role="alert"><p>{error ?? '완료 여부를 확인하지 못한 요청이 있습니다. 같은 요청의 결과를 확인해 주세요.'}</p>{uncertain ? <button disabled={busy} onClick={() => pending.current && void send(pending.current)}>처리 결과 다시 확인</button> : <button disabled={busy} onClick={() => void refresh()}>잔액 다시 불러오기</button>}</div>}
    <div className={`toast ${feedback ? 'visible' : ''}`} role="status" aria-live="polite">{feedback}</div>
  </PlaygroundContext.Provider>;
}
export function usePlayground() {
  const context = useContext(PlaygroundContext);
  if (!context) throw new Error('PlaygroundProvider required');
  return context;
}
export function fc(value: string | bigint) { return `${BigInt(value).toLocaleString('ko-KR')} FC`; }
