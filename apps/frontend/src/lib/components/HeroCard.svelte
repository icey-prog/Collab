<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // Multi-GIF slider — signature visuelle Collab. Extrait de Sidebar pour
  // être réutilisable aussi dans le sheet MobileNav (mobile).
  const heroMedia = [
    '/animations/hand_ball.gif',
    '/animations/wardrobe.jpg',
    '/animations/gratitude.gif',
    '/animations/spongebob.png',
    '/animations/fire_elmo.png'
  ];
  let currentMediaIdx = 0;
  let mediaTimer: ReturnType<typeof setInterval>;

  onMount(() => {
    mediaTimer = setInterval(() => {
      currentMediaIdx = (currentMediaIdx + 1) % heroMedia.length;
    }, 30000);
  });

  onDestroy(() => {
    if (mediaTimer) clearInterval(mediaTimer);
  });
</script>

<div class="hero-card">
  {#key currentMediaIdx}
    <img
      src={heroMedia[currentMediaIdx]}
      alt="Animation"
      class="hero-gif"
      loading="lazy"
    />
  {/key}
</div>

<style>
  .hero-card {
    margin: 8px 12px 16px;
    overflow: hidden;
    position: relative;
    display: flex;
    justify-content: center;
  }
  .hero-gif {
    width: 100%; height: 140px;
    object-fit: contain;
    display: block;
    mix-blend-mode: multiply;
    animation: fade-in 0.8s ease-out forwards;
  }
  @keyframes fade-in {
    from { opacity: 0; transform: scale(0.97); }
    to { opacity: 1; transform: scale(1); }
  }
  :global(body.theme-dark) .hero-gif { mix-blend-mode: normal; }
</style>
