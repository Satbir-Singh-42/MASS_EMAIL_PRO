<div align="center">

  <img src="https://mass-email-pro.vercel.app/static/logo.png" alt="Mass Email PRO Logo" width="120" height="120" style="border-radius: 28px; box-shadow: 0 12px 36px rgba(99,102,241,0.3);" />

  # Mass Email PRO 🚀
  ### Modern, Browser-Based Bulk Email & Mail Merge Suite

  [![Production](https://img.shields.io/badge/Vercel-Live%20App-6366f1?style=for-the-badge&logo=vercel&logoColor=white)](https://mass-email-pro.vercel.app)
  [![Google OAuth 2.0](https://img.shields.io/badge/Google-OAuth%202.0%20Verified-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://mass-email-pro.vercel.app/privacy)
  [![Python](https://img.shields.io/badge/Flask-3.x-22c55e?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
  [![Privacy](https://img.shields.io/badge/Privacy-100%25%20In--Memory-a78bfa?style=for-the-badge&logo=shield&logoColor=white)](https://mass-email-pro.vercel.app/privacy)

  [**🚀 Launch App**](https://mass-email-pro.vercel.app/app) &nbsp;•&nbsp; [**📖 Privacy Policy**](https://mass-email-pro.vercel.app/privacy) &nbsp;•&nbsp; [**⚖️ Terms of Service**](https://mass-email-pro.vercel.app/terms) &nbsp;•&nbsp; [**💬 Support & FAQs**](https://mass-email-pro.vercel.app/support)

</div>

---

## 🌟 Overview

**Mass Email PRO** is a privacy-first, zero-subscription web application designed for entrepreneurs, marketers, and developers. Send personalized bulk email campaigns effortlessly using **Google OAuth 2.0** or **Custom SMTP** credentials directly from your browser.

### Why Mass Email PRO?

- ⚡ **Zero Database Storage**: Contact lists, credentials, and attachments exist **only in your browser memory** and are discarded after sending.
- 🎯 **Dynamic Mail Merge**: Variable substitution `{Name}`, `{Company}`, `{InvoiceNo}` parsed live in browser from Excel/CSV.
- 🔐 **Dual Auth Engine**: Sign in with Google (OAuth 2.0 `gmail.send`) or any SMTP provider (Gmail, Outlook, Amazon SES, Brevo, SendGrid).
- 📎 **Smart Attachments**: Instant client-side Base64 streaming bypasses cloud file-system restrictions.
- ⏱️ **Zero-Timeout Architecture**: Asynchronous recipient dispatch avoids serverless execution limits (e.g. Vercel 10s timeout).

---

## ⚡ System Architecture

```mermaid
flowchart TD
    A[📁 Upload Excel / CSV] --> B[⚙️ In-Browser JavaScript Parser]
    B --> C[✍️ Compose Email Template with Variables]
    C --> D{Choose Auth Engine}
    
    D -->|Google OAuth 2.0| E[🔑 Gmail API Endpoint]
    D -->|SMTP Server| F[📧 Custom SMTP Gateway]
    
    E --> G[🚀 Individual Recipient Dispatch]
    F --> G
    
    G --> H[📊 Live Progress & Activity Log]
```

---

## 🚀 Quick Interactive Feature Guide

<details open>
<summary><b>✨ Core Features & Capabilities</b></summary>
<br>

| Feature | Description | Support |
| :--- | :--- | :---: |
| **Google OAuth 2.0** | 1-Click login with official Google `gmail.send` scope | ✅ |
| **Custom SMTP** | Gmail App Passwords, Outlook, Custom Domains, SES | ✅ |
| **Excel & CSV Reader** | SheetJS browser parser (.xlsx, .xls, .csv) | ✅ |
| **Dynamic Variables** | Dynamic chips `{Name}`, `{Role}`, `{CustomCol}` | ✅ |
| **Attachment Engine** | File path mapping or browser drag-and-drop Base64 stream | ✅ |
| **Campaign Control** | Real-time Pause, Resume, and Stop controls | ✅ |
| **Dark & Light Mode** | Harmonized SaaS design system with `localStorage` state | ✅ |
| **Mobile Optimized** | 100% responsive interface across desktop, tablet, and mobile | ✅ |

</details>

<details>
<summary><b>🛠️ Local Installation & Setup</b></summary>
<br>

### Prerequisites
- Python 3.9+
- Git

### 1. Clone & Install
```bash
git clone https://github.com/Satbir-Singh-42/MASS_EMAIL_PRO.git
cd MASS_EMAIL_PRO
pip install -r requirements.txt
```

### 2. Configure Environment (Optional for Google OAuth)
Create a `.env` file in the root directory:
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SECRET_KEY=your_random_flask_secret_key
```

### 3. Run Application
```bash
python app.py
```
Visit `http://127.0.0.1:5001` in your browser.

</details>

<details>
<summary><b>☁️ Deploying to Vercel (1-Click)</b></summary>
<br>

This repository includes a pre-configured `vercel.json` manifest:

```json
{
  "version": 2,
  "builds": [{ "src": "app.py", "use": "@vercel/python" }],
  "routes": [{ "src": "/(.*)", "dest": "app.py" }]
}
```

1. Fork or push this repository to **GitHub**.
2. Connect your repository to [Vercel](https://vercel.com).
3. Set your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in **Environment Variables**.
4. Click **Deploy** — your app is live!

</details>

<details>
<summary><b>📊 Spreadsheet Variable Format Example</b></summary>
<br>

Prepare your Excel or CSV spreadsheet with headers in row 1:

| Email | Name | Company | Amount | Attachment |
| :--- | :--- | :--- | :--- | :--- |
| alex@example.com | Alex Morgan | Acme Corp | $250 | invoice_101.pdf |
| sarah@example.com | Sarah Chen | Nexus Tech | $410 | invoice_102.pdf |

In your email body:
> Hi **{Name}**,
>
> Your monthly invoice for **{Company}** in the amount of **{Amount}** is attached.
>
> Best regards,  
> Sales Team

</details>

---

## 📊 Comparison Matrix

| Feature | Mass Email PRO | Traditional Plugins | Paid SaaS (Mailchimp) |
| :--- | :---: | :---: | :---: |
| **Cost** | **$0 Forever** | Free/Paid | $20 - $300/mo |
| **Data Privacy** | **100% Client-Side** | Varies | Third-party Server |
| **Google OAuth** | **Native Built-in** | ❌ Rare | ❌ Excluded |
| **Setup Time** | **< 1 Minute** | Complex | Complex |
| **Custom Variables** | **Unlimited** | Limited | Tier-Restricted |

---

## 🔒 Security & Privacy Commitments

Mass Email PRO is designed under a **Zero-Knowledge Architecture**:
- 🛡️ **No Persistent Database**: User credentials and uploaded files are never written to disk or database tables.
- 🔑 **Session Security**: Google OAuth access tokens are stored in encrypted, HTTP-only session cookies and cleared upon exit.
- 📜 **Compliance**: Built in strict adherence to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

---

## 🤝 Contributing

Contributions are always welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License & Legal

Distributed under the MIT License. See [`templates/terms.html`](templates/terms.html) and [`templates/privacy.html`](templates/privacy.html) for full legal guidelines.

<div align="center">
  <br>
  <sub>Built with ❤️ by Satbir Singh · Mass Email PRO</sub>
</div>
