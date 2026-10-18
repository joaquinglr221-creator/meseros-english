// Íconos de línea para el menú del Service Script (contenido de un <svg viewBox="0 0 24 24">), por id de etapa.
// Se dibujan con el color del tema; si una etapa no tiene ícono aquí, la app usa su emoji.
const STAGE_ICONS = {
  // auricular de teléfono
  phone: '<path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 7 7l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  // persona saludando con la mano
  welcome: '<circle cx="9" cy="5" r="2.2"/><path d="M5.5 21v-7.5L4.5 12V10A2.5 2.5 0 0 1 7 7.5h4a2.5 2.5 0 0 1 2.5 2.5v2l-1 1.5V21M13.5 10.5l4-5"/><path d="M18.5 2.5c1 .7 1.6 1.7 1.6 2.9M20.6 7.6c-.5.4-1.1.6-1.8.6"/>',
  // silla
  seating: '<path d="M7 3v10h10M7 13l-1.2 8M17 13l1.2 8M17 13V9.5M7 7h7.5a2.5 2.5 0 0 1 2.5 2.5"/>',
  // vaso de agua y pan
  intro: '<path d="M3.5 5h7l-1.2 15H4.7z"/><path d="M4 10h6"/><path d="M13 20v-4.5a4.5 4.5 0 0 1 9 0V20z"/><path d="M15.5 14.5l1-1.5M18 14.5l1-1.5"/>',
  // copa de coctel
  drinks: '<path d="M4 4h16l-8 9v7M8 20h8M6.5 7h11"/><path d="M15 2l-2.5 6"/>',
  // carta abierta
  menu: '<path d="M3 5h6.5A2.5 2.5 0 0 1 12 7.5V20a2 2 0 0 0-2-2H3zM21 5h-6.5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h7z"/><path d="M5.5 9h3.5M5.5 12h3.5M15 9h3.5M15 12h3.5"/>',
  // libreta y lápiz
  order: '<rect x="3.5" y="3" width="11" height="18" rx="1.5"/><path d="M6.5 8h5M6.5 12h5M6.5 16h3"/><path d="M20.5 5.5l-4 9.5-1.6 1.2.2-2 4-9.5z"/>',
  // copa de vino
  wine: '<path d="M8 3h8c0 4.5-1.5 8-4 8s-4-3.5-4-8zM12 11v9M8.5 21h7M8.3 6.5h7.4"/>',
  // campana para servir
  food: '<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 10V7.5M10.5 7.5h3M2.5 20h19"/>',
  // globo de diálogo con palomita
  check: '<path d="M4 4.5h16v11H9.5L5 19.5v-4H4z"/><path d="M8.5 10l2.5 2.5L15.5 8"/>',
  // pastel con vela
  dessert: '<path d="M4 20h16v-7H4zM4 13c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M12 11.5V8.5"/><path d="M12 8.5c-.8 0-1.2-.8-.6-1.6L12 5.5l.6 1.4c.6.8.2 1.6-.6 1.6z"/>',
  // ticket de la cuenta
  bill: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  // luna
  farewell: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M17 4.5v2.5M15.8 5.8h2.4"/>',
  // globo de diálogo con corazón (empatía)
  complaints: '<path d="M4 4.5h16v11H9.5L5 19.5v-4H4z"/><path d="M12 13s-3-1.8-3-3.6a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 1.8-3 3.6-3 3.6z"/>',
  // moño de corbata
  formal: '<path d="M10.5 12L3.5 7.5v9zM13.5 12l7-4.5v9z"/><rect x="10.5" y="10.3" width="3" height="3.4" rx="1"/>',
};
