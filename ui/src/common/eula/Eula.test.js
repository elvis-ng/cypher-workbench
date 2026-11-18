import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import Eula from './Eula';
import { getAuth } from '../../auth/authUtil';
import { doRedirect } from '../../auth/history';

jest.mock('../../auth/authUtil', () => ({ getAuth: jest.fn() }));
jest.mock('../../auth/history', () => ({ doRedirect: jest.fn() }));
jest.mock('../Wrapper', () => ({ children }) => <div>{children}</div>);

describe('proxy EULA screen', () => {
  let container;
  let auth;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    localStorage.clear();
    auth = {
      type: 'proxy',
      acceptEula: jest.fn(),
      setAcceptedEula: jest.fn(),
      login: jest.fn(),
    };
    getAuth.mockReturnValue(auth);
    doRedirect.mockClear();
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const renderEula = () => {
    act(() => {
      ReactDOM.render(<Eula match={{ params: {} }} />, container);
    });
  };

  test('accepts proxy EULA only after explicit checkbox and resumes bootstrap', async () => {
    auth.acceptEula.mockResolvedValue({ accepted: true });
    renderEula();

    expect(auth.acceptEula).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();

    const radio = container.querySelector('input[type="radio"]');
    act(() => radio.click());
    await act(async () => container.querySelectorAll('button')[1].click());

    expect(auth.acceptEula).toHaveBeenCalledTimes(1);
    expect(auth.setAcceptedEula).toHaveBeenCalledWith(true);
    expect(auth.login).not.toHaveBeenCalled();
    expect(doRedirect).toHaveBeenCalledWith('/', 'Eula: proxy acceptance');
  });

  test('does not mark proxy EULA accepted when acceptance fails', async () => {
    auth.acceptEula.mockRejectedValue(new Error('acceptance failed'));
    renderEula();

    const radio = container.querySelector('input[type="radio"]');
    act(() => radio.click());
    await act(async () => container.querySelectorAll('button')[1].click());

    expect(auth.acceptEula).toHaveBeenCalledTimes(1);
    expect(auth.setAcceptedEula).not.toHaveBeenCalled();
    expect(doRedirect).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
  });
});
