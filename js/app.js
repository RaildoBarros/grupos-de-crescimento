const CSV_PATH = "data/grupos.csv";
const IMAGE_DIR = "images/grupos/";
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const PLACEHOLDER_IMAGE = "images/placeholder-group.svg";

const FAIXA_CATS = ["11-14 anos", "15-17 anos", "18-24 anos", "25-30 anos", "Até 35 anos", ">30", ">40"];
const FAMILIA_CATS = ["Casais", "Com filhos", "Sem filhos", "Família", "Mulheres Casadas", "Mulheres Solteiras", "Homens Solteiros", "Mães"];
const PUBLICO_CATS = ["Homens", "Mulheres", "Jovens", "Adolescentes", "Jovens Meninas", "Jovens Rapazes"];
const PROFILE_OPTIONS = [
  { label: "Homem", terms: ["homens", "homens solteiros", "jovens rapazes"] },
  { label: "Mulher", terms: ["mulheres", "mulheres solteiras", "mulheres casadas", "maes", "jovens meninas"] },
  { label: "Adolescente", terms: ["adolescentes", "jovens meninas", "jovens rapazes", "11-14 anos", "15-17 anos"] },
  { label: "Jovem", terms: ["jovens", "18-24 anos"] },
  { label: "Casal", terms: ["casais"] },
  { label: "Solteiro(a)", terms: ["mulheres solteiras", "homens solteiros"] },
  { label: "Com filhos", terms: ["com filhos", "maes", "familia"] },
  { label: "Sem filhos", terms: ["sem filhos"] },
];

let DATA = [];
let lastFocusedElement = null;

const state = {
  search: "",
  preferredAge: null,
  profiles: new Set(),
  recommendationsActive: false,
  dias: new Set(),
  publico: new Set(),
  familia: new Set(),
  faixa: new Set(),
  regiao: new Set(),
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanText(raw) {
  const value = String(raw ?? "").trim();
  return value === "-" ? "" : value;
}

function stripHtml(raw) {
  if (!raw || raw === "-") return "";
  const source = String(raw).replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n");
  const div = document.createElement("div");
  div.innerHTML = source;
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanPhone(raw) {
  const digits = cleanText(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function parseIntOrNull(raw) {
  const value = cleanText(raw);
  if (!value) return null;
  const number = Number.parseInt(value, 10);
  return Number.isNaN(number) ? null : number;
}

const BAIRRO_NORMALIZE = {
  "sao francisco": "São Francisco",
  "sao vicente": "São Vicente",
  "centenario": "Centenário",
  "dr. airton rocha": "Dr. Airton Rocha",
};

function extractBairro(endereco) {
  if (!endereco) return null;
  const parts = endereco.replace(/ - /g, ", ").split(",").map(part => part.trim()).filter(Boolean);
  const cityIndex = parts.findIndex(part => normalizeText(part).includes("boa vista"));
  if (cityIndex <= 0) return null;
  for (let index = cityIndex - 1; index >= 0; index -= 1) {
    const segment = parts[index];
    if (/^\d/.test(segment) || /^casa\s+\d+/i.test(segment) || /^\d{5}-?\d{3}$/.test(segment)) continue;
    return BAIRRO_NORMALIZE[normalizeText(segment)] || segment;
  }
  return null;
}

function inferFrequency(description) {
  const normalized = normalizeText(description);
  if (normalized.includes("quinzen")) return "Quinzenal";
  if (normalized.includes("semanal")) return "Semanal";
  if (normalized.includes("mensal")) return "Mensal";
  return "Frequência não informada";
}

function inferAgeRange(categories) {
  const ranges = categories.map(normalizeText).map(category => {
    const numericRange = category.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s*anos?$/);
    if (numericRange) return { min: Number(numericRange[1]), max: Number(numericRange[2]) };
    const upTo = category.match(/^ate\s*(\d{1,2})\s*anos?$/);
    if (upTo) return { min: null, max: Number(upTo[1]) };
    const over = category.match(/^>\s*(\d{1,2})$/);
    if (over) return { min: Number(over[1]) + 1, max: null };
    return null;
  }).filter(Boolean);
  if (!ranges.length) return { min: null, max: null, inferred: false };
  return {
    min: ranges.some(range => range.min === null) ? null : Math.min(...ranges.map(range => range.min)),
    max: ranges.some(range => range.max === null) ? null : Math.max(...ranges.map(range => range.max)),
    inferred: true,
  };
}

function rowToGroup(row) {
  const endereco = cleanText(row["Endereço"]);
  const categorias = String(row["Categorias"] || "").split("/").map(cleanText).filter(Boolean);
  const descricao = stripHtml(row["Descrição"]);
  const explicitMin = parseIntOrNull(row["Faixa etária mínima"]);
  const explicitMax = parseIntOrNull(row["Faixa etária máxima"]);
  const inferredAge = inferAgeRange(categorias);
  return {
    id: parseIntOrNull(row.ID),
    nome: cleanText(row.Nome),
    descricao,
    endereco,
    dia: cleanText(row["Dia da semana"]),
    horaInicio: cleanText(row["Hora início"]),
    horaFim: cleanText(row["Hora fim"]),
    categorias,
    categoriasNormalizadas: categorias.map(normalizeText),
    idadeMin: explicitMin ?? inferredAge.min,
    idadeMax: explicitMax ?? inferredAge.max,
    idadeInferida: explicitMin === null && explicitMax === null && inferredAge.inferred,
    lider: cleanText(row["Líder"]),
    telLider: cleanPhone(row["Telefone do Líder"]),
    colider: cleanText(row["Co-líder"]),
    telColider: cleanPhone(row["Telefone do Co-líder"]),
    limite: parseIntOrNull(row["Limite de participantes"]),
    participantes: parseIntOrNull(row["Total de participantes"]),
    bairro: extractBairro(endereco),
    frequencia: inferFrequency(descricao),
    geoQuery: endereco || null,
    imagemBase: row.ID ? `${IMAGE_DIR}${String(row.ID).trim()}` : null,
  };
}

function loadData() {
  return new Promise((resolve, reject) => {
    if (typeof Papa === "undefined") {
      reject(new Error("Leitor de CSV indisponível"));
      return;
    }
    Papa.parse(CSV_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: results => resolve(results.data.filter(row => cleanText(row.Status) === "Ativo").map(rowToGroup)),
      error: reject,
    });
  });
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function uniqueDias() {
  const available = new Set(DATA.map(group => group.dia).filter(Boolean));
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"].filter(day => available.has(day));
}

function uniqueBairros() {
  return [...new Set(DATA.map(group => group.bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function buildChips(containerId, values, stateSet, onChange = render) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  values.forEach(value => {
    const chip = createElement("button", "chip", value);
    chip.type = "button";
    chip.dataset.value = value;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      const active = !stateSet.has(value);
      if (active) stateSet.add(value); else stateSet.delete(value);
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
      onChange();
    });
    container.append(chip);
  });
}

function intersects(groupValues, selectedValues) {
  if (!selectedValues.size) return true;
  const normalizedGroup = new Set(groupValues.map(normalizeText));
  return [...selectedValues].some(value => normalizedGroup.has(normalizeText(value)));
}

function matchesAge(group, age) {
  if (age === null) return null;
  if (group.idadeMin === null && group.idadeMax === null) return null;
  return (group.idadeMin === null || age >= group.idadeMin) && (group.idadeMax === null || age <= group.idadeMax);
}

function matchesProfile(group, profileLabel) {
  const option = PROFILE_OPTIONS.find(profile => profile.label === profileLabel);
  if (!option) return false;
  return option.terms.some(term => group.categoriasNormalizadas.includes(normalizeText(term)));
}

function filterData() {
  const query = normalizeText(state.search);
  return DATA.filter(group => {
    if (!intersects([group.dia], state.dias)) return false;
    if (!intersects(group.bairro ? [group.bairro] : [], state.regiao)) return false;
    if (!intersects(group.categorias, state.publico)) return false;
    if (!intersects(group.categorias, state.familia)) return false;
    if (!intersects(group.categorias, state.faixa)) return false;
    if (query) {
      const searchable = normalizeText([group.nome, group.descricao, ...group.categorias, group.dia, group.bairro].filter(Boolean).join(" "));
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

function availability(group) {
  if (group.limite === null || group.participantes === null) return { score: 0, label: "Vagas a confirmar", status: "unknown" };
  const remaining = group.limite - group.participantes;
  if (remaining <= 0) return { score: -40, label: "Lista de espera", status: "full" };
  return { score: 15, label: `${remaining} ${remaining === 1 ? "vaga" : "vagas"}`, status: "open" };
}

function compatibility(group) {
  let score = 0;
  let confirmed = 0;
  const ageMatch = matchesAge(group, state.preferredAge);
  if (ageMatch === true) { score += 45; confirmed += 1; }
  else if (ageMatch === false) score -= 80;
  else if (state.preferredAge !== null) score -= 8;

  state.profiles.forEach(profile => {
    if (matchesProfile(group, profile)) { score += 24; confirmed += 1; }
    else score -= 12;
  });

  score += availability(group).score;
  if (group.endereco) { score += 8; confirmed += 1; } else score -= 5;
  if (group.telLider || group.telColider) score += 5;
  if (group.frequencia !== "Frequência não informada") score += 3;
  return { score, confirmed };
}

function sortedResults() {
  const groups = filterData();
  if (!state.recommendationsActive) return groups;
  return groups.sort((a, b) => {
    const resultA = compatibility(a);
    const resultB = compatibility(b);
    return resultB.score - resultA.score || resultB.confirmed - resultA.confirmed || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

function ageLabel(group) {
  if (group.idadeMin === null && group.idadeMax === null) return "Todas as idades / confirmar";
  if (group.idadeMin !== null && group.idadeMax !== null) return `${group.idadeMin} a ${group.idadeMax} anos`;
  if (group.idadeMin !== null) return `A partir de ${group.idadeMin} anos`;
  return `Até ${group.idadeMax} anos`;
}

function timeLabel(group) {
  if (!group.horaInicio || group.horaInicio === "00:00") return `${group.dia || "Dia a combinar"} · Horário a combinar`;
  return `${group.dia || "Dia a combinar"} · ${group.horaInicio}${group.horaFim && group.horaFim !== "00:00" ? `–${group.horaFim}` : ""}`;
}

function whatsLink(phone, nome) {
  if (!phone) return null;
  const message = encodeURIComponent(`Olá! Vi o ${nome} na página de Grupos de Crescimento e gostaria de participar.`);
  return `https://wa.me/${phone}?text=${message}`;
}

function attachImageFallback(image, group) {
  if (!group.imagemBase) { image.src = PLACEHOLDER_IMAGE; return; }
  let index = 0;
  const tryNext = () => {
    if (index >= IMAGE_EXTENSIONS.length) { image.onerror = null; image.src = PLACEHOLDER_IMAGE; return; }
    image.src = `${group.imagemBase}.${IMAGE_EXTENSIONS[index]}`;
    index += 1;
  };
  image.onerror = tryNext;
  tryNext();
}

function appendInfo(parent, label, value, className = "") {
  const item = createElement("div", `card-info-item ${className}`.trim());
  item.append(createElement("span", "info-label", label), createElement("span", "info-value", value));
  parent.append(item);
}

function renderCard(group, index) {
  const card = createElement("article", "card");
  const imageWrap = createElement("div", "card-img");
  const image = createElement("img");
  image.alt = `Foto do ${group.nome}`;
  image.loading = "lazy";
  attachImageFallback(image, group);
  imageWrap.append(image);

  const body = createElement("div", "card-body");
  const top = createElement("div", "card-top");
  top.append(createElement("h3", "", group.nome));
  const availabilityInfo = availability(group);
  top.append(createElement("span", `availability ${availabilityInfo.status}`, availabilityInfo.label));

  if (state.recommendationsActive && index < 3 && compatibility(group).score > 0) {
    body.append(createElement("span", "match-badge", index === 0 ? "Melhor compatibilidade" : "Boa compatibilidade"));
  }
  body.append(top);

  const categories = createElement("div", "tag-row");
  group.categorias.slice(0, 4).forEach(category => categories.append(createElement("span", "tag", category)));
  body.append(categories);

  const info = createElement("div", "card-info");
  appendInfo(info, "Quando", timeLabel(group));
  appendInfo(info, "Idade", ageLabel(group));
  appendInfo(info, "Local", group.bairro || "Local combinado com o líder");
  appendInfo(info, "Frequência", group.frequencia, group.frequencia.includes("não informada") ? "muted" : "");
  body.append(info);

  const actions = createElement("div", "card-actions");
  const phone = group.telLider || group.telColider;
  if (phone) {
    const interest = createElement("a", "interest-btn", "Tenho interesse");
    interest.href = whatsLink(phone, group.nome);
    interest.target = "_blank";
    interest.rel = "noopener";
    interest.setAttribute("aria-label", `Tenho interesse no ${group.nome}; abrir WhatsApp`);
    actions.append(interest);
  } else {
    const unavailable = createElement("button", "interest-btn disabled", "Contato indisponível");
    unavailable.type = "button";
    unavailable.disabled = true;
    actions.append(unavailable);
  }
  const details = createElement("button", "details-btn", "Ver detalhes");
  details.type = "button";
  details.setAttribute("aria-label", `Ver detalhes do ${group.nome}`);
  details.addEventListener("click", () => openModal(group));
  actions.append(details);
  body.append(actions);
  card.append(imageWrap, body);
  return card;
}

function renderActiveFilters() {
  const container = document.getElementById("active-filters");
  container.replaceChildren();
  const values = [...state.publico, ...state.familia, ...state.regiao, ...state.dias, ...state.faixa];
  if (state.search) values.unshift(`Busca: ${state.search}`);
  values.forEach(value => container.append(createElement("span", "active-filter", value)));
}

function render() {
  const groups = sortedResults();
  const container = document.getElementById("cards-container");
  const empty = document.getElementById("empty-state");
  container.replaceChildren();
  container.setAttribute("aria-busy", "false");
  document.getElementById("count-label").textContent = `${groups.length} de ${DATA.length} grupos`;
  document.getElementById("results-kicker").textContent = state.recommendationsActive ? "Recomendados para seu perfil" : "Todos os grupos";
  document.getElementById("results-title").textContent = state.recommendationsActive ? "Melhores grupos para você" : "Grupos disponíveis";
  empty.hidden = groups.length !== 0;
  groups.forEach((group, index) => container.append(renderCard(group, index)));
  renderActiveFilters();
  updateMapMarkers(groups);
}

function addModalInfo(grid, label, value) {
  const item = createElement("div");
  item.append(createElement("span", "", label), document.createTextNode(value));
  grid.append(item);
}

function openModal(group) {
  lastFocusedElement = document.activeElement;
  const overlay = document.getElementById("overlay");
  const modal = document.getElementById("modal-content");
  modal.replaceChildren();

  const close = createElement("button", "modal-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fechar detalhes");
  close.addEventListener("click", closeModal);
  const imageWrap = createElement("div", "modal-img");
  const image = createElement("img");
  image.alt = `Foto do ${group.nome}`;
  attachImageFallback(image, group);
  imageWrap.append(image);

  const body = createElement("div", "modal-body");
  const title = createElement("h3", "", group.nome);
  title.id = "modal-title";
  body.append(title, createElement("div", "meta-line", timeLabel(group)));
  const tags = createElement("div", "tag-row");
  group.categorias.forEach(category => tags.append(createElement("span", "tag", category)));
  body.append(tags, createElement("div", "desc", group.descricao || "Entre em contato com a liderança para mais informações sobre este grupo."));

  const grid = createElement("div", "info-grid");
  addModalInfo(grid, "Faixa etária", ageLabel(group));
  addModalInfo(grid, "Endereço", group.endereco || "A combinar com a liderança");
  addModalInfo(grid, "Frequência", group.frequencia);
  addModalInfo(grid, "Líder", group.lider || "Não informado");
  addModalInfo(grid, "Co-líder", group.colider || "Não informado");
  addModalInfo(grid, "Disponibilidade", availability(group).label);
  body.append(grid);

  const contacts = createElement("div", "contacts");
  [[group.telLider, group.lider], [group.telColider, group.colider]].forEach(([phone, name], index) => {
    if (!phone) return;
    const link = createElement("a", `btn-whats${index ? " secondary" : ""}`, `Falar com ${(name || "a liderança").split(" ")[0]}`);
    link.href = whatsLink(phone, group.nome);
    link.target = "_blank";
    link.rel = "noopener";
    contacts.append(link);
  });
  body.append(contacts);
  modal.append(close, imageWrap, body);
  overlay.hidden = false;
  overlay.classList.add("open");
  document.body.classList.add("modal-open");
  modal.focus();
}

function closeModal() {
  const overlay = document.getElementById("overlay");
  overlay.classList.remove("open");
  overlay.hidden = true;
  document.body.classList.remove("modal-open");
  if (lastFocusedElement) lastFocusedElement.focus();
}

const BOA_VISTA_CENTER = [2.8235, -60.6758];
let map = null;
let markerLayer = null;
let mapLoading = false;
const geocodeCache = {};

function initMap() {
  const hint = document.getElementById("map-hint");
  if (map || mapLoading) return;
  if (typeof L === "undefined") { hint.textContent = "Não foi possível carregar o mapa."; return; }
  map = L.map("map", { scrollWheelZoom: false }).setView(BOA_VISTA_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  geocodeAllThenRender();
}

async function geocodeAddress(query) {
  if (Object.prototype.hasOwnProperty.call(geocodeCache, query)) return geocodeCache[query];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Falha ao localizar endereço");
    const json = await response.json();
    if (json.length) return (geocodeCache[query] = { lat: Number(json[0].lat), lon: Number(json[0].lon) });
  } catch (_) { /* O restante da página continua funcionando sem geocodificação. */ }
  geocodeCache[query] = null;
  return null;
}

async function geocodeAllThenRender() {
  mapLoading = true;
  const hint = document.getElementById("map-hint");
  const queries = [...new Set(DATA.map(group => group.geoQuery).filter(Boolean))];
  for (let index = 0; index < queries.length; index += 1) {
    await geocodeAddress(queries[index]);
    hint.textContent = `Localizando grupos… (${index + 1}/${queries.length})`;
    if (index < queries.length - 1) await new Promise(resolve => setTimeout(resolve, 1050));
  }
  mapLoading = false;
  const located = queries.filter(query => geocodeCache[query]).length;
  hint.textContent = located ? `${located} grupos localizados. Os demais combinam o local com a liderança.` : "Não foi possível localizar os endereços no momento.";
  updateMapMarkers(sortedResults());
}

function updateMapMarkers(groups) {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const bounds = [];
  groups.forEach(group => {
    const coords = group.geoQuery && geocodeCache[group.geoQuery];
    if (!coords) return;
    const popup = createElement("div");
    popup.append(createElement("b", "", group.nome), document.createElement("br"), document.createTextNode(timeLabel(group)), document.createElement("br"));
    const details = createElement("button", "popup-link", "Ver detalhes");
    details.type = "button";
    details.addEventListener("click", () => openModal(group));
    popup.append(details);
    L.marker([coords.lat, coords.lon]).bindPopup(popup).addTo(markerLayer);
    bounds.push([coords.lat, coords.lon]);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  else map.setView(BOA_VISTA_CENTER, 12);
}

function setMobileFilters(open) {
  const panel = document.getElementById("filters-panel");
  const toggle = document.getElementById("mobile-filter-toggle");
  const backdrop = document.getElementById("filter-backdrop");
  panel.classList.toggle("mobile-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  backdrop.hidden = !open;
  document.body.classList.toggle("filters-open", open);
  if (open) document.getElementById("filters-title").focus?.();
}

function clearFilters() {
  [state.dias, state.publico, state.familia, state.faixa, state.regiao, state.profiles].forEach(set => set.clear());
  state.search = "";
  state.preferredAge = null;
  state.recommendationsActive = false;
  document.getElementById("search-input").value = "";
  document.getElementById("age-input").value = "";
  document.querySelectorAll(".chip.active").forEach(chip => { chip.classList.remove("active"); chip.setAttribute("aria-pressed", "false"); });
  render();
}

function setupUI() {
  buildChips("filter-regiao", uniqueBairros(), state.regiao);
  buildChips("filter-dia", uniqueDias(), state.dias);
  buildChips("filter-publico", PUBLICO_CATS, state.publico);
  buildChips("filter-familia", FAMILIA_CATS, state.familia);
  buildChips("filter-faixa", FAIXA_CATS, state.faixa);
  buildChips("guided-profile", PROFILE_OPTIONS.map(profile => profile.label), state.profiles, () => {});

  document.getElementById("guided-form").addEventListener("submit", event => {
    event.preventDefault();
    const ageValue = document.getElementById("age-input").value;
    state.preferredAge = ageValue === "" ? null : Number.parseInt(ageValue, 10);
    state.recommendationsActive = state.preferredAge !== null || state.profiles.size > 0;
    render();
    document.getElementById("results-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("search-input").addEventListener("input", event => { state.search = event.target.value; render(); });
  document.getElementById("clear-filters").addEventListener("click", clearFilters);

  document.getElementById("overlay").addEventListener("click", event => { if (event.target.id === "overlay") closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !document.getElementById("overlay").hidden) closeModal();
    if (event.key === "Escape" && document.getElementById("filters-panel").classList.contains("mobile-open")) setMobileFilters(false);
  });

  document.getElementById("mobile-filter-toggle").addEventListener("click", () => setMobileFilters(true));
  document.getElementById("filters-close").addEventListener("click", () => setMobileFilters(false));
  document.getElementById("filter-backdrop").addEventListener("click", () => setMobileFilters(false));

  document.getElementById("toggle-map").addEventListener("click", event => {
    const content = document.getElementById("map-content");
    const show = content.hidden;
    content.hidden = !show;
    event.currentTarget.setAttribute("aria-expanded", String(show));
    event.currentTarget.textContent = show ? "Ocultar mapa" : "Mostrar mapa";
    if (show) { initMap(); window.setTimeout(() => map?.invalidateSize(), 50); }
  });
}

async function main() {
  const container = document.getElementById("cards-container");
  container.append(createElement("div", "loading-msg", "Carregando grupos…"));
  try {
    DATA = await loadData();
  } catch (error) {
    container.replaceChildren(createElement("div", "empty-state load-error", "Não foi possível carregar os grupos. Atualize a página ou tente novamente mais tarde."));
    container.setAttribute("aria-busy", "false");
    console.error(error);
    return;
  }
  setupUI();
  render();
}

document.addEventListener("DOMContentLoaded", main);
