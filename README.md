# Mass Email PRO 🚀

A professional, high-performance web application designed for sending beautifully personalized mass emails using any SMTP server. Built with a lightweight Flask backend and a vanilla JavaScript frontend, it is fully optimized for both local execution and instant cloud deployment.

![Mass Email PRO](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)

## ✨ Features

- **Beautiful Premium UI**: A highly responsive, glassmorphic design featuring seamless Light and Dark modes.
- **Dynamic Variables**: Instantly inject custom fields from your Excel/CSV files directly into your email subjects and bodies (e.g., `Hello {Name}, welcome to {Company}!`).
- **Cloud-Ready Attachments**: 
  - *Local Mode*: Attach files by providing absolute paths (e.g. `C:/invoice.pdf`) in your CSV.
  - *Cloud Mode*: Select files in your browser and provide just the filenames in your CSV. The app seamlessly streams attachments via Base64, completely bypassing cloud file-system restrictions!
- **Asynchronous Processing**: The frontend iterates over your recipients and fires off API requests individually. This guarantees your browser won't freeze, provides real-time logs, and completely bypasses Serverless execution timeouts (like Vercel's 10-second limit).
- **Vercel Ready**: Comes pre-configured with a `vercel.json`. Push to GitHub and deploy in one click.

## 🛠️ Installation (Local)

1. **Ensure Python 3 is installed** on your computer.
2. **Clone or Download** this repository.
3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Run the Application**:
   ```bash
   python app.py
   ```
5. **Open your browser** and navigate to `http://127.0.0.1:5001`

## ☁️ Deployment (Vercel)

This application is architecturally designed to be hosted serverlessly on Vercel.

1. Upload this project to a **GitHub repository**.
2. Go to [Vercel](https://vercel.com) and click **Add New Project**.
3. Import your GitHub repository. Vercel will automatically detect the `vercel.json` configuration and deploy the Python Flask backend alongside the static frontend.
4. *Note on Attachments in the Cloud*: Since Vercel cannot access your `C:` drive, you must use the **Cloud Mode** drag-and-drop attachment feature built into Step 2 if you want to send file attachments.

## 🔒 Security & Privacy

Your SMTP credentials and contact lists are strictly processed in-memory. If running locally, data never leaves your machine (except when communicating securely with your SMTP provider). If deployed, the payload securely travels over HTTPS to the backend before being handed off to the SMTP server.
