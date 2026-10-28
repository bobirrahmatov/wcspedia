/* LOCAL VERIFICATION ONLY. The parent mock owns its fixed session, native ACL,
 * HTTP origin/CSRF checks, and JSON response handling. No production storage. */
'use strict';
const HealthService=require('./health-service.js');
const H=require('./content-health.js');
function create(options){
  const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
  const service=HealthService.create({config:{mode:'local'},storage,getContext:async id=>{const context=await options.getContext(id);if(context&&context.actor&&String(context.actor.soeid).toUpperCase()!==subject())throw Object.assign(new Error('The document context does not match this session.'),{code:'HEALTH_FORBIDDEN'});return context;},now:options.now});
  function subject(){const actor=options.getIdentity&&options.getIdentity(),soeid=typeof actor==='string'?actor:actor&&actor.soeid;if(typeof soeid!=='string'||!/^[a-z0-9]{2,32}$/i.test(soeid.trim()))throw Object.assign(new Error('An authenticated SOEID is required.'),{code:'HEALTH_FORBIDDEN'});return soeid.trim().toUpperCase();}
  async function load(documentIds){
    const subjectSOEID=subject();
    if(!Array.isArray(documentIds)||documentIds.length>1000||documentIds.some(id=>typeof id!=='string'))throw Object.assign(new Error('Provide the requested document IDs.'),{code:'HEALTH_INPUT'});
    const contexts=await Promise.all([...new Set(documentIds)].map(id=>options.getContext(id)));
    if(contexts.some(c=>!c||!c.document))throw Object.assign(new Error('A requested document is not readable.'),{code:'HEALTH_FORBIDDEN'});
    const records=await service.load(contexts.map(c=>c.document));
    const projected=[];
    contexts.forEach(context=>{const doc=context.document,record=records[doc.id],access=H.assertIdentity(doc,record,{actor:context.actor,people:context.people,context});if(context.actor.soeid.toUpperCase()!==subjectSOEID)throw Object.assign(new Error('The document context does not match this session.'),{code:'HEALTH_FORBIDDEN'});if(record)projected.push(access.canAct?record:H.publicRecord(record));});
    return {schemaVersion:1,rootPageId:String(options.rootPageId),subjectSOEID,records:projected};
  }
  async function submit(payload){
    const subjectSOEID=subject();
    if(!payload||typeof payload!=='object'||Object.keys(payload).some(key=>!['documentId','command'].includes(key)))throw Object.assign(new Error('Only a document ID and health command are accepted.'),{code:'HEALTH_INPUT'});
    return {rootPageId:String(options.rootPageId),subjectSOEID,record:await service.submit(payload.documentId,payload.command)};
  }
  return Object.freeze({load,submit});
}
module.exports={create};
