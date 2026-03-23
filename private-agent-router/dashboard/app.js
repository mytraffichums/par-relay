const AGENT_API = "http://localhost:8003/audit";
const SERVICE_API = "http://localhost:9000/logs";
const REFRESH_MS = 2000;

let privacyOn = true;

function formatTime(ts) {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  return d.toLocaleTimeString();
}

function renderAgentLogs(logs) {
  const container = document.getElementById("agent-logs");
  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="placeholder">No requests yet</p>';
    return;
  }
  container.innerHTML = logs.map(log => {
    const priv = log.private ? "private" : "direct";
    const statusClass = log.status_code >= 400 ? "error" : "";
    const circuit = log.circuit ? JSON.parse(log.circuit).join(" → ") : "direct";
    return `
      <div class="log-entry ${priv}">
        <span class="method method-${log.method}">${log.method}</span>
        <span class="url">${log.url}</span>
        <span class="status-code ${statusClass}">${log.status_code || "?"}</span>
        <div class="meta">
          ${formatTime(log.timestamp)} |
          mode: <strong>${priv}</strong> |
          circuit: ${circuit}
        </div>
        ${log.response_summary ? `<div class="meta">${log.response_summary.substring(0, 120)}</div>` : ""}
      </div>
    `;
  }).join("");
}

function renderServiceLogs(logs) {
  const container = document.getElementById("service-logs");
  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="placeholder">No requests received</p>';
    return;
  }
  container.innerHTML = logs.map(log => `
    <div class="log-entry">
      <span class="method method-${log.method}">${log.method}</span>
      <span class="url">${log.endpoint}</span>
      <div class="meta">
        ${log.timestamp} |
        client: <span class="client-info">${log.client_host}:${log.client_port}</span>
      </div>
      <div class="meta">
        params: ${JSON.stringify(log.query_params)}
      </div>
      <div class="meta">
        user-agent: ${(log.headers || {})["user-agent"] || "n/a"}
      </div>
    </div>
  `).join("");
}

async function refresh() {
  try {
    const [agentResp, serviceResp] = await Promise.all([
      fetch(AGENT_API).then(r => r.json()).catch(() => []),
      fetch(SERVICE_API).then(r => r.json()).catch(() => []),
    ]);
    renderAgentLogs(agentResp);
    renderServiceLogs(serviceResp);
  } catch (e) {
    console.error("Refresh failed:", e);
  }
}

document.getElementById("toggle-privacy").addEventListener("click", function () {
  privacyOn = !privacyOn;
  this.textContent = `Privacy: ${privacyOn ? "ON" : "OFF"}`;
  this.classList.toggle("off", !privacyOn);
});

document.getElementById("clear-logs").addEventListener("click", async function () {
  await fetch("http://localhost:9000/logs", { method: "DELETE" }).catch(() => {});
  refresh();
});

setInterval(refresh, REFRESH_MS);
refresh();
