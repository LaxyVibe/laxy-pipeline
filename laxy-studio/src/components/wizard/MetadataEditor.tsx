// ---------------------------------------------------------------------------
// MetadataEditor — editable metadata table with drag-and-drop reorder
// ---------------------------------------------------------------------------
import { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  alpha,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useGuidesStore } from '../../guidesStore';
import type { SpotMetadata } from '../../types/entity';

// ── Editable fields config ──

const EDITABLE_FIELDS: { key: keyof SpotMetadata; label: string; minWidth: number }[] = [
  { key: 'title', label: 'Title', minWidth: 180 },
  { key: 'artist', label: 'Artist / Creator', minWidth: 140 },
  { key: 'period', label: 'Period / Era', minWidth: 120 },
  { key: 'material', label: 'Material', minWidth: 120 },
  { key: 'dimensions', label: 'Dimensions', minWidth: 100 },
  { key: 'highlight', label: 'Highlight', minWidth: 160 },
  { key: 'culturalDesignation', label: 'Cultural Designation', minWidth: 150 },
];

// ── Sortable Row ──

interface SortableRowProps {
  spot: SpotMetadata;
  onFieldChange: (id: string, key: keyof SpotMetadata, value: string) => void;
  onDelete: (id: string) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}

function SortableRow({ spot, onFieldChange, onDelete, expandedId, onToggleExpand }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: spot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 10 : 'auto' as const,
  };

  const isExpanded = expandedId === spot.id;

  return (
    <>
      <TableRow ref={setNodeRef} style={style} hover>
        {/* Drag handle */}
        <TableCell sx={{ width: 40, p: 0.5, cursor: 'grab' }} {...attributes} {...listeners}>
          <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
        </TableCell>

        {/* Spot number */}
        <TableCell sx={{ width: 50, textAlign: 'center', fontWeight: 700 }}>
          <Chip label={spot.spotNumber} size="small" color="primary" variant="outlined" />
        </TableCell>

        {/* Editable fields — compact mode shows title + artist only */}
        <TableCell>
          <TextField
            value={spot.title}
            onChange={(e) => onFieldChange(spot.id, 'title', e.target.value)}
            variant="standard"
            fullWidth
            size="small"
            placeholder="Title"
            slotProps={{ input: { sx: { fontSize: '0.875rem' } } }}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={spot.artist}
            onChange={(e) => onFieldChange(spot.id, 'artist', e.target.value)}
            variant="standard"
            fullWidth
            size="small"
            placeholder="Artist"
            slotProps={{ input: { sx: { fontSize: '0.875rem' } } }}
          />
        </TableCell>
        <TableCell>
          <TextField
            value={spot.period}
            onChange={(e) => onFieldChange(spot.id, 'period', e.target.value)}
            variant="standard"
            fullWidth
            size="small"
            placeholder="Period"
            slotProps={{ input: { sx: { fontSize: '0.875rem' } } }}
          />
        </TableCell>

        {/* Expand / Collapse more fields */}
        <TableCell sx={{ width: 40, p: 0.5 }}>
          <Tooltip title={isExpanded ? 'Collapse' : 'More fields'}>
            <IconButton size="small" onClick={() => onToggleExpand(spot.id)}>
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </TableCell>

        {/* Delete */}
        <TableCell sx={{ width: 40, p: 0.5 }}>
          <Tooltip title="Remove spot">
            <IconButton size="small" color="error" onClick={() => onDelete(spot.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Expanded row — remaining fields */}
      <TableRow>
        <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? undefined : 'none' }}>
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 2,
                p: 2,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
              }}
            >
              {EDITABLE_FIELDS.filter((f) => !['title', 'artist', 'period'].includes(f.key)).map((field) => (
                <TextField
                  key={field.key}
                  label={field.label}
                  value={(spot[field.key] as string) ?? ''}
                  onChange={(e) => onFieldChange(spot.id, field.key, e.target.value)}
                  variant="outlined"
                  size="small"
                  fullWidth
                />
              ))}
              {spot.sourceText && (
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Typography variant="caption" color="text.secondary" gutterBottom>
                    Source Text (OCR)
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      maxHeight: 120,
                      overflow: 'auto',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {spot.sourceText}
                  </Paper>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ── MetadataEditor ──

export default function MetadataEditor() {
  const spots = useGuidesStore((s) => s.spots);
  const updateSpot = useGuidesStore((s) => s.updateSpot);
  const removeSpot = useGuidesStore((s) => s.removeSpot);
  const addSpot = useGuidesStore((s) => s.addSpot);
  const reorderSpots = useGuidesStore((s) => s.reorderSpots);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const spotIds = useMemo(() => spots.map((s) => s.id), [spots]);

  const handleFieldChange = useCallback(
    (id: string, key: keyof SpotMetadata, value: string) => {
      updateSpot(id, { [key]: value });
    },
    [updateSpot],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIdx = spotIds.indexOf(active.id as string);
        const newIdx = spotIds.indexOf(over.id as string);
        const newOrder = arrayMove(spotIds, oldIdx, newIdx);
        reorderSpots(newOrder);
      }
    },
    [spotIds, reorderSpots],
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDeleteRequest = (id: string) => {
    setDeleteConfirm(id);
  };

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      removeSpot(deleteConfirm);
      if (expandedId === deleteConfirm) setExpandedId(null);
      setDeleteConfirm(null);
    }
  };

  const handleAddSpot = () => {
    const nextNum = spots.length + 1;
    addSpot({
      id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      spotNumber: nextNum,
      title: '',
      artist: '',
      period: '',
      material: '',
      dimensions: '',
      highlight: '',
      culturalDesignation: '',
      assetIds: [],
    });
  };

  if (spots.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No metadata extracted yet.
        </Typography>
        <Button startIcon={<AddCircleOutlineIcon />} onClick={handleAddSpot}>
          Add Spot Manually
        </Button>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6">Extracted Metadata</Typography>
          <Chip label={`${spots.length} spots`} size="small" color="primary" variant="outlined" />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Drag rows to reorder. Click the chevron to edit more fields.">
            <IconButton size="small">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            startIcon={<AddCircleOutlineIcon />}
            onClick={handleAddSpot}
          >
            Add Spot
          </Button>
        </Box>
      </Box>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={spotIds} strategy={verticalListSortingStrategy}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell sx={{ width: 50, textAlign: 'center' }}>#</TableCell>
                  <TableCell sx={{ minWidth: 180 }}>Title</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Artist / Creator</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Period / Era</TableCell>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {spots.map((spot) => (
                  <SortableRow
                    key={spot.id}
                    spot={spot}
                    onFieldChange={handleFieldChange}
                    onDelete={handleDeleteRequest}
                    expandedId={expandedId}
                    onToggleExpand={handleToggleExpand}
                  />
                ))}
              </TableBody>
            </Table>
          </SortableContext>
        </DndContext>
      </TableContainer>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Remove Spot?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove the spot and its metadata. Remaining spots will be renumbered.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm}>
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
