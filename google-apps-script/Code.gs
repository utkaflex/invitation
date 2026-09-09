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
  return json_({ service: '70aero-registration', version: 1,
    configured: Boolean(PropertiesService.getScriptProperties().getProperty('FORM_ID')) });
}

function doPost(event) {
  let lock;
  try {
    const p = event && event.parameter || {};
    if (!event || !event.postData || event.postData.length > 12000) {
      return json_({ ok: false, code: 'invalid' });
    }
    if (!/^[a-f0-9-]{36}$/.test(p.requestId || '') || p.consent !== 'yes' || p.website) {
      return json_({ ok: false, code: 'invalid' });
    }
    const values = FIELD_MAP.map(function (field) { return String(p[field[0]] || '').trim(); });
    if (values.some(function (v) { return !v || v.length > 500; }) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[4])) {
      return json_({ ok: false, code: 'invalid' });
    }
    const properties = PropertiesService.getScriptProperties();
    const formId = properties.getProperty('FORM_ID');
    if (!formId) return json_({ ok: false, code: 'unavailable' });
    const fingerprint = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256, JSON.stringify(values)));
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return json_({ ok: false, code: 'busy' });
    const key = 'request:' + p.requestId;
    const previous = properties.getProperty(key);
    if (previous) {
      const record = JSON.parse(previous);
      if (record.fingerprint !== fingerprint) return json_({ ok: false, code: 'conflict' });
      return json_({ ok: record.state === 'saved', code: record.state, requestId: p.requestId });
    }
    const form = FormApp.openById(formId);
    if (!form.isAcceptingResponses()) return json_({ ok: false, code: 'closed' });
    const response = form.createResponse();
    FIELD_MAP.forEach(function (field, index) {
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
    // Persist BEFORE submission. An interruption between Google saving and our
    // receipt cannot safely be retried automatically: keep an uncertain record.
    properties.setProperty(key, JSON.stringify({ state: 'uncertain', fingerprint: fingerprint }));
    const saved = response.submit();
    if (!saved.getId()) return json_({ ok: false, code: 'uncertain', requestId: p.requestId });
    properties.setProperty(key, JSON.stringify({ state: 'saved', fingerprint: fingerprint }));
    return json_({ ok: true, code: 'saved', requestId: p.requestId });
  } catch (error) {
    // Do not log guest data or internal Google exception messages.
    console.error('Registration request failed; inspect request state before retrying.');
    return json_({ ok: false, code: 'unavailable' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
