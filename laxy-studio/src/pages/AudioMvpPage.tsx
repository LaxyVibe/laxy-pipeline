import { Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../routes';

export default function AudioMvpPage() {
  const location = useLocation();

  return (
    <Navigate
      to={{
        pathname: ROUTES.tts,
        search: location.search,
      }}
      replace
    />
  );
}
