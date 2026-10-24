/* Posada reservas — lógica de la app
   Datos en Supabase (tabla "reservas"). Si config.js no está completo,
   funciona en "modo prueba" guardando solo en la memoria del navegador. */

(() => {
  const CFG = window.CONFIG || {};
  const CASAS = CFG.CASAS || [];
  const casaById = Object.fromEntries(CASAS.map(c => [c.id, c]));
  const CODIGOS_PAIS = [
    { codigo: "+598", pais: "Uruguay" },
    { codigo: "+54", pais: "Argentina" },
    { codigo: "+55", pais: "Brasil" },
    { codigo: "+56", pais: "Chile" },
    { codigo: "+595", pais: "Paraguay" },
    { codigo: "+591", pais: "Bolivia" },
    { codigo: "+51", pais: "Perú" },
    { codigo: "+57", pais: "Colombia" },
    { codigo: "+52", pais: "México" },
    { codigo: "+34", pais: "España" },
    { codigo: "+1", pais: "Estados Unidos / Canadá" }
  ];
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
  const importe = (v, mon) => v == null ? "Sin registrar" : money(v, mon);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const separarTelefono = telefono => {
    const digitos = String(telefono || "").replace(/\D/g, "");
    const pais = [...CODIGOS_PAIS]
      .sort((a, b) => b.codigo.length - a.codigo.length)
      .find(opcion => digitos.startsWith(opcion.codigo.slice(1)));
    return pais
      ? { codigo: pais.codigo, numero: digitos.slice(pais.codigo.length - 1) }
      : { codigo: "+598", numero: String(telefono || "") };
  };
  const telefonoInternacional = (codigo, numero) => {
    const prefijo = String(codigo).replace(/\D/g, "");
    let digitos = String(numero || "").replace(/\D/g, "");
    if (digitos.startsWith(prefijo)) digitos = digitos.slice(prefijo.length);
    digitos = digitos.replace(/^0+/, "");
    return `+${prefijo} ${digitos}`;
  };
  const normalizarTelefonoGuardado = telefono => {
    const partes = separarTelefono(telefono);
    return telefonoInternacional(partes.codigo, partes.numero);
  };
  const estadoPago = r => {
    const total = r.total == null ? null : Number(r.total);
    const senia = r.senia == null ? null : Number(r.senia);
    if (total > 0 && senia !== null && senia >= total) return { clase: "pay-paid", etiqueta: "Pago total" };
    if (senia > 0) return { clase: "pay-deposit", etiqueta: "Seña paga" };
    return { clase: "pay-unpaid", etiqueta: "Sin pagos" };
  };
  const saldoPendiente = r => r.total == null ? null : Math.max(0, Number(r.total) - (Number(r.senia) || 0));
  const calcularResumenPeriodo = (inicio, fin, lista) => {
    const desde = dn(inicio), hasta = dn(fin) + 1;
    const resumen = {
      UYU: 0,
      USD: 0,
      nochesPorCasa: Object.fromEntries(CASAS.map(c => [c.id, 0]))
    };
    for (const reserva of lista) {
      const nochesTotales = noches(reserva);
      if (nochesTotales <= 0) continue;
      const nochesEnPeriodo = Math.max(0, Math.min(dn(reserva.fin), hasta) - Math.max(dn(reserva.inicio), desde));
      if (!nochesEnPeriodo) continue;
      if (Object.prototype.hasOwnProperty.call(resumen.nochesPorCasa, reserva.casa)) resumen.nochesPorCasa[reserva.casa] += nochesEnPeriodo;
      if (reserva.total != null && Object.prototype.hasOwnProperty.call(resumen, reserva.moneda)) {
        resumen[reserva.moneda] += Number(reserva.total) * nochesEnPeriodo / nochesTotales;
      }
    }
    resumen.UYU = Math.round(resumen.UYU * 100) / 100;
    resumen.USD = Math.round(resumen.USD * 100) / 100;
    return resumen;
  };

  /* ---------- conversión fila de la base <-> objeto de la app ---------- */
  const fromRow = r => ({
    id: r.id, casa: r.casa, inicio: r.inicio, fin: r.fin,
    nombre: r.nombre, apellido: r.apellido || "", telefono: r.telefono,
    moneda: r.moneda,
    precioNoche: r.precio_noche == null ? null : Number(r.precio_noche),
    total: r.total == null ? null : Number(r.total),
    senia: r.senia == null ? null : Number(r.senia),
    adultos: Number(r.adultos ?? 1),
    ninos: Number(r.ninos ?? 0),
    comentarios: r.comentarios || ""
  });
  const toRow = d => ({
    casa: d.casa, inicio: d.inicio, fin: d.fin,
    nombre: d.nombre, apellido: d.apellido || null, telefono: d.telefono,
    moneda: d.moneda, precio_noche: d.precioNoche, total: d.total, senia: d.senia,
    adultos: d.adultos, ninos: d.ninos, comentarios: d.comentarios || null
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
        const estado = estadoPago(r);
        const cls = `bar ${estado.clase}${a < mStart ? " cut-l" : ""}${b > mEnd ? " cut-r" : ""}`;
        const huesped = [r.nombre, r.apellido].filter(Boolean).join(" ");
        const saldo = saldoPendiente(r);
        html += `<button class="${cls}" data-id="${esc(r.id)}" style="left:${left}px;width:${right - left}px" title="${esc(`${huesped} · ${estado.etiqueta} · ${saldo == null ? "saldo sin calcular" : `falta ${money(saldo, r.moneda)}`}`)}">${esc(r.nombre)}${r.apellido ? ` ${esc(r.apellido.charAt(0))}.` : ""}</button>`;
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
        <span class="stripe ${estadoPago(r).clase}"></span>
        <span style="min-width:0"><div class="who">${esc([r.nombre, r.apellido].filter(Boolean).join(" "))}</div>
          <div class="when num">${esc(casaById[r.casa]?.nombre || "")} · ${fmtCorto(r.inicio)} → ${fmtCorto(r.fin)} · ${r.adultos} ${r.adultos === 1 ? "adulto" : "adultos"} · ${r.ninos} ${r.ninos === 1 ? "niño" : "niños"}</div>
          <div class="item-payment ${estadoPago(r).clase}">${estadoPago(r).etiqueta} · ${saldoPendiente(r) == null ? "saldo sin calcular" : `falta ${money(saldoPendiente(r), r.moneda)}`}</div></span>
        <span class="amt num">${importe(r.total, r.moneda)}<small>${noches(r)} ${noches(r) === 1 ? "noche" : "noches"}</small></span>
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
    const r = Object.assign({ casa: CASAS[0]?.id, inicio: "", fin: "", nombre: "", apellido: "", telefono: "", moneda: "UYU", precioNoche: "", total: "", senia: null, adultos: 1, ninos: 0 }, pre);
    const editing = !!pre.id;
    const telefonoParts = separarTelefono(r.telefono);
    openSheet(`
      <h3 id="sheetTitle">${editing ? "Editar reserva" : "Nueva reserva"} ${closeBtn}</h3>
      <form id="form" novalidate>
      <div class="fld"><span class="lbl">Casa *</span>
        <div class="casas">${CASAS.map(c => `<label class="casa-opt"><input type="radio" name="casa" id="casa-${c.id}" value="${c.id}" ${r.casa === c.id ? "checked" : ""} required><span><i class="c-${c.id}"></i>${esc(c.nombre)}</span></label>`).join("")}</div>
      </div>
        <div class="two">
          <div class="fld"><label for="inicio">Entrada *</label><input type="date" id="inicio" value="${esc(r.inicio)}" required></div>
          <div class="fld"><label for="fin">Salida *</label><input type="date" id="fin" value="${esc(r.fin)}" required></div>
        </div>
        <div class="nights num" id="nightsInfo"></div>
        <div class="two">
          <div class="fld"><label for="nombre">Nombre *</label><input id="nombre" autocomplete="off" value="${esc(r.nombre)}" required></div>
          <div class="fld"><label for="apellido">Apellido</label><input id="apellido" autocomplete="off" value="${esc(r.apellido)}"></div>
        </div>
        <div class="two">
          <div class="fld"><label for="adultos">Adultos</label><input id="adultos" type="number" inputmode="numeric" min="0" step="1" value="${esc(r.adultos)}" required></div>
          <div class="fld"><label for="ninos">Niños</label><input id="ninos" type="number" inputmode="numeric" min="0" step="1" value="${esc(r.ninos)}" required></div>
        </div>
        <div class="phone-fields">
          <div class="fld"><label for="codigoPais">País</label><select id="codigoPais">${CODIGOS_PAIS.map(p => `<option value="${p.codigo}" ${telefonoParts.codigo === p.codigo ? "selected" : ""}>${p.pais} ${p.codigo}</option>`).join("")}</select></div>
          <div class="fld"><label for="telefono">Número *</label><input id="telefono" type="tel" inputmode="tel" placeholder="99 123 456" value="${esc(telefonoParts.numero)}" required></div>
        </div>
        <div class="three">
          <div class="fld"><label for="moneda">Moneda</label><select id="moneda"><option value="USD" ${r.moneda === "USD" ? "selected" : ""}>US$</option><option value="UYU" ${r.moneda === "UYU" ? "selected" : ""}>$U</option></select></div>
          <div class="fld"><label for="precio">Por noche</label><input id="precio" type="number" inputmode="decimal" min="0" step="any" class="num" value="${r.precioNoche == null ? "" : esc(r.precioNoche)}"></div>
          <div class="fld"><label for="total">Total</label><input id="total" type="number" inputmode="decimal" min="0" step="any" class="num" value="${r.total == null ? "" : esc(r.total)}"></div>
        </div>
        <div class="two">
          <div class="fld"><label for="senia">Seña pagada</label><input id="senia" type="number" inputmode="decimal" min="0" step="0.01" class="num" value="${r.senia == null ? "" : esc(r.senia)}"></div>
          <div class="fld"><span class="lbl">Estado y saldo</span><div class="payment-summary" id="paymentSummary"><strong id="paymentStatus"></strong><small id="paymentBalance"></small></div></div>
        </div>
        <div class="fld"><label for="comentarios">Comentarios</label><textarea id="comentarios" rows="3">${esc(r.comentarios)}</textarea></div>
        <div class="err" id="formErr" hidden></div>
        <div class="actions">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary" id="saveBtn">${editing ? "Guardar cambios" : "Guardar reserva"}</button>
        </div>
      </form>`);

    const f = id => document.getElementById(id);
    let importeFuente = editing && r.total != null && (r.precioNoche == null || Number(r.total) !== noches(r) * Number(r.precioNoche))
      ? "total"
      : "precio";
    const actualizarPago = () => {
      const total = f("total").value === "" ? null : Number(f("total").value);
      const senia = f("senia").value === "" ? null : Number(f("senia").value);
      const estado = estadoPago({ total, senia });
      const excedeTotal = senia !== null && total !== null && senia > total;
      f("paymentSummary").className = `payment-summary ${excedeTotal ? "pay-unpaid" : estado.clase}`;
      f("paymentStatus").textContent = excedeTotal ? "La seña supera el total" : estado.etiqueta;
      f("paymentBalance").textContent = total !== null ? `Falta pagar: ${money(Math.max(0, total - (senia || 0)), f("moneda").value)}` : "Completá el total para calcular el saldo";
    };
    const recalc = () => {
      const a = f("inicio").value, b = f("fin").value;
      const n = a && b ? dn(b) - dn(a) : 0;
      if (n > 0) {
        if (importeFuente === "total" && f("total").value !== "") {
          f("precio").value = (Number(f("total").value) / n).toFixed(2);
        } else if (importeFuente === "precio" && f("precio").value !== "") {
          f("total").value = (Math.round(n * Number(f("precio").value) * 100) / 100).toFixed(2);
        }
      }
      f("nightsInfo").textContent = n > 0 ? `${n} ${n === 1 ? "noche" : "noches"}` + (Number(f("precio").value) ? ` × ${money(f("precio").value, f("moneda").value)}` : "") : "";
      actualizarPago();
    };
    f("inicio").addEventListener("change", () => {
      if (f("inicio").value && (!f("fin").value || f("fin").value <= f("inicio").value)) f("fin").value = fromDn(dn(f("inicio").value) + 1);
      recalc();
    });
    ["fin", "moneda"].forEach(id => f(id).addEventListener("input", recalc));
    f("precio").addEventListener("input", () => { importeFuente = "precio"; recalc(); });
    f("total").addEventListener("input", () => { importeFuente = "total"; recalc(); });
    f("senia").addEventListener("input", actualizarPago);
    recalc();

    f("form").addEventListener("submit", async e => {
      e.preventDefault();
      const data = {
        casa: document.querySelector('input[name="casa"]:checked')?.value,
        inicio: f("inicio").value, fin: f("fin").value,
        nombre: f("nombre").value.trim(), apellido: f("apellido").value.trim(),
        telefono: telefonoInternacional(f("codigoPais").value, f("telefono").value), moneda: f("moneda").value,
        precioNoche: f("precio").value === "" ? null : Number(f("precio").value),
        total: f("total").value === "" ? null : Number(f("total").value),
        senia: f("senia").value === "" ? null : Number(f("senia").value),
        adultos: f("adultos").value === "" ? null : Number(f("adultos").value),
        ninos: f("ninos").value === "" ? null : Number(f("ninos").value),
        comentarios: f("comentarios").value.trim()
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
    if (!d.nombre) return "Completá el nombre del huésped.";
    if (!d.telefono) return "Completá el teléfono del huésped.";
    if (d.precioNoche !== null && (!Number.isFinite(d.precioNoche) || d.precioNoche <= 0)) return "El precio por noche debe ser mayor que cero.";
    if (d.total !== null && (!Number.isFinite(d.total) || d.total <= 0)) return "El total debe ser mayor que cero.";
    if (d.senia !== null && (!Number.isFinite(d.senia) || d.senia < 0)) return "La seña debe ser un importe válido igual o mayor a cero.";
    if (d.senia !== null && d.total !== null && d.senia > d.total) return "La seña no puede ser mayor que el total de la estadía.";
    if (!Number.isInteger(d.adultos) || d.adultos < 0) return "Ingresá una cantidad válida de adultos.";
    if (!Number.isInteger(d.ninos) || d.ninos < 0) return "Ingresá una cantidad válida de niños.";
    const inicio = dn(d.inicio), fin = dn(d.fin);
    const choque = reservas.find(o => o.id !== id && o.casa === d.casa && inicio < dn(o.fin) && fin > dn(o.inicio));
    if (choque) {
      const inicioSolapado = Math.max(inicio, dn(choque.inicio));
      const finSolapado = Math.min(fin, dn(choque.fin));
      const nochesSolapadas = finSolapado - inicioSolapado;
      const desde = fmtCorto(fromDn(inicioSolapado));
      const hasta = fmtCorto(fromDn(finSolapado - 1));
      const huesped = [choque.nombre, choque.apellido].filter(Boolean).join(" ");
      return `No se puede cambiar a ${esc(casaById[d.casa].nombre)}: ya está ocupada por <b>${esc(huesped)}</b> durante ${nochesSolapadas === 1 ? "la noche" : "las noches"} del ${desde}${desde === hasta ? "" : ` al ${hasta}`}. Elegí otra casa o cambiá las fechas.`;
    }
    return null;
  }

  function openDetail(id) {
    const r = reservas.find(x => x.id === id); if (!r) return;
    const estado = estadoPago(r);
    const telefono = normalizarTelefonoGuardado(r.telefono);
    const tel = telefono.replace(/\D/g, "");
    const wa = tel ? "https://wa.me/" + tel : "";
    openSheet(`
      <h3 id="sheetTitle">${esc([r.nombre, r.apellido].filter(Boolean).join(" "))} ${closeBtn}</h3>
      <div class="detail">
        <div class="drow"><span>Casa</span><span class="tag"><span class="swatch c-${r.casa}"></span>${esc(casaById[r.casa]?.nombre || "")}</span></div>
        <div class="drow"><span>Entrada</span><span class="num">${fmtLargo(r.inicio)}</span></div>
        <div class="drow"><span>Salida</span><span class="num">${fmtLargo(r.fin)}</span></div>
        <div class="drow"><span>Noches</span><span class="num">${noches(r)}</span></div>
        <div class="drow"><span>Adultos</span><span class="num">${r.adultos}</span></div>
        <div class="drow"><span>Niños</span><span class="num">${r.ninos}</span></div>
        ${r.comentarios ? `<div class="drow"><span>Comentarios</span><span class="comments-text">${esc(r.comentarios).replace(/\n/g, "<br>")}</span></div>` : ""}
        <div class="drow"><span>Por noche</span><span class="num">${importe(r.precioNoche, r.moneda)}</span></div>
        <div class="drow"><span>Total</span><span class="num">${importe(r.total, r.moneda)}</span></div>
        <div class="drow"><span>Seña paga</span><span class="num">${importe(r.senia, r.moneda)}</span></div>
        <div class="drow"><span>Falta pagar</span><span class="num">${saldoPendiente(r) == null ? "Sin calcular" : money(saldoPendiente(r), r.moneda)}</span></div>
        <div class="drow"><span>Estado de pago</span><span class="payment-badge ${estado.clase}">${estado.etiqueta}</span></div>
        <div class="drow"><span>Teléfono</span><span class="num">${esc(telefono)}</span></div>
      </div>
      <div class="links">
        ${tel ? `<a href="tel:+${esc(tel)}">Llamar</a>` : ""}
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
    if (code === "23P01") return "No se pudo guardar porque otra reserva ocupa esas fechas en esa casa. Actualizá el calendario y elegí otra casa o cambiá las fechas.";
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
    $("#reportStart").value = iso(now.getFullYear(), now.getMonth(), 1);
    $("#reportEnd").value = todayISO;
    $("#reportStart").max = todayISO;
    $("#reportEnd").max = todayISO;
    $("#calculateReport").addEventListener("click", () => {
      const inicio = $("#reportStart").value;
      const fin = $("#reportEnd").value;
      const error = $("#reportErr");
      error.hidden = true;
      if (!inicio || !fin) {
        error.textContent = "Elegí las dos fechas del período.";
        error.hidden = false;
        return;
      }
      if (inicio > fin) {
        error.textContent = "La fecha inicial no puede ser posterior a la fecha final.";
        error.hidden = false;
        return;
      }
      if (fin > todayISO) {
        error.textContent = "No se pueden calcular montos de fechas futuras.";
        error.hidden = false;
        return;
      }
      mostrarResumenPeriodo(calcularResumenPeriodo(inicio, fin, reservas));
    });
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

  function mostrarResumenPeriodo(resumen) {
    $("#reportResults").innerHTML = `
      <div class="report-totals">
        <div class="report-total"><span>Total en pesos uruguayos</span><strong>${money(resumen.UYU, "UYU")}</strong></div>
        <div class="report-total"><span>Total en dólares</span><strong>${money(resumen.USD, "USD")}</strong></div>
      </div>
      <h3>Noches alquiladas por casa</h3>
      <div class="report-houses">${CASAS.map(c => `
        <div class="report-house"><span class="swatch c-${c.id}"></span><span>${esc(c.nombre)}</span><strong>${resumen.nochesPorCasa[c.id]} ${resumen.nochesPorCasa[c.id] === 1 ? "noche" : "noches"}</strong></div>
      `).join("")}</div>`;
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
