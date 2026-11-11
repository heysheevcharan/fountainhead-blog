// Records the year each Goodreads book first shows up on the "read" shelf.
// Run nightly by .github/workflows/daily-rebuild.yml, which commits any change.
// The widget has no read dates, so "first seen" stands in for "year read".
// To correct a year by hand, edit src/data/book-years.json.

import { readFile, writeFile } from 'node:fs/promises';
import { fetchReadShelf } from '../src/lib/goodreads.js';

const FILE = new URL('../src/data/book-years.json', import.meta.url);

const years = JSON.parse(await readFile(FILE, 'utf8'));
const thisYear = new Date().getUTCFullYear();

const added = [];
for (const book of await fetchReadShelf()) {
  if (!(book.id in years)) {
    years[book.id] = thisYear;
    added.push(book.title);
  }
}

if (added.length) {
  const sorted = Object.fromEntries(Object.entries(years).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(FILE, JSON.stringify(sorted, null, 2) + '\n');
}
console.log(added.length ? `Added ${added.length} book(s) to ${thisYear}: ${added.join('; ')}` : 'No new books.');
