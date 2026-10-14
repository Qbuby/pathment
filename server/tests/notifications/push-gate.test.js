'use strict';

/**
 * Who the phone is allowed to buzz.
 *
 * Two things are pinned here, both of which were wrong until now:
 *
 *   1. A per-event push preference is honoured. `dispatch` selected only
 *      emailNotifications and quietHours off UserSettings, so the push gate
 *      read `pushNotifications` as undefined on every recipient, treated it as
 *      "nothing recorded", and buzzed people who had turned that category off
 *      in the app.
 *   2. A direct message produces a push at all. It writes its own Notification
 *      row inside the send transaction and nothing ever reached pushService,
 *      so the single most tapped notification in the product was the one a
 *      phone never rang for.
 */

// The global setup stubs this module for every suite, which is right
// everywhere except here, where the gate itself is what is under test.
jest.unmock('../../src/services/notificationOrchestrator');

jest.mock('../../src/db', () => ({
  models: {
    User: { findAll: jest.fn() },
    UserSettings: {},
    Notification: { findOne: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('../../src/services/pushService', () => ({ send: jest.fn(async () => ({ sent: 1, failed: 0 })) }));
jest.mock('../../src/services/emailService', () => ({ enqueue: jest.fn() }));

const { models } = require('../../src/db');
const pushService = require('../../src/services/pushService');
const orchestrator = require('../../src/services/notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../../src/config/notificationMatrix');

const recipients = [{ userId: 'u_omar' }];

function userWith(settings) {
  return [{ id: 'u_omar', status: 'active', settings }];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pushOnly', () => {
  it('buzzes a recipient who has recorded no preference', async () => {
    models.User.findAll.mockResolvedValue(userWith(null));

    await orchestrator.pushOnly({
      eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
      recipients,
      payload: { title: 'Omar Shah', message: 'Sent you the repo', actionUrl: '/mentee/messages?conversationId=c1' },
    });

    expect(pushService.send).toHaveBeenCalledTimes(1);
    const [ids, message] = pushService.send.mock.calls[0];
    expect(ids).toEqual(['u_omar']);
    expect(message.title).toBe('Omar Shah');
    expect(message.body).toBe('Sent you the repo');
    expect(message.data.actionUrl).toBe('/mentee/messages?conversationId=c1');
  });

  it('stays silent when that category of push is switched off', async () => {
    models.User.findAll.mockResolvedValue(userWith({ pushNotifications: { message_received: false } }));

    await orchestrator.pushOnly({
      eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
      recipients,
      payload: { title: 'Omar Shah', message: 'Sent you the repo' },
    });

    expect(pushService.send).not.toHaveBeenCalled();
  });

  it('stays silent when push is off altogether', async () => {
    models.User.findAll.mockResolvedValue(userWith({ pushNotifications: { enabled: false } }));

    await orchestrator.pushOnly({
      eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
      recipients,
      payload: { title: 'Omar Shah', message: 'Sent you the repo' },
    });

    expect(pushService.send).not.toHaveBeenCalled();
  });

  it('carries the conversation, so the app can recognise the thread', async () => {
    models.User.findAll.mockResolvedValue(userWith(null));

    await orchestrator.pushOnly({
      eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
      recipients,
      payload: { title: 'Omar Shah', message: 'Sent you the repo', data: { conversationId: 'c1' } },
    });

    expect(pushService.send.mock.calls[0][1].data.conversationId).toBe('c1');
  });

  it('sends nothing for an event the matrix does not know', async () => {
    await orchestrator.pushOnly({ eventKey: 'not_an_event', recipients, payload: { title: 'x', message: 'y' } });

    expect(models.User.findAll).not.toHaveBeenCalled();
    expect(pushService.send).not.toHaveBeenCalled();
  });
});

describe('dispatch reads the push preferences column', () => {
  it('asks for pushNotifications alongside the email ones', async () => {
    models.User.findAll.mockResolvedValue([]);

    await orchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW,
      recipients,
      payload: { title: 'Omar Shah', message: 'Sent you the repo' },
    });

    const query = models.User.findAll.mock.calls[0][0];
    expect(query.include[0].attributes).toContain('pushNotifications');
  });
});
