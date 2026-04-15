import os
import re
import uuid
import logging
from pathlib import Path
import urllib.parse
import requests
from urllib.parse import urlencode
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

logger = logging.getLogger(__name__)


def _get_db_path() -> str:
    from backend.config_manager import DB_PATH
    return DB_PATH


class EmailService:
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        self.redirect_uri = "http://127.0.0.1:8000/auth/zoho/callback"
        self.zoho_client_id = os.getenv("ZOHO_CLIENT_ID")
        self.zoho_client_secret = os.getenv("ZOHO_CLIENT_SECRET")

    @property
    def username(self):
        return os.getenv("GMAIL_USER")

    @property
    def password(self):
        return os.getenv("GMAIL_APP_PASSWORD")

    @property
    def api_url(self):
        return os.getenv("API_URL", "http://127.0.0.1:8000").rstrip("/")
    
    #Obtener la URL para solicitar el acceso a zoho
    async def get_zoho_creds(self) -> str:
        params = {
        "client_id": self.zoho_client_id,
        "response_type": "code",
        "redirect_uri": self.redirect_uri,
        "scope": "ZohoMail.messages.CREATE,ZohoMail.accounts.READ",
        "access_type": "offline",
        "prompt": "consent"
        }
        url = f"https://accounts.zoho.com/oauth/v2/auth?{urlencode(params)}"
        logger.info(f"URL: {url}")
        return url

    def process_html_for_inline_images(self, html_content: str, message: MIMEMultipart) -> str:
        """Replace local image <img src> URLs with inline CID attachments."""
        img_pattern = re.compile(r'src="([^"]+)"', re.IGNORECASE)
        processed = html_content

        for url in img_pattern.findall(html_content):
            parsed = urllib.parse.urlparse(url)
            path = parsed.path
            is_local = (
                "localhost" in url
                or "127.0.0.1" in url
                or url.startswith(self.api_url)
                or url.startswith("/images/")
                or url.startswith("/uploads/")
            )
            if not is_local:
                continue

            file_path = None
            if path.startswith("/images/"):
                file_path = Path("generated_images") / path.replace("/images/", "")
            elif path.startswith("/uploads/"):
                file_path = Path("uploads") / path.replace("/uploads/", "")

            if file_path and file_path.exists():
                try:
                    cid = f"img_{uuid.uuid4().hex}"
                    img_data = file_path.read_bytes()
                    ext = file_path.suffix.lower().lstrip(".")
                    if ext == "jpg":
                        ext = "jpeg"
                    img = MIMEImage(img_data, _subtype=ext)
                    img.add_header("Content-ID", f"<{cid}>")
                    img.add_header("Content-Disposition", "inline")
                    message.attach(img)
                    processed = processed.replace(url, f"cid:{cid}")
                    logger.info(f"Inlined image {file_path} as {cid}")
                except Exception as e:
                    logger.error(f"Failed to inline {file_path}: {e}")

        return processed
    
    def upload_zoho_attachment(self, file_path: Path):
        account_id = os.getenv("ZOHO_ACCOUNT_ID")
        access_token = os.getenv("ZOHO_ACCESS_TOKEN")
        logger.info(f"[attachment] uploading {file_path.name} | account_id={account_id} | token={'SET' if access_token else 'MISSING'}")

        url = f"https://mail.zoho.com/api/accounts/{account_id}/attachments"
        headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

        with open(file_path, 'rb') as f:
            files = {'file': (file_path.name, f, 'image/png')}
            response = requests.post(url, headers=headers, files=files)

        logger.info(f"[attachment] Zoho response {response.status_code}: {response.text[:300]}")
        response.raise_for_status()
        body = response.json()
        # data can be a dict or a list depending on Zoho's version
        data = body.get("data", body)
        if isinstance(data, list):
            data = data[0]
        return data

    async def send_email(self, to_email: str, subject: str, body_html: str):
        """Send an HTML email via Zoho Mail API. Images must be base64-embedded in body_html."""
        account_id = os.getenv("ZOHO_ACCOUNT_ID")
        if not account_id:
            account_id = self.getZohoAccountID()
        url = f"https://mail.zoho.com/api/accounts/{account_id}/messages"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Zoho-oauthtoken {os.getenv('ZOHO_ACCESS_TOKEN')}"
        }
        data = {
            "fromAddress": os.getenv("ZOHO_EMAIL"),
            "toAddress": to_email,
            "subject": subject,
            "content": body_html,
            "mailFormat": "html",
        }
        response = requests.post(url=url, headers=headers, json=data)
        if response.status_code in [200, 201, 202]:
            logger.info(f"Email sent to {to_email}")
        else:
            logger.error(f"Error {response.status_code} at {url}: {response.text}")
            raise Exception(f"Zoho API error {response.status_code}: {response.text}")
    #Obtener el access token en startup o en renovacion
    def get_access_token(self):
        try:
            params = {
                "refresh_token":os.getenv("ZOHO_REFRESH_TOKEN"),
                "grant_type":"refresh_token",
                "client_id":self.zoho_client_id,
                "client_secret":self.zoho_client_secret,
                "scope":"ZohoMail.messages.CREATE,ZohoMail.accounts.READ",
            }
            url = f"https://accounts.zoho.com/oauth/v2/token?{urlencode(params)}"
            response = requests.post(url=url)
            json_dict = response.json()
            os.environ["ZOHO_ACCESS_TOKEN"] = json_dict["access_token"]
            logger.info("New access token requested")
        except Exception as error:
            logger.error(f"Can't request a new zoho access token: {error}")
    #Obtener el account ID necesario para enviar emails
    def getZohoAccountID(self) -> str:
        try:
            url = "https://mail.zoho.com/api/accounts"
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Zoho-oauthtoken {os.getenv('ZOHO_ACCESS_TOKEN')}"
            }
            
            response = requests.get(url=url, headers=headers)
            logger.info(f"DEBUG: URL: {url}")
            logger.info(f"DEBUG: Status Code: {response.status_code}")
            logger.info(f"DEBUG: Response Text: {response.text}")
            response_dict = response.json()
            if response.status_code == 200:
                accounts = response_dict.get("data", [])
                if accounts:
                    account_id = accounts[0].get("accountId")
                    if account_id:
                        os.environ["ZOHO_ACCOUNT_ID"] = str(account_id)
                        logger.info(f"Account ID: {account_id}")
                        return str(account_id)
                logger.warning("No data in get zoho account id.")
            else:
                logger.error(f"Can not get zoho account id: {response_dict.get('status')}")
        except Exception as error:
            logger.error(f"Fatal error in Zoho Account ID: {error}")
        
        return ""

email_service = EmailService()
