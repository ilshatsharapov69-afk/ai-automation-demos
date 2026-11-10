"""Builds the HTML for the three screenshots from REAL output of this kit:
  tests.html   – ./run_tests.sh output
  booking.html – a booking conversation run through the real Dispatcher with the offline fake Telegram
  faq.html     – python -m faqbot answers (stub provider)
Then `node shots/render.mjs` turns shots/src/*.html into shots/*.png.
Run from python-automation-starters with the starters' requirements installed."""
from __future__ import annotations

import asyncio
import html
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

KIT = Path(__file__).resolve().parent.parent
SRC = KIT / "shots" / "src"

CSS = """
:root { --bg:#0f1115; --panel:#171a21; --text:#e6e6e6; --muted:#8b93a1; --ok:#5fd38d; --accent:#6aa7ff;
        --bot:#1f2530; --me:#2b5278; --btn:#243041; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { padding:28px 32px; }
h1 { font-size:20px; margin:0 0 4px; }
.sub { color:var(--muted); margin:0 0 18px; font-size:14px; }
pre { background:var(--panel); border-radius:10px; padding:18px 20px; margin:0; font:13.5px/1.5 "JetBrains Mono", Menlo, Consolas, monospace; white-space:pre-wrap; }
.ok { color:var(--ok); } .dim { color:var(--muted); } .q { color:var(--accent); }
.cols { display:grid; grid-template-columns: 1.25fr 1fr; gap:22px; }
.chat { background:var(--panel); border-radius:12px; padding:14px; }
.chat h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 10px; }
.msg { max-width:88%; padding:8px 12px; border-radius:12px; margin:6px 0; white-space:pre-wrap; }
.bot { background:var(--bot); border-top-left-radius:4px; }
.me { background:var(--me); margin-left:auto; border-top-right-radius:4px; }
.tap { margin-left:auto; color:var(--muted); font-size:12.5px; text-align:right; max-width:88%; }
.kb { display:flex; flex-wrap:wrap; gap:4px; margin:4px 0 8px; max-width:88%; }
.kb span { background:var(--btn); color:#cfe0ff; padding:5px 9px; border-radius:7px; font-size:13px; }
"""


def page(title: str, sub: str, body: str, width: int) -> str:
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS} body{{width:{width}px}}</style></head>'
            f'<body><div class="wrap"><h1>{html.escape(title)}</h1><p class="sub">{html.escape(sub)}</p>{body}</div></body></html>')


def tests_html() -> str:
    out = subprocess.run(["bash", str(KIT / "run_tests.sh")], capture_output=True, text=True, cwd=KIT).stdout
    lines = []
    for line in out.splitlines():
        esc = html.escape(re.sub(r" {3,}", "  ", line))
        if line.startswith("==="):
            lines.append(f'<span class="q">{esc}</span>')
        elif " passed" in line:
            lines.append(f'<span class="ok">{esc}</span>')
        else:
            lines.append(f'<span class="dim">{esc}</span>')
    total = sum(int(l.split()[0]) for l in out.splitlines() if " passed" in l)
    return page("Python automation starters: 5 starters, all tests offline",
                f"./run_tests.sh — {total} tests, no tokens or network (fake Telegram, mocked Google / CRM / LLM APIs)",
                f"<pre>{chr(10).join(lines)}</pre>", 900)


async def booking_html() -> str:
    sys.path[:0] = [str(KIT / "02-tg-booking-bot")]
    from aiogram.methods import EditMessageText, SendMessage

    from bookingbot.bot import AdminAct, BookIt, Menu, Pick, build_dispatcher
    from bookingbot.db import Repo
    from tests.fakebot import TgSim

    admin, client = 777, 100
    sim = TgSim(build_dispatcher(Repo(":memory:"), admin_ids=(admin,), clock=lambda: datetime(2026, 11, 5, 9, 0)))
    chats: dict[int, list[str]] = {client: [], admin: []}
    labels: dict[str, str] = {}

    def render_new(start: int) -> None:
        for r in sim.session.requests[start:]:
            if not isinstance(r, (SendMessage, EditMessageText)):
                continue
            text = r.text.replace("<a href", "<span data-href").replace("</a>", "</span>")
            chats[r.chat_id].append(f'<div class="msg bot">{text}</div>')
            if r.reply_markup:
                buttons = [b for row in r.reply_markup.inline_keyboard for b in row]
                for b in buttons:
                    labels[b.callback_data] = b.text
                chats[r.chat_id].append('<div class="kb">' + "".join(
                    f"<span>{html.escape(b.text)}</span>" for b in buttons) + "</div>")

    async def say(text, user=client):
        start = len(sim.session.requests)
        chats[user].append(f'<div class="msg me">{html.escape(text)}</div>')
        await sim.send(text, user_id=user)
        render_new(start)

    async def tap(data, user=client):
        start = len(sim.session.requests)
        chats[user].append(f'<div class="tap">tapped “{html.escape(labels.get(data, data))}”</div>')
        # Telegram gives the handler the message the button sits on, as plain text.
        last = [r for r in sim.session.requests if isinstance(r, (SendMessage, EditMessageText)) and r.chat_id == user]
        plain = re.sub(r"<[^>]+>", "", last[-1].text) if last else ""
        await sim.click(data, user_id=user, message_text=html.unescape(plain))
        render_new(start)

    await say("/start")
    await tap(Menu(action="book").pack())
    await tap(Pick(svc="cut").pack())
    await tap(Pick(svc="cut", day="20261106").pack())
    await tap(Pick(svc="cut", day="20261106", hm="1200").pack())
    await tap(BookIt(svc="cut", day="20261106", hm="1200").pack())
    await tap(AdminAct(action="ok", id=1).pack(), user=admin)
    body = (f'<div class="cols"><div class="chat"><h2>Client</h2>{"".join(chats[client])}</div>'
            f'<div class="chat"><h2>Admin</h2>{"".join(chats[admin])}</div></div>')
    return page("02 · Booking bot: service → day → time → admin confirms",
                "Rendered from a real run of the bot's handlers with the offline fake Telegram (tests/fakebot.py)",
                body, 1100)


def faq_html() -> str:
    questions = ["Сколько стоит доставка?", "можно торт на свадьбу заказать?", "how much is shipping",
                 "can I pay with cash", "есть ли парковка рядом?"]
    blocks = []
    for q in questions:
        out = subprocess.run([sys.executable, "-m", "faqbot", q], capture_output=True, text=True,
                             cwd=KIT / "05-llm-faq").stdout.rstrip()
        answer, _, meta = out.partition("\n")
        blocks.append(f'<span class="q">$ python -m faqbot "{html.escape(q)}"</span>\n{html.escape(answer)}\n'
                      f'<span class="dim">{html.escape(meta.strip())}</span>')
    return page("05 · FAQ answerer, offline stub provider",
                "Same pipeline with Ollama / Workers AI / OpenAI-compatible / Claude: one env variable. "
                "Off-topic questions are handed to a human, the model is not called.",
                f"<pre>{chr(10).join(b + chr(10) for b in blocks)}</pre>", 900)


def main() -> None:
    SRC.mkdir(parents=True, exist_ok=True)
    (SRC / "tests.html").write_text(tests_html(), encoding="utf-8")
    (SRC / "booking.html").write_text(asyncio.run(booking_html()), encoding="utf-8")
    (SRC / "faq.html").write_text(faq_html(), encoding="utf-8")
    print("written:", ", ".join(p.name for p in sorted(SRC.glob("*.html"))))


if __name__ == "__main__":
    main()
