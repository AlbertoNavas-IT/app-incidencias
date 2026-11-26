const SUBOPCIONES = {
  "Partida incompleta": [
    "Falta algún bulto",
    "Falta algún palet"
  ],
  "Falta de documentación": [
    "Sin albarán",
    "Documentación incompleta o errónea"
  ],
  "Material no viene en condiciones": [
    "Palet roto",
    "Picos punzantes sin cubrir",
    "Material sin flejar",
    "Material dañado"
  ]
};

let categoriaSeleccionada = "";
let detallesSeleccionados = new Set();
const fotos = [];
const MAX_FOTOS = 8;
const MAX_BASE64 = 16 * 1024 * 1024;
let procesandoFotos = false;
let claveSesion = "";
let ultimoIntento = null;
let historialCache = null;
let versionHistorial = 0;
let temporizadorToast;

document.addEventListener("DOMContentLoaded", () => {
  cargarSugerenciasLocales();
  localStorage.removeItem("cfg_pin");
  verificarConfiguracionInicial();
  configurarEventos();
});

function verificarConfiguracionInicial() {
  const url = (localStorage.getItem("cfg_url") || "").trim();
  if (!url || !claveSesion) {
    abrirModalConfig();
  }
}

function configurarEventos() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");

      if (btn.dataset.tab === "historial" && !historialCache?.length) {
        cargarHistorial();
      }
    });
  });

  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      categoriaSeleccionada = btn.dataset.cat;
      detallesSeleccionados.clear();
      renderizarSubopciones(categoriaSeleccionada);
    });
  });

  for (const [boton, entrada] of [["abrirCamara", "camara"], ["abrirGaleria", "galeria"]]) {
    const input = document.getElementById(entrada);
    document.getElementById(boton).addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const archivos = Array.from(input.files);
      input.value = "";
      agregarFotos(archivos);
    });
  }

  document.getElementById("formIncidencia").addEventListener("submit", enviarIncidencia);

  document.getElementById("btnConfig").addEventListener("click", abrirModalConfig);
  document.getElementById("btnCerrarConfig").addEventListener("click", () => {
    document.getElementById("modalConfig").classList.add("hidden");
  });
  document.getElementById("btnGuardarConfig").addEventListener("click", guardarConfiguracion);

  document.getElementById("btnRefrescar").addEventListener("click", cargarHistorial);
  document.getElementById("buscadorHistorial").addEventListener("input", filtrarHistorial);
}

function renderizarSubopciones(categoria) {
  const container = document.getElementById("subopcionesContainer");
  const chipsGrid = document.getElementById("chipsContainer");
  chipsGrid.innerHTML = "";

  const lista = SUBOPCIONES[categoria] || [];
  if (lista.length === 0) {
    container.classList.add("hidden");
    return;
  }

  lista.forEach(texto => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = texto;
    chip.addEventListener("click", () => {
      if (detallesSeleccionados.has(texto)) {
        detallesSeleccionados.delete(texto);
        chip.classList.remove("selected");
      } else {
        detallesSeleccionados.add(texto);
        chip.classList.add("selected");
      }
    });
    chipsGrid.appendChild(chip);
  });

  container.classList.remove("hidden");
}

function mostrarFotos() {
  const contenedor = document.getElementById("previewContainer");
  contenedor.replaceChildren();
  fotos.forEach((foto, indice) => {
    const figura = document.createElement("figure");
    const imagen = document.createElement("img");
    imagen.src = "data:image/jpeg;base64," + foto;
    imagen.alt = "Foto " + (indice + 1);
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "btn-danger-small";
    quitar.textContent = "Quitar foto " + (indice + 1);
    quitar.addEventListener("click", () => {
      fotos.splice(indice, 1);
      mostrarFotos();
    });
    figura.append(imagen, quitar);
    contenedor.append(figura);
  });
  document.getElementById("estadoFotos").textContent = procesandoFotos
    ? "Procesando fotos…" : fotos.length + " de " + MAX_FOTOS + " fotos";
}

async function agregarFotos(archivos) {
  if (!archivos.length || procesandoFotos) return;
  if (archivos.length + fotos.length > MAX_FOTOS) {
    mostrarToast("Puedes adjuntar hasta " + MAX_FOTOS + " fotos por incidencia");
    return;
  }
  procesandoFotos = true;
  const botones = ["abrirCamara", "abrirGaleria"].map(id => document.getElementById(id));
  botones.forEach(boton => { boton.disabled = true; });
  mostrarFotos();
  try {
    const nuevas = [];
    for (const archivo of archivos) {
      const jpeg = await comprimirImagen(archivo, 1280, 0.78);
      nuevas.push(jpeg.slice(jpeg.indexOf(",") + 1));
    }
    if ([...fotos, ...nuevas].reduce((total, foto) => total + foto.length, 0) > MAX_BASE64) {
      throw new Error("Las fotos superan los 12 MB. Añade menos fotos.");
    }
    fotos.push(...nuevas);
  } catch (err) {
    mostrarToast(err.message.includes("12 MB") ? err.message : "No se pudo añadir la selección. Comprueba las imágenes.");
  } finally {
    procesandoFotos = false;
    botones.forEach(boton => { boton.disabled = false; });
    mostrarFotos();
  }
}

async function comprimirImagen(file, maxLado, calidad) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();

    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", calidad);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) {
      throw new Error("No se pudo generar un JPEG");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function enviarIncidencia(e) {
  e.preventDefault();
  const btnEnviar = document.getElementById("btnEnviar");
  if (btnEnviar.disabled) return;

  const url = (localStorage.getItem("cfg_url") || "").trim();

  if (!url || !claveSesion) {
    abrirModalConfig();
    mostrarToast("Configura primero tu URL y contraseña");
    return;
  }

  const pedido = document.getElementById("pedido").value.trim();
  const proveedor = document.getElementById("proveedor").value.trim();
  const empresaEntrega = document.getElementById("empresaEntrega").value.trim();
  const observaciones = document.getElementById("observaciones").value.trim();

  if (!pedido) {
    mostrarToast("Introduce el nº de pedido");
    return;
  }
  if (!categoriaSeleccionada) {
    mostrarToast("Selecciona qué tipo de incidencia ocurre");
    return;
  }
  if (procesandoFotos) {
    mostrarToast("Espera a que termine de procesarse las fotos");
    return;
  }

  const controlesActivos = Array.from(e.currentTarget.elements)
    .filter(control => control !== btnEnviar && control.disabled === false);
  btnEnviar.disabled = true;
  controlesActivos.forEach(control => { control.disabled = true; });
  btnEnviar.textContent = "Guardando y enviando correo...";

  const payload = {
    accion: "registrar",
    pedido: pedido,
    proveedor: proveedor,
    empresaEntrega: empresaEntrega,
    categoria: categoriaSeleccionada,
    detalle: Array.from(detallesSeleccionados).join(", "),
    observaciones: observaciones,
    fotosBase64: fotos.slice()
  };

  try {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const firma = Array.from(new Uint8Array(hash)).join(",");
    if (ultimoIntento?.firma !== firma) {
      ultimoIntento = { firma, id: crypto.randomUUID() };
    }
    const resultado = await solicitar(url, claveSesion, { ...payload, id: ultimoIntento.id });

    guardarSugerenciaLocal("proveedores", proveedor);
    guardarSugerenciaLocal("transportes", empresaEntrega);
    cargarSugerenciasLocales();
    limpiarFormulario();
    invalidarHistorial();
    mostrarToast(resultado.aviso || "Registrado y correo enviado");
  } catch (err) {
    mostrarToast("Fallo al enviar: " + (err?.message || "revisa URL/red"));
  } finally {
    controlesActivos.forEach(control => { control.disabled = false; });
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Registrar y Enviar Correo";
  }
}

async function leerRespuesta(resp) {
  const errorHttp = resp.ok ? "" : `Error HTTP ${resp.status}`;
  let res;
  try {
    res = await resp.json();
  } catch {
    throw new Error(errorHttp || "Respuesta no válida del servidor");
  }
  if (!resp.ok || !res?.ok) {
    throw new Error(res?.error || errorHttp || "El servidor no confirmó la operación");
  }
  return res;
}

function limpiarFormulario() {
  ultimoIntento = null;
  document.getElementById("formIncidencia").reset();
  categoriaSeleccionada = "";
  detallesSeleccionados.clear();
  fotos.length = 0;
  mostrarFotos();
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("chipsContainer").replaceChildren();
  document.getElementById("subopcionesContainer").classList.add("hidden");
}

function leerSugerenciasLocales(clave) {
  try {
    const lista = JSON.parse(localStorage.getItem(clave) || "[]");
    return Array.isArray(lista) ? lista.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function guardarSugerenciaLocal(clave, valor) {
  if (!valor) return;
  const lista = leerSugerenciasLocales(clave);
  if (!lista.some(item => item.toLowerCase() === valor.toLowerCase())) {
    lista.unshift(valor);
    try {
      localStorage.setItem(clave, JSON.stringify(lista.slice(0, 40)));
    } catch {
      // Las sugerencias locales son opcionales.
    }
  }
}

function cargarSugerenciasLocales() {
  const provs = leerSugerenciasLocales("proveedores");
  const trans = leerSugerenciasLocales("transportes");

  document.getElementById("listaProveedores").innerHTML = provs.map(p => `<option value="${escapeHtml(p)}">`).join("");
  document.getElementById("listaTransportes").innerHTML = trans.map(t => `<option value="${escapeHtml(t)}">`).join("");
}

function invalidarHistorial() {
  versionHistorial++;
  historialCache = null;
  if (document.querySelector('.tab-btn.active[data-tab="historial"]')) {
    cargarHistorial();
  }
}

async function cargarHistorial() {
  const version = ++versionHistorial;
  historialCache = null;
  const url = (localStorage.getItem("cfg_url") || "").trim();
  const contenedor = document.getElementById("listaHistorial");

  if (!url || !claveSesion) {
    contenedor.innerHTML = `<p class="empty-msg">Configura la URL y la contraseña para consultar el historial.</p>`;
    return;
  }
  contenedor.innerHTML = `<p class="empty-msg">Cargando últimas incidencias...</p>`;

  try {
    const res = await solicitar(url, claveSesion, { accion: "historial" });
    if (version !== versionHistorial) return;

    const lista = res.historial ?? [];
    if (!Array.isArray(lista)) {
      throw new Error("El servidor devolvió un historial con un formato no válido");
    }
    historialCache = lista.filter(item => item && typeof item === "object" && !Array.isArray(item));
    filtrarHistorial();
  } catch (err) {
    if (version !== versionHistorial) return;
    contenedor.innerHTML = `<p class="empty-msg">Error al cargar el historial: ${escapeHtml(err?.message)}</p>`;
  }
}

function renderizarHistorial(lista, mensajeVacio) {
  const contenedor = document.getElementById("listaHistorial");
  if (lista.length === 0) {
    contenedor.innerHTML = `<p class="empty-msg">${mensajeVacio}</p>`;
    return;
  }

  contenedor.innerHTML = lista.map(item => {
    const enlaces = (item.fotoUrls || [item.fotoUrl]).map(obtenerEnlaceFoto).filter(Boolean);
    const fotosHtml = enlaces.map((url, i) =>
      `<br><a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="historial-link">Ver foto ${i + 1}</a>`
    ).join("");
    const detalle = item.detalle ? ` (${escapeHtml(item.detalle)})` : "";
    return `
      <div class="historial-item">
        <h3>Pedido: ${escapeHtml(item.pedido)} — ${escapeHtml(item.proveedor)}</h3>
        <div class="historial-meta">${escapeHtml(item.fecha)} ${escapeHtml(item.hora)} · ${escapeHtml(item.empresaEntrega)}</div>
        <span class="historial-tag">${escapeHtml(item.categoria)}${detalle}</span>
        ${item.observaciones && item.observaciones !== "Ninguna" ? `<p class="historial-meta" style="margin-top:6px;">${escapeHtml(item.observaciones)}</p>` : ""}
        ${fotosHtml}
      </div>
    `;
  }).join("");
}

function obtenerEnlaceFoto(valor) {
  if (typeof valor !== "string" || !valor.trim() || valor.trim() === "Sin foto") return "";
  try {
    const enlace = new URL(valor, document.baseURI);
    return enlace.protocol === "https:" || enlace.protocol === "http:" ? enlace.href : "";
  } catch {
    return "";
  }
}

function filtrarHistorial() {
  if (historialCache === null) return;
  const consulta = document.getElementById("buscadorHistorial").value.trim().toLowerCase();
  const filtrados = historialCache.filter(({ pedido, proveedor, empresaEntrega }) =>
    [pedido, proveedor, empresaEntrega].some(valor => String(valor ?? "").toLowerCase().includes(consulta))
  );
  const mensajeVacio = historialCache.length
    ? "No hay incidencias que coincidan con la búsqueda."
    : "No hay incidencias registradas todavía.";
  renderizarHistorial(filtrados, mensajeVacio);
}

function abrirModalConfig() {
  document.getElementById("cfgUrl").value = localStorage.getItem("cfg_url") || "";
  document.getElementById("cfgClave").value = "";
  document.getElementById("modalConfig").classList.remove("hidden");
}

async function solicitar(url, clave, datos) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url)) {
    throw new Error("Introduce la URL de Google Apps Script que termina en /exec");
  }
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...datos, clave })
  });
  return leerRespuesta(respuesta);
}

async function guardarConfiguracion() {
  const url = document.getElementById("cfgUrl").value.trim();
  const campo = document.getElementById("cfgClave");
  const clave = campo.value;
  if (!url || clave.length < 16 || clave.length > 256) {
    mostrarToast("Introduce la URL y una contraseña de 16 a 256 caracteres");
    return;
  }
  const boton = document.getElementById("btnGuardarConfig");
  if (boton.disabled) return;
  boton.disabled = true;
  try {
    await solicitar(url, clave, { accion: "conectar" });
    localStorage.setItem("cfg_url", url);
    claveSesion = clave;
    campo.value = "";
    invalidarHistorial();
    document.getElementById("modalConfig").classList.add("hidden");
    mostrarToast("Conexión verificada");
  } catch (err) {
    mostrarToast(err.message);
  } finally {
    boton.disabled = false;
  }
}

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
