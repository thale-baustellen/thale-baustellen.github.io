/**
 * Baustellen-App · Backend für Google Apps Script
 * Version 1.0 vom 03.11.2026
 *
 * Läuft als eigenständiges Skript (script.google.com) oder aus einer
 * Google-Tabelle heraus (Erweiterungen › Apps Script).
 *
 * Im Editor auszuführen:
 *   einrichten()             – einmalig: legt die Tabelle „Baustellen“ (falls nötig), die Blätter
 *                              und den Foto-Ordner an und erzeugt den Einrichtungscode
 *   neuerEinrichtungscode()  – für ein neues Konto oder „Passwort vergessen“
 *
 * Danach: Bereitstellen › Neue Bereitstellung › Web-App,
 *   Ausführen als: Ich · Zugriff: Jeder
 *
 * Die Blätter bitte nicht umbenennen. Spalten dürfen nicht gelöscht oder
 * verschoben werden; neue Spalten legt das Skript selbst an.
 */

const VERSION = '1.0';
const TABELLEN = ['projekte', 'kunden', 'positionen', 'zeiten', 'doku', 'fotos', 'aufgaben',
  'artikel', 'lohnarten', 'dokumente', 'zahlungen', 'einstellungen'];
const GRUNDSPALTEN = ['id', 'geaendert', 'geloescht', 'erstellt', '_sync'];
const SITZUNG_TAGE = 90;
const MAX_FEHLVERSUCHE = 5;
const SPERRE_MINUTEN = 15;
const HASH_RUNDEN = 3000;
const CODE_STUNDEN = 24;
const MAX_ZELLE = 49000;

/* ===================== Einrichtung (im Editor ausführen) ===================== */

function einrichten() {
  let ss = null;
  const vorhanden = props_().getProperty('TABELLE_ID');
  if (vorhanden) { try { ss = SpreadsheetApp.openById(vorhanden); } catch (err) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create('Baustellen');
  props_().setProperty('TABELLE_ID', ss.getId());
  TABELLEN.forEach(function (t) { blatt_(ss, t); });
  ['Tabellenblatt1', 'Sheet1'].forEach(function (name) {
    const leer = ss.getSheetByName(name);
    if (leer && leer.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(leer);
  });
  const ordner = fotoOrdner_();
  // Änderungen direkt in der Tabelle sollen beim Abgleich ankommen
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'beiBearbeitung') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('beiBearbeitung').forSpreadsheet(ss).onEdit().create();
  Logger.log('Einrichtung abgeschlossen. Tabelle: ' + ss.getUrl() + ' · Foto-Ordner: ' + ordner.getName());
  neuerEinrichtungscode();
}

function neuerEinrichtungscode() {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const roh = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Utilities.getUuid());
  let code = '';
  for (let i = 0; i < 8; i++) code += zeichen.charAt((roh[i] + 256) % 32);
  props_().setProperty('EINRICHTUNGSCODE', JSON.stringify({ code: code, bis: Date.now() + CODE_STUNDEN * 3600000 }));
  Logger.log('Einrichtungscode: ' + code + '   (gültig ' + CODE_STUNDEN + ' Stunden, einmal verwendbar)');
  return code;
}

/* ===================== Web-App ===================== */

function doGet() {
  return json_({ ok: true, app: 'Baustellen', version: VERSION });
}

function doPost(ev) {
  let antwort;
  try {
    const e = JSON.parse((ev && ev.postData && ev.postData.contents) || '{}');
    antwort = verteilen_(e);
  } catch (err) {
    antwort = { ok: false, fehler: String((err && err.message) || err), abgemeldet: !!(err && err.abgemeldet) };
  }
  return json_(antwort);
}

function verteilen_(e) {
  switch (e.aktion) {
    case 'status':
      return { ok: true, version: VERSION, eingerichtet: !!props_().getProperty('TABELLE_ID'), benutzer: Object.keys(benutzer_()).length };
    case 'anmelden': return anmelden_(e);
    case 'kontoMitCode': return kontoMitCode_(e);
  }
  const ich = pruefen_(e.token);
  switch (e.aktion) {
    case 'ich': return { ok: true, benutzer: ich };
    case 'sync': return sync_(e);
    case 'fotoHoch': return fotoHoch_(e);
    case 'fotoLaden': return fotoLaden_(e);
    case 'abmelden': sitzungLoeschen_(e.token); return { ok: true };
    case 'abmeldenUeberall': sitzungenLoeschen_(ich.mail); return { ok: true };
    case 'passwortAendern': return passwortAendern_(ich, e);
  }
  throw new Error('Unbekannte Aktion: ' + e.aktion);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function props_() { return PropertiesService.getScriptProperties(); }

/* ===================== Abgleich ===================== */

function sync_(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = tabelle_();
    const jetzt = new Date().toISOString();
    const abgelehnt = {};
    const nachTabelle = {};
    (e.aenderungen || []).forEach(function (a) {
      if (a && TABELLEN.indexOf(a.t) >= 0 && a.z && a.z.id) (nachTabelle[a.t] = nachTabelle[a.t] || []).push(a.z);
    });
    Object.keys(nachTabelle).forEach(function (t) { schreiben_(ss, t, nachTabelle[t], jetzt, abgelehnt); });
    const daten = {};
    TABELLEN.forEach(function (t) { daten[t] = lesen_(ss, t, String(e.seit || ''), abgelehnt); });
    return { ok: true, serverZeit: jetzt, daten: daten, abgelehnt: Object.keys(abgelehnt).length };
  } finally {
    lock.releaseLock();
  }
}

function tabelle_() {
  const id = props_().getProperty('TABELLE_ID');
  if (!id) throw new Error('Das Backend ist noch nicht eingerichtet – bitte einrichten() ausführen.');
  return SpreadsheetApp.openById(id);
}

function blatt_(ss, t) {
  let sh = ss.getSheetByName(t);
  if (!sh) {
    sh = ss.insertSheet(t);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, GRUNDSPALTEN.length).setValues([GRUNDSPALTEN]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function kopf_(sh) {
  const n = sh.getLastColumn();
  if (n === 0) {
    sh.getRange(1, 1, 1, GRUNDSPALTEN.length).setValues([GRUNDSPALTEN]).setFontWeight('bold');
    return GRUNDSPALTEN.slice();
  }
  return sh.getRange(1, 1, 1, n).getValues()[0].map(String);
}

function schreiben_(ss, t, zeilen, jetzt, abgelehnt) {
  const sh = blatt_(ss, t);
  let kopf = kopf_(sh);

  // Neue Felder werden als Spalten angehängt
  const neu = [];
  zeilen.forEach(function (z) {
    Object.keys(z || {}).forEach(function (k) {
      if (k !== '_sync' && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k) && kopf.indexOf(k) < 0 && neu.indexOf(k) < 0) neu.push(k);
    });
  });
  if (neu.length) {
    const fehlen = kopf.length + neu.length - sh.getMaxColumns();
    if (fehlen > 0) sh.insertColumnsAfter(sh.getMaxColumns(), fehlen);
    sh.getRange(1, kopf.length + 1, sh.getMaxRows(), neu.length).setNumberFormat('@');
    sh.getRange(1, kopf.length + 1, 1, neu.length).setValues([neu]).setFontWeight('bold');
    kopf = kopf.concat(neu);
  }

  const breite = kopf.length;
  const anzahl = Math.max(0, sh.getLastRow() - 1);
  const iG = kopf.indexOf('geaendert');
  const ids = anzahl ? sh.getRange(2, 1, anzahl, 1).getValues().map(function (r) { return String(r[0]); }) : [];
  const altG = anzahl ? sh.getRange(2, iG + 1, anzahl, 1).getValues().map(function (r) { return zeitText_(r[0]); }) : [];
  const pos = {};
  ids.forEach(function (id, i) { if (id) pos[id] = i; });

  const anhang = [];
  const aenderung = {};
  zeilen.forEach(function (z) {
    const id = String(z.id);
    const reihe = kopf.map(function (k) { return k === '_sync' ? jetzt : zelle_(z[k]); });
    if (Object.prototype.hasOwnProperty.call(pos, id)) {
      const i = pos[id];
      if (i >= anzahl) { anhang[i - anzahl] = reihe; return; }
      if (String(z.geaendert || '') < String(altG[i] || '')) { abgelehnt[t + '|' + id] = true; return; }
      aenderung[i] = reihe;
    } else {
      pos[id] = anzahl + anhang.length;
      anhang.push(reihe);
    }
  });

  const geaendert = Object.keys(aenderung).map(Number);
  if (geaendert.length > 25) {
    const block = sh.getRange(2, 1, anzahl, breite).getValues();
    geaendert.forEach(function (i) { block[i] = aenderung[i]; });
    sh.getRange(2, 1, anzahl, breite).setValues(block);
  } else {
    geaendert.forEach(function (i) { sh.getRange(i + 2, 1, 1, breite).setValues([aenderung[i]]); });
  }

  if (anhang.length) {
    const start = anzahl + 2;
    const ende = start + anhang.length - 1;
    if (ende > sh.getMaxRows()) {
      const vorher = sh.getMaxRows();
      sh.insertRowsAfter(vorher, ende - vorher + 200);
      sh.getRange(vorher + 1, 1, sh.getMaxRows() - vorher, sh.getMaxColumns()).setNumberFormat('@');
    }
    sh.getRange(start, 1, anhang.length, breite).setValues(anhang);
  }
}

function lesen_(ss, t, seit, abgelehnt) {
  const sh = ss.getSheetByName(t);
  if (!sh) return [];
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const kopf = kopf_(sh);
  const werte = sh.getRange(2, 1, n, kopf.length).getValues();
  const iS = kopf.indexOf('_sync');
  const aus = [];
  werte.forEach(function (r) {
    const id = String(r[0]);
    if (!id) return;
    if (seit && !(zeitText_(r[iS]) > seit) && !abgelehnt[t + '|' + id]) return;
    const o = {};
    kopf.forEach(function (k, i) { if (k && k !== '_sync') o[k] = wertLesen_(r[i]); });
    aus.push(o);
  });
  return aus;
}

function zelle_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return isFinite(v) ? v : '';
  if (typeof v === 'object') v = JSON.stringify(v);
  v = String(v);
  if (v.length > MAX_ZELLE) v = v.slice(0, MAX_ZELLE);
  if (v.charAt(0) === '=') v = "'" + v;
  return v;
}

function wertLesen_(v) {
  if (v instanceof Date) return datumText_(v);
  if (typeof v === 'string' && v.charAt(0) === "'") return v.slice(1);
  return v;
}

function zeitText_(v) {
  if (v instanceof Date) return v.toISOString();
  return String(v || '');
}

function datumText_(d) {
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return d.toISOString();
}

/**
 * Wer direkt in der Tabelle etwas ändert, bekommt einen neuen Zeitstempel,
 * damit die Änderung beim nächsten Abgleich auf allen Geräten ankommt.
 */
function beiBearbeitung(e) {
  try {
    const sh = e.range.getSheet();
    if (TABELLEN.indexOf(sh.getName()) < 0) return;
    const r0 = e.range.getRow();
    const r1 = r0 + e.range.getNumRows() - 1;
    if (r1 < 2) return;
    const start = Math.max(2, r0);
    const anz = r1 - start + 1;
    const kopf = kopf_(sh);
    const jetzt = new Date().toISOString();
    const spalte = [];
    for (let i = 0; i < anz; i++) spalte.push([jetzt]);
    [kopf.indexOf('_sync'), kopf.indexOf('geaendert')].forEach(function (i) {
      if (i >= 0) sh.getRange(start, i + 1, anz, 1).setValues(spalte);
    });
  } catch (err) {
    // bewusst still
  }
}

/* ===================== Fotos ===================== */

function fotoOrdner_() {
  const p = props_();
  const id = p.getProperty('FOTO_ORDNER');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* neu anlegen */ }
  }
  const ordner = DriveApp.createFolder('Baustellen-Fotos');
  p.setProperty('FOTO_ORDNER', ordner.getId());
  return ordner;
}

function fotoHoch_(e) {
  if (!e.id || !e.daten) throw new Error('Foto unvollständig.');
  const ordner = fotoOrdner_();
  const name = String(e.id) + '.jpg';
  const vorhanden = ordner.getFilesByName(name);
  if (vorhanden.hasNext()) return { ok: true, driveId: vorhanden.next().getId() };
  const blob = Utilities.newBlob(Utilities.base64Decode(e.daten), e.mime || 'image/jpeg', name);
  const datei = ordner.createFile(blob);
  if (e.beschreibung) datei.setDescription(String(e.beschreibung).slice(0, 500));
  return { ok: true, driveId: datei.getId() };
}

function fotoLaden_(e) {
  const ordnerId = fotoOrdner_().getId();
  const datei = DriveApp.getFileById(String(e.driveId || ''));
  let erlaubt = false;
  const eltern = datei.getParents();
  while (eltern.hasNext()) if (eltern.next().getId() === ordnerId) erlaubt = true;
  if (!erlaubt) throw new Error('Foto nicht gefunden.');
  const blob = datei.getBlob();
  return { ok: true, mime: blob.getContentType(), daten: Utilities.base64Encode(blob.getBytes()) };
}

/* ===================== Anmeldung ===================== */

function benutzer_() {
  return JSON.parse(props_().getProperty('BENUTZER') || '{}');
}

function benutzerSichern_(b) {
  props_().setProperty('BENUTZER', JSON.stringify(b));
}

function mail_(m) {
  const mail = String(m || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error('Bitte eine gültige Mailadresse eingeben.');
  return mail;
}

function hash_(passwort, salz) {
  const alg = Utilities.DigestAlgorithm.SHA_256;
  const salzBytes = Utilities.newBlob(salz).getBytes();
  let h = Utilities.computeDigest(alg, salz + '|' + passwort, Utilities.Charset.UTF_8);
  for (let i = 0; i < HASH_RUNDEN; i++) h = Utilities.computeDigest(alg, h.concat(salzBytes));
  return Utilities.base64Encode(h);
}

function hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function abgemeldet_() {
  const err = new Error('Bitte neu anmelden.');
  err.abgemeldet = true;
  return err;
}

function anmelden_(e) {
  const mail = mail_(e.mail);
  const cache = CacheService.getScriptCache();
  const schluessel = 'F_' + hex_(mail).slice(0, 32);
  const fehl = Number(cache.get(schluessel) || 0);
  if (fehl >= MAX_FEHLVERSUCHE) throw new Error('Zu viele Fehlversuche – bitte in ' + SPERRE_MINUTEN + ' Minuten erneut versuchen.');
  const b = benutzer_()[mail];
  if (!b || hash_(String(e.passwort || ''), b.salz) !== b.hash) {
    cache.put(schluessel, String(fehl + 1), SPERRE_MINUTEN * 60);
    Utilities.sleep(700);
    throw new Error('Mail oder Passwort falsch.');
  }
  cache.remove(schluessel);
  return sitzungAnlegen_(mail, b, e.geraet);
}

function kontoMitCode_(e) {
  const mail = mail_(e.mail);
  const passwort = String(e.passwort || '');
  if (passwort.length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen.');
  const gespeichert = JSON.parse(props_().getProperty('EINRICHTUNGSCODE') || 'null');
  const eingabe = String(e.code || '').trim().toUpperCase();
  if (!gespeichert || gespeichert.bis < Date.now() || gespeichert.code !== eingabe) {
    Utilities.sleep(700);
    throw new Error('Der Einrichtungscode ist falsch oder abgelaufen. Im Skript-Editor neuerEinrichtungscode() ausführen.');
  }
  const alle = benutzer_();
  const salz = Utilities.getUuid();
  if (alle[mail]) {
    alle[mail].salz = salz;
    alle[mail].hash = hash_(passwort, salz);
    if (e.name) alle[mail].name = String(e.name).slice(0, 80);
    sitzungenLoeschen_(mail);
  } else {
    alle[mail] = {
      name: String(e.name || '').slice(0, 80),
      rolle: Object.keys(alle).length === 0 ? 'inhaber' : 'mitarbeiter',
      salz: salz,
      hash: hash_(passwort, salz),
      erstellt: new Date().toISOString()
    };
  }
  benutzerSichern_(alle);
  props_().deleteProperty('EINRICHTUNGSCODE');
  return sitzungAnlegen_(mail, alle[mail], e.geraet);
}

function sitzungAnlegen_(mail, b, geraet) {
  aufraeumen_();
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props_().setProperty('S_' + hex_(token), JSON.stringify({
    mail: mail, bis: Date.now() + SITZUNG_TAGE * 864e5, geraet: String(geraet || '').slice(0, 80)
  }));
  return { ok: true, token: token, benutzer: { mail: mail, name: b.name || '', rolle: b.rolle } };
}

function pruefen_(token) {
  if (!token) throw abgemeldet_();
  const p = props_();
  const schluessel = 'S_' + hex_(String(token));
  const roh = p.getProperty(schluessel);
  if (!roh) throw abgemeldet_();
  const s = JSON.parse(roh);
  if (s.bis < Date.now()) { p.deleteProperty(schluessel); throw abgemeldet_(); }
  const b = benutzer_()[s.mail];
  if (!b) { p.deleteProperty(schluessel); throw abgemeldet_(); }
  if (s.bis - Date.now() < (SITZUNG_TAGE - 1) * 864e5) {
    s.bis = Date.now() + SITZUNG_TAGE * 864e5;
    p.setProperty(schluessel, JSON.stringify(s));
  }
  return { mail: s.mail, name: b.name || '', rolle: b.rolle };
}

function sitzungLoeschen_(token) {
  props_().deleteProperty('S_' + hex_(String(token || '')));
}

function sitzungenLoeschen_(mail) {
  const p = props_();
  const alle = p.getProperties();
  Object.keys(alle).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(alle[k]).mail === mail) p.deleteProperty(k); } catch (err) { p.deleteProperty(k); }
  });
}

function aufraeumen_() {
  const p = props_();
  const alle = p.getProperties();
  const jetzt = Date.now();
  Object.keys(alle).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(alle[k]).bis < jetzt) p.deleteProperty(k); } catch (err) { p.deleteProperty(k); }
  });
}

function passwortAendern_(ich, e) {
  const alle = benutzer_();
  const b = alle[ich.mail];
  if (hash_(String(e.alt || ''), b.salz) !== b.hash) throw new Error('Das bisherige Passwort stimmt nicht.');
  const neu = String(e.neu || '');
  if (neu.length < 8) throw new Error('Das neue Passwort braucht mindestens 8 Zeichen.');
  b.salz = Utilities.getUuid();
  b.hash = hash_(neu, b.salz);
  benutzerSichern_(alle);
  sitzungenLoeschen_(ich.mail);
  return sitzungAnlegen_(ich.mail, b, e.geraet);
}
