import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';

const AdminApp = lazy(() => import('../admin/AdminApp'));

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <CircularProgress />
        </Box>
      }
    >
      <AdminApp />
    </Suspense>
  );
}
