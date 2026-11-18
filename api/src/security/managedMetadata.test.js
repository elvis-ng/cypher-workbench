import { createManagedMetadata } from './managedMetadata.js';
import { createMetadataResolvers } from './metadataResolvers.js';

const context = (email = 'owner@example.com', organization = 'dev') => ({ email, organization });

const fixtureDriver = () => {
  const documents = new Map();
  const eulas = new Map();
  const sessions = [];
  const driver = {
    session: options => {
      const session = {
        run: async (query, params) => {
          expect(options.database).toBe('metadata');
          if (!query.includes('ElvisWorkbenchEulaAcceptance')) expect(query).toContain('ElvisWorkbenchDocument');
          expect(params.organization).toBeDefined();
          expect(params.ownerEmail).toBeDefined();
          if (!query.includes('RETURN d.documentKey AS key, d.payload AS payload ORDER BY') && !query.includes('ElvisWorkbenchEulaAcceptance')) expect(params.key).toBeDefined();
          if (query.includes('ElvisWorkbenchEulaAcceptance') && query.includes('RETURN e.version') && query.includes('MERGE')) {
            const key = `${params.organization}\u0000${params.ownerEmail}`;
            eulas.set(key, params.version);
            return { records: [{ toObject: () => ({ version: params.version, acceptedAt: 'now' }) }] };
          }
          if (query.includes('ElvisWorkbenchEulaAcceptance')) {
            const key = `${params.organization}\u0000${params.ownerEmail}`;
            if (query.includes('MERGE')) {
              eulas.set(key, params.version);
              return { records: [{ toObject: () => ({ version: params.version, acceptedAt: 'now' }) }] };
            }
            const version = eulas.get(key);
            return { records: version ? [{ toObject: () => ({ version, acceptedAt: 'now' }) }] : [] };
          }
          if (query.includes('ElvisWorkbenchDefaultView')) {
            return { records: [{ toObject: () => ({ viewKey: 'view' }) }] };
          }
          if (query.includes('MERGE')) {
            documents.set(`${params.organization}\u0000${params.ownerEmail}\u0000${params.key}`, JSON.parse(params.payload));
            return { records: [{ toObject: () => ({ key: params.key }) }] };
          }
          const values = [...documents.entries()]
            .filter(([partition]) => partition.startsWith(`${params.organization}\u0000${params.ownerEmail}\u0000`))
            .map(([partition, payload]) => ({ key: partition.split('\u0000')[2], payload }));
          const filtered = params.key ? values.filter(value => value.key === params.key) : values;
          return { records: filtered.map(value => ({ toObject: () => ({ key: value.key, payload: JSON.stringify(value.payload) }) })) };
        },
        writeTransaction: async (work, config) => { expect(config).toEqual({ timeout: 5000 }); return work(session); },
        close: async () => {}
      };
      sessions.push(session);
      return session;
    },
    documents,
    sessions
  };
  return driver;
};

const doc = (key, title = 'Saved query') => ({
  key,
  metadata: { key, title, description: 'Cypher tool metadata', viewSettings: '{"x":1}' },
  subgraphModel: { primaryNodeLabel: 'CypherWorkbenchDocument' },
  graph: { upsertNodes: [], removeNodes: [], upsertRelationships: [], removeRelationships: [] }
});

test('persists and reloads only within organization and owner partition', async () => {
  const driver = fixtureDriver();
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  expect(await metadata.saveGraphDocWithMetadata(doc('same'), context())).toBe(true);
  expect(await metadata.loadGraphDoc('same', context())).toMatchObject({ key: 'same' });
  expect(await metadata.loadGraphDoc('same', context('other@example.com', 'dev'))).toBeNull();
  await expect(metadata.loadGraphDoc('same', context('owner@example.com', 'qa'))).rejects.toThrow('organization mismatch');
});

test('rejects public sharing, security delegates, and oversized documents', async () => {
  const metadata = createManagedMetadata({ driver: fixtureDriver(), database: 'metadata', organization: 'dev' });
  await expect(metadata.saveGraphDocMetadata({ ...doc('bad'), metadata: { ...doc('bad').metadata, isPublic: true } }, context())).rejects.toThrow('public sharing');
  await expect(metadata.saveGraphDocMetadata({ ...doc('bad'), securityDelegate: 'other' }, context())).rejects.toThrow('securityDelegate');
  await expect(metadata.saveGraphDocMetadata({ ...doc('bad'), metadata: { ...doc('bad').metadata, notes: 'x'.repeat(512 * 1024) } }, context())).rejects.toThrow('512 KiB');
});

test('metadata saves merge onto existing graph and cypher statements flatten metadata', async () => {
  const driver = fixtureDriver();
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  await metadata.saveGraphDoc(doc('merge'), context());
  expect(await metadata.saveGraphDocMetadata({ key: 'merge', metadata: { key: 'merge', title: 'Updated' } }, context())).toBe(true);
  expect((await metadata.loadGraphDoc('merge', context())).graph).toBeDefined();
  expect(await metadata.listCypherStatements(context())).toEqual([expect.objectContaining({ key: 'merge', title: 'Updated' })]);
});

test('streams metadata without materializing a thenable result', async () => {
  let closed = 0;
  const driver = { session: () => ({
    run: () => ({ then: () => { throw new Error('materialization forbidden'); }, subscribe(observer) { observer.onCompleted(); } }),
    close: async () => { closed++; }
  }) };
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  expect(await metadata.listGraphDocs(context())).toEqual([]);
  expect(closed).toBe(1);
});

test('ignores streamed records after result overflow', async () => {
  let observer;
  const driver = { session: () => ({ run: () => ({ subscribe(value) { observer = value; } }), close: async () => {} }) };
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  const pending = metadata.listGraphDocs(context());
  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 34; i++) observer.onNext({ toObject: () => ({ payload: 'x'.repeat(512 * 1024) }) });
  await expect(pending).rejects.toThrow('16 MiB');
  observer.onNext({ toObject: () => ({ payload: 'late' }) });
  observer.onCompleted();
});

test('rejects oversized streamed result and cancels its session', async () => {
  let closed = 0;
  const driver = { session: () => ({
    run: () => ({ subscribe(observer) {
      for (let i = 0; i < 34; i++) observer.onNext({ toObject: () => ({ payload: 'x'.repeat(512 * 1024) }) });
      observer.onCompleted();
    } }), close: async () => { closed++; }
  }) };
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  await expect(metadata.listGraphDocs(context())).rejects.toThrow('16 MiB');
  expect(closed).toBeGreaterThan(0);
});

test('merges native node properties and distinguishes relationships from the same start node', async () => {
  const metadata = createManagedMetadata({ driver: fixtureDriver(), database: 'metadata', organization: 'dev' });
  const key = id => ({ label: 'CypherStatement', properties: [{ key: 'key', datatype: 'String', value: id }] });
  const node = { key: key('a'), primaryNodeLabel: 'CypherStatement', upsertProperties: [{ key: 'cypherStatement', datatype: 'String', value: 'RETURN 1' }] };
  const relationship = id => ({ startNodeKey: key('a'), endNodeKey: key(id), type: 'HAS', upsertProperties: [] });
  await metadata.saveGraphDoc({ ...doc('delta'), graph: { upsertNodes: [node], upsertRelationships: [relationship('b'), relationship('c')] } }, context());
  await metadata.saveGraphDoc({ key: 'delta', metadata: { key: 'delta' }, graph: { upsertNodes: [{ key: key('a'), upsertProperties: [{ key: 'title', datatype: 'String', value: 'Updated' }] }] } }, context());
  const loaded = await metadata.loadGraphDoc('delta', context());
  expect(loaded.graph.relationships).toHaveLength(2);
  expect(loaded.graph.nodes[0].properties).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'cypherStatement', value: 'RETURN 1' }),
    expect.objectContaining({ key: 'title', value: 'Updated' })
  ]));
});

test('selects last saved native type from subgraphModel and never uses the title as Cypher', async () => {
  const metadata = createManagedMetadata({ driver: fixtureDriver(), database: 'metadata', organization: 'dev' });
  await metadata.saveGraphDoc({ ...doc('typed'), subgraphModel: { primaryNodeLabel: 'CypherSuite' } }, context());
  expect((await metadata.loadLastOpenedGraphDoc('CypherSuite', context())).key).toBe('typed');
  expect(await metadata.loadLastOpenedGraphDoc('CypherBuilder', context())).toBeNull();
  expect((await metadata.listCypherStatements(context()))[0].cypher).not.toBe('Saved query');
});

test('rejects merged documents that exceed the document cap without overwriting saved work', async () => {
  const metadata = createManagedMetadata({ driver: fixtureDriver(), database: 'metadata', organization: 'dev' });
  await metadata.saveGraphDoc({ ...doc('bounded'), metadata: { key: 'bounded', notes: 'a'.repeat(300 * 1024) } }, context());
  await expect(metadata.saveGraphDocMetadata({ key: 'bounded', metadata: { key: 'bounded', description: 'b'.repeat(300 * 1024) } }, context())).rejects.toThrow('512 KiB');
  const saved = await metadata.loadGraphDoc('bounded', context());
  expect(saved.metadata.notes).toHaveLength(300 * 1024);
  expect(saved.metadata.description).toBeUndefined();
});

test('stores EULA acceptance separately by owner and organization', async () => {
  const driver = fixtureDriver();
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  expect(await metadata.getEulaAcceptance(context())).toBeNull();
  const acceptance = await metadata.acceptEula(context(), '2026-01');
  expect(acceptance.version).toBe('2026-01');
  expect((await metadata.getEulaAcceptance(context())).version).toBe('2026-01');
  expect(await metadata.getEulaAcceptance(context('other@example.com'))).toBeNull();
  await expect(metadata.acceptEula(context(), '')).rejects.toThrow('EULA version');
});

test('loads native default view by owner-scoped relationship', async () => {
  const driver = fixtureDriver();
  const metadata = createManagedMetadata({ driver, database: 'metadata', organization: 'dev' });
  await metadata.saveGraphDocRootsWithMetadata({
    graphDocs: [doc('main'), { key: 'view', subgraphModel: { primaryNodeLabel: 'CypherView' } }],
    graphDocInput: { key: 'view', graph: { upsertRelationships: [{ type: 'DEFAULT_GRAPH_VIEW_FOR', endNodeKey: { properties: [{ key: 'key', value: 'main' }] }, startNodeKey: { properties: [{ key: 'key', value: 'view' }] } }] } }
  }, context());
  expect((await metadata.loadGraphDocAndDefaultView('main', context())).graphDocView.key).toBe('view');
});

test('requires explicit database and configured organization', () => {
  expect(() => createManagedMetadata({ driver: fixtureDriver() })).toThrow('database');
  expect(() => createManagedMetadata({ driver: fixtureDriver(), database: 'metadata', organization: 'dev' })).not.toThrow();
});

test('resolver exposes native names and ignores user database or labels', async () => {
  const driver = fixtureDriver();
  const resolvers = createMetadataResolvers({ metadata: createManagedMetadata({ driver, database: 'metadata', organization: 'dev' }) });
  expect(await resolvers.Mutation.saveGraphDocWithMetadata(null, { graphDoc: doc('native') }, context())).toBe(true);
  expect(await resolvers.Query.listGraphDocsX(null, { graphDocType: 'CypherWorkbenchDocument', myOrderBy: 'databaseName', orderDirection: 'DESC' }, context())).toHaveLength(1);
  expect([...driver.documents.keys()][0]).not.toContain('anything');
});
