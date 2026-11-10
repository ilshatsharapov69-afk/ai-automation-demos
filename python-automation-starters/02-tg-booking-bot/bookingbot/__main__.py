"""python -m bookingbot — reads .env, opens SQLite, starts long polling."""
import asyncio
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from .bot import build_dispatcher
from .db import Repo


def require_token() -> str:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("BOT_TOKEN is not set: get one from @BotFather and put it into .env (see .env.example)")
    return token


async def main() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    logging.basicConfig(level=logging.INFO)
    tz = ZoneInfo(os.getenv("TZ_NAME", "UTC"))
    admins = tuple(int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x)
    if not admins:
        logging.warning("ADMIN_IDS is empty: nobody will receive new bookings")
    bot = Bot(require_token(), default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    # Naive local time of the business: what the client sees on the buttons.
    dp = build_dispatcher(Repo(os.getenv("DB_PATH", "bookings.db")), admin_ids=admins,
                          clock=lambda: datetime.now(tz).replace(tzinfo=None))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
