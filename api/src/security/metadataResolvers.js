export const createMetadataResolvers = ({ metadata }) => ({
  Query: {
    listCypherStatementsX: (_, args, context) => metadata.listCypherStatements(context, args.graphDocType),
    searchCypherStatementsX: (_, args, context) => metadata.searchCypherStatements(args.searchText, context, args.graphDocType),
    listGraphDocsX: (_, args, context) => metadata.listGraphDocs(context, null, args.graphDocType),
    searchGraphDocsX: (_, args, context) => metadata.searchGraphDocs(args.searchText, context, args.graphDocType),
    loadGraphDoc: (_, args, context) => metadata.loadGraphDoc(args.graphDocKey, context),
    loadGraphDocAndDefaultView: (_, args, context) => metadata.loadGraphDocAndDefaultView(args.graphDocKey, context),
    loadLastOpenedGraphDoc: (_, args, context) => metadata.loadLastOpenedGraphDoc(args.graphDocType, context),
    loadLastOpenedGraphDocAndDefaultView: (_, args, context) => metadata.loadLastOpenedGraphDocAndDefaultView(args.graphDocType, context),
  },
  Mutation: {
    saveGraphDoc: (_, args, context) => metadata.saveGraphDoc(args.graphDoc, context),
    saveGraphDocMetadata: (_, args, context) => metadata.saveGraphDocMetadata(args.graphDoc, context),
    saveGraphDocRootsWithMetadata: (_, args, context) => metadata.saveGraphDocRootsWithMetadata(args.graphDocRoots, context),
    saveGraphDocWithFullMetadata: (_, args, context) => metadata.saveGraphDocWithFullMetadata(args.graphDoc, context),
    saveGraphDocWithMetadata: (_, args, context) => metadata.saveGraphDocWithMetadata(args.graphDoc, context),
    saveGraphDocChanges: (_, args, context) => metadata.saveGraphDocChanges(args.graphDoc, context),
    saveViewGraphDoc: (_, args, context) => metadata.saveViewGraphDoc(args.graphDoc, context),
  },
});
