import assert from 'node:assert/strict';
import test from 'node:test';
import { proto } from '../WAProto/index.js';

// `long` is not a dependency, so every 64-bit field has to come back through the BigInt helpers in
// WAProto/index.js rather than protobufjs' `$util.Long.prototype.toString` (which throws when Long
// is absent). A regenerate that loses those helpers breaks message timestamps silently.
test('proto: uint64 decodes to a decimal string at full width', () => {
    const bytes = proto.ADVDeviceIdentity.encode({
        timestamp: '18446744073709551615' // 2^64 - 1
    }).finish();
    const decoded = proto.ADVDeviceIdentity.decode(bytes);
    assert.equal(proto.ADVDeviceIdentity.toObject(decoded, { longs: String }).timestamp, '18446744073709551615');
    assert.equal(proto.ADVDeviceIdentity.toObject(decoded, { longs: Number }).timestamp, 18446744073709552000);
});

test('proto: signed int64 keeps its sign', () => {
    const bytes = proto.ACP2Setting.encode({
        settingTimestamp: '-9223372036854775808' // -2^63
    }).finish();
    const decoded = proto.ACP2Setting.decode(bytes);
    assert.equal(proto.ACP2Setting.toObject(decoded, { longs: String }).settingTimestamp, '-9223372036854775808');
    assert.equal(proto.ACP2Setting.toObject(decoded, { longs: Number }).settingTimestamp, -9223372036854775808);
});

// wa-proto dropped these two messages; this fork keeps them because the LID<->PN pairs arrive as an
// opaque payload and lib/Utils/process-message.js still decodes them.
test('proto: fork-local LID migration payload still round-trips', () => {
    const bytes = proto.LIDMigrationMappingSyncPayload.encode({
        pnToLidMappings: [{ pn: 628123456789n.toString(), assignedLid: '987654321' }],
        chatDbMigrationTimestamp: '1700000000'
    }).finish();
    const decoded = proto.LIDMigrationMappingSyncPayload.toObject(
        proto.LIDMigrationMappingSyncPayload.decode(bytes),
        { longs: String }
    );
    assert.deepEqual(decoded.pnToLidMappings, [{ pn: '628123456789', assignedLid: '987654321' }]);
    assert.equal(decoded.chatDbMigrationTimestamp, '1700000000');
});

// A message type that only exists in the newer schema: proof the regeneration actually landed.
test('proto: schema is the regenerated one', () => {
    assert.equal(typeof proto.BotHistoryShareMetadata, 'function');
    assert.equal(typeof proto.CoexStateSync, 'function');
});
