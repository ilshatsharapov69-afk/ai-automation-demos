"""Parse one page with a SiteConfig, then walk pages (next link or page numbers) with guards."""
from __future__ import annotations

import logging
from typing import Any, Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from .fetch import Fetcher, NotFound
from .sites import SiteConfig

log = logging.getLogger(__name__)


def select_value(node: Tag, spec: str) -> str:
    """'css' -> text, 'css@attr' -> attribute, '@attr' -> attribute of node itself."""
    css, _, attr = spec.partition("@")
    target = node.select_one(css) if css.strip() else node
    if target is None:
        return ""
    if attr:
        value = target.get(attr, "")
        return " ".join(value) if isinstance(value, list) else str(value).strip()
    return " ".join(target.get_text(" ", strip=True).split())


def parse_page(html: str, page_url: str, cfg: SiteConfig) -> tuple[list[dict[str, Any]], str | None]:
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for node in soup.select(cfg.item):
        row: dict[str, Any] = {}
        for name, spec in cfg.fields.items():
            raw = select_value(node, spec)
            if name in cfg.absolute and raw:
                raw = urljoin(page_url, raw)
            row[name] = cfg.clean[name](raw) if name in cfg.clean else raw
        items.append(row)
    next_url = None
    if cfg.next_page:
        href = select_value(soup, cfg.next_page)
        next_url = urljoin(page_url, href) if href else None
    return items, next_url


def crawl(cfg: SiteConfig, fetcher: Fetcher, *, max_pages: int = 50, max_items: int | None = None,
          start_page: int = 1) -> Iterator[dict[str, Any]]:
    """Yields rows. Stops at: no next link / 404 in page-number mode / empty page / a page seen before /
    max_pages / max_items. Rows with an already seen `key` are skipped."""
    page = start_page
    url = cfg.page_url.format(page=page) if cfg.page_url else cfg.start_url
    seen_pages: set[str] = set()
    seen_keys: set[Any] = set()
    produced = 0
    while url and page < start_page + max_pages:
        if url in seen_pages:
            log.warning("Pagination loop at %s, stopping", url)
            break
        seen_pages.add(url)
        try:
            html = fetcher.get(url)
        except NotFound:
            if cfg.page_url:  # ran past the last page number
                break
            raise
        items, next_url = parse_page(html, url, cfg)
        log.info("page %s: %s items", page, len(items))
        if not items:
            break
        for row in items:
            key = row.get(cfg.key)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            yield row
            produced += 1
            if max_items is not None and produced >= max_items:
                return
        page += 1
        url = cfg.page_url.format(page=page) if cfg.page_url else next_url
