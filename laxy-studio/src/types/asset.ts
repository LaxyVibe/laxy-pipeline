// ---------------------------------------------------------------------------
// Asset metadata types
// ---------------------------------------------------------------------------
// Core asset types live in entity.ts. This module re-exports them and adds
// storage-specific types used by the upload/library system.

export type { AssetFile, AssetSourceType, AssetFileType } from './entity';
export { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE } from './entity';

// ---------------------------------------------------------------------------
// Firebase Storage asset record
// ---------------------------------------------------------------------------

/** Asset record as persisted in Firestore (extends the client-side AssetFile) */
export interface AssetRecord {
  id: string;
  /** Guide this asset belongs to */
  guideId: string;
  /** Original filename */
  name: string;
  /** MIME type */
  mimeType: string;
  /** Simplified type bucket */
  fileType: 'pdf' | 'image';
  /** Size in bytes */
  size: number;
  /** Firebase Storage download URL */
  downloadUrl: string;
  /** Full Firebase Storage path */
  storagePath: string;
  /** Thumbnail URL (auto-generated for images) */
  thumbnailUrl?: string;
  /** User-provided caption / alt text */
  caption?: string;
  /** Tags for search / filter */
  tags: string[];
  /** Upload timestamp */
  uploadedAt: number;
}

/** Asset library storage quota info */
export interface StorageQuota {
  /** Bytes used */
  usedBytes: number;
  /** Maximum bytes allowed */
  maxBytes: number;
}

/** Asset sort options in the library view */
export type AssetSortField = 'name' | 'size' | 'uploadedAt' | 'fileType';
export type AssetSortDirection = 'asc' | 'desc';
