// ---------------------------------------------------------------------------
// Guide / Wizard data types
// ---------------------------------------------------------------------------
// Most wizard types live in entity.ts (the consolidated 586-line file).
// This module re-exports guide-level types and adds list/summary types
// used by DashboardPage and Firestore queries.

export type { EntityConfig } from './entity';
export { DEFAULT_ENTITY_CONFIG } from './entity';
export type { LayoutTemplateId, LanguageCode, ModuleId } from './entity';
export type { PublishedGuide, PublishStatus, PreviewDevice } from './entity';

// ---------------------------------------------------------------------------
// Guide list / summary — used on DashboardPage
// ---------------------------------------------------------------------------

/** Lightweight guide record shown in the dashboard list */
export interface GuideListItem {
  id: string;
  title: string;
  status: GuideStatus;
  updatedAt: number;
  spotCount: number;
  /** Thumbnail URL (cover image) */
  thumbnailUrl?: string;
  /** Owner user ID */
  ownerId?: string;
}

/** Overall lifecycle status of a guide */
export type GuideStatus = 'draft' | 'in-progress' | 'review' | 'published' | 'archived';

/** Full guide document stored in Firestore */
export interface GuideDocument {
  id: string;
  ownerId: string;
  title: string;
  status: GuideStatus;
  /** Serialised wizard state snapshot */
  wizardState: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}
