/* Local verification helper only: an in-memory, synchronous view counter.
 * Production must implement the same transaction in durable server storage.
 * The caller must authenticate and authorize every request before calling it.
 */
'use strict';
const WINDOW_MS = 30 * 60 * 1000;
const keyOK = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const error = (message, code='VALIDATION') => { const failure=new Error(message);failure.code=code;throw failure; };
function createStore(options={}) {
  const clock=options.now || Date.now;
  const counts=new Map(), lastCounted=new Map(), requests=new Map();
  return Object.freeze({
    count(documentKey,rootPageId) { if(!keyOK(documentKey)||! /^[1-9]\d*$/.test(String(rootPageId)))error('Invalid document or root key.');return counts.get(JSON.stringify([String(rootPageId),documentKey]))||0; },
    record(command) {
      const {rootPageId,documentKey,version,revision,requestId,actorSOEID}=command||{};
      if(typeof rootPageId!=='string'||!/^[1-9]\d*$/.test(rootPageId)||!keyOK(documentKey)||!Number.isSafeInteger(version)||version<1||!Number.isSafeInteger(revision)||revision<1||typeof requestId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(requestId)||typeof actorSOEID!=='string'||! /^[A-Z0-9]{2,32}$/.test(actorSOEID))error('Invalid server view command.');
      const replayKey=JSON.stringify([rootPageId,actorSOEID,requestId]);
      const fingerprint=JSON.stringify([rootPageId,documentKey,version,revision]);
      const previous=requests.get(replayKey);
      if(previous){if(previous.fingerprint!==fingerprint)error('View request ID was reused with different content.','CONFLICT');return {...previous.response};}
      const now=clock();
      if(!Number.isSafeInteger(now)||now<0)error('The server clock is invalid.');
      const actorDocument=JSON.stringify([rootPageId,actorSOEID,documentKey]);
      const last=lastCounted.get(actorDocument);
      // The window is anchored to the last counted visit, not to refreshes.
      // There is no calendar-bucket boundary at which double visits can count.
      if(last!=null&&now<last)error('The server clock moved backwards.','CONFLICT');
      const counted=last==null||now-last>=WINDOW_MS;
      const counterKey=JSON.stringify([String(rootPageId),documentKey]);
      const existing=counts.get(counterKey)||0;
      if(counted&&existing===Number.MAX_SAFE_INTEGER)error('The view counter has reached its supported limit.','CONFLICT');
      const views=existing+(counted?1:0);
      const response={accepted:true,requestId,documentKey,views,counted};
      // No await occurs in this single-process mock critical section. A real
      // multi-instance service needs a transaction and unique request key.
      if(counted){counts.set(counterKey,views);lastCounted.set(actorDocument,now);}
      requests.set(replayKey,{fingerprint,response});
      return {...response};
    }
  });
}
module.exports=Object.freeze({createStore,WINDOW_MS});
