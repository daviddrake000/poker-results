import { Link } from 'react-router-dom';
import { useTitle } from '../ui/title';

export function NotFound({ what = 'page' }: { what?: string }) {
  useTitle('Not found');
  return (
    <div className="card notice">
      <div className="notice-title">No such {what}</div>
      <p>It may have been removed, or the link is wrong.</p>
      <Link to="/" className="btn">
        Go to standings
      </Link>
    </div>
  );
}
