// ---------------------------------------------------------------------------
// AssetsStep — combined upload + library view for the Assets wizard step
// ---------------------------------------------------------------------------
import { useState } from 'react';
import { Box, Tab, Tabs, Typography, Badge } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CollectionsIcon from '@mui/icons-material/Collections';
import { useGuidesStore } from '../../guidesStore';
import AssetUploader from './AssetUploader';
import AssetLibrary from './AssetLibrary';

export default function AssetsStep() {
  const [tab, setTab] = useState(0);
  const assetCount = useGuidesStore((s) => s.assets.length);

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
        Assets
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Upload source material and manage your asset library.
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<CloudUploadIcon />} iconPosition="start" label="Upload" />
        <Tab
          icon={<CollectionsIcon />}
          iconPosition="start"
          label={
            <Badge badgeContent={assetCount} color="primary" max={999} sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}>
              Library
            </Badge>
          }
        />
      </Tabs>

      {tab === 0 && <AssetUploader />}
      {tab === 1 && <AssetLibrary />}
    </Box>
  );
}
