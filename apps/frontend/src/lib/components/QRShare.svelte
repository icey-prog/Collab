<script lang="ts">
  import QRCode from 'qrcode';

  export let url: string;
  export let size: number = 180;

  let dataUrl = '';
  let copied = false;
  let qrRequestId = 0;

  async function buildQr(nextUrl: string, nextSize: number) {
    const requestId = ++qrRequestId;
    if (!nextUrl) {
      dataUrl = '';
      return;
    }
    try {
      const nextDataUrl = await QRCode.toDataURL(nextUrl, {
        width: nextSize * 2,
        margin: 1,
        color: { dark: '#1B2445', light: '#FAFAF7' },
      });
      if (requestId === qrRequestId) dataUrl = nextDataUrl;
    } catch (e) {
      if (requestId === qrRequestId) dataUrl = '';
      console.warn('[QRShare]', e);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {}
  }

  async function shareUrl() {
    if (!navigator.share) return;
    try { await navigator.share({ title: 'Rejoindre la room Collab', url }); } catch {}
  }

  $: canShare = typeof navigator !== 'undefined' && !!navigator.share;
  $: buildQr(url, size);
</script>

<div class="qr-block">
  {#if dataUrl}
    <img class="qr-img" src={dataUrl} alt="QR — {url}" width={size} height={size} />
  {:else}
    <div class="qr-ph" style="width:{size}px;height:{size}px;"></div>
  {/if}

  <p class="qr-url">{url}</p>

  <div class="qr-btns">
    <button class="btn btn-ghost qr-btn" on:click={copyUrl}>
      {copied ? '✓ Copié' : 'Copier le lien'}
    </button>
    {#if canShare}
      <button class="btn btn-ghost qr-btn" on:click={shareUrl}>Partager ↗</button>
    {/if}
  </div>
</div>

<style>
  .qr-block {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .qr-img {
    border-radius: 10px; display: block;
    box-shadow: 0 2px 12px rgba(27,36,69,0.10);
  }
  .qr-ph {
    border-radius: 10px; background: var(--navy-06);
    animation: ph 1s ease-in-out infinite alternate;
  }
  @keyframes ph { from { opacity: 0.4; } to { opacity: 0.9; } }

  .qr-url {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--navy-50); text-align: center;
    max-width: 210px; word-break: break-all; margin: 0;
  }

  .qr-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .qr-btn { padding: 8px 14px; font-size: 13px; min-height: 36px; }
</style>
