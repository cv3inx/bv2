export type A2UIWidget = {
    uuid: string;
    data: string;
    type: string;
    fallback?: string;
};
export type A2UIBuildOptions = {
    uuid?: string;
    surfaceId?: string;
    type?: string;
    /** `false` emits a bare `{ components }` payload instead of the `createSurface` envelope. */
    wrapped?: boolean;
};
export type A2UIChoice = {
    label: string;
    value: unknown;
};
export type A2UIListCardItem = {
    title: string;
    price?: string;
    trailingLabel?: string;
    assetId?: string;
    assetType?: string;
    emphasis?: string;
};
/** Every method registers a component and returns its id; container methods take those ids. */
export declare class A2UI {
    constructor(options?: { catalogId?: string; version?: string });
    text(text: string, options?: { id?: string; variant?: string }): string;
    image(url: string, options?: { id?: string; variant?: string; fit?: string }): string;
    video(url: string, options?: { id?: string }): string;
    checkbox(label: string, options?: { id?: string; value?: boolean }): string;
    textField(label: string, options?: { id?: string; variant?: string }): string;
    button(childId: string, options?: { id?: string; variant?: string; action?: any }): string;
    card(childId: string, options?: { id?: string }): string;
    column(children: string[], options?: { id?: string; justify?: string; align?: string }): string;
    row(children: string[], options?: { id?: string }): string;
    divider(options?: { id?: string }): string;
    choicePicker(label: string, options: A2UIChoice[], extra?: {
        id?: string;
        variant?: string;
        value?: unknown;
        displayStyle?: string;
        filterable?: boolean;
    }): string;
    root(children: string[]): this;
    listCard(input: { title: string; items: A2UIListCardItem[]; fallbackText?: string; uuid?: string }): this;
    build(options?: A2UIBuildOptions): A2UIWidget;
}
export declare const buildA2UIWidget: (a2ui: A2UI | A2UIWidget, options?: A2UIBuildOptions) => A2UIWidget;
