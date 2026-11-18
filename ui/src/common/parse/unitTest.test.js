const { parseTestCypher, renderTestCypher } = require('./unitTest');

test('test parseTestCypher', () => {
    var testCypher = `
        // Foo exists
        MATCH (n:Foo)
        RETURN n
        /*
        expect exists(n) = true
        */;
    `

    var result = parseTestCypher(testCypher);
    expect(result.name).toBe('Foo exists');
    expect(result.cypher).toBe('MATCH (n:Foo)\nRETURN n');
    expect(result.returnVars.length).toBe(1);
    expect(result.returnVars[0]).toBe('n');
    expect(result.assertions.length).toBe(1);
    expect(result.assertions[0]).toEqual({
        assertion: 'exists(n) = true',
        left: 'exists(n)',
        condition: '=',
        right: 'true'
    });
});

test('escapes every backslash and apostrophe in cypher and assertions', () => {
    const result = parseTestCypher(`
        // multiline
        MATCH (n) WHERE n.name = 'O\\\\Brien'
        RETURN n
        /*
        expect n.name = 'O\\\\Brien' AND n.note = 'it\\'s'
        */;
    `);

    expect(result.cypher).toBe(`MATCH (n) WHERE n.name = \\'O\\\\\\\\Brien\\'\nRETURN n`);
    expect(result.assertions[0].assertion).toBe(`n.name = \\'O\\\\\\\\Brien\\' AND n.note = \\'it\\\\\\'s\\'`);
});

test('test renderTestCypher', () => {
    var testCypher = `
        // Foo exists
        MATCH (n:Foo)
        RETURN n
        /*
        expect exists(n) = true
        */;
    `
    var result = parseTestCypher(testCypher);
    var renderedCypher = renderTestCypher(result);
    //console.log(renderedCypher);
});
