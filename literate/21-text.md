Mathematics as plain text
=========================

Titles and abstracts are plain text in which mathematics may be written in
LaTeX between single dollar signs (`$\Phi^4_3$`), a literal dollar sign
being written `\$` (section 4.4), using only the commands of LaTeX
with `amsmath` and `amssymb`, which common renderers display; a reader
without a renderer is left with readable LaTeX. The explorer does not load a
renderer such as MathJax (it loads nothing from elsewhere), so it makes
the LaTeX a little more readable instead: Greek letters and common symbols
become their Unicode characters, `\mathbb{R}` becomes ℝ, simple
superscripts and subscripts of digits and signs become superscript and
subscript characters (those of letters are missing from many fonts),
and the commands it does not know are left as they are. The mathematics
is set apart in italics, so that a reader sees where it is. A renderer can
be added later in this one place.

The module is `app/text.js`. It is used only to make text: its result is
put in the page as text nodes.

    // in app/text.js:
    import { h } from './dom.js';

    <<splitting text and mathematics>>

    <<the symbols known>>

    <<mathematics made readable>>

    <<text with mathematics, as elements>>

Splitting
---------

The text is read once, character by character: `\$` is a dollar sign, an
unescaped `$` opens or closes mathematics. A `$` left open at the end was
not mathematics, and is given back as text.

    // in splitting text and mathematics:
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

The symbols
-----------

The commands of `amsmath` and `amssymb` that occur most in titles and
abstracts, with their characters.

    // in the symbols known:
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

Making it readable
------------------

A few rewritings, in order: fonts (`\mathbb{R}`, `\mathrm{d}`), spacing
commands and `\left`/`\right`, which have nothing to show; the known
commands (looked up with `Object.hasOwn`: a title writing `$\constructor$`
must not get the text of a JavaScript function); then superscripts and subscripts, as characters when every
character has a superscript or subscript form, and otherwise as `^(...)`
and `_(...)`; finally the braces left over, which only grouped.

Titles come from the archive, which may be hostile, so every pattern must
run in time linear in the text: no pattern has two unbounded repetitions
that can match the same characters one after the other (`\s*\{?\s*` would
try every way of splitting a run of spaces between its two halves, and a
title of `\mathbb` followed by a million spaces would hold the page for
hours). Mathematics longer than `MAX_MATH` characters is not rewritten at
all: no real formula in a title is that long.

    // in mathematics made readable:
    const MAX_MATH = 2000;

    const script = (table, mark) => (_, braced, single) => {
      const body = braced ?? single;
      const chars = [...body];
      if (chars.every((c) => Object.hasOwn(table, c))) return chars.map((c) => table[c]).join('');
      return chars.length === 1 ? mark + body : `${mark}(${body})`;
    };

    export function readableMath(tex) {
      if (tex.length > MAX_MATH) return tex;
      return tex
        .replace(/\\mathbb\s*(?:\{\s*)?([A-Z])\s*\}?/g, (m, c) => (Object.hasOwn(BLACKBOARD, c) ? BLACKBOARD[c] : c))
        .replace(/\\(mathrm|mathbf|mathit|mathsf|mathcal|mathscr|mathfrak|text|textrm|operatorname|boldsymbol)\s*\{([^{}]*)\}/g, '$2')
        .replace(/\\(left|right|big|Big|bigg|Bigg)\b\s*/g, '')
        .replace(/\\[,;:! ]|\\q?quad\b/g, ' ')
        .replace(/\\([A-Za-z]+)\s?/g, (m, name) => (Object.hasOwn(SYMBOLS, name) ? SYMBOLS[name] : m))
        .replace(/\\([{}%&_#])/g, '$1')
        .replace(/\^(?:\{([^{}]*)\}|([^\s{}\\]))/g, script(SUPERSCRIPT, '^'))
        .replace(/_(?:\{([^{}]*)\}|([^\s{}\\]))/g, script(SUBSCRIPT, '_'))
        .replace(/[{}]/g, '');
    }

As elements
-----------

The text becomes a list of text nodes and `<span class="math">` elements
holding the readable mathematics, with the LaTeX as written in the
tooltip, for the reader who wants it.

    // in text with mathematics, as elements:
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
