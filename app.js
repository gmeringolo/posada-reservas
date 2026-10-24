/* Posada reservas — lógica de la app
   Datos en Supabase (tabla "reservas"). Si config.js no está completo,
   funciona en "modo prueba" guardando solo en la memoria del navegador. */

(() => {
  const CFG = window.CONFIG || {};
  const CASAS = CFG.CASAS || [];
  const casaById = Object.fromEntries(CASAS.map(c => [c.id, c]));
  const WD = ["D", "L", "M", "M", "J", "V", "S"];
  const CELL = 44;
  const $ = s => document.querySelector(s);

  let sb = null;            // cliente Supabase
  let reservas = [];
  let canal = null;
  const now = new Date();
  let view = { y: now.getFullYear(), m: now.getMonth() };

  /* ---------- fechas y formato ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const todayISO = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const dn = s => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
  const fromDn = n => { const d = new Date(n * 864e5); return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
  const noches = r => dn(r.fin) - dn(r.inicio);
  const utc = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const fmtCorto = s => utc(s).toLocaleDateString("es-UY", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
  const fmtLargo = s => utc(s).toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const money = (v, mon) => (mon === "UYU" ? "$U " : "US$ ") + new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 }).format(Number(v) || 0);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- conversión fila de la base <-> objeto de la app ---------- */
  const fromRow = r => ({
    id: r.id, casa: r.casa, inicio: r.inicio, fin: r.fin,
    nombre: r.nombre, apellido: r.apellido, telefono: r.telefono,
    moneda: r.moneda, precioNoche: Number(r.precio_noche), total: Number(r.total)
  });
  const toRow = d => ({
    casa: d.casa, inicio: d.inicio, fin: d.fin,
    nombre: d.nombre, apellido: d.apellido, telefono: d.telefono,
    moneda: d.moneda, precio_noche: d.precioNoche, total: d.total
  });

  /* ---------- render del calendario ---------- */
  function render() {
    const { y, m } = view;
    const N = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mStart = dn(iso(y, m, 1)), mEnd = mStart + N - 1;
    const tl = $("#tl");
    tl.style.setProperty("--days", N);
    const monthName = utc(iso(y, m, 1)).toLocaleDateString("es-UY", { month: "long", timeZone: "UTC" });
    $("#monthTitle").textContent = `${monthName} ${y}`;

    let html = `<div class="tl-row head"><div class="tl-label">Casa</div><div class="tl-cells">`;
    for (let d = 1; d <= N; d++) {
      const s = iso(y, m, d), wd = utc(s).getUTCDay();
      html += `<div class="cell${wd === 0 || wd === 6 ? " wk" : ""}${s === todayISO ? " today" : ""}"><span>${WD[wd]}</span><b class="num">${d}</b></div>`;
    }
    html += `</div></div>`;

    const todayIdx = dn(todayISO) - mStart;
    for (const c of CASAS) {
      html += `<div class="tl-row"><div class="tl-label"><span class="swatch c-${c.id}"></span>${esc(c.nombre)}</div><div class="tl-cells">`;
      for (let d = 1; d <= N; d++) {
        const wd = utc(iso(y, m, d)).getUTCDay();
        html += `<button class="cell${wd === 0 || wd === 6 ? " wk" : ""}" data-casa="${c.id}" data-dia="${iso(y, m, d)}" aria-label="Nueva reserva en ${esc(c.nombre)}, día ${d}"></button>`;
      }
      if (todayIdx >= 0 && todayIdx < N) html += `<span class="today-line" style="left:${(todayIdx + 0.5) * CELL - 1}px"></span>`;
      for (const r of reservas.filter(r => r.casa === c.id)) {
        const a = dn(r.inicio), b = dn(r.fin);
        if (a > mEnd || b < mStart) continue;
        const left = a >= mStart ? (a - mStart + 0.5) * CELL + 2 : 0;
        const right = b <= mEnd ? (b - mStart + 0.5) * CELL - 2 : N * CELL;
        if (right - left < 6) continue;
        const cls = `bar c-${c.id}${a < mStart ? " cut-l" : ""}${b > mEnd ? " cut-r" : ""}`;
        html += `<button class="${cls}" data-id="${esc(r.id)}" style="left:${left}px;width:${right - left}px" title="${esc(r.nombre + " " + r.apellido)}">${esc(r.nombre)} ${esc((r.apellido || "").charAt(0))}.</button>`;
      }
      html += `</div></div>`;
    }
    tl.innerHTML = html;

    // Resumen: noches ocupadas por casa en el mes
    $("#summary").innerHTML = CASAS.map(c => {
      let n = 0;
      for (const r of reservas.filter(r => r.casa === c.id)) {
        const a = Math.max(dn(r.inicio), mStart), b = Math.min(dn(r.fin), mEnd + 1);
        if (b > a) n += b - a;
      }
      return `<div class="sum"><div class="n"><span class="swatch c-${c.id}"></span>${esc(c.nombre)}</div><div class="v num">${n}</div><div class="s">noches · ${Math.round(n / N * 100)}%</div></div>`;
    }).join("");

    // Lista del mes
    const delMes = reservas.filter(r => dn(r.inicio) <= mEnd && dn(r.fin) > mStart)
      .sort((p, q) => p.inicio.localeCompare(q.inicio));
    $("#listTitle").textContent = `Reservas de ${utc(iso(y, m, 1)).toLocaleDateString("es-UY", { month: "long", timeZone: "UTC" })}`;
    $("#list").innerHTML = delMes.length ? delMes.map(r => `
      <button class="item" data-id="${esc(r.id)}">
        <span class="stripe c-${r.casa}"></span>
        <span style="min-width:0"><div class="who">${esc(r.nombre)} ${esc(r.apellido)}</div>
          <div class="when num">${esc(casaById[r.casa]?.nombre || "")} · ${fmtCorto(r.inicio)} → ${fmtCorto(r.fin)}</div></span>
        <span class="amt num">${money(r.total, r.moneda)}<small>${noches(r)} ${noches(r) === 1 ? "noche" : "noches"}</small></span>
      </button>`).join("")
      : `<div class="empty">No hay reservas este mes. Tocá <b>Nueva reserva</b> o un día libre del calendario para cargar la primera.</div>`;
  }

  function scrollToToday() {
    const sc = $("#scroller");
    if (view.y !== now.getFullYear() || view.m !== now.getMonth()) { sc.scrollLeft = 0; return; }
    sc.scrollLeft = Math.max(0, (now.getDate() - 3) * CELL);
  }

  /* ---------- hoja inferior ---------- */
  const closeBtn = `<button type="button" class="close" data-close aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  function openSheet(html) {
    $("#sheet").innerHTML = `<div class="grab"></div>` + html;
    $("#sheet").hidden = false; $("#overlay").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheet() {
    $("#sheet").hidden = true; $("#overlay").hidden = true; $("#sheet").innerHTML = "";
    document.body.style.overflow = "";
  }

  function openForm(pre = {}) {
    const r = Object.assign({ casa: CASAS[0]?.id, inicio: "", fin: "", nombre: "", apellido: "", telefono: "", moneda: "USD", precioNoche: "", total: "" }, pre);
    const editing = !!pre.id;
    openSheet(`
      <h3 id="sheetTitle">${editing ? "Editar reserva" : "Nueva reserva"} ${closeBtn}</h3>
      <form id="form" novalidate>
        <div class="fld"><span class="lbl">Casa</span>
          <div class="casas">${CASAS.map(c => `<label class="casa-opt"><input type="radio" name="casa" id="casa-${c.id}" value="${c.id}" ${r.casa === c.id ? "checked" : ""}><span><i class="c-${c.id}"></i>${esc(c.nombre)}</span></label>`).join("")}</div>
        </div>
        <div class="two">
          <div class="fld"><label for="inicio">Entrada</label><input type="date" id="inicio" value="${esc(r.inicio)}" required></div>
          <div class="fld"><label for="fin">Salida</label><input type="date" id="fin" value="${esc(r.fin)}" required></div>
        </div>
        <div class="nights num" id="nightsInfo"></div>
        <div class="two">
          <div class="fld"><label for="nombre">Nombre</label><input id="nombre" autocomplete="off" value="${esc(r.nombre)}" required></div>
          <div class="fld"><label for="apellido">Apellido</label><input id="apellido" autocomplete="off" value="${esc(r.apellido)}" required></div>
        </div>
        <div class="fld"><label for="telefono">Teléfono</label><input id="telefono" type="tel" inputmode="tel" placeholder="099 123 456" value="${esc(r.telefono)}" required></div>
        <div class="three">
          <div class="fld"><label for="moneda">Moneda</label><select id="moneda"><option value="USD" ${r.moneda === "USD" ? "selected" : ""}>US$</option><option value="UYU" ${r.moneda === "UYU" ? "selected" : ""}>$U</option></select></div>
          <div class="fld"><label for="precio">Por noche</label><input id="precio" type="number" inputmode="decimal" min="0" step="any" class="num" value="${esc(r.precioNoche)}" required></div>
          <div class="fld"><label for="total">Total</label><input id="total" type="number" inputmode="decimal" min="0" step="any" class="num" value="${esc(r.total)}" required></div>
        </div>
        <div class="err" id="formErr" hidden></div>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary" id="saveBtn">${editing ? "Guardar cambios" : "Guardar reserva"}</button>
        </div>
      </form>`);

    const f = id => document.getElementById(id);
    let totalManual = editing && Number(r.total) !== noches(r) * Number(r.precioNoche);
    const recalc = () => {
      const a = f("inicio").value, b = f("fin").value;
      const n = a && b ? dn(b) - dn(a) : 0;
      f("nightsInfo").textContent = n > 0 ? `${n} ${n === 1 ? "noche" : "noches"}` + (Number(f("precio").value) ? ` × ${money(f("precio").value, f("moneda").value)}` : "") : "";
      if (!totalManual && n > 0 && f("precio").value !== "") f("total").value = Math.round(n * Number(f("precio").value) * 100) / 100;
    };
    f("inicio").addEventListener("change", () => {
      if (f("inicio").value && (!f("fin").value || f("fin").value <= f("inicio").value)) f("fin").value = fromDn(dn(f("inicio").value) + 1);
      recalc();
    });
    ["fin", "precio", "moneda"].forEach(id => f(id).addEventListener("input", recalc));
    f("total").addEventListener("input", () => { totalManual = f("total").value !== ""; });
    recalc();

    f("form").addEventListener("submit", async e => {
      e.preventDefault();
      const data = {
        casa: document.querySelector('input[name="casa"]:checked')?.value,
        inicio: f("inicio").value, fin: f("fin").value,
        nombre: f("nombre").value.trim(), apellido: f("apellido").value.trim(),
        telefono: f("telefono").value.trim(), moneda: f("moneda").value,
        precioNoche: Number(f("precio").value), total: Number(f("total").value)
      };
      const err = validar(data, pre.id);
      if (err) { f("formErr").innerHTML = err; f("formErr").hidden = false; return; }
      f("saveBtn").disabled = true; f("saveBtn").textContent = "Guardando…";
      try {
        await guardar(data, pre.id);
        closeSheet();
        const ini = dn(data.inicio), mS = dn(iso(view.y, view.m, 1)), mE = dn(iso(view.y, view.m + 1, 1)) - 1;
        if (ini < mS || ini > mE) { const [yy, mm] = data.inicio.split("-").map(Number); view = { y: yy, m: mm - 1 }; render(); scrollToToday(); }
        toast(pre.id ? "Cambios guardados" : "Reserva guardada");
      } catch (ex) {
        f("formErr").textContent = mensajeError(ex); f("formErr").hidden = false;
        f("saveBtn").disabled = false; f("saveBtn").textContent = pre.id ? "Guardar cambios" : "Guardar reserva";
      }
    });
  }

  function validar(d, id) {
    if (!d.casa) return "Elegí una casa.";
    if (!d.inicio || !d.fin) return "Completá la fecha de entrada y la de salida.";
    if (dn(d.fin) <= dn(d.inicio)) return "La salida tiene que ser al menos un día después de la entrada.";
    if (!d.nombre || !d.apellido) return "Completá nombre y apellido del huésped.";
    if (!d.telefono) return "Completá el teléfono del huésped.";
    if (!(d.precioNoche > 0)) return "Ingresá cuánto paga por noche.";
    if (!(d.total > 0)) return "Ingresá el total de la estadía.";
    const choque = reservas.find(o => o.id !== id && o.casa === d.casa && dn(d.inicio) < dn(o.fin) && dn(d.fin) > dn(o.inicio));
    if (choque) return `La casa ${esc(casaById[d.casa].nombre)} ya está reservada por <b>${esc(choque.nombre)} ${esc(choque.apellido)}</b> del ${fmtCorto(choque.inicio)} al ${fmtCorto(choque.fin)}. Cambiá las fechas o la casa.`;
    return null;
  }

  function openDetail(id) {
    const r = reservas.find(x => x.id === id); if (!r) return;
    const tel = (r.telefono || "").replace(/\D/g, "");
    const wa = tel ? "https://wa.me/" + (tel.startsWith("598") ? tel : "598" + tel.replace(/^0/, "")) : "";
    openSheet(`
      <h3 id="sheetTitle">${esc(r.nombre)} ${esc(r.apellido)} ${closeBtn}</h3>
      <div class="detail">
        <div class="drow"><span>Casa</span><span class="tag"><span class="swatch c-${r.casa}"></span>${esc(casaById[r.casa]?.nombre || "")}</span></div>
        <div class="drow"><span>Entrada</span><span class="num">${fmtLargo(r.inicio)}</span></div>
        <div class="drow"><span>Salida</span><span class="num">${fmtLargo(r.fin)}</span></div>
        <div class="drow"><span>Noches</span><span class="num">${noches(r)}</span></div>
        <div class="drow"><span>Por noche</span><span class="num">${money(r.precioNoche, r.moneda)}</span></div>
        <div class="drow"><span>Total</span><span class="num">${money(r.total, r.moneda)}</span></div>
        <div class="drow"><span>Teléfono</span><span class="num">${esc(r.telefono)}</span></div>
      </div>
      <div class="links">
        ${tel ? `<a href="tel:${esc(tel)}">Llamar</a>` : ""}
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      </div>
      <div class="err" id="detErr" hidden></div>
      <div class="actions">
        <button type="button" class="btn danger" id="delBtn">Eliminar</button>
        <button type="button" class="btn primary" id="editBtn">Editar</button>
      </div>`);
    $("#editBtn").addEventListener("click", () => openForm(r));
    const del = $("#delBtn");
    del.addEventListener("click", async () => {
      if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Tocá de nuevo para eliminar"; return; }
      del.disabled = true; del.textContent = "Eliminando…";
      try { await eliminar(r.id); closeSheet(); toast("Reserva eliminada"); }
      catch (ex) { $("#detErr").textContent = mensajeError(ex); $("#detErr").hidden = false; del.disabled = false; del.textContent = "Eliminar"; del.classList.remove("armed"); }
    });
  }

  /* ---------- datos ---------- */
  async function cargar() {
    if (!sb) return;
    const { data, error } = await sb.from("reservas").select("*").order("inicio");
    if (error) { setStatus("No se pudieron cargar las reservas: " + error.message, true); return; }
    reservas = data.map(fromRow);
    render();
  }

  async function guardar(data, id) {
    if (!sb) { // modo prueba
      if (id) reservas = reservas.map(r => r.id === id ? { id, ...data } : r);
      else reservas.push({ id: "local-" + Date.now(), ...data });
      render(); return;
    }
    const q = id
      ? sb.from("reservas").update({ ...toRow(data), actualizada: new Date().toISOString() }).eq("id", id)
      : sb.from("reservas").insert(toRow(data));
    const { error } = await q;
    if (error) throw error;
    await cargar();
  }

  async function eliminar(id) {
    if (!sb) { reservas = reservas.filter(r => r.id !== id); render(); return; }
    const { error } = await sb.from("reservas").delete().eq("id", id);
    if (error) throw error;
    await cargar();
  }

  function mensajeError(ex) {
    const code = ex && ex.code;
    if (code === "23P01") return "Otra persona acaba de cargar una reserva en esa casa para esas fechas. Revisá el calendario y elegí otras fechas.";
    if (code === "42501") return "Supabase rechazó el guardado por permisos de la base de datos. Hay que actualizar los permisos ejecutando de nuevo el archivo supabase.sql; no significa que hayas ingresado mal.";
    if (code === "PGRST301") return "La sesión de acceso venció o no es válida. Tocá Salir e ingresá de nuevo.";
    if (code === "23514") return "Algún dato no es válido (fechas, casa o moneda). Revisá el formulario.";
    return "No se pudo guardar. Revisá tu conexión e intentá de nuevo." + (ex?.message ? ` (${ex.message})` : "");
  }

  function setStatus(text, warn) {
    $("#statusText").textContent = text;
    $("#status").classList.toggle("warn", !!warn);
  }
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------- tiempo real: si la otra persona carga algo, se actualiza solo ---------- */
  function escucharCambios() {
    if (!sb || canal) return;
    canal = sb.channel("reservas-cambios")
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => cargar())
      .subscribe(status => {
        if (status === "SUBSCRIBED") setStatus("Sincronizado · los cambios se ven en ambos celulares");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus("Guardado en línea · actualizá la página para ver cambios de la otra persona", true);
      });
    // Al volver a la app (por ej. desde WhatsApp), recargar por si hubo cambios
    document.addEventListener("visibilitychange", () => { if (!document.hidden) cargar(); });
  }

  /* ---------- eventos ---------- */
  function wire() {
    $("#overlay").addEventListener("click", closeSheet);
    $("#sheet").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeSheet(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
    $("#prev").addEventListener("click", () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } render(); scrollToToday(); });
    $("#next").addEventListener("click", () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } render(); scrollToToday(); });
    $("#todayBtn").addEventListener("click", () => { view = { y: now.getFullYear(), m: now.getMonth() }; render(); scrollToToday(); });
    $("#fab").addEventListener("click", () => openForm({ inicio: todayISO, fin: fromDn(dn(todayISO) + 1) }));
    $("#tl").addEventListener("click", e => {
      const bar = e.target.closest(".bar"); if (bar) return openDetail(bar.dataset.id);
      const cell = e.target.closest("button.cell");
      if (cell) openForm({ casa: cell.dataset.casa, inicio: cell.dataset.dia, fin: fromDn(dn(cell.dataset.dia) + 1) });
    });
    $("#list").addEventListener("click", e => { const it = e.target.closest(".item"); if (it) openDetail(it.dataset.id); });
    $("#logout").addEventListener("click", async () => { await sb.auth.signOut(); location.reload(); });
    $("#togglePassword").addEventListener("click", e => {
      const button = e.currentTarget;
      const visible = button.getAttribute("aria-pressed") !== "true";
      $("#loginPass").type = visible ? "text" : "password";
      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute("aria-label", visible ? "Ocultar contraseña" : "Mostrar contraseña");
      button.title = visible ? "Ocultar contraseña" : "Mostrar contraseña";
    });
    $("#loginForm").addEventListener("submit", async e => {
      e.preventDefault();
      const btn = $("#loginBtn"), err = $("#loginErr");
      err.hidden = true; btn.disabled = true; btn.textContent = "Ingresando…";
      const usuario = $("#loginUser").value.trim().toLowerCase();
      const pass = $("#loginPass").value;
      if (!usuario || !pass) {
        err.textContent = "Completá el usuario y la contraseña.";
        err.hidden = false; btn.disabled = false; btn.textContent = "Ingresar"; return;
      }
      const email = usuario.includes("@") ? usuario : `${usuario}@${CFG.LOGIN_DOMINIO || "example.com"}`;
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        err.textContent = "El usuario o la contraseña no coinciden. Revisalos e intentá de nuevo.";
        err.hidden = false; btn.disabled = false; btn.textContent = "Ingresar"; return;
      }
      location.reload();
    });
  }

  function mostrarApp() {
    $("#login").hidden = true; $("#app").hidden = false;
    render(); scrollToToday();
  }

  /* ---------- inicio ---------- */
  async function init() {
    wire();
    const configurado = window.supabase && CFG.SUPABASE_URL && !CFG.SUPABASE_URL.startsWith("PEGAR") && CFG.SUPABASE_KEY && !CFG.SUPABASE_KEY.startsWith("PEGAR");
    if (!configurado) {
      mostrarApp();
      setStatus("Modo prueba: falta completar config.js. Las reservas se pierden al recargar.", true);
      return;
    }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

    if (CFG.REQUIERE_LOGIN) {
      const { data } = await sb.auth.getSession();
      if (!data.session) { $("#login").hidden = false; $("#app").hidden = true; return; }
      $("#foot").hidden = false;
      const u = (data.session.user.email || "").split("@")[0];
      $("#whoami").textContent = "Conectada como " + (u.charAt(0).toUpperCase() + u.slice(1));
    }
    mostrarApp();
    await cargar();
    escucharCambios();
  }

  init();
})();
