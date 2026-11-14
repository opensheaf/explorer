// Generated from literate/21-text.md by tools/tangle.py: edit the document, not this file.
import { h } from './dom.js';

export function splitMath(s) {
  const parts = [];
  let current = '', math = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '$') {
      current += math ? '\\$' : '$';
      i++;
    } else if (s[i] === '$') {
      if (current || math) parts.push({ text: current, math });
      current = '';
      math = !math;
    } else {
      current += s[i];
    }
  }
  if (math) {
    const last = parts.length && !parts[parts.length - 1].math ? parts.pop().text : '';
    parts.push({ text: last + '$' + current, math: false });
  } else if (current) {
    parts.push({ text: current, math: false });
  }
  return parts;
}

const SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', times: '×', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥',
  neq: '≠', ne: '≠', approx: '≈', sim: '∼', simeq: '≃', equiv: '≡', to: '→', rightarrow: '→',
  leftarrow: '←', Rightarrow: '⇒', mapsto: '↦', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆',
  cup: '∪', cap: '∩', sum: '∑', prod: '∏', int: '∫', oint: '∮', ell: 'ℓ', pm: '±', mp: '∓',
  ldots: '…', dots: '…', cdots: '⋯', otimes: '⊗', oplus: '⊕', langle: '⟨', rangle: '⟩',
  emptyset: '∅', forall: '∀', exists: '∃', hbar: 'ℏ', sqrt: '√', circ: '∘', star: '⋆', ast: '∗',
  wedge: '∧', vee: '∨', neg: '¬', perp: '⊥', parallel: '∥', mid: '∣', ll: '≪', gg: '≫',
  prime: '′', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', dagger: '†', lesssim: '≲', gtrsim: '≳',
};

const BLACKBOARD = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', T: '𝕋', E: '𝔼', P: 'ℙ', H: 'ℍ', S: '𝕊' };
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
                      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', '*': '*', '′': '′' };
const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
                    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎' };

const script = (table, mark) => (_, braced, single) => {
  const body = braced ?? single;
  const chars = [...body];
  if (chars.every((c) => Object.hasOwn(table, c))) return chars.map((c) => table[c]).join('');
  return chars.length === 1 ? mark + body : `${mark}(${body})`;
};

export function readableMath(tex) {
  return tex
    .replace(/\\mathbb\s*\{?\s*([A-Z])\s*\}?/g, (m, c) => (Object.hasOwn(BLACKBOARD, c) ? BLACKBOARD[c] : c))
    .replace(/\\(mathrm|mathbf|mathit|mathsf|mathcal|mathscr|mathfrak|text|textrm|operatorname|boldsymbol)\s*\{([^{}]*)\}/g, '$2')
    .replace(/\\(left|right|big|Big|bigg|Bigg)\b\s*/g, '')
    .replace(/\\[,;:! ]|\\q?quad\b/g, ' ')
    .replace(/\\([A-Za-z]+)\s?/g, (m, name) => (Object.hasOwn(SYMBOLS, name) ? SYMBOLS[name] : m))
    .replace(/\\([{}%&_#])/g, '$1')
    .replace(/\^(?:\{([^{}]*)\}|([^\s{}\\]))/g, script(SUPERSCRIPT, '^'))
    .replace(/_(?:\{([^{}]*)\}|([^\s{}\\]))/g, script(SUBSCRIPT, '_'))
    .replace(/[{}]/g, '');
}

export function rich(s) {
  if (typeof s !== 'string') return [];
  return splitMath(s).map((p) => (p.math
    ? h('span', { class: 'math', title: `$${p.text}$` }, readableMath(p.text))
    : p.text));
}

export function plain(s) {
  if (typeof s !== 'string') return '';
  return splitMath(s).map((p) => (p.math ? readableMath(p.text) : p.text)).join('');
}
