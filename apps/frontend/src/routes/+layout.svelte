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

<slot />
