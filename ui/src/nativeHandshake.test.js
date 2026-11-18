import { createNativeHandshake } from './nativeHandshake';

describe('native handshake', () => {
  test('replies ready only after bootstrap succeeds', () => {
    const parent = { postMessage: jest.fn() };
    const windowRef = {
      location: { origin: 'https://admin.example.test' },
      parent,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const handshake = createNativeHandshake(windowRef);
    handshake.start();
    const listener = windowRef.addEventListener.mock.calls[0][1];

    listener({
      origin: 'https://admin.example.test',
      source: parent,
      data: { type: 'elvis-workbench:initialize', attempt: 'a1' }
    });
    expect(parent.postMessage).not.toHaveBeenCalled();

    handshake.complete();
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'elvis-workbench:ready', attempt: 'a1' },
      'https://admin.example.test'
    );
  });

  test('rejects wrong origin and source', () => {
    const parent = { postMessage: jest.fn() };
    const windowRef = {
      location: { origin: 'https://admin.example.test' },
      parent,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const handshake = createNativeHandshake(windowRef);
    handshake.start();
    const listener = windowRef.addEventListener.mock.calls[0][1];
    handshake.complete();

    listener({ origin: 'https://evil.test', source: parent, data: { type: 'elvis-workbench:initialize', attempt: 'bad' } });
    listener({ origin: 'https://admin.example.test', source: {}, data: { type: 'elvis-workbench:initialize', attempt: 'bad2' } });
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  test('reports interaction required while EULA is pending', () => {
    const parent = { postMessage: jest.fn() };
    const windowRef = {
      location: { origin: 'https://admin.example.test' },
      parent,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const handshake = createNativeHandshake(windowRef);
    handshake.start();
    const listener = windowRef.addEventListener.mock.calls[0][1];
    listener({ origin: 'https://admin.example.test', source: parent, data: { type: 'elvis-workbench:initialize', attempt: 'e1' } });
    handshake.interactionRequired();
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'elvis-workbench:interaction-required', attempt: 'e1' },
      'https://admin.example.test'
    );
  });

  test('supports initialize after bootstrap', () => {
    const parent = { postMessage: jest.fn() };
    const windowRef = {
      location: { origin: 'https://admin.example.test' },
      parent,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    const handshake = createNativeHandshake(windowRef);
    handshake.start();
    handshake.complete();
    const listener = windowRef.addEventListener.mock.calls[0][1];

    listener({ origin: 'https://admin.example.test', source: parent, data: { type: 'elvis-workbench:initialize', attempt: 'a2' } });
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: 'elvis-workbench:ready', attempt: 'a2' },
      'https://admin.example.test'
    );
  });
});
