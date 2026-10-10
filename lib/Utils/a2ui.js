// A2UI (Agent-to-UI) widget builder. Declarative components — Text, Image, Video, Button,
// Card, Column, Row, Divider, CheckBox, TextField, ChoicePicker, plus the `listCard` shortcut
// — compiled into the JSON payload WhatsApp carries in `interactiveMessage.bloksWidget`.
//
// Ported from @rennzsync/baileys (MIT).
//
// Every builder method registers a component and returns its id; ids are what the container
// methods take, so a tree is written bottom-up:
//
//     const ui = new A2UI()
//     const title = ui.text('Hello', { variant: 'h1' })
//     const button = ui.button(ui.text('Press me'), { action: { name: 'noop' } })
//     ui.root([ui.card(ui.column([title, button]))])
//     await sock.sendMessage(jid, { a2ui: ui, text: 'Widget' })
//
// This is an internal WhatsApp format: a send can succeed while the recipient's client renders
// nothing. Verify against your target client build before relying on it.
import { randomUUID } from 'crypto';
const DEFAULT_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
export class A2UI {
    constructor({ catalogId = DEFAULT_CATALOG_ID, version = 'v0.9' } = {}) {
        this._version = version;
        this._catalogId = catalogId;
        this._components = new Map();
        this._counter = 0;
        this._rootChildren = [];
        this._listCardPayload = undefined;
    }
    #nextId(prefix) {
        return `${prefix}_${(this._counter++).toString(36)}`;
    }
    #reg(id, component, extra = {}) {
        id ??= this.#nextId(component.toLowerCase());
        if (this._components.has(id)) {
            throw new Error(`Component id "${id}" already used`);
        }
        this._components.set(id, { id, component, ...extra });
        return id;
    }
    text(text, { id, variant = 'body' } = {}) {
        return this.#reg(id, 'Text', { text, variant });
    }
    image(url, { id, variant, fit = 'cover' } = {}) {
        return this.#reg(id, 'Image', { url, ...(variant ? { variant } : {}), fit });
    }
    video(url, { id } = {}) {
        return this.#reg(id, 'Video', { url });
    }
    checkbox(label, { id, value = false } = {}) {
        return this.#reg(id, 'CheckBox', { label, value });
    }
    textField(label, { id, variant = 'text' } = {}) {
        return this.#reg(id, 'TextField', { label, variant });
    }
    button(childId, { id, variant = 'primary', action } = {}) {
        if (!childId) {
            throw new TypeError('button(childId) requires the id of a child component (e.g. from .text())');
        }
        return this.#reg(id, 'Button', { child: childId, variant, ...(action ? { action } : {}) });
    }
    card(childId, { id } = {}) {
        if (!childId) {
            throw new TypeError('card(childId) requires the id of a child component');
        }
        return this.#reg(id, 'Card', { child: childId });
    }
    column(children = [], { id, justify, align } = {}) {
        if (!children.length) {
            throw new TypeError('column(children) requires at least one child id');
        }
        return this.#reg(id, 'Column', { children, ...(justify ? { justify } : {}), ...(align ? { align } : {}) });
    }
    row(children = [], { id } = {}) {
        if (!children.length) {
            throw new TypeError('row(children) requires at least one child id');
        }
        return this.#reg(id, 'Row', { children });
    }
    divider({ id } = {}) {
        return this.#reg(id, 'Divider', {});
    }
    choicePicker(label, options, { id, variant = 'mutuallyExclusive', value, displayStyle = 'checkbox', filterable = false } = {}) {
        if (!Array.isArray(options) || !options.length) {
            throw new TypeError('choicePicker(label, options) requires a non-empty options array of {label, value}');
        }
        return this.#reg(id, 'ChoicePicker', {
            label,
            variant,
            ...(value !== undefined ? { value } : {}),
            options,
            displayStyle,
            filterable
        });
    }
    /** Names the top-level components. Required before `build()` unless `listCard` was used. */
    root(children) {
        if (!Array.isArray(children) || !children.length) {
            throw new TypeError('root(children) requires a non-empty array of top-level component ids');
        }
        this._rootChildren = children;
        return this;
    }
    /**
     * Shortcut for the product-list widget, which uses its own payload shape rather than the
     * component catalog. It replaces whatever the component methods built — `build()` returns
     * this payload and ignores `root()`.
     */
    listCard({ title, items, fallbackText, uuid = randomUUID() } = {}) {
        if (!title) {
            throw new TypeError('listCard requires a title');
        }
        if (!Array.isArray(items) || !items.length) {
            throw new TypeError('listCard requires a non-empty items array');
        }
        this._listCardPayload = {
            uuid,
            data: JSON.stringify({
                type: 'list_card',
                title,
                fallback_text: fallbackText ?? '',
                items: items.map(item => ({
                    asset_id: item.assetId ?? randomUUID().replace(/-/g, '').slice(0, 17),
                    asset_type: item.assetType ?? 'PRODUCT_ITEM',
                    title: item.title,
                    trailing_label: item.price ?? item.trailingLabel ?? '',
                    trailing_emphasis: item.emphasis ?? 'strong'
                }))
            }),
            type: 'im_a2ui',
            fallback: fallbackText ?? ''
        };
        return this;
    }
    /** Compiles the tree into the `bloksWidget` payload. Called for you by `sendMessage`. */
    build({ uuid = randomUUID(), surfaceId, type = 'im_a2ui', wrapped = true } = {}) {
        if (this._listCardPayload) {
            return this._listCardPayload;
        }
        if (!this._rootChildren.length) {
            throw new Error('Call root([...ids]) before build()');
        }
        const root = { id: 'root', component: 'Column', children: this._rootChildren };
        const components = [root, ...this._components.values()];
        const data = wrapped
            ? {
                version: this._version,
                createSurface: {
                    surfaceId: surfaceId ?? `starcore-widget=${uuid}`,
                    catalogId: this._catalogId,
                    components
                }
            }
            : { components };
        return {
            uuid,
            data: JSON.stringify(data),
            type
        };
    }
}
/** Accepts an `A2UI` instance or an already-built payload, and returns the payload. */
export const buildA2UIWidget = (a2ui, options = {}) => {
    const widget = typeof a2ui?.build === 'function' ? a2ui.build(options) : a2ui;
    if (!widget || typeof widget.data !== 'string') {
        throw new TypeError('a2ui must be an A2UI instance or a built widget payload with a `data` string');
    }
    return widget;
};
