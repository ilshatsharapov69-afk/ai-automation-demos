"""python -m form2sheets — reads .env, picks Google Sheets or CSV, starts long polling."""
import asyncio
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from .bot import build_dispatcher
from .form import sheet_headers
from .sheets import CsvWriter, GoogleSheetWriter


def require_token() -> str:
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("BOT_TOKEN is not set: get one from @BotFather and put it into .env (see .env.example)")
    return token


def make_writer():
    sheet_id = os.getenv("SHEET_ID", "").strip()
    if sheet_id:
        return GoogleSheetWriter(
            spreadsheet_id=sheet_id,
            worksheet=os.getenv("WORKSHEET", "Leads"),
            headers=sheet_headers(),
            credentials_file=os.getenv("GOOGLE_CREDENTIALS", "service_account.json"),
        )
    path = os.getenv("CSV_PATH", "leads.csv")
    logging.warning("SHEET_ID is empty: writing to %s instead of Google Sheets", path)
    return CsvWriter(path, headers=sheet_headers())


async def main() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    logging.basicConfig(level=logging.INFO)
    tz = ZoneInfo(os.getenv("TZ_NAME", "UTC"))
    admin = os.getenv("ADMIN_CHAT_ID", "").strip()
    bot = Bot(require_token(), default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = build_dispatcher(make_writer(), admin_chat_id=int(admin) if admin else None,
                          clock=lambda: datetime.now(tz))
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
