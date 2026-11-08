/* Convierte lo que escribe el usuario (texto tipo calculadora) a LaTeX para dibujarlo en notación natural. */
const Disp = (function () {
  'use strict';
  const FNS = {
    sen: '\\sen', sin: '\\sin', cos: '\\cos', tan: '\\tan', tg: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
    ln: '\\ln', log: '\\log', exp: '\\exp', asen: '\\arcsen', asin: '\\arcsin', arcsen: '\\arcsen', arcsin: '\\arcsin',
    acos: '\\arccos', arccos: '\\arccos', atan: '\\arctan', arctan: '\\arctan', sinh: '\\sinh', senh: '\\senh', cosh: '\\cosh', tanh: '\\tanh',
    sqrt: 'sqrt', cbrt: 'cbrt', abs: 'abs', raiz: 'sqrt'
  };
  const NAMES = Object.keys(FNS).sort((a, b) => b.length - a.length);

  function tokenize(src) {
    const s = src.replace(/−/g, '-').replace(/[·×]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/⟨/g, '<').replace(/⟩/g, '>');
    const toks = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)))) { toks.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z]+/.exec(s.slice(i)))) {
        const word = m[0], after = s.slice(i + word.length).trimStart()[0];
        let cut = -1, nm = null;
        for (let p = 0; p < word.length; p++) {
          const tail = word.slice(p).toLowerCase();
          if (tail === 'pi') { cut = p; nm = 'pi'; break; }
          if (FNS[tail] && after === '(') { cut = p; nm = tail; break; }
        }
        const letters = cut < 0 ? word : word.slice(0, cut);
        for (const ch of letters) toks.push({ t: 'id', v: ch });
        if (nm === 'pi') toks.push({ t: 'pi' }); else if (nm) toks.push({ t: 'fn', v: nm });
        i += word.length; continue;
      }
      if ('+-*/^(),<>'.includes(c)) { toks.push({ t: c }); i++; continue; }
      i++; // símbolo desconocido: se ignora en la vista previa
    }
    return toks;
  }

  function toTex(src) {
    const toks = tokenize(src); let p = 0;
    const peek = () => (toks[p] ? toks[p].t : null);
    const SQ = '\\square';

    function expr() {
      let out = '';
      if (peek() === '-') { p++; out = '-'; } else if (peek() === '+') p++;
      out += term();
      while (peek() === '+' || peek() === '-') { const op = toks[p++].t; out += op + term(); }
      return out;
    }
    const startsFactor = t => t === 'num' || t === 'id' || t === 'pi' || t === 'fn' || t === '(' || t === '<';
    function term() {
      if (!startsFactor(peek())) return SQ;
      let num = [factor()];
      for (;;) {
        const t = peek();
        if (t === '*') { p++; const g = startsFactor(peek()) ? factor() : { t: SQ }; num.push({ t: '\\cdot ' + g.t }); }
        else if (t === '/') {
          p++; const g = startsFactor(peek()) ? factor() : { t: SQ };
          const n = num.length === 1 && num[0].inner !== undefined ? num[0].inner : num.map(x => x.t).join('');
          num = [{ t: '\\frac{' + n + '}{' + (g.inner !== undefined ? g.inner : g.t) + '}' }];
        } else if (startsFactor(t)) {
          const g = factor(); const prev = num[num.length - 1].t;
          num.push({ t: (/\d$/.test(prev) && /^\d/.test(g.t) ? '\\cdot ' : '') + g.t, inner: undefined });
        } else break;
      }
      return num.map(x => x.t).join('');
    }
    function factor() {
      let b = atom();
      while (peek() === '^') {
        p++;
        let e;
        if (peek() === '(') { p++; e = expr(); if (peek() === ')') p++; }
        else if (peek() === '-') { p++; e = '-' + (expAtom() || SQ); }
        else e = expAtom() || SQ;
        b = { t: '{' + b.t + '}^{' + e + '}' };
        b.t = b.t.replace(/^\{([^{}]*)\}\^/, '$1^');
      }
      return b;
    }
    function expAtom() {
      const t = toks[p]; if (!t) return null;
      if (t.t === 'num') { p++; return t.v; }
      if (t.t === 'id') { p++; return unit(t.v); }
      if (t.t === 'pi') { p++; return '\\pi '; }
      return null;
    }
    const unit = v => (v === 'i' || v === 'j' || v === 'k') ? '\\mathbf{' + v + '}' : v;
    function atom() {
      const t = toks[p++];
      if (t.t === 'num') return { t: t.v };
      if (t.t === 'id') return { t: unit(t.v) };
      if (t.t === 'pi') return { t: '\\pi ' };
      if (t.t === '(') { const e = expr(); if (peek() === ')') p++; return { t: '\\left(' + e + '\\right)', inner: e }; }
      if (t.t === '<') {
        const parts = [expr()];
        while (peek() === ',') { p++; parts.push(expr()); }
        if (peek() === '>') p++;
        return { t: '\\left\\langle ' + parts.join(',\\ ') + '\\right\\rangle' };
      }
      if (t.t === 'fn') {
        let arg = SQ;
        if (peek() === '(') { p++; arg = peek() === ')' ? SQ : expr(); if (peek() === ')') p++; }
        const k = FNS[t.v];
        if (k === 'sqrt') return { t: '\\sqrt{' + arg + '}' };
        if (k === 'cbrt') return { t: '\\sqrt[3]{' + arg + '}' };
        if (k === 'abs') return { t: '\\left|' + arg + '\\right|' };
        return { t: k + '\\left(' + arg + '\\right)' };
      }
      return { t: SQ };
    }
    if (!toks.length) return '';
    let out = expr();
    while (p < toks.length) { // sobrantes (por ejemplo un ")" extra): se omiten
      if (peek() === ',' || peek() === ')' || peek() === '>') { p++; continue; }
      out += expr();
      if (p < toks.length && !startsFactor(peek()) && peek() !== '+' && peek() !== '-') p++;
    }
    return out;
  }
  return { toTex };
})();
if (typeof module !== 'undefined') module.exports = Disp;
