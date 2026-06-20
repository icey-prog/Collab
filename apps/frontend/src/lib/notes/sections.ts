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
import { Decoration, EditorView, WidgetType, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

/* ── Format constants ─────────────────────────────────────── */

export const MARK_OPEN  = '⟨';
export const MARK_CLOSE = '⟩';
// Une ligne marqueur est strictement `⟨N⟩` (rien d'autre sur la ligne).
export const MARK_LINE_RE = /^⟨(\d+)⟩$/;

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

/** Renvoie la section qui possède la position pos, ou null si zone "no man's land" (avant tout marqueur). */
export function sectionAt(sections: Section[], pos: number): Section | null {
  for (const s of sections) {
    if (pos >= s.markFrom && pos <= s.contentTo) return s;
  }
  return null;
}

/* ── StateField — recalcule les sections à chaque changement de doc ─── */

export const sectionsField = StateField.define<Section[]>({
  create: (state) => parseSections(state.doc),
  update: (sections, tr) => tr.docChanged ? parseSections(tr.newDoc) : sections,
});

/* ── Widget — chip coloré rendu à la place du marqueur ─── */

class AuthorChipWidget extends WidgetType {
  constructor(readonly author: AuthorInfo, readonly isMe: boolean) { super(); }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-author-chip' + (this.isMe ? ' cm-author-chip--me' : '');
    wrap.style.setProperty('--author-color', this.author.color);

    const dot = document.createElement('span');
    dot.className = 'cm-author-chip-dot';

    const name = document.createElement('span');
    name.className = 'cm-author-chip-name';
    name.textContent = this.author.name;

    const tag = document.createElement('span');
    tag.className = 'cm-author-chip-tag';
    tag.textContent = this.isMe ? 'toi' : 'verrouillé';

    wrap.append(dot, name, tag);
    return wrap;
  }
  eq(other: AuthorChipWidget): boolean {
    return other.author.id === this.author.id && other.author.name === this.author.name
        && other.author.color === this.author.color && other.isMe === this.isMe;
  }
  ignoreEvent() { return false; }
}

/* ── ViewPlugin — produit les Decorations à partir du sectionsField ─── */

export function sectionDecorations(myClientId: number, resolveAuthor: AuthorResolver) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const sections = view.state.field(sectionsField, false) ?? [];
      const b = new RangeSetBuilder<Decoration>();
      for (const s of sections) {
        const info = resolveAuthor(s.authorId);
        const isMe = s.authorId === myClientId;
        // Remplace la ligne marqueur par un widget
        b.add(s.markFrom, s.markTo, Decoration.replace({
          widget: new AuthorChipWidget(info, isMe),
          block:  true,
        }));
        // Marque les lignes du contenu pour styling
        if (s.contentFrom < s.contentTo) {
          let pos = s.contentFrom;
          while (pos < s.contentTo) {
            const line = view.state.doc.lineAt(pos);
            b.add(line.from, line.from, Decoration.line({
              attributes: {
                class: 'cm-author-line' + (isMe ? ' cm-author-line--me' : ' cm-author-line--other'),
                style: `--author-color: ${info.color};`,
              },
            }));
            pos = line.to + 1;
          }
        }
      }
      return b.finish();
    }
  }, { decorations: v => v.decorations });
}

/* ── Transaction filter — ENFORCEMENT ownership ───────────── */

/**
 * Règles appliquées :
 * 1. Une modification (insertion ou suppression) dans une section qui n'est pas
 *    la nôtre → REDIRECT : on annule la modif, et on crée une nouvelle section à
 *    la fin du doc avec le texte tapé.
 * 2. Une modification dans une zone sans section (avant tout marqueur) →
 *    on prépend un marqueur ⟨moi⟩ + \n avant le contenu.
 * 3. Une suppression qui touche la ligne MARQUEUR (peu importe l'auteur) →
 *    bloquée (sinon on perd l'ownership).
 * 4. Une modification dans notre propre section → autorisée telle quelle.
 */
export function ownershipFilter(myClientId: number, opts: { onBlocked?: (foreignName: string) => void } = {}) {
  return Prec.highest(EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;

    const startSections = tr.startState.field(sectionsField, false) ?? [];
    let needsRedirect = false;
    let blockedAuthorId: number | null = null;
    let insertedText = '';

    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      // 3. Touche un marqueur ?
      for (const s of startSections) {
        const touchesMark = !(toA < s.markFrom || fromA > s.markTo);
        if (touchesMark) {
          // bloque tout simplement
          needsRedirect = true;
          blockedAuthorId = s.authorId;
          insertedText = inserted.toString();
          return;
        }
      }
      // 1+2. Owner check
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

    if (!needsRedirect) return tr;

    // Notif côté UI
    if (blockedAuthorId !== null && opts.onBlocked) {
      const resolver = tr.startState.facet(authorResolverFacet);
      const info = resolver?.(blockedAuthorId);
      opts.onBlocked(info?.name ?? `Utilisateur #${blockedAuthorId}`);
    }

    // Construit une nouvelle transaction : insère à la fin du doc, dans NOTRE section.
    // Si la dernière section du doc est déjà la nôtre, on append ; sinon on ouvre une nouvelle section.
    const lastSection = startSections[startSections.length - 1];
    const myMark = makeMark(myClientId);
    const docEnd = tr.startState.doc.length;

    let insertStr: string;
    let cursorOffset: number;
    if (lastSection && lastSection.authorId === myClientId) {
      // Append dans la dernière ligne de ma section
      const lastLineHasContent = lastSection.contentTo > lastSection.contentFrom;
      insertStr = (lastLineHasContent ? '\n' : '') + (insertedText || '');
      cursorOffset = docEnd + insertStr.length;
    } else {
      const needsLeadingNl = docEnd > 0 && tr.startState.doc.sliceString(docEnd - 1, docEnd) !== '\n';
      insertStr = (needsLeadingNl ? '\n' : '') + myMark + '\n' + (insertedText || '');
      cursorOffset = docEnd + insertStr.length;
    }

    return tr.startState.update({
      changes:   { from: docEnd, to: docEnd, insert: insertStr },
      selection: { anchor: cursorOffset },
      scrollIntoView: true,
    });
  }));
}

/* ── Facet exposant le resolver (utilisé dans le filter) ─── */

export const authorResolverFacet = Facet.define<AuthorResolver, AuthorResolver | null>({
  combine: (vals) => vals.length ? vals[0] : null,
});
