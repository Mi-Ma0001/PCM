/* ==========================================================================
   plateforme.js — Ce qui dépend de l'endroit où tourne l'application :
   navigateur (PWA) ou application Android (Capacitor).
   ========================================================================== */
(function (racine) {
  'use strict';
  const Cap = racine.Capacitor;
  const estNatif = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const plugin = nom => (estNatif && Cap.Plugins ? Cap.Plugins[nom] : null);

  /* ---------- Export d'un fichier ----------
     Navigateur : téléchargement classique. Android : écriture dans le cache de
     l'application puis feuille de partage (Enregistrer dans Fichiers, Drive, e-mail…). */
  async function exporterFichier(nom, contenu, type) {
    if (estNatif) {
      const fs = plugin('Filesystem'), partage = plugin('Share');
      if (!fs || !partage) throw new Error('Modules Android de partage absents : relancez « npx cap sync android ».');
      const ecrit = await fs.writeFile({ path: nom, data: contenu, directory: 'CACHE', encoding: 'utf8' });
      try {
        await partage.share({ title: nom, url: ecrit.uri, dialogTitle: 'Enregistrer ou partager ' + nom });
      } catch (e) {
        if (/cancel/i.test(String(e && (e.message || e)))) return { annule: true };
        throw e;
      }
      return { ok: true, natif: true };
    }
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nom });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
  }

  /* ---------- Service worker (PWA, navigateur seulement) ---------- */
  function activerHorsLigne(surMiseAJour) {
    if (estNatif || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    // On recharge seulement après « Mettre à jour » (pas lors de la toute première installation)
    let demandee = false, rechargement = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (demandee && !rechargement) { rechargement = true; location.reload(); } });
    const signaler = sw => surMiseAJour(() => { demandee = true; sw.postMessage({ type: 'ACTIVER' }); });
    navigator.serviceWorker.register('sw.js').then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) signaler(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nouveau = reg.installing;
        nouveau && nouveau.addEventListener('statechange', () => {
          if (nouveau.state === 'installed' && navigator.serviceWorker.controller) signaler(nouveau);
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);   // vérification horaire
    }).catch(() => { /* hors ligne indisponible : l'application fonctionne quand même */ });
  }

  /* ---------- Installation PWA (bouton « Installer ») ---------- */
  let invite = null;
  function surInstallable(fn) {
    racine.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; fn(true); });
    racine.addEventListener('appinstalled', () => { invite = null; fn(false); });
  }
  async function installer() {
    if (!invite) return false;
    invite.prompt();
    const choix = await invite.userChoice;
    invite = null;
    return choix && choix.outcome === 'accepted';
  }

  /* ---------- Réseau ---------- */
  const enLigne = () => navigator.onLine !== false;
  function surReseau(fn) { racine.addEventListener('online', () => fn(true)); racine.addEventListener('offline', () => fn(false)); }

  /* ---------- Android : barre d'état et bouton retour ---------- */
  function preparerNatif() {
    if (!estNatif) return;
    const barre = plugin('StatusBar');
    if (barre) { barre.setBackgroundColor({ color: '#0f3d2e' }).catch(() => {}); barre.setStyle({ style: 'DARK' }).catch(() => {}); }
    // Bouton retour : onglet précédent, puis fermeture de l'application
    const app = plugin('App');
    if (app) app.addListener('backButton', ({ canGoBack }) => { if (canGoBack && history.length > 1) history.back(); else app.exitApp(); });
  }

  racine.Plateforme = { estNatif, exporterFichier, activerHorsLigne, surInstallable, installer, enLigne, surReseau, preparerNatif };
})(window);
