<script lang="ts">
  import { toasts } from '$lib/stores/room';
</script>

<div class="stack">
  {#each $toasts as t (t.id)}
    <div class="toast" class:success={t.kind === 'success'}>
      <span class="dot"></span>
      <span class="t-txt">{t.text}</span>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed; right: 26px; bottom: 26px; z-index: 80;
    display: flex; flex-direction: column; gap: 10px;
    pointer-events: none;
  }
  .toast {
    display: flex; align-items: center; gap: 12px;
    background: var(--surface); border-radius: var(--r-md);
    box-shadow: var(--shadow-pop); padding: 14px 18px;
    animation: slideUp .4s cubic-bezier(.2,.8,.3,1) both;
    pointer-events: auto;
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  .dot {
    width: 9px; height: 9px; border-radius: 50%; background: #2E7D4F;
    animation: pulse 1.8s infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,79,0.5); }
    70%      { box-shadow: 0 0 0 6px rgba(46,125,79,0); }
  }
  .t-txt { font-size: 14px; color: var(--navy); font-weight: 500; }
  .toast.success { border-left: 3px solid var(--chartreuse); }
</style>
