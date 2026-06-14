<script lang="ts">
  import '../app.css';
  import { mode, palette } from '$lib/stores/theme';

  // SvelteKit 2 may inject data/params/form on the layout — declare as const to absorb without warning
  export const data: unknown = undefined;
  export const params: Record<string, string> | undefined = undefined;
  export const form: unknown = undefined;
  void data; void params; void form;

  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', $mode === 'dark');
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if ($palette !== 'a') document.body.classList.add(`theme-${$palette}`);
  }
</script>

<!-- A11y skip link (Lot I) — visible only when focused, jumps past chrome to content -->
<a class="skip-link" href="#main-content">Aller au contenu</a>

<slot />

<style>
  .skip-link {
    position: fixed;
    top: -100px; left: 12px; z-index: 9999;
    background: var(--chartreuse, #E7F1A8);
    color: var(--accent-ink, #364C84);
    padding: 12px 18px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    transition: top .2s ease;
  }
  .skip-link:focus { top: 12px; outline: 2px solid var(--navy, #364C84); outline-offset: 2px; }
</style>
