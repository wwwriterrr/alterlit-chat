import { useEffect, useRef, useState } from 'react';
import s from './AudioPlayer.module.css';

function fmt(sec: number) {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

export default function AudioPlayer({ src, name, mine, disabled }: { src: string; name: string; mine: boolean; disabled?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onPlay = () => {
      // одновременно играет только одна запись
      document.querySelectorAll('audio').forEach((other) => other !== a && other.pause());
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onPause);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onPause);
    };
  }, []);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const progress = duration ? time / duration : 0;

  return (
    <div className={s.player} data-mine={mine || undefined}>
      <audio ref={audio} src={src} preload="metadata" />
      <button className={s.play} onClick={toggle} disabled={disabled} aria-label={playing ? 'Пауза' : 'Слушать'}>
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <rect x="4" y="3" width="3.5" height="12" rx="1" />
            <rect x="10.5" y="3" width="3.5" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
            <path d="M5 3.2v11.6a.8.8 0 0 0 1.2.7l9.5-5.8a.8.8 0 0 0 0-1.4L6.2 2.5A.8.8 0 0 0 5 3.2z" />
          </svg>
        )}
      </button>
      <div className={s.body}>
        <div className={s.name} title={name}>
          {name}
        </div>
        <input
          className={s.seek}
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          disabled={disabled || !duration}
          style={{ '--p': `${progress * 100}%` } as React.CSSProperties}
          onChange={(e) => {
            if (audio.current && duration) audio.current.currentTime = (Number(e.target.value) / 1000) * duration;
          }}
          aria-label="Перемотка"
        />
        <div className={s.time}>{playing || time ? `${fmt(time)} / ${fmt(duration)}` : fmt(duration)}</div>
      </div>
    </div>
  );
}
