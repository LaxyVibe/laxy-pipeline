// ---------------------------------------------------------------------------
// StageDetail — shows node outputs for the active or selected stage
// ---------------------------------------------------------------------------
import { Box, Typography, Divider } from '@mui/material';
import { PIPELINE_STAGES, usePipelineStore } from '../store';
import NodeOutputCard from './NodeOutputCard';

interface Props {
  stageIndex: number;
}

export default function StageDetail({ stageIndex }: Props) {
  const stages = usePipelineStore((s) => s.stages);

  if (stageIndex < 0 || stageIndex >= PIPELINE_STAGES.length) return null;

  const def = PIPELINE_STAGES[stageIndex];
  const stage = stages[def.id];

  const outputEntries = Object.entries(stage.nodeOutputs);

  if (outputEntries.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
        {def.title} — Node Outputs
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      {outputEntries.map(([label, data]) => (
        <NodeOutputCard key={label} label={label} data={data} defaultOpen={outputEntries.length <= 3} />
      ))}
    </Box>
  );
}
