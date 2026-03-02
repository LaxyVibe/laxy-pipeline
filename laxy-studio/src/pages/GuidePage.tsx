// ---------------------------------------------------------------------------
// GuidePage — Wizard host page (route: /guides/:id)
// ---------------------------------------------------------------------------
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Container } from '@mui/material';
import WizardShell from '../components/wizard/WizardShell';
import { useAutosave } from '../hooks/useAutosave';
import { useGuidesStore } from '../guidesStore';

/**
 * Hosts the Guide Wizard inside a routed page.
 * Loads the guide by ID from the store (later Firestore) and
 * activates auto-save while the wizard is open.
 */
export default function GuidePage() {
  const { id } = useParams<{ id: string }>();
  const guideId = useGuidesStore((s) => s.guideId);

  // If opening a specific guide ID that differs from current, load it.
  // For Phase 1 there's only one guide in localStorage, so this is a stub.
  useEffect(() => {
    if (id && id !== 'new' && id !== guideId) {
      // TODO: load guide from Firestore by id
      // For now, the local store already has the latest draft.
    }
  }, [id, guideId]);

  // Auto-save while wizard is mounted
  useAutosave();

  return (
    <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
      <WizardShell />
    </Container>
  );
}
