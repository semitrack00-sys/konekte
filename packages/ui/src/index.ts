import type { Locale } from '@konekte/shared-types';
export const theme = { colors: { ink: '#112E32', primary: '#096B5A', accent: '#DAF576', background: '#F4F7F3', paper: '#FFFFFF', muted: '#536B6A', danger: '#A52A38' }, radius: 18 };
const en = {
  tagline: 'A simpler way to stay connected.', demo: 'Demo only. No real internet service. Prices are placeholders.',
  login: 'Sign in', register: 'Create account', email: 'Email', password: 'Password (12+ characters)', logout: 'Sign out',
  compatibility: 'Check your phone', deviceName: 'Phone model', supportsEsim: 'My phone supports eSIM', unlocked: 'My phone is unlocked',
  check: 'Check compatibility', compatible: 'Your answers look good. Confirm with your phone maker before buying real service.',
  incompatible: 'Your phone needs eSIM support and must be unlocked.', selfReported: 'This check is based on your answers; it cannot inspect your phone.',
  plans: 'Choose your plan', days: 'days', choose: 'Choose', pay: 'Continue to payment', payment: 'Payment',
  testPayment: 'Simulate successful payment', failPayment: 'Simulate failed payment', paymentPending: 'Waiting for verified payment.',
  paymentFailed: 'Payment failed. Choose a plan to try again.', paymentSuccess: 'Test payment verified. Preparing your demo setup.',
  activation: 'Set up your connection', preparing: 'Preparing your demo setup…', startInstall: 'Practice installation',
  confirmInstall: 'Finish practice installation', activate: 'Practice activation', active: 'Demo setup complete. No internet service is active.',
  installationWarning: 'Practice data only. Do not add this to your phone settings.', retry: 'Try setup again',
  usage: 'Internet usage', simulatedUsage: 'Example usage — no network data is being measured.', used: 'used', of: 'of',
  phone: 'Phone', comingSoon: 'Phone coming soon', phoneDetail: 'Calling and texting are not available yet.',
  refresh: 'Refresh', error: 'Something went wrong. Please try again.', loading: 'Loading…', yes: 'Yes', no: 'No',
  back: 'Back', account: 'Account', adminTitle: 'Development console', adminDetail: 'Plan catalog and service readiness',
  ready: 'Ready', unavailable: 'Unavailable', placeholder: 'PLACEHOLDER_PRICING', noSubscription: 'Choose a plan to get started.',
  statePending: 'Preparing', stateReady: 'Ready for practice', stateInstalling: 'Practice installation', stateInstalled: 'Practice installation complete', stateActivating: 'Finishing practice', stateActive: 'Demo complete', stateFailed: 'Setup needs another try',
  invalidForm: 'Enter a valid email and a password with at least 12 characters.', expired: 'Your session ended. Please sign in again.'
};
type Messages = Record<keyof typeof en, string>;
const ht: Messages = {
  tagline: 'Yon fason pi senp pou rete konekte.', demo: 'Demonstrasyon sèlman. Pa gen sèvis entènèt reyèl. Pri yo se egzanp.',
  login: 'Konekte', register: 'Kreye kont', email: 'Imèl', password: 'Modpas (12 karaktè oswa plis)', logout: 'Dekonekte',
  compatibility: 'Verifye telefòn ou', deviceName: 'Modèl telefòn', supportsEsim: 'Telefòn mwen sipòte eSIM', unlocked: 'Telefòn mwen debloke',
  check: 'Verifye konpatibilite', compatible: 'Repons ou yo bon. Verifye ak manifakti telefòn ou anvan ou achte sèvis reyèl.',
  incompatible: 'Telefòn ou dwe sipòte eSIM epi li dwe debloke.', selfReported: 'Verifikasyon sa a baze sou repons ou; li pa ka enspekte telefòn ou.',
  plans: 'Chwazi plan ou', days: 'jou', choose: 'Chwazi', pay: 'Kontinye pou peye', payment: 'Peman',
  testPayment: 'Simile yon peman ki reyisi', failPayment: 'Simile yon peman ki echwe', paymentPending: 'N ap tann verifikasyon peman an.',
  paymentFailed: 'Peman an echwe. Chwazi yon plan pou eseye ankò.', paymentSuccess: 'Peman tès la verifye. N ap prepare demonstrasyon an.',
  activation: 'Prepare koneksyon ou', preparing: 'N ap prepare demonstrasyon an…', startInstall: 'Pratike enstalasyon an',
  confirmInstall: 'Fini pratik enstalasyon an', activate: 'Pratike aktivasyon an', active: 'Demonstrasyon an fini. Pa gen sèvis entènèt ki aktive.',
  installationWarning: 'Done pratik sèlman. Pa mete sa nan paramèt telefòn ou.', retry: 'Eseye konfigirasyon an ankò',
  usage: 'Itilizasyon entènèt', simulatedUsage: 'Egzanp itilizasyon — nou pa mezire done rezo.', used: 'itilize', of: 'sou',
  phone: 'Telefòn', comingSoon: 'Sèvis telefòn ap vini', phoneDetail: 'Apèl ak mesaj tèks poko disponib.',
  refresh: 'Rafrechi', error: 'Gen yon pwoblèm. Tanpri eseye ankò.', loading: 'N ap chaje…', yes: 'Wi', no: 'Non',
  back: 'Retounen', account: 'Kont', adminTitle: 'Konsòl devlopman', adminDetail: 'Lis plan ak eta sèvis la',
  ready: 'Pare', unavailable: 'Pa disponib', placeholder: 'PLACEHOLDER_PRICING', noSubscription: 'Chwazi yon plan pou kòmanse.',
  statePending: 'N ap prepare', stateReady: 'Pare pou pratike', stateInstalling: 'Pratik enstalasyon', stateInstalled: 'Pratik enstalasyon fini', stateActivating: 'N ap fini pratik la', stateActive: 'Demonstrasyon fini', stateFailed: 'Eseye konfigirasyon an ankò',
  invalidForm: 'Antre yon imèl valab ak yon modpas ki gen omwen 12 karaktè.', expired: 'Sesyon ou fini. Tanpri konekte ankò.'
};
const fr: Messages = {
  tagline: 'Une façon plus simple de rester connecté.', demo: 'Démonstration uniquement. Aucun service internet réel. Tarifs indicatifs.',
  login: 'Se connecter', register: 'Créer un compte', email: 'E-mail', password: 'Mot de passe (12 caractères minimum)', logout: 'Se déconnecter',
  compatibility: 'Vérifiez votre téléphone', deviceName: 'Modèle du téléphone', supportsEsim: 'Mon téléphone accepte les eSIM', unlocked: 'Mon téléphone est débloqué',
  check: 'Vérifier la compatibilité', compatible: 'Vos réponses conviennent. Vérifiez auprès du fabricant avant tout achat réel.',
  incompatible: 'Votre téléphone doit accepter les eSIM et être débloqué.', selfReported: 'Cette vérification repose sur vos réponses, sans inspecter votre téléphone.',
  plans: 'Choisissez votre forfait', days: 'jours', choose: 'Choisir', pay: 'Passer au paiement', payment: 'Paiement',
  testPayment: 'Simuler un paiement réussi', failPayment: 'Simuler un paiement échoué', paymentPending: 'En attente de vérification du paiement.',
  paymentFailed: 'Le paiement a échoué. Choisissez un forfait pour réessayer.', paymentSuccess: 'Paiement test vérifié. Préparation de la démonstration.',
  activation: 'Préparez votre connexion', preparing: 'Préparation de la démonstration…', startInstall: 'Essayer l’installation',
  confirmInstall: 'Terminer l’essai d’installation', activate: 'Essayer l’activation', active: 'Démonstration terminée. Aucun service internet actif.',
  installationWarning: 'Données de démonstration. Ne les ajoutez pas aux réglages du téléphone.', retry: 'Réessayer la configuration',
  usage: 'Consommation internet', simulatedUsage: 'Exemple de consommation — aucune mesure du réseau.', used: 'utilisés', of: 'sur',
  phone: 'Téléphone', comingSoon: 'Téléphone bientôt disponible', phoneDetail: 'Les appels et les SMS ne sont pas encore disponibles.',
  refresh: 'Actualiser', error: 'Une erreur est survenue. Veuillez réessayer.', loading: 'Chargement…', yes: 'Oui', no: 'Non',
  back: 'Retour', account: 'Compte', adminTitle: 'Console de développement', adminDetail: 'Catalogue des forfaits et disponibilité du service',
  ready: 'Prêt', unavailable: 'Indisponible', placeholder: 'PLACEHOLDER_PRICING', noSubscription: 'Choisissez un forfait pour commencer.',
  statePending: 'Préparation', stateReady: 'Prêt pour l’essai', stateInstalling: 'Essai d’installation', stateInstalled: 'Essai d’installation terminé', stateActivating: 'Fin de l’essai', stateActive: 'Démonstration terminée', stateFailed: 'Configuration à réessayer',
  invalidForm: 'Saisissez un e-mail valide et un mot de passe d’au moins 12 caractères.', expired: 'Votre session a expiré. Veuillez vous reconnecter.'
};
export const messages: Record<Locale, Messages> = { en, ht, fr };
export type MessageKey = keyof Messages;
