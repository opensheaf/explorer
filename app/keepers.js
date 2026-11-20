// Generated from literate/27-owner-page.md by opensheaf-literate: edit the document, not this file.
import { OWNER_NAME, orcidValid, isObject } from './names.js';
import { parseJson } from './http.js';
import { localKind } from './resolve.js';

export const KEEPER_FORMAT = 'opensheaf-keeper/0.2';
export const CONFIRMED = 'confirmed', CLAIMED = 'claimed only', NOT_CHECKED = 'not checked';
const KEEPER_LIMIT = 2 ** 20;
const OWNER_WORD = /(?<![a-z0-9])[a-z2-7]{51}[aq](?![a-z0-9])/g;

export function keeperPlace(keeper) {
  const orcid = /^https:\/\/orcid\.org\/([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X])$/.exec(keeper);
  if (orcid) {
    return orcidValid(keeper) ? { kind: 'orcid', url: `https://pub.orcid.org/v3.0/${orcid[1]}/researcher-urls` } : null;
  }
  if (/^https:\/\/[a-z0-9.-]+\/$/.test(keeper)) return { kind: 'domain', url: `${keeper}.well-known/opensheaf` };
  return null;
}

export async function checkKeeper(http, keeper, owner, { signal } = {}) {
  const answer = (status, reason, successors = []) => ({ status, reason, successors });
  const place = keeperPlace(keeper);
  if (!place) return answer(NOT_CHECKED, 'the keeper is neither an ORCID iD nor a domain (section 6.6)');
  const local = localKind(new URL(place.url).hostname);
  if (local) return answer(NOT_CHECKED, `the keeper's domain is ${local}, which the explorer does not read`);
  const missing = place.kind === 'orcid' ? 'the ORCID registry has no record of this iD'
    : 'the keeper\'s domain has no file /.well-known/opensheaf';
  let data;
  try {
    const bytes = await http.request(place.url, { limit: KEEPER_LIMIT, signal,
      headers: place.kind === 'orcid' ? { Accept: 'application/json' } : undefined });
    data = parseJson(bytes, place.url);
  } catch (error) {
    if (error?.kind === 'aborted') throw error;
    if (error?.kind === 'not-found') return answer(CLAIMED, missing);
    if (error?.kind === 'json' || error?.kind === 'html' || error?.kind === 'too-large') {
      return answer(CLAIMED, `${place.url} is not a keeper's confirmation (${error.detail})`);
    }
    return answer(NOT_CHECKED, error?.detail || String(error?.message || error));
  }
  return place.kind === 'orcid' ? fromOrcid(data, owner, answer) : fromDomain(data, owner, answer, place.url);
}

function fromOrcid(data, owner, answer) {
  if (!isObject(data) || !Array.isArray(data['researcher-url'])) {
    return answer(NOT_CHECKED, 'the ORCID registry did not answer with the links of the record');
  }
  for (const r of data['researcher-url']) {
    const words = typeof r?.url?.value === 'string' ? r.url.value.match(OWNER_WORD) || [] : [];
    if (words[0] !== owner) continue;
    const next = words.slice(1).find((w) => w !== owner);
    return answer(CONFIRMED, 'a link of the ORCID record names this owner', next ? [next] : []);
  }
  return answer(CLAIMED, 'no link of the ORCID record names this owner');
}

function fromDomain(data, owner, answer, url) {
  if (!isObject(data) || data.format !== KEEPER_FORMAT || !Array.isArray(data.owners)) {
    return answer(CLAIMED, `${url} is not a keeper's file of format ${KEEPER_FORMAT}`);
  }
  if (!data.owners.includes(owner)) return answer(CLAIMED, `${url} does not list this owner`);
  const succ = isObject(data.successors) && Object.hasOwn(data.successors, owner) ? data.successors[owner] : null;
  return answer(CONFIRMED, `${url} lists this owner`,
    typeof succ === 'string' && OWNER_NAME.test(succ) && succ !== owner ? [succ] : []);
}
