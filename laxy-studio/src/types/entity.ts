// ---------------------------------------------------------------------------
// Entity Configuration types
// ---------------------------------------------------------------------------

export interface GpsCoordinates {
  lat: number;
  lng: number;
}

export interface OperatingHours {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  open: string;   // HH:mm
  close: string;  // HH:mm
  closed: boolean;
}

export const DEFAULT_OPERATING_HOURS: OperatingHours[] = [
  { day: 'mon', open: '09:00', close: '17:00', closed: false },
  { day: 'tue', open: '09:00', close: '17:00', closed: false },
  { day: 'wed', open: '09:00', close: '17:00', closed: false },
  { day: 'thu', open: '09:00', close: '17:00', closed: false },
  { day: 'fri', open: '09:00', close: '17:00', closed: false },
  { day: 'sat', open: '10:00', close: '18:00', closed: false },
  { day: 'sun', open: '10:00', close: '18:00', closed: true },
];

export const DAY_LABELS: Record<OperatingHours['day'], string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Custom field defined in item field config */
export interface ItemFieldDef {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string[];  // for 'select' type
}

/** ISO 639‑1 language codes supported */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'zh-TW', label: 'Chinese Traditional (繁體中文)' },
  { code: 'zh-CN', label: 'Chinese Simplified (简体中文)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'th', label: 'Thai (ไทย)' },
  { code: 'vi', label: 'Vietnamese (Tiếng Việt)' },
  { code: 'id', label: 'Indonesian (Bahasa Indonesia)' },
  { code: 'ms', label: 'Malay (Bahasa Melayu)' },
  { code: 'ar', label: 'Arabic (العربية)' },
  { code: 'ru', label: 'Russian (Русский)' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

/** Lookup map from language code → human-readable label (derived from SUPPORTED_LANGUAGES) */
const _langMap = new Map<string, string>(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]));

/** Return the human-readable label for a language code.
 *  Falls back to the uppercased code when the language isn't in the list. */
export function langLabel(code: string): string {
  return _langMap.get(code) ?? code.toUpperCase();
}

/** Available modules (Phase 1 = Guide only) */
export const AVAILABLE_MODULES = [
  {
    id: 'guide',
    label: 'Audio Guide',
    available: true,
    description: 'Create narrated audio tours with multi-language support, TTS voice generation, and synchronised media.',
    phase: 1,
    icon: '🎧',
  },
  {
    id: 'chatbot',
    label: 'Q&A Chatbot',
    available: false,
    description: 'Let visitors ask questions and get AI-powered answers about your venue, exhibits, and services.',
    phase: 2,
    icon: '💬',
  },
  {
    id: 'stamp-hunt',
    label: 'Stamp Hunt',
    available: false,
    description: 'Gamify the visitor experience with location-based stamp collecting, rewards, and leaderboards.',
    phase: 3,
    icon: '🏅',
  },
] as const;

export type ModuleId = (typeof AVAILABLE_MODULES)[number]['id'];

// ---------------------------------------------------------------------------
// Layout Templates
// ---------------------------------------------------------------------------

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  /** Accent colour shown in the preview mock */
  accentColor: string;
  /** Key visual characteristics to describe the template */
  tags: string[];
}

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Clean, traditional layout with a left-aligned content panel and top navigation bar. Ideal for museums and galleries.',
    accentColor: '#7c4dff',
    tags: ['Elegant', 'Minimal', 'Top Nav'],
  },
  {
    id: 'modern-card',
    name: 'Modern Card',
    description: 'Card-based layout with full-bleed hero images and floating content cards. Great for immersive experiences.',
    accentColor: '#00e5ff',
    tags: ['Bold', 'Cards', 'Immersive'],
  },
  {
    id: 'storyteller',
    name: 'Storyteller',
    description: 'Long-scroll narrative layout with large typography and inline media. Perfect for historical tours.',
    accentColor: '#ff9100',
    tags: ['Narrative', 'Scroll', 'Editorial'],
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Space-efficient layout optimised for small screens. Bottom tab navigation with quick-access controls.',
    accentColor: '#69f0ae',
    tags: ['Mobile-first', 'Tabs', 'Lightweight'],
  },
];

export type LayoutTemplateId = (typeof LAYOUT_TEMPLATES)[number]['id'];

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

export type AssetSourceType = 'file' | 'url' | 'text';

export type AssetFileType = 'pdf' | 'image';

export interface AssetFile {
  /** Unique client-side id */
  id: string;
  /** Original filename or user-provided label */
  name: string;
  /** File MIME type (e.g. image/jpeg, application/pdf) */
  mimeType: string;
  /** Simplified type bucket */
  fileType: AssetFileType;
  /** Size in bytes */
  size: number;
  /** How the asset was added */
  source: AssetSourceType;
  /** Local object URL for preview (images) — revoked on remove */
  previewUrl?: string;
  /** The raw File object (kept in memory; not persisted) */
  file?: File;
  /** URL provided by the user (source === 'url') */
  sourceUrl?: string;
  /** Raw text content (source === 'text') */
  textContent?: string;
  /** Upload progress 0‑100, undefined means not started */
  progress?: number;
  /** Upload status */
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** Error message if status === 'error' */
  error?: string;
  /** Firebase Storage download URL (set after upload completes) */
  downloadUrl?: string;
  /** Firebase Storage path (set after upload completes) */
  storagePath?: string;
  /** Timestamp added */
  addedAt: number;
}

/** Accepted MIME types for file uploads */
export const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

/** Maximum single file size (100 MB) */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Spot / Ingestion types
// ---------------------------------------------------------------------------

/** Metadata for a single exhibit / spot extracted by AI or entered manually */
export interface SpotMetadata {
  /** Unique client-side id */
  id: string;
  /** Display order number (1-based) */
  spotNumber: number;
  /** Exhibit title */
  title: string;
  /** Artist or creator */
  artist: string;
  /** Historical period / era */
  period: string;
  /** Material composition */
  material: string;
  /** Physical dimensions */
  dimensions: string;
  /** Key highlight / notable fact */
  highlight: string;
  /** Cultural designation / classification */
  culturalDesignation: string;
  /** Raw OCR / source text that produced this spot */
  sourceText?: string;
  /** Asset IDs associated with this spot */
  assetIds: string[];
}

export type IngestionStatus =
  | 'idle'           // Not started
  | 'selecting'      // User selecting content
  | 'processing'     // AI extracting metadata
  | 'review'         // Human reviewing extracted data
  | 'approved'       // Human approved — ready for next step
  | 'error';         // Something went wrong

// ---------------------------------------------------------------------------
// Script Generation types (Step 3)
// ---------------------------------------------------------------------------

/** A generated script for a single spot */
export interface SpotScript {
  /** Matches SpotMetadata.id */
  spotId: string;
  /** Spot display number */
  spotNumber: number;
  /** Spot title (from metadata) */
  title: string;
  /** The generated script text */
  scriptText: string;
  /** Per-spot approval status */
  approved: boolean;
  /** Fast-track: skip downstream human gates for this spot */
  fastTrack: boolean;
}

/** Image/media mapping for a spot */
export interface SpotImageMapping {
  spotId: string;
  /** Asset IDs assigned to this spot (ordered) */
  assignedAssetIds: string[];
  /** Whether the mapping was AI-suggested */
  aiSuggested: boolean;
}

export type ScriptStatus =
  | 'idle'           // Not started
  | 'generating'     // AI generating scripts
  | 'review'         // Human reviewing scripts
  | 'approved'       // All approved
  | 'error';         // Something went wrong

// ---------------------------------------------------------------------------
// Translation types (Step 4)
// ---------------------------------------------------------------------------

/** A translated script for a single spot in a single language */
export interface SpotTranslation {
  /** Matches SpotMetadata.id / SpotScript.spotId */
  spotId: string;
  /** Spot display number */
  spotNumber: number;
  /** Spot title (from metadata, in core language) */
  title: string;
  /** The original script text (core language, read-only reference) */
  originalText: string;
  /** The translated text (editable) */
  translatedText: string;
}

/** All spot translations for a single language */
export interface LanguageTranslation {
  /** ISO 639-1 language code */
  lang: string;
  /** Human-readable language label */
  label: string;
  /** Per-spot translations */
  spots: SpotTranslation[];
  /** Whether this language has been approved */
  approved: boolean;
}

export type TranslationStatus =
  | 'idle'           // Not started
  | 'translating'    // AI translating scripts
  | 'review'         // Human reviewing translations
  | 'approved'       // All languages approved
  | 'error';         // Something went wrong

// ---------------------------------------------------------------------------
// Audio Production types (Step 5)
// ---------------------------------------------------------------------------

/** A voice character persona used for TTS generation */
export interface VoiceCharacter {
  id: string;
  name: string;
  role: string;
  avatar: string; // emoji or URL
  personality: string;
  speechPatterns: string;
  /** Whether this character is AI-recommended */
  aiRecommended: boolean;
}

/** Hardcoded character presets for Phase 1 */
export const CHARACTER_PRESETS: VoiceCharacter[] = [
  {
    id: 'char-museum-curator',
    name: 'Dr. Helena Park',
    role: 'Museum Curator',
    avatar: '👩‍🏫',
    personality: 'Warm, knowledgeable, and passionate about art history. Speaks with authority but remains approachable.',
    speechPatterns: 'Measured pace, clear enunciation, occasional pauses for emphasis. Uses descriptive language.',
    aiRecommended: true,
  },
  {
    id: 'char-storyteller',
    name: 'Marco Rossi',
    role: 'Storyteller',
    avatar: '🎭',
    personality: 'Engaging and dramatic. Brings artworks to life through vivid storytelling and emotional connection.',
    speechPatterns: 'Dynamic pacing, theatrical pauses, expressive intonation. Conversational and immersive.',
    aiRecommended: false,
  },
  {
    id: 'char-historian',
    name: 'Prof. James Chen',
    role: 'Art Historian',
    avatar: '📚',
    personality: 'Scholarly and precise. Provides deep historical context and cross-cultural connections.',
    speechPatterns: 'Deliberate and measured. Technical vocabulary explained naturally. Academic but accessible.',
    aiRecommended: false,
  },
  {
    id: 'char-explorer',
    name: 'Sakura Tanaka',
    role: 'Explorer Guide',
    avatar: '🌸',
    personality: 'Curious and enthusiastic. Invites listeners to discover details and make personal connections.',
    speechPatterns: 'Upbeat energy, rhetorical questions, interactive tone. Encourages looking closely.',
    aiRecommended: false,
  },
  {
    id: 'char-minimalist',
    name: 'Alex Reed',
    role: 'Contemporary Guide',
    avatar: '🎨',
    personality: 'Modern and concise. Lets the artwork speak for itself with essential context only.',
    speechPatterns: 'Brief, impactful sentences. Minimal filler. Direct and confident delivery.',
    aiRecommended: false,
  },
];

/** TTS voice available in the system */
export interface TTSVoice {
  id: string;
  name: string;
  gender: 'female' | 'male';
  /** Short description of voice quality */
  description: string;
  /** Sample audio URL (placeholder for Phase 1) */
  sampleUrl: string;
  /** Whether AI recommended this voice */
  aiRecommended: boolean;
}

/** Available TTS voices for Phase 1 */
export const AVAILABLE_VOICES: TTSVoice[] = [
  { id: 'Aoede', name: 'Aoede', gender: 'female', description: 'Warm, expressive mezzo-soprano', sampleUrl: '', aiRecommended: true },
  { id: 'Algieba', name: 'Algieba', gender: 'female', description: 'Clear, professional alto', sampleUrl: '', aiRecommended: false },
  { id: 'Algenib', name: 'Algenib', gender: 'male', description: 'Deep, resonant baritone', sampleUrl: '', aiRecommended: false },
  { id: 'Despina', name: 'Despina', gender: 'female', description: 'Bright, friendly soprano', sampleUrl: '', aiRecommended: false },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', description: 'Calm, soothing contralto', sampleUrl: '', aiRecommended: false },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', description: 'Rich, elegant mezzo', sampleUrl: '', aiRecommended: false },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', description: 'Authoritative, warm tenor', sampleUrl: '', aiRecommended: false },
  { id: 'Sulafat', name: 'Sulafat', gender: 'male', description: 'Engaging, narrative bass-baritone', sampleUrl: '', aiRecommended: false },
];

/** Director note controlling TTS generation style */
export interface DirectorNote {
  scene: string;
  style: string;
  pacing: string;
  compiledPrompt?: string;
  contentVersion?: string;
  scriptEnhancementLimit?: string;
}

/** Per-spot audio file within a language */
export interface SpotAudioFile {
  spotId: string;
  spotNumber: number;
  title: string;
  audioUrl: string;
  durationMs: number;
  scriptText?: string;
  versionId?: string;
  storagePath?: string;
  guideId?: string;
  lang?: string;
  generatedAtMs?: number;
  isActiveVersion?: boolean;
  isLatestVersion?: boolean;
}

/** Generated audio for a single language */
export interface LanguageAudio {
  lang: string;
  label: string;
  /** First spot's audioUrl (backwards-compat) */
  audioUrl: string;
  durationMs: number;
  /** Per-language approval */
  approved: boolean;
  /** Individual audio files per spot/script */
  spots?: SpotAudioFile[];
}

/** Pronunciation issue marker on audio timeline */
export interface PronunciationMarker {
  id: string;
  /** Timestamp in seconds */
  timestampSec: number;
  /** User comment describing the issue */
  comment: string;
  /** Spot ID this marker relates to (optional) */
  spotId?: string;
}

/** A single audio generation run record */
export interface AudioGenerationRun {
  id: string;
  timestamp: number;
  languages: string[];
  characterId: string;
  characterName: string;
  voiceId: string;
  voiceName: string;
  directorNote: DirectorNote;
  tokenCount: number;
  /** Audio URLs per language produced in this run */
  audioUrls: Record<string, string>;
}

/** SRT subtitle entry */
export interface SRTEntry {
  index: number;
  startTime: string; // HH:MM:SS,mmm
  endTime: string;
  text: string;
}

/** SRT data for one language */
export interface LanguageSRT {
  lang: string;
  label: string;
  entries: SRTEntry[];
  /** Raw SRT string for download */
  rawSrt: string;
}

export type AudioStatus =
  | 'idle'           // Not started — show character/voice/director setup
  | 'configuring'    // User configuring character, voice, director note
  | 'generating'     // Audio generation in progress
  | 'review'         // Human reviewing audio
  | 'approved'       // All approved
  | 'error';         // Something went wrong

// ---------------------------------------------------------------------------
// Publishing types (Step 6)
// ---------------------------------------------------------------------------

/** A single image in a slideshow timeline for a spot */
export interface SlideshowImage {
  /** Asset ID from the asset library */
  assetId: string;
  /** Display order within the spot */
  order: number;
  /** Start time in seconds relative to the spot's audio start */
  startSec: number;
  /** Duration this image is shown in seconds */
  durationSec: number;
  /** Optional caption overlay */
  caption: string;
}

/** Slideshow configuration for a single spot */
export interface SpotSlideshow {
  spotId: string;
  spotNumber: number;
  title: string;
  /** Total audio duration for this spot in seconds */
  audioDurationSec: number;
  /** Ordered images with timing */
  images: SlideshowImage[];
}

/** A single item in the publish readiness checklist */
export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  /** Whether this item is satisfied */
  checked: boolean;
  /** The wizard step to navigate to for fixing */
  linkedStep: string;
  /** Count info (e.g. "3/3 spots approved") */
  detail: string;
}

/** Device frame for preview */
export type PreviewDevice = 'mobile' | 'tablet' | 'desktop';

/** Publishing status */
export type PublishStatus =
  | 'idle'           // Not started — configuring slideshow & checklist
  | 'previewing'     // User previewing guide
  | 'publishing'     // Publishing in progress
  | 'published'      // Successfully published
  | 'error';         // Something went wrong

/** Published guide info */
export interface PublishedGuide {
  /** Publish job identifier */
  publishId: string;
  /** Guide URL */
  guideUrl: string;
  /** Short URL (laxy.click/slug) */
  shortUrl: string;
  /** Custom slug */
  slug: string;
  /** QR code data URL (provided by backend) */
  qrDataUrl: string;
  /** Publish timestamp */
  publishedAt: number;
}

/** Full entity configuration */
export interface EntityConfig {
  // Basic info
  venueName: string;
  address: string;
  gps: GpsCoordinates | null;

  // Media
  mapImageUrl: string;
  coverImageUrl: string;

  // Contact
  website: string;
  phone: string;

  // Hours
  operatingHours: OperatingHours[];

  // Languages
  coreLanguage: LanguageCode;
  supportedLanguages: LanguageCode[];

  // Modules
  enabledModules: ModuleId[];

  // Layout
  selectedLayout: LayoutTemplateId | null;

  // Item field config
  itemFields: ItemFieldDef[];
}

export const DEFAULT_ENTITY_CONFIG: EntityConfig = {
  venueName: '',
  address: '',
  gps: null,
  mapImageUrl: '',
  coverImageUrl: '',
  website: '',
  phone: '',
  operatingHours: DEFAULT_OPERATING_HOURS,
  coreLanguage: 'en',
  supportedLanguages: ['en'],
  enabledModules: ['guide'],
  selectedLayout: 'classic',
  itemFields: [
    { id: 'title', label: 'Title', type: 'text', required: true },
    { id: 'artist', label: 'Artist / Creator', type: 'text', required: false },
    { id: 'period', label: 'Period / Era', type: 'text', required: false },
    { id: 'material', label: 'Material', type: 'text', required: false },
    { id: 'dimensions', label: 'Dimensions', type: 'text', required: false },
    { id: 'highlight', label: 'Highlight', type: 'text', required: false },
    { id: 'cultural_designation', label: 'Cultural Designation', type: 'text', required: false },
  ],
};
