package tn.planmaintenance.cms;

import com.getcapacitor.BridgeActivity;

/**
 * Activité principale de « Plan maintenance CMS ».
 *
 * BridgeActivity (Capacitor) affiche l'application web embarquée
 * (app/src/main/assets/public, copiée par « npx cap sync android ») dans une
 * WebView et enregistre automatiquement les modules natifs déclarés dans
 * assets/capacitor.plugins.json : App (bouton retour), Filesystem et Share
 * (exports CSV / JSON), SplashScreen, StatusBar.
 *
 * Aucun code natif supplémentaire n'est nécessaire : toute la logique
 * (calcul du plan, planning, conflits) est dans le code web.
 */
public class MainActivity extends BridgeActivity {}
