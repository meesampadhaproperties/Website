const test = require('node:test');
const assert = require('node:assert');
require('../setup');
const { whatsappBubble } = require('../../lib/whatsapp-activity');

test('new bot entries: customer on one side, bot on the other', () => {
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'whatsapp_in', description: 'hi' }), { side: 'customer', text: 'hi' });
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'whatsapp_out', description: 'Sent the welcome menu' }), { side: 'bot', text: 'Sent the welcome menu' });
});

test('older bot entries still read well', () => {
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'whatsapp_message', description: 'WhatsApp bot: sent: hi' }), { side: 'customer', text: 'hi' });
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'whatsapp_message', description: 'WhatsApp bot: looked at the projects list' }), { side: 'hidden' });
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'whatsapp_message', description: 'WhatsApp bot: asked for contact details' }), { side: 'hidden' });
});

test('entries from the previous bot (text in details) are understood', () => {
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'Incoming WhatsApp', details: 'Type: text\nMessage: "hello"' }), { side: 'customer', text: 'hello' });
  assert.strictEqual(whatsappBubble({ activity_type: 'Outgoing WhatsApp', details: 'Menu sent' }).side, 'bot');
});

test('everything else becomes a grey note with its text', () => {
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'website_enquiry', description: 'Website enquiry: 2BHK' }), { side: 'chip', text: 'Website Enquiry: Website enquiry: 2BHK' });
  assert.deepStrictEqual(whatsappBubble({ activity_type: 'status_change' }), { side: 'chip', text: 'Status Change' });
  assert.strictEqual(whatsappBubble({}).side, 'chip');
});
