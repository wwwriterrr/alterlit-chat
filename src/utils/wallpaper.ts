// Генераторы масок для обоев чата. Маска задаёт только форму узора —
// цвет подставляется из темы, поэтому одна маска работает и в светлой, и в тёмной.

export type WallpaperId = 'feathers' | 'garden' | 'manuscript' | 'notebook' | 'laurel';

export const WALLPAPERS: { id: WallpaperId; label: string }[] = [
  { id: 'feathers', label: 'Перья' },
  { id: 'garden', label: 'Сад' },
  { id: 'manuscript', label: 'Рукопись' },
  { id: 'notebook', label: 'Тетрадь' },
  { id: 'laurel', label: 'Лавр' },
];

/** Детерминированный ГПСЧ — узор одинаковый при каждой загрузке. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// ── Рукопись: буквы дореформенной азбуки и типографские знаки ───────────────
// Рисуется на canvas, потому что SVG внутри data-URI не видит веб-шрифты страницы.
const GLYPHS = ['Ѣ', 'Ѳ', 'І', 'Ѵ', 'Ж', 'Я', 'Ф', 'Щ', 'Ю', 'Ъ', 'Ё', '§', '¶', '«', '»', '&', 'Д', 'Ы'];
const GLYPH_TILE = 420;

async function glyphMask(): Promise<string | null> {
  try {
    await Promise.all([
      document.fonts.load('italic 48px "PT Serif"', GLYPHS.join('')),
      document.fonts.load('48px "PT Serif"', GLYPHS.join('')),
    ]);
  } catch {
    /* без шрифта нарисуем запасным serif */
  }
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GLYPH_TILE * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';

  const random = rng(1917);
  const cells = 5;
  const cell = GLYPH_TILE / cells;
  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      if (random() < 0.22) continue; // воздух между буквами
      const glyph = GLYPHS[Math.floor(random() * GLYPHS.length)];
      const size = 26 + random() * 34;
      const italic = random() < 0.7;
      // смещение по строкам — «кирпичная» сетка, чтобы не было видно рядов
      const x = col * cell + cell / 2 + (row % 2 ? cell / 4 : -cell / 4) * 0.6 + (random() - 0.5) * 10;
      const y = row * cell + cell / 2 + (random() - 0.5) * 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(((random() - 0.5) * 36 * Math.PI) / 180);
      ctx.font = `${italic ? 'italic ' : ''}400 ${size}px "PT Serif", Georgia, serif`;
      ctx.fillText(glyph, 0, 0);
      ctx.restore();
    }
  }
  return `url(${canvas.toDataURL('image/png')})`;
}

// ── Лавр: ветви, собранные по кривой Безье ──────────────────────────────────
type Pt = [number, number];

function bezier(p: Pt[], t: number): { pt: Pt; angle: number } {
  const [a, b, c, d] = p;
  const mt = 1 - t;
  const x = mt ** 3 * a[0] + 3 * mt ** 2 * t * b[0] + 3 * mt * t ** 2 * c[0] + t ** 3 * d[0];
  const y = mt ** 3 * a[1] + 3 * mt ** 2 * t * b[1] + 3 * mt * t ** 2 * c[1] + t ** 3 * d[1];
  const dx = 3 * mt ** 2 * (b[0] - a[0]) + 6 * mt * t * (c[0] - b[0]) + 3 * t ** 2 * (d[0] - c[0]);
  const dy = 3 * mt ** 2 * (b[1] - a[1]) + 6 * mt * t * (c[1] - b[1]) + 3 * t ** 2 * (d[1] - c[1]);
  return { pt: [x, y], angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function branch(p: Pt[], leaves: number, scale = 1): string {
  const [a, b, c, d] = p;
  let out = `<path d="M${a} C${b} ${c} ${d}"/>`;
  // лист — миндалевидный контур с центральной жилкой
  const leaf = (len: number) => {
    const w = len * 0.28;
    return `<path d="M0 0C${len * 0.3} ${-w} ${len * 0.75} ${-w} ${len} 0C${len * 0.75} ${w} ${len * 0.3} ${w} 0 0Z M${len * 0.12} 0H${len * 0.7}"/>`;
  };
  for (let i = 0; i < leaves; i++) {
    const t = 0.12 + (i / leaves) * 0.82;
    const { pt, angle } = bezier(p, t);
    const side = i % 2 ? 1 : -1;
    const len = (24 - i * 1.4) * scale;
    out += `<g transform="translate(${pt[0].toFixed(1)} ${pt[1].toFixed(1)}) rotate(${(angle + side * 42).toFixed(1)})">${leaf(len)}</g>`;
  }
  // верхушка
  const tip = bezier(p, 1);
  out += `<g transform="translate(${tip.pt[0].toFixed(1)} ${tip.pt[1].toFixed(1)}) rotate(${tip.angle.toFixed(1)})">${leaf(16 * scale)}</g>`;
  return out;
}

function laurelMask(): string {
  const body = [
    branch([[30, 150], [55, 115], [90, 95], [135, 82]], 9),
    branch([[300, 70], [270, 60], [235, 66], [205, 40]], 7, 0.85),
    branch([[180, 300], [210, 270], [250, 262], [295, 268]], 8, 0.95),
    branch([[60, 300], [70, 270], [65, 240], [85, 205]], 6, 0.8),
  ].join('');
  // ягоды и редкие звёздочки-«астериски» — сноски на полях
  const dots = [[160, 180], [168, 188], [152, 190], [40, 40]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4"/>`)
    .join('');
  const stars = [[245, 165], [110, 225]]
    .map(([x, y]) => `<path d="M${x} ${y - 6}v12M${x - 5.2} ${y - 3}l10.4 6M${x - 5.2} ${y + 3}l10.4-6"/>`)
    .join('');
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" fill="none" stroke="#000" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}<g fill="#000" stroke="none">${dots}</g>${stars}</svg>`,
  );
}

/** Генерирует маски и кладёт их в CSS-переменные на :root. */
export async function installWallpaperAssets() {
  const root = document.documentElement;
  root.style.setProperty('--wp-laurel', laurelMask());
  const glyphs = await glyphMask();
  if (glyphs) root.style.setProperty('--wp-glyphs', glyphs);
}

let step = 0;
/** Сдвиг градиента «Сада» на новое сообщение — как в Telegram. */
export function stepWallpaper() {
  step = (step + 1) % 4;
  document.documentElement.dataset.wpStep = String(step);
}
