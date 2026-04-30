import { watch } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const DEBOUNCE_MS = 30_000;
const DIRS = ['app', 'components', 'lib', 'public'];

let timer = null;

function deploy() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const changes = execSync('git status --porcelain').toString().trim();
    if (!changes) return;
    try {
      execSync('git add -A && git commit -m "auto update" && git push', { stdio: 'inherit' });
      console.log('[auto-deploy] Done — Vercel מתעדכן תוך ~90 שניות');
    } catch {
      console.error('[auto-deploy] שגיאה בעלייה');
    }
  }, DEBOUNCE_MS);
  console.log('[auto-deploy] זוהה שינוי — מעלה בעוד 30 שניות...');
}

for (const dir of DIRS) {
  try {
    watch(join(process.cwd(), dir), { recursive: true }, deploy);
  } catch {}
}

console.log('[auto-deploy] רץ ברקע — כל שינוי יעלה אוטומטית');
