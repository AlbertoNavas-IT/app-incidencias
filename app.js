// Sub-opciones exactas para cada categoría
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
let fotoComprimidaBase64 = "";
let historialCache = [];

// Inicialización al cargar
document.addEventListener("DOMContentLoaded", () => {
  cargarSugerenciasLocales();
  verificarConfiguracionInicial();
  configurarEventos();
});

function verificarConfiguracionInicial() {
  const url = localStorage.getItem("cfg_url");
  const pin = localStorage.getItem("cfg_pin");
  if (!url || !pin) {
    abrirModalConfig();
  }
}

function configurarEventos() {
  // Navegación pestañas
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");

      if (btn.dataset.tab === "historial" && historialCache.length === 0) {
        cargarHistorial();
      }
    });
  });

  // Selección de categoría principal
  document.querySelectorAll(".cat-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      categoriaSeleccionada = btn.dataset.cat;
      detallesSeleccionados.clear();
      renderizarSubopciones(categoriaSeleccionada);
    });
  });

  // Procesar foto al hacerla/elegirla
  document.getElementById("fotoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    mostrarToast("Procesando foto...");
    try {
      const dataUrl = await comprimirImagen(file, 1280, 0.78);
      fotoComprimidaBase64 = dataUrl.split(",")[1];
      document.getElementById("fotoPreview").src = dataUrl;
      document.getElementById("previewContainer").classList.remove("hidden");
      document.getElementById("fotoLabelText").textContent = "Cambiar foto";
      mostrarToast("Foto lista ✅");
    } catch (err) {
      mostrarToast("Error al procesar la foto");
    }
  });

  // Quitar foto
  document.getElementById("btnQuitarFoto").addEventListener("click", () => {
    fotoComprimidaBase64 = "";
    document.getElementById("fotoInput").value = "";
    document.getElementById("previewContainer").classList.add("hidden");
    document.getElementById("fotoLabelText").textContent = "Hacer / Adjuntar Foto";
  });

  // Envío del formulario
  document.getElementById("formIncidencia").addEventListener("submit", enviarIncidencia);

  // Modal configuración
  document.getElementById("btnConfig").addEventListener("click", abrirModalConfig);
  document.getElementById("btnCerrarConfig").addEventListener("click", () => {
    document.getElementById("modalConfig").classList.add("hidden");
  });
  document.getElementById("btnGuardarConfig").addEventListener("click", guardarConfiguracion);

  // Historial
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

// Comprime la imagen en el navegador para que el envío tarde 2 segundos
function comprimirImagen(file, maxAncho, calidad) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function enviarIncidencia(e) {
  e.preventDefault();

  const url = localStorage.getItem("cfg_url");
  const pin = localStorage.getItem("cfg_pin");

  if (!url || !pin) {
    abrirModalConfig();
    mostrarToast("Configura primero tu URL y PIN");
    return;
  }

  const pedido = document.getElementById("pedido").value.trim();
  const proveedor = document.getElementById("proveedor").value.trim();
  const empresaEntrega = document.getElementById("empresaEntrega").value.trim();
  const observaciones = document.getElementById("observaciones").value.trim();

  if (!pedido) {
    mostrarToast("⚠️ Introduce el nº de pedido");
    return;
  }
  if (!categoriaSeleccionada) {
    mostrarToast("⚠️ Selecciona qué tipo de incidencia ocurre");
    return;
  }

  const btnEnviar = document.getElementById("btnEnviar");
  btnEnviar.disabled = true;
  btnEnviar.textContent = "⏳ Guardando y enviando correo...";

  const payload = {
    pin: pin,
    pedido: pedido,
    proveedor: proveedor,
    empresaEntrega: empresaEntrega,
    categoria: categoriaSeleccionada,
    detalle: Array.from(detallesSeleccionados).join(", "),
    observaciones: observaciones,
    fotoBase64: fotoComprimidaBase64
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });
    const res = await resp.json();

    if (res.ok) {
      guardarSugerenciaLocal("proveedores", proveedor);
      guardarSugerenciaLocal("transportes", empresaEntrega);
      cargarSugerenciasLocales();
      limpiarFormulario();
      historialCache = []; // Forzar recarga al mirar historial
      mostrarToast("✅ ¡Registrado y correo enviado!");
    } else {
      mostrarToast("❌ Error: " + (res.error || "No se pudo enviar"));
    }
  } catch (err) {
    mostrarToast("❌ Error de red al conectar con el servidor");
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = "🚀 Registrar y Enviar Correo";
  }
}

function limpiarFormulario() {
  document.getElementById("formIncidencia").reset();
  categoriaSeleccionada = "";
  detallesSeleccionados.clear();
  fotoComprimidaBase64 = "";
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("subopcionesContainer").classList.add("hidden");
  document.getElementById("previewContainer").classList.add("hidden");
  document.getElementById("fotoLabelText").textContent = "Hacer / Adjuntar Foto";
}

// Autocompletado de proveedores y transportes habituales en el móvil
function guardarSugerenciaLocal(clave, valor) {
  if (!valor) return;
  const lista = JSON.parse(localStorage.getItem(clave) || "[]");
  if (!lista.some(item => item.toLowerCase() === valor.toLowerCase())) {
    lista.unshift(valor);
    localStorage.setItem(clave, JSON.stringify(lista.slice(0, 40)));
  }
}

function cargarSugerenciasLocales() {
  const provs = JSON.parse(localStorage.getItem("proveedores") || "[]");
  const trans = JSON.parse(localStorage.getItem("transportes") || "[]");

  document.getElementById("listaProveedores").innerHTML = provs.map(p => `<option value="${p}">`).join("");
  document.getElementById("listaTransportes").innerHTML = trans.map(t => `<option value="${t}">`).join("");
}

// Historial
async function cargarHistorial() {
  const url = localStorage.getItem("cfg_url");
  const pin = localStorage.getItem("cfg_pin");
  const contenedor = document.getElementById("listaHistorial");

  if (!url || !pin) return;
  contenedor.innerHTML = `<p class="empty-msg">⏳ Cargando últimas incidencias...</p>`;

  try {
    const resp = await fetch(`${url}?pin=${encodeURIComponent(pin)}`);
    const res = await resp.json();
    if (res.ok) {
      historialCache = res.historial || [];
      renderizarHistorial(historialCache);
    } else {
      contenedor.innerHTML = `<p class="empty-msg">❌ ${res.error}</p>`;
    }
  } catch (err) {
    contenedor.innerHTML = `<p class="empty-msg">❌ Error al cargar el historial.</p>`;
  }
}

function renderizarHistorial(lista) {
  const contenedor = document.getElementById("listaHistorial");
  if (lista.length === 0) {
    contenedor.innerHTML = `<p class="empty-msg">No hay incidencias registradas todavía.</p>`;
    return;
  }

  contenedor.innerHTML = lista.map(item => `
    <div class="historial-item">
      <h3>Pedido: ${item.pedido} — ${item.proveedor}</h3>
      <div class="historial-meta">📅 ${item.fecha} ${item.hora} · 🚚 ${item.empresaEntrega}</div>
      <span class="historial-tag">${item.categoria} (${item.detalle})</span>
      ${item.observaciones && item.observaciones !== "Ninguna" ? `<p class="historial-meta" style="margin-top:6px;">📝 ${item.observaciones}</p>` : ""}
      ${item.fotoUrl && item.fotoUrl !== "Sin foto" ? `<br><a href="${item.fotoUrl}" target="_blank" class="historial-link">🖼️ Ver foto en Drive</a>` : ""}
    </div>
  `).join("");
}

function filtrarHistorial(e) {
  const q = e.target.value.toLowerCase();
  const filtrados = historialCache.filter(item =>
    String(item.pedido).toLowerCase().includes(q) ||
    String(item.proveedor).toLowerCase().includes(q) ||
    String(item.empresaEntrega).toLowerCase().includes(q)
  );
  renderizarHistorial(filtrados);
}

// Ajustes
function abrirModalConfig() {
  document.getElementById("cfgUrl").value = localStorage.getItem("cfg_url") || "";
  document.getElementById("cfgPin").value = localStorage.getItem("cfg_pin") || "";
  document.getElementById("modalConfig").classList.remove("hidden");
}

function guardarConfiguracion() {
  const url = document.getElementById("cfgUrl").value.trim();
  const pin = document.getElementById("cfgPin").value.trim();
  if (!url || !pin) {
    mostrarToast("Rellena ambos campos");
    return;
  }
  localStorage.setItem("cfg_url", url);
  localStorage.setItem("cfg_pin", pin);
  document.getElementById("modalConfig").classList.add("hidden");
  mostrarToast("Configuración guardada en este móvil ✅");
}

function mostrarToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3200);
}
