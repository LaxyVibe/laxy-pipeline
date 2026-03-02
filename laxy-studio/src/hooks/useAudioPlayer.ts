// ---------------------------------------------------------------------------
// useAudioPlayer — HTML5 audio playback controls hook
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAudioPlayerReturn {
  /** Ref to attach to a hidden <audio> element, or null to use internal */
  audioRef: React.RefObject<HTMLAudioElement | null>;
  /** Whether audio is currently playing */
  playing: boolean;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total duration in seconds (0 until loaded) */
  duration: number;
  /** Buffered fraction 0–1 */
  buffered: number;
  /** Playback rate (1 = normal) */
  playbackRate: number;

  // Controls
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Seek to a specific time in seconds */
  seek: (timeSec: number) => void;
  /** Skip forward/backward by delta seconds (positive = forward) */
  skip: (deltaSec: number) => void;
  /** Set playback rate (0.5–2.0) */
  setRate: (rate: number) => void;
  /** Load a new audio source URL */
  load: (url: string) => void;
}

/**
 * Manages an HTMLAudioElement for playback controls, time tracking,
 * and buffering state. Works with any audio URL.
 *
 * Usage:
 * ```tsx
 * const { audioRef, playing, currentTime, duration, play, pause, seek, skip } = useAudioPlayer();
 * // <audio ref={audioRef} /> somewhere hidden in the DOM
 * ```
 */
export function useAudioPlayer(initialUrl?: string): UseAudioPlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const rafRef = useRef<number>(0);

  // Lazy-create audio element
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const el = audioRef.current;

    if (initialUrl) {
      el.src = initialUrl;
    }

    const onLoadedMetadata = () => setDuration(el.duration || 0);
    const onEnded = () => setPlaying(false);
    const onProgress = () => {
      if (el.buffered.length > 0) {
        setBuffered(el.buffered.end(el.buffered.length - 1) / (el.duration || 1));
      }
    };

    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('ended', onEnded);
    el.addEventListener('progress', onProgress);

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('progress', onProgress);
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animation frame loop for smooth currentTime updates
  useEffect(() => {
    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      if (playing) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    if (playing) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const play = useCallback(() => {
    audioRef.current?.play();
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (audioRef.current?.paused) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  const seek = useCallback((timeSec: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(timeSec, audioRef.current.duration || 0));
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const skip = useCallback(
    (deltaSec: number) => {
      if (audioRef.current) {
        seek(audioRef.current.currentTime + deltaSec);
      }
    },
    [seek],
  );

  const setRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, rate));
    if (audioRef.current) {
      audioRef.current.playbackRate = clamped;
    }
    setPlaybackRate(clamped);
  }, []);

  const load = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setBuffered(0);
    }
  }, []);

  return {
    audioRef,
    playing,
    currentTime,
    duration,
    buffered,
    playbackRate,
    play,
    pause,
    toggle,
    seek,
    skip,
    setRate,
    load,
  };
}
