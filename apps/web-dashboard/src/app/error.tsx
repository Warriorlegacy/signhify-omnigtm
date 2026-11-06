'use client';

import { useEffect } from 'react';

/**
 * The route-level boundary. It shows the request id-free message on purpose:
 * the full error is already in the server log, and a production operator can
 * read it there without exposing internals on screen.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('dashboard route error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="eyebrow">Something broke</div>
        <h1>This view could not load</h1>
        <p className="muted small" style={{ margin: '10px 0 20px' }}>
          Nothing was sent or published. Retry the view; if it keeps failing, the server log has the full error
          {error.digest ? ` (digest ${error.digest})` : ''}.
        </p>
        <button className="btn btn-primary" type="button" onClick={reset}>
          Retry this view
        </button>
      </div>
    </div>
  );
}
