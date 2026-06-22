/**
 * Section markers — système d'attribution de lignes aux participants.
 *
 * Format d'un marqueur dans le Y.Text partagé :
 *   ⟨42⟩\n        ← ligne contenant uniquement le clientID encadré
 *
 * Lecture :
 *   ⟨42⟩
 *   contenu de l'utilisateur 42
 *   sur plusieurs lignes
 *   ⟨18⟩
 *   contenu de l'utilisateur 18
 *
 * Rendu visuel via CodeMirror Decoration : la ligne marqueur est remplacée
 * par un chip coloré "Renard #42" (couleur de l'auteur).
 *
 * Règle d'ownership : toute ligne située après un marqueur ⟨X⟩ et avant le
 * marqueur suivant appartient à X. Les autres ne peuvent ni l'éditer ni la
 * supprimer.
 */

import { EditorState, StateField, RangeSetBuilder, Prec, Facet } from '@codemirror/state';
import type { Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

/* ── Format constants ─────────────────────────────────────── */

// Utilise Unicode Private Use Area — caractères non typables au clavier,
// rendant l'usurpation de marqueur quasi-impossible (vs ⟨ ⟩ qui sont sur AltGr).
export const MARK_OPEN  = '';
export const MARK_CLOSE = '';
// Une ligne marqueur est strictement OPEN + digits + CLOSE (rien d'autre).
export const MARK_LINE_RE = new RegExp(`^${MARK_OPEN}(\\d+)${MARK_CLOSE}$`);
// Détection multi-ligne — utilisée pour sanitization des inserts (paste)
const MARK_ANYLINE_RE = new RegExp(`(^|\\n)${MARK_OPEN}\\d+${MARK_CLOSE}(\\n|$)`);

export function makeMark(clientId: number): string {
  return `${MARK_OPEN}${clientId}${MARK_CLOSE}`;
}

/* ── Author resolver — injecté dans EditorState via facet ────── */

export interface AuthorInfo { id: number; name: string; color: string; }
export type AuthorResolver = (clientId: number) => AuthorInfo;

/* ── Section parsing ────────────────────────────────────── */

export interface Section {
  authorId: number;
  /** Position début de la ligne marqueur. */
  markFrom: number;
  /** Position fin de la ligne marqueur (avant le \n). */
  markTo:   number;
  /** Position début du contenu owned (après le \n du marqueur). */
  contentFrom: number;
  /** Position fin de la section (= début du prochain marqueur ou doc.length). */
  contentTo:   number;
}

export function parseSections(doc: Text): Section[] {
  const sections: Section[] = [];
  let pending: Omit<Section, 'contentTo'> | null = null;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const m = MARK_LINE_RE.exec(line.text);
    if (m) {
      if (pending) sections.push({ ...pending, contentTo: line.from });
      pending = {
        authorId:    Number(m[1]),
        markFrom:    line.from,
        markTo:      line.to,
        contentFrom: line.to + 1 > doc.length ? doc.length : line.to + 1,
      };
    }
  }
  if (pending) sections.push({ ...pending, contentTo: doc.length });
  return sections;
}

/**
 * Renvoie la section qui possède la position pos, ou null si zone "no man's land".
 * Parcourt à l'envers : la section qui possède pos est celle avec le plus grand
 * markFrom inférieur ou égal à pos. Évite l'ambiguïté aux bords entre sections
 * consécutives (contentTo de N == markFrom de N+1).
 */
export function sectionAt(sections: Section[], pos: number): Section | null {
  for (let i = sections.length - 1; i >= 0; i--) {
    if (pos >= sections[i].markFrom) return sections[i];
  }
  return null;
}

/* ── StateField — recalcule les sections à chaque changement de doc ─── */

export const sectionsField = StateField.define<Section[]>({
  create: (state) => parseSections(state.doc),
  update: (sections, tr) => tr.docChanged ? parseSections(tr.newDoc) : sections,
});

/* ── ViewPlugin — produit les Decorations à partir du sectionsField ───
 *
 * Approche : 100% Decoration.line. Aucun WidgetType / Decoration.replace.
 * Les block widgets et inline replacements corrompaient le tile tree de
 * CodeMirror (erreurs "No tile at position N" sur coordsAt/scrollIntoView).
 *
 * Ligne marqueur : on attache une classe + data-attrs et le CSS render
 * le chip via ::before (font-size: 0 cache les chars PUA du marqueur).
 */
export function sectionDecorations(myClientId: number, resolveAuthor: AuthorResolver) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(_u: ViewUpdate) {
      // Rebuild sur TOUTE update : couvre les transactions vides issues du
      // refresh authors Y.Map (view.dispatch({}) sans docChanged).
      this.decorations = this.build(_u.view);
    }
    build(view: EditorView): DecorationSet {
      const sections = view.state.field(sectionsField, false) ?? [];
      const b = new RangeSetBuilder<Decoration>();
      for (const s of sections) {
        const info = resolveAuthor(s.authorId);
        const isMe = s.authorId === myClientId;
        // Seulement le chip header sur la ligne marqueur — pas de styling
        // sur les lignes de contenu. Approche minimale : seul le curseur
        // distant identifie qui écrit où.
        b.add(s.markFrom, s.markFrom, Decoration.line({
          attributes: {
            class: 'cm-marker-line ' + (isMe ? 'cm-marker-mine' : 'cm-marker-other'),
            style: `--author-color: ${info.color};`,
            'data-author-name': info.name,
            'data-author-tag':  isMe ? 'toi' : 'verrouillé',
          },
        }));
      }
      return b.finish();
    }
  }, { decorations: v => v.decorations });
}

/* ── Transaction filter — ENFORCEMENT ownership ───────────── */

/**
 * Règles appliquées :
 * 1. Skip transactions remote Y.js (pas de userEvent) — sinon collab cassé.
 * 2. Suppression touchant la ligne MARQUEUR (même la sienne) → bloquée.
 * 3. Modification (ins/del) dans une section qui n'est pas la nôtre OU dans
 *    un no-man's-land → REDIRECT : on annule, on insère le texte tapé à la
 *    fin du doc dans une nouvelle section à nous (ou append si dernière est
 *    déjà à nous).
 * 4. Insert contenant un faux marqueur (paste) → on remplace OPEN/CLOSE
 *    par un espace pour neutraliser sans perdre le contenu.
 * 5. Modification dans notre propre section → autorisée.
 */
export function ownershipFilter(myClientId: number, opts: { onBlocked?: (foreignName: string) => void } = {}) {
  return Prec.highest(EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;

    // Fix #1 — Skip transactions non issues d'une action utilisateur locale.
    // y-codemirror.next dispatch les updates remote sans userEvent ; les laisser
    // passer évite que notre filter ne re-redirige les changements des autres.
    // On filtre aussi seulement input/delete (pas undo/redo qui restaurent un état).
    const isInput  = tr.isUserEvent('input');
    const isDelete = tr.isUserEvent('delete');
    if (!isInput && !isDelete) return tr;

    const startSections = tr.startState.field(sectionsField, false) ?? [];
    let needsRedirect = false;
    let blockedAuthorId: number | null = null;
    let insertedText = '';

    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      // 2. Touche un marqueur ?
      for (const s of startSections) {
        const touchesMark = !(toA < s.markFrom || fromA > s.markTo);
        if (touchesMark) {
          needsRedirect = true;
          blockedAuthorId = s.authorId;
          insertedText += inserted.toString();
          return;
        }
      }
      // 3. Owner check
      const ownerAtFrom = sectionAt(startSections, fromA);
      const ownerAtTo   = sectionAt(startSections, toA);
      const fromMine = ownerAtFrom?.authorId === myClientId;
      const toMine   = ownerAtTo?.authorId   === myClientId;
      const noSection = ownerAtFrom === null && ownerAtTo === null;

      if (noSection) {
        needsRedirect = true;
        insertedText += inserted.toString();
        return;
      }
      if (!fromMine || !toMine) {
        needsRedirect = true;
        blockedAuthorId = (ownerAtFrom?.authorId ?? ownerAtTo?.authorId) ?? null;
        insertedText += inserted.toString();
        return;
      }
    });

    // 4. Sanitization : neutralise les marqueurs collés/tapés dans l'insertion.
    //    Remplace OPEN/CLOSE par un espace pour casser le pattern sans
    //    perdre l'intention du texte.
    const sanitize = (s: string) => s.replace(new RegExp(MARK_OPEN, 'g'), ' ').replace(new RegExp(MARK_CLOSE, 'g'), ' ');

    if (!needsRedirect) {
      // Pas de redirect — mais on doit quand même vérifier si l'insertion locale
      // (dans ma section) ne contient pas de marqueur usurpé (paste).
      let needsSanitize = false;
      tr.changes.iterChanges((_fA, _tA, _fB, _tB, inserted) => {
        if (MARK_ANYLINE_RE.test(inserted.toString())) needsSanitize = true;
      });
      if (!needsSanitize) return tr;

      // Rebuild la transaction avec sanitization — retourne un TransactionSpec
      // (PAS Transaction — transactionFilter ignore les Transaction retournés)
      const newChanges: { from: number; to: number; insert: string }[] = [];
      tr.changes.iterChanges((fromA, toA, _fB, _tB, inserted) => {
        newChanges.push({ from: fromA, to: toA, insert: sanitize(inserted.toString()) });
      });
      return [{
        changes:        newChanges,
        selection:      tr.selection,
        scrollIntoView: tr.scrollIntoView,
      }];
    }

    // Notif côté UI
    if (blockedAuthorId !== null && opts.onBlocked) {
      const resolver = tr.startState.facet(authorResolverFacet);
      const info = resolver?.(blockedAuthorId);
      opts.onBlocked(info?.name ?? `Utilisateur #${blockedAuthorId}`);
    }

    // Construit une nouvelle transaction : insère à la fin du doc, dans NOTRE section.
    const lastSection = startSections[startSections.length - 1];
    const myMark = makeMark(myClientId);
    const docEnd = tr.startState.doc.length;
    const cleanInserted = sanitize(insertedText || '');

    let insertStr: string;
    let cursorOffset: number;

    if (lastSection && lastSection.authorId === myClientId) {
      // Append dans la dernière ligne de ma section — avec trailing \n.
      // CRITIQUE : si le doc ne se termine pas par \n, on insère le \n
      // séparateur AVANT le contenu pour ne pas coller à la ligne précédente
      // (cas notamment où la dernière ligne est le marqueur lui-même sans \n).
      const endsWithNl = docEnd > 0 && tr.startState.doc.sliceString(docEnd - 1, docEnd) === '\n';
      const prefix = endsWithNl ? '' : '\n';
      insertStr = prefix + cleanInserted + '\n';
      cursorOffset = docEnd + prefix.length + cleanInserted.length;
    } else {
      // Fix #3 — leading \n si nécessaire + trailing \n pour résister aux races concurrentes
      const needsLeadingNl = docEnd > 0 && tr.startState.doc.sliceString(docEnd - 1, docEnd) !== '\n';
      const lead = needsLeadingNl ? '\n' : '';
      insertStr = lead + myMark + '\n' + cleanInserted + '\n';
      cursorOffset = docEnd + lead.length + myMark.length + 1 + cleanInserted.length;
    }

    return [{
      changes:        { from: docEnd, to: docEnd, insert: insertStr },
      selection:      { anchor: cursorOffset },
      scrollIntoView: false,
    }];
  }));
}

/* ── Facet exposant le resolver (utilisé dans le filter) ─── */

export const authorResolverFacet = Facet.define<AuthorResolver, AuthorResolver | null>({
  combine: (vals) => vals.length ? vals[0] : null,
});
