// Expresiones lineales: números ("3.300.000", "0,8", "80%") o álgebra simple ("C+10", "0,3(C-80)").
// Una expresión se representa como { c: constante, v: { nombreVariable: coeficiente } }.
(function (root) {
  'use strict';

  const EPS = 1e-9;

  // "3.300.000" -> 3300000, "0,8" -> 0.8, "0.4" -> 0.4, "1.234,5" -> 1234.5
  function parseNumber(raw) {
    let s = raw.replace(/[.,]+$/, '');
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Número inválido: "${raw}"`);
    return n;
  }

  function tokenize(input) {
    const tokens = [];
    const src = String(input).replace(/[€$\s]/g, '');
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      const num = /^\d[\d.,]*/.exec(src.slice(i));
      const id = /^[A-Za-zÀ-ÖØ-öø-ÿ_][A-Za-zÀ-ÖØ-öø-ÿ0-9_]*/.exec(src.slice(i));
      if (num) {
        const text = num[0].replace(/[.,]+$/, '');
        tokens.push({ t: 'num', v: parseNumber(text) });
        i += text.length;
      } else if (id) {
        tokens.push({ t: 'id', v: id[0] });
        i += id[0].length;
      } else if ('+-−–*×·/÷()%'.includes(ch)) {
        const op = '−–'.includes(ch) ? '-' : '×·'.includes(ch) ? '*' : ch === '÷' ? '/' : ch;
        tokens.push({ t: op });
        i += 1;
      } else {
        throw new Error(`Símbolo no reconocido: "${ch}"`);
      }
    }
    return tokens;
  }

  const constant = (n) => ({ c: n, v: {} });
  const isConstant = (e) => Object.keys(e.v).length === 0;

  function clean(e) {
    const v = {};
    for (const k of Object.keys(e.v)) if (Math.abs(e.v[k]) > EPS) v[k] = e.v[k];
    return { c: Math.abs(e.c) > EPS ? e.c : 0, v };
  }

  function add(a, b, sign = 1) {
    const v = { ...a.v };
    for (const k of Object.keys(b.v)) v[k] = (v[k] || 0) + sign * b.v[k];
    return clean({ c: a.c + sign * b.c, v });
  }

  function scale(e, k) {
    const v = {};
    for (const name of Object.keys(e.v)) v[name] = e.v[name] * k;
    return clean({ c: e.c * k, v });
  }

  function mul(a, b) {
    if (isConstant(a)) return scale(b, a.c);
    if (isConstant(b)) return scale(a, b.c);
    throw new Error('No se pueden multiplicar dos expresiones con variables');
  }

  function div(a, b) {
    if (!isConstant(b)) throw new Error('Solo se puede dividir por un número');
    if (Math.abs(b.c) < EPS) throw new Error('División por cero');
    return scale(a, 1 / b.c);
  }

  function parse(input) {
    const tokens = tokenize(input);
    if (!tokens.length) throw new Error('Falta el valor');
    let pos = 0;
    const peek = () => tokens[pos];
    const startsPrimary = (tk) => tk && (tk.t === 'num' || tk.t === 'id' || tk.t === '(');

    function expr() {
      let left = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const sign = tokens[pos++].t === '+' ? 1 : -1;
        left = add(left, term(), sign);
      }
      return left;
    }

    function term() {
      let left = unary();
      for (;;) {
        const tk = peek();
        if (tk && (tk.t === '*' || tk.t === '/')) {
          pos++;
          left = tk.t === '*' ? mul(left, unary()) : div(left, unary());
        } else if (startsPrimary(tk)) {
          left = mul(left, unary()); // multiplicación implícita: 0,8C  2(C+10)
        } else {
          return left;
        }
      }
    }

    function unary() {
      const tk = peek();
      if (tk && tk.t === '-') { pos++; return scale(unary(), -1); }
      if (tk && tk.t === '+') { pos++; return unary(); }
      let value = primary();
      while (peek() && peek().t === '%') { pos++; value = scale(value, 0.01); }
      return value;
    }

    function primary() {
      const tk = tokens[pos++];
      if (!tk) throw new Error('Expresión incompleta');
      if (tk.t === 'num') return constant(tk.v);
      if (tk.t === 'id') return { c: 0, v: { [tk.v]: 1 } };
      if (tk.t === '(') {
        const inner = expr();
        if (!peek() || peek().t !== ')') throw new Error('Falta cerrar un paréntesis');
        pos++;
        return inner;
      }
      throw new Error('Expresión inválida');
    }

    const result = expr();
    if (pos < tokens.length) throw new Error('Expresión inválida');
    return result;
  }

  function formatNumber(n, minDecimals = 0) {
    const rounded = Math.round(n * 1e6) / 1e6;
    return rounded.toLocaleString('de-DE', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: Math.max(minDecimals, 6),
    });
  }

  // compact: "C+10" (para usar dentro de paréntesis); normal: "0,8C + 8"
  function format(e, { compact = false, unit = '' } = {}) {
    const parts = [];
    for (const name of Object.keys(e.v).sort()) {
      const k = e.v[name];
      const abs = Math.abs(k);
      parts.push({ neg: k < 0, text: (Math.abs(abs - 1) < EPS ? '' : formatNumber(abs)) + name });
    }
    if (Math.abs(e.c) > EPS || !parts.length) {
      parts.push({ neg: e.c < 0, text: formatNumber(Math.abs(e.c)) });
    }
    let out = '';
    parts.forEach((p, i) => {
      if (i === 0) out += (p.neg ? '-' : '') + p.text;
      else out += (compact ? (p.neg ? '-' : '+') : (p.neg ? ' - ' : ' + ')) + p.text;
    });
    if (unit && isConstant(e)) out += ' ' + unit;
    return out;
  }

  const sameVariables = (a, b) => {
    const keys = new Set([...Object.keys(a.v), ...Object.keys(b.v)]);
    for (const k of keys) if (Math.abs((a.v[k] || 0) - (b.v[k] || 0)) > EPS) return false;
    return true;
  };

  const api = { parse, format, formatNumber, add, scale, constant, isConstant, sameVariables, EPS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Expr = api;
})(typeof self !== 'undefined' ? self : this);
