#!/usr/bin/env node
/**
 * Regenerates WAProto/index.js and WAProto/index.d.ts from wppconnect-team/wa-proto.
 *
 *   node scripts/generate-waproto.mjs            # pinned ref below
 *   WA_PROTO_REF=v2.3000.1054053575 node scripts/generate-waproto.mjs
 *
 * The output is committed (package.json ships WAProto/**), so this runs only when the schema is
 * updated — never during install, test or publish.
 *
 * Four things are not plain `pbjs` defaults, and each one is load-bearing:
 *
 *  - `required` is stripped. WhatsApp's .proto is proto3 but still uses the proto2 keyword, which
 *    protobufjs rejects; upstream patches protobufjs' parser instead. Stripping is the same result
 *    (proto3 treats every field as optional) without mutating node_modules.
 *  - the package is renamed waproto -> proto, which is the namespace every lib/ call site imports.
 *  - int64/uint64 values come back as strings, not Long objects: `long` is not a dependency here,
 *    and protobufjs' own `$util.Long.prototype.toString` throws without it. longToString/longToNumber
 *    convert LongBits with BigInt instead (see the committed history: this is a deliberate
 *    performance patch, not an accident).
 *  - two message types are appended from this fork: wa-proto dropped them, but
 *    lib/Utils/process-message.js still decodes that payload.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.env.WA_PROTO_REF || 'v2.3000.1054053575';
const SOURCE = `https://raw.githubusercontent.com/wppconnect-team/wa-proto/${REF}/WAProto.proto`;

/**
 * Kept because `proto.Message.ProtocolMessage.Type.LID_MIGRATION_MAPPING_SYNC` carries this as an
 * opaque byte payload (LIDMigrationMappingSyncMessage.encodedMappingPayload) and the LID<->PN pairs
 * in it are what gets stored in the signal store. Field numbers are the ones WhatsApp puts on the
 * wire, taken from the last wa-proto release that still declared these messages.
 */
const FORK_LOCAL_MESSAGES = `
// ---- fork-local, see scripts/generate-waproto.mjs ----
message LIDMigrationMapping {
    optional uint64 pn = 1;
    optional uint64 assignedLid = 2;
    optional uint64 latestLid = 3;
}
message LIDMigrationMappingSyncPayload {
    repeated LIDMigrationMapping pnToLidMappings = 1;
    optional uint64 chatDbMigrationTimestamp = 2;
}
`;

/** protobufjs' own long conversion, replaced below with the BigInt helpers. */
const LONG_TO_OBJECT =
    /options\.longs === String \? \$util\.Long\.prototype\.toString\.call\((message\.[\w]+)\) : options\.longs === Number \? new \$util\.LongBits\(\1\.low >>> 0, \1\.high >>> 0\)\.toNumber\((true|false)?\) : \1/g;

const HELPERS = `function longToString(value, unsigned) {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number") {
		return String(value);
	}
	// Fast path: convert Long {low, high} directly via native BigInt
	// BigInt.toString() is a native C++ operation, much faster than Long's pure JS division loops
	if (value && typeof value.low === "number" && typeof value.high === "number") {
		const lo = BigInt(value.low >>> 0);
		const hi = BigInt(value.high >>> 0);
		const combined = (hi << 32n) | lo;
		if (!unsigned && value.high < 0) {
			return (combined - (1n << 64n)).toString();
		}
		return combined.toString();
	}
	return String(value);
}
function longToNumber(value, unsigned) {
	if (typeof value === "number") {
		return value;
	}
	if (typeof value === "string") {
		return Number(value);
	}
	// Fast path: convert Long {low, high} directly via native BigInt
	if (value && typeof value.low === "number" && typeof value.high === "number") {
		const lo = BigInt(value.low >>> 0);
		const hi = BigInt(value.high >>> 0);
		const combined = (hi << 32n) | lo;
		if (!unsigned && value.high < 0) {
			return Number(combined - (1n << 64n));
		}
		return Number(combined);
	}
	return Number(value);
}
`;

const run = (bin, args) =>
    execFileSync(join(ROOT, 'node_modules', '.bin', bin), args, { cwd: ROOT, stdio: 'inherit' });

const fail = message => {
    console.error(message);
    process.exit(1);
};

const response = await fetch(SOURCE);
if (!response.ok) {
    fail(`${SOURCE} -> HTTP ${response.status}`);
}
const upstream = await response.text();
if (!upstream.includes('package waproto;')) {
    fail('upstream .proto no longer declares `package waproto;` — update this script');
}
if (!upstream.includes('message Message {')) {
    fail('upstream .proto has no `message Message` — wrong file?');
}

const proto = upstream
    .replace(/^(\s*)required /gm, '$1')
    .replace(/^package waproto;$/m, 'package proto;')
    .concat(FORK_LOCAL_MESSAGES);

const work = mkdtempSync(join(tmpdir(), 'wa-proto-'));
const protoFile = join(work, 'WAProto.proto');
const jsFile = join(work, 'index.js');
const jsFullFile = join(work, 'index.full.js');
const dtsFile = join(work, 'index.d.ts');
writeFileSync(protoFile, proto);

// --no-verify/--no-delimited/--no-comments match the shape this package has always shipped; the
// call sites do not use the dropped methods and the comments tripled the file size.
const pbjsArgs = ['-t', 'static-module', '--sparse', '--no-verify', '--no-delimited', '-w', 'es6'];
run('pbjs', [...pbjsArgs, '--no-comments', '-o', jsFile, protoFile]);
// pbts reads the JSDoc pbjs writes, so the types have to come from a commented copy of the same
// schema; the comments are stripped again below.
run('pbjs', [...pbjsArgs, '-o', jsFullFile, protoFile]);
run('pbts', ['-o', dtsFile, jsFullFile]);

const stripJsdoc = source => source.replace(/\/\*\*[\s\S]*?\*\/\n?/g, '').replace(/\n\s*\n/g, '\n');

let js = readFileSync(jsFile, 'utf8');

js = js.replace(
    'import * as $protobuf from "protobufjs/minimal";',
    'import $protobuf from "protobufjs/minimal.js";'
);

const rootLine = 'const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});';
if (!js.includes(rootLine)) {
    fail('generated file has no `$root` line — pbjs output changed, review this script');
}
js = js.replace(rootLine, rootLine + '\n' + HELPERS);

let replaced = 0;
js = js.replace(LONG_TO_OBJECT, (_, field, unsigned) => {
    replaced++;
    const flag = unsigned === 'true' ? ', true' : '';
    return `options.longs === String ? longToString(${field}${flag}) : options.longs === Number ? longToNumber(${field}${flag}) : ${field}`;
});
if (!replaced) {
    fail('no 64-bit toObject conversions were patched — pbjs output changed, review this script');
}
if (js.includes('$util.Long.prototype.toString.call')) {
    fail('a 64-bit toString conversion survived the patch');
}

const banner = `// Generated by scripts/generate-waproto.mjs from @wppconnect/wa-proto ${REF}. Do not edit.\n`;
writeFileSync(join(ROOT, 'WAProto', 'index.js'), banner + js);
writeFileSync(join(ROOT, 'WAProto', 'index.d.ts'), banner + stripJsdoc(readFileSync(dtsFile, 'utf8')));

console.log(`WAProto regenerated from ${REF}: ${replaced} 64-bit conversions patched`);
