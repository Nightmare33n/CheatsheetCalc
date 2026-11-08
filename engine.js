/* Motor de la calculadora: LaTeX -> Algebrite -> LaTeX. Sin dependencias del DOM. */
const CalcEngine = (function () {
  'use strict';
  const A = () => (typeof Algebrite !== 'undefined' ? Algebrite : require('algebrite'));

  /* ================= LaTeX -> sintaxis Algebrite ================= */
  const FN = {
    sen: 'sin', sin: 'sin', cos: 'cos', tan: 'tan', tg: 'tan', sec: 'sec', csc: 'csc', cot: 'cot', ctg: 'cot',
    sinh: 'sinh', senh: 'sinh', cosh: 'cosh', tanh: 'tanh',
    arcsin: 'arcsin', arcsen: 'arcsin', arccos: 'arccos', arctan: 'arctan', arctg: 'arctan',
    ln: 'log', log: 'log10', exp: 'exp', abs: 'abs', sqrt: 'sqrt', cbrt: 'cbrt',
    asin: 'arcsin', asen: 'arcsin', acos: 'arccos', atan: 'arctan', raiz: 'sqrt'
  };
  const FNNAMES = Object.keys(FN).sort((a, b) => b.length - a.length);

  function preprocess(s) {
    return s
      .replace(/\\displaystyle|\\left|\\right|\\!|\\,|\\;|\\:|\\quad|\\qquad|\\ /g, '')
      .replace(/\\dfrac|\\tfrac/g, '\\frac')
      .replace(/\u2212/g, '-').replace(/\u00b7|\u00d7/g, '*').replace(/\u00f7/g, '/').replace(/\u03c0/g, '\\pi')
      .replace(/\u00b2/g, '^2').replace(/\u00b3/g, '^3').replace(/\u27e8/g, '<').replace(/\u27e9/g, '>')
      .replace(/\u221a/g, '\\sqrt');
  }

  function fnCall(name, arg, pow) {
    const k = FN[name.toLowerCase()];
    let core;
    if (k === 'sec') core = `(1/cos(${arg}))`;
    else if (k === 'csc') core = `(1/sin(${arg}))`;
    else if (k === 'cot') core = `(cos(${arg})/sin(${arg}))`;
    else if (k === 'log10') core = `(log(${arg})/log(10))`;
    else if (k === 'cbrt') core = `((${arg})^(1/3))`;
    else core = `${k}(${arg})`;
    return pow ? `(${core}^(${pow}))` : `(${core})`;
  }

  /* devuelve tokens {t:'num'|'id'|'unit'|'grp'|'op'|'e', v} */
  function lex(s) {
    const toks = []; let i = 0;
    const push = (t, v) => toks.push({ t, v });
    const err = m => { throw new Error(m); };
    const readGroup = () => { // s[i] === '{'
      let d = 0; const st = i + 1;
      for (; i < s.length; i++) {
        if (s[i] === '{') d++;
        else if (s[i] === '}') { d--; if (d === 0) { const r = s.slice(st, i); i++; return r; } }
      }
      return err('Falta cerrar una llave }');
    };
    const readParen = () => { // s[i] === '('
      let d = 0; const st = i + 1;
      for (; i < s.length; i++) {
        if (s[i] === '(') d++;
        else if (s[i] === ')') { d--; if (d === 0) { const r = s.slice(st, i); i++; return r; } }
      }
      return err('Falta cerrar un paréntesis )');
    };
    const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    // lee un "átomo" para exponentes/argumentos sin llaves
    const readAtom = () => {
      skipWs();
      if (i >= s.length) err('Falta un argumento');
      if (s[i] === '{') return conv(readGroup());
      if (s[i] === '(') return conv(readParen());
      if (s[i] === '-' || s[i] === '+') { const sg = s[i]; i++; return `(${sg}${readAtom()})`; }
      if (/[0-9]/.test(s[i])) { const d = s[i]; i++; return d; }
      if (/[A-Za-z]/.test(s[i])) { const c = s[i]; i++; return c === 'e' ? 'exp(1)' : (c === 'i' ? 'ui' : c === 'j' ? 'uj' : c === 'k' ? 'uk' : c); }
      if (s[i] === '\\') {
        const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
        if (m && m[1] === 'pi') { i += m[0].length; return 'pi'; }
        if (m) { const save = toks.length; lexCommand(); const t = toks.splice(save)[0]; return t ? t.v : err('Argumento no válido'); }
      }
      return err('Argumento no válido tras "^" o función');
    };
    const readFnArg = () => {
      skipWs();
      if (s[i] === '(') return conv(readParen());
      if (s[i] === '{') return conv(readGroup());
      return readAtom();
    };
    const unitOf = inner => {
      const m = /^\s*\\?(i|j|k|imath|jmath)\s*$/.exec(inner.replace(/\\mathbf|\\boldsymbol|\\bm|\\textbf|\\vec|\\hat|[{}]/g, ''));
      if (!m) err('Solo se admiten los vectores unitarios i, j, k');
      return m[1] === 'imath' ? 'i' : m[1] === 'jmath' ? 'j' : m[1];
    };
    function lexCommand() {
      const m = /^\\([A-Za-z]+)/.exec(s.slice(i));
      if (!m) { err('Comando LaTeX no válido cerca de "' + s.slice(i, i + 6) + '"'); }
      const cmd = m[1]; i += m[0].length;
      if (cmd === 'frac') { skipWs(); const a = conv(readGroup()); skipWs(); const b = conv(readGroup()); push('grp', `((${a})/(${b}))`); return; }
      if (cmd === 'sqrt') {
        skipWs(); let n = null;
        if (s[i] === '[') { const e = s.indexOf(']', i); if (e < 0) err('Falta cerrar ] en la raíz'); n = conv(s.slice(i + 1, e)); i = e + 1; }
        skipWs(); const a = readFnArg();
        push('grp', n ? `((${a})^(1/(${n})))` : `sqrt(${a})`); return;
      }
      if (cmd === 'pi') { push('id', 'pi'); return; }
      if (cmd === 'cdot' || cmd === 'times') { push('op', '*'); return; }
      if (cmd === 'infty') err('El infinito no está soportado');
      if (['mathbf', 'boldsymbol', 'bm', 'textbf', 'vec', 'hat', 'mathrm'].includes(cmd)) {
        skipWs();
        let inner;
        if (s[i] === '{') inner = readGroup();
        else { const mm = /^\\?[A-Za-z]+/.exec(s.slice(i)); if (!mm) err('Falta el argumento de \\' + cmd); inner = mm[0]; i += mm[0].length; if (!/^\\?(i|j|k|imath|jmath)$/.test(inner)) { inner = inner[0]; i -= mm[0].length - 1; } }
        if (cmd === 'mathrm') { const nm = inner.trim(); if (FN[nm.toLowerCase()] !== undefined) { fnWord(nm, false); return; } push('grp', conv(inner)); return; }
        push('unit', 'u' + unitOf(inner)); return;
      }
      if (cmd === 'imath') { push('unit', 'ui'); return; }
      if (cmd === 'jmath') { push('unit', 'uj'); return; }
      if (cmd === 'operatorname') { skipWs(); const nm = readGroup(); return fnWord(nm.trim(), true); }
      if (FN[cmd.toLowerCase()] !== undefined) return fnWord(cmd, true);
      return err('Comando no reconocido: \\' + cmd);
    }
    function fnWord(name, cmdForm) {
      let log_b = null, pow = null;
      skipWs();
      if (name.toLowerCase() === 'log' && s[i] === '_') { i++; log_b = readAtom(); }
      skipWs();
      if (s[i] === '^') { i++; pow = readAtom(); }
      skipWs();
      if (!cmdForm && s[i] !== '(' && s[i] !== '{') err('La función ' + name + ' necesita paréntesis: ' + name + '(…)');
      const arg = readFnArg();
      if (log_b) { push('grp', `(log(${arg})/log(${log_b}))`); return; }
      push('grp', fnCall(name, arg, pow));
    }
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; push('num', s.slice(i, j)); i = j; continue; }
      if (/[A-Za-z]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        const word = s.slice(i, j);
        // ¿la cola de la palabra es función o pi?
        let cut = -1, fname = null, isPi = false;
        for (let p = 0; p < word.length; p++) {
          const tail = word.slice(p).toLowerCase();
          if (tail === 'pi') { cut = p; isPi = true; break; }
          if (FN[tail] !== undefined) {
            const nx = s.slice(j).trimStart()[0];
            if (nx === '(' || nx === '{' || nx === '^' || nx === '_') { cut = p; fname = word.slice(p); break; }
          }
        }
        if (cut < 0) {
          for (let p = 0; p < word.length; p++) {
            const tail = word.slice(p).toLowerCase();
            if (tail.length >= 2 && FN[tail] !== undefined) err('La función ' + word.slice(p) + ' necesita paréntesis: ' + word.slice(p) + '(…)');
          }
        }
        const letters = cut < 0 ? word : word.slice(0, cut);
        for (const ch of letters) {
          if (ch === 'e') push('e', 'exp(1)');
          else if (ch === 'i' || ch === 'j' || ch === 'k') push('unit', 'u' + ch);
          else push('id', ch);
        }
        i = j;
        if (isPi) push('id', 'pi');
        else if (fname) fnWord(fname, false);
        continue;
      }
      if (c === '\\') { lexCommand(); continue; }
      if (c === '{') { push('grp', '(' + conv(readGroup()) + ')'); continue; }
      if (c === '(' ) { push('grp', '(' + conv(readParen()) + ')'); continue; }
      if (c === '[') { const e = s.indexOf(']', i); if (e < 0) err('Falta cerrar ]'); push('grp', '(' + conv(s.slice(i + 1, e)) + ')'); i = e + 1; continue; }
      if (c === ')' || c === '}' || c === ']') err('Sobra un cierre "' + c + '"');
      if (c === '^') { i++; push('op', '^'); push('grp', '(' + readAtom() + ')'); continue; }
      if (c === '+' || c === '-' || c === '*' || c === '/') { push('op', c); i++; continue; }
      if (c === ',') err('Una coma solo se permite para separar componentes dentro de ⟨ ⟩');
      err('Símbolo no reconocido: "' + c + '"');
    }
    return toks;
  }

  function conv(s) {
    const toks = lex(s);
    const closer = t => t && (t.t === 'num' || t.t === 'id' || t.t === 'unit' || t.t === 'grp' || t.t === 'e');
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'e' && toks[k + 1] && toks[k + 1].t === 'op' && toks[k + 1].v === '^' && toks[k + 2]) {
        const piece = `exp(${toks[k + 2].v})`;
        toks.splice(k, 3, { t: 'grp', v: piece }); k--; continue;
      }
      const prev = out[out.length - 1];
      if (prev && closer(prev) && closer(t) && !(prev.t === 'num' && t.t === 'num')) out.push({ t: 'op', v: '*' });
      out.push(t);
    }
    // el exponente aplica sobre el elemento previo
    return out.map(t => t.v).join('');
  }

  /* ================= estructura de vectores ================= */
  function splitTop(s) {
    const parts = []; let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (s.startsWith('\\langle', i)) { d++; cur += '\\langle'; i += 6; continue; }
      if (s.startsWith('\\rangle', i)) { d--; cur += '\\rangle'; i += 6; continue; }
      if (c === '(' || c === '{' || c === '[') d++;
      if (c === ')' || c === '}' || c === ']') d--;
      if (c === ',' && d === 0) { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    parts.push(cur);
    return parts;
  }

  /* parseExpr: devuelve {comps:[algStr], vec:boolean} */
  function parseVector(tex, minLen) {
    let s = preprocess(String(tex || '')).trim();
    if (!s) throw new Error('Escribe una expresión.');
    let m = /^\\langle([\s\S]*)\\rangle$/.exec(s) || /^<([\s\S]*)>$/.exec(s);
    let parts = null;
    if (m) parts = splitTop(m[1]);
    else if (/^\([\s\S]*\)$/.test(s)) {
      // paréntesis externos que abarcan todo y contienen comas de nivel superior
      let d = 0, whole = true;
      for (let i = 0; i < s.length - 1; i++) { if (s[i] === '(') d++; if (s[i] === ')') d--; if (d === 0) { whole = false; break; } }
      if (whole) { const p = splitTop(s.slice(1, -1)); if (p.length > 1) parts = p; }
    }
    if (parts) {
      if (parts.length < 2 || parts.length > 3) throw new Error('Un vector debe tener 2 o 3 componentes.');
      return { vec: true, comps: parts.map(p => { if (!p.trim()) throw new Error('Hay una componente vacía.'); return conv(p); }) };
    }
    const E = conv(s);
    if (!/u[ijk]/.test(E)) return { vec: false, comps: [E] };
    const a = A();
    const comp = u => {
      const others = ['ui', 'uj', 'uk'].filter(x => x !== u);
      return run(`subst(0,${others[1]},subst(0,${others[0]},subst(1,${u},${E})))`);
    };
    const c = ['ui', 'uj', 'uk'].map(comp);
    const nz = c.map(x => x !== '0');
    // 2D si no hay k
    const comps = nz[2] || (minLen === 3) ? c : c.slice(0, 2);
    return { vec: true, comps };
  }

  function parseScalar(tex, what) {
    const p = parseVector(tex);
    if (p.vec) throw new Error((what || 'El valor') + ' debe ser un escalar.');
    return p.comps[0];
  }

  /* ================= Algebrite helpers ================= */
  function friendly(msg) {
    if (/divide by zero|division by zero/i.test(msg)) return 'División entre cero: alguna expresión no está definida en ese valor (por ejemplo √t o 1/t en t = 0). Prueba con otro t₀ o deja t₀ vacío.';
    return 'No se pudo calcular: ' + msg;
  }
  function run(cmd) {
    let out;
    try { out = A().run(cmd); } catch (e) { throw new Error(friendly(e.message || String(e))); }
    out = String(out).trim();
    if (/^Stop:|^Parse error|Unknown|Stop:/i.test(out)) throw new Error(friendly(out.replace(/^Stop:\s*/, '')));
    return out;
  }
  const D = (e, v) => {
    const r = run(`d(${e},${v})`);
    if (/\/[^0-9]/.test(r)) { try { const s = run(`simplify(${r})`); if (s.length < r.length) return s; } catch (x) { /* se queda r */ } }
    return r;
  };
  const SUBST = (val, v, e) => run(`subst(${val},${v},${e})`);
  const SIMP = e => run(`simplify(${e})`);
  const ADD = (a, b) => run(`${a}+(${b})`);
  const SUB = (a, b) => run(`(${a})-(${b})`);
  const MUL = (a, b) => `(${a})*(${b})`;
  function INTEG(e, v) {
    const r = run(`integral(${e},${v})`);
    if (/integral\(/.test(r)) throw new Error('No se pudo integrar de forma exacta: ' + latex(e));
    return r;
  }

  const LMAP = [['arcsin', '\\arcsen'], ['arccos', '\\arccos'], ['arctan', '\\arctan'], ['sinh', '\\senh'], ['cosh', '\\cosh'], ['tanh', '\\tanh'], ['sin', '\\sen'], ['cos', '\\cos'], ['tan', '\\tan'], ['log', '\\ln'], ['abs', '\\operatorname{abs}']];
  function stripParen(l) { // {(...)} -> {...}
    let out = '', i = 0;
    while (i < l.length) {
      if (l[i] === '{' && l[i + 1] === '(') {
        let d = 0, j = i + 1;
        for (; j < l.length; j++) { if (l[j] === '(') d++; else if (l[j] === ')') { d--; if (d === 0) break; } }
        if (j < l.length && l[j + 1] === '}') { out += '{' + stripParen(l.slice(i + 2, j)) + '}'; i = j + 2; continue; }
      }
      out += l[i++];
    }
    return out;
  }
  function latex(e) {
    let l = run(`printlatex(${e})`);
    for (const [k, v] of LMAP) l = l.replace(new RegExp('(?<!\\\\)' + k + '(?=\\s*[({\\\\])', 'g'), () => v);
    let prev;
    do { prev = l; l = l.replace(/\\sqrt\{(\d+)\}\\sqrt\{(\d+)\}/g, (m, a, b) => '\\sqrt{' + (BigInt(a) * BigInt(b)) + '}'); } while (l !== prev);
    return stripParen(l);
  }

  /* evaluador numérico seguro para cadenas de Algebrite */
  function compile(str, vars) {
    vars = vars || [];
    let p = 0; const s = str.replace(/\s+/g, '');
    const peek = () => s[p];
    const FNS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, sqrt: Math.sqrt, abs: Math.abs, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
    function expr() { let l = term(); while (peek() === '+' || peek() === '-') { const o = s[p++]; const r = term(); const a = l; l = o === '+' ? (e => a(e) + r(e)) : (e => a(e) - r(e)); } return l; }
    function term() { let l = unary(); while (peek() === '*' || peek() === '/') { const o = s[p++]; const r = unary(); const a = l; l = o === '*' ? (e => a(e) * r(e)) : (e => a(e) / r(e)); } return l; }
    function unary() { if (peek() === '-') { p++; const u = unary(); return e => -u(e); } if (peek() === '+') { p++; return unary(); } return power(); }
    function power() { const b = atom(); if (peek() === '^') { p++; const x = unary(); return e => Math.pow(b(e), x(e)); } return b; }
    function atom() {
      const c = peek();
      if (c === '(') { p++; const e = expr(); if (peek() !== ')') throw new Error('paréntesis'); p++; return e; }
      let m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(s.slice(p));
      if (m) { p += m[0].length; const n = parseFloat(m[0]); return () => n; }
      m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(p));
      if (m) {
        const id = m[0]; p += id.length;
        if (peek() === '(') {
          p++; const a = expr(); if (peek() !== ')') throw new Error('paréntesis'); p++;
          const f = FNS[id]; if (!f) throw new Error('función ' + id);
          return e => f(a(e));
        }
        if (id === 'pi') return () => Math.PI;
        if (vars.includes(id)) return e => e[id];
        throw new Error('símbolo ' + id);
      }
      throw new Error('no entendí ' + s.slice(p, p + 5));
    }
    const f = expr(); if (p < s.length) throw new Error('sobra ' + s.slice(p));
    return f;
  }
  function numeric(e, vars, env) { try { const v = compile(e, vars || [])(env || {}); return isFinite(v) ? v : null; } catch (x) { return null; } }
  function fmt(n) {
    if (n === null || n === undefined) return null;
    if (Math.abs(n) < 1e-12) return '0';
    let s = Math.abs(n) >= 1e6 || Math.abs(n) < 1e-4 ? n.toExponential(5) : String(+n.toFixed(6));
    return s;
  }
  function gauss(f, a, b, panels) {
    const X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
    const W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
    panels = panels || 200; let tot = 0; const h = (b - a) / panels;
    for (let k = 0; k < panels; k++) {
      const lo = a + k * h, mid = lo + h / 2;
      for (let q = 0; q < 8; q++) tot += W[q] * f(mid + X[q] * h / 2) * h / 2;
    }
    return tot;
  }

  /* ================= formato de salida ================= */
  function topAddSub(tex) {
    let d = 0;
    for (let i = 0; i < tex.length; i++) {
      const c = tex[i];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
      else if ((c === '+' || c === '-') && d === 0 && i > 0) return true;
    }
    return false;
  }
  function ijk(texs) {
    const u = ['\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];
    let out = '';
    texs.forEach((t, k) => {
      if (t === '0') return;
      let neg = false, body = t;
      if (body[0] === '-' && !topAddSub(body.slice(1))) { neg = true; body = body.slice(1); }
      const term = body === '1' ? u[k] : ((topAddSub(body) || body[0] === '-') ? `\\left(${body}\\right)` : body) + u[k];
      out += (out === '' ? (neg ? '-' : '') : (neg ? ' - ' : ' + ')) + term;
    });
    return out || '0';
  }
  const angle = texs => `\\left\\langle ${texs.join(',\\ ')}\\right\\rangle`;

  function vecResult(label, algComps, isVec, opts) {
    opts = opts || {};
    const texs = algComps.map(latex);
    const r = { label, vec: isVec, comps: texs };
    if (isVec) { r.angle = angle(texs); r.ijk = ijk(texs); } else r.scalar = texs[0];
    if (opts.suffix) { r.angle = r.angle && r.angle + opts.suffix; r.ijk = r.ijk && r.ijk + opts.suffix; r.scalar = r.scalar && r.scalar + opts.suffix; }
    const nums = algComps.map(c => numeric(c, [], {}));
    if (!opts.noApprox && nums.every(n => n !== null)) {
      const needs = algComps.some(c => /pi|sqrt|log|exp|sin|cos|tan|\^\(?[-0-9]*\/|\/[0-9]/.test(c) && !/^-?[0-9]+$/.test(c));
      if (needs) {
        const f = nums.map(fmt);
        r.approx = isVec ? angle(f) + '\\ =\\ ' + ijk(f) : f[0];
        r.approxIsVec = isVec;
      }
    }
    return r;
  }

  /* ================= operaciones ================= */
  const hasVar = (c, v) => new RegExp('(?<![A-Za-z])' + v + '(?![A-Za-z])').test(c);
  function normVar(v) { v = (v || 't').trim().replace(/^\\/, ''); if (!/^[A-Za-z]$/.test(v) || 'ijke'.includes(v)) throw new Error('La variable debe ser una letra (distinta de e, i, j, k).'); return v; }
  const norm = comps => SIMP(`sqrt(${comps.map(c => `(${c})^2`).join('+')})`);

  function opDerivar(inp) {
    const v = normVar(inp.v); const P = parseVector(inp.f); A().run('clearall');
    const r1 = P.comps.map(c => D(c, v)); const r2 = r1.map(c => D(c, v));
    const res = [];
    const isV = P.vec, sc = isV ? '' : '';
    res.push(vecResult(isV ? `\\mathbf{r}'(${v})` : `f'(${v})`, r1, isV));
    res.push(vecResult(isV ? `\\mathbf{r}''(${v})` : `f''(${v})`, r2, isV));
    if (isV) { const sp = norm(r1); res.push({ label: `\\lVert\\mathbf{r}'(${v})\\rVert`, vec: false, scalar: latex(sp), approx: needsApprox(sp) ? fmt(numeric(sp, [v], {})) : null, comps: [] }); }
    if (inp.t0 && inp.t0.trim()) {
      const t0 = parseScalar(inp.t0, 't₀'); const t0tex = latex(t0);
      const ev = c => SIMP(SUBST(t0, v, c));
      res.push({ sep: `${v}=${t0tex}` });
      res.push(vecResult(isV ? `\\mathbf{r}(${t0tex})` : `f(${t0tex})`, P.comps.map(ev), isV));
      res.push(vecResult(isV ? `\\mathbf{r}'(${t0tex})` : `f'(${t0tex})`, r1.map(ev), isV));
      res.push(vecResult(isV ? `\\mathbf{r}''(${t0tex})` : `f''(${t0tex})`, r2.map(ev), isV));
      if (isV) { const sp = norm(r1.map(ev)); res.push({ label: `\\lVert\\mathbf{r}'(${t0tex})\\rVert`, vec: false, scalar: latex(sp), approx: needsApprox(sp) ? fmt(numeric(sp, [], {})) : null, comps: [] }); }
    }
    return res;
  }
  const needsApprox = e => /pi|sqrt|log|exp|sin|cos|tan|\^\(?[-0-9]*\/|\/[0-9]/.test(e) && !/^-?[0-9]+$/.test(e) && numeric(e, [], {}) !== null;

  function opIntegrar(inp) {
    const v = normVar(inp.v); const P = parseVector(inp.f); A().run('clearall');
    const res = []; const isV = P.vec;
    const hasB = inp.a && inp.a.trim() && inp.b && inp.b.trim();
    const anti = P.comps.map(c => INTEG(c, v));
    if (!hasB) {
      const texs = anti.map(latex);
      const names = isV ? ['C_1', 'C_2', 'C_3'] : ['C'];
      const withC = texs.map((t, k) => (t === '0' ? names[k] : t + ' + ' + names[k]));
      const r = { label: isV ? `\\int \\mathbf{r}(${v})\\,d${v}` : `\\int f(${v})\\,d${v}`, vec: isV, comps: withC };
      if (isV) { r.angle = angle(texs) + ' + \\mathbf{C}'; r.ijk = ijk(texs) + ' + \\mathbf{C}'; } else r.scalar = withC[0];
      res.push(r);
    } else {
      const a = parseScalar(inp.a, 'El límite inferior'), b = parseScalar(inp.b, 'El límite superior');
      const vals = anti.map(F => SIMP(SUB(SUBST(b, v, F), SUBST(a, v, F))));
      res.push(vecResult(isV ? `\\int_{${latex(a)}}^{${latex(b)}} \\mathbf{r}(${v})\\,d${v}` : `\\int_{${latex(a)}}^{${latex(b)}} f(${v})\\,d${v}`, vals, isV));
    }
    return res;
  }

  function opInicial(inp) {
    const v = normVar(inp.v); const P = parseVector(inp.f); A().run('clearall');
    if (!P.vec) throw new Error('La aceleración debe ser un vector.');
    const n = P.comps.length;
    const getVec = (tex, what) => { const q = parseVector(tex, n); if (!q.vec || q.comps.length !== n) throw new Error(what + ' debe ser un vector de ' + n + ' componentes.'); return q.comps; };
    const v0 = getVec(inp.v0, 'v(t₁)'), r0 = getVec(inp.r0, 'r(t₂)');
    const t1 = parseScalar(inp.t1, 't₁'), t2 = parseScalar(inp.t2, 't₂');
    const V = P.comps.map(c => INTEG(c, v));
    const vel = V.map((F, k) => SIMP(ADD(SUB(F, SUBST(t1, v, F)), v0[k])));
    const R = vel.map(c => INTEG(c, v));
    const pos = R.map((F, k) => SIMP(ADD(SUB(F, SUBST(t2, v, F)), r0[k])));
    return [
      vecResult(`\\mathbf{v}(${v})`, vel.map(c => run(`expand(${c})`)), true),
      vecResult(`\\mathbf{r}(${v})`, pos.map(c => run(`expand(${c})`)), true)
    ];
  }

  function opLongitud(inp) {
    const v = normVar(inp.v); const P = parseVector(inp.f); A().run('clearall');
    if (!P.vec) throw new Error('Para la longitud de arco usa una función vectorial.');
    const a = parseScalar(inp.a, 'El límite inferior'), b = parseScalar(inp.b, 'El límite superior');
    const r1 = P.comps.map(c => D(c, v));
    const sp = norm(r1);
    const res = [];
    res.push({ label: `\\lVert\\mathbf{r}'(${v})\\rVert`, vec: false, scalar: latex(sp), comps: [] });
    const aTex = latex(a), bTex = latex(b);
    let exact = null;
    try { const r = run(`defint(${sp},${v},${a},${b})`); if (!/defint\(|integral\(/.test(r)) exact = SIMP(r); } catch (e) { exact = null; }
    const an = numeric(a, [], {}), bn = numeric(b, [], {});
    let approx = null;
    if (an !== null && bn !== null) {
      let f; try { f = compile(sp, [v]); } catch (e) { f = null; }
      if (f) approx = gauss(x => f({ [v]: x }), an, bn, 300);
    }
    const lab = `L=\\int_{${aTex}}^{${bTex}}\\lVert\\mathbf{r}'(${v})\\rVert\\,d${v}`;
    if (exact) {
      const o = { label: lab, vec: false, scalar: latex(exact), comps: [] };
      const en = numeric(exact, [], {}); o.approx = fmt(en !== null ? en : approx);
      res.push(o);
    } else if (approx !== null) {
      res.push({ label: lab, vec: false, scalar: `\\int_{${aTex}}^{${bTex}} ${latex(sp)}\\,d${v}`, approx: fmt(approx), comps: [] });
    } else throw new Error('No se pudo calcular la longitud de arco.');
    return res;
  }

  const cross = (u, w) => [SIMP(SUB(MUL(u[1], w[2]), MUL(u[2], w[1]))), SIMP(SUB(MUL(u[2], w[0]), MUL(u[0], w[2]))), SIMP(SUB(MUL(u[0], w[1]), MUL(u[1], w[0])))];
  const dot = (u, w) => SIMP(u.map((x, k) => `(${x})*(${w[k]})`).join('+'));
  const scale = (u, s) => u.map(x => SIMP(`(${x})/(${s})`));

  function opTNB(inp) {
    const v = normVar(inp.v); const P = parseVector(inp.f); A().run('clearall');
    if (!P.vec) throw new Error('T, N y B necesitan una función vectorial.');
    let comps = P.comps.slice(); while (comps.length < 3) comps.push('0');
    const r1 = comps.map(c => D(c, v)), r2 = r1.map(c => D(c, v));
    const res = [];
    if (inp.t0 && inp.t0.trim()) {
      const t0 = parseScalar(inp.t0, 't₀'); const t0t = latex(t0);
      const ev = c => SIMP(SUBST(t0, v, c));
      const v0 = r1.map(ev), a0 = r2.map(ev);
      const sp = norm(v0);
      if (sp === '0') throw new Error('r\'(t₀) = 0: la curva no es suave en ese punto, T no está definido.');
      const T = scale(v0, sp);
      const va = dot(v0, a0);
      // T' = (a|v|^2 - v (v·a)) / |v|^3
      const Tp = v0.map((x, k) => SIMP(`((${a0[k]})*(${sp})^2-(${x})*(${va}))/(${sp})^3`));
      const nTp = norm(Tp);
      res.push(vecResult(`\\mathbf{r}'(${t0t})`, v0, true));
      res.push({ label: `\\lVert\\mathbf{r}'(${t0t})\\rVert`, vec: false, scalar: latex(sp), comps: [], approx: needsApprox(sp) ? fmt(numeric(sp, [], {})) : null });
      res.push(vecResult(`\\mathbf{T}(${t0t})`, T, true));
      if (nTp === '0') {
        res.push({ label: `\\mathbf{N}(${t0t}),\\ \\mathbf{B}(${t0t})`, vec: false, scalar: '\\text{No definidos: } \\mathbf{T}\'(t_0)=\\mathbf{0}', comps: [] });
      } else {
        const N = scale(Tp, nTp), B = cross(T, N);
        res.push(vecResult(`\\mathbf{N}(${t0t})`, N, true));
        res.push(vecResult(`\\mathbf{B}(${t0t})`, B, true));
        const cv = cross(v0, a0); const kap = SIMP(`${norm(cv)}/(${sp})^3`);
        res.push({ label: `\\kappa(${t0t})`, vec: false, scalar: latex(kap), comps: [], approx: needsApprox(kap) ? fmt(numeric(kap, [], {})) : null });
      }
    } else {
      const sp = norm(r1);
      const T = scale(r1, sp);
      res.push(vecResult(`\\mathbf{r}'(${v})`, r1, true));
      res.push({ label: `\\lVert\\mathbf{r}'(${v})\\rVert`, vec: false, scalar: latex(sp), comps: [] });
      res.push(vecResult(`\\mathbf{T}(${v})`, T, true));
      const Tp = T.map(c => SIMP(D(c, v)));
      const nTp = norm(Tp);
      if (nTp === '0') { res.push({ label: `\\mathbf{N},\\ \\mathbf{B}`, vec: false, scalar: '\\text{No definidos: } \\mathbf{T}\'=\\mathbf{0}', comps: [] }); }
      else {
        const N = scale(Tp, nTp), B = cross(T, N);
        res.push(vecResult(`\\mathbf{N}(${v})`, N, true));
        res.push(vecResult(`\\mathbf{B}(${v})`, B, true));
        const cv = cross(r1, r2.map(c => c)); const kap = SIMP(`${norm(cv)}/(${sp})^3`);
        res.push({ label: `\\kappa(${v})`, vec: false, scalar: latex(kap), comps: [] });
      }
    }
    return res;
  }

  function calculate(mode, inp) {
    switch (mode) {
      case 'der': return opDerivar(inp);
      case 'int': return opIntegrar(inp);
      case 'ini': return opInicial(inp);
      case 'arc': return opLongitud(inp);
      case 'tnb': return opTNB(inp);
    }
    throw new Error('Modo desconocido');
  }

  return { calculate, parseVector, parseScalar, conv, preprocess, latex, compile, run };
})();
if (typeof module !== 'undefined') module.exports = CalcEngine;
