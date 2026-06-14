"""
Mass Email PRO — Flask Web Backend
Sends bulk personalised emails via SMTP.
"""

from flask import Flask, request, jsonify, render_template, send_file
import smtplib, ssl, os

app = Flask(__name__)


# ── Pages ─────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
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
    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = f"{data.get('sender_name', '')} <{data['email']}>"
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
                    import base64
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
    return response


if __name__ == "__main__":
    print("Mass Email PRO running at http://127.0.0.1:5001")
    app.run(debug=True, port=5001)
