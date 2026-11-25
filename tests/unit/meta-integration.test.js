const test = require('node:test');
const assert = require('node:assert');
require('../setup');

const {
  isMetaConfigured,
  getMetaOAuthUrl,
  fetchHistoricalLeads,
  parseMetaLeadFields,
  formatMetaQuestionKey,
  formatMetaAnswerValue,
  formatMetaCustomFields
} = require('@/lib/meta.ts');

test('Meta Integration: Configuration detector', () => {
  const isConfigured = isMetaConfigured();
  assert.strictEqual(typeof isConfigured, 'boolean');
});

test('Meta Integration: Generates valid OAuth Dialog URL with required permissions', () => {
  const url = getMetaOAuthUrl('test_state_token_123', 'http://localhost:3000/api/auth/meta/callback');
  assert.ok(url.startsWith('https://www.facebook.com/' + require('../../lib/site-config').META_GRAPH_VERSION + '/dialog/oauth'));
  assert.ok(url.includes('pages_manage_metadata'));
  assert.ok(url.includes('client_id='));
  assert.ok(url.includes('state=test_state_token_123'));
  assert.ok(url.includes('redirect_uri='));
  assert.ok(url.includes('pages_show_list'));
  assert.ok(url.includes('pages_read_engagement'));
  assert.ok(url.includes('pages_manage_ads'));
  assert.ok(url.includes('leads_retrieval'));
});

test('Meta Integration: Historical lead puller respects date filtering (30, 60, 90 days, and All Leads)', async () => {
  const res30 = await fetchHistoricalLeads('form_mock_123', 'simulated_token', 100, 30);
  assert.strictEqual(res30.success, true);
  assert.ok(Array.isArray(res30.leads));
  assert.ok(res30.leads.length > 0);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  res30.leads.forEach((lead) => {
    const leadTime = new Date(lead.createdTime).getTime();
    assert.ok(leadTime >= thirtyDaysAgo - 5000, 'Lead must not be older than 30 days');
    assert.ok(lead.leadId);
    assert.ok(lead.fullName);
    assert.ok(lead.phoneNumber);
  });

  // Test 90 days
  const res90 = await fetchHistoricalLeads('form_mock_123', 'simulated_token', 100, 90);
  assert.strictEqual(res90.success, true);
  assert.ok(res90.leads.length >= res30.leads.length);

  // Test All Leads (daysBack = 0)
  const resAll = await fetchHistoricalLeads('form_mock_123', 'simulated_token', 100, 0);
  assert.strictEqual(resAll.success, true);
  assert.ok(resAll.leads.length >= res90.leads.length, 'All Leads (daysBack = 0) should return all historical leads');
});

test('Meta Integration: parseMetaLeadFields combines first and last name correctly', () => {
  const fields = [
    { name: 'first_name', values: ['Ananya'] },
    { name: 'last_name', values: ['Sharma'] },
    { name: 'email', values: ['ananya.sharma@example.com'] },
    { name: 'phone_number', values: ['p:+919876543210'] },
    { name: 'city', values: ['Hyderabad'] }
  ];

  const parsed = parseMetaLeadFields(fields, 'lead_101', 'form_202', 'page_303');
  assert.strictEqual(parsed.fullName, 'Ananya Sharma');
  assert.strictEqual(parsed.phoneNumber, '+919876543210', 'Should strip p: prefix from phone');
  assert.strictEqual(parsed.email, 'ananya.sharma@example.com');
  assert.strictEqual(parsed.city, 'Hyderabad');
  assert.strictEqual(parsed.leadId, 'lead_101');
  assert.strictEqual(parsed.formId, 'form_202');
});

test('Meta Integration: parseMetaLeadFields prioritizes explicit full_name and cleans tel: prefix', () => {
  const fields = [
    { name: 'full_name', values: ['Dr. Vikramaditya Verma'] },
    { name: 'phone', values: ['tel:+919845012345'] }
  ];

  const parsed = parseMetaLeadFields(fields, 'lead_102', 'form_202');
  assert.strictEqual(parsed.fullName, 'Dr. Vikramaditya Verma');
  assert.strictEqual(parsed.phoneNumber, '+919845012345', 'Should strip tel: prefix from phone');
});

test('Meta Integration: Formats question keys, answers, and custom fields faithfully', () => {
  // 1. Question Keys
  assert.strictEqual(formatMetaQuestionKey('city'), 'City');
  assert.strictEqual(formatMetaQuestionKey('job_title'), 'Job Title');
  assert.strictEqual(formatMetaQuestionKey('what_is_your_approximate_budget?'), 'What is your approximate budget?');
  assert.strictEqual(formatMetaQuestionKey('what_is_your_preferred_plot_size?'), 'What is your preferred plot size?');
  assert.strictEqual(formatMetaQuestionKey('preferred_configuration'), 'Preferred Configuration');

  // 2. Answers
  assert.strictEqual(formatMetaAnswerValue('₹30–50_lakhs'), '₹30–50 Lakhs');
  assert.strictEqual(formatMetaAnswerValue('167_sq.yds'), '167 Sq.yds');
  assert.strictEqual(formatMetaAnswerValue('business'), 'Business');
  assert.strictEqual(formatMetaAnswerValue('eluru'), 'Eluru');

  // 3. Custom Fields Multiline Formatter
  const rawFields = {
    full_name: 'Sunkara',
    phone: '+919848213319',
    city: 'eluru',
    job_title: 'business',
    'what_is_your_approximate_budget?': '₹30–50_lakhs',
    'what_is_your_preferred_plot_size?': '167_sq.yds'
  };

  const formatted = formatMetaCustomFields(rawFields);
  assert.ok(!formatted.includes('full_name'));
  assert.ok(!formatted.includes('+919848213319'));
  assert.ok(formatted.includes('City: Eluru'));
  assert.ok(formatted.includes('Job Title: Business'));
  assert.ok(formatted.includes('What is your approximate budget?: ₹30–50 Lakhs'));
  assert.ok(formatted.includes('What is your preferred plot size?: 167 Sq.yds'));
});

test('Meta accuracy: multi-select answers keep every value', () => {
  const parsed = parseMetaLeadFields([
    { name: 'full_name', values: ['Asha Rao'] },
    { name: 'phone_number', values: ['+919000000001'] },
    { name: 'interested_in', values: ['plot', 'villa'] },
  ], 'L1', 'F1');
  assert.deepStrictEqual(parsed.rawFieldData.interested_in, ['plot', 'villa']);
  assert.ok(formatMetaCustomFields(parsed.rawFieldData).includes('Interested In: Plot, Villa'));
});

test('Meta accuracy: no keyword guessing for contact fields', () => {
  const parsed = parseMetaLeadFields([
    { name: 'company_name', values: ['Acme'] },
    { name: 'preferred_contact_time', values: ['evening'] },
    { name: 'preferred_location', values: ['Kokapet'] },
    { name: 'full_name', values: ['Ravi Kumar'] },
    { name: 'phone_number', values: ['p:+919000000002'] },
  ], 'L2', 'F1');
  assert.strictEqual(parsed.fullName, 'Ravi Kumar');
  assert.strictEqual(parsed.phoneNumber, '+919000000002');
  assert.strictEqual(parsed.city, '');
});

test('Meta accuracy: real question labels, option labels and question types win', () => {
  const questions = [
    { key: 'budget_q', label: 'What is your budget (₹)?', type: 'CUSTOM', options: [{ key: 'b_1', value: '30–50 Lakhs' }] },
    { key: 'my_mobile', label: 'Mobile', type: 'PHONE' },
  ];
  const parsed = parseMetaLeadFields([
    { name: 'budget_q', values: ['b_1'] },
    { name: 'my_mobile', values: ['+919000000003'] },
  ], 'L3', 'F1', '', undefined, 'X', questions);
  assert.strictEqual(parsed.phoneNumber, '+919000000003');
  assert.strictEqual(formatMetaCustomFields(parsed.rawFieldData, questions), 'What is your budget (₹)?: 30–50 Lakhs');
});

test('Meta accuracy: free-text answers are kept exactly as typed', () => {
  assert.strictEqual(formatMetaAnswerValue('call me after 6_pm please'), 'call me after 6_pm please');
  assert.strictEqual(formatMetaAnswerValue('user_name@mail.com'), 'user_name@mail.com');
});
