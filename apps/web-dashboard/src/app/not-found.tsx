import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="login-card card">
        <div className="eyebrow">404</div>
        <h1>That page does not exist</h1>
        <p className="muted small" style={{ margin: '10px 0 20px' }}>
          The link may be stale, or the preview slug was never built. Nothing was changed.
        </p>
        <Link className="btn btn-primary" href="/">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
