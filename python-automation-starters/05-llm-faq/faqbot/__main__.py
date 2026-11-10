"""python -m faqbot "question"   — one answer
python -m faqbot              — interactive console
python -m faqbot --telegram   — Telegram bot (needs BOT_TOKEN)"""
from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from .answerer import FaqAnswerer
from .kb import KnowledgeBase
from .providers import make_provider

DEFAULT_FAQ = Path(__file__).resolve().parent.parent / "faq.json"


def require_token() -> str:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("BOT_TOKEN is not set: get one from @BotFather and put it into .env (see .env.example)")
    return token


def build(env=os.environ) -> FaqAnswerer:
    kb = KnowledgeBase.load(env.get("FAQ_PATH", DEFAULT_FAQ))
    threshold = env.get("MIN_CONFIDENCE", "").strip()
    return FaqAnswerer(kb, make_provider(env), min_confidence=float(threshold) if threshold else None)


def show(answerer: FaqAnswerer, question: str) -> None:
    a = answerer.answer(question)
    tag = "handoff" if a.handoff else f"{a.provider}, sources: {', '.join(a.sources)}"
    print(f"{a.text}\n  [{tag}; confidence {a.confidence:.2f}]")


def main(argv: list[str] | None = None) -> int:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    p = argparse.ArgumentParser(prog="faqbot")
    p.add_argument("question", nargs="*")
    p.add_argument("--telegram", action="store_true")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    answerer = build()

    if args.telegram:
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode

        from .telegram import build_dispatcher

        admin = os.getenv("ADMIN_CHAT_ID", "").strip()
        bot = Bot(require_token(), default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        dp = build_dispatcher(answerer, admin_chat_id=int(admin) if admin else None)
        asyncio.run(dp.start_polling(bot))
        return 0
    if args.question:
        show(answerer, " ".join(args.question))
        return 0
    print(f"Provider: {answerer.provider.name}. Ask a question (empty line to quit).")
    for line in sys.stdin:
        if not line.strip():
            break
        show(answerer, line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
