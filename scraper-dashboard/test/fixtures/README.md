# Fixtures

Saved category pages of books.toscrape.com, the public sandbox built for scraping practice:
`travel_2` (11 books, 1 page), `mystery_3` (32 books, 2 pages), `classics_6` (19 books, 1 page).

How they were made: the build sandbox could not reach books.toscrape.com (its egress proxy blocks the host), so
these four pages were rebuilt by hand with the site's listing markup (`article.product_pod`, `p.price_color`,
`p.star-rating <Word>`, `p.instock availability`, `li.next > a`, relative `../../../<slug>_<n>/index.html` links).
Titles are the site's books; prices and ratings are approximate. The site itself says its prices and ratings are
random and have no real meaning.

To replace them with byte-exact copies of the live pages, run this on a machine with internet:

```bash
npm run fixtures
```

Then run `npm test`. Most checks are structural (ids, links, pagination, stock, change detection). A few pin
exact values (11 / 32 / 19 books, "It's Only the Himalayas" at £45.17, "Emma" at £32.93). If the live pages
differ, update those numbers in `test/*.test.mjs`.
