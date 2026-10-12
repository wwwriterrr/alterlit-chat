import type { PersonBadge } from '../utils/people';
import s from './PersonName.module.css';

const BADGE_LABEL = { staff: 'Администрация сайта', owner: 'Владелец сайта' } as const;

/** Имя пользователя; у администрации — значок после имени, который не обрезается. */
export default function PersonName({ name, badge }: { name: string; badge?: PersonBadge }) {
  return (
    <span className={s.wrap}>
      <span className={s.text}>{name}</span>
      {badge && <AdminBadge kind={badge} />}
    </span>
  );
}

export function AdminBadge({ kind }: { kind: Exclude<PersonBadge, null> }) {
  return (
    <svg className={s.badge} data-kind={kind} viewBox="0 0 50 50" role="img" aria-label={BADGE_LABEL[kind]}>
      <title>{BADGE_LABEL[kind]}</title>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25 48C37.7025 48 48 37.7025 48 25C48 17.5654 44.4725 10.9547 39 6.75025C35.8069 25.6826 32.9139 35.1307 25 48ZM11 6.75025C14.1931 25.6826 17.0861 35.1307 25 48C12.2975 48 2 37.7025 2 25C2 17.5654 5.52745 10.9547 11 6.75025ZM13.1778 5.26687C22.46 8.25353 27.6384 8.35772 36.8222 5.26687C33.3674 3.19265 29.323 2 25 2C20.677 2 16.6326 3.19265 13.1778 5.26687Z"
      />
      <path d="M19.2778 11C19.0769 10.2616 19.183 10.0051 20 10H30C30.8111 10.0027 30.9445 10.2249 30.7445 10.9199L28.7778 18C28.5214 18.8123 28.2295 19.0106 27.5 19H22.5C21.6701 18.9923 21.4421 18.7134 21.2222 18L19.2778 11Z" />
      <path d="M19 33C20.9255 37.9373 22.2483 40.673 25 45.5C27.6861 40.8225 29.0148 38.0944 31 33L28.6793 21.3963C28.5251 20.7218 28.2919 20.4994 27.5 20.5H22.5C21.7009 20.4917 21.4615 20.7077 21.3207 21.3963L19 33Z" />
    </svg>
  );
}
