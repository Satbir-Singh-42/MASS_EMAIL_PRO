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
let choiceEmail, choiceName, choiceAttachment, choiceTemplate;
let attachmentFiles = {}; // Stores loaded File objects
let lastCursorPos = 0; // Track cursor position for variable insertion
let currentAuthMode = "oauth"; // "oauth" or "smtp"
let googleAccount = null;
let campaignLogRecords = []; // Tracks sent/failed items for CSV report export

document.addEventListener("DOMContentLoaded", () => {
  choiceEmail = new Choices('#colEmail', { searchEnabled: false, itemSelectText: '' });
  choiceName = new Choices('#colName', { searchEnabled: false, itemSelectText: '' });
  choiceAttachment = new Choices('#colAttachment', { removeItemButton: true, searchEnabled: false, itemSelectText: '' });
  choiceTemplate = new Choices('#templatePicker', {
    searchEnabled: false,
    itemSelectText: '',
    shouldSort: false,
    allowHTML: false
  });
  if (choiceTemplate && choiceTemplate.containerOuter && choiceTemplate.containerOuter.element) {
    choiceTemplate.containerOuter.element.classList.add('template-picker-choices');
  } else {
    const tpContainer = document.querySelector('#templatePicker')?.closest('.choices');
    if (tpContainer) tpContainer.classList.add('template-picker-choices');
  }


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
      _stopOAuthExpiryTimer();
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

  // Report CSV download
  if ($("btnDownloadReport")) {
    $("btnDownloadReport").addEventListener("click", exportCampaignCSV);
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

  // Wire Add Row / Add Column buttons
  if ($("btnAddRow"))    $("btnAddRow").addEventListener("click", addRow);
  if ($("btnAddColumn")) $("btnAddColumn").addEventListener("click", addColumn);

  // Initialize Template Manager & Data Quality Cleaner
  initTemplateManager();
  initDataCleaner();
  initTestEmailFeature();
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

function formatParsedRows(rows) {
  return rows.map(row => {
    const cleanRow = {};
    Object.keys(row).forEach(k => {
      let v = row[k];
      if (v instanceof Date) {
        // Format JS Date object to YYYY-MM-DD
        const yr = v.getFullYear();
        const mo = String(v.getMonth() + 1).padStart(2, '0');
        const da = String(v.getDate()).padStart(2, '0');
        cleanRow[k] = `${yr}-${mo}-${da}`;
      } else if (typeof v === "number" && v > 35000 && v < 65000 && k.toLowerCase().includes("date")) {
        // Convert Excel serial date numbers (e.g. 46282) to clean YYYY-MM-DD
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(excelEpoch.getTime() + Math.floor(v) * 86400000);
        if (!isNaN(jsDate.getTime())) {
          const yr = jsDate.getUTCFullYear();
          const mo = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
          const da = String(jsDate.getUTCDate()).padStart(2, '0');
          cleanRow[k] = `${yr}-${mo}-${da}`;
        } else {
          cleanRow[k] = String(v);
        }
      } else {
        cleanRow[k] = v != null ? String(v) : "";
      }
    });
    return cleanRow;
  });
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, {
      type: 'array',
      cellDates: true,
      cellNF: false,
      cellText: false,
      dateNF: 'yyyy-mm-dd'
    });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawJson = XLSX.utils.sheet_to_json(firstSheet, {
      defval: "",
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });
    
    if (rawJson.length === 0) {
      showAlertModal("warning", "No Data Found", "The uploaded file does not contain any rows.");
      return;
    }
    
    const json = formatParsedRows(rawJson);
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
  checkDataQuality();

  const th = $("tableHead");
  th.innerHTML = "";
  th.innerHTML += `<th style="width:36px; color:var(--text-3);">#</th>`;
  columns.forEach(c => { th.innerHTML += `<th>${c}</th>`; });
  // Delete column header
  th.innerHTML += `<th style="width:32px;"></th>`;

  const tb = $("tableBody");
  tb.innerHTML = "";

  const emailCol = getActiveEmailColumn();
  const freqMap = {};
  recipientData.forEach(r => {
    const e = String(r[emailCol] || "").trim().toLowerCase();
    if (e) freqMap[e] = (freqMap[e] || 0) + 1;
  });

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
      const val = row[col] ?? "";
      td.textContent = val;

      // Visually flag duplicate email cells in table
      if (col === emailCol && val) {
        const norm = String(val).trim().toLowerCase();
        if (freqMap[norm] > 1) {
          td.style.backgroundColor = "rgba(233, 162, 59, 0.18)";
          td.style.fontWeight = "600";
          td.title = "Duplicate email address (appears multiple times)";
        }
      }

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



let _oauthExpiryTimer = null;

function _formatTimeLeft(seconds) {
  if (seconds <= 0) return "Expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function _startOAuthExpiryTimer(expiresIn) {
  _stopOAuthExpiryTimer();
  if (!expiresIn || expiresIn <= 0) return;

  // Update the countdown display every 60 seconds
  _oauthExpiryTimer = setInterval(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      const data = await res.json();
      if (!data.authenticated) {
        // Session has expired server-side
        _stopOAuthExpiryTimer();
        googleAccount = null;
        if ($("oauthLoginCard")) $("oauthLoginCard").style.display = "block";
        if ($("oauthConnectedCard")) $("oauthConnectedCard").style.display = "none";
        if ($("oauthSessionTimer")) $("oauthSessionTimer").textContent = "";
        showAlertModal("warning", "Session Expired", "Your Google OAuth session has expired after 2 hours. Please sign in again to continue sending emails.");
      } else {
        if ($("oauthSessionTimer")) $("oauthSessionTimer").textContent = _formatTimeLeft(data.expires_in);
      }
    } catch (e) {
      console.error("OAuth expiry check failed", e);
    }
  }, 60 * 1000); // Check every 60 seconds
}

function _stopOAuthExpiryTimer() {
  if (_oauthExpiryTimer) {
    clearInterval(_oauthExpiryTimer);
    _oauthExpiryTimer = null;
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
      // Show session timer and start auto-expiry check
      if ($("oauthSessionTimer")) $("oauthSessionTimer").textContent = _formatTimeLeft(data.expires_in);
      _startOAuthExpiryTimer(data.expires_in);
    } else {
      googleAccount = null;
      _stopOAuthExpiryTimer();
      if ($("oauthLoginCard")) $("oauthLoginCard").style.display = "block";
      if ($("oauthConnectedCard")) $("oauthConnectedCard").style.display = "none";
      if ($("oauthSessionTimer")) $("oauthSessionTimer").textContent = "";
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
      
      const recipientName = (choiceName && row[choiceName.getValue(true)]) ? row[choiceName.getValue(true)] : "";
      const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

      if (data.ok) {
        logActivity(`Sent to: ${toEmail}`, "ok");
        sentCount++;
        campaignLogRecords.push({
          email: toEmail,
          name: recipientName,
          status: "SENT",
          timestamp: timestamp,
          details: "Delivered successfully"
        });
      } else {
        logActivity(`Failed to send to ${toEmail}: ${data.error}`, "error");
        failCount++;
        campaignLogRecords.push({
          email: toEmail,
          name: recipientName,
          status: "FAILED",
          timestamp: timestamp,
          details: data.error || "Send failed"
        });
      }
    } catch (e) {
      logActivity(`Network error (${e.message}) sending to ${toEmail}`, "error");
      failCount++;
      const recipientName = (choiceName && row[choiceName.getValue(true)]) ? row[choiceName.getValue(true)] : "";
      campaignLogRecords.push({
        email: toEmail,
        name: recipientName,
        status: "FAILED",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        details: e.message || "Network error"
      });
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
  if (currentIndex >= recipientData.length) {
    logActivity("All emails processed.", "info");
    showAlertModal("success", "Campaign Completed", `Finished sending: ${sentCount} sent, ${failCount} failed. You can export the activity report as CSV.`);
  }
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

// ── Feature 1: Data Quality & Cleaner (Duplicates & Invalid Emails) ─────
function getActiveEmailColumn() {
  if (choiceEmail) {
    const val = choiceEmail.getValue(true);
    if (val) return val;
  }
  if ($("colEmail") && $("colEmail").value) return $("colEmail").value;
  if (!columns || columns.length === 0) return "";
  const directMatch = columns.find(c => c.toLowerCase() === "email" || c.toLowerCase() === "e-mail" || c.toLowerCase().includes("email"));
  if (directMatch) return directMatch;
  const valMatch = columns.find(c => recipientData.some(r => String(r[c] || "").includes("@")));
  return valMatch || columns[0] || "";
}

function checkDataQuality() {
  const banner = $("cleanDataBanner");
  if (!banner) return;
  if (!recipientData || recipientData.length === 0) {
    banner.style.display = "none";
    return;
  }

  const emailCol = getActiveEmailColumn();
  if (!emailCol) {
    banner.style.display = "none";
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const freqMap = {};
  let invalidCount = 0;

  recipientData.forEach(row => {
    const raw = String(row[emailCol] || "").trim().toLowerCase();
    if (!raw || !emailRegex.test(raw)) {
      invalidCount++;
    } else {
      freqMap[raw] = (freqMap[raw] || 0) + 1;
    }
  });

  let dupRowsCount = 0; // Number of redundant duplicate rows that can be removed
  let dupEmailsCount = 0; // Number of unique emails that have duplicates
  const dupEmailSet = new Set();

  Object.entries(freqMap).forEach(([email, count]) => {
    if (count > 1) {
      dupRowsCount += (count - 1);
      dupEmailsCount++;
      dupEmailSet.add(email);
    }
  });

  if (dupRowsCount > 0 || invalidCount > 0) {
    banner.style.display = "flex";
    $("dupCountBadge").innerText = dupRowsCount;
    $("invalidCountBadge").innerText = invalidCount;

    let msgParts = [];
    if (dupRowsCount > 0) {
      msgParts.push(`<strong>${dupRowsCount} duplicate entries</strong> (${dupEmailsCount} email address with multiple rows)`);
    }
    if (invalidCount > 0) {
      msgParts.push(`<strong>${invalidCount} invalid</strong> email address(es)`);
    }

    $("cleanDataMsg").innerHTML = `Found ${msgParts.join(" and ")}.`;
    $("btnRemoveDuplicates").style.display = dupRowsCount > 0 ? "inline-flex" : "none";
    $("btnRemoveInvalid").style.display = invalidCount > 0 ? "inline-flex" : "none";
  } else {
    banner.style.display = "none";
  }
}

function initDataCleaner() {
  const btnDup = $("btnRemoveDuplicates");
  const btnInv = $("btnRemoveInvalid");

  // Re-check quality whenever user switches the Email Column
  if ($("colEmail")) {
    $("colEmail").addEventListener("change", () => {
      renderTable();
    });
  }

  if (btnDup) {
    btnDup.addEventListener("click", () => {
      const emailCol = getActiveEmailColumn();
      if (!emailCol) return;
      const seen = new Set();
      const beforeCount = recipientData.length;
      recipientData = recipientData.filter(row => {
        const raw = String(row[emailCol] || "").trim().toLowerCase();
        if (!raw) return true;
        if (seen.has(raw)) return false;
        seen.add(raw);
        return true;
      });
      const removed = beforeCount - recipientData.length;
      renderTable();
      showAlertModal("success", "Duplicates Removed", `Successfully removed ${removed} duplicate row(s). Kept 1 unique copy of each contact.`);
    });
  }

  if (btnInv) {
    btnInv.addEventListener("click", () => {
      const emailCol = getActiveEmailColumn();
      if (!emailCol) return;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const beforeCount = recipientData.length;
      recipientData = recipientData.filter(row => {
        const raw = String(row[emailCol] || "").trim().toLowerCase();
        return raw && emailRegex.test(raw);
      });
      const removed = beforeCount - recipientData.length;
      renderTable();
      showAlertModal("success", "Invalid Emails Removed", `Successfully removed ${removed} invalid email row(s).`);
    });
  }
}

// ── Feature 2: Template Library & Local Drafts ──────────────────────────
const STARTER_TEMPLATES = {
  cold_outreach: {
    subject: "Quick question regarding {Company}",
    format: "plain",
    body: "Hi {Name},\n\nI came across your work at {Company} and wanted to reach out. We've built an open, high-performance tool that helps teams send personalized communication directly through Gmail.\n\nWould you be open to a quick 5-minute chat this week?\n\nBest regards,\n[Your Name]"
  },
  event_invite: {
    subject: "You're invited: Special session with {Company}",
    format: "plain",
    body: "Hello {Name},\n\nWe're hosting an exclusive session next Thursday and would love for you to join us.\n\nTopic: Streamlining outreach and communications in 2026\nDate & Time: Thursday, 2:00 PM EST\n\nLooking forward to seeing you there!\n\nWarmly,\n[Your Team]"
  },
  founder_intro: {
    subject: "Introduction: {Name} <> [Your Name]",
    format: "plain",
    body: "Hey {Name},\n\nHope you're having a great week! I wanted to personally introduce myself and share something we've been building for founders.\n\nIf you have any feedback or want to try it out for {Company}, let me know!\n\nCheers,\n[Your Name]"
  },
  product_update: {
    subject: "Product updates for {Name} & {Company}",
    format: "plain",
    body: "Hi {Name},\n\nWe just launched several new features to help you deliver emails faster with full privacy and zero limits.\n\nKey highlights:\n• One-click list cleaning\n• Instant real-inbox test previews\n• Exportable campaign reports\n\nCheck it out and let us know what you think!\n\nBest,\n[Your Company]"
  }
};

function initTemplateManager() {
  const saveBtn = $("btnSaveTemplate");
  const delBtn = $("btnDeleteTemplate");
  if (!choiceTemplate) return;

  // Build choices array including starter templates + saved drafts
  function buildChoicesList() {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem("mailflow_saved_templates") || "{}"); }
      catch (e) { return {}; }
    })();

    const items = [
      { value: '', label: '-- Choose Starter Template or Saved Draft --', placeholder: true },
      { value: '', label: 'Starter Templates', id: 'grp-starter', disabled: true, choices: [
          { value: 'cold_outreach',  label: 'Cold Outreach / Partnership' },
          { value: 'event_invite',   label: 'Event / Webinar Invitation' },
          { value: 'founder_intro',  label: 'Warm Founder Introduction' },
          { value: 'product_update', label: 'Product Update & Newsletter' },
        ]
      }
    ];

    const draftKeys = Object.keys(saved);
    if (draftKeys.length > 0) {
      items.push({
        value: '', label: 'Saved Drafts', disabled: true, choices:
          draftKeys.map(name => ({ value: `custom_${name}`, label: `Draft: ${name}` }))
      });
    }

    return items;
  }

  function refreshChoices() {
    choiceTemplate.clearChoices();
    choiceTemplate.setChoices([
      { value: '', label: '-- Choose Starter Template or Saved Draft --', placeholder: true, selected: true },
      ...STARTER_TEMPLATES_CHOICES,
      ...buildSavedDraftChoices()
    ], 'value', 'label', true);
  }

  // Flat choices format that Choices.js accepts cleanly
  function buildFlatChoices() {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem("mailflow_saved_templates") || "{}"); }
      catch (e) { return {}; }
    })();
    const draftKeys = Object.keys(saved);
    const choices = [
      { value: '', label: '-- Choose Starter Template or Saved Draft --', placeholder: true, selected: true, disabled: true },
      { value: '', label: '── Starter Templates ──', disabled: true, classNames: { item: 'choices__group-header' } },
      { value: 'cold_outreach',  label: 'Cold Outreach / Partnership' },
      { value: 'event_invite',   label: 'Event / Webinar Invitation' },
      { value: 'founder_intro',  label: 'Warm Founder Introduction' },
      { value: 'product_update', label: 'Product Update \u0026 Newsletter' },
    ];
    if (draftKeys.length > 0) {
      choices.push({ value: '', label: '── Saved Drafts ──', disabled: true, classNames: { item: 'choices__group-header' } });
      draftKeys.forEach(name => choices.push({ value: `custom_${name}`, label: `Draft: ${name}` }));
    }
    return choices;
  }

  // Initial population
  choiceTemplate.clearChoices();
  choiceTemplate.setChoices(buildFlatChoices(), 'value', 'label', true);

  // Handle selection
  $("templatePicker").addEventListener("change", () => {
    const val = $("templatePicker").value;
    if (!val || val === '') {
      if (delBtn) delBtn.style.display = "none";
      return;
    }
    if (val.startsWith("custom_")) {
      if (delBtn) delBtn.style.display = "inline-flex";
      const name = val.replace("custom_", "");
      try {
        const saved = JSON.parse(localStorage.getItem("mailflow_saved_templates") || "{}");
        const t = saved[name];
        if (t) {
          $("emailSubject").value = t.subject || "";
          $("emailBody").value = t.body || "";
          const fmtRadio = document.querySelector(`input[name="emailFormat"][value="${t.format || 'plain'}"]`);
          if (fmtRadio) fmtRadio.checked = true;
          logActivity(`Loaded saved draft: "${name}"`, "normal");
        }
      } catch (e) {}
    } else if (STARTER_TEMPLATES[val]) {
      if (delBtn) delBtn.style.display = "none";
      const t = STARTER_TEMPLATES[val];
      $("emailSubject").value = t.subject;
      $("emailBody").value = t.body;
      const fmtRadio = document.querySelector(`input[name="emailFormat"][value="${t.format}"]`);
      if (fmtRadio) fmtRadio.checked = true;
      logActivity(`Applied starter template: ${val}`, "normal");
    }
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const subject = $("emailSubject").value;
      const body = $("emailBody").value;
      const format = document.querySelector('input[name="emailFormat"]:checked').value;
      if (!subject.trim() && !body.trim()) {
        return showAlertModal("warning", "Empty Template", "Please enter a subject or email body before saving as a draft.");
      }
      const name = prompt("Enter a name for this template draft:", "My Outreach Template");
      if (!name || !name.trim()) return;
      try {
        const saved = JSON.parse(localStorage.getItem("mailflow_saved_templates") || "{}");
        saved[name.trim()] = { subject, body, format, updatedAt: new Date().toISOString() };
        localStorage.setItem("mailflow_saved_templates", JSON.stringify(saved));
        // Refresh choices list then select the new draft
        choiceTemplate.clearChoices();
        choiceTemplate.setChoices(buildFlatChoices(), 'value', 'label', true);
        choiceTemplate.setChoiceByValue(`custom_${name.trim()}`);
        if (delBtn) delBtn.style.display = "inline-flex";
        showAlertModal("success", "Template Saved", `Draft "${name.trim()}" saved to your browser!`);
      } catch (e) {
        showAlertModal("error", "Save Failed", "Could not save template to browser storage.");
      }
    });
  }

  if (delBtn) {
    delBtn.addEventListener("click", () => {
      const val = $("templatePicker").value;
      if (!val || !val.startsWith("custom_")) return;
      const name = val.replace("custom_", "");
      if (!confirm(`Delete saved template "${name}"?`)) return;
      try {
        const saved = JSON.parse(localStorage.getItem("mailflow_saved_templates") || "{}");
        delete saved[name];
        localStorage.setItem("mailflow_saved_templates", JSON.stringify(saved));
        choiceTemplate.clearChoices();
        choiceTemplate.setChoices(buildFlatChoices(), 'value', 'label', true);
        delBtn.style.display = "none";
        showAlertModal("success", "Template Deleted", `Draft "${name}" was removed.`);
      } catch (e) {}
    });
  }
}

// ── Feature 3: Send Test Email to Myself ────────────────────────────────
function initTestEmailFeature() {
  const btnOpen = $("btnTestEmail");
  const modal = $("testEmailModal");
  const btnClose = $("testEmailClose");
  const btnCancel = $("btnCancelTestEmail");
  const btnSubmit = $("btnSubmitTestEmail");
  const inputEmail = $("testRecipientEmail");
  const statusDiv = $("testEmailStatus");

  if (!btnOpen || !modal) return;

  btnOpen.addEventListener("click", () => {
    // Prefill with sender's email
    const senderEmail = currentAuthMode === "oauth"
      ? (googleAccount ? googleAccount.email : "")
      : ($('smtpEmail') ? $('smtpEmail').value : "");
    
    if (inputEmail && senderEmail) inputEmail.value = senderEmail;
    if (statusDiv) statusDiv.style.display = "none";
    modal.classList.add("active");
  });

  const closeModal = () => modal.classList.remove("active");
  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnCancel) btnCancel.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      const targetEmail = (inputEmail ? inputEmail.value : "").trim();
      if (!targetEmail || !targetEmail.includes("@")) {
        if (statusDiv) {
          statusDiv.style.display = "block";
          statusDiv.style.color = "var(--danger)";
          statusDiv.innerText = "Please enter a valid email address.";
        }
        return;
      }

      if (currentAuthMode === "oauth" && !googleAccount) {
        return showAlertModal("warning", "Google Sign-In Required", "Please connect your Google Account in Step 1 before sending test emails.");
      }

      btnSubmit.disabled = true;
      btnSubmit.innerText = "Sending Test...";
      if (statusDiv) {
        statusDiv.style.display = "block";
        statusDiv.style.color = "var(--text-2)";
        statusDiv.innerText = "Dispatching test email to your inbox...";
      }

      const sampleRow = recipientData.length > 0 ? recipientData[0] : {};
      const subject = resolveVariables($("emailSubject").value || "Test Email from MailFlow", sampleRow);
      const body = resolveVariables($("emailBody").value || "This is a test email sent from MailFlow.", sampleRow);
      const format = document.querySelector('input[name="emailFormat"]:checked').value;

      const senderEmail = currentAuthMode === "oauth"
        ? (googleAccount ? googleAccount.email : "")
        : ($('smtpEmail') ? $('smtpEmail').value : "");

      const payload = {
        auth_mode: currentAuthMode,
        server: $('smtpServer') ? $('smtpServer').value : "",
        port: $('smtpPort') ? $('smtpPort').value : "587",
        enc: document.querySelector('input[name="smtpEnc"]:checked') ? document.querySelector('input[name="smtpEnc"]:checked').value : "tls",
        email: senderEmail,
        password: $('smtpPass') ? $('smtpPass').value : "",
        access_token: googleAccount ? googleAccount.access_token : "",
        format: format,
        to: targetEmail,
        subject: `[TEST] ${subject}`,
        body: body
      };

      try {
        const res = await fetch("/api/send_email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.ok) {
          closeModal();
          showAlertModal("success", "Test Email Sent!", `A live test email was successfully delivered to ${targetEmail}. Check your inbox!`);
        } else {
          if (statusDiv) {
            statusDiv.style.display = "block";
            statusDiv.style.color = "var(--danger)";
            statusDiv.innerText = `Failed: ${data.error || 'Check credentials'}`;
          }
        }
      } catch (e) {
        if (statusDiv) {
          statusDiv.style.display = "block";
          statusDiv.style.color = "var(--danger)";
          statusDiv.innerText = `Network error: ${e.message}`;
        }
      }

      btnSubmit.disabled = false;
      btnSubmit.innerText = "Send Test Now →";
    });
  }
}

// ── Feature 4: Export Campaign Summary Report (CSV) ────────────────────
function exportCampaignCSV() {
  if (!campaignLogRecords || campaignLogRecords.length === 0) {
    return showAlertModal("warning", "No Logs to Export", "No emails have been sent in this session yet. Launch a campaign to generate activity logs.");
  }

  let csvContent = "data:text/csv;charset=utf-8,Email,Name,Status,Timestamp,Details\n";
  campaignLogRecords.forEach(rec => {
    const cleanEmail = `"${(rec.email || '').replace(/"/g, '""')}"`;
    const cleanName = `"${(rec.name || '').replace(/"/g, '""')}"`;
    const cleanStatus = `"${(rec.status || '').replace(/"/g, '""')}"`;
    const cleanTime = `"${(rec.timestamp || '').replace(/"/g, '""')}"`;
    const cleanDetails = `"${(rec.details || '').replace(/"/g, '""')}"`;
    csvContent += `${cleanEmail},${cleanName},${cleanStatus},${cleanTime},${cleanDetails}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `mailflow_campaign_report_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
