const SEARCH_URL = "https://tenup.fft.fr/recherche/joueurs/resultats";
const TENUP_BASE = "https://tenup.fft.fr";
const STORAGE_KEY = "tenup_data";

const API_BASE = `${TENUP_BASE}/back/v1/personnes`;

const PAGE_TYPES = [
  { key: "profilJoueur", label: "Profil Joueur" },
  { key: "ficheJoueur", label: "Fiche Joueur" },
  { key: "palmares", label: "Palmarès" },
  { key: "bilanClassement", label: "Bilan Classement" },
  { key: "bilanClassementHistorique", label: "Historique Classement" },
  { key: "simulationClassement", label: "Simulation Classement" },
];

// ── DOM ──
const textarea = document.getElementById("licences");
const btnSearch = document.getElementById("btn-search");
const btnClear = document.getElementById("btn-clear");
const btnCopy = document.getElementById("btn-copy");
const btnExportMd = document.getElementById("btn-export-md");
const progressSection = document.getElementById("progress-section");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const detailFetchSection = document.getElementById("detail-fetch-section");
const detailFetchText = document.getElementById("detail-fetch-text");
const errorSection = document.getElementById("error-section");
const errorMessage = document.getElementById("error-message");
const resultsSection = document.getElementById("results-section");
const resultsCount = document.getElementById("results-count");
const resultsBody = document.getElementById("results-body");
const copiedToast = document.getElementById("copied-toast");
const btnStop = document.getElementById("btn-stop");
const detailModal = document.getElementById("detail-modal");
const detailPlayerName = document.getElementById("detail-player-name");
const detailClose = document.getElementById("detail-close");

let allResults = [];
let searchAborted = false;
let detailFetchTotal = 0;
let detailFetchDone = 0;

// ── Persistance chrome.storage.local ──
// On ne persiste PAS les pages additionnelles (trop volumineux).
async function saveState() {
  const lite = allResults.map((r) => {
    const { pages, ...rest } = r;
    return rest;
  });
  await chrome.storage.local.set({ [STORAGE_KEY]: { licences: textarea.value, results: lite } });
}

async function restoreState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const data = stored[STORAGE_KEY];
  if (!data) return;

  if (data.licences) {
    textarea.value = data.licences;
  }

  if (data.results && data.results.length > 0) {
    allResults = data.results;
    resultsBody.innerHTML = "";
    for (const result of allResults) {
      addResultRow(result);
    }
    resultsSection.classList.remove("hidden");
    const found = allResults.filter((r) => r.found).length;
    resultsCount.textContent = `(${found}/${allResults.length} trouvés)`;
  }
}

// ── Recherche d'un licencié ──
async function searchLicence(numero) {
  const resp = await fetch(SEARCH_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `typeRecherche=licencie&sexe=INDIF&numero_licence=${encodeURIComponent(numero)}`,
  });

  if (!resp.ok) {
    if (resp.status === 403) {
      return { licence: numero, found: false, error: "Non connecté" };
    }
    return { licence: numero, found: false, error: `HTTP ${resp.status}` };
  }

  const html = await resp.text();

  if (html.includes("user/login") || html.includes("login.fft.fr") || html.includes("queue-it")) {
    return { licence: numero, found: false, error: "Non connecté" };
  }

  const contentMatch = html.match(
    /"content":\{"LastName":"([^"]*)",\s*"FirstName":"([^"]*)",\s*"Naiss":"([^"]*)",\s*"LicenceNumber":"([^"]*)",\s*"Club":"([^"]*)"/
  );

  if (!contentMatch) {
    return { licence: numero, found: false };
  }

  const classMatch = html.match(/"classement":\{"libelle":"([^"]*)"/);
  const bestMatch = html.match(/"meilleurClassement":\{"libelle":"([^"]*)",\s*"echelon":\d+,\s*"date":"([^"]*)"/);
  const linkMatch = html.match(/"link":"[^"]*?\/(\d{5,})"/);
  const playerId = linkMatch ? linkMatch[1] : null;
  const palmaresUrl = playerId ? `${TENUP_BASE}/palmares/${playerId}` : null;

  return {
    licence: numero,
    found: true,
    nom: cleanValue(contentMatch[1]),
    prenom: cleanValue(contentMatch[2]),
    naissance: contentMatch[3],
    licenceComplete: cleanValue(contentMatch[4]),
    club: cleanValue(contentMatch[5]),
    classement: classMatch ? cleanValue(classMatch[1]) : "NC",
    meilleurClassement: bestMatch ? `${cleanValue(bestMatch[1])} (${bestMatch[2]})` : "-",
    playerId,
    palmaresUrl,
    pages: null, // rempli en arrière-plan
  };
}

// ── Retry ──
async function searchWithRetry(numero, maxRetries = 3) {
  let lastResult;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await searchLicence(numero);
    if (lastResult.found || (!lastResult.error && !lastResult.found)) {
      return lastResult;
    }
    if (attempt === maxRetries) {
      return lastResult;
    }
    await sleep(1000);
  }
  return lastResult;
}

function cleanValue(str) {
  try {
    str = JSON.parse('"' + str.replace(/"/g, '\\"') + '"');
  } catch {
    str = str.replace(/\\\//g, "/");
    str = str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  }
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

// ══════════════════════════════════════════════
// ── Fetch des données API (arrière-plan) ──
// ══════════════════════════════════════════════

// ── Proxy API via le background service worker ──
// Les API /back/v1/ nécessitent d'être appelées depuis le contexte
// d'une page tenup.fft.fr. Le background.js exécute le fetch dans
// un onglet tenup.fft.fr via chrome.scripting.executeScript.

async function fetchApi(url, method = "GET", body = null) {
  try {
    console.log("[TenUp] fetchApi →", method, url);
    const result = await chrome.runtime.sendMessage({
      type: "fetchApi",
      url,
      method,
      body,
    });
    console.log("[TenUp] fetchApi ←", result?.status, result?.text || "", result?._debug || "");
    return result || { status: "error", data: null, text: "Pas de réponse du service worker" };
  } catch (err) {
    console.error("[TenUp] fetchApi error:", err);
    return { status: "error", data: null, text: `Erreur : ${err.message}` };
  }
}

// ── Formatteurs JSON → Markdown ──

function fmtDate(d) {
  if (!d) return "";
  return d.slice(0, 10).split("-").reverse().join("/");
}

function formatProfilJoueur(data) {
  if (!data) return "_Aucune donnée_";
  const lines = [];
  lines.push(`- **Nom** : ${data.nom || ""} ${data.prenom || ""}`);
  lines.push(`- **Sexe** : ${data.sexe === "H" ? "Homme" : data.sexe === "F" ? "Femme" : data.sexe || ""}`);
  lines.push(`- **Âge** : ${data.age ?? ""}`);
  lines.push(`- **Club** : ${data.club || ""}${data.ville ? ` (${data.ville})` : ""}`);
  lines.push(`- **Licence** : ${data.numeroLicence || ""} (millésime ${data.millesimeLicence || ""})`);
  lines.push(`- **Pratique** : ${data.pratique?.libelle || ""}`);
  const cl = data.classementTennis;
  if (cl) {
    lines.push(`- **Classement actuel** : ${cl.dernierClassement?.libelle || "NC"}`);
    lines.push(`- **Meilleur classement** : ${cl.meilleurClassement?.libelle || "-"}`);
  }
  if (data.eligibleMatchLibre) lines.push(`- **Éligible match libre** : Oui`);
  return lines.join("\n");
}

function formatFicheJoueur(data) {
  if (!data) return "_Aucune donnée_";
  const lines = [];
  if (data.pratiquePrincipale) lines.push(`- **Pratique principale** : ${data.pratiquePrincipale.libelle}`);
  if (data.lateralite) lines.push(`- **Latéralité** : ${data.lateralite}`);
  if (data.coupFavori) lines.push(`- **Coup favori** : ${data.coupFavori}`);
  if (data.typeJeu) lines.push(`- **Type de jeu** : ${data.typeJeu}`);
  if (data.typeRevers) lines.push(`- **Type de revers** : ${data.typeRevers}`);
  if (data.surfacePreferee) lines.push(`- **Surface préférée** : ${data.surfacePreferee}`);
  if (data.pratiquesSecondaires?.length > 0) {
    lines.push(`- **Pratiques secondaires** : ${data.pratiquesSecondaires.map((p) => p.libelle).join(", ")}`);
  }
  if (lines.length === 0) return "_Aucune information de profil renseignée_";
  return lines.join("\n");
}

function formatSets(sets) {
  if (!sets || !Array.isArray(sets) || sets.length === 0) return "";
  return sets
    .map((s) => {
      let score = `${s.scoreUtilisateur}/${s.scoreAdversaire}`;
      if (s.scoreTieBreak != null) score += `(${s.scoreTieBreak})`;
      return score;
    })
    .join(" ");
}

function formatPalmares(data) {
  if (!data) return "_Aucune donnée_";
  const lines = [];

  // Matchs
  if (data.matchs?.length > 0) {
    lines.push(`**Matchs (${data.matchs.length}) :**\n`);
    lines.push("| Date | Adversaire | Classement | Score | Résultat | Tournoi |");
    lines.push("|------|------------|------------|-------|----------|---------|");
    for (const m of data.matchs) {
      const adv = m.adversaires?.[0];
      const advName = adv ? (adv.anonyme ? "Anonyme" : `${adv.nom} ${adv.prenom}`) : "";
      const advClass = adv?.classementLibelle || "";
      const score = formatSets(m.sets);
      const result = m.victoireUtilisateur ? "V" : "D";
      const flags = [m.wo ? "WO" : "", m.abandon ? "Ab." : "", m.disqualification ? "Disq." : ""].filter(Boolean).join(" ");
      const tournoi = m.nomHomologation || "";
      lines.push(`| ${fmtDate(m.date)} | ${advName} | ${advClass} | ${score} | ${result}${flags ? " " + flags : ""} | ${tournoi} |`);
    }
    lines.push("");
  }

  // Historique victoires/défaites
  if (data.historiqueStats?.length > 0) {
    lines.push("**Historique victoires/défaites :**\n");
    lines.push("| Millésime | Victoires | Défaites |");
    lines.push("|-----------|-----------|----------|");
    for (const h of data.historiqueStats) {
      lines.push(`| ${h.millesime} | ${h.nbVictoires} | ${h.nbDefaites} |`);
    }
    lines.push("");
  }

  return lines.join("\n") || "_Aucune donnée de palmarès_";
}

function formatBilanClassement(data) {
  if (!data) return "_Aucune donnée_";
  const lines = [];

  if (data.classement) {
    const cl = data.classement;
    lines.push(`- **Classement** : ${cl.origine || cl.calcule || cl.libelle || JSON.stringify(cl)}`);
    if (cl.harmonise && cl.harmonise !== cl.origine) {
      lines.push(`- **Classement harmonisé** : ${cl.harmonise}`);
    }
  }
  if (data.classementUtilisateur?.libelle) {
    lines.push(`- **Classement joueur** : ${data.classementUtilisateur.libelle}`);
  }
  if (data.libelle) {
    lines.push(`- **Période** : ${data.libelle}`);
  }
  if (data.dateDebutPECMatches) {
    lines.push(`- **Matchs pris en compte** : du ${fmtDate(data.dateDebutPECMatches)} au ${fmtDate(data.dateFinPECMatches)}`);
  }

  if (data.bilans?.length > 0) {
    lines.push("\n**Bilans par classement :**\n");
    lines.push("| Classement | Pts cumulés | Quota | Pts manquants | Matchs | V | D |");
    lines.push("|------------|------------|-------|---------------|--------|---|---|");
    for (const b of data.bilans) {
      const sign = (b.pointsManquants ?? 0) <= 0 ? "" : "+";
      lines.push(`| ${b.classement?.libelle || ""} | ${b.pointsCumules ?? ""} | ${b.quota ?? ""} | ${sign}${b.pointsManquants ?? ""} | ${b.nbMatchs ?? ""} | ${b.victoires ?? ""} | ${b.defaites ?? ""} |`);
    }
    lines.push("");
  }

  return lines.join("\n") || "_Aucune donnée de bilan_";
}

function formatBilanHistorique(data) {
  // L'API retourne {historique: [...]} et non un tableau directement
  const entries = Array.isArray(data) ? data : data?.historique;
  if (!entries || entries.length === 0) return "_Aucun historique_";
  const lines = [];
  lines.push("| Date | Saison | Classement | Évolution |");
  lines.push("|------|--------|------------|-----------|");
  for (const entry of entries) {
    const evo = entry.evolution > 0 ? `+${entry.evolution}` : entry.evolution === 0 ? "=" : `${entry.evolution}`;
    lines.push(`| ${fmtDate(entry.dateCalcul)} | ${entry.saison || ""} | ${entry.classement?.libelle || entry.libelle || ""} | ${evo} |`);
  }
  return lines.join("\n");
}

function formatSimulationClassement(data) {
  if (!data) return "_Aucune donnée_";
  const lines = [];

  if (data.classementUtilisateur?.libelle) {
    lines.push(`- **Classement actuel** : ${data.classementUtilisateur.libelle}`);
  }

  if (data.messageSimulation) {
    lines.push(`- **Message** : ${data.messageSimulation}`);
  }
  if (data.messages?.length > 0) {
    for (const msg of data.messages) {
      lines.push(`- ${msg}`);
    }
  }

  // Résultat simulation : tableau synthétique par classement visé
  if (data.resultatSimulation?.length > 0) {
    lines.push("\n**Simulation par classement visé :**\n");
    lines.push("| Classement visé | Pts cumulés | Quota | Pts manquants | Matchs | V | D | Bonus doubles |");
    lines.push("|-----------------|------------|-------|---------------|--------|---|---|---------------|");
    for (const rs of data.resultatSimulation) {
      const cl = rs.classement?.libelle || "";
      const sign = (rs.pointsManquants ?? 0) <= 0 ? "" : "+";
      const bonusD = rs.expert?.bonusDoubles ?? "";
      lines.push(`| ${cl} | ${rs.pointsCumules ?? ""} | ${rs.quota ?? ""} | ${sign}${rs.pointsManquants ?? ""} | ${rs.nbMatchs ?? ""} | ${rs.victoires ?? ""} | ${rs.defaites ?? ""} | ${bonusD} |`);
    }
    lines.push("");

    // Détail des matchs de la première simulation (classement actuel)
    const current = data.resultatSimulation.find(
      (rs) => rs.classement?.id === data.classementUtilisateur?.id
    ) || data.resultatSimulation[0];

    if (current?.matchs?.length > 0) {
      lines.push(`**Détail des matchs (simulation ${current.classement?.libelle || ""}) :**\n`);
      lines.push("| Date | V/D | Adversaire | Classement | Points | Coef | Tournoi |");
      lines.push("|------|-----|------------|------------|--------|------|---------|");
      for (const m of current.matchs) {
        const advName = m.adversaire ? `${m.adversaire.nom} ${m.adversaire.prenom}` : "";
        const advClass = m.adversaire?.classement?.libelle || "";
        const tournoi = m.competition?.libelle || "";
        lines.push(`| ${fmtDate(m.date)} | ${m.sens} | ${advName} | ${advClass} | ${m.points ?? ""} | ${m.coefAjuste ?? m.coef ?? ""} | ${tournoi} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n") || "_Aucune donnée de simulation_";
}

const FORMATTERS = {
  profilJoueur: formatProfilJoueur,
  ficheJoueur: formatFicheJoueur,
  palmares: formatPalmares,
  bilanClassement: formatBilanClassement,
  bilanClassementHistorique: formatBilanHistorique,
  simulationClassement: formatSimulationClassement,
};

async function fetchAllPagesForPlayer(playerId) {
  const apiCalls = [
    { key: "profilJoueur", p: fetchApi(`${API_BASE}/${playerId}/profil-joueur`) },
    { key: "ficheJoueur", p: fetchApi(`${API_BASE}/${playerId}/fiche-joueur`) },
    { key: "palmares", p: fetchApi(`${API_BASE}/${playerId}/palmares/tennis?millesime&mobile=false`) },
    { key: "bilanClassement", p: fetchApi(`${API_BASE}/${playerId}/bilan-classement`, "POST", {}) },
    { key: "bilanClassementHistorique", p: fetchApi(`${API_BASE}/${playerId}/bilan-classement/historique`) },
    { key: "simulationClassement", p: fetchApi(`${API_BASE}/${playerId}/simulation-classement`, "POST", {}) },
  ];

  const results = await Promise.allSettled(apiCalls.map((c) => c.p));

  const pages = {};
  apiCalls.forEach((call, i) => {
    const res = results[i];
    if (res.status === "fulfilled" && res.value.status === "success") {
      const formatter = FORMATTERS[call.key];
      pages[call.key] = {
        status: "success",
        data: res.value.data,
        text: formatter ? formatter(res.value.data) : JSON.stringify(res.value.data, null, 2),
      };
    } else {
      const errText = res.status === "fulfilled" ? res.value.text : "Erreur inattendue";
      pages[call.key] = { status: "error", data: null, text: errText };
    }
  });
  return pages;
}

function updateDetailFetchProgress() {
  if (detailFetchTotal === 0) {
    detailFetchSection.classList.add("hidden");
    return;
  }
  detailFetchSection.classList.remove("hidden");
  detailFetchText.textContent = `Récupération des détails… ${detailFetchDone} / ${detailFetchTotal}`;
  if (detailFetchDone >= detailFetchTotal) {
    setTimeout(() => detailFetchSection.classList.add("hidden"), 2000);
  }
}

// ── Lancer toutes les recherches ──
async function runSearch() {
  const raw = textarea.value.trim();
  if (!raw) return;

  const licences = raw
    .split(/[\n,;]+/)
    .map((l) => l.trim().replace(/\s*[A-Za-z]+\s*$/, "").replace(/\s+/g, ""))
    .filter((l) => l && /^\d+$/.test(l));

  if (licences.length === 0) {
    showError("Aucun numéro de licence valide trouvé. Entrez un numéro par ligne.");
    return;
  }

  // Reset
  hideError();
  allResults = [];
  resultsBody.innerHTML = "";
  resultsSection.classList.add("hidden");
  progressSection.classList.remove("hidden");
  detailFetchSection.classList.add("hidden");
  detailFetchTotal = 0;
  detailFetchDone = 0;
  btnSearch.disabled = true;
  searchAborted = false;
  btnSearch.textContent = "Vérification connexion...";
  btnStop.classList.remove("hidden");

  // ── Test de connexion avec la première licence (3 tentatives) ──
  updateProgress(0, licences.length);
  const firstResult = await searchWithRetry(licences[0], 3);

  if (firstResult.error === "Non connecté") {
    progressSection.classList.add("hidden");
    btnSearch.disabled = false;
    btnSearch.textContent = "Rechercher";
    btnStop.classList.add("hidden");
    showError(
      "Vous n'êtes pas connecté à TenUp. Rendez-vous sur https://tenup.fft.fr/ pour vous connecter, puis relancez la recherche."
    );
    return;
  }

  if (firstResult.error) {
    progressSection.classList.add("hidden");
    btnSearch.disabled = false;
    btnSearch.textContent = "Rechercher";
    btnStop.classList.add("hidden");
    showError(
      `Erreur après 3 tentatives : ${firstResult.error}. Vérifiez votre connexion et réessayez.`
    );
    return;
  }

  // La première licence a fonctionné
  allResults.push(firstResult);
  addResultRow(firstResult);
  updateProgress(1, licences.length);
  await saveState();

  // Lancer le fetch des pages additionnelles en arrière-plan pour le 1er joueur
  enqueueDetailFetch(firstResult);

  btnSearch.textContent = "Recherche...";

  // ── Recherches suivantes ──
  let done = 1;

  for (let i = 1; i < licences.length; i++) {
    if (searchAborted) break;

    await sleep(500);

    if (searchAborted) break;

    const result = await searchWithRetry(licences[i], 2);
    allResults.push(result);

    if (result.error === "Non connecté") {
      showError(
        "Session expirée en cours de recherche. Reconnectez-vous sur https://tenup.fft.fr/ puis relancez."
      );
      break;
    }

    addResultRow(result);
    done++;
    updateProgress(done, licences.length);
    await saveState();

    // Lancer le fetch en arrière-plan
    enqueueDetailFetch(result);
  }

  btnSearch.disabled = false;
  btnSearch.textContent = "Rechercher";
  btnStop.classList.add("hidden");

  if (searchAborted) {
    progressText.textContent = `${done} / ${licences.length} (stoppé)`;
  }

  if (allResults.some((r) => r.found)) {
    resultsSection.classList.remove("hidden");
    const found = allResults.filter((r) => r.found).length;
    resultsCount.textContent = `(${found}/${allResults.length} trouvés)`;
  }

  await saveState();
}

// ── File d'attente séquentielle pour les détails joueurs ──
// On traite un joueur à la fois pour éviter que DataDome bloque les appels.
const _detailQueue = [];
let _detailQueueRunning = false;

function enqueueDetailFetch(result) {
  if (!result.found || !result.playerId) return;

  detailFetchTotal++;
  updateDetailFetchProgress();
  _detailQueue.push(result);

  if (!_detailQueueRunning) {
    _detailQueueRunning = true;
    processDetailQueue();
  }
}

async function processDetailQueue() {
  while (_detailQueue.length > 0) {
    const result = _detailQueue.shift();

    // Forcer un refresh de session avant chaque joueur
    try {
      await chrome.runtime.sendMessage({ type: "refreshSession" });
    } catch {}

    const pages = await fetchAllPagesForPlayer(result.playerId);
    result.pages = pages;
    detailFetchDone++;
    updateDetailFetchProgress();

    // Mettre à jour le lien "détails" dans la ligne du tableau
    const link = resultsBody.querySelector(`[data-player-id="${result.playerId}"]`);
    if (link) {
      link.classList.remove("loading");
      link.textContent = "détails";
    }
  }
  _detailQueueRunning = false;
}

// ── Affichage ──
function addResultRow(result) {
  const tr = document.createElement("tr");

  if (result.found) {
    const yearMatch = result.licenceComplete.match(/- (\d{4})/);
    const year = yearMatch ? yearMatch[1] : "?";
    const licenceAvecLettre = result.licenceComplete
      ? result.licenceComplete.replace(/\s*-\s*\d{4}$/, "")
      : result.licence;
    const palmaresLink = result.palmaresUrl
      ? ` <a href="${result.palmaresUrl}" target="_blank" class="licence-link" title="Voir le palmarès">palmarès</a>`
      : "";
    const detailLink = result.playerId
      ? ` <a href="#" class="detail-link ${result.pages ? "" : "loading"}" data-player-id="${result.playerId}" title="Voir les détails">${result.pages ? "détails" : "chargement…"}</a>`
      : "";
    tr.innerHTML = `
      <td>${licenceAvecLettre}${palmaresLink}${detailLink}</td>
      <td><strong>${result.nom}</strong></td>
      <td>${result.prenom}</td>
      <td>${result.naissance}</td>
      <td>${result.club}</td>
      <td><strong>${result.classement}</strong></td>
      <td>${result.meilleurClassement}</td>
      <td class="status-valid">${year}</td>
    `;

    // Event listener pour le lien détails
    const dLink = tr.querySelector(".detail-link");
    if (dLink) {
      dLink.addEventListener("click", (e) => {
        e.preventDefault();
        openDetailModal(result);
      });
    }
  } else {
    tr.classList.add("not-found");
    tr.innerHTML = `
      <td>${result.licence}</td>
      <td colspan="6">${result.error || "Non trouvé"}</td>
      <td class="status-notfound">-</td>
    `;
  }

  resultsBody.appendChild(tr);
  resultsSection.classList.remove("hidden");
}

function updateProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${done} / ${total}`;
}

function showError(msg) {
  errorMessage.innerHTML = msg.replace(
    /(https:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" style="color:#1d4ed8;text-decoration:underline">$1</a>'
  );
  errorSection.classList.remove("hidden");
}

function hideError() {
  errorSection.classList.add("hidden");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Mini convertisseur Markdown → HTML ──
function mdToHtml(md) {
  if (!md) return "";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  let html = "";
  let inTable = false;
  let inList = false;
  let isHeaderRow = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Séparateur de tableau (|---|---|)
    if (/^\|[-| :]+\|$/.test(line.trim())) {
      isHeaderRow = false;
      continue;
    }

    // Ligne de tableau
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      if (!inTable) {
        if (inList) { html += "</ul>"; inList = false; }
        html += '<table class="md-table"><thead>';
        inTable = true;
        isHeaderRow = true;
      }
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      const tag = isHeaderRow ? "th" : "td";
      if (isHeaderRow) {
        html += "<tr>" + cells.map((c) => `<${tag}>${inlineMd(esc(c))}</${tag}>`).join("") + "</tr></thead><tbody>";
      } else {
        html += "<tr>" + cells.map((c) => `<${tag}>${inlineMd(esc(c))}</${tag}>`).join("") + "</tr>";
      }
      continue;
    }

    // Fermer le tableau si on sort
    if (inTable && !line.trim().startsWith("|")) {
      html += "</tbody></table>";
      inTable = false;
    }

    // Ligne vide
    if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
      continue;
    }

    // Titre **xxx**  sur une ligne seule (bold label)
    if (/^\*\*[^*]+\*\*\s*:?\s*$/.test(line.trim()) && !line.trim().startsWith("-")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h4>${inlineMd(esc(line.trim()))}</h4>`;
      continue;
    }

    // Liste à puces (- xxx)
    if (line.trim().startsWith("- ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMd(esc(line.trim().slice(2)))}</li>`;
      continue;
    }

    // Italique seul (_xxx_)
    if (/^_[^_]+_$/.test(line.trim())) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p class="md-muted"><em>${esc(line.trim().slice(1, -1))}</em></p>`;
      continue;
    }

    // Paragraphe
    if (inList) { html += "</ul>"; inList = false; }
    html += `<p>${inlineMd(esc(line))}</p>`;
  }

  if (inTable) html += "</tbody></table>";
  if (inList) html += "</ul>";

  return html;
}

function inlineMd(text) {
  // **bold**
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // _italic_
  text = text.replace(/_([^_]+)_/g, "<em>$1</em>");
  return text;
}

// ══════════════════════════════════════════════
// ── Modale détail joueur ──
// ══════════════════════════════════════════════

function openDetailModal(result) {
  detailPlayerName.textContent = `${result.nom} ${result.prenom} — ${result.licence}`;

  for (const pt of PAGE_TYPES) {
    const el = document.getElementById(`tab-${pt.key}`);
    if (!el) continue;
    const page = result.pages?.[pt.key];

    if (!result.pages) {
      el.innerHTML = '<p class="tab-loading">Chargement en cours…</p>';
    } else if (!page || page.status === "error") {
      el.innerHTML = `<p class="tab-error">${page?.text || "Données non disponibles"}</p>`;
    } else {
      el.innerHTML = mdToHtml(page.text);
    }
  }

  // Activer le premier onglet
  detailModal.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
  detailModal.querySelectorAll(".tab-content").forEach((c, i) => c.classList.toggle("active", i === 0));

  detailModal.classList.remove("hidden");
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
}

// Onglets de la modale
detailModal.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    detailModal.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    detailModal.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.add("active");
  });
});

detailClose.addEventListener("click", closeDetailModal);
detailModal.querySelector(".modal-backdrop").addEventListener("click", closeDetailModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !detailModal.classList.contains("hidden")) {
    closeDetailModal();
  }
});

// ══════════════════════════════════════════════
// ── Export Markdown ──
// ══════════════════════════════════════════════

function exportMarkdown() {
  const found = allResults.filter((r) => r.found);
  if (found.length === 0) return;

  const date = new Date().toLocaleString("fr-FR");
  let md = `# TenUp — Export Licenciés FFT\n\nDate : ${date}\n\n`;

  for (const r of found) {
    md += `## ${r.nom} ${r.prenom}\n\n`;
    md += `- **Licence** : ${r.licenceComplete || r.licence}\n`;
    md += `- **Club** : ${r.club}\n`;
    md += `- **Né(e)** : ${r.naissance}\n`;
    md += `- **Classement** : ${r.classement}\n`;
    md += `- **Meilleur classement** : ${r.meilleurClassement}\n`;
    if (r.palmaresUrl) {
      md += `- **Palmarès Ten'Up** : ${r.palmaresUrl}\n`;
    }
    md += "\n";

    if (r.pages) {
      for (const pt of PAGE_TYPES) {
        const page = r.pages[pt.key];
        md += `### ${pt.label}\n\n`;
        if (page && page.status === "success" && page.text) {
          md += page.text + "\n\n";
        } else if (page && page.status === "error") {
          md += `_${page.text}_\n\n`;
        } else {
          md += "_Données non récupérées_\n\n";
        }
      }
    } else {
      md += "_Détails non récupérés (les pages additionnelles n'ont pas été chargées)_\n\n";
    }

    md += "---\n\n";
  }

  // Télécharger le fichier
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenup-export-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Copier CSV ──
function copyCSV() {
  if (allResults.length === 0) return;

  const header = "Licence;Nom;Prenom;Ne_en;Club;Classement;Meilleur_Classement;Licence_Complete;Fiche";
  const rows = allResults.map((r) => {
    if (r.found) {
      return [
        r.licence,
        r.nom,
        r.prenom,
        r.naissance,
        r.club,
        r.classement,
        r.meilleurClassement,
        r.licenceComplete,
        r.palmaresUrl || "",
      ].join(";");
    }
    return `${r.licence};NON TROUVE;;;;;;;`;
  });

  const csv = [header, ...rows].join("\n");
  navigator.clipboard.writeText(csv).then(() => {
    copiedToast.classList.remove("hidden");
    setTimeout(() => copiedToast.classList.add("hidden"), 1500);
  });
}

// ── Events ──
btnSearch.addEventListener("click", runSearch);
btnClear.addEventListener("click", async () => {
  textarea.value = "";
  allResults = [];
  resultsBody.innerHTML = "";
  resultsSection.classList.add("hidden");
  progressSection.classList.add("hidden");
  detailFetchSection.classList.add("hidden");
  detailFetchTotal = 0;
  detailFetchDone = 0;
  hideError();
  await chrome.storage.local.remove(STORAGE_KEY);
});
btnStop.addEventListener("click", () => {
  searchAborted = true;
  btnStop.classList.add("hidden");
});
btnCopy.addEventListener("click", copyCSV);
btnExportMd.addEventListener("click", exportMarkdown);

// Sauvegarder le textarea quand on tape
textarea.addEventListener("input", () => {
  saveState();
});

// Raccourci Ctrl+Enter pour lancer la recherche
textarea.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runSearch();
  }
});

// ── Restaurer l'état au chargement ──
document.addEventListener("DOMContentLoaded", restoreState);
