// Mensajes que la tarjeta de crónica del feed (wrap-up-feed-card.tsx, cliente)
// lee en el navegador: solo esos subárboles, no el namespace `wrapUps` entero.
// Fuera del módulo "use client" para que los layouts de servidor reciban el
// valor y no una referencia de cliente.
export const WRAP_UP_FEED_MESSAGES = ["wrapUps.feed", "wrapUps.stories.closing", "wrapUps.stories.time"] as const;
