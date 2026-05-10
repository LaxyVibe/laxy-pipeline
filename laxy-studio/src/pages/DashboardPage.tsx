// ---------------------------------------------------------------------------
// DashboardPage — Guide list + "New Guide" button
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import { useNavigate } from 'react-router-dom';
import { useGuidesStore } from '../guidesStore';
import { ROUTES, guidePath } from '../routes';
import type { GuideListItem } from '../types/guide';

/**
 * Dashboard shows all guides owned by the current user.
 * For Phase 1 it reads from the local Zustand store.
 * When Firestore is wired up, replace with `useFirestore` queries.
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const guideId = useGuidesStore((s) => s.guideId);
  const venueName = useGuidesStore((s) => s.entityConfig.venueName);
  const lastSavedAt = useGuidesStore((s) => s.lastSavedAt);

  // Build a minimal list from local store (single guide for now)
  const guides: GuideListItem[] = guideId
    ? [
        {
          id: guideId,
          title: venueName || 'Untitled Guide',
          status: 'draft',
          updatedAt: lastSavedAt ?? Date.now(),
          spotCount: useGuidesStore.getState().spots.length,
        },
      ]
    : [];

  // Context menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuGuideId, setMenuGuideId] = useState<string | null>(null);

  const handleNewGuide = () => {
    // Reset store for a fresh guide and navigate
    const s = useGuidesStore.getState();
    s.resetEntityConfig();
    s.resetIngestion();
    s.resetScripts();
    s.resetTranslations();
    s.resetAudio();
    s.resetPublish();
    s.clearAssets();
    navigate(guidePath('new', 'entity-config'));
  };

  const handleOpenGuide = (id: string) => {
    navigate(guidePath(id, 'entity-config'));
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, id: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuGuideId(id);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuGuideId(null);
  };

  const handleDelete = () => {
    if (menuGuideId) {
      const s = useGuidesStore.getState();
      s.resetEntityConfig();
      s.resetIngestion();
      s.resetScripts();
      s.resetTranslations();
      s.resetAudio();
      s.resetPublish();
      s.clearAssets();
    }
    handleMenuClose();
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4">My Guides</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<HeadphonesIcon />} onClick={() => navigate(ROUTES.tts)}>
            TTS
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewGuide}>
            New Guide
          </Button>
        </Box>
      </Box>

      {guides.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No guides yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create your first audio guide to get started.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleNewGuide}>
            Create Guide
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {guides.map((guide) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={guide.id}>
              <Card>
                <CardActionArea onClick={() => handleOpenGuide(guide.id)}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="h6" noWrap sx={{ flex: 1 }}>
                        {guide.title}
                      </Typography>
                      <Tooltip title="Options">
                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, guide.id)}>
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <Chip
                        label={guide.status}
                        size="small"
                        color={guide.status === 'published' ? 'success' : 'default'}
                      />
                      <Chip label={`${guide.spotCount} spots`} size="small" variant="outlined" />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Updated {new Date(guide.updatedAt).toLocaleDateString()}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}>
        <MenuItem onClick={handleMenuClose}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} /> Duplicate
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
        </MenuItem>
      </Menu>
    </Container>
  );
}
