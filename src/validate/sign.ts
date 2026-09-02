/** The sign alphabet: what the materials letter atlas can spell (../materials/CONTRACT.md),
 *  case-insensitive since signs uppercase, and the length its rebrand request accepts.
 *  Every name in a named world holds to it, so signs and screens letter names verbatim. */

export const SIGN_MAX_LENGTH = 32;

const SIGN_PATTERN = /^[A-Za-z0-9 \-.,'!?:/&+]+$/;

/** Trims, collapses whitespace and folds accented letters onto their base letter. */
export function foldForSign(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function spellsOnSign(name: string): boolean {
  return SIGN_PATTERN.test(name) && name.length <= SIGN_MAX_LENGTH;
}
