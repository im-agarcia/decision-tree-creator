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
        const out = { label, prob: null, result: null, weighted: null };
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
      return { name, symbol, scenarios, ev: valid ? ev : null, probSum };
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
    const H = Math.ceil(Math.max(bodyBottom, sqCy + sqH / 2 + (showChoice ? LH + 8 : 0)) + PAD);

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

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}" font-size="${FS}">` +
      `<rect width="${W}" height="${H}" fill="#fff"/>` + out.join('') + '</svg>';
    return { svg, width: W, height: H };
  }

  const api = { compute, render, weightedText, evText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tree = api;
})(typeof self !== 'undefined' ? self : this);
