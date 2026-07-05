/**
 * Icône de fichier par catégorie d'extension — même principe que les icon
 * themes VS Code (mapping extension → style), en plus léger : pas de SVG
 * par extension, juste un badge coloré par catégorie + le texte de
 * l'extension réelle (plus précis qu'une icône générique).
 */
export interface FileIconStyle {
  bg: string;
  fg: string;
}

const CATEGORY_EXTENSIONS: Record<string, string[]> = {
  code:    ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'swift', 'kt', 'sh', 'sql', 'json', 'yml', 'yaml', 'html', 'css', 'vue', 'svelte'],
  image:   ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
  pdf:     ['pdf'],
  doc:     ['doc', 'docx', 'odt', 'txt', 'md', 'rtf'],
  sheet:   ['xls', 'xlsx', 'csv', 'ods'],
  slide:   ['ppt', 'pptx', 'odp'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
  audio:   ['mp3', 'wav', 'ogg', 'flac', 'm4a'],
  video:   ['mp4', 'mov', 'avi', 'mkv', 'webm'],
};

const CATEGORY_STYLES: Record<string, FileIconStyle> = {
  code:    { bg: 'rgba(149,177,238,0.20)', fg: '#3F5B9E' },
  image:   { bg: 'rgba(216,168,244,0.24)', fg: '#8A4FA8' },
  pdf:     { bg: 'rgba(244,168,168,0.28)', fg: '#B0403F' },
  doc:     { bg: 'rgba(149,177,238,0.20)', fg: '#3F5B9E' },
  sheet:   { bg: 'rgba(168,241,184,0.30)', fg: '#2E7D4F' },
  slide:   { bg: 'rgba(244,168,120,0.28)', fg: '#B0642B' },
  archive: { bg: 'rgba(244,196,120,0.28)', fg: '#95631A' },
  audio:   { bg: 'rgba(168,241,225,0.30)', fg: '#1F8577' },
  video:   { bg: 'rgba(216,168,244,0.24)', fg: '#8A4FA8' },
  default: { bg: 'var(--navy-08)', fg: 'var(--navy-55)' },
};

function extensionOf(filename: string): string {
  const match = /\.([^.]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

function categoryOf(extension: string): string {
  for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
    if (extensions.includes(extension)) return category;
  }
  return 'default';
}

export function getFileIconLabel(filename: string): string {
  const extension = extensionOf(filename);
  return (extension || 'FILE').slice(0, 4).toUpperCase();
}

export function getFileIconStyle(filename: string): FileIconStyle {
  return CATEGORY_STYLES[categoryOf(extensionOf(filename))];
}
