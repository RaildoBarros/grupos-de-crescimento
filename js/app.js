/* ============================================================
   Grupos de Crescimento — leitura do CSV e lógica da página
   ============================================================ */

const CSV_PATH = "data/grupos.csv";
const IMAGE_DIR = "images/grupos/";
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const PLACEHOLDER_IMAGE = "images/placeholder-group.svg";

let DATA = [];

function setupTheme() {
  const toggle = document.getElementById("theme-toggle");
  const savedTheme = localStorage.getItem("theme");
  const applyTheme = (theme) => {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", isDark ? "#000000" : "#183c28");
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.title = isDark ? "Ativar tema claro" : "Ativar tema escuro";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.querySelector(".theme-toggle-label").textContent = isDark ? "Tema claro" : "Tema escuro";
  };

  applyTheme(savedTheme === "dark" ? "dark" : "light");
  toggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", theme);
    applyTheme(theme);
  });
}

// ---------------- CSV → objetos de grupo ----------------

function stripHtml(raw) {
  if (!raw || raw === "-") return "";
  let s = String(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  const div = document.createElement("div");
  div.innerHTML = s;
  let text = div.textContent || div.innerText || "";
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

function cleanPhone(raw) {
  if (!raw || raw === "-") return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function parseIntOrNull(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === "" || s === "-") return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function parseCoordinate(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const value = parseFloat(String(raw).trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function cleanText(raw) {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  return s === "-" ? "" : s;
}

const BAIRRO_NORMALIZE = {
  "sao francisco": "São Francisco",
  "sao vicente": "São Vicente",
  "centenario": "Centenário",
  "centenário": "Centenário",
  "dr. airton rocha": "Dr. Airton Rocha",
};

function stripAccents(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractBairro(endereco) {
  if (!endereco) return null;
  const s = endereco.replace(/ - /g, ", ");
  const parts = s.split(",").map(p => p.trim()).filter(Boolean);
  let idx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/boa vista/i.test(parts[i])) { idx = i; break; }
  }
  if (idx <= 0) return null;
  for (let j = idx - 1; j >= 0; j--) {
    const seg = parts[j];
    if (/^\d/.test(seg)) continue;
    if (/^casa\s+\d+/i.test(seg)) continue;
    if (/^\d{5}-?\d{3}$/.test(seg)) continue;
    const key = stripAccents(seg).toLowerCase();
    return BAIRRO_NORMALIZE[key] || seg;
  }
  return null;
}

function rowToGroup(row) {
  const endereco = cleanText(row["Endereço"]);
  const latitude = parseCoordinate(row["Latitude"]);
  const longitude = parseCoordinate(row["Longitude"]);
  const categorias = String(row["Categorias"] || "")
    .split("/")
    .map(c => c.trim())
    .filter(c => c && c !== "-");

  return {
    id: parseIntOrNull(row["ID"]),
    nome: cleanText(row["Nome"]),
    descricao: stripHtml(row["Descrição"]),
    endereco: endereco,
    dia: cleanText(row["Dia da semana"]),
    horaInicio: cleanText(row["Hora início"]),
    horaFim: cleanText(row["Hora fim"]),
    categorias: categorias,
    idadeMin: parseIntOrNull(row["Faixa etária mínima"]),
    idadeMax: parseIntOrNull(row["Faixa etária máxima"]),
    lider: cleanText(row["Líder"]),
    telLider: cleanPhone(row["Telefone do Líder"]),
    colider: cleanText(row["Co-líder"]),
    telColider: cleanPhone(row["Telefone do Co-líder"]),
    vagas: parseIntOrNull(row["Limite de participantes"]),
    totalParticipantes: parseIntOrNull(row["Total de participantes"]),
    bairro: extractBairro(endereco),
    geoQuery: endereco || null,
    coordinates: latitude !== null && longitude !== null ? { lat: latitude, lon: longitude } : null,
    imagemBase: row["ID"] ? IMAGE_DIR + String(row["ID"]).trim() : null,
  };
}

function loadData() {
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.filter(r => (r["Status"] || "").trim() === "Ativo");
        resolve(rows.map(rowToGroup));
      },
      error: (err) => reject(err),
    });
  });
}

// ---------------- taxonomia dos filtros ----------------

const FAIXA_CATS = ["11-14 anos", "15-17 anos", "18-24 anos", "25-30 anos", "Até 35 anos", ">30", ">40"];
const FAMILIA_CATS = ["Casais", "Com filhos", "Sem filhos", "Família", "Mulheres Casadas", "Mulheres Solteiras", "Homens Solteiros", "Mães"];
const PUBLICO_CATS = ["Homens", "Mulheres", "Jovens", "Adolescentes", "Jovens Meninas", "Jovens Rapazes"];

const state = {
  search: "",
  age: null,
  dias: new Set(),
  publico: new Set(),
  familia: new Set(),
  faixa: new Set(),
  regiao: new Set(),
};

function uniqueDias() {
  const set = new Set(DATA.map(g => g.dia).filter(Boolean));
  const order = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return order.filter(d => set.has(d));
}

function uniqueBairros() {
  return [...new Set(DATA.map(g => g.bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function buildChips(containerId, values, stateSet) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  values.forEach(val => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = val;
    chip.dataset.value = val;
    chip.addEventListener("click", () => {
      if (stateSet.has(val)) { stateSet.delete(val); chip.classList.remove("active"); }
      else { stateSet.add(val); chip.classList.add("active"); }
      render();
    });
    el.appendChild(chip);
  });
}

// ---------------- filtragem ----------------

function matchesAge(group, age) {
  if (age === null || isNaN(age)) return true;
  const min = group.idadeMin, max = group.idadeMax;
  if (min === null && max === null) return true;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  return true;
}

function groupCats(g) { return new Set(g.categorias); }

function filterData() {
  const q = state.search.trim().toLowerCase();
  return DATA.filter(g => {
    // Dentro de cada grupo de filtros, basta uma opção corresponder (OU).
    // Grupos de filtros diferentes continuam sendo combinados entre si (E).
    if (state.dias.size && !state.dias.has(g.dia)) return false;
    if (state.regiao.size && !(g.bairro && state.regiao.has(g.bairro))) return false;
    const cats = groupCats(g);
    if (state.publico.size && ![...state.publico].some(c => cats.has(c))) return false;
    if (state.familia.size && ![...state.familia].some(c => cats.has(c))) return false;
    if (state.faixa.size && ![...state.faixa].some(c => cats.has(c))) return false;
    if (!matchesAge(g, state.age)) return false;
    if (q) {
      const hay = (g.nome + " " + g.descricao + " " + g.categorias.join(" ") + " " + g.dia + " " + (g.bairro || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------------- renderização dos cards ----------------

function excerpt(text, len) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len).trim() + "…" : clean;
}

function whatsLink(phone, nome) {
  if (!phone) return null;
  const msg = encodeURIComponent(`Olá! Vi o ${nome} na página de Grupos de Crescimento e gostaria de mais informações.`);
  return `https://wa.me/${phone}?text=${msg}`;
}

/**
 * Tenta carregar a foto do grupo testando as extensões em IMAGE_EXTENSIONS,
 * uma de cada vez. Se nenhuma existir, usa a ilustração placeholder.
 */
function attachImageFallback(imgEl, group) {
  if (!group.imagemBase) {
    imgEl.src = PLACEHOLDER_IMAGE;
    return;
  }
  let i = 0;
  const tryNext = () => {
    if (i >= IMAGE_EXTENSIONS.length) {
      imgEl.onerror = null;
      imgEl.src = PLACEHOLDER_IMAGE;
      return;
    }
    imgEl.src = `${group.imagemBase}.${IMAGE_EXTENSIONS[i]}`;
    i++;
  };
  imgEl.onerror = tryNext;
  tryNext();
}

function renderCard(g) {
  const card = document.createElement("div");
  card.className = "card";
  const timeStr = (g.horaInicio && g.horaInicio !== "00:00") ? `${g.dia} · ${g.horaInicio}` : g.dia;
  const tags = g.categorias.slice(0, 3).map(c => `<span class="tag">${c}</span>`).join("");
  card.innerHTML = `
    <div class="card-img"><img alt="Foto do ${g.nome}"></div>
    <div class="card-body">
      <div class="card-top">
        <h3>${g.nome}</h3>
        <span class="day-badge">${timeStr}</span>
      </div>
      <div class="excerpt">${excerpt(g.descricao || "Grupo de Crescimento — entre em contato para saber mais.", 150)}</div>
      <div class="tag-row">${tags}</div>
      <div class="card-foot">
        <span class="leader">${g.lider || "—"}${g.bairro ? " · " + g.bairro : ""}</span>
        <span>Ver detalhes →</span>
      </div>
    </div>
  `;
  attachImageFallback(card.querySelector(".card-img img"), g);
  card.addEventListener("click", () => openModal(g));
  return card;
}

function render() {
  const filtered = filterData();
  const container = document.getElementById("cards-container");
  const empty = document.getElementById("empty-state");
  container.innerHTML = "";
  document.getElementById("count-label").textContent = `${filtered.length} de ${DATA.length} grupos`;
  if (filtered.length === 0) {
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    filtered.forEach(g => container.appendChild(renderCard(g)));
  }
  updateMapMarkers(filtered);
}

// ---------------- modal de detalhes ----------------

function openModal(g) {
  const overlay = document.getElementById("overlay");
  const modal = document.getElementById("modal-content");
  const tags = g.categorias.map(c => `<span class="tag">${c}</span>`).join("");
  const timeStr = (g.horaInicio && g.horaInicio !== "00:00") ? `${g.horaInicio} às ${g.horaFim}` : "Horário a combinar";
  const idadeStr = (g.idadeMin || g.idadeMax) ? `${g.idadeMin ?? "livre"}${g.idadeMax ? " a " + g.idadeMax : "+"} anos` : "Todas as idades";
  const liderLink = whatsLink(g.telLider, g.nome);
  const coliderLink = whatsLink(g.telColider, g.nome);

  modal.innerHTML = `
    <button class="modal-close" id="modal-close">✕</button>
    <div class="modal-img"><img alt="Foto do ${g.nome}"></div>
    <div class="modal-body">
      <h3>${g.nome}</h3>
      <div class="meta-line">${g.dia} · ${timeStr}</div>
      <div class="tag-row">${tags}</div>
      <div class="desc">${g.descricao || "Entre em contato com a liderança para mais informações sobre este grupo."}</div>
      <div class="info-grid">
        <div><span>Faixa etária</span>${idadeStr}</div>
        <div><span>Endereço</span>${g.endereco || "A combinar com a liderança"}</div>
        <div><span>Líder</span>${g.lider || "—"}</div>
        <div><span>Co-líder</span>${g.colider || "—"}</div>
      </div>
      <div class="contacts">
        ${liderLink ? `<a class="btn-whats" href="${liderLink}" target="_blank" rel="noopener">Falar com ${g.lider.split(" ")[0]} no WhatsApp</a>` : ""}
        ${coliderLink ? `<a class="btn-whats secondary" href="${coliderLink}" target="_blank" rel="noopener">Falar com ${g.colider.split(" ")[0]}</a>` : ""}
      </div>
    </div>
  `;
  attachImageFallback(modal.querySelector(".modal-img img"), g);
  overlay.classList.add("open");
  document.getElementById("modal-close").addEventListener("click", closeModal);
}

function closeModal() {
  document.getElementById("overlay").classList.remove("open");
}

// ---------------- mapa (Leaflet) ----------------

const BOA_VISTA_CENTER = [2.8235, -60.6758];
let map = null;
let markerLayer = null;

function initMap() {
  const mapHint = document.getElementById("map-hint");
  if (typeof L === "undefined") {
    mapHint.textContent = "Não foi possível carregar o mapa (sem conexão com a internet).";
    return;
  }
  map = L.map("map", { scrollWheelZoom: false }).setView(BOA_VISTA_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  updateMapMarkers(filterData());
  const withCoords = DATA.filter(g => g.coordinates).length;
  mapHint.textContent = withCoords === 0
    ? "Nenhum grupo possui coordenadas cadastradas no momento."
    : `${withCoords} de ${DATA.length} grupos têm endereço cadastrado. Os demais combinam o local diretamente com a liderança.`;
}

function updateMapMarkers(groups) {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const bounds = [];
  groups.forEach(g => {
    if (!g.geoQuery) return;
    const coords = g.coordinates;
    if (!coords) return;
    const marker = L.marker([coords.lat, coords.lon]);
    const timeStr = (g.horaInicio && g.horaInicio !== "00:00") ? `${g.dia} · ${g.horaInicio}` : g.dia;
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `<b>${g.nome}</b><br>${timeStr}${g.bairro ? " · " + g.bairro : ""}<br><span class="popup-link">Ver detalhes</span>`;
    popupDiv.querySelector(".popup-link").addEventListener("click", () => openModal(g));
    marker.bindPopup(popupDiv);
    marker.addTo(markerLayer);
    bounds.push([coords.lat, coords.lon]);
  });
  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  } else {
    map.setView(BOA_VISTA_CENTER, 12);
  }
}

// ---------------- inicialização ----------------

function setupUI() {
  buildChips("filter-regiao", uniqueBairros(), state.regiao);
  buildChips("filter-dia", uniqueDias(), state.dias);
  buildChips("filter-publico", PUBLICO_CATS, state.publico);
  buildChips("filter-familia", FAMILIA_CATS, state.familia);
  buildChips("filter-faixa", FAIXA_CATS, state.faixa);

  const filters = document.querySelector(".filters");
  const toggleFilters = document.getElementById("toggle-filters");
  const mobileFilters = window.matchMedia("(max-width: 980px)");
  const setFiltersExpanded = (expanded) => {
    filters.classList.toggle("is-expanded", expanded);
    toggleFilters.setAttribute("aria-expanded", String(expanded));
    toggleFilters.querySelector(".sr-only").textContent = expanded ? "Ocultar filtros" : "Mostrar filtros";
  };
  // Em telas pequenas, os filtros começam fechados para priorizar os resultados.
  setFiltersExpanded(!mobileFilters.matches);
  toggleFilters.addEventListener("click", () => {
    setFiltersExpanded(!filters.classList.contains("is-expanded"));
  });

  document.getElementById("overlay").addEventListener("click", (e) => {
    if (e.target.id === "overlay") closeModal();
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });

  document.getElementById("age-input").addEventListener("input", (e) => {
    state.age = e.target.value === "" ? null : parseInt(e.target.value, 10);
    render();
  });

  document.getElementById("clear-filters").addEventListener("click", () => {
    state.dias.clear(); state.publico.clear(); state.familia.clear();
    state.faixa.clear(); state.regiao.clear();
    state.search = ""; state.age = null;
    document.getElementById("search-input").value = "";
    document.getElementById("age-input").value = "";
    document.querySelectorAll(".chip.active").forEach(c => c.classList.remove("active"));
    render();
  });

  document.getElementById("toggle-map").addEventListener("click", (e) => {
    const panel = document.getElementById("map-panel");
    const willShow = panel.hidden;
    panel.hidden = !willShow;
    e.currentTarget.setAttribute("aria-expanded", String(willShow));
    e.currentTarget.title = willShow ? "Ocultar mapa" : "Mostrar mapa";
    e.currentTarget.querySelector(".sr-only").textContent = willShow ? "Ocultar mapa" : "Mostrar mapa";

    if (willShow && !map) {
      initMap();
    } else if (willShow && map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
  });
}

async function main() {
  setupTheme();
  const container = document.getElementById("cards-container");
  container.innerHTML = `<div class="loading-msg">Carregando grupos…</div>`;
  try {
    DATA = await loadData();
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      Não foi possível carregar <code>data/grupos.csv</code>.<br>
      Se você abriu este arquivo diretamente (file://), inicie um servidor local — por exemplo
      <code>python -m http.server</code> na pasta do projeto — e acesse via http://localhost.
    </div>`;
    console.error(err);
    return;
  }
  const heroCount = document.getElementById("hero-count");
  if (heroCount) heroCount.textContent = DATA.length;

  setupUI();
  render();
}

document.addEventListener("DOMContentLoaded", main);
