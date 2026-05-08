// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});
import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { ChatService, ChatSession } from '@theia/ai-chat';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { ApplicationShell } from '@theia/core/lib/browser';
import { ChatSessionsWelcomeMessageProvider } from './chat-sessions-welcome-message-provider';
disableJSDOM();

/**
 * Subclass that exposes the protected watch hook and lets tests inject fake services.
 * We don't go through inversify here because the only behaviour under test is the
 * unread bookkeeping; spinning up the full container would pull in unrelated
 * services and obscure the assertion.
 */
class TestableProvider extends ChatSessionsWelcomeMessageProvider {
    constructor(chatService: ChatService, shell: ApplicationShell) {
        super();
        (this as unknown as { chatService: ChatService }).chatService = chatService;
        (this as unknown as { shell: ApplicationShell }).shell = shell;
    }

    watch(session: ChatSession): void {
        this.watchSession(session);
    }
}

interface RequestStub {
    response: { isComplete: boolean };
}

function createFakeSession(id: string): {
    session: ChatSession;
    fire: () => void;
    pushRequest: (complete: boolean) => void;
} {
    const requests: RequestStub[] = [];
    const onDidChangeEmitter = new Emitter<unknown>();
    const session = {
        id,
        isActive: false,
        model: {
            getRequests: () => requests,
            onDidChange: onDidChangeEmitter.event,
        }
    } as unknown as ChatSession;
    return {
        session,
        fire: () => onDidChangeEmitter.fire(undefined),
        pushRequest: complete => requests.push({ response: { isComplete: complete } })
    };
}

describe('ChatSessionsWelcomeMessageProvider unread state', () => {
    let activeSessionId: string | undefined;
    let activeWidget: unknown;
    let chatService: ChatService;
    let shell: ApplicationShell;
    let chatViewWidget: ChatViewWidget;
    let otherWidget: object;

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        activeSessionId = undefined;
        chatViewWidget = Object.create(ChatViewWidget.prototype) as ChatViewWidget;
        otherWidget = {};
        activeWidget = undefined;
        chatService = {
            getActiveSession: () => activeSessionId ? { id: activeSessionId } as ChatSession : undefined,
        } as unknown as ChatService;
        shell = {
            get activeWidget(): unknown {
                return activeWidget;
            }
        } as unknown as ApplicationShell;
    });

    it('marks the session unread when a new request arrives and the chat view is not focused', () => {
        const provider = new TestableProvider(chatService, shell);
        const { session, fire, pushRequest } = createFakeSession('s1');
        activeSessionId = 's1';
        activeWidget = otherWidget;

        provider.watch(session);
        pushRequest(true);
        fire();

        expect(provider.isUnread('s1')).to.equal(true);
    });

    it('does not mark unread when the session is active AND the chat view is focused', () => {
        const provider = new TestableProvider(chatService, shell);
        const { session, fire, pushRequest } = createFakeSession('s1');
        activeSessionId = 's1';
        activeWidget = chatViewWidget;

        provider.watch(session);
        pushRequest(true);
        fire();

        expect(provider.isUnread('s1')).to.equal(false);
    });

    it('marks unread when the session is not the active one, even if the chat view is focused', () => {
        const provider = new TestableProvider(chatService, shell);
        const { session, fire, pushRequest } = createFakeSession('s1');
        activeSessionId = 'other';
        activeWidget = chatViewWidget;

        provider.watch(session);
        pushRequest(true);
        fire();

        expect(provider.isUnread('s1')).to.equal(true);
    });

    it('fires onUnreadChanged once when a session transitions to unread', () => {
        const provider = new TestableProvider(chatService, shell);
        const { session, fire, pushRequest } = createFakeSession('s1');
        activeSessionId = undefined;
        activeWidget = otherWidget;

        let fired = 0;
        provider.onUnreadChanged(() => { fired++; });

        provider.watch(session);
        pushRequest(true);
        fire();
        pushRequest(true);
        fire();

        expect(provider.isUnread('s1')).to.equal(true);
        expect(fired).to.equal(1);
    });
});
