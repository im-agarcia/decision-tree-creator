// Cálculo del árbol (valores ponderados y esperados) y dibujo en SVG con el formato de la cátedra.
(function (root) {
  'use strict';

  const Expr = root.Expr || (typeof require !== 'undefined' ? require('./expr.js') : null);

  // Diferencia: resultado de la rama, probabilidad, resultado ponderado y valor esperado.
  function compute(model) {
    const unit = (model.unit || '').trim();
    const warnings = [];

    const alternatives = model.alternatives.map((alt, i) => {
      const symbol = (alt.symbol || '').trim() || String(i + 1);
      const name = (alt.name || '').trim() || `Alternativa ${symbol}`;
      let ev = Expr.constant(0);
      let probSum = 0;
      let valid = alt.scenarios.length > 0;

      const scenarios = alt.scenarios.map((sc, j) => {
        const label = (sc.name || '').trim() || `Escenario ${j + 1}`;
        const out = { label, name: (sc.name || '').trim(), raw: sc.result || '', cells: sc.cells || [], prob: null, result: null, weighted: null };
        try {
          const p = Expr.parse(sc.prob);
          if (!Expr.isConstant(p)) throw new Error('la probabilidad debe ser un número');
          if (p.c < -Expr.EPS || p.c > 1 + Expr.EPS) throw new Error('la probabilidad debe estar entre 0 y 1');
          out.prob = p.c;
        } catch (err) {
          warnings.push(`${name}, ${label}: probabilidad — ${err.message}`);
        }
        try {
          out.result = Expr.parse(sc.result);
        } catch (err) {
          warnings.push(`${name}, ${label}: resultado — ${err.message}`);
        }
        if (out.prob !== null && out.result) {
          out.weighted = Expr.scale(out.result, out.prob);
          ev = Expr.add(ev, out.weighted);
          probSum += out.prob;
        } else {
          valid = false;
        }
        return out;
      });

      if (valid && Math.abs(probSum - 1) > 1e-6) {
        warnings.push(`${name}: las probabilidades suman ${Expr.formatNumber(probSum)} (deberían sumar 1)`);
      }
      return { name, symbol, detail: (alt.detail || '').trim(), scenarios, ev: valid ? ev : null, probSum };
    });

    // La mejor alternativa solo es decidible si todas comparten la misma parte variable.
    let best = null;
    let undecidable = false;
    const evs = alternatives.map((a) => a.ev);
    if (evs.length && evs.every(Boolean)) {
      if (evs.every((e) => Expr.sameVariables(e, evs[0]))) {
        best = 0;
        evs.forEach((e, i) => {
          const better = model.criterion === 'max' ? e.c > evs[best].c + Expr.EPS : e.c < evs[best].c - Expr.EPS;
          if (better) best = i;
        });
      } else {
        undecidable = true;
      }
    }

    return { alternatives, best, undecidable, unit, warnings };
  }

  function weightedText(sc, unit) {
    if (sc.prob === null || !sc.result) return '?';
    const p = Expr.formatNumber(sc.prob, 2);
    const w = Expr.format(sc.weighted, { unit });
    if (Expr.isConstant(sc.result)) return `${p} × ${Expr.format(sc.result)} = ${w}`;
    return `${p}(${Expr.format(sc.result, { compact: true })}) = ${w}`;
  }

  const branchLabel = (sc) => (sc.prob === null ? sc.label : `${sc.label} (${Expr.formatNumber(sc.prob)})`);
  const evText = (alt, unit) => (alt.ev ? Expr.format(alt.ev, { unit }) : '?');

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function wrap(text, maxChars) {
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  const FONT = 'Aptos, Calibri, Arial, sans-serif';
  const COLOR = '#17597f';
  const FS = 15;
  const LH = 19;
  const ROW_H = 60;
  const GROUP_GAP = 30;
  const PAD = 24;

  // measure(text, fontSize) -> ancho en px
  function render(model, calc, measure) {
    if (model.style === 'detailed') return renderDetailed(model, calc, measure);
    const m = (t) => measure(t, FS, FONT);
    const alts = calc.alternatives;

    const sqLines = wrap((model.decision || '').trim() || 'Decisión', 16);
    const sqW = Math.max(110, Math.max(...sqLines.map(m)) + 32);
    const sqH = sqLines.length * LH + 26;

    const circleLines = alts.map((a) => [`E(${a.symbol}) =`, evText(a, calc.unit)]);
    const r = Math.max(46, ...circleLines.flat().map((t) => m(t) / 2 + 14));

    const altLabelW = model.showAltNames ? Math.max(0, ...alts.map((a) => m(a.name))) : 0;
    const gap1 = Math.max(100, altLabelW + 56);

    const scLabelW = Math.max(0, ...alts.flatMap((a) => a.scenarios.map((s) => m(branchLabel(s)))));
    const maxN = Math.max(1, ...alts.map((a) => a.scenarios.length));
    // Con muchas ramas se alarga la línea para que las etiquetas no pisen la rama de arriba.
    const dy2 = Math.max(0, ((maxN - 1) / 2 - 1) * ROW_H);
    const branchLen = Math.max(190, scLabelW + 100, (scLabelW * dy2) / 18 - r);

    const leafW = Math.max(0, ...alts.flatMap((a) => a.scenarios.map((s) => m(weightedText(s, calc.unit)))));

    const sqX = PAD;
    const cX = sqX + sqW + gap1 + r;
    const endX = cX + r + branchLen;
    const leafX = endX + 12;
    const W = Math.ceil(leafX + leafW + PAD);

    let cursor = PAD;
    const groups = alts.map((a) => {
      const n = a.scenarios.length;
      const h = Math.max(n * ROW_H, 2 * r + 16);
      const cy = cursor + h / 2;
      cursor += h + GROUP_GAP;
      return { cy, ys: a.scenarios.map((_, j) => cy + (j - (n - 1) / 2) * ROW_H) };
    });
    const bodyBottom = alts.length ? cursor - GROUP_GAP : PAD + sqH;
    const sqCy = alts.length ? (groups[0].cy + groups[groups.length - 1].cy) / 2 : PAD + sqH / 2;

    const showChoice = model.showChoice && calc.best !== null;
    const choiceText = showChoice ? evText(alts[calc.best], calc.unit) : '';
    const H = Math.ceil(Math.max(bodyBottom, sqCy + sqH / 2 + (showChoice ? LH + 8 : 0)) + PAD) + 8;

    const out = [];
    const line = (x1, y1, x2, y2) =>
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLOR}" stroke-width="2" stroke-linecap="round"/>`);
    const text = (x, y, t, { anchor = 'start', fill = '#000', weight = 'normal' } = {}) =>
      out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}">${esc(t)}</text>`);
    // Etiqueta alineada a la derecha en xr, apoyada por encima de la línea en todo su ancho.
    const labelAbove = (x1, y1, x2, y2, xr, t) => {
      const yAt = (x) => y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      text(xr, Math.min(yAt(xr), yAt(xr - m(t))) - 7, t, { anchor: 'end' });
    };

    const sqRight = sqX + sqW;
    alts.forEach((a, i) => {
      const g = groups[i];
      line(sqRight, sqCy, cX, g.cy);
      if (model.showAltNames) labelAbove(sqRight, sqCy, cX, g.cy, cX - r - 10, a.name);
      if (showChoice && i !== calc.best) {
        // Doble raya sobre la alternativa descartada.
        const t = 0.22;
        const mx = sqRight + (cX - r - sqRight) * t;
        const my = sqCy + ((g.cy - sqCy) * (mx - sqRight)) / (cX - sqRight);
        for (const dx of [-3, 3]) line(mx + dx - 3, my + 8, mx + dx + 3, my - 8);
      }
      a.scenarios.forEach((s, j) => {
        line(cX, g.cy, endX, g.ys[j]);
        labelAbove(cX, g.cy, endX, g.ys[j], endX - 12, branchLabel(s));
        text(leafX, g.ys[j] + FS * 0.35, weightedText(s, calc.unit));
      });
    });

    out.push(`<rect x="${sqX}" y="${(sqCy - sqH / 2).toFixed(1)}" width="${sqW.toFixed(1)}" height="${sqH}" fill="${COLOR}" stroke="#0e3b56" stroke-width="1.5"/>`);
    sqLines.forEach((l, k) =>
      text(sqX + sqW / 2, sqCy + (k - (sqLines.length - 1) / 2) * LH + FS * 0.35, l, { anchor: 'middle', fill: '#fff' }));
    if (showChoice) text(sqX + sqW / 2, sqCy + sqH / 2 + LH + 2, choiceText, { anchor: 'middle', weight: 'bold' });

    alts.forEach((a, i) => {
      const g = groups[i];
      out.push(`<circle cx="${cX.toFixed(1)}" cy="${g.cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${COLOR}" stroke="#0e3b56" stroke-width="1.5"/>`);
      text(cX, g.cy - LH / 2 - 2 + FS * 0.35, circleLines[i][0], { anchor: 'middle', fill: '#fff' });
      text(cX, g.cy + LH / 2 + 2 + FS * 0.35, circleLines[i][1], { anchor: 'middle', fill: '#fff' });
    });

    out.push(`<text x="${W - 10}" y="${H - 8}" text-anchor="end" fill="#9aa5ae" font-size="10">powered by AG</text>`);

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" font-size="${FS}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>` + out.join('') + '</svg>';
    return { svg, width: W, height: H };
  }

  const PASTEL = {
    decision: '#bcd6f5', alt: '#dccbf5', circle: '#d6f0c8', result: '#fbd5d0', ev: '#d3f0cc', header: '#dbe8fa',
    cells: ['#e3eefb', '#fdf0c4', '#e4d7f7'],
  };
  const INK = '#1f2a44';
  const HAS_OPERATOR = /[+\-−*×·\/]/;

  // Formato detallado: columnas con el paso a paso de cada escenario, valor esperado y comparación.
  function renderDetailed(model, calc, measure) {
    const m = (t, bold) => measure(t, FS, FONT, bold);
    const alts = calc.alternatives;
    const unit = calc.unit;
    const cols = model.columns || [];
    const plain = (t) => ({ t });
    const bold = (t) => ({ t, bold: true });
    const blockW = (lines) => Math.max(0, ...lines.map((l) => m(l.t, l.bold)));

    // Una celda de una sola línea con una cuenta ("35.000 × 250") muestra también su resultado.
    function cellLines(txt) {
      const lines = String(txt || '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 1 && HAS_OPERATOR.test(lines[0].slice(1))) {
        try {
          const v = Expr.parse(lines[0]);
          if (Expr.isConstant(v)) return [plain(lines[0]), plain(`= ${Expr.format(v, { unit })}`)];
        } catch (_) { /* texto libre */ }
      }
      return lines.map(plain);
    }

    function resultLines(sc) {
      if (!sc.result) return [bold('?')];
      const value = Expr.format(sc.result, { unit });
      const raw = sc.raw.trim();
      if (Expr.isConstant(sc.result) && HAS_OPERATOR.test(raw.slice(1))) {
        const pretty = raw.replace(/\s*([+\-−*×·\/])\s*/g, ' $1 ').replace(/[*·]/g, '×').replace(/-/g, '−');
        return [...wrap(pretty, 26).map(plain), bold(`= ${value}`)];
      }
      return [bold(value)];
    }

    function evLines(a) {
      if (!a.ev) return [bold(`E(${a.symbol}) = ?`)];
      const terms = a.scenarios.map((s) => `${Expr.formatNumber(s.prob, 2)}(${Expr.format(s.result, { compact: true })})`);
      return [
        ...terms.map((t, i) => plain(i === 0 ? `E(${a.symbol}) = ${t}` : `+ ${t}`)),
        bold(`= ${Expr.format(a.ev, { unit })}`),
      ];
    }

    // Contenido y medidas.
    const decLines = wrap((model.decision || '').trim() || 'Decisión', 12).map(bold);
    const decW = blockW(decLines) + 28;
    const decH = decLines.length * LH + 24;

    const altBlocks = alts.map((a) => [bold(a.name), ...wrap(a.detail, 24).map(plain)]);
    const altW = Math.max(60, ...altBlocks.map(blockW)) + 28;

    const sub = (t) => ((t || '').trim() ? [plain(t.trim())] : []);
    const headers = model.showHeaders ? {
      alt: [bold('Alternativas'), plain('(decisión)')],
      states: [bold('Estados posibles'), plain('(probabilidades)')],
      cols: cols.map((c, k) => [bold((c.title || '').trim() || `Columna ${k + 1}`), ...sub(c.subtitle)]),
      result: [bold((model.resultTitle || '').trim() || 'Resultado'), ...sub(model.resultSubtitle)],
      ev: [bold('Valor esperado'), plain('por alternativa')],
    } : null;
    const headerW = (lines) => (headers ? blockW(lines) + 24 : 0);
    const headerH = headers
      ? Math.max(...[headers.alt, headers.states, headers.result, headers.ev, ...headers.cols].map((l) => l.length)) * LH + 16
      : 0;

    const rows = alts.map((a) => a.scenarios.map((s) => {
      const cells = cols.map((_, k) => cellLines(s.cells[k]));
      const result = resultLines(s);
      const prob = s.prob === null ? '?' : Expr.formatNumber(s.prob, 2);
      const name = s.name ? `(${s.name})` : '';
      const tallest = Math.max(result.length, ...cells.map((c) => c.length));
      return { cells, result, prob, name, h: Math.max(tallest * LH + 18, 2 * (LH + 8)) + 14 };
    }));
    const allRows = rows.flat();

    const rc = FS * 1.3;
    const cellW = cols.map((_, k) => Math.max(headerW(headers ? headers.cols[k] : []), ...allRows.map((r) => blockW(r.cells[k]) + 24)));
    const resW = Math.max(headerW(headers ? headers.result : []), ...allRows.map((r) => blockW(r.result) + 24), 60);
    const evBlocks = alts.map(evLines);
    const evW = Math.max(headerW(headers ? headers.ev : []), ...evBlocks.map((b) => blockW(b) + 24));

    // Posición horizontal.
    const decX = PAD;
    const altX = decX + decW + Math.max(44, headerW(headers ? headers.alt : []) - decW - altW);
    const altRight = altX + altW;
    const circleCx = altRight + 12 + rc;
    const elbowX = circleCx + rc + 26;
    const labelW = Math.max(40, ...allRows.map((r) => Math.max(m(r.prob, true), m(r.name))));
    const segW = Math.max(labelW + 20, headerW(headers ? headers.states : []) - (elbowX - altRight) + 16);
    const GAP = 22;
    let x = elbowX + segW;
    const colX = cellW.map((w) => { const at = x; x += w + GAP; return at; });
    const resX = x;
    const braceX = resX + resW + 10;
    const evX = braceX + 26;
    let W = evX + evW + PAD;

    // Posición vertical.
    const top = PAD + (headers ? headerH + 22 : 0);
    let cursor = top;
    const groups = alts.map((a, i) => {
      const altH = altBlocks[i].length * LH + 20;
      const evH = evBlocks[i].length * LH + 18;
      const inner = rows[i].reduce((s, r) => s + r.h, 0);
      const h = Math.max(inner, altH + 14, evH + 14);
      let y = cursor + (h - inner) / 2;
      const ys = rows[i].map((r) => { const cy = y + r.h / 2; y += r.h; return cy; });
      const g = { cy: cursor + h / 2, ys, altH };
      cursor += h + 24;
      return g;
    });
    const bodyBottom = alts.length ? cursor - 24 : top + decH;
    const decCy = alts.length ? (groups[0].cy + groups[groups.length - 1].cy) / 2 : top + decH / 2;

    // Comparación y decisión.
    let compLines = [];
    if (alts.length > 1 && calc.best !== null) {
      const sign = model.criterion === 'max' ? 1 : -1;
      const order = alts.map((_, i) => i).sort((p, q) => sign * (alts[q].ev.c - alts[p].ev.c) || p - q);
      order.splice(order.indexOf(calc.best), 1);
      order.unshift(calc.best);
      let comparison = '';
      order.forEach((i, k) => {
        if (k) comparison += Math.abs(alts[i].ev.c - alts[order[k - 1]].ev.c) < Expr.EPS ? '  =  ' : sign > 0 ? '  >  ' : '  <  ';
        comparison += `E(${alts[i].symbol}) = ${Expr.format(alts[i].ev, { unit })}`;
      });
      compLines = [
        bold('Comparación y decisión:'),
        plain(comparison),
        bold(`Se debe elegir ${alts[calc.best].name},`),
        bold(`ya que presenta el ${sign > 0 ? 'mayor beneficio esperado' : 'menor costo esperado'}.`),
      ];
    } else if (calc.undecidable) {
      compLines = [bold('Comparación y decisión:'), plain('La decisión depende del valor de las variables.')];
    }
    const compW = compLines.length ? blockW(compLines) + 36 : 0;
    const compH = compLines.length ? compLines.length * (LH + 2) + 18 : 0;
    W = Math.ceil(Math.max(W, compW + 2 * PAD));
    const compY = bodyBottom + 18;
    const H = Math.ceil((compLines.length ? compY + compH : bodyBottom) + PAD) + 8;

    // Dibujo: líneas, luego figuras, luego textos.
    const lines = [];
    const shapes = [];
    const texts = [];
    const poly = (pts) =>
      lines.push(`<polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`);
    const rect = (bx, by, w, h, fill, stroke = INK, sw = 1.5) =>
      shapes.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`);
    const block = (cx, cy, blk, lh = LH) => blk.forEach((l, k) =>
      texts.push(`<text x="${cx.toFixed(1)}" y="${(cy + (k - (blk.length - 1) / 2) * lh + FS * 0.35).toFixed(1)}" text-anchor="middle" font-weight="${l.bold ? 'bold' : 'normal'}">${esc(l.t)}</text>`));
    const boxed = (bx, cy, w, blk, fill, stroke, sw) => {
      const h = blk.length * LH + 18;
      rect(bx, cy - h / 2, w, h, fill, stroke, sw);
      block(bx + w / 2, cy, blk);
      return h;
    };
    const SOFT = '#8a97a8';

    if (headers) {
      const head = (x1, x2, blk) => {
        rect(x1, PAD, x2 - x1, headerH, PASTEL.header, '#c3d3ea', 1);
        block((x1 + x2) / 2, PAD + headerH / 2, blk);
      };
      head(decX, altRight, headers.alt);
      head(altRight + 8, elbowX + segW - 8, headers.states);
      cols.forEach((_, k) => head(colX[k], colX[k] + cellW[k], headers.cols[k]));
      head(resX, resX + resW, headers.result);
      head(evX, evX + evW, headers.ev);
    }

    rect(decX, decCy - decH / 2, decW, decH, PASTEL.decision);
    block(decX + decW / 2, decCy, decLines);

    alts.forEach((a, i) => {
      const g = groups[i];
      poly([[decX + decW / 2, decCy], [altX, g.cy]]);
      poly([[altRight, g.cy], [circleCx, g.cy]]);
      rect(altX, g.cy - g.altH / 2, altW, g.altH, PASTEL.alt);
      block(altX + altW / 2, g.cy, altBlocks[i]);
      shapes.push(`<circle cx="${circleCx.toFixed(1)}" cy="${g.cy.toFixed(1)}" r="${rc.toFixed(1)}" fill="${PASTEL.circle}" stroke="${INK}" stroke-width="1.5"/>`);

      let braceTop = Infinity;
      let braceBottom = -Infinity;
      rows[i].forEach((r, j) => {
        const y = g.ys[j];
        poly([[circleCx, g.cy], [elbowX, y], [resX, y]]);
        const lx = elbowX + segW / 2;
        texts.push(`<text x="${lx.toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" font-weight="bold">${esc(r.prob)}</text>`);
        if (r.name) texts.push(`<text x="${lx.toFixed(1)}" y="${(y + LH - 1).toFixed(1)}" text-anchor="middle">${esc(r.name)}</text>`);
        r.cells.forEach((blk, k) => {
          if (blk.length) boxed(colX[k], y, cellW[k], blk, PASTEL.cells[k % PASTEL.cells.length], SOFT, 1.2);
        });
        const h = boxed(resX, y, resW, r.result, PASTEL.result, '#d98a80', 1.2);
        braceTop = Math.min(braceTop, y - h / 2);
        braceBottom = Math.max(braceBottom, y + h / 2);
      });

      if (rows[i].length) {
        const mid = (braceTop + braceBottom) / 2;
        const q = Math.min(8, (braceBottom - braceTop) / 4);
        lines.push(`<path d="M${braceX.toFixed(1)},${braceTop.toFixed(1)} q${q},0 ${q},${q} V${(mid - q).toFixed(1)} q0,${q} ${q},${q} q${-q},0 ${-q},${q} V${(braceBottom - q).toFixed(1)} q0,${q} ${-q},${q}" fill="none" stroke="${INK}" stroke-width="1.8"/>`);
        boxed(evX, mid, evW, evBlocks[i], PASTEL.ev, '#4f9a55', 1.5);
      }
    });

    if (compLines.length) {
      const cx = W - PAD - compW;
      rect(cx, compY, compW, compH, PASTEL.ev, '#4f9a55', 1.5);
      block(cx + compW / 2, compY + compH / 2, compLines, LH + 2);
    }

    texts.push(`<text x="${W - 10}" y="${H - 8}" text-anchor="end" fill="#9aa5ae" font-size="10">powered by AG</text>`);

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" font-size="${FS}" fill="#111">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>` + lines.join('') + shapes.join('') + texts.join('') + '</svg>';
    return { svg, width: W, height: H };
  }

  const api = { compute, render, weightedText, evText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tree = api;
})(typeof self !== 'undefined' ? self : this);
