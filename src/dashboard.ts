import * as SDK from "azure-devops-extension-sdk";
import {
  CommonServiceIds,
  IProjectPageService,
  ILocationService,
  getClient
} from "azure-devops-extension-api";
import { TaskAgentRestClient } from "azure-devops-extension-api/TaskAgent";

interface EnvCard {
  env: { id: number; name: string };
  pipelines: any[];
  loadError?: string;
}

let allCards: EnvCard[] = [];
let PROJECT    = "";
let PROJECT_ID = "";
let agentClient: TaskAgentRestClient | null = null;

SDK.init({ loaded: false });

SDK.ready().then(async () => {
  try {
    const projectService = await SDK.getService<IProjectPageService>(
      CommonServiceIds.ProjectPageService
    );
    const project = await projectService.getProject();
    if (!project) throw new Error("Could not read project context");
    PROJECT    = project.name;
    PROJECT_ID = project.id;

    const locationService = await SDK.getService<ILocationService>(
      CommonServiceIds.LocationService
    );
    const taskAgentUrl = await locationService.getResourceAreaLocation(
      TaskAgentRestClient.RESOURCE_AREA_ID
    );

    agentClient = getClient(TaskAgentRestClient, taskAgentUrl ? { rootPath: taskAgentUrl } : {});

    SDK.notifyLoadSucceeded();
    await loadDashboard();
  } catch (e: any) {
    showError("Initialisation failed: " + e.message);
    SDK.notifyLoadSucceeded();
  }
});

async function loadDashboard() {
  const btn = document.getElementById("refresh-btn") as HTMLButtonElement | null;
  if (btn) { btn.disabled = true; btn.textContent = "Refreshing\u2026"; }
  clearError();
  setContent('<div class="empty-state"><span class="spinner"></span> Fetching environments\u2026</div>');

  try {
    if (!agentClient) throw new Error("Client not initialised");

    const envs = await agentClient.getEnvironments(PROJECT_ID || PROJECT);

    if (!envs.length) {
      setContent('<div class="info-msg">No environments found. YAML pipelines must use <code>deployment:</code> jobs targeting named environments.</div>');
      return;
    }

    setContent(`<div class="empty-state"><span class="spinner"></span> Loading records for ${envs.length} environment(s)\u2026</div>`);

    allCards = await Promise.all(envs.map(async (env) => {
      try {
        const records = await agentClient!.getEnvironmentDeploymentExecutionRecords(
          PROJECT_ID || PROJECT, env.id!, undefined, 50
        );
        const byPipeline: Record<number, any> = {};
        for (const r of records) {
          const id = r.definition?.id;
          if (!id) continue;
          if (!byPipeline[id] || new Date(r.startTime as any) > new Date(byPipeline[id].startTime))
            byPipeline[id] = r;
        }
        const pipelines = Object.values(byPipeline)
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        return { env, pipelines };
      } catch (e: any) {
        return { env, pipelines: [], loadError: e.message };
      }
    }));

    renderDashboard();
    const ts = document.getElementById("last-refreshed");
    if (ts) ts.textContent = "Updated " + new Date().toLocaleTimeString();

  } catch (e: any) {
    const status = (e as any).status ? ` (HTTP ${(e as any).status})` : "";
    showError(`Failed to load${status}: ${e.message}`);
    setContent("");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Refresh"; }
  }
}

function renderDashboard() {
  const filterText  = (document.getElementById("filter-env")    as HTMLInputElement  | null)?.value ?? "";
  const filterState = (document.getElementById("filter-status") as HTMLSelectElement | null)?.value ?? "";

  const filtered = allCards.filter(c => {
    if (filterText && !c.env.name.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterState === "success"    && !c.pipelines.some(p => p.result === "succeeded")) return false;
    if (filterState === "failed"     && !c.pipelines.some(p => p.result === "failed"))    return false;
    if (filterState === "inprogress" && !c.pipelines.some(p => !p.result))               return false;
    return true;
  });

  const total      = allCards.length;
  const succeeded  = allCards.filter(c => c.pipelines.length && c.pipelines[0].result === "succeeded").length;
  const failed     = allCards.filter(c => c.pipelines.some(p => p.result === "failed")).length;
  const inProgress = allCards.filter(c => c.pipelines.some(p => !p.result)).length;

  let html = `
    <div class="summary-bar">
      ${pill(total,      "Environments",   "")}
      ${pill(succeeded,  "Last deploy OK", "color:#107c10")}
      ${pill(failed,     "Has failure",    "color:#a4262c")}
      ${pill(inProgress, "In progress",    "color:#ca5010")}
    </div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <input type="text" id="filter-env" placeholder="Environment name\u2026"
        value="${esc(filterText)}" oninput="window.__renderDashboard()" />
      <select id="filter-status" onchange="window.__renderDashboard()">
        <option value=""           ${!filterState                    ? "selected" : ""}>All statuses</option>
        <option value="success"    ${filterState === "success"    ? "selected" : ""}>Last deploy succeeded</option>
        <option value="failed"     ${filterState === "failed"     ? "selected" : ""}>Has failure</option>
        <option value="inprogress" ${filterState === "inprogress" ? "selected" : ""}>In progress</option>
      </select>
    </div>
    <div class="env-grid">`;

  for (const item of filtered) {
    html += `
      <div class="env-card">
        <div class="env-header">
          <span class="env-name">${svgIcon()}${esc(item.env.name)}</span>
          <div style="display:flex;align-items:center;gap:8px;">${envBadge(item.env.name)}</div>
        </div>
        <div class="deploy-list">`;

    if (item.loadError) {
      html += `<div class="no-deployments" style="color:#a4262c;">Could not load: ${esc(item.loadError)}</div>`;
    } else if (!item.pipelines.length) {
      html += `<div class="no-deployments">No deployments recorded yet.</div>`;
    } else {
      for (const r of item.pipelines) {
        const pName  = r.definition?.name ?? "Unknown pipeline";
        const runId  = r.owner?.id;
        const runNum = r.owner?.name ?? `#${runId}`;
        const result = r.result ?? null;
        const reqBy  = r.requestedFor?.displayName ?? "";
        const runUrl = runId ? `https://dev.azure.com/_build/results?buildId=${runId}` : null;
        html += `
          <div class="deploy-item">
            <div class="status-col">
              <span class="status-dot ${dotClass(result)}" title="${esc(result ?? "in progress")}"></span>
            </div>
            <div>
              <div class="pipeline-name" title="${esc(pName)}">${esc(pName)}</div>
              <div class="deploy-meta">
                <span class="meta-tag mono">${esc(runNum)}</span>
                <span class="meta-tag">${timeAgo(r.startTime)}</span>
                ${reqBy ? `<span class="meta-tag">by ${esc(reqBy)}</span>` : ""}
              </div>
            </div>
            <div>${runUrl ? `<a class="run-link" href="${runUrl}" target="_blank">View run</a>` : ""}</div>
          </div>`;
      }
    }
    html += `</div></div>`;
  }

  if (!filtered.length) {
    html += `<div class="empty-state" style="grid-column:1/-1">No environments match your filter.</div>`;
  }
  html += `</div>`;
  setContent(html);
}

(window as any).__renderDashboard = renderDashboard;
(window as any).__loadDashboard   = loadDashboard;

function pill(n: number, l: string, s: string) {
  return `<div class="summary-pill"><div class="pill-number"${s ? ` style="${s}"` : ""}>${n}</div><div class="pill-label">${l}</div></div>`;
}
function dotClass(r: string | null) {
  return !r ? "dot-inprogress" : r === "succeeded" ? "dot-succeeded" : r === "failed" ? "dot-failed" : "dot-unknown";
}
function envBadge(name: string) {
  const n = name.toLowerCase();
  if (n.includes("prod"))                                                return `<span class="env-badge badge-prod">production</span>`;
  if (n.includes("stag") || n.includes("uat") || n.includes("pre-prod")) return `<span class="env-badge badge-staging">staging</span>`;
  if (n.includes("dev")  || n.includes("test") || n.includes("qa"))      return `<span class="env-badge badge-dev">dev / test</span>`;
  return `<span class="env-badge badge-other">environment</span>`;
}
function timeAgo(ds: any) {
  if (!ds) return "\u2014";
  const d = Math.floor((Date.now() - new Date(ds).getTime()) / 1000);
  if (d < 60)    return d + "s ago";
  if (d < 3600)  return Math.floor(d / 60)  + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
}
function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function svgIcon() {
  return `<svg style="width:16px;height:16px;vertical-align:middle;margin-right:6px" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="14" height="14" rx="2" stroke="#0078d4" stroke-width="1.2" fill="none"/><circle cx="8" cy="8" r="3" fill="#0078d4"/></svg>`;
}
function setContent(h: string)  { const el = document.getElementById("dashboard-content"); if (el) el.innerHTML = h; }
function showError(msg: string) { const el = document.getElementById("error-area");        if (el) el.innerHTML = `<div class="error-msg">${esc(msg)}</div>`; }
function clearError()           { const el = document.getElementById("error-area");        if (el) el.innerHTML = ""; }
