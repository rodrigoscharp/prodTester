// Simula uma rede 3G no navegador da persona celular-3g.
// Carregado pelo Playwright MCP via --init-page em cada aba nova.
// Valores do perfil "Fast 3G" das ferramentas de desenvolvedor do Chrome.
const KBPS = 1024 / 8;

module.exports.default = async ({ page }) => {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 562.5,
      downloadThroughput: 1.6 * 1024 * KBPS * 0.9,
      uploadThroughput: 750 * KBPS * 0.9,
    });
  } catch (erro) {
    // Navegadores sem CDP (Firefox, WebKit) seguem sem limitação de rede.
    console.error(`[prodtester] rede 3G não aplicada: ${erro.message}`);
  }
};
