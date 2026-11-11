// Goodreads retired shelf RSS feeds (review/list_rss) in late Oct 2026, and review
// pages now need sign-in. The public shelf widget still works, but it has no read
// dates, so years live in src/data/book-years.json (see scripts/sync-book-years.mjs).

export const WIDGET_URL =
  'https://www.goodreads.com/review/custom_widget/74097056?shelf=read&sort=date_read&order=d&num_books=100&widget_id=1';

/** @typedef {{ id: string, title: string, author: string, link: string }} Book */

// The widget is a JS file that assigns an escaped HTML string; unescape it as text.
const unescapeJs = (s) => s.replace(/\\n/g, '\n').replace(/\\(["'\/\\])/g, '$1');

const decodeEntities = (s) =>
  s.replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** Fetches the "read" shelf, newest first. Throws if Goodreads doesn't answer. */
export async function fetchReadShelf() {
  const res = await fetch(WIDGET_URL);
  if (!res.ok) throw new Error(`Goodreads widget returned ${res.status}`);
  const html = unescapeJs(await res.text());

  /** @type {Book[]} */
  const books = html
    .split('class="gr_custom_each_container_1"')
    .slice(1)
    .flatMap((entry) => {
      const t = entry.match(/class="gr_custom_title_1">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      const id = t?.[1].match(/review\/show\/(\d+)/)?.[1];
      if (!t || !id) return [];
      const author = entry.match(/class="gr_custom_author_1">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '';
      return [{
        id,
        title: decodeEntities(t[2]),
        author: decodeEntities(author),
        link: `https://www.goodreads.com/review/show/${id}`,
      }];
    });

  if (books.length === 0) throw new Error('Goodreads widget returned no books');
  return books;
}
