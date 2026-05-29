import {
  mapAudioHistoryVersion,
  sortHistoryVersions,
  type AudioHistoryTarget,
  type AudioHistoryVersionRecord,
  type AudioTrackSummaryRecord,
} from '../features/audioDirector/history';

export type TtsHistoryVersionSource = {
  docId: string;
  data: Record<string, unknown>;
};

export function buildTtsJobHistoryRecords(args: {
  guideId: string;
  target: AudioHistoryTarget;
  summary: AudioTrackSummaryRecord | null;
  versions: TtsHistoryVersionSource[];
}): AudioHistoryVersionRecord[] {
  const { guideId, target, summary, versions } = args;

  return sortHistoryVersions(
    versions
      .map((version) => mapAudioHistoryVersion({
        guideId,
        target,
        summary,
        docId: version.docId,
        data: version.data,
      }))
      .filter((record): record is AudioHistoryVersionRecord => Boolean(record)),
  );
}

export function resolveTtsHistorySelectedRecordId(
  records: AudioHistoryVersionRecord[],
  selectedRecordId?: string | null,
): string | null {
  if (records.length === 0) return null;
  if (selectedRecordId && records.some((record) => record.versionId === selectedRecordId)) {
    return selectedRecordId;
  }
  return records[0]?.versionId ?? null;
}

export function withoutJobHistoryCacheEntry<T>(
  cache: Record<string, T>,
  jobId: string,
): Record<string, T> {
  if (!(jobId in cache)) return cache;
  const { [jobId]: _removed, ...rest } = cache;
  return rest;
}
