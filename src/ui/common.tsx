import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCents, formatSignedCents, netTone } from '../lib/money';
import { describePayment, type SettlementResult } from '../lib/settlement';
import { describeDifference } from '../lib/sheet';
import type { GameStatus } from '../data/types';

/** A net amount: green when up, red when down. */
export function Net({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`num ${netTone(cents)} ${className}`}>{formatSignedCents(cents)}</span>;
}

/** A plain amount (buy-ins, pots, payments). */
export function Amount({ cents, className = '' }: { cents: number; className?: string }) {
  return <span className={`num ${className}`}>{formatCents(cents)}</span>;
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && (
        <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <div className="notice-title">{title}</div>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: GameStatus }) {
  return <span className={`badge ${status}`}>{status === 'final' ? 'Final' : 'Draft'}</span>;
}

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand">
      <span aria-hidden="true">PKR//NIGHT</span>
      <span className="sr-only">Poker Night</span>
    </Link>
  );
}

/** The settlement plan as plain sentences, or why there isn't one. */
export function SettlementPlan({ result }: { result: SettlementResult }) {
  if (!result.ok) {
    return (
      <div className="info-box">
        {result.reason === 'unbalanced'
          ? `No settlement yet: ${describeDifference(result.offByCents).toLowerCase()}.`
          : `No settlement: ${result.message}.`}
      </div>
    );
  }
  if (result.payments.length === 0) {
    return <div className="card empty">Everyone broke even. Nobody owes anything.</div>;
  }
  return (
    <ul className="payments">
      {result.payments.map((p, i) => (
        <li key={i} className="card payment" aria-label={describePayment(p)}>
          <span>
            <span className="loss">{p.from}</span> <span className="pays">pays</span>{' '}
            <span className="win">{p.to}</span>
          </span>
          <Amount cents={p.cents} />
        </li>
      ))}
    </ul>
  );
}
