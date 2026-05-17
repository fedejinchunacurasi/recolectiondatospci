/**
 * Inspector PCI — ASTM D6433 — UNA Puno
 * script.js · Lógica principal, cálculos, geolocalización y gestión de fotos
 *
 * Todas las funciones están encapsuladas en el objeto global PCI
 * para evitar colisiones con el ámbito global.
 */

const PCI = (() => {

  /* ════════════════════════════════════════════════════
     ESTADO GLOBAL
  ════════════════════════════════════════════════════ */
  let registros     = [];
  let tramoDatos    = {};
  let currentGeo    = null;
  let currentPhotos = [];   // Array de { dataUrl, name }
  let deleteIndex   = null;
  let activeFilter  = 'all';

  // Índice de foto activa en el modal
  let photoModalIndex = 0;
  let photoModalList  = []; // [{ dataUrl, caption, filename }]

  /* ── Reglas de negocio PCI ── */
  const IGNORAR     = [9, 14];    // Ignorar en cálculo PCI
  const SOLO_LOSA   = [4, 8];     // Solo si hay losa de concreto
  const EXCLUYE_TODO= [11];       // Excluye todas las demás
  const EXCLUYE_8   = [10];       // Si 10 existe → no registrar 8

  const MEAS_TYPE = {
    1:'area', 2:'area', 3:'area', 4:'lineal', 5:'area', 6:'area',
    7:'lineal', 8:'lineal', 9:'lineal', 10:'lineal', 11:'area',
    12:'area', 13:'unidad', 14:'lineal', 15:'area', 16:'area',
    17:'area', 18:'area', 19:'area'
  };

  const FALLA_NAMES = {
    1:'Piel de cocodrilo',          2:'Exudación',
    3:'Agrietamiento en bloque',    4:'Abultamientos y hundimientos',
    5:'Corrugaciones',              6:'Depresiones',
    7:'Grietas de borde',           8:'Grieta de reflexión de junta',
    9:'Desnivel de calzada/berma',  10:'Grietas long./transversales',
    11:'Parcheo y acometidas',      12:'Pulimento de agregados',
    13:'Huecos',                    14:'Cruce de vía férrea/sumidero',
    15:'Ahuellamiento',             16:'Deformación por empuje',
    17:'Grietas parabólicas',       18:'Hinchamiento',
    19:'Disgregación y desintegración'
  };

  /* ════════════════════════════════════════════════════
     INICIALIZACIÓN
  ════════════════════════════════════════════════════ */
  function init() {
    // Fecha de hoy por defecto
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('t-fecha').value = today;

    // Cargar datos desde localStorage
    try {
      const saved = localStorage.getItem('pci_registros');
      if (saved) registros = JSON.parse(saved);
      const savedTramo = localStorage.getItem('pci_tramo');
      if (savedTramo) {
        tramoDatos = JSON.parse(savedTramo);
        _fillTramoForm();
      }
    } catch(e) {
      console.warn('Error cargando datos guardados:', e);
    }

    updateBadges();
    renderResumen();
  }

  /* ── Rellenar formulario del tramo con datos guardados ── */
  function _fillTramoForm() {
    const map = {
      'carretera':'t-carretera','seccion':'t-seccion','unidad':'t-unidad',
      'prog_ini':'t-prog-ini','prog_fin':'t-prog-fin','area_um':'t-area-um',
      'forma':'t-forma','fecha':'t-fecha','inspector':'t-inspector','obs':'t-obs'
    };
    Object.entries(map).forEach(([k,id]) => {
      const el = document.getElementById(id);
      if (el && tramoDatos[k]) el.value = tramoDatos[k];
    });
  }

  /* ════════════════════════════════════════════════════
     NAVEGACIÓN POR TABS
  ════════════════════════════════════════════════════ */
  function switchTab(name, btn) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected','false');
    });
    document.getElementById('panel-' + name).classList.add('active');
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');

    if (name === 'lista')   renderList();
    if (name === 'resumen') renderResumen();
    if (name === 'fotos')   renderGallery();
  }

  /* ════════════════════════════════════════════════════
     DATOS DEL TRAMO
  ════════════════════════════════════════════════════ */
  function saveTramo() {
    const required = ['t-carretera','t-seccion','t-unidad','t-prog-ini','t-fecha','t-inspector'];
    const missing  = required.filter(id => !document.getElementById(id).value.trim());
    if (missing.length) {
      toast('Completa los campos obligatorios del tramo (marcados con *).', 'err');
      document.getElementById(missing[0]).focus();
      return;
    }

    tramoDatos = {
      carretera: v('t-carretera'),
      seccion:   v('t-seccion'),
      unidad:    v('t-unidad'),
      prog_ini:  v('t-prog-ini'),
      prog_fin:  v('t-prog-fin'),
      area_um:   v('t-area-um'),
      forma:     v('t-forma'),
      fecha:     v('t-fecha'),
      inspector: v('t-inspector'),
      obs:       v('t-obs'),
    };

    localStorage.setItem('pci_tramo', JSON.stringify(tramoDatos));
    toast('Datos del tramo guardados ✓', 'ok');

    // Ir automáticamente al registro
    setTimeout(() => {
      const tab = document.querySelectorAll('.tab-btn')[1];
      switchTab('registro', tab);
    }, 600);
  }

  /* ════════════════════════════════════════════════════
     CAMBIO DE FALLA → REGLAS PCI
  ════════════════════════════════════════════════════ */
  function onFallaChange() {
    const sel = document.getElementById('f-tipo').value;
    hideAlert('alert-rules');
    hideAlert('alert-err');
    document.getElementById('falla-notice').classList.add('hidden');

    // Reset bloques de medición
    ['meas-area','meas-lineal','meas-unidad'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('active');
      el.setAttribute('aria-hidden','true');
    });
    document.getElementById('meas-empty').style.display = 'flex';

    if (!sel) return;

    const [numStr, meas, flag] = sel.split('|');
    const num = parseInt(numStr);
    const tiposRegistrados = registros.map(r => r.falla_num);

    // Regla: falla 11 ya registrada → bloquear todo
    if (tiposRegistrados.includes(11) && !EXCLUYE_TODO.includes(num)) {
      showRulesAlert('Se registró falla 11 (Parcheo). No se pueden agregar otras fallas en esta unidad según ASTM D6433.');
      document.getElementById('f-tipo').value = '';
      return;
    }

    // Regla: seleccionar 11 cuando ya hay otros
    if (EXCLUYE_TODO.includes(num) && tiposRegistrados.length > 0) {
      showRulesAlert('La falla 11 (Parcheo) no puede coexistir con otras fallas. Elimina los registros previos para usar esta falla.');
      document.getElementById('f-tipo').value = '';
      return;
    }

    // Regla: falla 8 cuando falla 10 existe
    if (num === 8 && tiposRegistrados.includes(10)) {
      showRulesAlert('Falla 10 ya registrada: no se puede registrar falla 8 (Grieta de reflexión de junta) simultáneamente.');
      document.getElementById('f-tipo').value = '';
      return;
    }

    // Avisos informativos
    const notice    = document.getElementById('falla-notice');
    const noticeMsg = document.getElementById('falla-notice-msg');
    if (flag === 'ignorar') {
      noticeMsg.textContent = `ℹ Falla ${num} se registra para referencia pero se IGNORA en el cálculo del PCI (ASTM D6433).`;
      notice.classList.remove('hidden');
    } else if (flag === 'losa') {
      noticeMsg.textContent = `⚠ Falla ${num} se registra SOLO si existe losa de concreto debajo del pavimento flexible.`;
      notice.classList.remove('hidden');
    } else if (flag === 'excluye') {
      noticeMsg.textContent = `⚠ Falla 11 (Parcheo): al guardar esta falla no podrán agregarse otras fallas en la misma unidad.`;
      notice.classList.remove('hidden');
    }

    // Advertencia co-existencia fallas 1 y 15
    if ((num === 1 && tiposRegistrados.includes(15)) || (num === 15 && tiposRegistrados.includes(1))) {
      const extraNotice = document.getElementById('falla-notice');
      document.getElementById('falla-notice-msg').textContent =
        (document.getElementById('falla-notice-msg').textContent || '') +
        ' — Recuerda: fallas 1 y 15 deben medirse por separado para cada nivel de severidad.';
      extraNotice.classList.remove('hidden');
    }

    // Mostrar bloque de medición
    document.getElementById('meas-empty').style.display = 'none';
    const measEl = document.getElementById('meas-' + meas);
    measEl.classList.add('active');
    measEl.setAttribute('aria-hidden','false');
  }

  /* ════════════════════════════════════════════════════
     CÁLCULO DE ÁREA
  ════════════════════════════════════════════════════ */
  function calcArea() {
    const l = parseFloat(document.getElementById('m-largo').value)  || 0;
    const a = parseFloat(document.getElementById('m-ancho').value)   || 0;
    document.getElementById('result-area').textContent = (l * a).toFixed(2);
  }

  /* ════════════════════════════════════════════════════
     GEOLOCALIZACIÓN
  ════════════════════════════════════════════════════ */
  function getLocation() {
    const chip = document.getElementById('geo-chip');
    const txt  = document.getElementById('geo-text');
    chip.className = 'status-chip pulsing';
    txt.textContent = 'Obteniendo coordenadas…';

    if (!navigator.geolocation) {
      chip.className = 'status-chip err';
      txt.textContent = 'GPS no disponible en este dispositivo';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        currentGeo = {
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          acc: pos.coords.accuracy.toFixed(1),
        };
        chip.className = 'status-chip ok';
        txt.textContent = 'Coordenadas capturadas ✓';
        const coordEl = document.getElementById('geo-coords');
        coordEl.classList.remove('hidden');
        document.getElementById('geo-lat').textContent = currentGeo.lat;
        document.getElementById('geo-lng').textContent = currentGeo.lng;
        document.getElementById('geo-acc').textContent = currentGeo.acc;
        toast(`GPS: ${currentGeo.lat}, ${currentGeo.lng} (±${currentGeo.acc}m)`, 'ok');
      },
      err => {
        chip.className = 'status-chip err';
        const msgs = {
          1: 'Permiso de ubicación denegado',
          2: 'Señal GPS no disponible',
          3: 'Tiempo de espera agotado'
        };
        txt.textContent = msgs[err.code] || 'Error GPS';
        toast('No se pudo obtener la ubicación: ' + (msgs[err.code] || err.message), 'err');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  /* ════════════════════════════════════════════════════
     GESTIÓN DE FOTOS — MEJORADO
  ════════════════════════════════════════════════════ */

  /**
   * Carga una foto desde la cámara (input capture)
   */
  function loadPhoto(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    _processPhotoFile(file);
    evt.target.value = ''; // Limpiar para permitir reselección
  }

  /**
   * Carga múltiples fotos desde galería
   */
  function loadPhotoGallery(evt) {
    const files = Array.from(evt.target.files);
    if (!files.length) return;
    Promise.all(files.map(_processPhotoFile))
      .then(() => toast(`${files.length} foto(s) cargada(s) ✓`, 'ok'));
    evt.target.value = '';
  }

  /**
   * Procesa un archivo de imagen y lo añade a currentPhotos
   */
  function _processPhotoFile(file) {
    return new Promise((resolve) => {
      // Validar tamaño (10 MB máx)
      if (file.size > 10 * 1024 * 1024) {
        toast(`"${file.name}" supera el límite de 10 MB`, 'err');
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = e => {
        const photoObj = {
          dataUrl: e.target.result,
          name: file.name || `foto_${Date.now()}.jpg`,
          size: file.size,
          type: file.type,
        };
        currentPhotos.push(photoObj);
        _renderPhotoGrid();
        _updatePhotoChip();
        resolve(photoObj);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Renderiza la cuadrícula de miniaturas en el formulario
   */
  function _renderPhotoGrid() {
    const grid = document.getElementById('photo-grid');
    grid.innerHTML = '';
    currentPhotos.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'photo-thumb-item';
      item.innerHTML = `
        <img src="${p.dataUrl}" alt="Foto ${i+1}" loading="lazy">
        <span class="photo-thumb-index">${i+1}</span>
        <button class="photo-thumb-remove" title="Quitar foto" onclick="PCI._removePhotoAt(${i})">✕</button>
      `;
      item.querySelector('img').addEventListener('click', () => {
        _openPhotoPreview(i);
      });
      grid.appendChild(item);
    });

    // Mostrar/ocultar botón limpiar todo
    const clearBtn = document.getElementById('clear-photos-btn');
    if (currentPhotos.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }

  /**
   * Elimina una foto del array actual por índice
   */
  function _removePhotoAt(i) {
    currentPhotos.splice(i, 1);
    _renderPhotoGrid();
    _updatePhotoChip();
  }

  /**
   * Actualiza el chip de estado de fotos
   */
  function _updatePhotoChip() {
    const chip = document.getElementById('photo-chip');
    const txt  = document.getElementById('photo-text');
    if (currentPhotos.length === 0) {
      chip.className = 'status-chip';
      txt.textContent = 'Sin fotos';
    } else {
      chip.className = 'status-chip ok';
      txt.textContent = `${currentPhotos.length} foto${currentPhotos.length > 1 ? 's' : ''} cargada${currentPhotos.length > 1 ? 's' : ''} ✓`;
    }
  }

  /**
   * Vista previa de una foto del formulario en el modal
   */
  function _openPhotoPreview(index) {
    photoModalList = currentPhotos.map((p, i) => ({
      dataUrl: p.dataUrl,
      caption: `Foto ${i+1} de ${currentPhotos.length} — ${p.name}`,
      filename: `foto_${i+1}_${p.name}`
    }));
    photoModalIndex = index;
    _showPhotoModal();
  }

  /**
   * Limpia todas las fotos del formulario actual
   */
  function clearPhotos() {
    currentPhotos = [];
    _renderPhotoGrid();
    _updatePhotoChip();
    toast('Fotos eliminadas del formulario', 'ok');
  }

  /* ════════════════════════════════════════════════════
     GUARDAR REGISTRO
  ════════════════════════════════════════════════════ */
  function saveRegistro() {
    hideAlert('alert-err');

    const sel = document.getElementById('f-tipo').value;
    if (!sel) { showErrAlert('Selecciona un tipo de falla.'); return; }

    const sev = document.querySelector('input[name="severidad"]:checked');
    if (!sev) { showErrAlert('Selecciona el grado de severidad (B / M / A).'); return; }

    const [numStr, meas] = sel.split('|');
    const num = parseInt(numStr);

    let cantidad = null, unidad = '', largo = null, ancho = null;
    if (meas === 'area') {
      largo = parseFloat(document.getElementById('m-largo').value);
      ancho = parseFloat(document.getElementById('m-ancho').value);
      if (!largo || !ancho) { showErrAlert('Ingresa largo y ancho para calcular el área.'); return; }
      cantidad = parseFloat((largo * ancho).toFixed(2));
      unidad = 'm²';
    } else if (meas === 'lineal') {
      const lo = parseFloat(document.getElementById('m-longitud').value);
      if (!lo || lo <= 0) { showErrAlert('Ingresa la longitud en metros (valor positivo).'); return; }
      cantidad = lo;
      unidad = 'ml';
    } else if (meas === 'unidad') {
      const ct = parseInt(document.getElementById('m-cantidad').value);
      if (!ct || ct <= 0) { showErrAlert('Ingresa la cantidad de huecos (valor positivo).'); return; }
      cantidad = ct;
      unidad = 'und';
    }

    const id = Date.now();

    // Guardar fotos en localStorage por ID de registro
    const photoKeys = [];
    currentPhotos.forEach((p, i) => {
      const key = `pci_photo_${id}_${i}`;
      try {
        localStorage.setItem(key, p.dataUrl);
        photoKeys.push(key);
      } catch(e) {
        toast(`Foto ${i+1} no guardada (espacio insuficiente)`, 'warn');
      }
    });

    const reg = {
      id,
      timestamp:         new Date().toISOString(),
      tramo:             tramoDatos.carretera || '—',
      seccion:           tramoDatos.seccion   || '—',
      unidad_muestreada: tramoDatos.unidad    || '—',
      fecha:             tramoDatos.fecha     || new Date().toISOString().split('T')[0],
      inspector:         tramoDatos.inspector || '—',
      falla_num:         num,
      falla_nombre:      FALLA_NAMES[num],
      tipo_medicion:     meas,
      severidad:         sev.value,
      cantidad,
      unidad_medida:     unidad,
      largo,
      ancho,
      lat:               currentGeo ? currentGeo.lat : null,
      lng:               currentGeo ? currentGeo.lng : null,
      precision_gps:     currentGeo ? currentGeo.acc : null,
      foto_count:        photoKeys.length,   // Cuántas fotos tiene
      foto_keys:         photoKeys,           // Claves localStorage
      obs:               document.getElementById('f-obs').value.trim(),
      ignorar_pci:       IGNORAR.includes(num),
    };

    registros.push(reg);

    try {
      localStorage.setItem('pci_registros', JSON.stringify(registros));
    } catch(e) {
      toast('Aviso: espacio de almacenamiento limitado. Exporta los datos pronto.', 'warn');
    }

    toast(`Registro #${registros.length} guardado ✓`, 'ok');
    updateBadges();
    clearForm();
  }

  /* ════════════════════════════════════════════════════
     LIMPIAR FORMULARIO DE FALLA
  ════════════════════════════════════════════════════ */
  function clearForm() {
    document.getElementById('f-tipo').value = '';
    document.querySelectorAll('input[name="severidad"]').forEach(r => r.checked = false);
    document.getElementById('m-largo').value    = '';
    document.getElementById('m-ancho').value    = '';
    document.getElementById('m-longitud').value = '';
    document.getElementById('m-cantidad').value = '';
    document.getElementById('result-area').textContent = '0.00';
    document.getElementById('f-obs').value = '';

    currentGeo    = null;
    currentPhotos = [];

    ['meas-area','meas-lineal','meas-unidad'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.remove('active');
      el.setAttribute('aria-hidden','true');
    });
    document.getElementById('meas-empty').style.display = 'flex';

    document.getElementById('geo-chip').className   = 'status-chip';
    document.getElementById('geo-text').textContent = 'Sin coordenadas';
    document.getElementById('geo-coords').classList.add('hidden');

    _renderPhotoGrid();
    _updatePhotoChip();

    hideAlert('alert-rules');
    hideAlert('alert-err');
    document.getElementById('falla-notice').classList.add('hidden');
  }

  /* ════════════════════════════════════════════════════
     RENDERIZAR LISTA DE REGISTROS
  ════════════════════════════════════════════════════ */
  function renderList() {
    const container = document.getElementById('reg-list-container');
    let data = registros;

    // Aplicar filtro
    if (activeFilter === 'B' || activeFilter === 'M' || activeFilter === 'A') {
      data = registros.filter(r => r.severidad === activeFilter);
    } else if (activeFilter === 'foto') {
      data = registros.filter(r => r.foto_count > 0);
    }

    if (!registros.length) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-ico">📋</span>
        <div class="empty-title">Sin registros aún</div>
        <div class="empty-sub">Ve a "Registrar" para añadir el primer registro de falla.</div>
      </div>`;
      return;
    }

    if (!data.length) {
      container.innerHTML = `<div class="empty-state">
        <span class="empty-ico">🔍</span>
        <div class="empty-title">Sin coincidencias</div>
        <div class="empty-sub">No hay registros que cumplan el filtro seleccionado.</div>
      </div>`;
      return;
    }

    container.innerHTML = `<div class="reg-list">${
      data.map((r, i) => {
        // Miniaturas de fotos
        let thumbsHtml = '';
        const realIndex = registros.indexOf(r);

        if (r.foto_count > 0 && r.foto_keys && r.foto_keys.length) {
          thumbsHtml = r.foto_keys.slice(0, 3).map((key, pi) => {
            const b64 = localStorage.getItem(key);
            return b64
              ? `<img src="${b64}" class="reg-thumb" onclick="PCI.openRegistroPhotos(${realIndex}, ${pi})" title="Ver foto ${pi+1}" loading="lazy">`
              : '';
          }).join('');
          if (r.foto_count > 3) {
            thumbsHtml += `<span class="reg-photo-count">+${r.foto_count - 3}</span>`;
          }
        } else {
          thumbsHtml = `<div class="reg-no-photo" title="Sin foto">📷</div>`;
        }

        const geoTxt = r.lat
          ? `📍 ${r.lat}, ${r.lng} (±${r.precision_gps}m)`
          : '📍 Sin GPS';

        const medTxt = r.tipo_medicion === 'area'
          ? `${r.cantidad} m² (${r.largo}×${r.ancho} m)`
          : r.tipo_medicion === 'lineal'
            ? `${r.cantidad} ml`
            : `${r.cantidad} und`;

        return `<div class="reg-item" data-sev="${r.severidad}">
          <div class="reg-item-head">
            <div style="min-width:0;flex:1">
              <div class="reg-falla">${String(r.falla_num).padStart(2,'0')} · ${r.falla_nombre}</div>
              <div class="reg-badges mt-8">
                <span class="badge badge-${r.severidad}">SEV ${r.severidad}</span>
                <span class="badge badge-info">${medTxt}</span>
                ${r.ignorar_pci ? '<span class="badge" style="color:var(--text3);border-color:var(--border);">Ignorar PCI</span>' : ''}
                ${r.foto_count > 0 ? `<span class="badge badge-info">📷 ${r.foto_count} foto${r.foto_count>1?'s':''}</span>` : ''}
              </div>
            </div>
            <div class="reg-thumbs">${thumbsHtml}</div>
          </div>
          <div class="reg-meta">${geoTxt} · ${r.fecha} · ${r.inspector}</div>
          ${r.obs ? `<div class="reg-meta" style="color:var(--text3);">📝 ${r.obs}</div>` : ''}
          <div class="reg-actions mt-8">
            ${r.foto_count > 0 ? `<button class="btn btn-outline btn-sm" onclick="PCI.openRegistroPhotos(${realIndex}, 0)">🖼 Ver fotos</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="PCI.openDelModal(${realIndex})">🗑 Eliminar</button>
          </div>
        </div>`;
      }).join('')
    }</div>`;
  }

  /* ── Filtrar lista ── */
  function filterList(filter, btn) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderList();
  }

  /* ════════════════════════════════════════════════════
     GALERÍA DE FOTOS
  ════════════════════════════════════════════════════ */
  function renderGallery() {
    const container = document.getElementById('gallery-container');
    const infoEl    = document.getElementById('gallery-info');

    // Recopilar todas las fotos con metadatos
    const allPhotos = [];
    registros.forEach(r => {
      if (r.foto_keys && r.foto_keys.length) {
        r.foto_keys.forEach((key, pi) => {
          const b64 = localStorage.getItem(key);
          if (b64) {
            allPhotos.push({
              dataUrl:   b64,
              regId:     r.id,
              regIndex:  registros.indexOf(r),
              photoIndex: pi,
              falla_num:  r.falla_num,
              falla_nombre: r.falla_nombre,
              severidad: r.severidad,
              fecha:     r.fecha,
              inspector: r.inspector,
              lat:       r.lat,
              lng:       r.lng,
              caption:   `F${String(r.falla_num).padStart(2,'0')} · ${r.falla_nombre} · Sev ${r.severidad} · ${r.fecha}`,
              filename:  `PCI_F${String(r.falla_num).padStart(2,'0')}_Sev${r.severidad}_${r.fecha}_foto${pi+1}.jpg`
            });
          }
        });
      }
    });

    // Actualizar badge
    updatePhotoCountBadge(allPhotos.length);

    if (!allPhotos.length) {
      infoEl.style.display = 'none';
      container.innerHTML = `<div class="empty-state">
        <span class="empty-ico">📷</span>
        <div class="empty-title">Sin fotografías</div>
        <div class="empty-sub">Captura fotos al registrar las fallas para verlas aquí.</div>
      </div>`;
      return;
    }

    infoEl.style.display = 'block';
    infoEl.innerHTML = `📷 Total: <strong style="color:var(--accent)">${allPhotos.length}</strong> fotografía${allPhotos.length>1?'s':''} en <strong style="color:var(--accent)">${registros.filter(r=>r.foto_count>0).length}</strong> registros.`;

    container.innerHTML = allPhotos.map((p, gi) => `
      <div class="gallery-item" onclick="PCI._openGalleryPhoto(${gi})" data-gi="${gi}">
        <button class="download-btn" onclick="event.stopPropagation(); PCI._downloadPhoto('${p.filename}', ${gi})" title="Descargar">⬇</button>
        <img src="${p.dataUrl}" alt="${p.caption}" loading="lazy">
        <div class="gallery-caption">
          <div class="gallery-falla-num">F${String(p.falla_num).padStart(2,'0')}</div>
          <div>${p.falla_nombre}</div>
          <div class="gallery-badge"><span class="badge badge-${p.severidad}">Sev ${p.severidad}</span></div>
          <div style="margin-top:3px;color:var(--text3)">${p.fecha}</div>
          ${p.lat ? `<div style="color:var(--text3)">📍 ${p.lat}, ${p.lng}</div>` : ''}
        </div>
      </div>
    `).join('');

    // Guardar lista para navegación modal
    photoModalList = allPhotos.map(p => ({
      dataUrl:  p.dataUrl,
      caption:  p.caption,
      filename: p.filename
    }));
  }

  function _openGalleryPhoto(gi) {
    photoModalIndex = gi;
    _showPhotoModal();
  }

  function openRegistroPhotos(regIndex, photoIndex) {
    const r = registros[regIndex];
    if (!r || !r.foto_keys) return;

    photoModalList = r.foto_keys
      .map((key, pi) => {
        const b64 = localStorage.getItem(key);
        return b64 ? {
          dataUrl:  b64,
          caption:  `F${String(r.falla_num).padStart(2,'0')} · ${r.falla_nombre} · Sev ${r.severidad} · ${r.fecha} — Foto ${pi+1}/${r.foto_count}`,
          filename: `PCI_F${String(r.falla_num).padStart(2,'0')}_Sev${r.severidad}_${r.fecha}_foto${pi+1}.jpg`
        } : null;
      })
      .filter(Boolean);

    photoModalIndex = Math.min(photoIndex, photoModalList.length - 1);
    _showPhotoModal();
  }

  /* ── Modal de foto ── */
  function _showPhotoModal() {
    if (!photoModalList.length) return;
    const modal = document.getElementById('photo-modal');
    modal.classList.add('open');
    _renderPhotoModal();
  }

  function _renderPhotoModal() {
    const item = photoModalList[photoModalIndex];
    if (!item) return;
    document.getElementById('photo-modal-img').src     = item.dataUrl;
    document.getElementById('photo-modal-caption').textContent = item.caption || '';
    document.getElementById('photo-modal-counter').textContent =
      `${photoModalIndex + 1} / ${photoModalList.length}`;

    // Enlace de descarga
    const dl = document.getElementById('photo-modal-download');
    dl.href     = item.dataUrl;
    dl.download = item.filename || 'foto_pci.jpg';

    // Navegación
    document.getElementById('photo-modal-prev').disabled = photoModalIndex <= 0;
    document.getElementById('photo-modal-next').disabled = photoModalIndex >= photoModalList.length - 1;
  }

  function navPhotoModal(dir) {
    const next = photoModalIndex + dir;
    if (next < 0 || next >= photoModalList.length) return;
    photoModalIndex = next;
    _renderPhotoModal();
  }

  function closePhotoModal() {
    document.getElementById('photo-modal').classList.remove('open');
    document.getElementById('photo-modal-img').src = '';
  }

  function _downloadPhoto(filename, gi) {
    const item = photoModalList[gi];
    if (!item) return;
    const a = document.createElement('a');
    a.href     = item.dataUrl;
    a.download = filename;
    a.click();
  }

  /* ════════════════════════════════════════════════════
     RESUMEN PCI
  ════════════════════════════════════════════════════ */
  function renderResumen() {
    const totalFotos = registros.reduce((acc, r) => acc + (r.foto_count || 0), 0);
    document.getElementById('s-total').textContent  = registros.length;
    document.getElementById('s-tipos').textContent  = new Set(registros.map(r => r.falla_num)).size;
    document.getElementById('s-fotos').textContent  = totalFotos;
    document.getElementById('s-sev-b').textContent  = registros.filter(r => r.severidad === 'B').length;
    document.getElementById('s-sev-m').textContent  = registros.filter(r => r.severidad === 'M').length;
    document.getElementById('s-sev-a').textContent  = registros.filter(r => r.severidad === 'A').length;

    // Tramo
    const tDiv = document.getElementById('resumen-tramo');
    if (tramoDatos.carretera) {
      tDiv.innerHTML = `
        Carretera: <strong style="color:var(--text)">${tramoDatos.carretera}</strong> ·
        Sección: <strong style="color:var(--text)">${tramoDatos.seccion}</strong> ·
        UM: <strong style="color:var(--text)">${tramoDatos.unidad}</strong><br>
        Progresiva: ${tramoDatos.prog_ini} → ${tramoDatos.prog_fin || '—'} ·
        Área UM: ${tramoDatos.area_um || '—'} m² ·
        Inspector: <strong style="color:var(--text)">${tramoDatos.inspector}</strong> ·
        Fecha: ${tramoDatos.fecha}
      `;
    }

    // Tabla de fallas
    const fDiv = document.getElementById('resumen-fallas');
    if (!registros.length) { fDiv.textContent = '— Sin datos —'; return; }

    const groups = {};
    let totalArea = 0;
    registros.forEach(r => {
      const key = `${r.falla_num}_${r.severidad}`;
      if (!groups[key]) groups[key] = { num:r.falla_num, nombre:r.falla_nombre, sev:r.severidad, qty:0, unidad:r.unidad_medida, count:0 };
      groups[key].qty   += (r.cantidad || 0);
      groups[key].count ++;
      if (r.unidad_medida === 'm²') totalArea += (r.cantidad || 0);
    });

    document.getElementById('pci-area-total').textContent = totalArea.toFixed(2) + ' m²';

    fDiv.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="color:var(--text2);font-family:var(--font-mono);font-size:11px;border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:6px 8px;">N°</th>
          <th style="text-align:left;padding:6px 8px;">Falla</th>
          <th style="text-align:center;padding:6px 8px;">Sev</th>
          <th style="text-align:right;padding:6px 8px;">Cantidad</th>
          <th style="text-align:right;padding:6px 8px;">Reg.</th>
        </tr>
      </thead>
      <tbody>
        ${Object.values(groups).sort((a,b)=>a.num-b.num).map(g => `
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:7px 8px;font-family:var(--font-mono);color:var(--accent);">${String(g.num).padStart(2,'0')}</td>
            <td style="padding:7px 8px;">${g.nombre}</td>
            <td style="padding:7px 8px;text-align:center;"><span class="badge badge-${g.sev}">${g.sev}</span></td>
            <td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);">${g.qty.toFixed(2)} ${g.unidad}</td>
            <td style="padding:7px 8px;text-align:right;color:var(--text2);">${g.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  }

  /* ════════════════════════════════════════════════════
     ELIMINAR REGISTRO
  ════════════════════════════════════════════════════ */
  function openDelModal(i) {
    deleteIndex = i;
    document.getElementById('del-modal').classList.add('open');
  }
  function closeDelModal() {
    deleteIndex = null;
    document.getElementById('del-modal').classList.remove('open');
  }
  function confirmDelete() {
    if (deleteIndex === null) return;
    const reg = registros[deleteIndex];

    // Eliminar todas las fotos del registro
    if (reg.foto_keys && reg.foto_keys.length) {
      reg.foto_keys.forEach(key => localStorage.removeItem(key));
    }
    // Compatibilidad con versión anterior (clave única)
    localStorage.removeItem('pci_photo_' + reg.id);

    registros.splice(deleteIndex, 1);
    localStorage.setItem('pci_registros', JSON.stringify(registros));
    closeDelModal();
    renderList();
    updateBadges();
    toast('Registro y sus fotos eliminados ✓', 'ok');
  }

  /* ════════════════════════════════════════════════════
     EXPORTAR CSV
  ════════════════════════════════════════════════════ */
  function exportCSV() {
    if (!registros.length) { toast('No hay registros para exportar.', 'err'); return; }

    const cols = [
      'id','timestamp','tramo','seccion','unidad_muestreada','fecha','inspector',
      'falla_num','falla_nombre','severidad','tipo_medicion','cantidad','unidad_medida',
      'largo','ancho','lat','lng','precision_gps','foto_count','obs','ignorar_pci'
    ];

    const tramoLine = `"TRAMO: ${tramoDatos.carretera||''} | Sección: ${tramoDatos.seccion||''} | UM: ${tramoDatos.unidad||''} | Inspector: ${tramoDatos.inspector||''} | Fecha: ${tramoDatos.fecha||''}"`;
    const rows = [cols.join(',')];

    registros.forEach(r => {
      rows.push(cols.map(c => {
        const val = r[c] !== null && r[c] !== undefined ? r[c] : '';
        return `"${String(val).replace(/"/g,'""')}"`;
      }).join(','));
    });

    const csv = tramoLine + '\n' + rows.join('\n');
    _downloadFile(csv, `PCI_${tramoDatos.unidad||'registro'}_${_today()}.csv`, 'text/csv');
    toast('CSV descargado ✓', 'ok');
  }

  /* ════════════════════════════════════════════════════
     EXPORTAR JSON
  ════════════════════════════════════════════════════ */
  function exportJSON() {
    if (!registros.length && !Object.keys(tramoDatos).length) {
      toast('No hay datos para exportar.', 'err'); return;
    }
    const payload = {
      tramo:     tramoDatos,
      registros: registros.map(r => {
        // No incluir las claves internas de fotos en el JSON exportado (son referencias a localStorage)
        const { foto_keys, ...rest } = r;
        return rest;
      }),
      exportado: new Date().toISOString(),
      version:   '2.0'
    };
    _downloadFile(JSON.stringify(payload, null, 2), `PCI_${tramoDatos.unidad||'registro'}_${_today()}.json`, 'application/json');
    toast('JSON descargado ✓', 'ok');
  }

  /* ════════════════════════════════════════════════════
     EXPORTAR FOTOS (descarga individual por secuencia)
  ════════════════════════════════════════════════════ */
  function exportPhotosZip() {
    // Recopilar todas las fotos
    const allPhotos = [];
    registros.forEach(r => {
      if (r.foto_keys && r.foto_keys.length) {
        r.foto_keys.forEach((key, pi) => {
          const b64 = localStorage.getItem(key);
          if (b64) {
            allPhotos.push({
              dataUrl:  b64,
              filename: `PCI_F${String(r.falla_num).padStart(2,'0')}_Sev${r.severidad}_${r.fecha}_${String(pi+1).padStart(2,'0')}.jpg`
            });
          }
        });
      }
    });

    if (!allPhotos.length) {
      toast('No hay fotografías guardadas.', 'err');
      return;
    }

    // Descargar una por una con pequeño delay para no saturar el navegador
    toast(`Descargando ${allPhotos.length} foto${allPhotos.length>1?'s':''}…`, 'ok');
    allPhotos.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href     = p.dataUrl;
        a.download = p.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 300);
    });
  }

  /* ════════════════════════════════════════════════════
     LIMPIAR TODO
  ════════════════════════════════════════════════════ */
  function clearAll() {
    if (!confirm('¿Borrar TODOS los registros, fotos y datos del tramo?\n\nEsta acción es IRREVERSIBLE. Se recomienda exportar primero.')) return;

    // Eliminar todas las fotos
    registros.forEach(r => {
      if (r.foto_keys) r.foto_keys.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('pci_photo_' + r.id); // compatibilidad v1
    });

    registros  = [];
    tramoDatos = {};
    localStorage.removeItem('pci_registros');
    localStorage.removeItem('pci_tramo');

    updateBadges();
    renderResumen();
    toast('Todos los datos eliminados.', 'ok');
  }

  /* ════════════════════════════════════════════════════
     UTILIDADES INTERNAS
  ════════════════════════════════════════════════════ */
  function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function _today() {
    return new Date().toISOString().split('T')[0];
  }

  function _downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function updateBadges() {
    // Badge de registros
    const regBadge = document.getElementById('reg-count-badge');
    if (registros.length) {
      regBadge.textContent = registros.length;
      regBadge.classList.add('visible');
    } else {
      regBadge.textContent = '';
      regBadge.classList.remove('visible');
    }

    // Badge de fotos
    const totalFotos = registros.reduce((acc, r) => acc + (r.foto_count || 0), 0);
    updatePhotoCountBadge(totalFotos);
  }

  function updatePhotoCountBadge(count) {
    const photoBadge = document.getElementById('photo-count-badge');
    if (count) {
      photoBadge.textContent = count;
      photoBadge.classList.add('visible');
    } else {
      photoBadge.textContent = '';
      photoBadge.classList.remove('visible');
    }
  }

  function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = 'show ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = ''; }, 2800);
  }

  function showRulesAlert(msg) {
    const el = document.getElementById('alert-rules');
    document.getElementById('alert-rules-msg').textContent = msg;
    el.classList.add('show');
  }
  function showErrAlert(msg) {
    const el = document.getElementById('alert-err');
    document.getElementById('alert-err-msg').textContent = msg;
    el.classList.add('show');
  }
  function hideAlert(id) {
    document.getElementById(id).classList.remove('show');
  }

  /* ════════════════════════════════════════════════════
     TECLADO: Cerrar modales con ESC
  ════════════════════════════════════════════════════ */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePhotoModal();
      closeDelModal();
    }
    // Flechas para navegar fotos en modal
    if (document.getElementById('photo-modal').classList.contains('open')) {
      if (e.key === 'ArrowRight') navPhotoModal(1);
      if (e.key === 'ArrowLeft')  navPhotoModal(-1);
    }
  });

  /* ════════════════════════════════════════════════════
     API PÚBLICA
  ════════════════════════════════════════════════════ */
  return {
    // Init
    init,
    // Navegación
    switchTab,
    // Tramo
    saveTramo,
    // Falla
    onFallaChange,
    calcArea,
    getLocation,
    // Fotos
    loadPhoto,
    loadPhotoGallery,
    clearPhotos,
    _removePhotoAt,
    openRegistroPhotos,
    _openGalleryPhoto,
    navPhotoModal,
    closePhotoModal,
    _downloadPhoto,
    exportPhotosZip,
    // Registro
    saveRegistro,
    clearForm,
    // Lista
    renderList,
    filterList,
    openDelModal,
    closeDelModal,
    confirmDelete,
    // Galería
    renderGallery,
    // Resumen
    renderResumen,
    // Exportar
    exportCSV,
    exportJSON,
    clearAll,
    // Alertas
    showRulesAlert,
    showErrAlert,
    hideAlert,
    toast,
    updateBadges,
    updatePhotoCountBadge,
  };

})();

/* ── Arrancar la app ── */
document.addEventListener('DOMContentLoaded', PCI.init);