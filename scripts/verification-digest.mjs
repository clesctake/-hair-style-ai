import {createHash} from 'node:crypto';
/** File/PNG digests use exact bytes. Structured-state fingerprints retain JSON. */
export function verificationDigest(value){
 const bytes=typeof value==='string'||Buffer.isBuffer(value)?value:ArrayBuffer.isView(value)?Buffer.from(value.buffer,value.byteOffset,value.byteLength):value instanceof ArrayBuffer?new Uint8Array(value):JSON.stringify(value);
 return createHash('sha256').update(bytes).digest('hex');
}
