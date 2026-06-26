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

document.addEventListener("DOMContentLoaded", () => {
  choiceEmail = new Choices('#colEmail', { searchEnabled: false, itemSelectText: '' });
  choiceName = new Choices('#colName', { searchEnabled: false, itemSelectText: '' });
  choiceAttachment = new Choices('#colAttachment', { removeItemButton: true, searchEnabled: false, itemSelectText: '' });

  // Header Tip Banner Logic
  if (sessionStorage.getItem("tipBannerDismissed") === "true") {
    if ($("headerTipBanner")) $("headerTipBanner").style.display = "none";
  }
  if ($("bannerDonateBtn")) {
    $("bannerDonateBtn").addEventListener("click", () => {
      $("donateModal").classList.add("active");
    });
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
      chip.innerText = `{${c}}`;
      chip.onclick = () => {
        const body = $("emailBody");
        body.value += `{${c}}`;
      };
      varContainer.appendChild(chip);
    });

    renderTable();
  };
  reader.readAsArrayBuffer(file);
}

function renderTable() {
  $("rowCount").innerText = `(${recipientData.length} rows)`;
  $("statTotal").innerText = recipientData.length;
  $("statPending").innerText = recipientData.length;

  const th = $("tableHead");
  th.innerHTML = "";
  columns.forEach(c => { th.innerHTML += `<th>${c}</th>`; });

  const tb = $("tableBody");
  tb.innerHTML = "";
  recipientData.slice(0, 10).forEach(row => {
    let tr = "<tr>";
    columns.forEach(c => { tr += `<td>${row[c]}</td>`; });
    tr += "</tr>";
    tb.innerHTML += tr;
  });
  if (recipientData.length > 10) {
    tb.innerHTML += `<tr><td colspan="${columns.length}" style="text-align:center;font-style:italic;">...and ${recipientData.length - 10} more rows</td></tr>`;
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
      logActivity("🛑 Sending stopped by user.", "warning");
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

    const payload = {
      server: $("smtpServer").value,
      port: $("smtpPort").value,
      enc: document.querySelector('input[name="smtpEnc"]:checked').value,
      email: $("smtpEmail").value,
      password: $("smtpPass").value,
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
        logActivity(`✅ Sent to: ${toEmail}`, "ok");
        sentCount++;
      } else {
        logActivity(`❌ Failed to send to ${toEmail}: ${data.error}`, "error");
        failCount++;
      }
    } catch (e) {
      logActivity(`❌ Network error (${e.message}) sending to ${toEmail}`, "error");
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
  if (currentIndex >= recipientData.length) logActivity("🎉 All emails processed!", "info");
}

$("btnSend").addEventListener("click", () => {
  if (recipientData.length === 0) return showAlertModal("warning", "Missing Recipients", "Please load a list of recipients in Step 2 before sending.");
  if (!$("colEmail").value) return showAlertModal("warning", "Missing Column", "Please select the Email Column in Step 2.");
  
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
    
    logActivity("🚀 Started sending campaign...", "info");
    sendLoop();
  }
});

$("btnPause").addEventListener("click", () => {
  paused = !paused;
  $("btnPause").innerText = paused ? "Resume" : "Pause";
  logActivity(paused ? "⏸️ Paused" : "▶️ Resumed", "warning");
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
const donateBtn        = $("donateBtn");
const donateModalOverlay = $("donateModal");
const donateModalClose = $("donateClose");

if (donateBtn && donateModalOverlay) {
  donateBtn.addEventListener("click", () => {
    donateModalOverlay.classList.add("active");
  });
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
