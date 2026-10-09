import { useState } from 'react';
import { avatarColor, initials } from '../utils/people';
import s from './Avatar.module.css';

interface Props {
  id: number;
  name: string;
  src?: string | null;
  size?: number;
}

export default function Avatar({ id, name, src, size = 48 }: Props) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38), background: avatarColor(id) };

  if (src && !broken) {
    return <img className={s.avatar} style={style} src={src} alt="" onError={() => setBroken(true)} />;
  }
  return (
    <span className={s.avatar} style={style} aria-hidden>
      {name ? (
        initials(name)
      ) : (
        <svg width="56%" height="56%" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4.2" />
          <path d="M3.8 20.2c.9-4 4.2-6.2 8.2-6.2s7.3 2.2 8.2 6.2c.1.5-.3.8-.7.8H4.5c-.4 0-.8-.3-.7-.8z" />
        </svg>
      )}
    </span>
  );
}
