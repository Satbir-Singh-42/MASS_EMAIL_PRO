"""
Mass Email PRO — Flask Web Backend
Sends bulk personalised emails via SMTP or Google OAuth 2.0 (Gmail API).
"""

from flask import Flask, request, jsonify, render_template, send_file, session, redirect, url_for
import smtplib, ssl, os, base64, urllib.parse
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "mass_email_pro_secret_key_2026")


@app.after_request
def add_cache_control_header(response):
    if request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# ── Pages ─────────────────────────────────────────────────────────────────────
@app.route("/")
def landing():
    return render_template("landing.html")


@app.route("/app")
def app_wizard():
    return render_template("index.html")


@app.route("/privacy")
def privacy():
    return render_template("privacy.html")


@app.route("/terms")
def terms():
    return render_template("terms.html")


@app.route("/support")
def support():
    return render_template("support.html")


@app.route("/robots.txt")
def robots():
    return send_file("static/robots.txt")


@app.route("/sitemap.xml")
def sitemap():
    return send_file("static/sitemap.xml", mimetype="application/xml")


@app.route("/googleRWffIP77RFnfEfQH68EfbpH0iTkj_YN133A8iu9cxfM.html")
@app.route("/googleRWffIP77RFnfEfQH68EfbpH0iTkj_YN133A8iu9cxfM")
def google_verification():
    return "google-site-verification: googleRWffIP77RFnfEfQH68EfbpH0iTkj_YN133A8iu9cxfM.html", 200, {"Content-Type": "text/html"}


@app.route("/google0e43b0b2a60084a0.html")
def google_verification_2():
    return "google-site-verification: google0e43b0b2a60084a0.html", 200, {"Content-Type": "text/html"}


# ── Google OAuth 2.0 Endpoints ────────────────────────────────────────────────
@app.route("/auth/google/login")
def google_login():
    client_id = session.get("google_client_id") or os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        return redirect("/app?error=missing_client_id")

    redirect_uri = request.host_url.rstrip("/") + "/auth/google/callback"
    scope = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email"
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent"
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return redirect(url)


@app.route("/auth/google/callback")
def google_callback():
    code = request.args.get("code")
    error = request.args.get("error")
    if error or not code:
        return redirect("/app?error=auth_failed")

    client_id = session.get("google_client_id") or os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = session.get("google_client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = request.host_url.rstrip("/") + "/auth/google/callback"

    try:
        # Exchange authorization code for access token
        token_res = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            },
            timeout=10
        )
        token_data = token_res.json()
        access_token = token_data.get("access_token")

        if not access_token:
            return redirect("/app?error=token_exchange_failed")

        # Fetch authenticated user's email
        user_res = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10
        )
        user_data = user_res.json()
        user_email = user_data.get("email", "")

        session["google_oauth"] = {
            "access_token": access_token,
            "refresh_token": token_data.get("refresh_token", ""),
            "email": user_email
        }
        return redirect("/app?google_auth=success")
    except Exception as e:
        print("Google OAuth error:", e)
        return redirect("/app?error=" + urllib.parse.quote(str(e)))


@app.route("/api/auth/google/status")
def google_status():
    oauth_data = session.get("google_oauth")
    client_id = session.get("google_client_id") or os.environ.get("GOOGLE_CLIENT_ID", "")
    has_credentials = bool(client_id)
    if oauth_data and oauth_data.get("email"):
        return jsonify({
            "authenticated": True,
            "email": oauth_data.get("email"),
            "access_token": oauth_data.get("access_token"),
            "has_credentials": has_credentials
        })
    return jsonify({
        "authenticated": False,
        "has_credentials": has_credentials,
        "client_id": client_id
    })


@app.route("/api/auth/google/set_token", methods=["POST"])
def google_set_token():
    data = request.get_json() or {}
    token = data.get("access_token")
    email = data.get("email", "")

    if not token:
        return jsonify({"ok": False, "error": "Access token required"}), 400

    # If email not provided, fetch from Google API
    if not email:
        try:
            r = requests.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10
            )
            email = r.json().get("email", "")
        except Exception:
            pass

    session["google_oauth"] = {
        "access_token": token,
        "email": email
    }
    return jsonify({"ok": True, "email": email})


@app.route("/api/auth/google/logout", methods=["POST"])
def google_logout():
    session.pop("google_oauth", None)
    return jsonify({"ok": True})



# ── API: Test SMTP Connection ─────────────────────────────────────────────────
@app.route("/api/test_smtp", methods=["POST"])
def api_test_smtp():
    data = request.get_json()
    try:
        port = int(data.get("port", 587))
        ctx  = ssl.create_default_context()
        if data.get("enc") == "ssl":
            with smtplib.SMTP_SSL(data["server"], port, context=ctx) as s:
                s.login(data["email"], data["password"])
        else:
            with smtplib.SMTP(data["server"], port, timeout=10) as s:
                s.starttls(context=ctx)
                s.login(data["email"], data["password"])
        return jsonify({"ok": True})
    except smtplib.SMTPAuthenticationError:
        return jsonify({"ok": False, "error": "Authentication failed — use an App Password for Gmail"}), 200
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 200


# ── API: Send a Single Email ───────────────────────────────────────────────────
@app.route("/api/send_email", methods=["POST"])
def api_send_email():
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    data = request.get_json()
    auth_mode = data.get("auth_mode", "smtp")

    try:
        sender_email = data.get("email") or session.get("google_oauth", {}).get("email")
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"{data.get('sender_name', '')} <{sender_email}>" if data.get('sender_name') else sender_email
        msg["To"]      = data["to"]
        msg["Subject"] = data["subject"]
        if data.get("reply_to"):
            msg["Reply-To"] = data["reply_to"]
        if data.get("cc"):
            msg["Cc"] = data["cc"]

        body_type = "html" if data.get("format") == "html" else "plain"
        msg.attach(MIMEText(data.get("body", ""), body_type, "utf-8"))

        attachment_paths = data.get("attachment_paths", [])
        if isinstance(attachment_paths, str):
            attachment_paths = [attachment_paths]
            
        for path in attachment_paths:
            path = path.strip()
            if os.path.exists(path):
                from email.mime.base import MIMEBase
                from email import encoders
                with open(path, "rb") as f:
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    f"attachment; filename={os.path.basename(path)}"
                )
                msg.attach(part)

        cloud_attachments = data.get("attachments", [])
        for att in cloud_attachments:
            filename = att.get("filename")
            b64_content = att.get("content")
            if filename and b64_content:
                if "," in b64_content:
                    b64_content = b64_content.split(",", 1)[1]
                try:
                    from email.mime.base import MIMEBase
                    from email import encoders
                    file_data = base64.b64decode(b64_content)
                    part = MIMEBase("application", "octet-stream")
                    part.set_payload(file_data)
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f"attachment; filename={filename}")
                    msg.attach(part)
                except Exception as e:
                    print(f"Failed to attach {filename}: {e}")

        # ── Google OAuth Mode (Gmail REST API) ──
        if auth_mode == "oauth":
            access_token = data.get("access_token") or session.get("google_oauth", {}).get("access_token")
            if not access_token:
                return jsonify({"ok": False, "error": "Google OAuth access token missing. Please sign in with Google."}), 200

            # Encode raw MIME message to base64url format required by Gmail API
            raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
            
            res = requests.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={"raw": raw_message},
                timeout=15
            )

            if res.status_code in (200, 202):
                return jsonify({"ok": True})
            else:
                err_data = res.json().get("error", {})
                err_msg = err_data.get("message", res.text)
                if res.status_code == 401:
                    err_msg = "Google OAuth token expired or revoked. Please sign in with Google again."
                return jsonify({"ok": False, "error": f"Gmail API error ({res.status_code}): {err_msg}"}), 200

        # ── Manual SMTP Mode ──
        else:
            port       = int(data.get("port", 587))
            ctx        = ssl.create_default_context()
            recipients = [data["to"]]
            if data.get("cc"):
                recipients += [x.strip() for x in data["cc"].split(",") if x.strip()]
            if data.get("bcc"):
                recipients += [x.strip() for x in data["bcc"].split(",") if x.strip()]

            if data.get("enc") == "ssl":
                with smtplib.SMTP_SSL(data["server"], port, context=ctx) as s:
                    s.login(data["email"], data["password"])
                    s.sendmail(data["email"], recipients, msg.as_string())
            else:
                with smtplib.SMTP(data["server"], port, timeout=15) as s:
                    s.starttls(context=ctx)
                    s.login(data["email"], data["password"])
                    s.sendmail(data["email"], recipients, msg.as_string())

            return jsonify({"ok": True})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 200


@app.after_request
def add_security_headers(response):
    response.headers["X-Frame-Options"]         = "SAMEORIGIN"
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["Cache-Control"]           = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"]                  = "no-cache"
    response.headers["Expires"]                 = "0"
    return response


if __name__ == "__main__":
    print("Mass Email PRO running at http://127.0.0.1:5001")
    app.run(debug=True, port=5001)

