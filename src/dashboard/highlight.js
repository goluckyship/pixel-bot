// GitHub-style code colours for the Code page, done on the server (the
// dashboard runs no scripts in your browser). Returns one HTML string per line.
const { esc } = require('./html');

const KEYWORDS = new Set('const let var function return if else for while do switch case break continue new try catch finally throw async await class extends of in typeof instanceof delete void yield import export from default static get set'.split(' '));
const LITERALS = new Set('true false null undefined this super NaN Infinity'.split(' '));
const REGEX_BEFORE = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

/** Splits JavaScript (or JSON) into [className, text] pieces. */
function tokensJs(src) {
  const out = [];
  let i = 0;
  let lastSig = ''; // last meaningful token, to tell a regex from a divide sign
  const push = (cls, text) => { out.push([cls, text]); if (cls !== 'c' && text.trim()) lastSig = text.trim().slice(-1) === text.trim() ? text.trim() : text.trim(); };

  function template() { // at a backtick
    let start = i;
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        out.push(['s', src.slice(start, i)]);
        out.push(['p', '${']);
        i += 2;
        code(1);
        out.push(['p', '}']);
        i++;
        start = i;
        continue;
      }
      i++;
    }
    i++;
    out.push(['s', src.slice(start, i)]);
    lastSig = '`';
  }

  function code(depth) { // stops at the } that closes a ${ when depth > 0
    let braces = 0;
    while (i < src.length) {
      const ch = src[i];
      const two = src.slice(i, i + 2);
      if (depth && ch === '}' && braces === 0) return;
      if (two === '//') { const end = src.indexOf('\n', i); const j = end < 0 ? src.length : end; out.push(['c', src.slice(i, j)]); i = j; continue; }
      if (two === '/*') { const end = src.indexOf('*/', i + 2); const j = end < 0 ? src.length : end + 2; out.push(['c', src.slice(i, j)]); i = j; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== ch && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        j++;
        const text = src.slice(i, j);
        const isKey = /^\s*:/.test(src.slice(j, j + 5));
        push(isKey ? 'k' : 's', text);
        i = j;
        continue;
      }
      if (ch === '`') { template(); continue; }
      if (ch === '/' && (REGEX_BEFORE.has(lastSig) || lastSig === '' || lastSig === 'return' || lastSig === 'typeof')) {
        let j = i + 1; let inClass = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        if (src[j] === '/') {
          j++;
          while (/[a-z]/i.test(src[j] ?? '')) j++;
          push('r', src.slice(i, j));
          i = j;
          continue;
        }
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
        const m = /^(0[xob][0-9a-f_]+n?|[0-9][0-9_]*\.?[0-9_]*(e[+-]?[0-9]+)?n?|\.[0-9]+)/i.exec(src.slice(i));
        push('n', m[0]);
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const word = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))[0];
        const after = src.slice(i + word.length).match(/^\s*(\()?/)[1];
        const prev = src.slice(0, i).trimEnd().slice(-1);
        let cls = '';
        if (KEYWORDS.has(word) && prev !== '.') cls = 'kw';
        else if (LITERALS.has(word)) cls = 'n';
        else if (after) cls = 'f';
        else if (/^[A-Z][A-Z0-9_]{2,}$/.test(word)) cls = 'n';
        else if (/^[A-Z]/.test(word) && prev !== '.') cls = 't';
        else if (prev === '.') cls = 'pr';
        push(cls, word);
        lastSig = word;
        i += word.length;
        continue;
      }
      if (ch === '{') braces++;
      if (ch === '}') braces--;
      if (/\s/.test(ch)) { const m = /^\s+/.exec(src.slice(i))[0]; out.push(['', m]); i += m.length; continue; }
      const op = /^(=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?=?|\?\.|\.\.\.|\+\+|--|[+\-*/%]=?|[=<>!&|^~?:])/.exec(src.slice(i));
      if (op) { push('o', op[0]); i += op[0].length; continue; }
      push('', ch);
      i++;
    }
  }
  code(0);
  return out;
}

/** Simple rules for Markdown, .bat and other files. */
function tokensLines(src, lang) {
  const out = [];
  for (const [n, line] of src.split('\n').entries()) {
    if (n) out.push(['', '\n']);
    const t = line.trim();
    if (lang === 'md') {
      if (/^#{1,6}\s/.test(t)) out.push(['h', line]);
      else if (/^```/.test(t)) out.push(['c', line]);
      else out.push(...line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).map((part) => [part.startsWith('`') ? 's' : part.startsWith('**') ? 'b' : part.startsWith('[') ? 'f' : '', part]));
    } else if (lang === 'bat') {
      if (/^(rem\b|::)/i.test(t)) out.push(['c', line]);
      else out.push(...line.split(/(\b(?:echo|set|if|else|goto|call|exit|not|exist|errorlevel|start|cd|pause|setlocal|endlocal|for|do|in)\b|%[^%\s]+%|"[^"]*"|^\s*:\w+)/i).map((part) => [/^"/.test(part) ? 's' : /^%/.test(part) ? 'n' : /^\s*:\w+$/.test(part) ? 'f' : /^[a-z]+$/i.test(part) && part.length > 1 && /^(echo|set|if|else|goto|call|exit|not|exist|errorlevel|start|cd|pause|setlocal|endlocal|for|do|in)$/i.test(part) ? 'kw' : '', part]));
    } else if (lang === 'css') {
      out.push(...line.split(/(\/\*.*?\*\/|"[^"]*"|'[^']*'|#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|%|em|rem|s|ms|vh|vw|deg|fr)?\b|[\w-]+(?=\s*:(?!:))|@[\w-]+|!important)/).map((part) => [
        /^\/\*/.test(part) ? 'c' : /^["']/.test(part) ? 's' : /^#[0-9a-f]{3,8}$/i.test(part) || /^-?\d*\.?\d/.test(part) ? 'n' : /^@|^!important$/.test(part) ? 'kw' : /^[\w-]+$/.test(part) && /^\s*:/.test(line.slice(line.indexOf(part) + part.length)) ? 'k' : '', part]));
    } else if (lang === 'markup') {
      out.push(...line.split(/(<!--.*?-->|<\/?[\w:-]+|\/?>|[\w:-]+(?==)|"[^"]*")/).map((part) => [/^<!--/.test(part) ? 'c' : /^<\/?[\w]/.test(part) || /^\/?>$/.test(part) ? 'kw' : /^"/.test(part) ? 's' : /^[\w:-]+$/.test(part) ? 'k' : '', part]));
    } else if (/^#/.test(t)) {
      out.push(['c', line]);
    } else {
      const m = /^(\s*[A-Za-z_][\w.]*)(=)(.*)$/.exec(line);
      out.push(...(m ? [['k', m[1]], ['o', m[2]], ['s', m[3]]] : [['', line]]));
    }
  }
  return out;
}

const langOf = (file) => (/\.(js|json)$/i.test(file) ? 'js' : /\.md$/i.test(file) ? 'md' : /\.bat$/i.test(file) ? 'bat' : /\.css$/i.test(file) ? 'css' : /\.(svg|html)$/i.test(file) ? 'markup' : 'text');

/** HTML for each line, with colour spans closed and reopened at line breaks. */
function highlight(text, file) {
  const lang = langOf(file);
  let tokens;
  try { tokens = lang === 'js' ? tokensJs(text) : tokensLines(text, lang); } catch { tokens = [['', text]]; }
  const lines = [''];
  for (const [cls, piece] of tokens) {
    piece.split('\n').forEach((part, k) => {
      if (k) lines.push('');
      if (part) lines[lines.length - 1] += cls ? `<span class="${cls}">${esc(part)}</span>` : esc(part);
    });
  }
  return lines;
}

module.exports = { highlight, tokensJs };
