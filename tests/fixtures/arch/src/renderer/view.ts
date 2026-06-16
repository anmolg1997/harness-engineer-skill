import fs from 'fs';

export function loadView() {
  return fs.readFileSync('view.html', 'utf8');
}
