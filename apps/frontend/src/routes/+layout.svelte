<script lang="ts">
  import '../app.css';
  import { mode, palette } from '$lib/stores/theme';

  // Hydrate body classes from stores on every render
  $: if (typeof document !== 'undefined') {
    document.body.classList.toggle('theme-dark', $mode === 'dark');
    document.body.classList.remove('theme-b', 'theme-c', 'theme-d');
    if ($palette !== 'a') document.body.classList.add(`theme-${$palette}`);
  }
</script>

<slot />
