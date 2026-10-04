(function () {
  'use strict';

  const STORAGE_KEY = 'decision-tree-creator:v1';

  const EXAMPLES = {
    proveedores: {
      decision: 'Elegir proveedor (E)',
      criterion: 'min',
      unit: '€',
      showAltNames: true,
      showChoice: false,
      alternatives: [
        {
          name: 'Proveedor A', symbol: 'A',
          scenarios: [
            { name: '1%', prob: '0,8', result: 'C+10' },
            { name: '2%', prob: '0,1', result: 'C+20' },
            { name: '3%', prob: '0,1', result: 'C+30' },
          ],
        },
        {
          name: 'Proveedor B', symbol: 'B',
          scenarios: [
            { name: '1%', prob: '0,4', result: 'C-90' },
            { name: '2%', prob: '0,3', result: 'C-80' },
            { name: '3%', prob: '0,3', result: 'C-70' },
          ],
        },
      ],
    },
    lanzamiento: {
      decision: 'Lanzar producto (L)',
      criterion: 'max',
      unit: '€',
      showAltNames: true,
      showChoice: false,
      alternatives: [
        {
          name: 'Lanzar', symbol: 'L',
          scenarios: [
            { name: 'Éxito', prob: '0,8', result: '3.300.000' },
            { name: 'Fracaso', prob: '0,2', result: '800.000' },
          ],
        },
        {
          name: 'No lanzar', symbol: 'N',
          scenarios: [
            { name: 'Demanda alta', prob: '0,5', result: '2.400.000' },
            { name: 'Demanda baja', prob: '0,5', result: '1.600.000' },
          ],
        },
      ],
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const $ = (id) => document.getElementById(id);

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.alternatives)) return saved;
    } catch (_) { /* sin almacenamiento: se usa el ejemplo */ }
    return clone(EXAMPLES.proveedores);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(model)); } catch (_) { /* opcional */ }
  }

  let model = load();
  let current = { svg: '', width: 0, height: 0 };

  const ctx = document.createElement('canvas').getContext('2d');
  const measure = (text, size, font) => {
    ctx.font = `${size}px ${font}`;
    return ctx.measureText(text).width;
  };

  function renderForm() {
    $('decision').value = model.decision;
    $('criterion').value = model.criterion;
    $('unit').value = model.unit;
    $('showAltNames').checked = !!model.showAltNames;
    $('showChoice').checked = !!model.showChoice;

    $('alternatives').innerHTML = model.alternatives.map((alt, i) => `
      <section class="card alt">
        <div class="alt-head">
          <label class="grow">Alternativa
            <input data-alt="${i}" data-f="name" value="${esc(alt.name)}" placeholder="Proveedor A">
          </label>
          <label class="sym">Símbolo
            <input data-alt="${i}" data-f="symbol" value="${esc(alt.symbol)}" placeholder="A" maxlength="6">
          </label>
          <button class="icon" data-action="del-alt" data-alt="${i}" title="Quitar alternativa" aria-label="Quitar alternativa">✕</button>
        </div>
        <div class="rows">
          <div class="row head"><span>Escenario</span><span>Probabilidad</span><span>Resultado</span><span></span></div>
          ${alt.scenarios.map((sc, j) => `
            <div class="row">
              <input data-alt="${i}" data-sc="${j}" data-f="name" value="${esc(sc.name)}" placeholder="1%" aria-label="Escenario">
              <input data-alt="${i}" data-sc="${j}" data-f="prob" value="${esc(sc.prob)}" placeholder="0,8" aria-label="Probabilidad">
              <input data-alt="${i}" data-sc="${j}" data-f="result" value="${esc(sc.result)}" placeholder="C+10 o 3.300.000" aria-label="Resultado">
              <button class="icon" data-action="del-sc" data-alt="${i}" data-sc="${j}" title="Quitar escenario" aria-label="Quitar escenario">✕</button>
            </div>`).join('')}
        </div>
        <button class="link" data-action="add-sc" data-alt="${i}">+ Agregar escenario</button>
      </section>`).join('');
  }

  function resolutionHtml(calc) {
    const { Expr, Tree } = window;
    const rows = calc.alternatives.map((a) => {
      const done = a.scenarios.filter((s) => s.weighted);
      if (!a.ev) return `<p><b>${esc(a.name)}:</b> faltan datos para calcular E(${esc(a.symbol)}).</p>`;
      const terms = done.map((s) => {
        const p = Expr.formatNumber(s.prob, 2);
        return Expr.isConstant(s.result) ? `${p} × ${Expr.format(s.result)}` : `${p}(${Expr.format(s.result, { compact: true })})`;
      });
      const partials = done.map((s) => Expr.format(s.weighted));
      return `<p><b>${esc(a.name)}:</b><br>E(${esc(a.symbol)}) = ${esc(terms.join(' + '))}<br>` +
        `E(${esc(a.symbol)}) = ${esc(partials.join(' + ').replace(/\+ -/g, '- '))} = <b>${esc(Tree.evText(a, calc.unit))}</b></p>`;
    });

    let conclusion = '';
    const goal = model.criterion === 'max' ? 'mayor valor esperado' : 'menor costo esperado';
    if (calc.best !== null) {
      const best = calc.alternatives[calc.best];
      conclusion = `Se elige <b>${esc(best.name)}</b> (${goal}: ${esc(Tree.evText(best, calc.unit))}).`;
      const others = calc.alternatives.filter((_, i) => i !== calc.best);
      if (others.length) {
        conclusion += ' ' + others.map((o) => {
          const diff = Math.abs(o.ev.c - best.ev.c);
          return `Diferencia con ${esc(o.name)}: ${esc(Expr.format(Expr.constant(diff), { unit: calc.unit }))}.`;
        }).join(' ');
      }
    } else if (calc.undecidable) {
      conclusion = 'La decisión depende del valor de las variables: los valores esperados no tienen la misma parte algebraica.';
    }
    return rows.join('') + (conclusion ? `<p class="conclusion">${conclusion}</p>` : '');
  }

  function update() {
    const calc = window.Tree.compute(model);
    current = window.Tree.render(model, calc, measure);
    $('preview').innerHTML = current.svg;
    $('resolution').innerHTML = resolutionHtml(calc);
    $('warnings').innerHTML = calc.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
    $('warnings').hidden = !calc.warnings.length;
    save();
  }

  function pngBlob(scale = 3) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = current.width * scale;
        canvas.height = current.height * scale;
        const c = canvas.getContext('2d');
        c.fillStyle = '#fff';
        c.fillRect(0, 0, canvas.width, canvas.height);
        c.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
      };
      img.onerror = () => reject(new Error('No se pudo generar la imagen'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(current.svg);
    });
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function flash(msg) {
    const el = $('status');
    el.textContent = msg;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { el.textContent = ''; }, 2500);
  }

  const actions = {
    'add-alt'() {
      const symbol = String.fromCharCode(65 + (model.alternatives.length % 26));
      model.alternatives.push({ name: `Alternativa ${symbol}`, symbol, scenarios: [{ name: '', prob: '', result: '' }] });
    },
    'del-alt'(d) { model.alternatives.splice(+d.alt, 1); },
    'add-sc'(d) { model.alternatives[+d.alt].scenarios.push({ name: '', prob: '', result: '' }); },
    'del-sc'(d) { model.alternatives[+d.alt].scenarios.splice(+d.sc, 1); },
  };

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    try {
      if (actions[action]) {
        actions[action](btn.dataset);
        renderForm();
        update();
      } else if (action === 'example') {
        model = clone(EXAMPLES[btn.dataset.example]);
        renderForm();
        update();
      } else if (action === 'png') {
        download(await pngBlob(), 'arbol-de-decision.png');
      } else if (action === 'svg') {
        download(new Blob([current.svg], { type: 'image/svg+xml' }), 'arbol-de-decision.svg');
      } else if (action === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        flash('Imagen copiada: pegala en Word con Ctrl+V');
      }
    } catch (err) {
      flash(action === 'copy' ? 'No se pudo copiar; usá "Descargar PNG"' : err.message);
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    const f = el.dataset.f;
    if (el.id && el.id in model) {
      model[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (f && el.dataset.sc !== undefined) {
      model.alternatives[+el.dataset.alt].scenarios[+el.dataset.sc][f] = el.value;
    } else if (f) {
      model.alternatives[+el.dataset.alt][f] = el.value;
    } else {
      return;
    }
    update();
  });

  renderForm();
  update();
})();
