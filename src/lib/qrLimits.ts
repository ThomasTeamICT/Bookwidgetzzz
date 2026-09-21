// Boven dit aantal tekens wordt een QR-code onleesbaar klein (versie 40 haalt
// ±2 950 alfanumerieke tekens; we houden marge voor gsm-camera's).
// Apart bestand: CodeQr zit op het leerlingpad en mag lib/classPack (en
// daarmee de hele klassen- en cursusmodule) niet in de hoofdbundel trekken.
export const QR_MAX_CHARS = 2300;
