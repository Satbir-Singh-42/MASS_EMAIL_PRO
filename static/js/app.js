const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────
let recipientData = [];
let columns = [];
let sending = false;
let paused = false;
let stopRequested = false;
let sentCount = 0;
let failCount = 0;
let currentIndex = 0;
let choiceEmail, choiceName, choiceAttachment;
let attachmentFiles = {}; // Stores loaded File objects
let lastCursorPos = 0; // Track cursor position for variable insertion
let currentAuthMode = "oauth"; // "oauth" or "smtp"
let googleAccount = null;

document.addEventListener("DOMContentLoaded", () => {
  choiceEmail = new Choices('#colEmail', { searchEnabled: false, itemSelectText: '' });
  choiceName = new Choices('#colName', { searchEnabled: false, itemSelectText: '' });
  choiceAttachment = new Choices('#colAttachment', { removeItemButton: true, searchEnabled: false, itemSelectText: '' });

  // ── Auth Mode Switcher (Google OAuth vs Manual SMTP) ──
  const modeBtnOAuth = $("modeBtnOAuth");
  const modeBtnSmtp = $("modeBtnSmtp");
  const sectionOAuth = $("sectionOAuth");
  const sectionSmtp = $("sectionSmtp");

  function setAuthMode(mode) {
    currentAuthMode = mode;
    if (mode === "oauth") {
      if (modeBtnOAuth) modeBtnOAuth.classList.add("active");
      if (modeBtnSmtp) modeBtnSmtp.classList.remove("active");
      if (sectionOAuth) sectionOAuth.style.display = "block";
      if (sectionSmtp) sectionSmtp.style.display = "none";
    } else {
      if (modeBtnSmtp) modeBtnSmtp.classList.add("active");
      if (modeBtnOAuth) modeBtnOAuth.classList.remove("active");
      if (sectionSmtp) sectionSmtp.style.display = "block";
      if (sectionOAuth) sectionOAuth.style.display = "none";
    }
  }

  if (modeBtnOAuth) modeBtnOAuth.addEventListener("click", () => setAuthMode("oauth"));
  if (modeBtnSmtp) modeBtnSmtp.addEventListener("click", () => setAuthMode("smtp"));

  // Google OAuth Auth Handlers
  if ($("btnGoogleLogin")) {
    $("btnGoogleLogin").addEventListener("click", () => {
      window.location.href = "/auth/google/login";
    });
  }

  if ($("btnGoogleLogout")) {
    $("btnGoogleLogout").addEventListener("click", async () => {
      await fetch("/api/auth/google/logout", { method: "POST" });
      googleAccount = null;
      checkGoogleAuthStatus();
    });
  }


  checkGoogleAuthStatus();
  checkUrlAuthParams();

  // Header Tip Banner Logic
  if (sessionStorage.getItem("tipBannerDismissed") === "true") {
    if ($("headerTipBanner")) $("headerTipBanner").style.display = "none";
  }
  if ($("bannerDismissBtn")) {
    $("bannerDismissBtn").addEventListener("click", () => {
      if ($("headerTipBanner")) $("headerTipBanner").style.display = "none";
      sessionStorage.setItem("tipBannerDismissed", "true");
    });
  }

  // Activity Log Collapse / Expand Logic
  if ($("toggleLogsBtn") && $("logConsoleWrap")) {
    $("toggleLogsBtn").addEventListener("click", () => {
      const wrap = $("logConsoleWrap");
      const btn = $("toggleLogsBtn");
      if (wrap.style.maxHeight === "0px") {
        wrap.style.maxHeight = "250px";
        wrap.style.opacity = "1";
        btn.innerText = "Collapse ▲";
      } else {
        wrap.style.maxHeight = "0px";
        wrap.style.opacity = "0";
        btn.innerText = "Expand ▼";
      }
    });
  }
  // Track cursor position in email body textarea
  const emailBodyEl = $('emailBody');
  if (emailBodyEl) {
    const updateCursor = () => { lastCursorPos = emailBodyEl.selectionStart; };
    emailBodyEl.addEventListener('keyup', updateCursor);
    emailBodyEl.addEventListener('mouseup', updateCursor);
    emailBodyEl.addEventListener('click', updateCursor);
    emailBodyEl.addEventListener('input', updateCursor);
    emailBodyEl.addEventListener('focus', updateCursor);
  }

  // Wire Add Row / Add Column buttons (defined in HTML)
  if ($("btnAddRow"))    $("btnAddRow").addEventListener("click", addRow);
  if ($("btnAddColumn")) $("btnAddColumn").addEventListener("click", addColumn);
});

// ── Theme Toggle ──────────────────────────────────────────────────────
const themeToggle = $("themeToggle");
const iconMoon    = $("iconMoon");
const iconSun     = $("iconSun");

function applyTheme(dark) {
  if (dark) {
    document.body.classList.remove("light");
    iconMoon.style.display = "block";
    iconSun.style.display = "none";
    localStorage.setItem("email-theme", "dark");
  } else {
    document.body.classList.add("light");
    iconMoon.style.display = "none";
    iconSun.style.display = "block";
    localStorage.setItem("email-theme", "light");
  }
}
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    applyTheme(document.body.classList.contains("light"));
  });
  if (localStorage.getItem("email-theme") === "light") applyTheme(false);
}

// ── Stepper Navigation ────────────────────────────────────────────────
const steps = document.querySelectorAll(".step");
const panels = document.querySelectorAll(".step-panel");

function goToStep(stepNum) {
  steps.forEach(s => {
    let sNum = parseInt(s.dataset.step);
    s.classList.remove("active");
    if (sNum < stepNum) s.classList.add("done");
    else s.classList.remove("done");
    if (sNum === stepNum) s.classList.add("active");
  });
  panels.forEach(p => p.classList.remove("active"));
  $(`panel-${stepNum}`).classList.add("active");
}

document.querySelectorAll(".btn-next").forEach(btn => {
  btn.addEventListener("click", () => goToStep(parseInt(btn.dataset.next)));
});
document.querySelectorAll(".btn-prev").forEach(btn => {
  btn.addEventListener("click", () => goToStep(parseInt(btn.dataset.prev)));
});

// ── Step 1: SMTP ──────────────────────────────────────────────────────
document.querySelectorAll(".preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const p = chip.dataset.preset;
    if (p === "gmail") {
      $("smtpServer").value = "smtp.gmail.com";
      $("smtpPort").value = "587";
      document.querySelector('input[name="smtpEnc"][value="tls"]').checked = true;
    } else if (p === "outlook" || p === "office365") {
      $("smtpServer").value = "smtp-mail.outlook.com";
      $("smtpPort").value = "587";
      document.querySelector('input[name="smtpEnc"][value="tls"]').checked = true;
    } else if (p === "yahoo") {
      $("smtpServer").value = "smtp.mail.yahoo.com";
      $("smtpPort").value = "465";
      document.querySelector('input[name="smtpEnc"][value="ssl"]').checked = true;
    }
  });
});

$("btnTestSmtp").addEventListener("click", async () => {
  const btn = $("btnTestSmtp");
  btn.innerText = "Testing...";
  btn.disabled = true;

  const payload = {
    server: $("smtpServer").value,
    port: $("smtpPort").value,
    enc: document.querySelector('input[name="smtpEnc"]:checked').value,
    email: $("smtpEmail").value,
    password: $("smtpPass").value
  };

  try {
    const res = await fetch("/api/test_smtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) showAlertModal("success", "Connection Successful", "Your SMTP server is configured correctly and ready to send emails.");
    else showAlertModal("error", "Connection Failed", data.error);
  } catch (e) {
    showAlertModal("error", "Connection Error", `Failed to reach the server. Reason: ${e.message}`);
  }
  btn.innerText = "Test Connection";
  btn.disabled = false;
});

// ── Step 2: Excel / CSV Parsing ───────────────────────────────────────
const fileInput = $("fileInput");
const dropzone = $("fileDropzone");

dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", e => {
  if (e.target.files.length > 0) processFile(e.target.files[0]);
});

function processFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {type: 'array'});
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    
    if (json.length === 0) {
      showAlertModal("warning", "No Data Found", "The uploaded file does not contain any rows.");
      return;
    }
    
    recipientData = json;
    columns = Object.keys(json[0]);

    // Update dropzone to show loaded file name
    const dz = $("fileDropzone");
    if (dz) {
      dz.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>
          <div style="font-size:13px; font-weight:700; color:var(--success);">${file.name}</div>
          <div style="font-size:11px; color:var(--text-3);">${json.length} rows loaded — click to replace</div>
        </div>
        <input type="file" id="fileInput" accept=".xlsx, .xls, .csv" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;">`;
      // Re-attach listener to the new file input
      $("fileInput").addEventListener("change", e => {
        if (e.target.files.length > 0) processFile(e.target.files[0]);
      });
    }

    
    // Clear previous attachment files to prevent stale cache
    attachmentFiles = {};
    if ($("attachStatus")) $("attachStatus").textContent = "No files loaded yet";
    
    // Populate column selectors using Choices.js
    const options = [{ value: '', label: '-- select column --', selected: true }, ...columns.map(c => ({ value: c, label: c }))];
    
    choiceEmail.setChoices(options, 'value', 'label', true);
    choiceName.setChoices(options, 'value', 'label', true);
    choiceAttachment.setChoices(columns.map(c => ({ value: c, label: c })), 'value', 'label', true);

    // Auto-select obvious columns
    const lowerCols = columns.map(c => c.toLowerCase());
    if (lowerCols.includes("email")) choiceEmail.setChoiceByValue(columns[lowerCols.indexOf("email")]);
    if (lowerCols.includes("name")) choiceName.setChoiceByValue(columns[lowerCols.indexOf("name")]);
    
    let attachMatches = [];
    if (lowerCols.includes("path")) attachMatches.push(columns[lowerCols.indexOf("path")]);
    if (lowerCols.includes("attachment")) attachMatches.push(columns[lowerCols.indexOf("attachment")]);
    if (attachMatches.length > 0) choiceAttachment.setChoiceByValue(attachMatches);

    // Show preview container
    if ($("dataPreviewEmpty")) $("dataPreviewEmpty").style.display = "none";
    $("dataPreviewContainer").style.display = "block";

    // Populate Variables
    const varContainer = $("varChipsContainer");
    varContainer.innerHTML = "";
    columns.forEach(c => {
      const chip = document.createElement("button");
      chip.className = "var-chip";
      chip.type = "button";
      chip.innerText = `{${c}}`;
      chip.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent stealing focus from textarea
      });
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const body = $("emailBody");
        const varText = `{${c}}`;
        const pos = lastCursorPos || 0;
        const before = body.value.substring(0, pos);
        const after = body.value.substring(pos);
        body.value = before + varText + after;
        const newPos = pos + varText.length;
        lastCursorPos = newPos;
        body.focus();
        body.selectionStart = newPos;
        body.selectionEnd = newPos;
      });
      varContainer.appendChild(chip);
    });

    renderTable();

    // Scroll preview into view after a short delay to let DOM render
    setTimeout(() => {
      const preview = $("dataPreviewContainer");
      if (preview) preview.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };
  reader.readAsArrayBuffer(file);
}

function refreshColumnChoices() {
  const opts = [{ value: '', label: '-- select column --', selected: true }, ...columns.map(c => ({ value: c, label: c }))];
  choiceEmail.setChoices(opts, 'value', 'label', true);
  choiceName.setChoices(opts, 'value', 'label', true);
  choiceAttachment.setChoices(columns.map(c => ({ value: c, label: c })), 'value', 'label', true);
}

function addRow() {
  const emptyRow = {};
  columns.forEach(c => { emptyRow[c] = ""; });
  recipientData.push(emptyRow);
  renderTable();
  // Scroll to last row
  setTimeout(() => {
    const tb = $("tableBody");
    if (tb) tb.lastElementChild && tb.lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 60);
}

function addColumn() {
  const name = prompt("Enter new column name:");
  if (!name || !name.trim()) return;
  const colName = name.trim();
  if (columns.includes(colName)) {
    alert(`Column "${colName}" already exists.`);
    return;
  }
  columns.push(colName);
  recipientData.forEach(row => { row[colName] = ""; });
  refreshColumnChoices();
  renderTable();
}

function deleteRow(rowIdx) {
  recipientData.splice(rowIdx, 1);
  renderTable();
}

function renderTable() {
  $("rowCount").innerText = `(${recipientData.length} rows)`;
  $("statTotal").innerText = recipientData.length;
  $("statPending").innerText = recipientData.length;

  const th = $("tableHead");
  th.innerHTML = "";
  th.innerHTML += `<th style="width:36px; color:var(--text-3);">#</th>`;
  columns.forEach(c => { th.innerHTML += `<th>${c}</th>`; });
  // Delete column header
  th.innerHTML += `<th style="width:32px;"></th>`;

  const tb = $("tableBody");
  tb.innerHTML = "";

  const displayRows = recipientData.slice(0, 50);
  displayRows.forEach((row, rowIdx) => {
    const tr = document.createElement("tr");

    // Row number cell
    const numTd = document.createElement("td");
    numTd.style.cssText = "color:var(--text-3); font-size:11px; text-align:center; user-select:none;";
    numTd.textContent = rowIdx + 1;
    tr.appendChild(numTd);

    columns.forEach(col => {
      const td = document.createElement("td");
      td.classList.add("editable-cell");
      td.textContent = row[col] ?? "";

      td.addEventListener("click", () => {
        if (td.querySelector("input")) return;
        const currentVal = recipientData[rowIdx][col] ?? "";
        td.classList.add("editing");
        td.innerHTML = "";

        const input = document.createElement("input");
        input.type = "text";
        input.value = currentVal;
        input.className = "cell-input";
        td.appendChild(input);
        input.focus();
        input.select();

        const commitEdit = () => {
          const newVal = input.value;
          recipientData[rowIdx][col] = newVal;
          td.classList.remove("editing");
          if (newVal !== String(currentVal)) {
            td.classList.add("cell-modified");
          } else {
            td.classList.remove("cell-modified");
          }
          td.textContent = newVal;
        };

        input.addEventListener("blur", commitEdit);
        input.addEventListener("keydown", e => {
          if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
          if (e.key === "Escape") {
            td.classList.remove("editing");
            td.textContent = currentVal;
          }
        });
      });

      tr.appendChild(td);
    });

    // Delete row button cell
    const delTd = document.createElement("td");
    delTd.style.cssText = "text-align:center; padding:4px;";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.title = "Delete row";
    delBtn.style.cssText = "background:none; border:none; cursor:pointer; color:var(--text-3); padding:2px 4px; border-radius:4px; line-height:1; transition:color .15s;";
    delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    delBtn.addEventListener("mouseenter", () => delBtn.style.color = "var(--danger)");
    delBtn.addEventListener("mouseleave", () => delBtn.style.color = "var(--text-3)");
    delBtn.addEventListener("click", () => deleteRow(rowIdx));
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    tb.appendChild(tr);
  });

  if (recipientData.length > 50) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="${columns.length + 2}" style="text-align:center;font-style:italic;color:var(--text-3);">...and ${recipientData.length - 50} more rows (not shown)</td>`;
    tb.appendChild(tr);
  }

}



async function checkGoogleAuthStatus() {
  try {
    const res = await fetch("/api/auth/google/status");
    const data = await res.json();
    if (data.authenticated) {
      googleAccount = data;
      if ($("oauthLoginCard")) $("oauthLoginCard").style.display = "none";
      if ($("oauthConnectedCard")) $("oauthConnectedCard").style.display = "block";
      if ($("oauthUserEmail")) $("oauthUserEmail").textContent = data.email;
      if ($("smtpEmail") && !$("smtpEmail").value) $("smtpEmail").value = data.email;
    } else {
      googleAccount = null;
      if ($("oauthLoginCard")) $("oauthLoginCard").style.display = "block";
      if ($("oauthConnectedCard")) $("oauthConnectedCard").style.display = "none";
    }
  } catch (e) {
    console.error("Failed to check Google OAuth status", e);
  }
}

function checkUrlAuthParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("google_auth") === "success") {
    showAlertModal("success", "Google Account Connected!", "You have successfully authenticated with Google. You can now send emails without an App Password.");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get("error") === "missing_client_id") {
    showAlertModal("warning", "Client ID Required", "To use Google OAuth, click 'Developer Settings' in Step 1 and paste your Google OAuth Client ID & Secret, or set GOOGLE_CLIENT_ID environment variable.");
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get("error")) {
    showAlertModal("error", "Authentication Error", `Google Sign-in failed: ${params.get("error")}`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ── Step 4: Sending Engine ────────────────────────────────────────────
function logActivity(msg, type="normal") {
  const c = $("logConsole");
  const time = new Date().toLocaleTimeString();
  const div = document.createElement("div");
  div.className = `log-line-${type}`;
  div.innerText = `[${time}] ${msg}`;
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function updateProgress() {
  const total = recipientData.length;
  const pct = total === 0 ? 0 : Math.round(((sentCount + failCount) / total) * 100);
  $("progressFill").style.width = `${pct}%`;
  $("progressPercent").innerText = `${pct}%`;
  $("statSent").innerText = sentCount;
  $("statFailed").innerText = failCount;
  $("statPending").innerText = total - (sentCount + failCount);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendLoop() {
  const delaySec = parseFloat($("sendDelay").value) || 0;
  
  while (currentIndex < recipientData.length) {
    if (stopRequested) {
      logActivity("Sending stopped by user.", "warning");
      break;
    }
    if (paused) {
      await sleep(1000);
      continue;
    }

    const row = recipientData[currentIndex];
    const emailCol = $("colEmail").value;
    const toEmail = row[emailCol];
    
    let localPaths = [];
    let cloudAttachments = [];
    
    const selectedAttachCols = choiceAttachment.getValue(true);
    if (selectedAttachCols && selectedAttachCols.length > 0) {
      for (const col of selectedAttachCols) {
        if (row[col]) {
          const paths = row[col].toString().split(/[;|]/).map(s => s.trim()).filter(Boolean);
          for (const path of paths) {
            // Check if file exists in Cloud Mode memory
            const filename = path.split(/[\/\\]/).pop(); // Handle absolute path fallback
            if (attachmentFiles[filename]) {
              try {
                const b64 = await readFileAsBase64(attachmentFiles[filename]);
                cloudAttachments.push({ filename: filename, content: b64 });
              } catch (e) {
                console.error("Failed to read file", filename, e);
              }
            } else {
              // Local mode fallback
              localPaths.push(path);
            }
          }
        }
      }
    }

    if (!toEmail) {
      logActivity(`Row ${currentIndex+1}: Skipped (No email address)`, "warning");
      failCount++;
      currentIndex++;
      updateProgress();
      continue;
    }

    // Process variables in subject and body
    let subject = $("emailSubject").value;
    let body = $("emailBody").value;
    columns.forEach(c => {
      const regex = new RegExp(`{${c}}`, 'g');
      subject = subject.replace(regex, row[c] || "");
      body = body.replace(regex, row[c] || "");
    });

    const senderEmail = currentAuthMode === "oauth"
      ? (googleAccount ? googleAccount.email : "")
      : ($('smtpEmail') ? $('smtpEmail').value : "");

    const payload = {
      auth_mode: currentAuthMode,
      server: $('smtpServer') ? $('smtpServer').value : "",
      port: $('smtpPort') ? $('smtpPort').value : "587",
      enc: document.querySelector('input[name="smtpEnc"]:checked') ? document.querySelector('input[name="smtpEnc"]:checked').value : "tls",
      email: senderEmail,
      sender_name: $('senderName') ? $('senderName').value : "",
      password: $('smtpPass') ? $('smtpPass').value : "",
      access_token: googleAccount ? googleAccount.access_token : "",
      format: document.querySelector('input[name="emailFormat"]:checked').value,
      cc: $("emailCC").value,
      bcc: $("emailBCC").value,
      to: toEmail,
      subject: subject,
      body: body,
      attachment_paths: localPaths,
      attachments: cloudAttachments
    };

    try {
      const res = await fetch("/api/send_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.ok) {
        logActivity(`Sent to: ${toEmail}`, "ok");
        sentCount++;
      } else {
        logActivity(`Failed to send to ${toEmail}: ${data.error}`, "error");
        failCount++;
      }
    } catch (e) {
      logActivity(`Network error (${e.message}) sending to ${toEmail}`, "error");
      failCount++;
    }

    currentIndex++;
    updateProgress();

    if (currentIndex < recipientData.length && !stopRequested && !paused) {
      logActivity(`Waiting ${delaySec}s before next email...`, "normal");
      await sleep(delaySec * 1000);
    }
  }

  sending = false;
  $("btnSend").disabled = false;
  $("btnPause").disabled = true;
  $("btnStop").disabled = true;
  if (currentIndex >= recipientData.length) logActivity("All emails processed.", "info");
}

$("btnSend").addEventListener("click", () => {
  if (recipientData.length === 0) return showAlertModal("warning", "Missing Recipients", "Please load a list of recipients in Step 2 before sending.");
  if (!$("colEmail").value) return showAlertModal("warning", "Missing Column", "Please select the Email Column in Step 2.");
  if (currentAuthMode === "oauth" && !googleAccount) {
    return showAlertModal("warning", "Google Sign-In Required", "Please click 'Connect Gmail Account' in Step 1 to authenticate with Google before sending.");
  }
  
  if (!sending) {
    sending = true;
    paused = false;
    stopRequested = false;
    $("btnSend").disabled = true;
    $("btnPause").disabled = false;
    $("btnStop").disabled = false;
    $("btnPause").innerText = "Pause";
    
    // Only reset if we are starting fresh
    if (currentIndex >= recipientData.length) {
      currentIndex = 0;
      sentCount = 0;
      failCount = 0;
      $("logConsole").innerHTML = "";
    }
    
    logActivity("Started sending campaign...", "info");
    sendLoop();
  }
});

$("btnPause").addEventListener("click", () => {
  paused = !paused;
  $("btnPause").innerText = paused ? "Resume" : "Pause";
  logActivity(paused ? "Paused" : "Resumed", "warning");
});

$("btnStop").addEventListener("click", () => {
  stopRequested = true;
});

// ── Attachment Handling (Cloud Mode) ─────────────────────────────────
const attachInput = $("attachInput");
const attachDropzone = $("attachDropzone");
const attachStatus = $("attachStatus");

attachDropzone.addEventListener("dragover", e => { e.preventDefault(); attachDropzone.classList.add("drag-over"); });
attachDropzone.addEventListener("dragleave", () => attachDropzone.classList.remove("drag-over"));
attachDropzone.addEventListener("drop", e => {
  e.preventDefault();
  attachDropzone.classList.remove("drag-over");
  if (e.dataTransfer.files.length) handleAttachFiles(e.dataTransfer.files);
});
attachInput.addEventListener("change", e => {
  if (e.target.files.length) handleAttachFiles(e.target.files);
});

function handleAttachFiles(files) {
  Array.from(files).forEach(f => attachmentFiles[f.name] = f);
  const count = Object.keys(attachmentFiles).length;
  attachStatus.textContent = `${count} file(s) loaded into browser memory.`;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

// ── Support Modal ─────────────────────────────────────────────────────
const donateModalOverlay = $("donateModal");
const donateModalClose = $("donateClose");

if (donateModalOverlay && donateModalClose) {
  donateModalClose.addEventListener("click", () => {
    donateModalOverlay.classList.remove("active");
  });
  donateModalOverlay.addEventListener("click", (e) => {
    if (e.target === donateModalOverlay) {
      donateModalOverlay.classList.remove("active");
    }
  });
}

// ── Alert Modal ───────────────────────────────────────────────────────
function showAlertModal(type, title, message) {
  const modal = $("alertModal");
  if (!modal) return alert(`${title}\n${message}`);
  
  $("alertTitle").innerText = title;
  $("alertMessage").innerText = message;
  
  const iconEl = $("alertIcon");
  if (type === "success") {
    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === "error") {
    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    iconEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  }
  
  modal.classList.add("active");
}

const alertModal = $("alertModal");
if (alertModal) {
  const closeAlert = () => alertModal.classList.remove("active");
  $("alertClose").addEventListener("click", closeAlert);
  $("alertOkBtn").addEventListener("click", closeAlert);
  alertModal.addEventListener("click", (e) => {
    if (e.target === alertModal) closeAlert();
  });
}

// ── Email Preview Modal ───────────────────────────────────────────────
let previewIndex = 0;

function resolveVariables(template, row) {
  let result = template;
  columns.forEach(c => {
    const regex = new RegExp(`\\{${c}\\}`, 'g');
    result = result.replace(regex, row[c] != null ? row[c] : '');
  });
  return result;
}

function openPreviewModal(index) {
  if (recipientData.length === 0) {
    return showAlertModal('warning', 'No Recipients', 'Please load recipient data in Step 2 first.');
  }
  previewIndex = Math.max(0, Math.min(index, recipientData.length - 1));
  renderPreview();
  $('previewModal').classList.add('active');
}

function renderPreview() {
  const row = recipientData[previewIndex];
  const emailCol = $('colEmail').value;
  const toEmail = row[emailCol] || '(no email column selected)';
  const format = document.querySelector('input[name="emailFormat"]:checked').value;

  const subject = resolveVariables($('emailSubject').value, row);
  const body = resolveVariables($('emailBody').value, row);

  // Determine sender email based on auth mode
  const fromEmail = currentAuthMode === 'oauth'
    ? (googleAccount ? googleAccount.email : '(not signed in with Google)')
    : ($('smtpEmail') ? $('smtpEmail').value || '(not set)' : '(not set)');
  $('previewFrom').textContent = fromEmail;
  $('previewTo').textContent = toEmail;
  $('previewSubject').textContent = subject || '(no subject)';
  $('previewCC').textContent = $('emailCC').value || '—';
  $('previewBCC').textContent = $('emailBCC').value || '—';

  const bodyEl = $('previewBody');
  if (format === 'html') {
    bodyEl.innerHTML = body;
    bodyEl.classList.add('preview-html');
    bodyEl.classList.remove('preview-plain');
  } else {
    bodyEl.textContent = body;
    bodyEl.classList.add('preview-plain');
    bodyEl.classList.remove('preview-html');
  }

  // Attachments
  let attachNames = [];
  const selectedAttachCols = choiceAttachment.getValue(true);
  if (selectedAttachCols && selectedAttachCols.length > 0) {
    for (const col of selectedAttachCols) {
      if (row[col]) {
        const paths = row[col].toString().split(/[;|]/).map(s => s.trim()).filter(Boolean);
        paths.forEach(p => attachNames.push(p.split(/[\/\\]/).pop()));
      }
    }
  }
  const attachEl = $('previewAttachments');
  if (attachNames.length > 0) {
    attachEl.innerHTML = attachNames.map(n =>
      `<span class="preview-attach-chip"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>${n}</span>`
    ).join('');
  } else {
    attachEl.innerHTML = '<span style="color:var(--text-3);font-size:12px;">No attachments</span>';
  }

  // Navigation state
  $('previewCounter').textContent = `Recipient ${previewIndex + 1} of ${recipientData.length}`;
  $('previewPrev').disabled = previewIndex === 0;
  $('previewNext').disabled = previewIndex >= recipientData.length - 1;
}

// Preview modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  const previewModal = $('previewModal');
  if (!previewModal) return;

  $('btnPreview').addEventListener('click', () => openPreviewModal(0));

  $('previewClose').addEventListener('click', () => previewModal.classList.remove('active'));
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) previewModal.classList.remove('active');
  });

  $('previewPrev').addEventListener('click', () => {
    if (previewIndex > 0) { previewIndex--; renderPreview(); }
  });
  $('previewNext').addEventListener('click', () => {
    if (previewIndex < recipientData.length - 1) { previewIndex++; renderPreview(); }
  });
});
