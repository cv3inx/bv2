import { assertNodeErrorFree } from '../../WABinary/index.js';
import { USyncUser } from '../USyncUser.js';
export class USyncUsernameProtocol {
    constructor() {
        this.name = 'username';
    }
    getQueryElement() {
        return {
            tag: 'username',
            attrs: {}
        };
    }
    getUserElement(user) {
        void user;
        return null;
    }
    parser(node) {
        if (node.tag === 'username') {
            assertNodeErrorFree(node);
            if (typeof node.content === 'string') {
                return node.content;
            }
            // the binary decoder hands back Uint8Array for BINARY_8/20/32 payloads
            if (node.content instanceof Uint8Array) {
                return Buffer.from(node.content).toString('utf-8');
            }
        }
        return null;
    }
}
//# sourceMappingURL=USyncUsernameProtocol.js.map