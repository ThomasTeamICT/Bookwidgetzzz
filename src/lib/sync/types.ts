// ── Klaskanaal: het contract voor synchronisatie tussen toestellen ─────────
//
// Vandaag reist leerlingwerk via QR-codes en resultaat-/voortgangscodes (zie
// lib/inbox.ts). Dit bestand legt vast hoe een latere synchronisatiedienst
// ("klaskanaal") daar naast komt te staan — als tweede transport voor
// dezelfde gebeurtenissen, nooit als vervanging. Zie docs/KLASKANAAL.md.
//
// Ontwerpregels die dit contract bewaakt:
//  1. Het toestel van de leerkracht blijft de bron van waarheid; het kanaal
//     is transport plus een korte buffer.
//  2. Alles wat het toestel verlaat, is end-to-end versleuteld met een
//     klassleutel die alleen in de klaslink zit (hash-fragment, bereikt
//     nooit een server). De dienst ziet kanaal-id's, tijdstippen en
//     cijfertekst — geen namen, geen antwoorden.
//  3. Elke gebeurtenis heeft een eigen id en is idempotent: dubbel
//     ontvangen mag, de ontvanger ontdubbelt (submissionDupKey,
//     mergeProgressRecords).
//  4. Offline eerst: gebeurtenissen wachten in een lokale uitgaande rij en
//     vertrekken zodra er verbinding is.
//
// Er is nog géén implementatie: dit zijn types en een no-op-adapter, zodat
// UI en opslag er alvast tegenaan kunnen bouwen zonder een server.

import type { Submission } from '../types';
import type { CourseProgress } from '../courseTypes';
import type { Assignment } from '../classTypes';

/** Welke gebeurtenissen het kanaal vervoert. Inhoud (cursussen, widgets) reist
 *  als klaspakket-blob op inhoudshash, niet als losse gebeurtenis. */
export type SyncEvent =
  | { kind: 'submission'; id: string; at: number; submission: Submission }
  | { kind: 'progress'; id: string; at: number; progress: CourseProgress }
  | { kind: 'assignment'; id: string; at: number; assignment: Assignment; removed?: boolean }
  | { kind: 'pack'; id: string; at: number; /** Inhoudshash van het klaspakket in de blobopslag. */ packHash: string }
  | { kind: 'presence'; id: string; at: number; studentId: string; where: string }
  | { kind: 'wipe'; id: string; at: number };

/** Wie de gebeurtenis maakte; de leerkracht ondertekent de hare. */
export interface SyncEnvelope {
  /** Gebeurtenis-id (idempotentie). */
  id: string;
  /** Volgnummer dat de dienst toekent bij ontvangst; leeg zolang lokaal. */
  seq?: number;
  /** Cijfertekst (AES-GCM) van de JSON van een SyncEvent. */
  ciphertext: string;
  nonce: string;
  /** Handtekening van de leerkracht (alleen bij assignment, pack, wipe). */
  signature?: string;
  /** Rol van de afzender; de dienst vertrouwt dit niet, de ontvanger controleert de handtekening. */
  from: 'teacher' | 'student';
}

export type SyncStatus = 'uit' | 'verbinden' | 'verbonden' | 'offline' | 'fout';

/** Wat een klas nodig heeft om aan een kanaal te hangen. Reist mee in de klaslink. */
export interface ChannelCredentials {
  /** Kanaal-id = hash van de klassleutel; de dienst kent alleen dit. */
  channelId: string;
  /** Symmetrische klassleutel (base64url). Nooit naar de dienst sturen. */
  classKey: string;
  /** Publieke sleutel van de leerkracht om assignment/pack/wipe te verifiëren. */
  teacherPublicKey: string;
  /** Privésleutel: alleen op het toestel van de leerkracht. */
  teacherPrivateKey?: string;
  /** Basis-URL van de dienst, bv. https://kanaal.school.be. */
  endpoint: string;
}

/**
 * Het transport. Implementaties: NoopAdapter (nu), BroadcastChannelAdapter
 * (demo in één browser, fase 1), HttpRelayAdapter (de dienst, fase 2).
 */
export interface SyncAdapter {
  readonly status: SyncStatus;
  onStatus(fn: (s: SyncStatus) => void): () => void;
  /** Verbinding maken en vanaf `sinceSeq` alles inhalen. */
  connect(creds: ChannelCredentials, sinceSeq: number): Promise<void>;
  disconnect(): void;
  /** Gebeurtenis versturen; komt in de uitgaande rij bij geen verbinding. */
  publish(event: SyncEvent): Promise<void>;
  /** Binnenkomende gebeurtenissen, al ontcijferd en geverifieerd, in seq-volgorde. */
  subscribe(fn: (event: SyncEvent, seq: number) => void): () => void;
}

/** Doet niets: het gedrag van vandaag (QR en codes). */
export class NoopAdapter implements SyncAdapter {
  readonly status: SyncStatus = 'uit';
  onStatus() { return () => {}; }
  async connect() { /* geen kanaal */ }
  disconnect() { /* niets te sluiten */ }
  async publish() { /* niets te versturen */ }
  subscribe() { return () => {}; }
}
