const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { ingestMetaLead } = require('../../lib/meta-ingest');

// Minimal chainable Supabase mock. meta_forms lookup returns `formRow`, projects lookup returns `project`,
// a phone search on leads returns `existingLeads`. Every insert and update is recorded.
function mockDb({ formRow = null, project = null, existingLeads = [] } = {}) {
  const inserts = [];
  const updates = [];
  const chain = (table) => {
    let ilikeCol = null;
    const q = {
      select: () => q, eq: () => q, in: () => q, order: () => q,
      ilike: (col) => { ilikeCol = col; return q; },
      limit: () => Promise.resolve({
        data: table === 'meta_forms' ? (formRow ? [formRow] : [])
          : table === 'leads' && ilikeCol === 'phone' ? existingLeads
          : [],
      }),
      maybeSingle: () => Promise.resolve({ data: table === 'projects' ? project : null }),
      insert: (row) => { inserts.push({ table, row }); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'lead-1' } }) }), then: (r) => r({ error: null }) }; },
      update: (row) => { updates.push({ table, row }); return q; },
    };
    return q;
  };
  return { db: { from: chain }, inserts, updates };
}
const lead = { leadId: 'L1', fullName: 'Test', phoneNumber: '+919000000001', email: '', city: '', createdTime: '2026-11-22T10:00:00Z', rawFieldData: {} };
const params = { lead, formId: 'F1', projectName: 'Meta Client', origin: 'lead' };

test('form switched OFF: lead is skipped and nothing is saved', async () => {
  const { db, inserts } = mockDb({ formRow: { is_active: false } });
  const res = await ingestMetaLead(db, params);
  assert.strictEqual(res.outcome, 'skipped');
  assert.strictEqual(inserts.length, 0);
});

test('form switched ON: lead is saved', async () => {
  const { db, inserts } = mockDb({ formRow: { is_active: true } });
  const res = await ingestMetaLead(db, params);
  assert.strictEqual(res.outcome, 'inserted');
  assert.ok(inserts.some((i) => i.table === 'leads'));
});

test('unknown form (not configured): lead is still saved', async () => {
  const { db } = mockDb();
  assert.strictEqual((await ingestMetaLead(db, params)).outcome, 'inserted');
});

test('project: a form linked to a project gives its leads that project (not the Meta client name)', async () => {
  const { db, inserts } = mockDb({ formRow: { is_active: true, lead_project_id: 'p1' }, project: { id: 'p1', name: 'Arudra' } });
  await ingestMetaLead(db, params);
  const row = inserts.find((i) => i.table === 'leads').row;
  assert.strictEqual(row.project, 'Arudra');
  assert.strictEqual(row.project_id, 'p1');
  assert.deepStrictEqual(row.enquiry_projects, ['Arudra']);
  assert.strictEqual(row.enquiry_count, 1);
});

test('project: an unlinked form leaves the project empty ("Project not set")', async () => {
  const { db, inserts } = mockDb({ formRow: { is_active: true } });
  await ingestMetaLead(db, params);
  const row = inserts.find((i) => i.table === 'leads').row;
  assert.strictEqual(row.project, null);
  assert.deepStrictEqual(row.enquiry_projects, []);
});

test('repeat enquiry: same number in another format is added to the existing lead, not duplicated', async () => {
  const existingLeads = [{ id: 'old', phone: '9000000001', form_id: null, enquiry_count: 1, last_enquiry_at: '2026-11-01T00:00:00Z', enquiry_projects: ['XYZ'] }];
  const { db, inserts, updates } = mockDb({ formRow: { is_active: true, lead_project_id: 'p1' }, project: { id: 'p1', name: 'Arudra' }, existingLeads });
  const res = await ingestMetaLead(db, params);
  assert.strictEqual(res.outcome, 'appended');
  assert.strictEqual(res.leadId, 'old');
  assert.ok(!inserts.some((i) => i.table === 'leads'));
  const act = inserts.find((i) => i.table === 'lead_activities').row;
  assert.strictEqual(act.lead_id, 'old');
  assert.strictEqual(act.metadata._project, 'Arudra');
  const upd = updates.find((u) => u.table === 'leads').row;
  assert.strictEqual(upd.enquiry_count, 2);
  assert.strictEqual(upd.project, 'Arudra');
  assert.deepStrictEqual(upd.enquiry_projects, ['Arudra', 'XYZ']);
  assert.strictEqual(upd.form_id, 'F1'); // a manual lead that submits a Meta form joins the Inbox
  assert.strictEqual(upd.last_enquiry_at, '2026-11-22T10:00:00.000Z');
});
