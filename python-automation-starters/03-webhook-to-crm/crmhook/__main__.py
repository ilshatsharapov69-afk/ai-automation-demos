"""python -m crmhook — picks the CRM from env and serves the webhook with uvicorn."""
import logging
import os

import uvicorn

from .app import create_app
from .crm import AmoCRMClient, Bitrix24Client, MemoryCRM
from .notify import TelegramNotifier


def build_from_env():
    kind = os.getenv("CRM", "memory").lower()
    if kind == "amocrm":
        crm = AmoCRMClient(
            os.environ["AMO_BASE_URL"], os.environ["AMO_TOKEN"],
            pipeline_id=int(os.environ["AMO_PIPELINE_ID"]) if os.getenv("AMO_PIPELINE_ID") else None,
            status_id=int(os.environ["AMO_STATUS_ID"]) if os.getenv("AMO_STATUS_ID") else None,
        )
        name = "amoCRM"
    elif kind == "bitrix24":
        crm, name = Bitrix24Client(os.environ["BITRIX_WEBHOOK_URL"]), "Bitrix24"
    else:
        logging.warning("CRM=memory: leads are only logged. Set CRM=amocrm or CRM=bitrix24.")
        crm, name = MemoryCRM(), "MemoryCRM"
    notifier = None
    if os.getenv("TG_BOT_TOKEN") and os.getenv("TG_CHAT_ID"):
        notifier = TelegramNotifier(os.environ["TG_BOT_TOKEN"], os.environ["TG_CHAT_ID"])
    return create_app(crm, secret=os.getenv("WEBHOOK_SECRET", ""), crm_name=name, notifier=notifier)


def main() -> None:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(build_from_env(), host="0.0.0.0", port=int(os.getenv("PORT", "8000")))


if __name__ == "__main__":
    main()
