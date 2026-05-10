import { Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../routes';

export default function AudioMvp2Page() {
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: ROUTES.audioDirector,
        search: location.search,
      }}
      replace
    />
  );
}
