// ---------------------------------------------------------------------------
// NodeOutputCard — renders the JSON output of a single pipeline step
// ---------------------------------------------------------------------------
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Collapse,
  IconButton,
  Typography,
  Chip,
  Box,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface Props {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
}

// Recursively render any JSON value in a readable way
function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <Typography variant="body2" color="text.disabled">null</Typography>;
  }
  if (typeof value === 'boolean') {
    return <Chip label={value ? 'true' : 'false'} color={value ? 'success' : 'error'} size="small" />;
  }
  if (typeof value === 'number') {
    return <Typography variant="body2" component="span" color="secondary.main">{value}</Typography>;
  }
  if (typeof value === 'string') {
    if (value.length > 200) {
      return (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', fontSize: '0.8rem', opacity: 0.85 }}>
          {value}
        </Typography>
      );
    }
    return <Typography variant="body2" component="span">{value}</Typography>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <Typography variant="body2" color="text.disabled">[]</Typography>;
    if (depth > 2) return <Chip label={`Array(${value.length})`} size="small" variant="outlined" />;
    return (
      <Box sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}>
        {value.map((item, i) => (
          <Box key={i} sx={{ py: 0.3 }}>
            <Typography variant="caption" color="text.disabled" sx={{ mr: 1 }}>[{i}]</Typography>
            <JsonValue value={item} depth={depth + 1} />
          </Box>
        ))}
      </Box>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <Typography variant="body2" color="text.disabled">{'{}'}</Typography>;
    if (depth > 2) return <Chip label={`Object(${entries.length})`} size="small" variant="outlined" />;
    return (
      <Table size="small" sx={{ '& td': { borderBottom: 'none', py: 0.3, px: 0.5, verticalAlign: 'top' } }}>
        <TableBody>
          {entries.map(([k, v]) => (
            <TableRow key={k}>
              <TableCell sx={{ fontWeight: 600, color: 'primary.main', whiteSpace: 'nowrap', width: 1, fontSize: '0.8rem' }}>
                {k}
              </TableCell>
              <TableCell>
                <JsonValue value={v} depth={depth + 1} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }
  return <Typography variant="body2">{String(value)}</Typography>;
}

// Node type icon/color based on label
function nodeColor(label: string): string {
  if (label.includes('Gemini')) return '#4285F4'; // Google Blue for LLM nodes
  if (label.includes('rule-based')) return '#9E9E9E'; // Grey for rule-based
  if (label.startsWith('N')) return '#00e5ff';
  if (label.startsWith('HG')) return '#ffd740';
  return '#69f0ae';
}

function nodeTypeChip(label: string): { text: string; color: 'primary' | 'secondary' | 'default' } | null {
  if (label.includes('Gemini Pro')) return { text: 'Gemini Pro', color: 'primary' };
  if (label.includes('Gemini TTS')) return { text: 'Gemini TTS', color: 'secondary' };
  if (label.includes('Gemini')) return { text: 'Gemini', color: 'primary' };
  if (label.includes('rule-based')) return { text: 'Rule-based', color: 'default' };
  return null;
}

export default function NodeOutputCard({ label, data, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const chipInfo = nodeTypeChip(label);

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        borderColor: open ? nodeColor(label) : 'rgba(255,255,255,0.08)',
        transition: 'border-color 0.2s',
      }}
    >
      <CardHeader
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2">{label}</Typography>
            {chipInfo && <Chip label={chipInfo.text} size="small" variant="outlined" color={chipInfo.color} />}
          </Box>
        }
        action={
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        }
        sx={{ py: 1, px: 2, cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      />
      <Collapse in={open}>
        <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
          {data ? <JsonValue value={data} /> : (
            <Typography variant="body2" color="text.disabled">No output data</Typography>
          )}
        </CardContent>
      </Collapse>
    </Card>
  );
}
