// Generated from literate/12-schema.md by tools/tangle.py: edit the document, not this file.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function same(a, b) {
  return canonical(a) === canonical(b);
}

const URI_CHAR = "[A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%]";
const URI = new RegExp(`^[A-Za-z][A-Za-z0-9+.\\-]*:${URI_CHAR}*$`);
const URI_REFERENCE = new RegExp(`^${URI_CHAR}*$`);
const PERCENT_OK = (s) => !/%(?![0-9A-Fa-f]{2})/.test(s);

export const FORMATS = {
  date(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number);
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    return days !== undefined && d >= 1 && d <= days;
  },
  uri: (s) => URI.test(s) && PERCENT_OK(s),
  'uri-reference': (s) => URI_REFERENCE.test(s) && PERCENT_OK(s),
};

function show(value) {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? text.slice(0, 57) + '...' : text;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function hasType(type, value) {
  const t = typeOf(value);
  return type === t || (type === 'number' && t === 'integer');
}

function describeNot(schema) {
  const names = (s) => s?.required || [];
  const forbidden = [...names(schema), ...(schema?.anyOf || []).flatMap(names)];
  return forbidden.length ? `must not have ${forbidden.join(', ')}` : 'is valid under a schema it must not match';
}

function check(s, v, path, root, errors) {
  if (s === true || s === undefined) return;
  if (s === false) {
    errors.push({ path, message: 'is not allowed' });
    return;
  }
  const fail = (message) => errors.push({ path, message });
  if (typeof s.$ref === 'string') check(resolveRef(root, s.$ref), v, path, root, errors);
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => hasType(t, v))) {
      fail(`${show(v)} is not of type ${types.join(' or ')}`);
      return;
    }
  }
  if ('const' in s && !same(s.const, v)) fail(`${show(v)} should be ${show(s.const)}`);
  if (s.enum && !s.enum.some((e) => same(e, v))) fail(`${show(v)} is not one of ${show(s.enum)}`);
  if (typeof v === 'string') {
    const length = [...v].length;
    if (s.minLength !== undefined && length < s.minLength) fail(`${show(v)} is shorter than ${s.minLength}`);
    if (s.maxLength !== undefined && length > s.maxLength) fail(`${show(v)} is longer than ${s.maxLength}`);
    if (s.pattern !== undefined && !pattern(s.pattern).test(v)) fail(`${show(v)} does not match ${s.pattern}`);
    if (s.format !== undefined && FORMATS[s.format] && !FORMATS[s.format](v)) fail(`${show(v)} is not a valid ${s.format}`);
  }
  if (typeof v === 'number' && s.minimum !== undefined && v < s.minimum) fail(`${v} is less than ${s.minimum}`);
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) fail(`has fewer than ${s.minItems} items`);
    if (s.uniqueItems && new Set(v.map(canonical)).size !== v.length) fail('has repeated items');
    if (s.items !== undefined) v.forEach((item, k) => check(s.items, item, `${path}/${k}`, root, errors));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const name of s.required || []) {
      if (!(name in v)) fail(`${JSON.stringify(name)} is a required property`);
    }
    const props = s.properties || {};
    for (const [name, value] of Object.entries(v)) {
      const where = `${path}/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
      if (name in props) check(props[name], value, where, root, errors);
      else if (s.additionalProperties !== undefined) check(s.additionalProperties, value, where, root, errors);
      if (s.propertyNames !== undefined) {
        for (const e of collect(s.propertyNames, name, root)) {
          errors.push({ path: where, message: `the name ${e.message}` });
        }
      }
    }
    for (const [name, needed] of Object.entries(s.dependentRequired || {})) {
      if (name in v) {
        for (const other of needed) {
          if (!(other in v)) fail(`${JSON.stringify(other)} is required with ${JSON.stringify(name)}`);
        }
      }
    }
  }
  for (const sub of s.allOf || []) check(sub, v, path, root, errors);
  if (s.anyOf && !s.anyOf.some((sub) => isValid(sub, v, root))) {
    const reasons = s.anyOf.map((sub) => collect(sub, v, root)[0]).filter(Boolean)
      .map((e) => (e.path ? `${e.path}: ` : '') + e.message);
    fail(`satisfies none of the alternatives (${reasons.join('; or ')})`);
  }
  if (s.not !== undefined && isValid(s.not, v, root)) fail(describeNot(s.not));
  if (s.if !== undefined) {
    if (isValid(s.if, v, root)) {
      if (s.then !== undefined) check(s.then, v, path, root, errors);
    } else if (s.else !== undefined) {
      check(s.else, v, path, root, errors);
    }
  }
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#')) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(1).split('/').filter(Boolean)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => node?.[key], root);
}

export function validate(schema, data) {
  const errors = [];
  check(schema, data, '', schema, errors);
  return errors;
}

function isValid(schema, data, root) {
  const errors = [];
  check(schema, data, '', root, errors);
  return errors.length === 0;
}

const patterns = new Map();
function pattern(source) {
  if (!patterns.has(source)) patterns.set(source, new RegExp(source, 'u'));
  return patterns.get(source);
}

function collect(schema, data, root) {
  const errors = [];
  check(schema, data, '', root, errors);
  return errors;
}

export const SCHEMA_FILES = {
  'opensheaf-archive/0.1': 'opensheaf-archive-0.1.schema.json',
  'opensheaf-object/0.1': 'opensheaf-object-0.1.schema.json',
  'opensheaf-collection/0.1': 'opensheaf-collection-0.1.schema.json',
};

export async function loadSchemas(read) {
  const schemas = {};
  for (const [format, file] of Object.entries(SCHEMA_FILES)) {
    schemas[format] = await read(new URL(`../schemas/${file}`, import.meta.url));
  }
  return schemas;
}

export async function fetchSchemas() {
  return loadSchemas(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`cannot read the schema ${url}`);
    return response.json();
  });
}
