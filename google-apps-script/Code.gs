// Paste into the Apps Script project opened FROM the existing Google Form.
// Run setup once in the editor, then deploy as a web app: execute as you,
// access: Anyone. No respondent data is exposed by this endpoint.
const FIELD_MAP = [
  ['entry.1537376711', 1794570306],
  ['entry.1242240225', 537958953],
  ['entry.1337439971', 980991347],
  ['entry.282117568', 316449483],
  ['entry.84837070', 1450921784],
  ['entry.1690972073', 803399856]
];

function setup() {
  const form = FormApp.getActiveForm();
  if (!form) throw new Error('Откройте Apps Script из меню исходной Google Формы.');
  FIELD_MAP.forEach(function (field, index) {
    const item = form.getItemById(field[1]);
    if (!item || item.getType() !== (index === 5 ? FormApp.ItemType.MULTIPLE_CHOICE : FormApp.ItemType.TEXT)) {
      throw new Error('Поля формы изменились. Подключение остановлено.');
    }
  });
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());
  console.log('Подключена форма: ' + form.getTitle());
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ service: '70aero-registration', version: 3,
    configured: Boolean(PropertiesService.getScriptProperties().getProperty('FORM_ID')) });
}

function doPost(event) {
  let lock;
  const started = Date.now();
  const timings = {};
  let outcome = 'exception';
  // Only stage names and durations are logged; no answers, hashes or guest IDs.
  function measure(stage, operation) {
    const before = Date.now();
    try { return operation(); }
    finally { timings[stage] = Date.now() - before; }
  }
  function reply(value) {
    outcome = value.code;
    // Snapshot before encoding/finally: excludes response transfer and cleanup.
    value.diagnostics = { version: 3, timings: Object.assign({}, timings, {
      beforeResponseMs: Date.now() - started
    }) };
    return measure('encodeResponseMs', function () { return json_(value); });
  }
  try {
    const p = event && event.parameter || {};
    if (!event || !event.postData || event.postData.length > 12000) {
      return reply({ ok: false, code: 'invalid' });
    }
    if (!/^[a-f0-9-]{36}$/.test(p.requestId || '') || p.consent !== 'yes' || p.website) {
      return reply({ ok: false, code: 'invalid' });
    }
    const values = FIELD_MAP.map(function (field) { return String(p[field[0]] || '').trim(); });
    if (values.some(function (v) { return !v || v.length > 500; }) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[4])) {
      return reply({ ok: false, code: 'invalid' });
    }
    const properties = PropertiesService.getScriptProperties();
    const formId = measure('readConfigMs', function () { return properties.getProperty('FORM_ID'); });
    if (!formId) return reply({ ok: false, code: 'unavailable' });
    const fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, JSON.stringify(values)));
    lock = LockService.getScriptLock();
    if (!measure('lockWaitMs', function () { return lock.tryLock(5000); })) return reply({ ok: false, code: 'busy' });
    const key = 'request:' + p.requestId;
    const previous = measure('readReceiptMs', function () { return properties.getProperty(key); });
    if (previous) {
      const record = JSON.parse(previous);
      if (record.fingerprint !== fingerprint) return reply({ ok: false, code: 'conflict' });
      return reply({ ok: record.state === 'saved', code: record.state, requestId: p.requestId });
    }
    const form = measure('openFormMs', function () { return FormApp.openById(formId); });
    if (!measure('checkOpenMs', function () { return form.isAcceptingResponses(); })) return reply({ ok: false, code: 'closed' });
    const response = measure('createResponseMs', function () { return form.createResponse(); });
    FIELD_MAP.forEach(function (field, index) {
      measure('prepareField' + (index + 1) + 'Ms', function () {
      const item = form.getItemById(field[1]);
      if (index === 5) {
        const choice = item.asMultipleChoiceItem();
        if (!choice.getChoices().some(function (c) { return c.getValue() === values[index]; })) {
          throw new Error('Invalid section');
        }
        response.withItemResponse(choice.createResponse(values[index]));
      } else {
        response.withItemResponse(item.asTextItem().createResponse(values[index]));
      }
      });
    });
    // Persist BEFORE submission. An interruption between Google saving and our
    // receipt cannot safely be retried automatically: keep an uncertain record.
    measure('writePendingMs', function () { properties.setProperty(key, JSON.stringify({ state: 'uncertain', fingerprint: fingerprint })); });
    const saved = measure('submitMs', function () { return response.submit(); });
    if (!measure('readSavedIdMs', function () { return saved.getId(); })) return reply({ ok: false, code: 'uncertain', requestId: p.requestId });
    measure('writeReceiptMs', function () { properties.setProperty(key, JSON.stringify({ state: 'saved', fingerprint: fingerprint })); });
    return reply({ ok: true, code: 'saved', requestId: p.requestId });
  } catch (error) {
    // Do not log guest data or internal Google exception messages.
    console.error('Registration request failed; inspect request state before retrying.');
    return reply({ ok: false, code: 'unavailable' });
  } finally {
    try {
      measure('releaseLockMs', function () { if (lock && lock.hasLock()) lock.releaseLock(); });
    } finally {
      timings.totalMs = Date.now() - started;
      console.log(JSON.stringify({ event: 'registration_timing', version: 2, outcome: outcome, timings: timings }));
    }
  }
}
