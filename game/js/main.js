/* IR RPG — bootstrap. Instantiates Phaser once all modules + CDNs are present. */
(function () {
  "use strict";
  function boot() {
    if (!window.Phaser) { setTimeout(boot, 50); return; }
    new window.Phaser.Game({
      type: window.Phaser.AUTO,
      parent: "game-root",
      width: 960,
      height: 640,
      backgroundColor: "#0e1420",
      pixelArt: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scale: { mode: window.Phaser.Scale.FIT, autoCenter: window.Phaser.Scale.CENTER_BOTH },
      scene: window.IRScenes,
    });
  }
  boot();
})();
