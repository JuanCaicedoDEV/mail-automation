import os
from google_auth_oauthlib.flow import Flow

client_id = os.getenv("GOOGLE_CLIENT_ID", "")
client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")

client_config = {
    "web": {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

redirect_uri = "http://127.0.0.1:8000/auth/zoho/callback"
SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/userinfo.email']

flow = Flow.from_client_config(
    client_config,
    scopes=SCOPES,
    redirect_uri=redirect_uri
)

authorization_url, state = flow.authorization_url(
    access_type='offline',
    include_granted_scopes='true',
    prompt='consent'
)

print(authorization_url)
