import { Semaphore } from './semaphore.js';
import { ManagedTargetError } from './managedTarget.js';

export const METADATA_LABEL = 'ElvisWorkbenchDocument';
export const MAX_DOCUMENT_BYTES = 512 * 1024;
export const MAX_REQUEST_BYTES = 1024 * 1024;
export const MAX_LIST_RESULTS = 100;
export const MAX_METADATA_RESULT_BYTES = 16 * 1024 * 1024;
const itemKey = item => JSON.stringify(item?.startNodeKey
  ? [item.startNodeKey, item.endNodeKey, item.type, item.keyProperties || []]
  : item?.key);
const mergeItem = (base = {}, delta = {}) => {
  const properties = new Map((base.properties || base.upsertProperties || []).map(property => [property.key, property]));
  for (const key of delta.removeProperties || []) properties.delete(key);
  for (const property of delta.upsertProperties || delta.properties || []) properties.set(property.key, property);
  return { ...base, ...delta, properties: [...properties.values()] };
};
const mergeMetadata = (base = {}, delta = {}) => {
  const merge = (oldItems = [], upserts = [], removes = []) => {
    const values = new Map(oldItems.map(item => [JSON.stringify(item), item]));
    for (const item of removes || []) values.delete(JSON.stringify(item));
    for (const item of upserts || []) values.set(JSON.stringify(item), item);
    return [...values.values()];
  };
  return { ...base, ...delta, customers: merge(base.customers, delta.upsertCustomers, delta.removeCustomers), tags: merge(base.tags, delta.upsertTags, delta.removeTags) };
};
const graphArray = (value, name) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ManagedTargetError(`metadata graph ${name} must be an array`);
  return value;
};
const mergeGraph = (base = {}, delta = {}) => {
  if (!base || typeof base !== 'object' || !delta || typeof delta !== 'object') throw new ManagedTargetError('metadata graph shape is invalid');
  const merge = (oldItems = [], upserts = [], removes = []) => {
    const values = new Map(graphArray(oldItems, 'items').map(item => [itemKey(item), item]));
    upserts = graphArray(upserts, 'upserts');
    removes = graphArray(removes, 'removes');
    for (const item of removes || []) values.delete(itemKey(item));
    for (const item of upserts || []) values.set(itemKey(item), mergeItem(values.get(itemKey(item)), item));
    return [...values.values()];
  };
  return { nodes: merge(base.nodes ?? base.upsertNodes, delta.upsertNodes ?? delta.nodes, delta.removeNodes), relationships: merge(base.relationships ?? base.upsertRelationships, delta.upsertRelationships ?? delta.relationships, delta.removeRelationships) };
};

const writeQuery = `MERGE (d:${METADATA_LABEL} {partition: $partition}) SET d.organization = $organization, d.ownerEmail = $ownerEmail, d.documentKey = $key, d.payload = $payload, d.updatedAt = datetime() RETURN d.documentKey AS key`;
const readQuery = `MATCH (d:${METADATA_LABEL} {partition: $partition}) RETURN d.documentKey AS key, d.payload AS payload`;
const listQuery = `MATCH (d:${METADATA_LABEL}) WHERE d.organization = $organization AND d.ownerEmail = $ownerEmail RETURN d.documentKey AS key, d.payload AS payload ORDER BY d.updatedAt DESC`;
const EULA_LABEL = 'ElvisWorkbenchEulaAcceptance';
const eulaReadQuery = `MATCH (e:${EULA_LABEL} {partition: $partition}) RETURN e.version AS version, e.acceptedAt AS acceptedAt`;
const eulaWriteQuery = `MERGE (e:${EULA_LABEL} {partition: $partition}) SET e.organization = $organization, e.ownerEmail = $ownerEmail, e.version = $version, e.acceptedAt = datetime() RETURN e.version AS version, e.acceptedAt AS acceptedAt`;
const viewAssociationWriteQuery = `MERGE (v:${METADATA_LABEL}:ElvisWorkbenchDefaultView {partition: $partition}) SET v.organization = $organization, v.ownerEmail = $ownerEmail, v.documentKey = $documentKey, v.viewKey = $viewKey`;
const viewAssociationReadQuery = `MATCH (v:${METADATA_LABEL}:ElvisWorkbenchDefaultView {partition: $partition}) RETURN v.viewKey AS viewKey`;

const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const identity = (context, configuredOrganization) => {
  if (!context || typeof context.organization !== 'string' || context.organization !== configuredOrganization) throw new ManagedTargetError('metadata organization mismatch');
  if (typeof context.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.email)) throw new ManagedTargetError('metadata owner email is malformed');
  return { organization: configuredOrganization, ownerEmail: context.email };
};
const checkedDocument = (document, { delta = false } = {}) => {
  if (!document || typeof document !== 'object' || typeof document.key !== 'string' || !document.key.trim()) throw new ManagedTargetError('metadata graph document key is required');
  if (document.securityDelegate !== undefined && document.securityDelegate !== null) throw new ManagedTargetError('securityDelegate is forbidden');
  if (document.isPublic === true || document.metadata?.isPublic === true) throw new ManagedTargetError('public sharing is forbidden');
  if (!delta && (!document.metadata || typeof document.metadata !== 'object')) throw new ManagedTargetError('Cypher metadata is required');
  if (!document.graph && !document.subgraphModel && !delta && document.metadata?.key !== document.key) throw new ManagedTargetError('only Cypher/tool metadata graph content is supported');
  if (bytes(document) > MAX_DOCUMENT_BYTES) throw new ManagedTargetError('metadata document exceeds 512 KiB');
  return document;
};

export const createManagedMetadata = ({ driver, database, organization, timeoutMs = 5000, maxConcurrency = 2 } = {}) => {
  if (!driver || typeof driver.session !== 'function') throw new ManagedTargetError('metadata driver is required');
  if (typeof database !== 'string' || !database.trim()) throw new ManagedTargetError('metadata database is fixed and required');
  if (typeof organization !== 'string' || !organization.trim()) throw new ManagedTargetError('metadata organization is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5000) throw new ManagedTargetError('metadata timeout exceeds 5 seconds');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency <= 0 || maxConcurrency > 2) throw new ManagedTargetError('metadata concurrency exceeds 2');
  const semaphore = new Semaphore(maxConcurrency);
  const run = async (query, params, tx = null) => {
    if (bytes(params) > MAX_REQUEST_BYTES) throw new ManagedTargetError('metadata request exceeds 1 MiB');
    const result = tx ? tx.run(query, params) : driver.session({ database }).run(query, params, { timeout: timeoutMs });
    if (typeof result.subscribe === 'function') {
      const records = []; let resultBytes = 0;
      await new Promise((resolve, reject) => {
        let done = false;
        const fail = error => { if (!done) { done = true; reject(error); } };
        result.subscribe({
          onNext(record) {
            if (done) return;
            resultBytes += bytes(record.toObject ? record.toObject() : record);
            if (resultBytes > MAX_METADATA_RESULT_BYTES) { fail(new ManagedTargetError('metadata result exceeds 16 MiB')); return; }
            records.push(record);
          }, onError: fail, onCompleted: () => { if (!done) { done = true; resolve(); } }
        });
      });
      return records;
    }
    const materialized = await result; const records = []; let resultBytes = 0;
    for (const record of materialized.records || []) {
      resultBytes += bytes(record.toObject ? record.toObject() : record);
      if (resultBytes > MAX_METADATA_RESULT_BYTES) throw new ManagedTargetError('metadata result exceeds 16 MiB');
      records.push(record);
    }
    return records;
  };
  const withSession = async work => {
    let release; let session; let timer; let closing;
    const close = () => {
      if (!closing) closing = Promise.resolve().then(() => session?.close());
      return closing;
    };
    try {
      release = await semaphore.acquire();
      session = driver.session({ database });
      const deadline = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          close().catch(() => {});
          reject(new ManagedTargetError('metadata deadline exceeded'));
        }, timeoutMs);
      });
      return await Promise.race([work(session), deadline]);
    } finally {
      clearTimeout(timer);
      try { await close(); } finally { release?.(); }
    }
  };
  const partition = (context, key) => { const id = identity(context, organization); return { ...id, key, partition: JSON.stringify([id.organization, id.ownerEmail, key]) }; };
  const decode = record => { const row = record.toObject ? record.toObject() : record; try { const d = JSON.parse(row.payload); const source = d.graph || {}; return { ...d, key: d.key || row.key, primaryNodeLabel: d.primaryNodeLabel || d.subgraphModel?.primaryNodeLabel, graph: { nodes: source.nodes || source.upsertNodes || [], relationships: source.relationships || source.upsertRelationships || [] }, lockInfo: d.lockInfo || null }; } catch { return null; } };
  const flattened = d => ({ key: d.key, subKey: d.metadata?.key, cypherWorkbenchVersion: d.metadata?.cypherWorkbenchVersion, title: d.metadata?.title, description: d.metadata?.description, dateCreated: d.metadata?.dateCreated, dateUpdated: d.metadata?.dateUpdated, isPublic: false, userRole: 'OWNER', userIsCreator: true, owners: [{ email: d._ownerEmail, primaryOrganization: organization, isCurrentUser: true }], tags: d.metadata?.tags || [], customers: d.metadata?.customers || [], isVisualCypher: d.primaryNodeLabel === 'CypherBuilder', cypher: (d.graph?.nodes || []).flatMap(node => node.properties || []).find(property => property.key === 'cypherStatement')?.value || '' });
  const mergeDocument = (existing, checked, ownerEmail) => {
    const merged = existing ? { ...existing, ...checked, metadata: mergeMetadata(existing.metadata, checked.metadata), graph: checked.graph ? mergeGraph(existing.graph, checked.graph) : existing.graph } : { ...checked, metadata: mergeMetadata({}, checked.metadata), graph: mergeGraph({}, checked.graph) };
    merged._ownerEmail = ownerEmail;
    return checkedDocument(merged);
  };
  const eulaPartition = context => { const id = identity(context, organization); return { ...id, partition: JSON.stringify([id.organization, id.ownerEmail]) }; };
  const getEulaAcceptance = context => withSession(async session => {
    const records = await run(eulaReadQuery, eulaPartition(context), session);
    if (!records.length) return null;
    const row = records[0].toObject ? records[0].toObject() : records[0];
    return { version: row.version, acceptedAt: row.acceptedAt?.toString?.() || row.acceptedAt || null };
  });
  const acceptEula = async (context, version) => {
    if (typeof version !== 'string' || !version.trim()) throw new ManagedTargetError('EULA version is required');
    return withSession(async session => {
      const params = { ...eulaPartition(context), version };
      const records = await run(eulaWriteQuery, params, session);
      const row = records[0]?.toObject ? records[0].toObject() : records[0];
      return { version: row?.version || version, acceptedAt: row?.acceptedAt?.toString?.() || row?.acceptedAt || null };
    });
  };
  const save = async (document, context) => {
    const checked = checkedDocument(document);
    const id = identity(context, organization);
    return withSession(async session => {
      const work = async tx => {
        const records = await run(readQuery, partition(context, checked.key), tx);
        const existing = records.length ? decode(records[0]) : null;
        const merged = mergeDocument(existing, checked, id.ownerEmail);
        await run(writeQuery, { ...partition(context, checked.key), payload: JSON.stringify(merged) }, tx);
      };
      if (typeof session.executeWrite === 'function') await session.executeWrite(work, { timeout: timeoutMs });
      else if (typeof session.writeTransaction === 'function') await session.writeTransaction(work, { timeout: timeoutMs });
      else throw new ManagedTargetError('metadata transactions are required');
      return true;
    });
  };
  const saveRoots = async (roots, context) => {
    const documents = [...(roots?.graphDocs || [])];
    if (roots?.graphDocInput) documents.push(checkedDocument(roots.graphDocInput, { delta: true }));
    documents.forEach(document => checkedDocument(document, { delta: !document.metadata }));
    const id = identity(context, organization);
    return withSession(async session => {
      const work = async tx => {
        const byKey = new Map();
        for (const document of documents) {
          const key = document.key; const records = await run(readQuery, partition(context, key), tx);
          const existing = byKey.get(key) || (records.length ? decode(records[0]) : null);
          const merged = mergeDocument(existing, { ...document, metadata: document.metadata || { key } }, id.ownerEmail);
          byKey.set(key, merged);
        }
        for (const [key, merged] of byKey) await run(writeQuery, { ...partition(context, key), payload: JSON.stringify(merged) }, tx);
        const graphDoc = documents.find(document => document.metadata && document.key);
        const view = documents.find(document => document.key !== graphDoc?.key && document.subgraphModel);
        const relationship = documents.flatMap(document => document.graph?.upsertRelationships || []).find(item => item.type === 'DEFAULT_GRAPH_VIEW_FOR');
        if (graphDoc && view && relationship) await run(viewAssociationWriteQuery, { ...partition(context, graphDoc.key), documentKey: graphDoc.key, viewKey: view.key }, tx);
      };
      if (typeof session.executeWrite === 'function') await session.executeWrite(work, { timeout: timeoutMs });
      else if (typeof session.writeTransaction === 'function') await session.writeTransaction(work, { timeout: timeoutMs });
      else throw new ManagedTargetError('metadata transactions are required');
      return true;
    });
  };
  const load = async (key, context) => { if (typeof key !== 'string' || !key.trim()) return null; return withSession(async session => { const records = await run(readQuery, partition(context, key), session); return records.length ? decode(records[0]) : null; }); };
  const nodeKeyValue = value => value?.key || value?.properties?.find(property => property.key === 'key')?.value;
  const loadDefaultView = async (key, context) => withSession(async session => {
    const association = await run(viewAssociationReadQuery, partition(context, key), session);
    const row = association[0]?.toObject ? association[0].toObject() : association[0];
    return row?.viewKey ? load(row.viewKey, context) : null;
  });
  const list = async (context, searchText, type) => withSession(async session => {
    const id = identity(context, organization); const records = await run(listQuery, id, session); const output = []; const needle = searchText ? String(searchText).toLowerCase() : null;
    for (const record of records) { if (output.length >= MAX_LIST_RESULTS) break; const d = decode(record); if (d && (!type || d.primaryNodeLabel === type) && (!needle || JSON.stringify(d).toLowerCase().includes(needle))) { d._ownerEmail ||= id.ownerEmail; output.push(d); } }
    return output;
  });
  return Object.freeze({
    getEulaAcceptance,
    acceptEula,
    saveGraphDoc: save, saveGraphDocMetadata: save, saveGraphDocWithMetadata: save, saveGraphDocWithFullMetadata: save,
    saveGraphDocChanges: save, saveViewGraphDoc: save, saveGraphDocRootsWithMetadata: saveRoots,
    loadGraphDoc: load,
    loadGraphDocAndDefaultView: async (key, context) => { const graphDoc = await load(key, context); return graphDoc ? { graphDoc, graphDocView: await loadDefaultView(key, context) } : null; },
    loadLastOpenedGraphDoc: async (type, context) => (await list(context, null, type))[0] || null,
    loadLastOpenedGraphDocAndDefaultView: async (type, context) => { const d = (await list(context, null, type))[0]; return d ? { graphDoc: d, graphDocView: await loadDefaultView(d.key, context) } : null; },
    listGraphDocs: (context, _searchText, type) => list(context, null, type), searchGraphDocs: (text, context, type) => list(context, text, type),
    listCypherStatements: async (context, type) => (await list(context, null, type)).map(flattened), searchCypherStatements: async (text, context, type) => (await list(context, text, type)).map(flattened)
  });
};
