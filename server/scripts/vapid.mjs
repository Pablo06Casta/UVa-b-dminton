// Genera un par de claves VAPID para los avisos push. Cópialas a las variables de entorno del servidor; no las pegues en chats ni en el repositorio.
import webpush from 'web-push';
const k = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + k.publicKey);
console.log('VAPID_PRIVATE_KEY=' + k.privateKey);
console.log('VAPID_SUBJECT=https://TU-WEB-DEL-CLUB   # una URL https o mailto:correo');
