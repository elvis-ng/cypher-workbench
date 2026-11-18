import { validateManagedInput, ManagedTargetError } from '../security/managedTarget.js';
import { trustedProxyIdentity } from '../security/proxyIdentity.js';

export const createManagedResolvers = ({ execute }) => ({
  Query: {
    executeCypherQuery: async (root, input, context) => {
      const identity = trustedProxyIdentity(context.headers, context.organization);
      if (identity.email !== context.email) throw new ManagedTargetError('trusted proxy identity mismatch');
      validateManagedInput(input.input);
      return execute(input.input);
    },
    getSchema: async (root, { input } = {}, context) => {
      const identity = trustedProxyIdentity(context.headers, context.organization);
      if (identity.email !== context.email) throw new ManagedTargetError('trusted proxy identity mismatch');
      if (input != null && (typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 0)) {
        throw new ManagedTargetError('client schema selection is forbidden');
      }
      const result = await execute({
        cypherQuery: 'CALL db.schema.visualization() YIELD nodes, relationships RETURN nodes, relationships',
        cypherParameters: {},
      });
      const topology = result.rows[0] || { nodes: [], relationships: [] };
      return {
        cypherFunction: 'db.schema.visualization',
        jsonSchema: JSON.stringify({ nodes: topology.nodes || [], relationships: topology.relationships || [] }),
      };
    },
  },
});
