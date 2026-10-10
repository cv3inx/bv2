import assert from 'node:assert/strict';
import test from 'node:test';
import { A2UI, buildA2UIWidget } from '../lib/Utils/a2ui.js';
import { generateWAMessageContent } from '../lib/Utils/messages.js';
import { proto } from '../WAProto/index.js';

const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error'].map(name => [name, () => {}]));
const parse = widget => JSON.parse(widget.data);

test('a component tree compiles into the createSurface envelope', () => {
    const ui = new A2UI();
    const title = ui.text('Halo!', { variant: 'h1' });
    const label = ui.text('Klik saya');
    const button = ui.button(label, { action: { name: 'noop' } });
    ui.root([ui.card(ui.column([title, button]))]);

    const widget = ui.build({ uuid: 'fixed-uuid' });
    assert.equal(widget.type, 'im_a2ui');
    assert.equal(widget.uuid, 'fixed-uuid');

    const data = parse(widget);
    assert.equal(data.version, 'v0.9');
    assert.equal(data.createSurface.surfaceId, 'starcore-widget=fixed-uuid');
    assert.match(data.createSurface.catalogId, /a2ui\.org/);

    // the implicit root column names the top-level ids, every registered component follows
    const [root, ...components] = data.createSurface.components;
    assert.deepEqual(root, { id: 'root', component: 'Column', children: [components.find(c => c.component === 'Card').id] });
    assert.deepEqual(components.map(c => c.component).sort(), ['Button', 'Card', 'Column', 'Text', 'Text']);
    assert.deepEqual(components.find(c => c.component === 'Button'), {
        id: button, component: 'Button', child: label, variant: 'primary', action: { name: 'noop' }
    });
    assert.deepEqual(components.find(c => c.id === title), { id: title, component: 'Text', text: 'Halo!', variant: 'h1' });
});

test('wrapped: false emits the bare component list', () => {
    const ui = new A2UI();
    ui.root([ui.text('hi')]);
    const data = parse(ui.build({ wrapped: false }));
    assert.deepEqual(Object.keys(data), ['components']);
});

test('ids are generated per component type and collisions are refused', () => {
    const ui = new A2UI();
    assert.equal(ui.text('a'), 'text_0');
    assert.equal(ui.text('b'), 'text_1');
    assert.equal(ui.divider(), 'divider_2');
    assert.equal(ui.text('c', { id: 'mine' }), 'mine');
    assert.throws(() => ui.text('d', { id: 'mine' }), /already used/);
});

test('containers and build reject incomplete input', () => {
    const ui = new A2UI();
    assert.throws(() => ui.build(), /Call root/);
    assert.throws(() => ui.column([]), /at least one child id/);
    assert.throws(() => ui.row([]), /at least one child id/);
    assert.throws(() => ui.button(undefined), /requires the id of a child component/);
    assert.throws(() => ui.card(undefined), /requires the id of a child component/);
    assert.throws(() => ui.choicePicker('pick', []), /non-empty options array/);
    assert.throws(() => ui.root([]), /non-empty array/);
});

test('a listCard replaces the component tree', () => {
    const ui = new A2UI();
    ui.text('ignored');
    ui.root([ui.text('also ignored')]);
    ui.listCard({
        title: 'Menu',
        fallbackText: 'Lihat menu',
        items: [{ title: 'Nasi Goreng', price: 'Rp15.000' }, { title: 'Es Teh', assetId: 'fixed', emphasis: 'weak' }]
    });

    const widget = ui.build();
    assert.equal(widget.fallback, 'Lihat menu');
    const data = parse(widget);
    assert.equal(data.type, 'list_card');
    assert.equal(data.title, 'Menu');
    assert.deepEqual(data.items[0], {
        asset_id: data.items[0].asset_id, asset_type: 'PRODUCT_ITEM', title: 'Nasi Goreng',
        trailing_label: 'Rp15.000', trailing_emphasis: 'strong'
    });
    assert.match(data.items[0].asset_id, /^[0-9a-f]{17}$/);
    assert.deepEqual(data.items[1], {
        asset_id: 'fixed', asset_type: 'PRODUCT_ITEM', title: 'Es Teh',
        trailing_label: '', trailing_emphasis: 'weak'
    });

    assert.throws(() => new A2UI().listCard({ items: [{ title: 'x' }] }), /requires a title/);
    assert.throws(() => new A2UI().listCard({ title: 'x', items: [] }), /non-empty items array/);
});

test('buildA2UIWidget accepts an instance or a built payload and rejects anything else', () => {
    const ui = new A2UI();
    ui.root([ui.text('hi')]);
    const built = ui.build();
    assert.equal(buildA2UIWidget(built), built);
    assert.equal(typeof buildA2UIWidget(ui).data, 'string');
    for (const bad of [null, undefined, {}, 'text', { data: 5 }]) {
        assert.throws(() => buildA2UIWidget(bad), /A2UI instance or a built widget payload/);
    }
});

// --- message content wiring ---

const makeUi = () => {
    const ui = new A2UI();
    ui.root([ui.text('hi')]);
    return ui;
};

test('a2ui content becomes an interactiveMessage carrying bloksWidget', async () => {
    const content = await generateWAMessageContent({ a2ui: makeUi(), text: 'Widget', footer: 'A2UI' }, { logger });
    const interactive = content.interactiveMessage;

    assert.equal(interactive.body.text, 'Widget');
    assert.equal(interactive.footer.text, 'A2UI');
    assert.equal(interactive.header.hasMediaAttachment, false);
    assert.equal(typeof interactive.bloksWidget.data, 'string');
    assert.equal(interactive.bloksWidget.type, 'im_a2ui');
    // nativeFlowMessage is always present: it keys the interactive render and the <biz> node
    assert.ok(interactive.nativeFlowMessage);
    assert.equal(interactive.nativeFlowMessage.messageParamsJson, '');
    assert.equal(content.messageContextInfo.messageSecret.length, 32);
});

test('singleScreen drops the bubble around the widget', async () => {
    const content = await generateWAMessageContent({ a2ui: makeUi(), text: 'ignored', singleScreen: true }, { logger });
    const interactive = content.interactiveMessage;
    assert.equal(interactive.body, undefined);
    assert.equal(interactive.footer, undefined);
    assert.equal(interactive.header, undefined);
    assert.ok(interactive.bloksWidget);
});

test('a2ui can carry native flow buttons, and the socket then adds the biz node', async () => {
    const { shouldIncludeBizBinaryNode } = await import('../lib/Utils/messages.js');
    const content = await generateWAMessageContent({
        a2ui: makeUi(),
        text: 'Widget',
        // this fork's own button shape, shared with the plain nativeFlow path
        nativeFlow: [{ text: 'Open', url: 'https://example.invalid' }]
    }, { logger });

    const buttons = content.interactiveMessage.nativeFlowMessage.buttons;
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].name, 'cta_url');
    const params = JSON.parse(buttons[0].buttonParamsJson);
    assert.equal(params.display_text, 'Open');
    assert.equal(params.url, 'https://example.invalid');
    assert.equal(shouldIncludeBizBinaryNode(proto.Message.fromObject(content)), true);
});

test('a reused messageSecret is honoured and a bad widget is rejected before encoding', async () => {
    const messageSecret = Buffer.alloc(32, 7);
    const content = await generateWAMessageContent({ a2ui: makeUi(), messageSecret }, { logger });
    assert.deepEqual(Buffer.from(content.messageContextInfo.messageSecret), messageSecret);

    await assert.rejects(generateWAMessageContent({ a2ui: { nope: true } }, { logger }), /A2UI instance or a built widget payload/);
});
