import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { makeCommunitiesSocket } from './communities.js';
import { makeInteropSocket } from './interop.js';
import { makePrivacySocket } from './privacy.js';
import { makeRegistrationSocket } from './registration.js';
import { makeManagedAccountSocket } from './managed-account.js';
import { makeGraphQLSocket } from './graphql.js';
// export the last socket layer
const makeWASocket = (config) => {
    const newConfig = {
        ...DEFAULT_CONNECTION_CONFIG,
        ...config
    };
    // the layers below only add methods on top of the socket — they take the
    // built socket rather than the config, so ordering between them is free
    return makeGraphQLSocket(makeManagedAccountSocket(makeRegistrationSocket(makePrivacySocket(makeInteropSocket(makeCommunitiesSocket(newConfig))))));
};
export default makeWASocket;
//# sourceMappingURL=index.js.map
